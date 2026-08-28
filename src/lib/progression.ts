import type { Exercise, ExerciseState, Outcome } from '../db/types.ts';

/**
 * Ядро приложения: что ставить на следующую сессию.
 * Считает только по факту прошлой — никакой магии и никаких скрытых поправок.
 */

export interface SetResult {
  reps: number;
  /** Сколько повторов ещё мог. Без него прибавка невозможна. */
  rir: number | null;
}

export interface Plan {
  outcome: Outcome;
  /** Человеческая формулировка для экрана итога. */
  reason: string;
  nextWeight: number;
  nextTargetReps: number[];
  stallCount: number;
  /** Показать баннер «застой» и предложить сброс на −10%. */
  stalled: boolean;
  volume: number;
}

/**
 * Нижняя граница веса — одна ступень снаряда.
 *
 * Раньше полом был стартовый вес, но это делало откат бессмысленным:
 * на первой сессии текущий вес равен стартовому, и «вес взят рано»
 * не мог ничего снизить. Стартовый вес — всего лишь догадка, запирать
 * себя в ней нельзя. В ноль и в минус при этом не уходим.
 */
export function floorWeight(ex: Exercise): number {
  return ex.step ?? 0;
}

/** Округление к сетке шага снаряда — чтобы не появлялось 47,3 кг. */
export function roundToStep(weight: number, step: number): number {
  if (step <= 0) return weight;
  return Math.round((Math.round(weight / step) * step) * 100) / 100;
}

/**
 * Сброс при застое: минус 10%, положенные на сетку шага.
 * Округляем к ближайшему, а не вниз: на грубой сетке (шаг 2,5 при 52,5 кг)
 * округление вниз срезало бы 14% вместо десяти. Если после округления вес
 * не изменился — снимаем ровно одну ступень, иначе сброса не произойдёт.
 */
export function resetTenPercent(weight: number, step: number, floor = 0): number {
  if (step <= 0) return Math.max(floor, weight * 0.9);
  let next = roundToStep(weight * 0.9, step);
  if (next >= weight) next = roundToStep(weight - step, step);
  return Math.max(floor, next);
}

const fill = (n: number, value: number) => Array.from({ length: n }, () => value);

/**
 * План на следующую сессию.
 *
 * @param week номер недели, на которую планируем (не той, что прошла).
 */
export function planNext(
  ex: Exercise,
  state: ExerciseState,
  results: SetResult[],
  week: number,
): Plan {
  const volume = results.reduce((sum, r) => sum + r.reps, 0);
  const keepStall = state.stallCount;

  // Вне алгоритма: запястья (это лечение) и фермерская прогулка (нет повторов).
  if (!ex.autoProgress || !ex.repRange || ex.step === null) {
    return {
      outcome: 'manual',
      reason: 'Вне автопрогрессии — вес правится руками',
      nextWeight: state.currentWeight,
      nextTargetReps: state.nextTargetReps,
      stallCount: 0,
      stalled: false,
      volume,
    };
  }

  const [min, max] = ex.repRange;
  const step = ex.step;
  const sets = results.length || ex.sets;

  const overshot = results.some((r) => r.reps > max);
  const allMaxed = results.length > 0 && results.every((r) => r.reps >= max);
  const lastRir = results.length ? results[results.length - 1].rir : null;
  const belowMin = results.filter((r) => r.reps < min).length;

  // Новые движения: первые три недели вес задан расписанием, алгоритм молчит —
  // там растёт техника, а не сила. Исключение — если диапазон проскочили,
  // прибавку разрешаем сразу, не дожидаясь конца расписания.
  if (ex.isNewPattern && ex.schedule && week <= 3) {
    const scheduled = ex.schedule[week] ?? state.currentWeight;
    const nextWeight = overshot
      ? Math.max(scheduled, roundToStep(state.currentWeight + step, step))
      : scheduled;
    return {
      outcome: overshot ? 'up' : 'fixed',
      reason: overshot
        ? 'Проскочил диапазон — прибавка досрочно'
        : 'Вес по расписанию: первые три недели ставим технику',
      nextWeight,
      nextTargetReps: fill(sets, min),
      stallCount: 0,
      stalled: false,
      volume,
    };
  }

  // Прибавка: все подходы добрали верх диапазона и в последнем остался запас.
  if (overshot || (allMaxed && lastRir !== null && lastRir <= 2)) {
    return {
      outcome: 'up',
      reason: overshot ? 'Проскочил диапазон — прибавка' : 'Диапазон закрыт с запасом — прибавка',
      nextWeight: roundToStep(state.currentWeight + step, step),
      nextTargetReps: fill(sets, min),
      stallCount: 0,
      stalled: false,
      volume,
    };
  }

  // Откат: в двух и более подходах не добрал нижнюю границу.
  // Со своим весом (подтягивания без довеска) снимать нечего —
  // там прогрессия идёт повторами, а не килограммами.
  if (belowMin >= 2 && state.currentWeight > 0) {
    return {
      outcome: 'down',
      reason: 'Вес взят рано — откат на ступень',
      nextWeight: Math.max(floorWeight(ex), roundToStep(state.currentWeight - step, step)),
      nextTargetReps: fill(sets, min),
      stallCount: 0,
      stalled: false,
      volume,
    };
  }

  // Тот же вес, целевые повторы по каждому подходу +1 до верха диапазона.
  // Застой считаем только здесь: после прибавки повторы падают к min
  // по построению, и объём обязан просесть — это не застой.
  const grew = state.lastVolume === null || volume > state.lastVolume;
  const stallCount = grew ? 0 : keepStall + 1;

  return {
    outcome: 'hold',
    reason: lastRir === null
      ? 'Нет запаса — прибавку не считаем'
      : 'Тот же вес, добираем повторы',
    nextWeight: state.currentWeight,
    nextTargetReps: results.map((r) => Math.min(r.reps + 1, max)),
    stallCount,
    stalled: stallCount >= 2,
    volume,
  };
}

/** Тоннаж подхода. Для дистанции считаем вес × метры / 100, чтобы не давить график. */
export function setTonnage(weight: number, reps: number): number {
  return weight * reps;
}
