/**
 * Замены упражнений. Ключ — catalogId основного движения.
 *
 * ratio — множитель к текущему рабочему весу при переходе на другой снаряд.
 * Это ПЕРВОЕ ПРИБЛИЖЕНИЕ, а не истина: снаряды и рычаги у всех разные.
 * Дальше вес доводит обычный алгоритм прогрессии за одну-две сессии.
 *
 * Ограничения по здоровью зашиты в сам список:
 *  — в заменах приседа нет ни одного глубокого варианта (разрыв ПКС);
 *  — жимы со штангой помечены barbellPress и не показываются,
 *    пока в настройках не разрешишь штангу в жимах (запястье).
 */

export interface VariantDef {
  id: string;
  name: string;
  shortName?: string;
  /** Новый вес = текущий × ratio, положенный на шаг нового снаряда. */
  ratio: number;
  /**
   * Готовый вес вместо пересчёта. Нужен там, где ratio бессмыслен:
   * у подтягиваний «вес» — это довесок на пояс, и умножать его
   * на коэффициент, чтобы получить вес стопки блока, нельзя.
   */
  fixedWeight?: number;
  /** Шаг прибавки на новом снаряде. */
  step: number;
  /** Чем отличается — коротко и по делу. */
  note: string;
  /** Требует разрешённой штанги в жимах. */
  barbellPress?: boolean;
}

