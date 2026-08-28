/* ============================================================
   Типы данных. Один пользователь, всё локально.
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

/* ---------- Настройки ---------- */

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
  /** Дата первой тренировки. От неё считается номер недели. */
  programStartedAt: string | null;
  /** Ручная правка номера недели (перебивает расчёт по дате). */
  weekOverride: number | null;
  /** Указатель очереди дней: дни идут по порядку, а не по календарю. */
  dayQueueIndex: number;
  /** Дата последней завершённой тренировки — для правила «перерыв > 10 дней». */
  lastSessionAt: string | null;
  /** Какой перерыв уже отработали, чтобы не спрашивать про него дважды. */
  breakAckAt: string | null;
  restSound: boolean;
  restVibrate: boolean;
  /** Разминка считается от рабочего веса, а не берётся из сида. */
  warmupFromWorkingWeight: boolean;
  createdAt: string;
}

/* ---------- Программа ---------- */

export interface ProgramDay {
  id: string;            // 'A' | 'B' | 'C' | 'D'
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
  date: string;  // YYYY-MM-DD
  kg: number;
}

export interface Measurement {
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
