/** Снимает настройки, прогресс и урезание тренировки по времени. */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openPage, sleep } from './cdp.mjs';

const out = process.argv[2] ?? 'final.png';
const url = process.argv[3] ?? 'http://localhost:4173/';

const page = await openPage();
const shots = [];

const click = (text) => page.evaluate(`(() => {
  const hit = [...document.querySelectorAll('button, a')]
    .find((n) => (n.textContent || '').trim().includes(${JSON.stringify(text)}) && !n.disabled);
  if (!hit) return false; hit.click(); return true;
})()`);
const snap = async (title) => {
  const s = await page.call('Page.captureScreenshot', { format: 'png' });
  shots.push({ title, data: s.data });
};

try {
  await page.navigate(url + '#/', 2500);

  // Данные для графика веса тела: две недели взвешиваний.
  // Профиль браузера временный, в реальную базу это не попадает.
  await page.evaluate(`new Promise((resolve) => {
    const req = indexedDB.open('gym-app');
    req.onsuccess = () => {
      const dbx = req.result;
      const tx = dbx.transaction('bodyWeight', 'readwrite');
      const store = tx.objectStore('bodyWeight');
      const base = [67.1, 67.4, 67.2, 67.6, 67.5, 67.9, 68.0, 67.8, 68.2, 68.1, 68.5, 68.4, 68.7, 68.9];
      base.forEach((kg, i) => {
        const d = new Date(Date.now() - (base.length - 1 - i) * 86400000);
        store.put({ date: d.toISOString().slice(0, 10), kg });
      });
      tx.oncomplete = () => { dbx.close(); resolve(true); };
    };
  })`);

  await page.navigate(url + '#/progress', 1600);
  await snap('Прогресс — вес тела');

  await click('ОБХВАТЫ'); await sleep(400);
  for (let i = 0; i < 4; i++) { await click('+'); await sleep(60); }
  await snap('Прогресс — обхваты');

  await page.navigate(url + '#/settings', 1500);
  await snap('Настройки');

  await click('УПРАЖНЕНИЙ'); await sleep(500);
  await snap('Настройки — рабочие веса');

  await page.navigate(url + '#/workout', 1600);
  await click('К УПРАЖНЕНИЯМ'); await sleep(400);
  await click('К РАБОЧИМ ПОДХОДАМ'); await sleep(400);
  await click('ПРОПУСТИТЬ'); await sleep(300);
  await click('МАЛО ВРЕМЕНИ'); await sleep(400);
  await snap('Мало времени');

  const cards = shots.map((s) => `
    <figure style="margin:0">
      <figcaption style="color:#fff;font:600 13px -apple-system,sans-serif;margin:0 0 8px">${s.title}</figcaption>
      <img src="data:image/png;base64,${s.data}" style="width:390px;display:block;box-shadow:0 0 0 1px #303038">
    </figure>`).join('');
  const file = new URL('collage-final.html', pathToFileURL(out.replace(/[^/]+$/, '')));
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