export const VARIANTS: Record<string, VariantDef[]> = {
  'deadlift-trap': [
    { id: 'deadlift-db', name: 'Становая с гантелями по бокам', shortName: 'Становая с гантелями',
      ratio: 0.45, step: 2, note: 'Вес на руку. Если трэп-бара нет — это ближайшее.' },
    { id: 'rack-pull', name: 'Тяга с плинтов', ratio: 1.15, step: 5,
      note: 'Короче амплитуда, поясница нагружена меньше.' },
    { id: 'hip-thrust', name: 'Ягодичный мост со штангой', shortName: 'Ягодичный мост',
      ratio: 1.3, step: 5, note: 'Только ягодицы и бицепс бедра, спина отдыхает.' },
  ],

  'db-bench': [
    { id: 'machine-press', name: 'Жим в тренажёре сидя', ratio: 2.0, step: 5,
      note: 'Кисть зафиксирована, запястью легче всего.' },
    { id: 'incline-db-press', name: 'Жим гантелей на наклонной 30°', shortName: 'Жим на наклонной',
      ratio: 0.85, step: 2, note: 'Больше верх груди, вес ниже.' },
    { id: 'dips', name: 'Отжимания на брусьях с весом', shortName: 'Брусья с весом',
      ratio: 0.3, step: 2.5, note: 'Вес на поясе. Не идти глубоко — плечо.' },
    { id: 'bb-bench', name: 'Жим штанги лёжа', ratio: 2.3, step: 2.5, barbellPress: true,
      note: 'Кисть в разгибании. Только если четыре недели без боли.' },
  ],

  'bb-row': [
    { id: 'db-row', name: 'Тяга гантели одной рукой', shortName: 'Тяга гантели',
      ratio: 0.4, step: 2, note: 'Вес на руку. Поясница разгружена — есть упор.' },
    { id: 't-bar-row', name: 'Тяга Т-грифа', ratio: 1.0, step: 2.5,
      note: 'То же движение, но траектория задана.' },
    { id: 'seated-row', name: 'Тяга горизонтального блока', shortName: 'Тяга горизонт. блока',
      ratio: 1.1, step: 2.5, note: 'Сидя, спина не держит вес.' },
    { id: 'chest-row', name: 'Тяга в тренажёре с упором в грудь', shortName: 'Тяга с упором',
      ratio: 1.15, step: 2.5, note: 'Поясница выключена полностью.' },
  ],

  'leg-curl': [
    { id: 'leg-curl-seated', name: 'Сгибание ног сидя', ratio: 1.0, step: 2.5,
      note: 'Другой угол в тазобедренном, нагрузка та же.' },
    { id: 'leg-curl-single', name: 'Сгибание одной ногой', ratio: 0.5, step: 2.5,
      note: 'Если одна нога отстаёт.' },
    { id: 'leg-curl-standing', name: 'Сгибание ноги стоя в тренажёре', shortName: 'Сгибание стоя',
      ratio: 0.45, step: 2.5, note: 'По одной ноге, таз зафиксирован.' },
  ],

  'lat-raise': [
    { id: 'cable-lat-raise', name: 'Махи на блоке одной рукой', shortName: 'Махи на блоке',
      ratio: 0.6, step: 2.5, note: 'Нагрузка ровная по всей амплитуде.' },
    { id: 'machine-lat-raise', name: 'Махи в тренажёре', ratio: 1.6, step: 2.5,
      note: 'Корпусом не помочь, читинг исключён.' },
    { id: 'incline-lat-raise', name: 'Махи лёжа на наклонной скамье', shortName: 'Махи на наклонной',
      ratio: 0.75, step: 2, note: 'Нет читинга корпусом, средняя дельта под нагрузкой всю амплитуду.' },
  ],

  'hammer-curl': [
    { id: 'db-curl', name: 'Сгибания с гантелями с супинацией', shortName: 'Сгибания с гантелями',
      ratio: 0.9, step: 2, note: 'Больше бицепс, меньше предплечье.' },
    { id: 'rope-hammer', name: 'Молот на блоке с канатом', shortName: 'Молот на блоке',
      ratio: 1.8, step: 2.5, note: 'Постоянное натяжение.' },
    { id: 'preacher-curl', name: 'Сгибания на скамье Скотта с EZ', shortName: 'Скамья Скотта',
      ratio: 1.6, step: 2.5, note: 'Общий вес грифа, не на руку. Супинация — больше бицепс.' },
  ],

  'wrist-curl': [
    { id: 'reverse-wrist', name: 'Только обратные сгибания', ratio: 0.6, step: 1,
      note: 'Если ладонные идут больно.' },
    { id: 'wrist-roller', name: 'Скручивание на палке', ratio: 0.5, step: 1,
      note: 'Мягче для сустава, дольше по времени.' },
  ],

  'leg-press': [
    { id: 'hack-squat', name: 'Гакк-присед до параллели', shortName: 'Гакк-присед',
      ratio: 0.55, step: 5, note: 'Не ниже параллели — колено.' },
    { id: 'leg-press-single', name: 'Жим ногами одной ногой', shortName: 'Жим одной ногой',
      ratio: 0.5, step: 5, note: 'Выравнивает стороны.' },
    { id: 'bulgarian-split', name: 'Болгарский присед с гантелями', shortName: 'Болгарский присед',
      ratio: 0.12, step: 2, note: 'Вес на руку. Колено не выходит за носок.' },
  ],

  'rdl': [
    { id: 'rdl-db', name: 'Румынская тяга с гантелями', shortName: 'Румынская с гантелями',
      ratio: 0.4, step: 2, note: 'Вес на руку. Проще держать спину.' },
    { id: 'good-morning', name: 'Наклоны со штангой', ratio: 0.55, step: 5,
      note: 'Легче по весу, жёстче по технике.' },
    { id: 'hyperextension', name: 'Гиперэкстензия с весом', shortName: 'Гиперэкстензия',
      ratio: 0.2, step: 5, note: 'Поясница разгружена, таз зафиксирован.' },
  ],

  'db-shoulder-press': [
    { id: 'machine-shoulder', name: 'Жим плечами в тренажёре', shortName: 'Жим в тренажёре',
      ratio: 1.8, step: 5, note: 'Кисть зафиксирована, запястью легче.' },
    { id: 'arnold-press', name: 'Арнольд-жим', ratio: 0.9, step: 2,
      note: 'Разворот кисти по ходу — следи за запястьем.' },
    { id: 'landmine-press', name: 'Жим в наклонной раме', shortName: 'Жим в раме',
      ratio: 1.2, step: 2.5, note: 'Нейтральная траектория, плечу комфортно.' },
    { id: 'bb-shoulder-press', name: 'Жим штанги сидя', ratio: 2.2, step: 2.5, barbellPress: true,
      note: 'Кисть в разгибании. Только с разрешения в настройках.' },
  ],

  'pullup': [
    { id: 'lat-pulldown', name: 'Тяга верхнего блока', ratio: 1.0, fixedWeight: 55, step: 2.5,
      note: 'Вес стопки, а не свой. Стартуем с 55 кг.' },
    { id: 'assisted-pullup', name: 'Подтягивания в гравитроне', shortName: 'Гравитрон',
      ratio: 1.0, fixedWeight: 30, step: 5, note: 'Вес противовеса: чем больше, тем легче.' },
    { id: 'neutral-pullup', name: 'Подтягивания нейтральным хватом', shortName: 'Нейтральный хват',
      ratio: 1.0, step: 2.5, note: 'Свой вес и довесок переносятся как есть. Мягче для локтя.' },
  ],

  'triceps-rope': [
    { id: 'overhead-rope', name: 'Разгибания на блоке из-за головы', shortName: 'Разгибания из-за головы',
      ratio: 0.8, step: 2.5, note: 'Длинная головка трицепса.' },
    { id: 'french-press', name: 'Французский жим гантелью', shortName: 'Французский жим',
      ratio: 0.55, step: 2, note: 'Локти строго вверх.' },
    { id: 'dips-triceps', name: 'Отжимания на брусьях узко', shortName: 'Брусья узко',
      ratio: 0.35, step: 2.5, note: 'Корпус вертикально. Вес на поясе.' },
  ],

  'box-squat': [
    // Глубоких приседов здесь нет и не будет — разрыв ПКС.
    { id: 'leg-press-quad', name: 'Жим ногами до 90°', shortName: 'Жим ногами',
      ratio: 2.75, step: 5, note: 'Глубже 90° не идти. Самый безопасный вариант.' },
    { id: 'hack-squat-parallel', name: 'Гакк-присед до параллели', shortName: 'Гакк-присед',
      ratio: 1.2, step: 5, note: 'Ниже параллели не садиться.' },
    { id: 'goblet-box-squat', name: 'Гоблет-присед до ящика', shortName: 'Гоблет до ящика',
      ratio: 0.5, step: 2, note: 'Одна гантель у груди, спина вертикальнее.' },
    { id: 'split-squat-box', name: 'Болгарский присед с гантелями', shortName: 'Болгарский присед',
      ratio: 0.25, step: 2, note: 'Вес на руку. Амплитуду держать короткой.' },
  ],

  'incline-db-press': [
    { id: 'incline-machine', name: 'Жим в наклонном тренажёре', shortName: 'Наклонный тренажёр',
      ratio: 1.8, step: 5, note: 'Кисть зафиксирована.' },
    { id: 'db-bench', name: 'Жим гантелей лёжа', ratio: 1.2, step: 2,
      note: 'Горизонтально, вес выше.' },
    { id: 'incline-bb', name: 'Жим штанги на наклонной', shortName: 'Штанга на наклонной',
      ratio: 2.2, step: 2.5, barbellPress: true, note: 'Только с разрешения в настройках.' },
  ],

  'seated-row': [
    { id: 'db-row-single', name: 'Тяга гантели одной рукой', shortName: 'Тяга гантели',
      ratio: 0.35, step: 2, note: 'Вес на руку.' },
    { id: 'machine-row', name: 'Тяга в тренажёре', ratio: 1.0, step: 2.5,
      note: 'Траектория задана, спина не думает.' },
    { id: 'chest-supported-row', name: 'Тяга с упором в грудь', shortName: 'Тяга с упором',
      ratio: 0.95, step: 2.5, note: 'Поясница полностью выключена.' },
  ],

  'hyperextension': [
    { id: 'reverse-hyper', name: 'Обратная гиперэкстензия', ratio: 1.0, step: 5,
      note: 'Мягче для поясницы.' },
    { id: 'back-extension-45', name: 'Наклонная скамья 45°', shortName: 'Скамья 45°',
      ratio: 1.2, step: 5, note: 'Короче амплитуда.' },
  ],

  'shrug': [
    { id: 'bb-shrug', name: 'Шраги со штангой', ratio: 2.0, step: 5,
      note: 'Общий вес вместо веса на руку.' },
    { id: 'machine-shrug', name: 'Шраги в тренажёре', ratio: 2.2, step: 5,
      note: 'Не выскальзывает из рук.' },
    { id: 'trap-bar-shrug', name: 'Шраги с трэп-баром', ratio: 2.1, step: 5,
      note: 'Нейтральный хват, запястью легче.' },
  ],

  'ez-curl': [
    { id: 'db-curl-alt', name: 'Сгибания с гантелями', ratio: 0.4, step: 2,
      note: 'Вес на руку. Кисть свободна — при боли в запястье лучше.' },
    { id: 'cable-curl', name: 'Сгибания на нижнем блоке', shortName: 'Сгибания на блоке',
      ratio: 1.0, step: 2.5, note: 'Постоянное натяжение.' },
    { id: 'preacher-ez', name: 'Сгибания на скамье Скотта', shortName: 'Скамья Скотта',
      ratio: 0.85, step: 2.5, note: 'Корпусом не помочь.' },
  ],

  'farmer-walk': [
    { id: 'trap-bar-walk', name: 'Прогулка с трэп-баром', ratio: 2.0, step: 5,
      note: 'Общий вес. Идти ровно, не спешить.' },
    { id: 'suitcase-walk', name: 'Прогулка с одной гантелью', shortName: 'Прогулка одной рукой',
      ratio: 0.7, step: 2, note: 'Косые мышцы. Корпус не заваливать.' },
  ],

  'lat-pulldown': [
    { id: 'close-pulldown', name: 'Тяга блока узким хватом', shortName: 'Тяга узким хватом',
      ratio: 1.05, step: 2.5, note: 'Больше низ широчайших.' },
    { id: 'neutral-pulldown', name: 'Тяга блока нейтральной рукоятью', shortName: 'Нейтральная рукоять',
      ratio: 1.05, step: 2.5, note: 'Мягче для локтя.' },
    { id: 'pullover-cable', name: 'Пуловер на блоке', ratio: 0.6, step: 2.5,
      note: 'Только широчайшие, руки не работают.' },
  ],

  'rear-delt-machine': [
    { id: 'rear-delt-db', name: 'Разведение гантелей в наклоне', shortName: 'Разведение в наклоне',
      ratio: 0.25, step: 2, note: 'Вес на руку.' },
    { id: 'face-pull', name: 'Тяга к лицу на блоке', shortName: 'Тяга к лицу',
      ratio: 0.7, step: 2.5, note: 'Ещё и для здоровья плеча.' },
    { id: 'cable-rear-fly', name: 'Разведение в кроссовере', shortName: 'Кроссовер назад',
      ratio: 0.5, step: 2.5, note: 'Ровное натяжение.' },
  ],

  'french-press': [
    { id: 'rope-overhead', name: 'Разгибания на блоке из-за головы', shortName: 'Разгибания из-за головы',
      ratio: 1.7, step: 2.5, note: 'То же движение, ровнее нагрузка.' },
    { id: 'ez-french', name: 'Французский жим с EZ-грифом', shortName: 'Французский с EZ',
      ratio: 1.8, step: 2.5, note: 'Кисть в удобном положении.' },
  ],
};

/** Есть ли вообще чем заменить это движение. */
export function hasVariants(catalogId: string): boolean {
  return (VARIANTS[catalogId]?.length ?? 0) > 0;
}
