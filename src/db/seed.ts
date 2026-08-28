import type { Exercise, ProgramDay } from './types.ts';

/**
 * Программа из спецификации, один в один. Список закрытый — упражнения
 * отсюда не добавляются и не выдумываются.
 *
 * autoProgress: false там, где алгоритм прогрессии неприменим —
 * сгибания запястий (это лечение, не тренировка) и фермерская прогулка
 * (ходьба на дистанцию, у неё нет диапазона повторов).
 */

type Seed = Omit<Exercise, 'dayId' | 'order'>;

export const DAYS: ProgramDay[] = [
  { id: 'A', name: 'Задняя цепь и грудь',   weekdayHint: 'вторник',     optional: false, order: 0 },
  { id: 'B', name: 'Ноги, плечи, спина',    weekdayHint: 'четверг',     optional: false, order: 1 },
  { id: 'C', name: 'Присед, грудь, верх спины', weekdayHint: 'воскресенье', optional: false, order: 2 },
  { id: 'D', name: 'Визуал',                weekdayHint: 'суббота',     optional: true,  order: 3 },
];

export const GENERAL_WARMUP = [
  '3 мин велотренажёр или дорожка в горку',
  'Разведение резины перед собой — 2×15',
  'Ягодичный мостик — 15',
  'Сгибание ног очень лёгкое 1×20 — обязательно в дни B и C',
  'Круги запястьями + растяжка сгибателей — 30 с на руку',
];

/** Разминка в днях B и C, которую нельзя отметить пропущенной без подтверждения. */
export const MANDATORY_WARMUP_INDEX = 3;

const A: Seed[] = [
  {
    id: 'a1-deadlift-trap', catalogId: 'deadlift-trap', name: 'Становая с трэп-бара',
    type: 'reps', sets: 4, repRange: [5, 7], rest: 180, step: 5,
    autoProgress: true, isNewPattern: true, schedule: { 1: 50, 2: 60, 3: 70 },
    warmupSeed: ['20x8', '40x5', '50x3'],
    note: 'Нет трэп-бара — становая с гантелями по бокам. Классику не берём, поясница.',
    superset: { name: 'Подъём на носки стоя', catalogId: 'calf-standing', sets: 3, repRange: [12, 15], weight: 50 },
  },
  {
    id: 'a2-db-bench', catalogId: 'db-bench', name: 'Жим гантелей лёжа, полунейтральный', shortName: 'Жим гантелей лёжа',
    type: 'reps', sets: 4, repRange: [8, 10], rest: 150, step: 2,
    autoProgress: true, isNewPattern: false, startWeight: 26,
    warmupSeed: ['14x8', '20x5'],
    note: 'Закидывание без напарника: гантели вертикально на бёдра у коленей, резко откинуться назад, вытолкнуть коленями по одной.',
  },
  {
    id: 'a3-bb-row', catalogId: 'bb-row', name: 'Тяга штанги в наклоне',
    type: 'reps', sets: 4, repRange: [8, 10], rest: 120, step: 2.5,
    autoProgress: true, isNewPattern: true, schedule: { 1: 40, 2: 45, 3: 50 },
    warmupSeed: ['20x8', '35x5'],
    note: 'Корпус 45°, штанга к низу живота, поясница прогнута.',
    superset: { name: 'Задняя дельта в тренажёре', catalogId: 'rear-delt-machine', sets: 3, repRange: [15, 20], weight: 25 },
  },
  {
    id: 'a4-leg-curl', catalogId: 'leg-curl', name: 'Сгибание ног лёжа',
    type: 'reps', sets: 3, repRange: [10, 12], rest: 90, step: 2.5,
    autoProgress: true, isNewPattern: false, startWeight: 25,
  },
  {
    id: 'a5-lat-raise', catalogId: 'lat-raise', name: 'Махи гантелей в стороны', shortName: 'Махи в стороны',
    type: 'reps', sets: 4, repRange: [12, 15], rest: 60, step: 2,
    autoProgress: true, isNewPattern: false, startWeight: 8,
    note: 'Локоть ведёт, кисть ниже локтя, без заброса корпусом.',
  },
  {
    id: 'a6-hammer-curl', catalogId: 'hammer-curl', name: 'Молотковые сгибания',
    type: 'reps', sets: 3, repRange: [10, 12], rest: 75, step: 2,
    autoProgress: true, isNewPattern: false, startWeight: 10,
  },
  {
    id: 'a7-wrist', catalogId: 'wrist-curl', name: 'Сгибания запястий + обратные', shortName: 'Сгибания запястий',
    type: 'reps', sets: 4, repRange: [15, 15], rest: 45, step: null,
    autoProgress: false, isNewPattern: false, startWeight: 5,
    note: 'Лёгкие. Это лечение, не тренировка.',
  },
];

