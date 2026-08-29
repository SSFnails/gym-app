/**
 * Проверяет, что дневник переживает переход на профили.
 *
 * Собирает в настоящем Chrome настоящую IndexedDB ровно в форме схемы 4,
 * с живыми данными: сессии, подходы, накопленные веса, замены упражнений,
 * взвешивания, замеры. Снимает состояние, открывает приложение, даёт Dexie
 * отработать апгрейд и сверяет каждую строку и каждое поле обратно.
 *
 *   npx vite preview --port 4173
 *   node scripts/migration-check.mjs [url]
 *
 * Юнит-тест в src/db/migrate.test.ts проверяет логику переноса на объектах.
 * Здесь проверяется то, чего он проверить не может: что IndexedDB и Dexie
 * действительно делают ровно это и ничего не теряют.
 */
import { openPage, sleep } from './cdp.mjs';

const url = process.argv[2] ?? 'http://localhost:4173/#/';
const origin = new URL(url).origin;

/** Схема 4, один в один из истории src/db/db.ts. */
const SCHEMA_4 = {
  meta: { key: 'key' },
  settings: { key: 'id' },
  days: { key: 'id', indexes: { order: 'order' } },
  exercises: { key: 'id', indexes: { dayId: 'dayId', '[dayId+order]': ['dayId', 'order'] } },
  exerciseState: { key: 'exerciseId' },
  sessions: { key: 'id', indexes: { startedAt: 'startedAt', dayId: 'dayId', status: 'status' } },
  setLogs: { key: 'id', indexes: { sessionId: 'sessionId', exerciseId: 'exerciseId', '[sessionId+exerciseId]': ['sessionId', 'exerciseId'] } },
  exerciseResults: { key: 'id', auto: true, indexes: { sessionId: 'sessionId', exerciseId: 'exerciseId', '[sessionId+exerciseId]': ['sessionId', 'exerciseId'] } },
  bodyWeight: { key: 'date' },
  measurements: { key: 'date' },
  catalog: { key: 'id' },
  photos: { key: 'id', auto: true, indexes: { catalogId: 'catalogId' } },
};

/** Первичные ключи для сверки строк по одной и той же строке, а не по порядку. */
const PRIMARY = {
  meta: 'key', settings: 'id', days: 'id', exercises: 'id', exerciseState: 'exerciseId',
  sessions: 'id', setLogs: 'id', exerciseResults: 'id', bodyWeight: 'date',
  measurements: 'date', catalog: 'id',
};

/** Поля, которые миграции разрешено добавить. Больше — повод разбираться. */
const ALLOWED_NEW = { days: ['profileId', 'letter'] };
const DEFAULT_NEW = ['profileId'];

/** Таблицы, которые обязаны получить профиль. */
const STAMPED = ['days', 'exercises', 'exerciseState', 'sessions', 'setLogs', 'exerciseResults'];

/**
 * Данные «как у живого человека»: год тренировок, замены, тест подтягиваний,
 * незакрытая тренировка и накопленные веса, которые нельзя потерять.
 */
