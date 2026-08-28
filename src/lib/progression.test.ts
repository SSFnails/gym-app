import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { planNext, resetTenPercent, roundToStep } from './progression.ts';
import type { Exercise, ExerciseState } from '../db/types.ts';

const ex = (over: Partial<Exercise> = {}): Exercise => ({
  id: 'x', dayId: 'A', order: 0, catalogId: 'x', name: 'Тест',
  type: 'reps', sets: 4, repRange: [8, 10], rest: 120, step: 2.5,
  autoProgress: true, isNewPattern: false, startWeight: 40,
  ...over,
});

const st = (over: Partial<ExerciseState> = {}): ExerciseState => ({
  exerciseId: 'x', currentWeight: 50, nextTargetReps: [8, 8, 8, 8],
  stallCount: 0, lastVolume: null, lastOutcome: null, sessionsDone: 1,
  variantId: null, updatedAt: '', ...over,
});

const sets = (reps: number[], rir: number) => reps.map((r) => ({ reps: r, rir }));

test('все подходы добрали верх и есть запас — прибавка, повторы падают к низу', () => {
  const p = planNext(ex(), st(), sets([10, 10, 10, 10], 1), 5);
  assert.equal(p.outcome, 'up');
  assert.equal(p.nextWeight, 52.5);
  assert.deepEqual(p.nextTargetReps, [8, 8, 8, 8]);
});

test('верх добрали, но запаса нет — прибавки нет', () => {
  const p = planNext(ex(), st(), sets([10, 10, 10, 10], 3), 5);
  assert.equal(p.outcome, 'hold');
  assert.equal(p.nextWeight, 50);
});

test('два подхода ниже нижней границы — откат на ступень', () => {
  const p = planNext(ex(), st(), sets([8, 8, 7, 6], 0), 5);
  assert.equal(p.outcome, 'down');
  assert.equal(p.nextWeight, 47.5);
});

test('один подход ниже границы — это ещё не откат', () => {
  const p = planNext(ex(), st(), sets([9, 9, 8, 7], 1), 5);
  assert.equal(p.outcome, 'hold');
  assert.equal(p.nextWeight, 50);
});

test('откат работает и на стартовом весе — он всего лишь догадка', () => {
  const p = planNext(ex({ startWeight: 50 }), st({ currentWeight: 50 }), sets([5, 5, 5, 5], 0), 5);
  assert.equal(p.outcome, 'down');
  assert.equal(p.nextWeight, 47.5);
});

test('откат не уводит вес в ноль — ниже одной ступени не опускаемся', () => {
  const p = planNext(ex({ step: 2.5 }), st({ currentWeight: 2.5 }), sets([5, 5, 5, 5], 0), 5);
  assert.equal(p.nextWeight, 2.5);
});

test('со своим весом откат невозможен — растём повторами', () => {
  const p = planNext(ex({ startWeight: 0 }), st({ currentWeight: 0 }), sets([6, 6, 5, 5], 1), 5);
  assert.equal(p.outcome, 'hold');
  assert.equal(p.nextWeight, 0);
  assert.deepEqual(p.nextTargetReps, [7, 7, 6, 6]);
});

test('без прибавки цель растёт на один повтор в каждом подходе, но не выше верха', () => {
  const p = planNext(ex(), st(), sets([9, 8, 10, 8], 2), 5);
  assert.deepEqual(p.nextTargetReps, [10, 9, 10, 9]);
});

test('новое движение: первые три недели вес берётся из расписания', () => {
  const nova = ex({ isNewPattern: true, schedule: { 1: 40, 2: 45, 3: 50 } });
  const p = planNext(nova, st({ currentWeight: 40 }), sets([8, 8, 8, 8], 2), 2);
  assert.equal(p.outcome, 'fixed');
  assert.equal(p.nextWeight, 45);
});

test('новое движение: с четвёртой недели включается обычный алгоритм', () => {
  const nova = ex({ isNewPattern: true, schedule: { 1: 40, 2: 45, 3: 50 } });
  const p = planNext(nova, st({ currentWeight: 50 }), sets([10, 10, 10, 10], 1), 4);
  assert.equal(p.outcome, 'up');
  assert.equal(p.nextWeight, 52.5);
});

test('проскочил диапазон — прибавка сразу, даже внутри расписания', () => {
  const nova = ex({ isNewPattern: true, schedule: { 1: 40, 2: 45, 3: 50 } });
  const p = planNext(nova, st({ currentWeight: 45 }), sets([12, 11, 10, 10], 2), 3);
  assert.equal(p.outcome, 'up');
  assert.equal(p.nextWeight, 50);
});

test('запястья и фермерская прогулка алгоритм не трогает', () => {
  const manual = ex({ autoProgress: false, step: null });
  const p = planNext(manual, st(), sets([15, 15, 15, 15], 3), 5);
  assert.equal(p.outcome, 'manual');
  assert.equal(p.nextWeight, 50);
});

test('объём не растёт две сессии подряд — застой', () => {
  const first = planNext(ex(), st({ lastVolume: 34 }), sets([9, 8, 8, 8], 2), 5);
  assert.equal(first.stallCount, 1);
  assert.equal(first.stalled, false);

  const second = planNext(ex(), st({ lastVolume: 34, stallCount: 1 }), sets([9, 8, 8, 8], 2), 5);
  assert.equal(second.stallCount, 2);
  assert.equal(second.stalled, true);
});

test('прибавка обнуляет счётчик застоя — падение повторов после неё закономерно', () => {
  const p = planNext(ex(), st({ lastVolume: 40, stallCount: 1 }), sets([10, 10, 10, 10], 1), 5);
  assert.equal(p.outcome, 'up');
  assert.equal(p.stallCount, 0);
});

test('сброс на −10% ложится на ближайшую ступень и не падает ниже стартового', () => {
  assert.equal(resetTenPercent(50, 2.5), 45);      // ровно 10%
  assert.equal(resetTenPercent(52.5, 2.5), 47.5);  // 9,5% — ближайшая ступень
  assert.equal(resetTenPercent(110, 5), 100);      // 9%
  assert.equal(resetTenPercent(8, 2), 6);          // грубая сетка: минимум ступень вниз
  assert.equal(resetTenPercent(20, 5, 5), 15);     // ниже пола не уходим
});

test('вес всегда лежит на сетке шага', () => {
  assert.equal(roundToStep(47.4, 2.5), 47.5);
  assert.equal(roundToStep(51, 5), 50);
});
