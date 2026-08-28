import { db, getSettings, SCHEMA_VERSION } from './db.ts';
import { buildExercises, DAYS, GENERAL_WARMUP, initialTargetReps, initialWeight } from './seed.ts';

export const SEED_VERSION = 1;

export interface DbStatus {
  ok: boolean;
  schemaVersion: number;
  tables: string[];
  counts: Record<string, number>;
  seeded: boolean;
  error?: string;
}

/**
 * Открывает базу и гарантирует наличие служебных строк.
 * Сид программы и питания приезжает на этапе 2 — здесь только каркас.
 */
export async function initDb(): Promise<DbStatus> {
  try {
    await db.open();
    await getSettings();

    const storedVersion = await db.meta.get('schemaVersion');
    if (!storedVersion) {
      await db.meta.put({ key: 'schemaVersion', value: SCHEMA_VERSION });
    }

    await seedProgram();
    const seedRow = await db.meta.get('seedVersion');
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
      seeded: Boolean(seedRow),
    };
  } catch (error) {
    return {
      ok: false,
      schemaVersion: SCHEMA_VERSION,
      tables: [],
      counts: {},
      seeded: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Заливает программу при первом запуске. Идемпотентна: повторный вызов
 * ничего не трогает, чтобы не затирать накопленные веса.
 */
export async function seedProgram(): Promise<boolean> {
  const current = await db.meta.get('seedVersion');
  if (current?.value === SEED_VERSION) return false;

  const exercises = buildExercises();
  const now = new Date().toISOString();

  await db.transaction('rw', db.days, db.exercises, db.exerciseState, db.meta, async () => {
    await db.days.bulkPut(DAYS);
    await db.exercises.bulkPut(exercises);

    // Состояние заводим только для новых упражнений — уже накопленные веса не трогаем.
    const existing = new Set((await db.exerciseState.toArray()).map((s) => s.exerciseId));
    const fresh = exercises
      .filter((ex) => !existing.has(ex.id))
      .map((ex) => ({
        exerciseId: ex.id,
        currentWeight: initialWeight(ex),
        nextTargetReps: initialTargetReps(ex),
        stallCount: 0,
        lastVolume: null,
        lastOutcome: null,
        sessionsDone: 0,
        variantId: null,
        supersetWeight: ex.superset?.weight,
        updatedAt: now,
      }));
    if (fresh.length) await db.exerciseState.bulkPut(fresh);

    await db.meta.put({ key: 'warmup', value: GENERAL_WARMUP });
    await db.meta.put({ key: 'seedVersion', value: SEED_VERSION });
  });

  return true;
}

/** Полный сброс — понадобится при импорте JSON и в настройках. */
export async function wipeDb(): Promise<void> {
  await db.delete();
  await db.open();
}