const DATA = {
  meta: [
    { key: 'schemaVersion', value: 4 },
    { key: 'seedVersion', value: 1 },
    { key: 'warmup', value: ['3 мин дорожка', 'резина 2×15', 'мостик 15', 'сгибание ног 1×20', 'запястья 30 с'] },
  ],
  settings: [{
    id: 1, activeProfileId: null, allowBarbellPress: true, dayDEnabled: true,
    supersetsEnabled: true, programStartedAt: '2026-03-02T08:00:00.000Z', weekOverride: null,
    dayQueueIndex: 2, lastSessionAt: '2026-08-25T11:20:00.000Z', breakAckAt: null,
    restSound: true, restVibrate: false, warmupFromWorkingWeight: true,
    createdAt: '2026-03-02T08:00:00.000Z',
  }],
  days: [
    { id: 'A', name: 'Задняя цепь и грудь', weekdayHint: 'вторник', optional: false, order: 0 },
    { id: 'B', name: 'Ноги, плечи, спина', weekdayHint: 'четверг', optional: false, order: 1 },
    { id: 'C', name: 'Присед, грудь, верх спины', weekdayHint: 'воскресенье', optional: false, order: 2 },
    { id: 'D', name: 'Визуал', weekdayHint: 'суббота', optional: true, order: 3 },
  ],
  exercises: [
    { id: 'a1-deadlift-trap', dayId: 'A', order: 0, catalogId: 'deadlift-trap', name: 'Становая с трэп-бара',
      type: 'reps', sets: 4, repRange: [5, 7], rest: 180, step: 5, autoProgress: true,
      isNewPattern: true, schedule: { 1: 50, 2: 60, 3: 70 }, warmupSeed: ['20x8', '40x5', '50x3'],
      superset: { name: 'Подъём на носки стоя', catalogId: 'calf-standing', sets: 3, repRange: [12, 15], weight: 50 } },
    { id: 'a2-db-bench', dayId: 'A', order: 1, catalogId: 'db-bench', name: 'Жим гантелей лёжа, полунейтральный',
      shortName: 'Жим гантелей лёжа', type: 'reps', sets: 4, repRange: [8, 10], rest: 150, step: 2,
      autoProgress: true, isNewPattern: false, startWeight: 26, warmupSeed: ['14x8', '20x5'] },
    { id: 'b4-pullup', dayId: 'B', order: 3, catalogId: 'pullup', name: 'Подтягивания или тяга верхнего блока',
      shortName: 'Подтягивания', type: 'reps', sets: 4, repRange: [8, 10], rest: 120, step: 2.5,
      autoProgress: true, isNewPattern: false, conditional: true },
    { id: 'c7-farmer', dayId: 'C', order: 6, catalogId: 'farmer-walk', name: 'Фермерская прогулка',
      type: 'distance', sets: 2, repRange: null, distance: 40, rest: 90, step: null,
      autoProgress: false, isNewPattern: false, startWeight: 30 },
  ],
  exerciseState: [
    // Год работы: вес уехал далеко от стартового. Ровно это и нельзя потерять.
    { exerciseId: 'a1-deadlift-trap', currentWeight: 102.5, nextTargetReps: [6, 6, 5, 5], stallCount: 0,
      lastVolume: 22, lastOutcome: 'up', sessionsDone: 41, variantId: null, supersetWeight: 65,
      updatedAt: '2026-08-25T11:20:00.000Z' },
    // Замена снаряда: вес до замены обязан сохраниться, иначе не вернуться назад.
    { exerciseId: 'a2-db-bench', currentWeight: 34, nextTargetReps: [9, 9, 8, 8], stallCount: 1,
      lastVolume: 34, lastOutcome: 'hold', sessionsDone: 39, variantId: 'machine-press',
      preVariantWeight: 30, updatedAt: '2026-08-25T11:20:00.000Z' },
    // Тест максимума пройден: результат теста — личный рекорд, он невосстановим.
    { exerciseId: 'b4-pullup', currentWeight: 0, nextTargetReps: [11, 11, 11, 11], stallCount: 0,
      lastVolume: 44, lastOutcome: 'hold', sessionsDone: 38, variantId: null,
      resolvedConditional: 'pullups', pullupMax: 12, updatedAt: '2026-08-20T11:00:00.000Z' },
    { exerciseId: 'c7-farmer', currentWeight: 40, nextTargetReps: [], stallCount: 0, lastVolume: null,
      lastOutcome: 'manual', sessionsDone: 36, variantId: null, updatedAt: '2026-08-23T11:00:00.000Z' },
  ],
  sessions: [
    { id: 'sess-old', dayId: 'A', weekNumber: 20, isDeload: false, startedAt: '2026-08-18T09:00:00.000Z',
      finishedAt: '2026-08-18T10:12:00.000Z', tonnage: 8120, durationSec: 4320, status: 'done' },
    { id: 'sess-mid', dayId: 'B', weekNumber: 21, isDeload: false, startedAt: '2026-08-20T09:00:00.000Z',
      finishedAt: '2026-08-20T10:20:00.000Z', tonnage: 7640, durationSec: 4800, status: 'done' },
    { id: 'sess-last', dayId: 'A', weekNumber: 25, isDeload: false, startedAt: '2026-08-25T10:00:00.000Z',
      finishedAt: '2026-08-25T11:20:00.000Z', tonnage: 8990, durationSec: 4800, status: 'done' },
    { id: 'sess-drop', dayId: 'C', weekNumber: 22, isDeload: false, startedAt: '2026-08-22T09:00:00.000Z',
      finishedAt: '2026-08-22T09:04:00.000Z', tonnage: 0, durationSec: 240, status: 'abandoned' },
  ],
  setLogs: [
    { id: 'sess-last:a1-deadlift-trap:warmup:0', sessionId: 'sess-last', exerciseId: 'a1-deadlift-trap',
      index: 0, kind: 'warmup', targetWeight: 45, targetReps: 8, weight: 45, reps: 8, rir: null,
      done: true, at: '2026-08-25T10:06:00.000Z' },
    { id: 'sess-last:a1-deadlift-trap:work:0', sessionId: 'sess-last', exerciseId: 'a1-deadlift-trap',
      index: 0, kind: 'work', targetWeight: 102.5, targetReps: 6, weight: 102.5, reps: 7, rir: 1,
      done: true, at: '2026-08-25T10:14:00.000Z' },
    { id: 'sess-last:a1-deadlift-trap:superset:0', sessionId: 'sess-last', exerciseId: 'a1-deadlift-trap',
      index: 0, kind: 'superset', targetWeight: 65, targetReps: 15, weight: 65, reps: 15, rir: null,
      done: true, at: '2026-08-25T10:16:00.000Z' },
    { id: 'sess-last:a2-db-bench:work:0', sessionId: 'sess-last', exerciseId: 'a2-db-bench',
      index: 0, kind: 'work', targetWeight: 34, targetReps: 9, weight: 34, reps: 9, rir: 2,
      done: true, at: '2026-08-25T10:40:00.000Z' },
    { id: 'sess-mid:b4-pullup:work:0', sessionId: 'sess-mid', exerciseId: 'b4-pullup',
      index: 0, kind: 'work', targetWeight: 0, targetReps: 11, weight: 0, reps: 11, rir: 1,
      done: true, at: '2026-08-20T09:50:00.000Z' },
  ],
  exerciseResults: [
    { id: 1, sessionId: 'sess-old', exerciseId: 'a1-deadlift-trap', outcome: 'up',
      reason: 'Диапазон закрыт с запасом — прибавка', weightUsed: 97.5, volume: 24,
      nextWeight: 102.5, nextTargetReps: [5, 5, 5, 5] },
    { id: 2, sessionId: 'sess-mid', exerciseId: 'b4-pullup', outcome: 'hold',
      reason: 'Тот же вес, добираем повторы', weightUsed: 0, volume: 44, nextWeight: 0,
      nextTargetReps: [11, 11, 11, 11] },
    { id: 3, sessionId: 'sess-last', exerciseId: 'a1-deadlift-trap', outcome: 'up',
      reason: 'Проскочил диапазон — прибавка', weightUsed: 102.5, volume: 26,
      nextWeight: 107.5, nextTargetReps: [5, 5, 5, 5] },
    { id: 4, sessionId: 'sess-last', exerciseId: 'a2-db-bench', outcome: 'hold',
      reason: 'Тот же вес, добираем повторы', weightUsed: 34, volume: 34, nextWeight: 34,
      nextTargetReps: [9, 9, 8, 8] },
    { id: 5, sessionId: 'sess-drop', exerciseId: 'c7-farmer', outcome: 'skipped',
      reason: 'Пропущено', weightUsed: 40, volume: 0, nextWeight: 40, nextTargetReps: [],
      skipReason: 'no-time' },
  ],
  bodyWeight: [
    { date: '2026-08-10', kg: 66.4 }, { date: '2026-08-14', kg: 66.9 },
    { date: '2026-08-18', kg: 67 }, { date: '2026-08-22', kg: 67.3 },
    { date: '2026-08-25', kg: 67.6 },
  ],
  measurements: [
    { date: '2026-06-01', chest: 96, waist: 73, thigh: 54, arm: 32, neck: 36.5 },
    { date: '2026-08-01', chest: 98.5, waist: 74, thigh: 55.5, arm: 33.5, neck: 37 },
  ],
  catalog: [{ id: 'db-bench', name: 'Жим гантелей лёжа', equipment: 'dumbbell', illustration: 'bench',
    setup: ['лечь'], execution: ['жать'], mistakes: ['мост'], cheat: 'strict', variants: [] }],
};

