import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { estimateWeight } from '../lib/anthro.ts';
import {
  carryMeasurements, carryWeights, hasOwnerData, OWNER_ID, ownerProfile,
  stamp, stampDay, STAMPED_TABLES, withActiveProfile,
} from './migrate.ts';
import { movement } from './movements.ts';
import { buildExercises } from './seed.ts';
import type { LegacyDated, Settings } from './types.ts';

/** Настройки собираем здесь, а не тянем из db.ts: тот открывает базу. */
const settingsRow = (patch: Partial<Settings> = {}): Settings => ({
  id: 1,
  activeProfileId: null,
  allowBarbellPress: false,
  dayDEnabled: false,
  supersetsEnabled: true,
  programStartedAt: '2026-06-01T09:00:00.000Z',
  weekOverride: null,
  dayQueueIndex: 0,
  lastSessionAt: '2026-08-01T10:05:00.000Z',
  breakAckAt: null,
  restSound: true,
  restVibrate: true,
  warmupFromWorkingWeight: true,
  createdAt: '2026-06-01T09:00:00.000Z',
  ...patch,
});

/**
 * Миграция на профили. Это единственная копия дневника, поэтому проверяем
 * не «отработало без ошибки», а «каждая строка на месте и поля целы».
 *
 * Здесь проверяется логика переноса на обычных объектах. То же самое на
 * настоящей базе в браузере проверяет scripts/migration-check.mjs — без него
 * этот файл ничего не доказывает про IndexedDB.
 */

/** Снимок базы, какой она была на схеме 4: у строк нет ни profileId, ни буквы. */
function schema4Snapshot() {
  return {
    days: [
      { id: 'A', name: 'Задняя цепь и грудь', weekdayHint: 'вторник', optional: false, order: 0 },
      { id: 'B', name: 'Ноги, плечи, спина', weekdayHint: 'четверг', optional: false, order: 1 },
    ],
    exercises: [
      { id: 'a2-db-bench', dayId: 'A', order: 1, catalogId: 'db-bench', name: 'Жим гантелей лёжа', sets: 4, startWeight: 26 },
    ],
    exerciseState: [
      { exerciseId: 'a2-db-bench', currentWeight: 34, nextTargetReps: [8, 8, 8, 8], stallCount: 1,
        lastVolume: 33, lastOutcome: 'hold', sessionsDone: 9, variantId: null, updatedAt: '2026-08-01T10:00:00.000Z' },
    ],
    sessions: [
      { id: 's1', dayId: 'A', weekNumber: 5, isDeload: false, startedAt: '2026-08-01T09:00:00.000Z',
        finishedAt: '2026-08-01T10:05:00.000Z', tonnage: 4210, durationSec: 3900, status: 'done' },
    ],
    setLogs: [
      { id: 's1:a2-db-bench:work:0', sessionId: 's1', exerciseId: 'a2-db-bench', index: 0, kind: 'work',
        targetWeight: 34, targetReps: 8, weight: 34, reps: 9, rir: 2, done: true, at: '2026-08-01T09:20:00.000Z' },
    ],
    exerciseResults: [
      { id: 7, sessionId: 's1', exerciseId: 'a2-db-bench', outcome: 'up', reason: 'Диапазон закрыт с запасом — прибавка',
        weightUsed: 34, volume: 33, nextWeight: 36, nextTargetReps: [8, 8, 8, 8] },
    ],
    bodyWeight: [
      { date: '2026-07-30', kg: 66.8 },
      { date: '2026-08-01', kg: 67.2 },
    ],
    measurements: [
      { date: '2026-07-30', chest: 98, waist: 74, thigh: 55, arm: 33, neck: 37 },
    ],
  };
}

const counts = (snap: Record<string, unknown[]>): Record<string, number> =>
  Object.fromEntries(Object.entries(snap).map(([k, v]) => [k, v.length]));

test('профиль владельца — тот самый, под который откалиброван расчёт', () => {
  const owner = ownerProfile('2026-08-29T00:00:00.000Z');
  assert.equal(owner.id, OWNER_ID);
  assert.equal(owner.source, 'seed', 'программу владельца нельзя подменять расчётной');
  assert.equal(owner.daysPerWeek, 3);
  assert.deepEqual(owner.limits, ['knee', 'wrist', 'lowback']);

  // Тот же порог, что в generator.test.ts: если кто-то поправит здесь стаж
  // или вес, расчёт перестанет воспроизводить его программу — и это упадёт тут.
  let checked = 0;
  for (const ex of buildExercises()) {
    const m = movement(ex.catalogId);
    if (!m || ex.isNewPattern || !ex.startWeight) continue;
    const off = Math.abs(estimateWeight(m, owner) / ex.startWeight - 1);
    assert.ok(off <= 0.2, `${ex.name}: расхождение ${Math.round(off * 100)}%`);
    checked++;
  }
  assert.ok(checked >= 10, `сверено ${checked} упражнений — мало`);
});

