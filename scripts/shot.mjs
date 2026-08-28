/**
 * Скриншот приложения в честной эмуляции телефона.
 * С флагом --offline проверяет, что приложение поднимается без сети.
 * Управляем Chrome по CDP через встроенный в Node WebSocket — без зависимостей.
 *
 *   node scripts/shot.mjs <url> <out.png> [--wait=1500] [--w=390] [--h=844] [--full]
 *
 * Печатает размеры документа, ошибки консоли и незакрытые промисы —
 * то есть отвечает не только «как выглядит», но и «не сломалось ли».
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};

const url = positional[0];
const out = positional[1];
if (!url || !out) {
  console.error('usage: node scripts/shot.mjs <url> <out.png> [--wait=ms] [--w=] [--h=] [--full]');
  process.exit(2);
}

const WAIT = flag('wait', 1500);
const WIDTH = flag('w', 390);
const HEIGHT = flag('h', 844);
const FULL = args.includes('--full');
const OFFLINE = args.includes('--offline');
const PORT = flag('port', 9333);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Минимальный CDP-клиент поверх встроенного WebSocket. */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg);
      }
    });
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('ws error')), { once: true });
    });
    return new CDP(ws);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(fn) { this.listeners.push(fn); }
}

const profile = mkdtempSync(join(tmpdir(), 'gym-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--disable-extensions', '--disable-background-networking', '--disable-sync',
  '--mute-audio', '--hide-scrollbars', '--window-size=1200,900',
], { stdio: 'ignore' });

let cdp;
let exitCode = 0;
try {
  // Ждём, пока поднимется отладочный порт.
  let version;
  for (let i = 0; i < 60; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      break;
    } catch { await sleep(250); }
  }
  if (!version) throw new Error('Chrome не поднял отладочный порт');

  cdp = await CDP.connect(version.webSocketDebuggerUrl);

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const call = (m, p) => cdp.send(m, p, sessionId);

  const consoleErrors = [];
  cdp.on((msg) => {
    if (msg.params?.sessionId && msg.params.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push('EXCEPTION: ' + (msg.params.exceptionDetails?.exception?.description
        || msg.params.exceptionDetails?.text));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push('console.error: ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  });

  await call('Runtime.enable');
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: 3, mobile: true,
  });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const loaded = new Promise((resolve) => {
    const stop = (msg) => { if (msg.method === 'Page.loadEventFired') resolve(); };
    cdp.on(stop);
  });
  await call('Page.navigate', { url });
  await Promise.race([loaded, sleep(15000)]);
  await sleep(WAIT);

  if (OFFLINE) {
    // Ждём, пока сервис-воркер возьмёт страницу под контроль, потом рубим сеть.
    const swReady = await call('Runtime.evaluate', {
      expression: `navigator.serviceWorker.ready.then(r => 'SW: ' + (r.active ? 'активен' : 'нет'))`,
      awaitPromise: true, returnByValue: true,
    });
    console.log(swReady.result.value);
    await sleep(1200);
    await call('Network.enable');
    await call('Network.emulateNetworkConditions', {
      offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
    });
    const reloaded = new Promise((resolve) => {
      cdp.on((msg) => { if (msg.method === 'Page.loadEventFired') resolve(); });
    });
    await call('Page.reload', { ignoreCache: false });
    await Promise.race([reloaded, sleep(15000)]);
    await sleep(WAIT);
    console.log('перезагружено при выключенной сети');
  }

  const probe = await call('Runtime.evaluate', {
    expression: `JSON.stringify({
      innerWidth: innerWidth,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      dpr: devicePixelRatio,
      text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 400)
    })`,
    returnByValue: true,
  });
  const info = JSON.parse(probe.result.value);

  const shot = await call('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: FULL,
    ...(FULL ? { clip: { x: 0, y: 0, width: WIDTH, height: info.scrollH, scale: 1 } } : {}),
  });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));

  console.log(`viewport ${info.innerWidth}  документ ${info.scrollW}x${info.scrollH}  dpr ${info.dpr}`);
  console.log(info.scrollW > info.innerWidth
    ? `!! горизонтальное переполнение: ${info.scrollW} > ${info.innerWidth}`
    : 'горизонтального переполнения нет');
  console.log(consoleErrors.length ? '!! ошибки:\n' + consoleErrors.join('\n') : 'ошибок в консоли нет');
  console.log('текст:', info.text);
  console.log('→', out);
} catch (e) {
  console.error('ОШИБКА:', e.message);
  exitCode = 1;
} finally {
  try { cdp?.ws.close(); } catch {}
  chrome.kill('SIGKILL');
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(exitCode);
}
