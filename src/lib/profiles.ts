import { db, getSettings, updateSettings } from '../db/db.ts';
import {
  GENERIC_WARMUP, installProgram, scopeProgram, seedProgramFor,
} from '../db/init.ts';
import { movement } from '../db/movements.ts';
import { GENERAL_WARMUP } from '../db/seed.ts';
import type {
  Exercise, ExerciseState, Profile, ProgramDay, Session,
} from '../db/types.ts';
import { estimateWeight } from './anthro.ts';
import { generateProgram } from './generator.ts';

/**
 * Профили и всё, что читается «по своему профилю».
 *
 * Единственный способ достать личные данные — через функции отсюда: если
 * выборка идёт мимо, в неё попадает чужой дневник. Расчётная часть
 * (anthro.ts, generator.ts) здесь только вызывается, но не повторяется.
 */

const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- Кто открыт ---------- */

export async function listProfiles(): Promise<Profile[]> {
  return (await db.profiles.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function activeProfileId(): Promise<string | null> {
  const settings = await getSettings();
  if (!settings.activeProfileId) return null;
  // Профиль мог быть удалён — тогда указатель врёт, и лучше это увидеть сразу.
  const exists = await db.profiles.get(settings.activeProfileId);
  return exists ? settings.activeProfileId : null;
}

export async function activeProfile(): Promise<Profile | null> {
  const id = await activeProfileId();
  return id ? (await db.profiles.get(id)) ?? null : null;
}

/* ---------- Личные выборки ---------- */

export async function myDays(profileId: string): Promise<ProgramDay[]> {
  return (await db.days.where('profileId').equals(profileId).toArray())
    .sort((a, b) => a.order - b.order);
}

export async function myExercises(profileId: string, dayId?: string): Promise<Exercise[]> {
  const rows = dayId
    ? await db.exercises.where('[profileId+dayId]').equals([profileId, dayId]).toArray()
    : await db.exercises.where('profileId').equals(profileId).toArray();
  return rows.sort((a, b) => a.dayId.localeCompare(b.dayId) || a.order - b.order);
}

export async function myStates(profileId: string): Promise<ExerciseState[]> {
  return db.exerciseState.where('profileId').equals(profileId).toArray();
}

export async function mySessions(profileId: string): Promise<Session[]> {
  return (await db.sessions.where('profileId').equals(profileId).toArray())
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** Состояния разом, ключом по упражнению — так их удобно раскладывать по списку. */
export async function stateMap(profileId: string): Promise<Record<string, ExerciseState>> {
  const out: Record<string, ExerciseState> = {};
  for (const state of await myStates(profileId)) out[state.exerciseId] = state;
  return out;
}

/* ---------- Создание ---------- */

/** Что вводит человек в анкете. Остальное приложение допишет само. */
export type ProfileDraft = Omit<Profile, 'id' | 'createdAt'>;

export interface Created {
  profile: Profile;
  /** Слоты программы, которые нечем закрыть. Пустой список — всё сошлось. */
  gaps: Array<{ dayId: string; pattern: string }>;
}

/**
 * Заводит профиль и сразу ставит ему программу: без программы дневник
 * бесполезен, а человек уже ответил на все вопросы.
 *
 * Источник 'seed' — готовая программа владельца как есть. Источник
 * 'generated' — сборка под человека с весами из estimateWeight.
 */
export async function createProfile(draft: ProfileDraft): Promise<Created> {
  const profile: Profile = { ...draft, id: uid(), createdAt: new Date().toISOString() };
  await db.profiles.put(profile);

  let gaps: Created['gaps'] = [];
  if (profile.source === 'seed') {
    await installProgram(profile.id, seedProgramFor(profile.id), GENERAL_WARMUP);
  } else {
    const built = generateProgram(profile);
    gaps = built.gaps.map((g) => ({ dayId: g.dayId, pattern: g.pattern }));
    await installProgram(
      profile.id,
      scopeProgram(profile.id, built.days, built.exercises),
      GENERIC_WARMUP,
    );
  }

  await switchProfile(profile.id);
  return { profile, gaps };
}

export async function switchProfile(profileId: string): Promise<void> {
  await updateSettings({ activeProfileId: profileId });
}

export async function renameProfile(profileId: string, name: string): Promise<void> {
  const profile = await db.profiles.get(profileId);
  if (profile) await db.profiles.put({ ...profile, name: name.trim() || profile.name });
}

/**
 * Удаляет профиль вместе со всем, что ему принадлежит. Необратимо, поэтому
 * зовётся только после подтверждения на экране.
 */
export async function deleteProfile(profileId: string): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    const exercises = await db.exercises.where('profileId').equals(profileId).toArray();
    const sessions = await db.sessions.where('profileId').equals(profileId).toArray();

    await db.setLogs.where('profileId').equals(profileId).delete();
    await db.exerciseResults.where('profileId').equals(profileId).delete();
    await db.exerciseState.where('profileId').equals(profileId).delete();
    await db.sessions.where('profileId').equals(profileId).delete();
    await db.exercises.where('profileId').equals(profileId).delete();
    await db.days.where('profileId').equals(profileId).delete();
    await db.weightLog.where('profileId').equals(profileId).delete();
    await db.girthLog.where('profileId').equals(profileId).delete();
    await db.progress.delete(profileId);
    await db.meta.delete(`warmup:${profileId}`);
    await db.profiles.delete(profileId);

    // Подчищаем то, что могло остаться от старых записей без индекса.
    const ids = new Set(exercises.map((e) => e.id));
    const sessionIds = new Set(sessions.map((s) => s.id));
    await db.setLogs.filter((l) => ids.has(l.exerciseId) || sessionIds.has(l.sessionId)).delete();
  });

  const settings = await getSettings();
  if (settings.activeProfileId === profileId) {
    const rest = await listProfiles();
    await updateSettings({ activeProfileId: rest[0]?.id ?? null });
  }
}

