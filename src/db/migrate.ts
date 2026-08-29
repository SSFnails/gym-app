import type {
  BodyWeight, LegacyDated, Measurement, ProgramProgress, Profile, Settings,
} from './types.ts';

/**
 * Переход на профили: у дневника появляется владелец.
 *
 * Это самое опасное место в приложении. База на телефоне — единственная
 * копия дневника, облака нет, и любая ошибка здесь необратима. Поэтому
 * правила такие:
 *
 * 1. Ничего не удаляется и не переименовывается. Ни строка, ни ключ.
 * 2. Первичные ключи не меняются: IndexedDB так не умеет, а Dexie на такой
 *    попытке роняет открытие базы целиком.
 * 3. Там, где старый ключ на двух профилях схлопнул бы записи (взвешивания
 *    и замеры лежали по одной дате), данные копируются в новую таблицу,
 *    а старая остаётся лежать как страховка.
 *
 * Вся логика ниже — чистые функции над обычными объектами, ровно чтобы
 * её можно было проверить тестом без браузера. Настоящая проверка на живой
 * базе — scripts/migration-check.mjs.
 */

/** Идентификатор владельца. Строка, а не uuid: она попадает в ключи и в глаза. */
export const OWNER_ID = 'owner';

/** Таблицы, которым достаточно проставить профиль на месте. */
export const STAMPED_TABLES = [
  'days', 'exercises', 'exerciseState', 'sessions', 'setLogs', 'exerciseResults',
] as const;

/**
 * Профиль владельца из известных данных.
 *
 * Стаж — «непрерывный», а не общий: он тренируется давно, но выходит из
 * длительной сушки, и коэффициенты в movements.ts откалиброваны именно
 * на такую цифру (см. generator.test.ts). Ставить сюда шесть лет нельзя —
 * расчёт перестанет воспроизводить его собственную программу.
 */
export function ownerProfile(createdAt: string): Profile {
  return {
    id: OWNER_ID,
    name: 'Марк',
    sex: 'm',
    birthYear: 2005,
    heightCm: 190,
    weightKg: 67,
    experienceYears: 2,
    goal: 'mass',
    daysPerWeek: 3,
    equipment: ['barbell', 'trapbar', 'ez', 'dumbbell', 'machine', 'cable', 'bodyweight'],
    limits: ['knee', 'wrist', 'lowback'],
    // Программа владельца выверена вживую, расчётной её подменять нельзя.
    source: 'seed',
    createdAt,
  };
}

/**
 * Проставляет профиль строке, у которой его нет. Возвращает новый объект
 * или тот же самый, если трогать нечего — по этому и видно, что миграция
 * идемпотентна и второй проход ничего не перепишет.
 */
export function stamp<T extends object>(row: T, profileId: string): T {
  const current = (row as { profileId?: unknown }).profileId;
  if (typeof current === 'string' && current) return row;
  return { ...row, profileId };
}

/** Дню дополнительно нужна буква для показа: ключ у новых профилей с приставкой. */
export function stampDay<T extends object>(row: T, profileId: string): T {
  const stamped = stamp(row, profileId) as T & { id?: unknown; letter?: unknown };
  if (typeof stamped.letter === 'string' && stamped.letter) return stamped;
  return { ...stamped, letter: String((stamped as { id?: unknown }).id ?? '') };
}

/**
 * Копия взвешиваний в таблицу с ключом «профиль + дата».
 * Строки без даты пропускаем: ключа у них всё равно нет.
 */
export function carryWeights(rows: LegacyDated[], profileId: string): BodyWeight[] {
  return rows
    .filter((r) => typeof r.date === 'string' && r.date)
    .map((r) => ({ ...r, profileId, date: r.date, kg: Number(r.kg) } as BodyWeight));
}

/** То же для замеров: поля переносятся как есть, ничего не пересчитывается. */
export function carryMeasurements(rows: LegacyDated[], profileId: string): Measurement[] {
  return rows
    .filter((r) => typeof r.date === 'string' && r.date)
    .map((r) => ({ ...r, profileId, date: r.date } as unknown as Measurement));
}

/**
 * Ход программы переезжает из настроек в свою строку: номер недели и очередь
 * дней — личный счёт человека, и второй профиль не должен его сдвигать.
 * В настройках поля остаются лежать нетронутыми.
 */
export function carryProgress(settings: Settings | undefined, profileId: string): ProgramProgress {
  return {
    profileId,
    dayQueueIndex: settings?.dayQueueIndex ?? 0,
    programStartedAt: settings?.programStartedAt ?? null,
    weekOverride: settings?.weekOverride ?? null,
    lastSessionAt: settings?.lastSessionAt ?? null,
    breakAckAt: settings?.breakAckAt ?? null,
  };
}

/** Настройки узнают, чей дневник открыт. Остальное в них не трогаем. */
export function withActiveProfile(settings: Settings, profileId: string): Settings {
  if (settings.activeProfileId) return settings;
  return { ...settings, activeProfileId: profileId };
}

/**
 * Была ли база вообще обжита. Пустую (человек открыл приложение и закрыл)
 * незачем отдавать владельцу — пусть заведёт свой профиль.
 */
export function hasOwnerData(counts: Record<string, number>): boolean {
  return STAMPED_TABLES.some((name) => (counts[name] ?? 0) > 0)
    || (counts.bodyWeight ?? 0) > 0
    || (counts.measurements ?? 0) > 0;
}
