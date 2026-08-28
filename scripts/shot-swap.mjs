/** Снимает разминку и замену упражнения: список альтернатив и результат выбора. */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openPage, sleep } from './cdp.mjs';

const out = process.argv[2] ?? 'swap.png';
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

async function snap(title) {
  const shot = await page.call('Page.captureScreenshot', { format: 'png' });
  shots.push({ title, data: shot.data });
}

try {
  await page.navigate(url, 2500);
  await click('НАЧАТЬ ТРЕНИРОВКУ'); await sleep(600);
  await click('К УПРАЖНЕНИЯМ');     await sleep(400);
  await snap('Разминочные подходы');

  await click('К РАБОЧИМ ПОДХОДАМ'); await sleep(400);
  await snap('Рабочий подход');

  await click('ЗАМЕНИТЬ'); await sleep(500);
  await snap('Чем заменить');

  // Берём второй вариант — у становой это тяга с плинтов.
  await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('button')]
      .filter((b) => b.textContent.includes('кг ×'));
    rows[1]?.click();
  })()`);
  await sleep(900);
  await snap('После замены');

  const cards = shots.map((s) => `
    <figure style="margin:0">
      <figcaption style="color:#fff;font:600 13px -apple-system,sans-serif;margin:0 0 8px">${s.title}</figcaption>
      <img src="data:image/png;base64,${s.data}" style="width:390px;display:block;box-shadow:0 0 0 1px #303038">
    </figure>`).join('');
  const file = new URL('collage-swap.html', pathToFileURL(out.replace(/[^/]+$/, '')));
  writeFileSync(file, `<!doctype html><meta charset="utf-8">
    <body style="margin:0;padding:24px;background:#3a3f47;display:flex;gap:20px">${cards}</body>`);

  await page.call('Emulation.setDeviceMetricsOverride', {
    width: 390 * shots.length + 48 + 20 * (shots.length - 1), height: 940,
    deviceScaleFactor: 1, mobile: false,
  });
  await page.navigate(file.href, 1200);
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