/* ---------- Пересчёт весов ---------- */

export interface RecalcRow {
  exerciseId: string;
  name: string;
  dayLetter: string;
  from: number;
  to: number;
}

/**
 * Предпросмотр «было → станет» по данным профиля. Ничего не пишет:
 * человек сначала смотрит таблицу, и только потом решает.
 *
 * Упражнения вне автопрогрессии и со своим весом не трогаются: там вес
 * либо лечебный, либо его вообще нет.
 */
export async function recalcPreview(profile: Profile): Promise<RecalcRow[]> {
  const exercises = await myExercises(profile.id);
  const states = await stateMap(profile.id);
  const days = await myDays(profile.id);
  const letters: Record<string, string> = {};
  for (const d of days) letters[d.id] = d.letter ?? d.id;

  const rows: RecalcRow[] = [];
  for (const ex of exercises) {
    const state = states[ex.id];
    const m = movement(ex.catalogId);
    if (!state || !m || !ex.autoProgress || ex.step === null) continue;
    if (m.unit === 'bodyweight') continue;
    // Замена стоит на другом снаряде — расчёт про неё ничего не знает.
    if (state.variantId) continue;

    const from = state.currentWeight;
    const to = estimateWeight(m, profile);
    if (to === from) continue;
    rows.push({ exerciseId: ex.id, name: ex.shortName ?? ex.name, dayLetter: letters[ex.dayId] ?? ex.dayId, from, to });
  }
  return rows;
}

/**
 * Применяет пересчёт. Историю не трогает: прошлые тренировки — факт,
 * их переписывать нельзя. Меняется только вес на следующую сессию.
 */
export async function applyRecalc(profileId: string, rows: RecalcRow[]): Promise<number> {
  const now = new Date().toISOString();
  let changed = 0;
  for (const row of rows) {
    const state = await db.exerciseState.get(row.exerciseId);
    if (!state || state.profileId !== profileId) continue;
    await db.exerciseState.put({
      ...state,
      currentWeight: row.to,
      stallCount: 0,
      lastVolume: null,
      updatedAt: now,
    });
    changed++;
  }
  return changed;
}

/** Слоты программы, которые нечем закрыть. Считается заново — генератор детерминирован. */
export function programGaps(profile: Profile): Array<{ dayId: string; pattern: string }> {
  if (profile.source === 'seed') return [];
  return generateProgram(profile).gaps.map((g) => ({ dayId: g.dayId, pattern: g.pattern }));
}
