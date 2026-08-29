import { db, getProgress, getSettings, updateProgress } from '../db/db.ts';
import { warmupFor } from '../db/init.ts';
import { MANDATORY_WARMUP_INDEX } from '../db/seed.ts';
import { planNext, type SetResult } from './progression.ts';
import { activeProfile, myDays, myExercises } from './profiles.ts';
import { effective } from './variants.ts';
import {
  activeDays, dayLetter, deloadSets, isDeloadWeek, nextDay, plannedWeight, weekNumber,
} from './program.ts';
import type { Exercise, ExerciseState, ProgramDay, Session, SkipReason } from '../db/types.ts';

export interface PlanItem {
  exercise: Exercise;
  state: ExerciseState;
  /** Рабочий вес на сегодня. */
  weight: number;
  /** Целевые повторы по каждому подходу, длина уже с учётом разгрузки. */
  targets: number[];
  /** Разминочные подходы, пересчитанные от рабочего веса. */
  warmup: Array<{ weight: number; reps: number }>;
  /** Что было в прошлый раз: вес и повторы по подходам. */
  previous: { weight: number; reps: number[] } | null;
}

export interface SessionPlan {
  session: Session;
  day: ProgramDay;
  /** Буква дня для показа: ключ строки у новых профилей с приставкой. */
  letter: string;
  week: number;
  deload: boolean;
  items: PlanItem[];
  generalWarmup: string[];
  /**
   * Пункт разминки, который нельзя проскочить молча, или null.
   * Есть только в программе владельца: это его колено, а не общее правило.
   */
  mandatoryWarmup: number | null;
}

const uid = () =>
  (crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2));

/**
 * Разминка от рабочего веса: примерно половина и три четверти,
 * положенные на сетку шага. Пока веса заданы расписанием (первые
 * три недели новых движений) берём числа из сида как есть.
 */
function buildWarmup(ex: Exercise, weight: number, week: number): Array<{ weight: number; reps: number }> {
  const seeded = ex.warmupSeed ?? [];
  if (!seeded.length) return [];

  const useSeed = ex.isNewPattern && week <= 3;
  if (useSeed) {
    return seeded.map((s) => {
      const [w, r] = s.split('x');
      return { weight: Number(w), reps: Number(r) };
    });
  }

  const step = ex.step ?? 2.5;
  const grid = (value: number) => Math.max(step, Math.round(value / step) * step);
  const reps = seeded.map((s) => Number(s.split('x')[1]));
  const shares = seeded.length >= 3 ? [0.45, 0.65, 0.85] : [0.5, 0.75];
  return shares.slice(0, seeded.length).map((share, i) => ({
    weight: grid(weight * share),
    reps: reps[i] ?? 5,
  }));
}

/**
 * Результат этого упражнения в прошлый раз — то, что надо побить.
 * Ключи упражнений разведены по профилям, поэтому чужое сюда не попадёт.
 */
async function previousResult(exerciseId: string): Promise<{ weight: number; reps: number[] } | null> {
  const last = await db.exerciseResults
    .where('exerciseId').equals(exerciseId)
    .reverse().limit(1).toArray();
  if (!last.length) return null;

  const logs = await db.setLogs
    .where('[sessionId+exerciseId]').equals([last[0].sessionId, exerciseId])
    .toArray();
  const reps = logs.filter((l) => l.kind === 'work' && l.done && l.reps !== null).map((l) => l.reps as number);
  if (!reps.length) return null;
  return { weight: last[0].weightUsed, reps };
}

/** Открывает незакрытую тренировку или заводит новую по очереди дней. */
export async function startOrResumeSession(): Promise<SessionPlan | null> {
  const profile = await activeProfile();
  if (!profile) return null;

  const settings = await getSettings();
  const progress = await getProgress(profile.id);
  const days = await myDays(profile.id);
  const day = nextDay(days, progress, settings.dayDEnabled);
  if (!day) return null;

  const week = weekNumber(progress);
  const deload = isDeloadWeek(week);

  // Незакрытая тренировка ищется только своя: у другого профиля может
  // висеть собственная, и подхватывать её нельзя.
  let session = (await db.sessions.where('[profileId+status]').equals([profile.id, 'active']).toArray())[0];
  if (!session) {
    session = {
      id: uid(),
      profileId: profile.id,
      dayId: day.id,
      weekNumber: week,
      isDeload: deload,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      tonnage: 0,
      durationSec: 0,
      status: 'active',
    };
    await db.sessions.put(session);
  }

  const activeDay = days.find((d) => d.id === session.dayId) ?? day;
  const exercises = await myExercises(profile.id, activeDay.id);
  const states = await db.exerciseState.bulkGet(exercises.map((e) => e.id));

  const items: PlanItem[] = [];
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    const state = states[i]!;
    const weight = plannedWeight(ex, state, session.weekNumber);
    const sets = session.isDeload ? deloadSets(ex.sets) : ex.sets;
    const base = state.nextTargetReps.length ? state.nextTargetReps : [];
    const targets = Array.from({ length: sets }, (_, k) => base[k] ?? ex.repRange?.[0] ?? 0);

    items.push({
      exercise: ex,
      state,
      weight,
      targets,
      warmup: buildWarmup(ex, weight, session.weekNumber),
      previous: await previousResult(ex.id),
    });
  }

  const generalWarmup = await warmupFor(profile.id);
  const letter = dayLetter(activeDay);

  return {
    session,
    day: activeDay,
    letter,
    week: session.weekNumber,
    deload: session.isDeload,
    items,
    generalWarmup,
    // Лёгкое сгибание ног перед днями B и C — требование его колена.
    // В собранной программе такого пункта в разминке просто нет.
    mandatoryWarmup:
      profile.source === 'seed'
      && (letter === 'B' || letter === 'C')
      && generalWarmup.length > MANDATORY_WARMUP_INDEX
        ? MANDATORY_WARMUP_INDEX
        : null,
  };
}