/** Сборка базы схемы 4 прямо в браузере, без Dexie: она бы сразу подняла версию. */
const seedExpression = `(async () => {
  const SCHEMA = ${JSON.stringify(SCHEMA_4)};
  const DATA = ${JSON.stringify(DATA)};

  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('gym-app');
    req.onsuccess = resolve; req.onerror = () => reject(new Error('не удалось убрать старую базу'));
    req.onblocked = resolve;
  });

  // Версия 40 — это Dexie 4: он держит свою версию как idb-версию, делённую на десять.
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('gym-app', 40);
    req.onupgradeneeded = () => {
      const idb = req.result;
      for (const [name, spec] of Object.entries(SCHEMA)) {
        const store = idb.createObjectStore(name, { keyPath: spec.key, autoIncrement: !!spec.auto });
        for (const [idxName, keyPath] of Object.entries(spec.indexes || {})) {
          store.createIndex(idxName, keyPath, { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  await new Promise((resolve, reject) => {
    const tx = db.transaction(Object.keys(DATA), 'readwrite');
    for (const [name, rows] of Object.entries(DATA)) {
      for (const row of rows) tx.objectStore(name).put(row);
    }
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });

  const version = db.version;
  db.close();
  return JSON.stringify({ version });
})()`;

/** Снимок всей базы как она есть, тоже без Dexie — читаем то, что лежит на диске. */
const readExpression = `(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('gym-app');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const names = [...db.objectStoreNames];
  const out = {};
  for (const name of names) {
    out[name] = await new Promise((resolve, reject) => {
      const req = db.transaction(name, 'readonly').objectStore(name).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  const version = db.version;
  db.close();
  return JSON.stringify({ version, names, tables: out });
})()`;

