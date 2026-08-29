/* ============================================================
   Типы данных. Несколько профилей, всё локально.

   Личные таблицы помечены profileId: тренировки, состояния упражнений,
   вес тела и замеры принадлежат конкретному человеку. Программа тоже
   профильная — у разных людей разные дни и упражнения.
   ============================================================ */

/** Обычное упражнение на повторы или ходьба на дистанцию (фермерская). */
export type ExerciseType = 'reps' | 'distance';

/** Весовая шкала снаряда. Нужна для пересчёта веса при замене упражнения. */
export type Equipment =
  | 'barbell' | 'trapbar' | 'ez' | 'dumbbell'
  | 'machine' | 'cable' | 'bodyweight';

/** Чем закончилось упражнение и что алгоритм ставит на следующий раз. */
export type Outcome =
  | 'up'       // прибавка
  | 'hold'     // тот же вес, целевые повторы +1
  | 'down'     // откат: вес взят рано
  | 'deload'   // неделя разгрузки
  | 'fixed'    // вес задан расписанием (первые 3 недели новых движений)
  | 'manual'   // вне автопрогрессии (запястья, фермерская, суперсеты)
  | 'skipped';

export type SkipReason = 'no-energy' | 'busy' | 'pain' | 'no-time';

/** Насколько допустим читинг в упражнении. */
export type CheatPolicy = 'strict' | 'slight' | 'allowed';

export type RepRange = [number, number];

/* ---------- Профиль ---------- */

export type Sex = 'm' | 'f';
export type Goal = 'mass' | 'strength' | 'lean';

export interface Profile {
  id: string;
  name: string;
  sex: Sex;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  /** Стаж в годах — он влияет на расчёт сильнее роста и веса вместе взятых. */
  experienceYears: number;
  goal: Goal;
  /** Сколько тренировок в неделю: 2, 3 или 4. */
  daysPerWeek: number;
  /** Что есть в зале. */
  equipment: Equipment[];
  /** Ограничения по здоровью — закрывают часть движений. */
  limits: string[];
  /** Программа собрана генератором или взята из готового сида. */
  source: 'generated' | 'seed';
  createdAt: string;
}

/** Пол и стаж влияют на расчёт, поэтому валидацию держим рядом с типом. */
export const PROFILE_LIMITS = {
  heightCm: [120, 230],
  weightKg: [30, 200],
  experienceYears: [0, 40],
} as const;

/* ---------- Ход программы ---------- */

/**
 * Где человек находится в своей программе. Отдельно от настроек и по строке
 * на профиль: номер недели и очередь дней — это его личный счёт, и гость,
 * потренировавшийся на том же телефоне, не должен его сдвигать.
 */
export interface ProgramProgress {
  profileId: string;
  /** Указатель очереди дней: дни идут по порядку, а не по календарю. */
  dayQueueIndex: number;
  /** Дата первой тренировки. От неё считается номер недели. */
  programStartedAt: string | null;
  /** Ручная правка номера недели (перебивает расчёт по дате). */
  weekOverride: number | null;
  /** Дата последней завершённой тренировки — для правила «перерыв > 10 дней». */
  lastSessionAt: string | null;
  /** Какой перерыв уже отработали, чтобы не спрашивать про него дважды. */
  breakAckAt: string | null;
}

/* ---------- Настройки ---------- */

/**
 * Настройки телефона и общие переключатели. Личный счёт человека сюда
 * не входит — он в ProgramProgress. Поля хода программы остались в строке
 * от схемы 4: они скопированы, но не удалены, чтобы старую базу можно
 * было прочитать руками, если что-то пойдёт не так.
 */
export interface Settings {
  id: 1;
  /** Чей дневник открыт сейчас. */
  activeProfileId: string | null;
  /** Штанга в жимах. По умолчанию выключено — болит запястье. */
  allowBarbellPress: boolean;
  /** Опциональный день D. */
  dayDEnabled: boolean;
  /** Связки в паузах. Выключишь — суперсеты исчезнут из всех дней. */
  supersetsEnabled: boolean;
  /* Ниже — след схемы 4. Ход программы теперь в ProgramProgress,
     эти поля остались как страховка и в расчётах не участвуют. */
  programStartedAt: string | null;
  weekOverride: number | null;
  dayQueueIndex: number;
  lastSessionAt: string | null;
  breakAckAt: string | null;
  restSound: boolean;
  restVibrate: boolean;
  /** Разминка считается от рабочего веса, а не берётся из сида. */
  warmupFromWorkingWeight: boolean;
  createdAt: string;
}

/* ---------- Программа ---------- */

export interface ProgramDay {
  /**
   * Ключ строки. У владельца это буква ('A'), у профилей, созданных позже, —
   * буква с приставкой профиля: ключи в базе общие для всех, а день A есть
   * у каждого. Существующие строки не переименовываются никогда.
   */
  id: string;
  /**
   * Чей это день. Необязательное поле, и намеренно: сид и генератор делают
   * заготовку программы, ничего не зная ни про профили, ни про базу.
   * Профиль приписывает слой хранения (scopeProgram в db/init.ts),
   * поэтому в самой базе поле есть у каждой строки.
   */
  profileId?: string;
  /** Буква для показа: A, B, C, D. У старых строк её нет — там id и есть буква. */
  letter?: string;
  name: string;
  weekdayHint: string;   // подпись, на логику не влияет
  optional: boolean;
  order: number;
}

