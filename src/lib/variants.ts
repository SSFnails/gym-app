import { VARIANTS, type VariantDef } from '../db/catalog.ts';
import type { Exercise, ExerciseState } from '../db/types.ts';
import { roundToStep } from './progression.ts';

/** Все замены движения. Штанговые жимы помечены — их показываем, но запираем. */
export function variantsFor(ex: Exercise): VariantDef[] {
  return VARIANTS[ex.catalogId] ?? [];
}

export function activeVariant(ex: Exercise, state?: ExerciseState | null): VariantDef | null {
  if (!state?.variantId) return null;
  return variantsFor(ex).find((v) => v.id === state.variantId) ?? null;
}

/** Вес на другом снаряде: готовое значение либо текущий × ratio по шагу снаряда. */
export function convertWeight(weight: number, v: VariantDef): number {
  if (v.fixedWeight !== undefined) return v.fixedWeight;
  if (v.ratio === 0 || weight <= 0) return 0;
  const raw = weight * v.ratio;
  if (v.step <= 0) return Math.round(raw);
  return Math.max(v.step, roundToStep(raw, v.step));
}

/**
 * Упражнение с учётом выбранной замены. Именно им кормим показ и алгоритм:
 * повторы и число подходов остаются от исходного слота, меняются только
 * название и шаг снаряда. catalogId не трогаем — по нему ищется список замен.
 */
export function effective(ex: Exercise, state?: ExerciseState | null): Exercise {
  const v = activeVariant(ex, state);
  if (!v) return ex;
  // Заметку тоже подменяем: техника исходного движения к замене не относится.
  return { ...ex, name: v.name, shortName: v.shortName ?? v.name, step: v.step, note: v.note };
}
