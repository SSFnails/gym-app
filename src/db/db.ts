import Dexie, { type EntityTable, type Table } from 'dexie';
import {
  carryMeasurements, carryProgress, carryWeights, hasOwnerData, ownerProfile,
  stamp, stampDay, STAMPED_TABLES, withActiveProfile,
} from './migrate.ts';
import type {
  BodyWeight, CatalogEntry, Exercise, ExerciseResult, ExerciseState, LegacyDated,
  Measurement, MetaRow, Photo, ProgramDay, ProgramProgress, Profile,
  Session, SetLog, Settings,
} from './types.ts';

export const SCHEMA_VERSION = 5;

class GymDB extends Dexie {
  meta!: EntityTable<MetaRow, 'key'>;
  settings!: EntityTable<Settings, 'id'>;
  profiles!: EntityTable<Profile, 'id'>;
  progress!: EntityTable<ProgramProgress, 'profileId'>;
  days!: EntityTable<ProgramDay, 'id'>;
  exercises!: EntityTable<Exercise, 'id'>;
  exerciseState!: EntityTable<ExerciseState, 'exerciseId'>;
  sessions!: EntityTable<Session, 'id'>;
  setLogs!: EntityTable<SetLog, 'id'>;
  exerciseResults!: EntityTable<ExerciseResult, 'id'>;
  /** Вес тела и обхваты: ключ «профиль + дата», иначе люди затирают друг друга. */
  weightLog!: Table<BodyWeight, [string, string]>;
  girthLog!: Table<Measurement, [string, string]>;
  /** Те же данные из схемы 4. Оставлены как страховка, приложение их не читает. */
  bodyWeight!: EntityTable<LegacyDated, 'date'>;
  measurements!: EntityTable<LegacyDated, 'date'>;
  catalog!: EntityTable<CatalogEntry, 'id'>;
  photos!: EntityTable<Photo, 'id'>;

  constructor() {
    super('gym-app');

    this.version(1).stores({
      meta:            'key',
      settings:        'id',
      days:            'id, order',
      exercises:       'id, dayId, [dayId+order]',
      exerciseState:   'exerciseId',
      sessions:        'id, startedAt, dayId, status',
      setLogs:         '++id, sessionId, exerciseId, [sessionId+exerciseId]',
      exerciseResults: '++id, sessionId, exerciseId, [sessionId+exerciseId]',
      bodyWeight:      'date',
      measurements:    'date',
      foods:           'name',
      tiers:           'level',
      foodSwaps:       'food',
      nutritionLog:    'date',
      catalog:         'id',
      photos:          '++id, catalogId',
    });

    // Питание убрано из приложения — таблицы сносим у тех, кто уже открывал версию 1.
    this.version(2).stores({
      foods: null,
      tiers: null,
      foodSwaps: null,
      nutritionLog: null,
    });

    // Ключ setLogs меняется с автоинкремента на составной, поэтому таблицу
    // пересоздаём: сменить первичный ключ на месте IndexedDB не умеет.
    this.version(3).stores({ setLogs: null });
    this.version(4).stores({
      setLogs: 'id, sessionId, exerciseId, [sessionId+exerciseId]',
    });

    /**
     * Профили. Правка только добавляющая: новая таблица, новые индексы,
     * новое поле в существующих строках. Первичные ключи не тронуты —
     * менять их IndexedDB не умеет, и на такой попытке падает открытие базы.
     *
     * Взвешивания и замеры лежали по одной дате, и на двух профилях второй
     * человек затирал бы записи первого. Поэтому для них заведены новые
     * таблицы с ключом «профиль + дата», данные скопированы, а старые
     * таблицы оставлены на диске как страховка.
     */
    this.version(5).stores({
      profiles:        'id',
      progress:        'profileId',
      days:            'id, order, profileId',
      exercises:       'id, dayId, [dayId+order], profileId, [profileId+dayId]',
      exerciseState:   'exerciseId, profileId',
      sessions:        'id, startedAt, dayId, status, profileId, [profileId+status]',
      setLogs:         'id, sessionId, exerciseId, [sessionId+exerciseId], profileId',
      exerciseResults: '++id, sessionId, exerciseId, [sessionId+exerciseId], profileId, [profileId+exerciseId]',
      weightLog:       '[profileId+date], profileId, date',
      girthLog:        '[profileId+date], profileId, date',
    }).upgrade(async (tx) => {
      const counts: Record<string, number> = {};
      for (const name of [...STAMPED_TABLES, 'bodyWeight', 'measurements']) {
        counts[name] = await tx.table(name).count();
      }
      // Пустую базу отдавать владельцу нечего — там человек заведёт свой профиль.
      if (!hasOwnerData(counts)) return;

      const owner = ownerProfile(new Date().toISOString());
      await tx.table('profiles').put(owner);

      for (const name of STAMPED_TABLES) {
        await tx.table(name).toCollection().modify((row: object, ref) => {
          ref.value = name === 'days' ? stampDay(row, owner.id) : stamp(row, owner.id);
        });
      }

      const weights = (await tx.table('bodyWeight').toArray()) as LegacyDated[];
      if (weights.length) await tx.table('weightLog').bulkPut(carryWeights(weights, owner.id));

      const girth = (await tx.table('measurements').toArray()) as LegacyDated[];
      if (girth.length) await tx.table('girthLog').bulkPut(carryMeasurements(girth, owner.id));

      const settings = (await tx.table('settings').get(1)) as Settings | undefined;
      await tx.table('progress').put(carryProgress(settings, owner.id));
      if (settings) await tx.table('settings').put(withActiveProfile(settings, owner.id));

      await tx.table('meta').put({ key: 'schemaVersion', value: SCHEMA_VERSION });
    });
  }
}

export const db = new GymDB();

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  activeProfileId: null,
  allowBarbellPress: false,
  dayDEnabled: false,
  supersetsEnabled: true,
  programStartedAt: null,
  weekOverride: null,
  dayQueueIndex: 0,
  lastSessionAt: null,
  breakAckAt: null,
  restSound: true,
  restVibrate: true,
  warmupFromWorkingWeight: true,
  createdAt: new Date().toISOString(),
};

/** Настройки существуют всегда. Возвращает актуальную строку, создавая при первом запуске. */
export async function getSettings(): Promise<Settings> {
  const existing = await db.settings.get(1);
  if (existing) return { ...DEFAULT_SETTINGS, ...existing };
  const fresh = { ...DEFAULT_SETTINGS, createdAt: new Date().toISOString() };
  await db.settings.put(fresh);
  return fresh;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch, id: 1 as const };
  await db.settings.put(next);
  return next;
}

/** Ход программы профиля. Как и настройки, существует всегда. */
export async function getProgress(profileId: string): Promise<ProgramProgress> {
  const existing = await db.progress.get(profileId);
  if (existing) return existing;
  const fresh: ProgramProgress = {
    profileId,
    dayQueueIndex: 0,
    programStartedAt: null,
    weekOverride: null,
    lastSessionAt: null,
    breakAckAt: null,
  };
  await db.progress.put(fresh);
  return fresh;
}

export async function updateProgress(
  profileId: string,
  patch: Partial<ProgramProgress>,
): Promise<ProgramProgress> {
  const current = await getProgress(profileId);
  const next = { ...current, ...patch, profileId };
  await db.progress.put(next);
  return next;
}