const B: Seed[] = [
  {
    id: 'b1-leg-press', catalogId: 'leg-press', name: 'Жим ногами, средняя постановка', shortName: 'Жим ногами',
    type: 'reps', sets: 4, repRange: [10, 12], rest: 150, step: 5,
    autoProgress: true, isNewPattern: false, startWeight: 110,
    warmupSeed: ['60x10', '90x6'],
    note: 'Глубина до 90° в колене, не глубже. Поясницу от спинки не отрывать.',
    superset: { name: 'Подъём на носки сидя', catalogId: 'calf-seated', sets: 3, repRange: [15, 15], weight: 30 },
  },
  {
    id: 'b2-rdl', catalogId: 'rdl', name: 'Румынская тяга со штангой',
    type: 'reps', sets: 4, repRange: [8, 10], rest: 150, step: 5,
    autoProgress: true, isNewPattern: true, schedule: { 1: 40, 2: 45, 3: 50 },
    warmupSeed: ['20x10', '30x6'],
    note: 'Таз назад, колени мягкие, штанга по бедру. Опускать до натяжения под ягодицей.',
  },
  {
    id: 'b3-db-press', catalogId: 'db-shoulder-press', name: 'Жим гантелей сидя, нейтральный хват', shortName: 'Жим гантелей сидя',
    type: 'reps', sets: 4, repRange: [8, 10], rest: 150, step: 2,
    autoProgress: true, isNewPattern: false, startWeight: 16,
    warmupSeed: ['8x10', '12x6'],
    superset: { name: 'Тяга к лицу', catalogId: 'face-pull', sets: 3, repRange: [15, 20], weight: 15 },
  },
  {
    id: 'b4-pullup', catalogId: 'pullup', name: 'Подтягивания или тяга верхнего блока', shortName: 'Подтягивания',
    type: 'reps', sets: 4, repRange: [8, 10], rest: 120, step: 2.5,
    autoProgress: true, isNewPattern: false, conditional: true,
    note: 'Первая сессия — тест максимума. 5 и больше: работать подтягиваниями по (максимум−1), потом с весом на поясе. Меньше 5: тяга верхнего блока, старт 55 кг.',
    superset: { name: 'Сведения в кроссовере', catalogId: 'cable-fly', sets: 3, repRange: [12, 15], weight: 50 },
  },
  {
    id: 'b5-lat-raise', catalogId: 'lat-raise', name: 'Махи гантелей в стороны', shortName: 'Махи в стороны',
    type: 'reps', sets: 3, repRange: [15, 15], rest: 60, step: 2,
    autoProgress: true, isNewPattern: false, startWeight: 8,
  },
  {
    id: 'b6-triceps-rope', catalogId: 'triceps-rope', name: 'Разгибания на блоке, канат', shortName: 'Разгибания на канате',
    type: 'reps', sets: 3, repRange: [12, 15], rest: 75, step: 2.5,
    autoProgress: true, isNewPattern: false, startWeight: 20,
  },
];

