import { MOVEMENTS, type LimitId, type Movement, type Pattern } from '../db/movements.ts';
import type { Exercise, ProgramDay, Profile } from '../db/types.ts';
import { estimateWeight } from './anthro.ts';

/**
 * Сборка программы под человека. Никакой случайности: одни и те же данные
 * дают одну и ту же программу, иначе её нельзя было бы проверить.
 */

interface Slot {
  pattern: Pattern;
  sets: number;
  /** Что делаем в паузах этого упражнения. */
  superset?: Pattern;
}

interface DayPlan {
  id: string;
  name: string;
  slots: Slot[];
}

/**
 * Каркасы по числу тренировок в неделю. Порядок слотов — это приоритет:
 * тяжёлое базовое сверху, добивка снизу, потому что при нехватке времени
 * приложение снимает упражнения с конца.
 */
const TEMPLATES: Record<number, DayPlan[]> = {
  2: [
    { id: 'A', name: 'Всё тело: толчок', slots: [
      { pattern: 'quad', sets: 4, superset: 'calf' },
      { pattern: 'push-h', sets: 4 },
      { pattern: 'pull-h', sets: 4, superset: 'rear-delt' },
      { pattern: 'hinge', sets: 3 },
      { pattern: 'lat-delt', sets: 3 },
      { pattern: 'biceps', sets: 3 },
    ] },
    { id: 'B', name: 'Всё тело: тяга', slots: [
      { pattern: 'hinge', sets: 4 },
      { pattern: 'push-v', sets: 4, superset: 'rear-delt' },
      { pattern: 'pull-v', sets: 4 },
      { pattern: 'squat', sets: 3, superset: 'calf' },
      { pattern: 'ham', sets: 3 },
      { pattern: 'triceps', sets: 3 },
    ] },
  ],
  3: [
    { id: 'A', name: 'Задняя цепь и грудь', slots: [
      { pattern: 'hinge', sets: 4, superset: 'calf' },
      { pattern: 'push-h', sets: 4 },
      { pattern: 'pull-h', sets: 4, superset: 'rear-delt' },
      { pattern: 'ham', sets: 3 },
      { pattern: 'lat-delt', sets: 4 },
      { pattern: 'biceps', sets: 3 },
      { pattern: 'forearm', sets: 4 },
    ] },
    { id: 'B', name: 'Ноги, плечи, спина', slots: [
      { pattern: 'quad', sets: 4, superset: 'calf' },
      { pattern: 'hinge', sets: 4 },
      { pattern: 'push-v', sets: 4, superset: 'rear-delt' },
      { pattern: 'pull-v', sets: 4 },
      { pattern: 'lat-delt', sets: 3 },
      { pattern: 'triceps', sets: 3 },
    ] },
    { id: 'C', name: 'Присед, грудь, верх спины', slots: [
      { pattern: 'squat', sets: 4, superset: 'lat-delt' },
      { pattern: 'push-h', sets: 4 },
      { pattern: 'pull-h', sets: 4, superset: 'rear-delt' },
      { pattern: 'lowback', sets: 3 },
      { pattern: 'trap', sets: 3 },
      { pattern: 'biceps', sets: 3 },
      { pattern: 'carry', sets: 2 },
    ] },
  ],
  4: [
    { id: 'A', name: 'Верх: жим', slots: [
      { pattern: 'push-h', sets: 4 },
      { pattern: 'pull-h', sets: 4, superset: 'rear-delt' },
      { pattern: 'push-v', sets: 3 },
      { pattern: 'lat-delt', sets: 4 },
      { pattern: 'triceps', sets: 3 },
    ] },
    { id: 'B', name: 'Низ: толчок', slots: [
      { pattern: 'quad', sets: 4, superset: 'calf' },
      { pattern: 'hinge', sets: 4 },
      { pattern: 'ham', sets: 3 },
      { pattern: 'lowback', sets: 3 },
    ] },
    { id: 'C', name: 'Верх: тяга', slots: [
      { pattern: 'pull-v', sets: 4 },
      { pattern: 'push-h', sets: 4 },
      { pattern: 'pull-h', sets: 3, superset: 'rear-delt' },
      { pattern: 'biceps', sets: 3 },
      { pattern: 'trap', sets: 3 },
    ] },
    { id: 'D', name: 'Низ: шарнир', slots: [
      { pattern: 'hinge', sets: 4 },
      { pattern: 'squat', sets: 4, superset: 'calf' },
      { pattern: 'ham', sets: 3 },
      { pattern: 'carry', sets: 2 },
    ] },
  ],
};

/** Движение подходит человеку: снаряд есть и здоровье не мешает. */
export function allowed(m: Movement, p: Profile): boolean {
  if (!p.equipment.includes(m.equipment)) return false;
  const limits = p.limits as LimitId[];
  return !(m.forbidden ?? []).some((f) => limits.includes(f));
}

function pick(pattern: Pattern, p: Profile, used: Set<string>, usedToday: Set<string>): Movement | null {
  const pool = MOVEMENTS.filter((m) => m.pattern === pattern && allowed(m, p));
  if (!pool.length) return null;
  return pool.find((m) => !used.has(m.id) && !usedToday.has(m.id))
    ?? pool.find((m) => !usedToday.has(m.id))
    ?? pool[0];
}

export interface GeneratedProgram {
  days: ProgramDay[];
  exercises: Exercise[];
  /** Слоты, которые нечем закрыть: нет снаряда или всё запрещено здоровьем. */
  gaps: Array<{ dayId: string; pattern: Pattern }>;
}

export function generateProgram(p: Profile): GeneratedProgram {
  const template = TEMPLATES[p.daysPerWeek] ?? TEMPLATES[3];
  const days: ProgramDay[] = [];
  const exercises: Exercise[] = [];
  const gaps: GeneratedProgram['gaps'] = [];
  const used = new Set<string>();

  template.forEach((day, dayIndex) => {
    days.push({
      id: day.id, name: day.name, weekdayHint: '', optional: false, order: dayIndex,
    });

    const usedToday = new Set<string>();
    let order = 0;

    for (const slot of day.slots) {
      const m = pick(slot.pattern, p, used, usedToday);
      if (!m) { gaps.push({ dayId: day.id, pattern: slot.pattern }); continue; }
      used.add(m.id);
      usedToday.add(m.id);

      const pairMove = slot.superset ? pick(slot.superset, p, new Set(), usedToday) : null;
      if (pairMove) usedToday.add(pairMove.id);

      exercises.push({
        id: `${day.id.toLowerCase()}${order + 1}-${m.id}`,
        dayId: day.id,
        order,
        catalogId: m.id,
        name: m.name,
        shortName: m.shortName,
        type: m.pattern === 'carry' ? 'distance' : 'reps',
        sets: slot.sets,
        repRange: m.pattern === 'carry' ? null : m.repRange,
        distance: m.pattern === 'carry' ? 40 : undefined,
        rest: m.rest,
        step: m.pattern === 'forearm' || m.pattern === 'carry' ? null : m.step,
        autoProgress: m.pattern !== 'forearm' && m.pattern !== 'carry',
        isNewPattern: false,
        startWeight: estimateWeight(m, p),
        note: m.note,
        conditional: m.id === 'pullup',
        superset: pairMove
          ? {
              name: pairMove.name,
              shortName: pairMove.shortName,
              catalogId: pairMove.id,
              sets: 3,
              repRange: pairMove.repRange,
              weight: estimateWeight(pairMove, p),
            }
          : undefined,
      });
      order++;
    }
  });

  return { days, exercises, gaps };
}
