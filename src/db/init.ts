import { db, getSettings, SCHEMA_VERSION } from './db.ts';
import { buildExercises, DAYS, GENERAL_WARMUP, initialTargetReps, initialWeight } from './seed.ts';
import type { Exercise, ExerciseState, ProgramDay } from './types.ts';

/** Общая разминка для собранной программы: без пунктов под чужое колено. */
export const GENERIC_WARMUP = [
  '3 мин велотренажёр или дорожка в горку',
  'Разведение резины перед собой — 2×15',
  'Ягодичный мостик — 15',
  'Круги плечами и запястьями — 30 с',
];

export interface DbStatus {
  ok: boolean;
  schemaVersion: number;
  tables: string[];
  counts: Record<string, number>;
  /** Есть ли хоть один профиль. Нет — приложение открывается впервые. */
  hasProfile: boolean;
  error?: string;
}

/**
 * Открывает базу и гарантирует наличие служебных строк.
 * Программу здесь никто не заливает: она принадлежит профилю, а профиль
 * появляется либо из миграции старой базы, либо из анкеты.
 */
export async function initDb(): Promise<DbStatus> {
  try {
    await db.open();
    await getSettings();

    await db.meta.put({ key: 'schemaVersion', value: SCHEMA_VERSION });

    const tables = db.tables.map((t) => t.name);
    const counts: Record<string, number> = {};
    for (const table of db.tables) {
      counts[table.name] = await table.count();
    }

    return {
      ok: true,
      schemaVersion: SCHEMA_VERSION,
      tables,
      counts,
      hasProfile: (counts.profiles ?? 0) > 0,
    };
  } catch (error) {
    return {
      ok: false,
      schemaVersion: SCHEMA_VERSION,
      tables: [],
      counts: {},
      hasProfile: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Ключ строки программы под профиль. Приставка нужна потому, что первичные
 * ключи в базе общие: день A и упражнение a1-... есть у каждого человека.
 * Строки владельца при этом остаются с прежними ключами — к ним привязаны
 * все накопленные веса, и переименовывать их нельзя.
 */
export const scopedId = (profileId: string, base: string) => `${profileId}~${base}`;

/** Программа владельца из сида, переложенная на конкретный профиль. */
export function seedProgramFor(profileId: string): { days: ProgramDay[]; exercises: Exercise[] } {
  return scopeProgram(profileId, DAYS, buildExercises());
}

/**
 * Приписывает программе профиль и разводит ключи. Дни и упражнения приходят
 * из сида или из генератора — оба не знают ни про профили, ни про базу.
 */
export function scopeProgram(
  profileId: string,
  days: ProgramDay[],
  exercises: Exercise[],
): { days: ProgramDay[]; exercises: Exercise[] } {
  return {
    days: days.map((d) => ({
      ...d,
      id: scopedId(profileId, d.id),
      letter: d.letter ?? d.id,
      profileId,
    })),
    exercises: exercises.map((ex) => ({
      ...ex,
      id: scopedId(profileId, ex.id),
      dayId: scopedId(profileId, ex.dayId),
      profileId,
    })),
  };
}

/** Стартовое состояние упражнения: вес из расчёта или расписания, повторы по низу диапазона. */
export function freshState(ex: Exercise, profileId: string, now: string): ExerciseState {
  return {
    exerciseId: ex.id,
    profileId,
    currentWeight: initialWeight(ex),
    nextTargetReps: initialTargetReps(ex),
    stallCount: 0,
    lastVolume: null,
    lastOutcome: null,
    sessionsDone: 0,
    variantId: null,
    supersetWeight: ex.superset?.weight,
    updatedAt: now,
  };
}

/**
 * Записывает программу профиля. Состояния заводит только для новых
 * упражнений: уже накопленные веса не трогаются никогда.
 */
export async function installProgram(
  profileId: string,
  program: { days: ProgramDay[]; exercises: Exercise[] },
  warmup: string[],
): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction('rw', db.days, db.exercises, db.exerciseState, db.meta, async () => {
    await db.days.bulkPut(program.days);
    await db.exercises.bulkPut(program.exercises);

    const existing = new Set(
      (await db.exerciseState.where('profileId').equals(profileId).toArray()).map((s) => s.exerciseId),
    );
    const fresh = program.exercises
      .filter((ex) => !existing.has(ex.id))
      .map((ex) => freshState(ex, profileId, now));
    if (fresh.length) await db.exerciseState.bulkPut(fresh);

    await db.meta.put({ key: `warmup:${profileId}`, value: warmup });
  });
}

/** Общая разминка профиля. У владельца она лежит под старым ключом. */
export async function warmupFor(profileId: string): Promise<string[]> {
  const own = await db.meta.get(`warmup:${profileId}`);
  if (Array.isArray(own?.value)) return own.value as string[];
  const legacy = await db.meta.get('warmup');
  return Array.isArray(legacy?.value) ? (legacy.value as string[]) : GENERAL_WARMUP;
}

/** Полный сброс — понадобится при импорте JSON и в настройках. */
export async function wipeDb(): Promise<void> {
  await db.delete();
  await db.open();
}