/* ---------------- сверка ---------------- */

const problems = [];
const checks = [];
const ok = (what) => checks.push(what);
const bad = (what) => problems.push(what);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function compareTable(name, before, after) {
  const key = PRIMARY[name];
  const allowed = new Set([...(ALLOWED_NEW[name] ?? DEFAULT_NEW)]);
  const index = new Map(after.map((r) => [String(r[key]), r]));

  if (after.length < before.length) {
    bad(`${name}: строк было ${before.length}, стало ${after.length} — пропали данные`);
    return;
  }

  for (const row of before) {
    const found = index.get(String(row[key]));
    if (!found) { bad(`${name}: строка ${row[key]} исчезла`); continue; }

    for (const [field, value] of Object.entries(row)) {
      if (!same(found[field], value)) {
        bad(`${name}.${row[key]}.${field}: было ${JSON.stringify(value)}, стало ${JSON.stringify(found[field])}`);
      }
    }
    for (const field of Object.keys(found)) {
      if (!(field in row) && !allowed.has(field)) {
        bad(`${name}.${row[key]}: появилось неожиданное поле ${field}`);
      }
    }
  }
  ok(`${name}: ${before.length} ${before.length === 1 ? 'строка' : 'строк'} на месте, поля целы`);
}

const page = await openPage();