test('ни одна строка не теряется и поля не меняются', () => {
  const before = schema4Snapshot();
  const after = {
    days: before.days.map((r) => stampDay(r, OWNER_ID)),
    exercises: before.exercises.map((r) => stamp(r, OWNER_ID)),
    exerciseState: before.exerciseState.map((r) => stamp(r, OWNER_ID)),
    sessions: before.sessions.map((r) => stamp(r, OWNER_ID)),
    setLogs: before.setLogs.map((r) => stamp(r, OWNER_ID)),
    exerciseResults: before.exerciseResults.map((r) => stamp(r, OWNER_ID)),
  };

  for (const name of STAMPED_TABLES) {
    const src = before[name] as Array<Record<string, unknown>>;
    const dst = after[name] as Array<Record<string, unknown>>;
    assert.equal(dst.length, src.length, `${name}: изменилось число строк`);

    src.forEach((row, i) => {
      assert.equal(dst[i].profileId, OWNER_ID, `${name}: профиль не проставлен`);
      // Ключ строки трогать нельзя: к нему привязаны состояния и подходы.
      assert.equal(dst[i].id ?? dst[i].exerciseId, row.id ?? row.exerciseId, `${name}: ключ уехал`);
      for (const [key, value] of Object.entries(row)) {
        assert.deepEqual(dst[i][key], value, `${name}.${key}: значение изменилось`);
      }
    });
  }
});

test('накопленные веса и рекорды остаются ровно теми же', () => {
  const [state] = schema4Snapshot().exerciseState.map((r) => stamp(r, OWNER_ID));
  assert.equal(state.currentWeight, 34);
  assert.deepEqual(state.nextTargetReps, [8, 8, 8, 8]);
  assert.equal(state.sessionsDone, 9);
  assert.equal(state.stallCount, 1);
});

test('дни получают букву для показа, ключ остаётся прежним', () => {
  const days = schema4Snapshot().days.map((r) => stampDay(r, OWNER_ID));
  assert.deepEqual(days.map((d) => d.id), ['A', 'B']);
  assert.deepEqual(days.map((d) => d.letter), ['A', 'B']);
});

test('второй проход миграции ничего не переписывает', () => {
  const once = schema4Snapshot().sessions.map((r) => stamp(r, OWNER_ID));
  const twice = once.map((r) => stamp(r, 'somebody-else'));
  // Тот же объект, а не копия: значит переписывать было нечего.
  assert.equal(twice[0], once[0]);
  assert.equal(twice[0].profileId, OWNER_ID);
});

test('взвешивания и замеры переносятся все и без потерь', () => {
  const snap = schema4Snapshot();
  const weights = carryWeights(snap.bodyWeight as LegacyDated[], OWNER_ID);
  assert.equal(weights.length, snap.bodyWeight.length);
  assert.deepEqual(weights.map((w) => w.kg), [66.8, 67.2]);
  assert.deepEqual(weights.map((w) => w.date), ['2026-07-30', '2026-08-01']);
  assert.ok(weights.every((w) => w.profileId === OWNER_ID));

  const girth = carryMeasurements(snap.measurements as unknown as LegacyDated[], OWNER_ID);
  assert.equal(girth.length, 1);
  assert.equal(girth[0].chest, 98);
  assert.equal(girth[0].waist, 74);
  assert.equal(girth[0].profileId, OWNER_ID);
});

test('одна дата у двух профилей больше не схлопывается', () => {
  const day: LegacyDated[] = [{ date: '2026-08-01', kg: 67.2 }];
  const rows = [...carryWeights(day, OWNER_ID), ...carryWeights(day, 'guest')];
  const keys = new Set(rows.map((r) => `${r.profileId}|${r.date}`));
  assert.equal(keys.size, 2, 'ключ «профиль + дата» обязан быть разным');
});

test('строка без даты не превращается в мусорный ключ', () => {
  assert.equal(carryWeights([{ date: '', kg: 70 }], OWNER_ID).length, 0);
});

test('настройки узнают владельца, остальное не трогается', () => {
  const before = settingsRow({ weekOverride: 12, dayQueueIndex: 2, allowBarbellPress: true });
  const after = withActiveProfile(before, OWNER_ID);
  assert.equal(after.activeProfileId, OWNER_ID);
  assert.equal(after.weekOverride, 12);
  assert.equal(after.dayQueueIndex, 2);
  assert.equal(after.allowBarbellPress, true);
  assert.equal(after.programStartedAt, before.programStartedAt);
  assert.equal(after.lastSessionAt, before.lastSessionAt);
});

test('уже выбранный профиль миграция не перебивает', () => {
  assert.equal(withActiveProfile(settingsRow({ activeProfileId: 'guest' }), OWNER_ID).activeProfileId, 'guest');
});

test('пустая база владельцу не достаётся', () => {
  assert.equal(hasOwnerData(counts(schema4Snapshot())), true);
  assert.equal(hasOwnerData({}), false);
  assert.equal(hasOwnerData({ days: 0, sessions: 0, bodyWeight: 0 }), false);
  // Хватает и одного взвешивания: это уже дневник.
  assert.equal(hasOwnerData({ bodyWeight: 1 }), true);
});