export interface Progress {
  results: Record<string, SetResult[]>;
  exIdx: number;
  setIdx: number;
}

/**
 * Восстанавливает, где мы остановились. Подходы уже лежат в setLogs,
 * поэтому закрытие приложения посреди тренировки ничего не теряет.
 */
export async function restoreProgress(sessionId: string, items: PlanItem[]): Promise<Progress> {
  const logs = await db.setLogs.where('sessionId').equals(sessionId).toArray();
  const results: Record<string, SetResult[]> = {};

  for (const log of logs) {
    if (log.kind !== 'work' || !log.done || log.reps === null) continue;
    (results[log.exerciseId] ??= [])[log.index] = { reps: log.reps, rir: log.rir };
  }

  let exIdx = 0;
  let setIdx = 0;
  for (let i = 0; i < items.length; i++) {
    const done = (results[items[i].exercise.id] ?? []).filter(Boolean).length;
    if (done < items[i].targets.length) { exIdx = i; setIdx = done; break; }
    if (i === items.length - 1) { exIdx = i; setIdx = items[i].targets.length; }
  }

  return { results, exIdx, setIdx };
}

export async function logWorkSet(
  profileId: string,
  sessionId: string,
  exerciseId: string,
  index: number,
  targetWeight: number,
  targetReps: number,
  reps: number,
  rir: number | null,
): Promise<void> {
  await db.setLogs.put({
    id: `${sessionId}:${exerciseId}:work:${index}`,
    profileId, sessionId, exerciseId, index, kind: 'work',
    targetWeight, targetReps, weight: targetWeight, reps, rir,
    done: true, at: new Date().toISOString(),
  });
}

export interface FinishedExercise {
  exerciseId: string;
  results: SetResult[];
  skipped?: SkipReason;
}

/**
 * Закрывает тренировку: считает план на следующую по каждому упражнению,
 * сохраняет состояние и двигает очередь дней на один шаг.
 */
export async function finishSession(
  sessionId: string,
  finished: FinishedExercise[],
): Promise<string> {
  const session = await db.sessions.get(sessionId);
  if (!session) throw new Error('Тренировка не найдена');

  const settings = await getSettings();
  const progress = await getProgress(session.profileId);
  const days = await myDays(session.profileId);
  const queueLength = Math.max(1, activeDays(days, settings.dayDEnabled).length);

  // Упражнение повторяется раз в круг, то есть примерно раз в неделю —
  // поэтому планируем на неделю вперёд.
  const planWeek = session.weekNumber + 1;
  const now = new Date().toISOString();
  let tonnage = 0;

  for (const item of finished) {
    const ex = await db.exercises.get(item.exerciseId);
    const state = await db.exerciseState.get(item.exerciseId);
    if (!ex || !state) continue;

    const weightUsed = plannedWeight(ex, state, session.weekNumber);
    if (ex.type !== 'distance') {
      tonnage += item.results.reduce((sum, r) => sum + r.reps * weightUsed, 0);
    }

    if (item.skipped) {
      await db.exerciseResults.put({
        profileId: session.profileId,
        sessionId, exerciseId: ex.id, outcome: 'skipped',
        reason: 'Пропущено', weightUsed, volume: 0,
        nextWeight: state.currentWeight, nextTargetReps: state.nextTargetReps,
        skipReason: item.skipped,
      });
      continue;
    }
    if (!item.results.length) continue;

    const plan = planNext(effective(ex, state), state, item.results, planWeek);

    await db.exerciseResults.put({
      profileId: session.profileId,
      sessionId, exerciseId: ex.id,
      outcome: plan.outcome, reason: plan.reason,
      weightUsed, volume: plan.volume,
      nextWeight: plan.nextWeight, nextTargetReps: plan.nextTargetReps,
    });

    await db.exerciseState.put({
      ...state,
      currentWeight: plan.nextWeight,
      nextTargetReps: plan.nextTargetReps,
      stallCount: plan.stallCount,
      lastVolume: plan.volume,
      lastOutcome: plan.outcome,
      sessionsDone: state.sessionsDone + 1,
      updatedAt: now,
    });
  }

  const durationSec = Math.max(0, Math.round((Date.now() - Date.parse(session.startedAt)) / 1000));
  await db.sessions.put({
    ...session,
    finishedAt: now,
    durationSec,
    tonnage: Math.round(tonnage),
    status: 'done',
  });

  await updateProgress(session.profileId, {
    dayQueueIndex: (progress.dayQueueIndex + 1) % queueLength,
    lastSessionAt: now,
    programStartedAt: progress.programStartedAt ?? now,
  });

  return sessionId;
}

/** Бросить незакрытую тренировку — например при выходе без единого подхода. */
export async function abandonSession(sessionId: string): Promise<void> {
  const session = await db.sessions.get(sessionId);
  if (session) await db.sessions.put({ ...session, status: 'abandoned', finishedAt: new Date().toISOString() });
}
