import type { Exercise, ExerciseState, ProgramDay, Settings } from '../db/types.ts';

/** Дни, доступные сейчас: D участвует только если включён в настройках. */
export function activeDays(days: ProgramDay[], dayDEnabled: boolean): ProgramDay[] {
  return days
    .filter((d) => !d.optional || dayDEnabled)
    .sort((a, b) => a.order - b.order);
}

/**
 * Следующий день. Дни идут очередью A → B → C → (D) и по кругу,
 * к календарю не привязаны: пропустил вторник — в четверг всё равно A.
 */
export function nextDay(days: ProgramDay[], settings: Settings): ProgramDay | null {
  const queue = activeDays(days, settings.dayDEnabled);
  if (queue.length === 0) return null;
  return queue[settings.dayQueueIndex % queue.length];
}

/** Номер недели программы. Ручная правка в настройках перебивает расчёт по дате. */
export function weekNumber(settings: Settings, now = Date.now()): number {
  if (settings.weekOverride && settings.weekOverride > 0) return settings.weekOverride;
  if (!settings.programStartedAt) return 1;
  const days = Math.floor((now - Date.parse(settings.programStartedAt)) / 86_400_000);
  return Math.max(1, Math.floor(days / 7) + 1);
}

/** Каждая восьмая неделя — разгрузочная. */
export function isDeloadWeek(week: number): boolean {
  return week > 0 && week % 8 === 0;
}

/** Подходов на неделе разгрузки: пополам, вниз, но не меньше двух. */
export function deloadSets(sets: number): number {
  return Math.max(2, Math.floor(sets / 2));
}

/**
 * Рабочий вес на сегодня. У новых движений первые три недели вес
 * задан расписанием, алгоритм в это время молчит.
 */
export function plannedWeight(ex: Exercise, state: ExerciseState | undefined, week: number): number {
  // Расписание написано под исходный снаряд: после замены оно не применимо.
  if (ex.isNewPattern && ex.schedule && week <= 3 && !state?.variantId) {
    const scheduled = ex.schedule[week];
    if (typeof scheduled === 'number') return scheduled;
  }
  return state?.currentWeight ?? ex.startWeight ?? 0;
}

/** Целевые повторы на первый подход — то, что показываем в списке на главной. */
export function plannedReps(ex: Exercise, state: ExerciseState | undefined): number | null {
  if (!ex.repRange) return null;
  return state?.nextTargetReps?.[0] ?? ex.repRange[0];
}

/** Прикидка длительности: подходы плюс отдых между ними. */
export function estimateMinutes(exercises: Exercise[]): number {
  const seconds = exercises.reduce((sum, ex) => sum + ex.sets * (ex.rest + 45), 0);
  return Math.round(seconds / 60 / 5) * 5;
}

/** Сколько дней прошло с последней тренировки. */
export function daysSince(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.floor((now - Date.parse(iso)) / 86_400_000);
}

const PLURALS: Record<string, [string, string, string]> = {
  день: ['день', 'дня', 'дней'],
  подход: ['подход', 'подхода', 'подходов'],
  упражнение: ['упражнение', 'упражнения', 'упражнений'],
};

export function plural(n: number, key: keyof typeof PLURALS | string): string {
  const forms = PLURALS[key] ?? [key, key, key];
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return forms[0];
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return forms[1];
  return forms[2];
}
