import type { Movement, Pattern } from '../db/movements.ts';
import type { Profile, Sex } from '../db/types.ts';

/**
 * Расчёт стартовых весов по данным человека.
 *
 * Честно про точность: рост и вес предсказывают силу слабо, решает стаж.
 * Поэтому числа здесь — первая прикидка, а не диагноз. Коэффициенты
 * в movements.ts откалиброваны по реальной программе владельца, то есть
 * по консервативным стартовым весам, и специально занижены: ошибиться
 * вниз дёшево, вверх — травма. Дальше вес доводит алгоритм прогрессии,
 * а на первой сессии он двигается двойным шагом (см. progression.ts).
 */

const REF_HEIGHT: Record<Sex, number> = { m: 175, f: 165 };

const PUSH = new Set<Pattern>(['push-h', 'push-v', 'triceps']);
const PULL = new Set<Pattern>(['hinge', 'pull-h', 'pull-v', 'trap']);
const LOWER = new Set<Pattern>(['squat', 'quad', 'ham', 'calf', 'hinge', 'lowback']);

/** Минимум, ниже которого снаряд просто не существует. */
const FLOOR: Partial<Record<Movement['equipment'], number>> = {
  barbell: 20, trapbar: 25, ez: 10, dumbbell: 2,
};

/** Стаж решает больше всего остального. */
export function experienceFactor(years: number): number {
  if (years < 0.5) return 0.6;
  if (years < 1) return 0.72;
  if (years < 3) return 1.0;
  return 1.18;
}

/**
 * Разница по полу в верхе тела заметно больше, чем в низе —
 * это устойчивый факт, а не осторожность.
 */
export function sexFactor(m: Movement, sex: Sex): number {
  if (sex === 'm') return 1;
  return LOWER.has(m.pattern) ? 0.8 : 0.65;
}

export function ageFactor(age: number): number {
  if (age <= 35) return 1;
  return Math.max(0.7, 1 - (age - 35) * 0.006);
}

/**
 * Рычаги. Чем выше человек, тем длиннее амплитуда в жимах — они идут тяжелее,
 * а тяги наоборот чуть легче. Это ровно то, что владелец описал про себя:
 * «длинные конечности, жимы растут медленно, тяги быстро».
 */
export function heightFactor(m: Movement, p: Profile): number {
  const delta = p.heightCm - REF_HEIGHT[p.sex];
  const k = PUSH.has(m.pattern) ? -0.006
    : (m.pattern === 'squat' || m.pattern === 'quad') ? -0.004
    : PULL.has(m.pattern) ? 0.003
    : 0;
  return 1 + k * delta;
}

const round = (value: number, step: number) =>
  step > 0 ? Math.round(value / step) * step : Math.round(value);

/** Стартовый рабочий вес движения для этого человека. */
export function estimateWeight(m: Movement, p: Profile): number {
  if (m.unit === 'bodyweight') return 0;

  const age = new Date().getFullYear() - p.birthYear;
  const raw = m.bwFactor * p.weightKg
    * experienceFactor(p.experienceYears)
    * sexFactor(m, p.sex)
    * ageFactor(age)
    * heightFactor(m, p);

  const floor = FLOOR[m.equipment] ?? m.step;
  return Math.max(floor, round(raw, m.step));
}

/** Насколько расчёт вообще заслуживает доверия — говорим это вслух. */
export function confidence(p: Profile): 'low' | 'medium' {
  return p.experienceYears < 1 ? 'low' : 'medium';
}