try {
  // Заводим базу на том же origin, но не на странице приложения: иначе оно
  // откроет базу само и поднимет версию раньше, чем мы её наполним.
  await page.navigate(`${origin}/icons/icon-192.png`, 400);
  const seeded = JSON.parse(await page.evaluate(seedExpression));
  if (seeded.version !== 40) throw new Error(`база завелась в версии ${seeded.version}, ожидалась 40`);
  console.log('база схемы 4 собрана, версия idb', seeded.version);

  const before = JSON.parse(await page.evaluate(readExpression));
  const beforeTotal = Object.values(before.tables).reduce((n, rows) => n + rows.length, 0);
  console.log('до миграции строк:', beforeTotal);

  // Открываем приложение — Dexie сам увидит версию 4 и отработает апгрейд.
  await page.navigate(url, 3000);
  await sleep(1200);

  const after = JSON.parse(await page.evaluate(readExpression));
  const afterTotal = Object.values(after.tables).reduce((n, rows) => n + rows.length, 0);
  console.log('после миграции строк:', afterTotal, '· версия idb', after.version);

  if (after.version !== 50) bad(`версия базы ${after.version}, ожидалась 50 — миграция не отработала`);
  else ok('схема поднялась с 4 на 5');

  for (const name of Object.keys(PRIMARY)) {
    const rowsBefore = before.tables[name] ?? [];
    if (!after.tables[name]) { bad(`таблица ${name} исчезла целиком`); continue; }
    if (name === 'meta' || name === 'settings') continue;
    compareTable(name, rowsBefore, after.tables[name]);
  }

  // Профиль владельца.
  const profiles = after.tables.profiles ?? [];
  if (profiles.length !== 1) bad(`профилей ${profiles.length}, ожидался один`);
  else {
    const owner = profiles[0];
    ok(`профиль владельца создан: ${owner.name}, ${owner.heightCm} см, ${owner.weightKg} кг, стаж ${owner.experienceYears}`);
    if (owner.source !== 'seed') bad('программа владельца помечена расчётной, а её нельзя подменять');
    if (!same(owner.limits, ['knee', 'wrist', 'lowback'])) bad(`ограничения профиля: ${JSON.stringify(owner.limits)}`);
  }
  const ownerId = profiles[0]?.id;

  for (const name of STAMPED) {
    const rows = after.tables[name] ?? [];
    const orphans = rows.filter((r) => r.profileId !== ownerId);
    if (orphans.length) bad(`${name}: без профиля осталось строк ${orphans.length}`);
    else ok(`${name}: профиль проставлен всем`);
  }

  // Ход программы: очередь дней и номер недели обязаны переехать как есть,
  // иначе владелец после обновления окажется в другом дне и другой неделе.
  const was = (before.tables.settings ?? [])[0] ?? {};
  const now = (after.tables.progress ?? [])[0];
  if (!now) bad('строка хода программы не создана — очередь дней и неделя потеряны');
  else {
    const moved = ['dayQueueIndex', 'programStartedAt', 'weekOverride', 'lastSessionAt', 'breakAckAt'];
    const off = moved.filter((f) => !same(now[f], was[f] ?? null));
    if (off.length) bad(`ход программы поехал по полям: ${off.join(', ')}`);
    else ok(`ход программы перенесён: день ${now.dayQueueIndex} в очереди, старт ${now.programStartedAt}`);
    if (now.profileId !== profiles[0]?.id) bad('ход программы привязан не к тому профилю');
  }

  // Взвешивания и замеры: копия обязана быть полной, а старая таблица — целой.
  for (const [from, to] of [['bodyWeight', 'weightLog'], ['measurements', 'girthLog']]) {
    const src = before.tables[from] ?? [];
    const dst = after.tables[to] ?? [];
    if (dst.length !== src.length) { bad(`${to}: перенесено ${dst.length} из ${src.length}`); continue; }
    let intact = true;
    for (const row of src) {
      const found = dst.find((r) => r.date === row.date && r.profileId === ownerId);
      if (!found) { bad(`${to}: запись за ${row.date} не перенеслась`); intact = false; continue; }
      for (const [field, value] of Object.entries(row)) {
        if (!same(found[field], value)) {
          bad(`${to}.${row.date}.${field}: было ${JSON.stringify(value)}, стало ${JSON.stringify(found[field])}`);
          intact = false;
        }
      }
    }
    if (intact) ok(`${from} → ${to}: перенесено ${dst.length}, значения совпадают`);
    if (!same(before.tables[from], after.tables[from])) bad(`${from}: старая таблица изменилась, а она страховка`);
    else ok(`${from}: старая таблица оставлена нетронутой`);
  }

  // Настройки: активный профиль появился, остальное не поехало.
  const sBefore = (before.tables.settings ?? [])[0];
  const sAfter = (after.tables.settings ?? [])[0];
  if (!sAfter) bad('настройки исчезли');
  else {
    if (sAfter.activeProfileId !== ownerId) bad(`активный профиль ${sAfter.activeProfileId}, ожидался ${ownerId}`);
    else ok('активный профиль записан в настройки');
    for (const [field, value] of Object.entries(sBefore)) {
      if (field === 'activeProfileId') continue;
      if (!same(sAfter[field], value)) bad(`settings.${field}: было ${JSON.stringify(value)}, стало ${JSON.stringify(sAfter[field])}`);
    }
    ok('остальные настройки не тронуты');
  }

  // Разминка владельца лежала в meta — она нужна на экране тренировки.
  const warmupBefore = (before.tables.meta ?? []).find((r) => r.key === 'warmup');
  const warmupAfter = (after.tables.meta ?? []).find((r) => r.key === 'warmup');
  if (!same(warmupBefore?.value, warmupAfter?.value)) bad('разминка в meta изменилась');
  else ok('разминка владельца на месте');

  // И главное: приложение после миграции открывается на программе, а не на анкете.
  const text = await page.evaluate('document.body.innerText.replace(/\\s+/g, " ").trim()');
  if (text.includes('НАЧАТЬ ТРЕНИРОВКУ')) ok('главный экран открылся с программой владельца');
  else bad('после миграции главный экран не показал программу: ' + text.slice(0, 200));

  console.log('\n--- ПРОВЕРЕНО ---');
  for (const line of checks) console.log('  ✔', line);
  if (page.errors.length) {
    console.log('\nошибки консоли:');
    for (const e of page.errors) console.log('  !!', e);
    problems.push(`ошибок в консоли: ${page.errors.length}`);
  } else {
    console.log('\nошибок в консоли нет');
  }

  if (problems.length) {
    console.error('\n--- ДНЕВНИК ПОСТРАДАЛ ---');
    for (const p of problems) console.error('  !!', p);
    process.exitCode = 1;
  } else {
    console.log('\nдневник цел: все строки и поля на месте.');
  }
} catch (e) {
  console.error('СОРВАЛОСЬ:', e.message);
  process.exitCode = 1;
} finally {
  page.close();
}