const C: Seed[] = [
  {
    id: 'c1-box-squat', catalogId: 'box-squat', name: 'Присед со штангой до ящика', shortName: 'Присед до ящика',
    type: 'reps', sets: 4, repRange: [6, 8], rest: 180, step: 5,
    autoProgress: true, isNewPattern: true, schedule: { 1: 20, 2: 30, 3: 40 },
    warmupSeed: ['20x10', '30x5'],
    note: 'Ящик до параллели бедра. Садиться контролируемо. Хват максимально широкий, большие пальцы поверх грифа.',
    superset: { name: 'Махи гантелей в стороны', shortName: 'Махи в стороны', catalogId: 'lat-raise', sets: 3, repRange: [15, 15], weight: 8 },
  },
  {
    id: 'c2-incline-db', catalogId: 'incline-db-press', name: 'Жим гантелей на наклонной 30°', shortName: 'Жим на наклонной 30°',
    type: 'reps', sets: 4, repRange: [8, 10], rest: 150, step: 2,
    autoProgress: true, isNewPattern: false, startWeight: 22,
    warmupSeed: ['12x8', '16x5'],
  },
  {
    id: 'c3-seated-row', catalogId: 'seated-row', name: 'Тяга горизонтального блока, нейтральная рукоять', shortName: 'Тяга горизонт. блока',
    type: 'reps', sets: 4, repRange: [10, 12], rest: 120, step: 2.5,
    autoProgress: true, isNewPattern: false, startWeight: 55,
    note: 'Пауза секунду в сокращении, лопатки свести.',
    superset: { name: 'Разведение гантелей в наклоне', shortName: 'Разведение в наклоне', catalogId: 'rear-delt-db', sets: 3, repRange: [15, 20], weight: 6 },
  },
  {
    id: 'c4-hyper', catalogId: 'hyperextension', name: 'Гиперэкстензия с весом',
    type: 'reps', sets: 3, repRange: [12, 15], rest: 90, step: 5,
    autoProgress: true, isNewPattern: false, startWeight: 10,
  },
  {
    id: 'c5-shrug', catalogId: 'shrug', name: 'Шраги с гантелями',
    type: 'reps', sets: 3, repRange: [12, 15], rest: 90, step: 2,
    autoProgress: true, isNewPattern: false, startWeight: 30,
    note: 'Пауза секунду вверху. Плечи вертикально к ушам, без кругов.',
  },
  {
    id: 'c6-ez-curl', catalogId: 'ez-curl', name: 'Сгибания с EZ-грифом',
    type: 'reps', sets: 3, repRange: [10, 12], rest: 75, step: 2.5,
    autoProgress: true, isNewPattern: false, startWeight: 25,
  },
  {
    id: 'c7-farmer', catalogId: 'farmer-walk', name: 'Фермерская прогулка',
    type: 'distance', sets: 2, repRange: null, distance: 40, rest: 90, step: null,
    autoProgress: false, isNewPattern: false, startWeight: 30,
  },
];

const D: Seed[] = [
  { id: 'd1-lat-pulldown', catalogId: 'lat-pulldown', name: 'Тяга верхнего блока широким хватом', shortName: 'Тяга верхнего блока',
    type: 'reps', sets: 4, repRange: [10, 12], rest: 120, step: 2.5, autoProgress: true, isNewPattern: false, startWeight: 50 },
  { id: 'd2-lat-raise', catalogId: 'lat-raise', name: 'Махи гантелей в стороны', shortName: 'Махи в стороны',
    type: 'reps', sets: 4, repRange: [12, 15], rest: 60, step: 2, autoProgress: true, isNewPattern: false, startWeight: 8 },
  { id: 'd3-rear-delt', catalogId: 'rear-delt-machine', name: 'Задняя дельта в тренажёре',
    type: 'reps', sets: 4, repRange: [15, 20], rest: 60, step: 2.5, autoProgress: true, isNewPattern: false, startWeight: 25 },
  { id: 'd4-shrug', catalogId: 'shrug', name: 'Шраги с гантелями',
    type: 'reps', sets: 3, repRange: [15, 15], rest: 75, step: 2, autoProgress: true, isNewPattern: false, startWeight: 30 },
  { id: 'd5-ez-curl', catalogId: 'ez-curl', name: 'Сгибания с EZ-грифом',
    type: 'reps', sets: 3, repRange: [10, 12], rest: 75, step: 2.5, autoProgress: true, isNewPattern: false, startWeight: 25 },
  { id: 'd6-french-press', catalogId: 'french-press', name: 'Французский жим гантелью из-за головы', shortName: 'Французский жим',
    type: 'reps', sets: 3, repRange: [12, 12], rest: 75, step: 2, autoProgress: true, isNewPattern: false, startWeight: 12 },
];

const BY_DAY: Record<string, Seed[]> = { A, B, C, D };

/** Разворачивает сид в плоский список упражнений с днём и приоритетом. */
export function buildExercises(): Exercise[] {
  const out: Exercise[] = [];
  for (const day of DAYS) {
    BY_DAY[day.id].forEach((seed, index) => {
      out.push({ ...seed, dayId: day.id, order: index });
    });
  }
  return out;
}

/** Стартовый вес: у новых движений он задан расписанием первых трёх недель. */
export function initialWeight(ex: Exercise): number {
  if (ex.isNewPattern && ex.schedule) return ex.schedule[1] ?? 0;
  return ex.startWeight ?? 0;
}

/** Стартовые целевые повторы: нижняя граница диапазона на каждый подход. */
export function initialTargetReps(ex: Exercise): number[] {
  if (!ex.repRange) return [];
  return Array.from({ length: ex.sets }, () => ex.repRange![0]);
}
