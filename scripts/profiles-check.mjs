/**
 * Проверяет профили в настоящем браузере: заводит двух человек, смотрит,
 * что их дневники не смешались, пересчитывает веса и удаляет профиль.
 *
 *   npx vite preview --port 4173
 *   node scripts/profiles-check.mjs [url]
 *
 * Всё, что здесь утверждается, читается прямо из IndexedDB, а не с экрана:
 * экран может показать что угодно, а на диске лежит правда.
 */
import { openPage, sleep } from './cdp.mjs';

const url = process.argv[2] ?? 'http://localhost:4173/#/';

const problems = [];
const checks = [];
const ok = (what) => checks.push(what);
const bad = (what) => problems.push(what);

const page = await openPage();

/** Чтение базы как она есть: без Dexie и без доверия к интерфейсу. */
const snapshot = () => page.evaluate(`(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('gym-app');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const out = {};
  for (const name of [...db.objectStoreNames]) {
    out[name] = await new Promise((res, rej) => {
      const r = db.transaction(name, 'readonly').objectStore(name).getAll();
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  db.close();
  return JSON.stringify(out);
})()`).then(JSON.parse);

const text = () => page.evaluate('document.body.innerText.replace(/\\s+/g, " ").trim()');

/** Нажатие по тексту из самой страницы — надёжнее координат. */
const click = (what, exact = false) => page.evaluate(`(() => {
  const want = ${JSON.stringify(what)};
  const hit = [...document.querySelectorAll('button, a')].find((n) => {
    const t = (n.textContent || '').trim();
    return (${exact ? 't === want' : 't.includes(want)'}) && !n.disabled;
  });
  if (!hit) return false;
  hit.click();
  return true;
})()`);

const must = async (what, exact = false) => {
  if (!(await click(what, exact))) {
    throw new Error(`не нашёл кнопку «${what}». На экране: ${(await text()).slice(0, 180)}`);
  }
  await sleep(320);
};

/**
 * Проход анкеты до конца. Значения по умолчанию оставляем как есть —
 * это заодно проверяет, что анкету можно пройти вообще не печатая.
 */
async function fillWizard({ source, sex = 'm' }) {
  for (let step = 0; step < 12; step++) {
    const body = await text();
    if (body.includes('Это первая прикидка')) break;

    if (body.includes('Откуда взять программу')) {
      await must(source === 'seed' ? 'Взять готовую программу' : 'Собрать под меня');
    }
    if (body.includes('Пол и год рождения') && sex === 'f') await must('Женский');

    if (!(await click('ДАЛЬШЕ'))) break;
    await sleep(280);
  }
  if (!(await text()).includes('Это первая прикидка')) {
    throw new Error(`анкета не довела до итога. На экране: ${(await text()).slice(0, 180)}`);
  }
  await must('НАЧАТЬ', true);
  await sleep(900);
}

const rowsOf = (table, profileId) => (table ?? []).filter((r) => r.profileId === profileId);

