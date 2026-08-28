/** Минимальный клиент Chrome DevTools Protocol на встроенном в Node WebSocket. */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/**
 * Поднимает headless Chrome и отдаёт страницу с эмуляцией телефона.
 * Возвращает { call, on, evaluate, close, errors }.
 */
export async function openPage({ width = 390, height = 844, port = 0 } = {}) {
  // Порт свой на каждый запуск: иначе новый прогон молча подключается
  // к недобитому браузеру от прошлого и работает в его профиле.
  if (!port) port = 9400 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), 'gym-cdp-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions',
    '--disable-background-networking', '--disable-sync', '--mute-audio', '--hide-scrollbars',
    '--window-size=1200,900',
  ], { stdio: 'ignore', detached: true });

  let version;
  for (let i = 0; i < 60 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); }
    catch { await sleep(250); }
  }
  if (!version) {
    try { process.kill(-chrome.pid, 'SIGKILL'); } catch { /* уже мёртв */ }
    throw new Error('Chrome не поднял отладочный порт');
  }

  const cdp = await CDP.connect(version.webSocketDebuggerUrl);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const call = (m, p) => cdp.send(m, p, sessionId);

  const errors = [];
  cdp.on((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push('EXCEPTION: ' + (msg.params.exceptionDetails?.exception?.description
        || msg.params.exceptionDetails?.text));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push('console.error: ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  });

  await call('Runtime.enable');
  await call('Page.enable');

  // Любое системное окно вешает страницу насмерть — закрываем сами,
  // иначе прогон молча висит и не понять, где.
  cdp.on((msg) => {
    if (msg.method === 'Page.javascriptDialogOpening') {
      errors.push('СИСТЕМНОЕ ОКНО: ' + msg.params.message);
      void call('Page.handleJavaScriptDialog', { accept: true });
    }
  });
  await call('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 3, mobile: true,
  });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const evaluate = async (expression) => {
    const res = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
    return res.result.value;
  };

  const navigate = async (url, wait = 1200) => {
    const loaded = new Promise((resolve) => {
      cdp.on((msg) => { if (msg.method === 'Page.loadEventFired') resolve(); });
    });
    await call('Page.navigate', { url });
    await Promise.race([loaded, sleep(15000)]);
    await sleep(wait);
  };

  const close = () => {
    try { cdp.ws.close(); } catch { /* уже закрыт */ }
    // Убиваем всю группу: Chrome плодит вспомогательные процессы,
    // и они переживают убийство одного родителя.
    try { process.kill(-chrome.pid, 'SIGKILL'); } catch { /* уже мёртв */ }
    try { chrome.kill('SIGKILL'); } catch { /* уже мёртв */ }
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* не критично */ }
  };

  return { call, on: cdp.on.bind(cdp), evaluate, navigate, close, errors, width, height };
}
