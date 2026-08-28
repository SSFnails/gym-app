/**
 * Снимает ключевые экраны тренировки и складывает их в один коллаж.
 * Коллаж собираем той же страницей браузера — сторонних библиотек нет.
 *
 *   node scripts/shots.mjs <out.png> [url]
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openPage, sleep } from './cdp.mjs';

const out = process.argv[2] ?? 'shots.png';
const url = process.argv[3] ?? 'http://localhost:4173/#/';

const page = await openPage();
const shots = [];

const click = (text) => page.evaluate(`(() => {
  const want = ${JSON.stringify(text)};
  const hit = [...document.querySelectorAll('button, a')]
    .find((n) => (n.textContent || '').trim().includes(want) && !n.disabled);
  if (!hit) return false;
  hit.click();
  return true;
})()`);

const body = () => page.evaluate('document.body.innerText.replace(/\\s+/g, " ").trim()');

async function snap(title) {
  const shot = await page.call('Page.captureScreenshot', { format: 'png' });
  shots.push({ title, data: shot.data });
}

try {
  await page.navigate(url, 2500);

  await click('НАЧАТЬ ТРЕНИРОВКУ'); await sleep(700);
  await snap('Общая разминка');

  await click('К УПРАЖНЕНИЯМ'); await sleep(400);
  await snap('Разминочные подходы');

  await click('К РАБОЧИМ ПОДХОДАМ'); await sleep(400);
  await snap('Рабочий подход');

  await click('ВЫПОЛНИЛ'); await sleep(400);
  await snap('Связка, без отдыха');

  await click('ВЫПОЛНИЛ'); await sleep(1400);
  await snap('Отдых и запас');

  // Доходим до итога обычным путём.
  for (let i = 0; i < 400; i++) {
    if ((await page.evaluate('location.hash')).includes('/summary/')) break;
    const text = await body();
    if (text.includes('МОГ БЫ СДЕЛАТЬ ЕЩЁ')) {
      await page.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '2')?.click()`);
      await sleep(60);
      if (!(await click('ПОДХОД'))) await click('ЗАКОНЧИТЬ');
      await sleep(120);
      continue;
    }
    for (const label of ['К РАБОЧИМ ПОДХОДАМ', 'К УПРАЖНЕНИЯМ', 'ВЫПОЛНИЛ']) {
      if (text.includes(label)) { await click(label); break; }
    }
    await sleep(150);
  }
  await sleep(900);
  await snap('Итог тренировки');

  // Коллаж: складываем снимки в обычную страницу и фотографируем её.
  const cards = shots.map((s) => `
    <figure style="margin:0">
      <figcaption style="color:#fff;font:600 13px -apple-system,sans-serif;margin:0 0 8px">${s.title}</figcaption>
      <img src="data:image/png;base64,${s.data}" style="width:390px;display:block;box-shadow:0 0 0 1px #303038">
    </figure>`).join('');
  const html = `<!doctype html><meta charset="utf-8">
    <body style="margin:0;padding:24px;background:#3a3f47;display:flex;gap:20px">${cards}</body>`;
  const file = new URL('collage.html', pathToFileURL(out.replace(/[^/]+$/, '')));
  writeFileSync(file, html);

  await page.call('Emulation.setDeviceMetricsOverride', {
    width: 390 * shots.length + 24 * 2 + 20 * (shots.length - 1),
    height: 940, deviceScaleFactor: 1, mobile: false,
  });
  await page.navigate(file.href, 1500);

  const final = await page.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(out, Buffer.from(final.data, 'base64'));
  console.log('снимков:', shots.length, '→', out);
  console.log('ошибки консоли:', page.errors.length ? page.errors.join('\n') : 'нет');
} catch (e) {
  console.error('СОРВАЛОСЬ:', e.message);
  process.exitCode = 1;
} finally {
  page.close();
}
