import type { Equipment, RepRange } from './types.ts';

/**
 * Пул движений для сборки программы под человека.
 *
 * bwFactor — рабочий вес на нижнюю границу диапазона как доля массы тела
 * для мужчины со средним ростом и средним стажем. Числа не выдуманы:
 * они откалиброваны по программе владельца (67 кг, 190 см), поэтому для
 * его профиля генератор воспроизводит его же веса. Для остальных они
 * масштабируются, см. src/lib/anthro.ts.
 */

export type Pattern =
  | 'hinge' | 'squat' | 'quad' | 'ham' | 'calf' | 'carry'
  | 'push-h' | 'push-v' | 'pull-h' | 'pull-v'
  | 'lat-delt' | 'rear-delt' | 'trap' | 'biceps' | 'triceps' | 'forearm' | 'lowback';

/** Ограничения по здоровью, которые закрывают часть движений. */
export type LimitId = 'knee' | 'wrist' | 'lowback' | 'shoulder';

export const LIMITS: Array<{ id: LimitId; label: string; hint: string }> = [
  { id: 'knee',     label: 'Колено', hint: 'Связки, мениск. Убираются глубокие приседы и выпады с большой амплитудой.' },
  { id: 'wrist',    label: 'Запястье', hint: 'Убираются жимы со штангой и всё, где кисть в разгибании под весом.' },
  { id: 'lowback',  label: 'Поясница', hint: 'Убирается становая с пола и наклоны со штангой.' },
  { id: 'shoulder', label: 'Плечо', hint: 'Убираются жимы из-за головы и подъёмы выше уровня плеча.' },
];

export interface Movement {
  id: string;
  name: string;
  shortName?: string;
  pattern: Pattern;
  equipment: Equipment;
  /** Общий вес снаряда, вес на руку или свой вес. */
  unit: 'total' | 'perHand' | 'bodyweight';
  bwFactor: number;
  step: number;
  repRange: RepRange;
  rest: number;
  /** Тяжёлое базовое, среднее или добивка — от этого зависит место в дне. */
  tier: 'main' | 'secondary' | 'accessory';
  /** Ограничения, при которых движение не предлагается. */
  forbidden?: LimitId[];
  note?: string;
}

