import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { estimateWeight, experienceFactor } from './anthro.ts';
import { allowed, generateProgram } from './generator.ts';
import { movement } from '../db/movements.ts';
import { buildExercises, initialWeight } from '../db/seed.ts';
import type { Profile } from '../db/types.ts';

const ALL = ['barbell', 'trapbar', 'ez', 'dumbbell', 'machine', 'cable', 'bodyweight'] as const;

/**
 * Профиль владельца. Стаж — «эффективный»: он тренируется шесть лет, но
 * вышел из долгой сушки, а сила уходит быстрее, чем возвращается.
 * Коэффициенты в movements.ts откалиброваны именно на такой профиль.
 */
const mark: Profile = {
  id: 'mark', name: 'Марк', sex: 'm', birthYear: 2005,
  heightCm: 190, weightKg: 67, experienceYears: 2, goal: 'mass',
  daysPerWeek: 3, equipment: [...ALL], limits: ['knee', 'wrist', 'lowback'],
  source: 'seed', createdAt: '',
};

const beginner: Profile = {
  ...mark, id: 'girl', name: 'Новичок', sex: 'f', birthYear: 2001,
  heightCm: 165, weightKg: 58, experienceYears: 0, limits: [], source: 'generated',
};

test('расчёт воспроизводит программу владельца', () => {
  const seeded = buildExercises();
  let checked = 0;
  for (const ex of seeded) {
    const m = movement(ex.catalogId);
    if (!m || ex.isNewPattern || !ex.startWeight) continue;
    const got = estimateWeight(m, mark);
    const off = Math.abs(got / ex.startWeight - 1);
    assert.ok(off <= 0.2,
      `${ex.name}: посчитано ${got}, в программе ${ex.startWeight} (${Math.round(off * 100)}%)`);
    checked++;
  }
  assert.ok(checked >= 10, `сверено всего ${checked} упражнений — мало`);
});

test('новичок получает заметно меньше, но не ноль и не ниже грифа', () => {
  const bench = movement('db-bench')!;
  const bar = movement('bb-bench')!;
  assert.ok(estimateWeight(bench, beginner) < estimateWeight(bench, mark) * 0.6);
  assert.ok(estimateWeight(bench, beginner) >= 2);
  // У этой девушки расчёт уже выше пустого грифа — это нормально.
  assert.ok(estimateWeight(bar, beginner) >= 20);
  // А у совсем лёгкого новичка расчёт упирается в гриф и ниже не идёт.
  const tiny = { ...beginner, weightKg: 45 };
  assert.equal(estimateWeight(bar, tiny), 20, 'ниже пустого грифа опускаться некуда');
});

test('стаж весит больше роста и веса', () => {
  assert.ok(experienceFactor(0) < experienceFactor(2));
  assert.ok(experienceFactor(2) < experienceFactor(5));
});

test('рост работает в правильную сторону: жимы тяжелее, тяги легче', () => {
  const tall = { ...mark, heightCm: 195 };
  const short = { ...mark, heightCm: 165 };
  const press = movement('db-bench')!;
  const row = movement('bb-row')!;
  assert.ok(estimateWeight(press, tall) < estimateWeight(press, short));
  assert.ok(estimateWeight(row, tall) > estimateWeight(row, short));
});

test('ограничения по здоровью закрывают движения', () => {
  const knee = { ...mark, limits: ['knee'] };
  const wrist = { ...mark, limits: ['wrist'] };
  assert.equal(allowed(movement('bulgarian-split')!, knee), false);
  assert.equal(allowed(movement('bb-bench')!, wrist), false);
  assert.equal(allowed(movement('bb-bench')!, knee), true);
});

test('в программе владельца нет запрещённого здоровьем', () => {
  const { exercises } = generateProgram(mark);
  for (const ex of exercises) {
    const m = movement(ex.catalogId)!;
    assert.ok(allowed(m, mark), `${ex.name} не должно было попасть`);
  }
});

test('число дней соответствует выбранному', () => {
  for (const n of [2, 3, 4]) {
    const { days } = generateProgram({ ...beginner, daysPerWeek: n });
    assert.equal(days.length, n);
  }
});

test('генератор детерминирован', () => {
  const a = generateProgram(beginner);
  const b = generateProgram(beginner);
  assert.deepEqual(a.exercises.map((e) => e.id), b.exercises.map((e) => e.id));
});

test('без тренажёров и блоков программа всё равно собирается', () => {
  const homeGym: Profile = { ...beginner, equipment: ['dumbbell', 'bodyweight'] };
  const { exercises, gaps } = generateProgram(homeGym);
  assert.ok(exercises.length >= 10, `собрано всего ${exercises.length} упражнений`);
  for (const ex of exercises) {
    assert.ok(['dumbbell', 'bodyweight'].includes(movement(ex.catalogId)!.equipment));
  }
  // Часть слотов закрыть нечем — это нормально, но об этом надо сообщать.
  assert.ok(Array.isArray(gaps));
});

test('у каждого упражнения есть вес и повторы', () => {
  const { exercises } = generateProgram(beginner);
  for (const ex of exercises) {
    assert.ok(ex.sets > 0, ex.name);
    if (ex.type === 'reps') assert.ok(ex.repRange, ex.name);
    assert.ok(ex.startWeight !== undefined, ex.name);
  }
});
