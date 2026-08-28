import { db } from '../db/db.ts';
import { floorWeight } from './progression.ts';
import type { Exercise } from '../db/types.ts';

/** Точка графика: дата и значение. */
export interface Point { date: string; value: number }

/** Как менялся рабочий вес упражнения по сессиям. */
export async function weightSeries(exerciseId: string): Promise<Point[]> {
  const results = await db.exerciseResults.where('exerciseId').equals(exerciseId).toArray();
  const sessions = await db.sessions.bulkGet(results.map((r) => r.sessionId));
  return results
    .map((r, i) => ({ date: sessions[i]?.startedAt ?? '', value: r.weightUsed }))
    .filter((p) => p.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Скользящее среднее за неделю — линия поверх точек веса тела. */
export function weeklyAverage(points: Point[]): Point[] {
  return points.map((p, i) => {
    const from = Date.parse(p.date) - 6 * 86_400_000;
    const window = points.slice(0, i + 1).filter((q) => Date.parse(q.date) >= from);
    const sum = window.reduce((s, q) => s + q.value, 0);
    return { date: p.date, value: Math.round((sum / window.length) * 10) / 10 };
  });
}

/**
 * Откат весов на две недели назад после долгого перерыва.
 * Берём вес из последней сессии, которая была хотя бы на 14 дней раньше
 * последней. Если истории столько нет — снимаем две ступени.
 */
export async function rollbackTwoWeeks(): Promise<number> {
  const sessions = await db.sessions.where('status').equals('done').sortBy('startedAt');
  if (!sessions.length) return 0;

  const lastAt = Date.parse(sessions[sessions.length - 1].startedAt);
  const cutoff = lastAt - 14 * 86_400_000;
  const older = new Set(sessions.filter((s) => Date.parse(s.startedAt) <= cutoff).map((s) => s.id));

  const states = await db.exerciseState.toArray();
  const now = new Date().toISOString();
  let changed = 0;

  for (const state of states) {
    const ex = await db.exercises.get(state.exerciseId);
    if (!ex || !ex.autoProgress || ex.step === null || state.currentWeight <= 0) continue;

    const results = await db.exerciseResults.where('exerciseId').equals(state.exerciseId).toArray();
    const back = results.filter((r) => older.has(r.sessionId)).pop();

    const target = back
      ? back.weightUsed
      : Math.max(floorWeight(ex), state.currentWeight - 2 * ex.step);

    if (target >= state.currentWeight) continue;
    await db.exerciseState.put({
      ...state,
      currentWeight: target,
      nextTargetReps: state.nextTargetReps.map(() => ex.repRange?.[0] ?? 0),
      stallCount: 0,
      lastVolume: null,
      updatedAt: now,
    });
    changed++;
  }
  return changed;
}

/** Упражнения, которые можно снять при нехватке времени: с конца, кроме первых трёх. */
export function trimmable(exercises: Exercise[], fromIndex: number): Exercise[] {
  return exercises.slice(Math.max(3, fromIndex + 1));
}