export const MOVEMENTS: Movement[] = [
  /* ---------- Тазобедренный шарнир ---------- */
  { id: 'deadlift-trap', name: 'Становая с трэп-бара', pattern: 'hinge', equipment: 'trapbar',
    unit: 'total', bwFactor: 1.0, step: 5, repRange: [5, 7], rest: 180, tier: 'main',
    note: 'Спина ровная, таз назад. Классику с пола не берём — поясница.' },
  { id: 'deadlift-db', name: 'Становая с гантелями по бокам', shortName: 'Становая с гантелями',
    pattern: 'hinge', equipment: 'dumbbell', unit: 'perHand', bwFactor: 0.45, step: 2,
    repRange: [6, 8], rest: 150, tier: 'main' },
  { id: 'rdl', name: 'Румынская тяга со штангой', pattern: 'hinge', equipment: 'barbell',
    unit: 'total', bwFactor: 0.71, step: 5, repRange: [8, 10], rest: 150, tier: 'main',
    forbidden: ['lowback'],
    note: 'Таз назад, колени мягкие, штанга по бедру.' },
  { id: 'rdl-db', name: 'Румынская тяга с гантелями', shortName: 'Румынская с гантелями',
    pattern: 'hinge', equipment: 'dumbbell', unit: 'perHand', bwFactor: 0.3, step: 2,
    repRange: [8, 10], rest: 150, tier: 'secondary' },
  { id: 'hip-thrust', name: 'Ягодичный мост со штангой', shortName: 'Ягодичный мост',
    pattern: 'hinge', equipment: 'barbell', unit: 'total', bwFactor: 1.3, step: 5,
    repRange: [8, 12], rest: 120, tier: 'secondary' },

  /* ---------- Присед и квадрицепс ---------- */
  { id: 'box-squat', name: 'Присед со штангой до ящика', shortName: 'Присед до ящика',
    pattern: 'squat', equipment: 'barbell', unit: 'total', bwFactor: 0.64, step: 5,
    repRange: [6, 8], rest: 180, tier: 'main',
    note: 'Ящик до параллели бедра. Ниже не садиться.' },
  { id: 'goblet-squat', name: 'Гоблет-присед', pattern: 'squat', equipment: 'dumbbell',
    unit: 'total', bwFactor: 0.32, step: 2, repRange: [8, 12], rest: 120, tier: 'secondary' },
  { id: 'leg-press', name: 'Жим ногами, средняя постановка', shortName: 'Жим ногами',
    pattern: 'quad', equipment: 'machine', unit: 'total', bwFactor: 1.75, step: 5,
    repRange: [10, 12], rest: 150, tier: 'main',
    note: 'Глубина до 90° в колене, не глубже.' },
  { id: 'hack-squat', name: 'Гакк-присед до параллели', shortName: 'Гакк-присед',
    pattern: 'quad', equipment: 'machine', unit: 'total', bwFactor: 0.96, step: 5,
    repRange: [8, 12], rest: 150, tier: 'main' },
  { id: 'bulgarian-split', name: 'Болгарский присед с гантелями', shortName: 'Болгарский присед',
    pattern: 'quad', equipment: 'dumbbell', unit: 'perHand', bwFactor: 0.21, step: 2,
    repRange: [8, 12], rest: 120, tier: 'secondary', forbidden: ['knee'] },

  /* ---------- Бицепс бедра и икры ---------- */
  { id: 'leg-curl', name: 'Сгибание ног лёжа', pattern: 'ham', equipment: 'machine',
    unit: 'total', bwFactor: 0.37, step: 2.5, repRange: [10, 12], rest: 90, tier: 'accessory' },
  { id: 'leg-curl-seated', name: 'Сгибание ног сидя', pattern: 'ham', equipment: 'machine',
    unit: 'total', bwFactor: 0.37, step: 2.5, repRange: [10, 12], rest: 90, tier: 'accessory' },
  { id: 'calf-standing', name: 'Подъём на носки стоя', pattern: 'calf', equipment: 'machine',
    unit: 'total', bwFactor: 0.75, step: 5, repRange: [12, 15], rest: 60, tier: 'accessory' },
  { id: 'calf-seated', name: 'Подъём на носки сидя', pattern: 'calf', equipment: 'machine',
    unit: 'total', bwFactor: 0.45, step: 5, repRange: [15, 15], rest: 60, tier: 'accessory' },

  /* ---------- Горизонтальный жим ---------- */
  { id: 'db-bench', name: 'Жим гантелей лёжа, полунейтральный', shortName: 'Жим гантелей лёжа',
    pattern: 'push-h', equipment: 'dumbbell', unit: 'perHand', bwFactor: 0.427, step: 2,
    repRange: [8, 10], rest: 150, tier: 'main',
    note: 'Полунейтральный хват бережёт запястье.' },
  { id: 'incline-db-press', name: 'Жим гантелей на наклонной 30°', shortName: 'Жим на наклонной',
    pattern: 'push-h', equipment: 'dumbbell', unit: 'perHand', bwFactor: 0.36, step: 2,
    repRange: [8, 10], rest: 150, tier: 'main' },
  { id: 'machine-press', name: 'Жим в тренажёре сидя', pattern: 'push-h', equipment: 'machine',
    unit: 'total', bwFactor: 0.85, step: 5, repRange: [8, 12], rest: 120, tier: 'secondary' },
  { id: 'bb-bench', name: 'Жим штанги лёжа', pattern: 'push-h', equipment: 'barbell',
    unit: 'total', bwFactor: 0.98, step: 2.5, repRange: [6, 8], rest: 180, tier: 'main',
    forbidden: ['wrist'] },

  /* ---------- Вертикальный жим ---------- */
  { id: 'db-shoulder-press', name: 'Жим гантелей сидя, нейтральный хват', shortName: 'Жим гантелей сидя',
    pattern: 'push-v', equipment: 'dumbbell', unit: 'perHand', bwFactor: 0.262, step: 2,
    repRange: [8, 10], rest: 150, tier: 'main' },
  { id: 'machine-shoulder', name: 'Жим плечами в тренажёре', shortName: 'Жим плечами',
    pattern: 'push-v', equipment: 'machine', unit: 'total', bwFactor: 0.47, step: 5,
    repRange: [8, 12], rest: 120, tier: 'secondary' },
  { id: 'bb-shoulder-press', name: 'Жим штанги сидя', pattern: 'push-v', equipment: 'barbell',
    unit: 'total', bwFactor: 0.55, step: 2.5, repRange: [6, 8], rest: 150, tier: 'main',
    forbidden: ['wrist', 'shoulder'] },

  /* ---------- Горизонтальная тяга ---------- */
  { id: 'bb-row', name: 'Тяга штанги в наклоне', pattern: 'pull-h', equipment: 'barbell',
    unit: 'total', bwFactor: 0.714, step: 2.5, repRange: [8, 10], rest: 120, tier: 'main',
    forbidden: ['lowback'],
    note: 'Корпус 45°, штанга к низу живота.' },
  { id: 'seated-row', name: 'Тяга горизонтального блока', shortName: 'Тяга горизонт. блока',
    pattern: 'pull-h', equipment: 'cable', unit: 'total', bwFactor: 0.785, step: 2.5,
    repRange: [10, 12], rest: 120, tier: 'main' },
  { id: 'db-row', name: 'Тяга гантели одной рукой', shortName: 'Тяга гантели',
    pattern: 'pull-h', equipment: 'dumbbell', unit: 'perHand', bwFactor: 0.29, step: 2,
    repRange: [8, 12], rest: 120, tier: 'secondary' },
  { id: 'chest-row', name: 'Тяга в тренажёре с упором в грудь', shortName: 'Тяга с упором',
    pattern: 'pull-h', equipment: 'machine', unit: 'total', bwFactor: 0.8, step: 2.5,
    repRange: [10, 12], rest: 120, tier: 'secondary' },

  /* ---------- Вертикальная тяга ---------- */
  { id: 'pullup', name: 'Подтягивания', pattern: 'pull-v', equipment: 'bodyweight',
    unit: 'bodyweight', bwFactor: 0, step: 2.5, repRange: [8, 10], rest: 120, tier: 'main' },
  { id: 'lat-pulldown', name: 'Тяга верхнего блока', pattern: 'pull-v', equipment: 'cable',
    unit: 'total', bwFactor: 0.714, step: 2.5, repRange: [10, 12], rest: 120, tier: 'main' },

  /* ---------- Дельты, трапеция ---------- */
  { id: 'lat-raise', name: 'Махи гантелей в стороны', shortName: 'Махи в стороны',
    pattern: 'lat-delt', equipment: 'dumbbell', unit: 'perHand', bwFactor: 0.119, step: 2,
    repRange: [12, 15], rest: 60, tier: 'accessory', forbidden: ['shoulder'],
    note: 'Локоть ведёт, кисть ниже локтя.' },
  { id: 'cable-lat-raise', name: 'Махи на блоке одной рукой', shortName: 'Махи на блоке',
    pattern: 'lat-delt', equipment: 'cable', unit: 'total', bwFactor: 0.07, step: 2.5,
    repRange: [12, 15], rest: 60, tier: 'accessory', forbidden: ['shoulder'] },
  { id: 'rear-delt-machine', name: 'Задняя дельта в тренажёре', shortName: 'Задняя дельта',
    pattern: 'rear-delt', equipment: 'machine', unit: 'total', bwFactor: 0.373, step: 2.5,
    repRange: [15, 20], rest: 60, tier: 'accessory' },
  { id: 'face-pull', name: 'Тяга к лицу', pattern: 'rear-delt', equipment: 'cable',
    unit: 'total', bwFactor: 0.26, step: 2.5, repRange: [15, 20], rest: 60, tier: 'accessory' },
  { id: 'shrug', name: 'Шраги с гантелями', pattern: 'trap', equipment: 'dumbbell',
    unit: 'perHand', bwFactor: 0.448, step: 2, repRange: [12, 15], rest: 90, tier: 'accessory' },

  /* ---------- Руки и предплечья ---------- */
  { id: 'ez-curl', name: 'Сгибания с EZ-грифом', pattern: 'biceps', equipment: 'ez',
    unit: 'total', bwFactor: 0.373, step: 2.5, repRange: [10, 12], rest: 75, tier: 'accessory' },
  { id: 'hammer-curl', name: 'Молотковые сгибания', pattern: 'biceps', equipment: 'dumbbell',
    unit: 'perHand', bwFactor: 0.149, step: 2, repRange: [10, 12], rest: 75, tier: 'accessory' },
  { id: 'triceps-rope', name: 'Разгибания на блоке, канат', shortName: 'Разгибания на канате',
    pattern: 'triceps', equipment: 'cable', unit: 'total', bwFactor: 0.3, step: 2.5,
    repRange: [12, 15], rest: 75, tier: 'accessory' },
  { id: 'french-press', name: 'Французский жим гантелью из-за головы', shortName: 'Французский жим',
    pattern: 'triceps', equipment: 'dumbbell', unit: 'total', bwFactor: 0.18, step: 2,
    repRange: [12, 12], rest: 75, tier: 'accessory', forbidden: ['shoulder'] },
  { id: 'wrist-curl', name: 'Сгибания запястий + обратные', shortName: 'Сгибания запястий',
    pattern: 'forearm', equipment: 'dumbbell', unit: 'perHand', bwFactor: 0.075, step: 1,
    repRange: [15, 15], rest: 45, tier: 'accessory',
    note: 'Лёгкие. Это лечение, не тренировка.' },

  /* ---------- Поясница и переноска ---------- */
  { id: 'hyperextension', name: 'Гиперэкстензия с весом', shortName: 'Гиперэкстензия',
    pattern: 'lowback', equipment: 'bodyweight', unit: 'total', bwFactor: 0.149, step: 5,
    repRange: [12, 15], rest: 90, tier: 'accessory' },
  { id: 'farmer-walk', name: 'Фермерская прогулка', pattern: 'carry', equipment: 'dumbbell',
    unit: 'perHand', bwFactor: 0.448, step: 2, repRange: [1, 1], rest: 90, tier: 'accessory' },
];

export const byPattern = (pattern: Pattern): Movement[] =>
  MOVEMENTS.filter((m) => m.pattern === pattern);

export const movement = (id: string): Movement | undefined =>
  MOVEMENTS.find((m) => m.id === id);