export interface SupersetSpec {
  name: string;
  shortName?: string;
  catalogId: string;
  sets: number;
  repRange: RepRange;
  weight: number;
}

export interface Exercise {
  id: string;
  /** Как и у дня: заготовка приходит без профиля, приписывает хранение. */
  profileId?: string;
  dayId: string;
  /** Приоритет внутри дня. Первые три при «мало времени» не убираются. */
  order: number;
  catalogId: string;
  name: string;
  /** Укороченное имя для списков, где полное не помещается. */
  shortName?: string;
  type: ExerciseType;
  sets: number;
  repRange: RepRange | null;
  distance?: number;     // метров, для type='distance'
  rest: number;          // секунд
  step: number | null;   // шаг прибавки, null = вне автопрогрессии
  /** false — вес правится руками (запястья, фермерская прогулка). */
  autoProgress: boolean;
  /** Первые 3 недели вес берётся из schedule, алгоритм молчит. */
  isNewPattern: boolean;
  schedule?: Record<string, number>;
  warmupSeed?: string[];
  note?: string;
  /** Подтягивания: первая сессия — тест максимума, потом ветвление. */
  conditional?: boolean;
  startWeight?: number;
  superset?: SupersetSpec;
}

/** Живое состояние упражнения: что алгоритм поставил на следующий раз. */
export interface ExerciseState {
  exerciseId: string;
  profileId: string;
  currentWeight: number;
  nextTargetReps: number[];
  /** Сколько сессий подряд сумма повторов не растёт. 2 → баннер застоя. */
  stallCount: number;
  /** Сумма повторов прошлой сессии. */
  lastVolume: number | null;
  lastOutcome: Outcome | null;
  sessionsDone: number;
  /** Выбранная замена упражнения из каталога (null — базовое). */
  variantId: string | null;
  /** Вес базового движения до замены — чтобы вернуться точно, а не пересчётом. */
  preVariantWeight?: number;
  /** Подтягивания: чем всё кончилось после теста максимума. */
  resolvedConditional?: 'pullups' | 'lat-pulldown';
  /** Личный рекорд подтягиваний из теста. */
  pullupMax?: number;
  supersetWeight?: number;
  updatedAt: string;
}

/* ---------- Тренировки ---------- */

export interface Session {
  id: string;
  profileId: string;
  dayId: string;
  weekNumber: number;
  isDeload: boolean;
  startedAt: string;
  finishedAt: string | null;
  tonnage: number;
  durationSec: number;
  status: 'active' | 'done' | 'abandoned';
}

export interface SetLog {
  /** `<сессия>:<упражнение>:<вид>:<номер>` — put по нему перезаписывает, а не плодит. */
  id: string;
  profileId: string;
  sessionId: string;
  exerciseId: string;
  index: number;
  kind: 'warmup' | 'work' | 'superset';
  targetWeight: number;
  targetReps: number;
  weight: number | null;
  reps: number | null;
  /** Запас: 0 / 1 / 2 / 3 (3 = «3+»). Обязателен для рабочих подходов. */
  rir: number | null;
  done: boolean;
  at: string | null;
}

export interface ExerciseResult {
  id?: number;
  profileId: string;
  sessionId: string;
  exerciseId: string;
  outcome: Outcome;
  /** Человеческая формулировка: «прибавка», «вес взят рано», … */
  reason: string;
  weightUsed: number;
  volume: number;
  nextWeight: number;
  nextTargetReps: number[];
  skipReason?: SkipReason;
}

/* ---------- Тело ---------- */

export interface BodyWeight {
  profileId: string;
  date: string;  // YYYY-MM-DD
  kg: number;
}

export interface Measurement {
  profileId: string;
  date: string;
  chest: number | null;
  waist: number | null;
  thigh: number | null;
  arm: number | null;
  neck: number | null;
}

/* ---------- Каталог упражнений: техника и замены ---------- */

/** Замена упражнения с пересчётом веса. */
export interface Variant {
  catalogId: string;
  /** Множитель к рабочему весу: новый вес = текущий × ratio. */
  ratio: number;
  note: string;
  /** Требует включённого тумблера «штанга в жимах». */
  requiresBarbellPress?: boolean;
}

export interface CatalogEntry {
  id: string;
  name: string;
  equipment: Equipment;
  /** Ключ встроенной SVG-схемы. */
  illustration: string;
  setup: string[];
  execution: string[];
  mistakes: string[];
  cheat: CheatPolicy;
  cheatNote?: string;
  variants: Variant[];
}

/** Своё фото техники, подгруженное из галереи. */
export interface Photo {
  id?: number;
  catalogId: string;
  blob: Blob;
  addedAt: string;
}

/* ---------- Служебное ---------- */

export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * Строка старых таблиц взвешиваний и замеров из схемы 4: ключ там был
 * одна дата, а на двух профилях такой ключ схлопывает записи. Данные
 * скопированы в weightLog и girthLog, а сами таблицы оставлены лежать —
 * это единственная копия дневника, удалять её ради чистоты не стоит.
 */
export interface LegacyDated {
  date: string;
  [key: string]: unknown;
}
