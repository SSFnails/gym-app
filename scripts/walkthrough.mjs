/**
 * Прогоняет тренировку насквозь в настоящем браузере: разминка, все подходы,
 * связки, запас, итог. Печатает, что алгоритм поставил на следующую сессию.
 *
 *   node scripts/walkthrough.mjs [url] [--rir=2] [--reps-short]
 */
import { openPage, sleep } from './cdp.mjs';

const url = process.argv[2] ?? 'http://localhost:4173/#/';
const rirArg = process.argv.find((a) => a.startsWith('--rir='));
const RIR = rirArg ? rirArg.split('=')[1] : '2';
const SHORT = process.argv.includes('--reps-short');
const sessArg = process.argv.find((a) => a.startsWith('--sessions='));
const SESSIONS = sessArg ? Number(sessArg.split('=')[1]) : 1;

const page = await openPage();

/** Ищем кнопку по тексту и жмём её из самой страницы — надёжнее координат. */
const clickText = (text, exact = false) => page.evaluate(`(() => {
  const want = ${JSON.stringify(text)};
  const nodes = [...document.querySelectorAll('button, a')];
  const hit = nodes.find((n) => {
    const t = (n.textContent || '').trim();
    return ${exact ? 't === want' : 't.includes(want)'} && !n.disabled;
  });
  if (!hit) return false;
  hit.click();
  return true;
})()`);

const text = () => page.evaluate('document.body.innerText.replace(/\\s+/g, " ").trim()');
const here = () => page.evaluate('location.hash');

try {
  // Профиль браузера каждый раз новый, поэтому IndexedDB и так пуста.
  // Удалять её на живой странице нельзя: запрос виснет до закрытия соединения
  // и срабатывает уже после того, как приложение залило сид заново.
  await page.navigate(url, 2500);

  for (let session = 1; session <= SESSIONS; session++) {
  let steps = 0;
  let sets = 0;
  const log = [];
  console.log(`\n======== ТРЕНИРОВКА ${session} ========`);

  while (steps++ < 400) {
    const hash = await here();
    if (hash.includes('/summary/')) break;

    const body = await text();

    if (body.includes('МОГ БЫ СДЕЛАТЬ ЕЩЁ')) {
      await clickText(RIR, true);
      await sleep(60);
      if (!(await clickText('ПОДХОД')) && !(await clickText('ЗАКОНЧИТЬ'))) {
        throw new Error('после запаса некуда идти: ' + body.slice(0, 160));
      }
      sets++;
      await sleep(120);
      continue;
    }

    // Отдых без вопроса про запас — у упражнений вне автопрогрессии.
    // Опознаём по кнопке: слово «отдых» есть и на экране связки.
    if (body.includes('+30 СЕК')) {
      if (!(await clickText('ПОДХОД')) && !(await clickText('ЗАКОНЧИТЬ'))) {
        throw new Error('с отдыха некуда идти: ' + body.slice(0, 160));
      }
      sets++;
      await sleep(120);
      continue;
    }

    if (body.includes('Не отмечено сгибание ног')) {
      await clickText('всё равно пропустить');
      log.push('предупреждение о разминке показано');
      await sleep(250);
      continue;
    }

    if (body.includes('ТЕСТ МАКСИМУМА')) {
      await clickText('ЗАПИСАТЬ РЕЗУЛЬТАТ');
      log.push('тест подтягиваний пройден');
      await sleep(400);
      continue;
    }

    if (body.includes('НАЧАТЬ ТРЕНИРОВКУ')) { await clickText('НАЧАТЬ ТРЕНИРОВКУ'); await sleep(600); continue; }
    if (body.includes('К УПРАЖНЕНИЯМ'))     { await clickText('К УПРАЖНЕНИЯМ');     await sleep(250); continue; }
    if (body.includes('К РАБОЧИМ ПОДХОДАМ')) { await clickText('К РАБОЧИМ ПОДХОДАМ'); await sleep(250); continue; }

    if (body.includes('ВЫПОЛНИЛ')) {
      // По желанию занижаем повторы, чтобы проверить ветку отката.
      if (SHORT && body.includes('СДЕЛАЛ МЕНЬШЕ')) {
        for (let i = 0; i < 3; i++) { await clickText('СДЕЛАЛ МЕНЬШЕ'); await sleep(30); }
      }
      const m = /ПОДХОД (\d+) ИЗ (\d+)/.exec(body);
      if (m) log.push(`подход ${m[1]}/${m[2]}`);
      await clickText('ВЫПОЛНИЛ');
      await sleep(200);
      continue;
    }

    throw new Error('непонятный экран: ' + body.slice(0, 200));
  }

  const hash = await here();
  if (!hash.includes('/summary/')) throw new Error('до итога не дошли, шагов: ' + steps);

  await sleep(900);
  console.log('ПРОШЛИ ПОДХОДОВ:', sets, '· шагов:', steps);
  if (log.length) console.log('по пути:', log.filter((l) => !l.startsWith('подход')).join(', ') || '—');
  console.log('\n--- ИТОГ ---\n' + (await text()));
  if (session < SESSIONS) { await clickText('ГОТОВО'); await sleep(900); }
  }
  console.log('\nошибки консоли:', page.errors.length ? '\n' + page.errors.join('\n') : 'нет');
} catch (e) {
  console.error('СОРВАЛОСЬ:', e.message);
  process.exitCode = 1;
} finally {
  page.close();
}