try {
  await page.navigate(url, 2500);

  /* ---------- первый человек: программа собирается под него ---------- */

  if (!(await text()).includes('Откуда взять программу')) {
    throw new Error('на пустой базе не открылась анкета профиля');
  }
  ok('на первом запуске открывается создание профиля');

  // Женщина 165/58 со стажем меньше года: расчёт обязан дать меньше,
  // а на итоге — усиленное предупреждение о точности.
  await fillWizard({ source: 'generated', sex: 'f' });

  let snap = await snapshot();
  const first = snap.profiles?.[0];
  if (!first) throw new Error('профиль не создался');
  ok(`профиль собран генератором: ${first.name}, источник ${first.source}`);

  const firstDays = rowsOf(snap.days, first.id);
  const firstEx = rowsOf(snap.exercises, first.id);
  const firstState = rowsOf(snap.exerciseState, first.id);
  if (firstDays.length !== first.daysPerWeek) bad(`дней ${firstDays.length}, выбрано ${first.daysPerWeek}`);
  else ok(`дней в программе ${firstDays.length}`);
  if (firstEx.length < 10) bad(`упражнений всего ${firstEx.length}`);
  else ok(`упражнений собрано ${firstEx.length}`);
  if (firstState.length !== firstEx.length) bad(`состояний ${firstState.length} на ${firstEx.length} упражнений`);
  else ok('у каждого упражнения есть стартовый вес');
  if (firstState.some((s) => s.currentWeight < 0)) bad('есть отрицательный стартовый вес');
  if (!firstState.some((s) => s.currentWeight > 0)) bad('все стартовые веса нулевые — расчёт не сработал');
  else ok('стартовые веса посчитаны');

  // Запишем вес тела: он должен лечь именно этому профилю.
  await must('ПРОГРЕСС');
  await must('ЗАПИСАТЬ ВЕС');
  await sleep(400);
  snap = await snapshot();
  if (rowsOf(snap.weightLog, first.id).length !== 1) bad('вес тела не записался в профиль');
  else ok('вес тела записан профилю');

  /* ---------- второй человек: берёт готовую программу ---------- */

  await must('НАСТРОЙКИ');
  await must('ДОБАВИТЬ ПРОФИЛЬ');
  await sleep(300);
  await fillWizard({ source: 'seed' });

  snap = await snapshot();
  if ((snap.profiles ?? []).length !== 2) throw new Error(`профилей ${(snap.profiles ?? []).length}, ожидалось два`);
  const second = snap.profiles.find((p) => p.id !== first.id);
  ok(`второй профиль создан, источник ${second.source}`);

  const secondEx = rowsOf(snap.exercises, second.id);
  if (secondEx.length < 10) bad(`у второго профиля упражнений ${secondEx.length}`);
  else ok(`у второго профиля своя программа: ${secondEx.length} упражнений`);

  // Главное требование: дневники не пересекаются.
  const crossing = secondEx.filter((ex) => firstEx.some((f) => f.id === ex.id));
  if (crossing.length) bad(`упражнения двух профилей делят ключи: ${crossing.length}`);
  else ok('ключи упражнений у профилей не пересекаются');

  const firstStillThere = rowsOf(snap.exercises, first.id).length;
  if (firstStillThere !== firstEx.length) bad(`программа первого профиля изменилась: было ${firstEx.length}, стало ${firstStillThere}`);
  else ok('появление второго профиля не тронуло первый');

  if (rowsOf(snap.weightLog, second.id).length !== 0) bad('второму профилю досталось чужое взвешивание');
  else ok('вес тела первого человека второму не виден');

  const secondProgress = (snap.progress ?? []).find((p) => p.profileId === second.id);
  if (!secondProgress || secondProgress.dayQueueIndex !== 0) bad('у второго профиля не свой счёт недель и дней');
  else ok('счёт недель и очередь дней у каждого свои');

  const settings = (snap.settings ?? [])[0];
  if (settings?.activeProfileId !== second.id) bad('после создания активным остался не новый профиль');
  else ok('новый профиль стал активным');

  /* ---------- пересчёт весов ---------- */

  // Считаем на готовой программе: её веса заданы вживую под другого человека,
  // поэтому расчёт под нынешние данные обязан дать другие числа. На собранной
  // программе пересчёт по определению даёт то же самое — там проверять нечего.
  await must('НАСТРОЙКИ');
  await sleep(300);
  await must('ПЕРЕСЧИТАТЬ ВЕСА ПОД МОИ ДАННЫЕ');
  await sleep(600);

  const preview = await text();
  if (!preview.includes('Пересчёт весов')) bad('предпросмотр пересчёта не открылся');
  else if (!preview.includes('БЫЛО') || !preview.includes('СТАНЕТ')) {
    bad(`в предпросмотре нет таблицы «было → станет»: ${preview.slice(0, 160)}`);
  } else ok('предпросмотр «было → станет» показан до применения');

  const statesBefore = rowsOf((await snapshot()).exerciseState, second.id);
  const historyBefore = ((await snapshot()).exerciseResults ?? []).length;
  const weightsBefore = statesBefore.map((s) => s.currentWeight).join(',');

  if (preview.includes('ПРИМЕНИТЬ')) {
    await must('ПРИМЕНИТЬ');
    await sleep(700);
    const after = await snapshot();
    const statesAfter = rowsOf(after.exerciseState, second.id);
    if (statesAfter.length !== statesBefore.length) bad('пересчёт потерял состояния упражнений');
    else ok(`пересчёт применён, состояний по-прежнему ${statesAfter.length}`);
    if (statesAfter.map((s) => s.currentWeight).join(',') === weightsBefore) {
      bad('пересчёт применился, а веса не изменились');
    } else ok('веса изменились ровно после подтверждения, не раньше');
    if ((after.exerciseResults ?? []).length !== historyBefore) bad('пересчёт тронул историю тренировок');
    else ok('история тренировок пересчётом не тронута');
  } else {
    bad('на готовой программе пересчёт не предложил ни одного изменения');
    await must('вернуться');
  }

  /* ---------- переключение ---------- */

  await must('НАСТРОЙКИ');
  await sleep(300);
  await must('ПЕРЕКЛЮЧИТЬ');
  await sleep(600);
  snap = await snapshot();
  if ((snap.settings ?? [])[0]?.activeProfileId !== first.id) bad('переключение профиля не сработало');
  else ok('переключение профиля работает');

  /* ---------- удаление ---------- */

  if (!(await click('УДАЛИТЬ ПРОФИЛЬ'))) throw new Error('нет кнопки удаления профиля');
  await sleep(400);
  const warn = await text();
  if (!warn.includes('уйдут его тренировки')) bad('при удалении не сказано, что уходят тренировки');
  else ok('удаление предупреждает про тренировки, и это экран, а не системное окно');

  await must('ДА, УДАЛИТЬ ВМЕСТЕ С ТРЕНИРОВКАМИ');
  await sleep(900);

  snap = await snapshot();
  if ((snap.profiles ?? []).length !== 1) bad(`после удаления профилей ${(snap.profiles ?? []).length}`);
  else ok('профиль удалён');

  for (const table of ['days', 'exercises', 'exerciseState', 'sessions', 'setLogs', 'exerciseResults', 'weightLog', 'girthLog', 'progress']) {
    const left = rowsOf(snap[table], first.id).length;
    if (left) bad(`${table}: после удаления осталось строк удалённого профиля ${left}`);
  }
  ok('за удалённым профилем не осталось хвостов');

  const survivor = rowsOf(snap.exercises, second.id).length;
  if (survivor !== secondEx.length) bad(`у оставшегося профиля было ${secondEx.length} упражнений, стало ${survivor}`);
  else ok('дневник оставшегося профиля цел');

  console.log('--- ПРОВЕРЕНО ---');
  for (const line of checks) console.log('  ✔', line);
  if (page.errors.length) {
    console.log('\nошибки консоли:');
    for (const e of page.errors) console.log('  !!', e);
    problems.push(`ошибок в консоли: ${page.errors.length}`);
  } else console.log('\nошибок в консоли нет');

  if (problems.length) {
    console.error('\n--- НЕ СОШЛОСЬ ---');
    for (const p of problems) console.error('  !!', p);
    process.exitCode = 1;
  } else console.log('\nпрофили работают: данные разделены, пересчёт и удаление ведут себя как обещано.');
} catch (e) {
  console.error('СОРВАЛОСЬ:', e.message);
  for (const line of checks) console.error('  ✔', line);
  process.exitCode = 1;
} finally {
  page.close();
}
