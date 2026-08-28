/** Проходит день A целиком и снимает новые экраны дня B. */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openPage, sleep } from './cdp.mjs';

const out = process.argv[2] ?? 'test.png';
const url = process.argv[3] ?? 'http://localhost:4173/#/';

const page = await openPage();
const shots = [];

const click = (text) => page.evaluate(`(() => {
  const hit = [...document.querySelectorAll('button, a')]
    .find((n) => (n.textContent || '').trim().includes(${JSON.stringify(text)}) && !n.disabled);
  if (!hit) return false; hit.click(); return true;
})()`);
const body = () => page.evaluate('document.body.innerText.replace(/\\s+/g, " ").trim()');
const snap = async (title) => {
  const s = await page.call('Page.captureScreenshot', { format: 'png' });
  shots.push({ title, data: s.data });
};

try {
  await page.navigate(url, 2500);

  // Проходим день A на автомате, чтобы очередь дошла до дня B.
  for (let i = 0; i < 400; i++) {
    if ((await page.evaluate('location.hash')).includes('/summary/')) break;
    const t = await body();
    if (t.includes('МОГ БЫ СДЕЛАТЬ ЕЩЁ')) {
      await page.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '2')?.click()`);
      await sleep(50);
      if (!(await click('ПОДХОД'))) await click('ЗАКОНЧИТЬ');
    } else if (t.includes('+30 СЕК')) {
      if (!(await click('ПОДХОД'))) await click('ЗАКОНЧИТЬ');
    } else {
      for (const l of ['НАЧАТЬ ТРЕНИРОВКУ', 'К УПРАЖНЕНИЯМ', 'К РАБОЧИМ ПОДХОДАМ', 'ВЫПОЛНИЛ']) {
        if (t.includes(l)) { await click(l); break; }
      }
    }
    await sleep(130);
  }
  await click('ГОТОВО'); await sleep(900);

  await click('НАЧАТЬ ТРЕНИРОВКУ'); await sleep(700);
  await click('К УПРАЖНЕНИЯМ'); await sleep(500);
  await snap('Обязательная разминка дня B');
  await click('всё равно пропустить'); await sleep(400);

  // Доходим до подтягиваний — четвёртое упражнение дня B.
  for (let i = 0; i < 200; i++) {
    const t = await body();
    if (t.includes('ТЕСТ МАКСИМУМА')) break;
    if (t.includes('МОГ БЫ СДЕЛАТЬ ЕЩЁ')) {
      await page.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '2')?.click()`);
      await sleep(50);
      if (!(await click('ПОДХОД'))) await click('ЗАКОНЧИТЬ');
    } else if (t.includes('+30 СЕК')) {
      if (!(await click('ПОДХОД'))) await click('ЗАКОНЧИТЬ');
    } else {
      for (const l of ['К РАБОЧИМ ПОДХОДАМ', 'ВЫПОЛНИЛ']) {
        if (t.includes(l)) { await click(l); break; }
      }
    }
    await sleep(130);
  }
  await snap('Тест подтягиваний');
  for (let i = 0; i < 3; i++) { await click('+'); await sleep(60); }
  await snap('Восемь раз — работаем подтягиваниями');

  const cards = shots.map((s) => `
    <figure style="margin:0">
      <figcaption style="color:#fff;font:600 13px -apple-system,sans-serif;margin:0 0 8px">${s.title}</figcaption>
      <img src="data:image/png;base64,${s.data}" style="width:390px;display:block;box-shadow:0 0 0 1px #303038">
    </figure>`).join('');
  const file = new URL('collage-test.html', pathToFileURL(out.replace(/[^/]+$/, '')));
  writeFileSync(file, `<!doctype html><meta charset="utf-8">
    <body style="margin:0;padding:24px;background:#3a3f47;display:flex;gap:20px">${cards}</body>`);
  await page.call('Emulation.setDeviceMetricsOverride', {
    width: 390 * shots.length + 48 + 20 * (shots.length - 1), height: 940,
    deviceScaleFactor: 1, mobile: false });
  await page.navigate(file.href, 1200);
  const final = await page.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(out, Buffer.from(final.data, 'base64'));
  console.log('снимков:', shots.length, '→', out);
  console.log('ошибки:', page.errors.length ? page.errors.join('\n') : 'нет');
} catch (e) {
  console.error('СОРВАЛОСЬ:', e.message);
  process.exitCode = 1;
} finally { page.close(); }
