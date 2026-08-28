import Dexie, { type EntityTable } from 'dexie';
import type {
  BodyWeight, CatalogEntry, Exercise, ExerciseResult, ExerciseState,
  Measurement, MetaRow, Photo, ProgramDay, Session, SetLog, Settings,
} from './types.ts';

export const SCHEMA_VERSION = 4;

class GymDB extends Dexie {
  meta!: EntityTable<MetaRow, 'key'>;
  settings!: EntityTable<Settings, 'id'>;
  days!: EntityTable<ProgramDay, 'id'>;
  exercises!: EntityTable<Exercise, 'id'>;
  exerciseState!: EntityTable<ExerciseState, 'exerciseId'>;
  sessions!: EntityTable<Session, 'id'>;
  setLogs!: EntityTable<SetLog, 'id'>;
  exerciseResults!: EntityTable<ExerciseResult, 'id'>;
  bodyWeight!: EntityTable<BodyWeight, 'date'>;
  measurements!: EntityTable<Measurement, 'date'>;
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
