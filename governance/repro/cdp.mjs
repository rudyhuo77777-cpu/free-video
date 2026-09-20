// Minimal Chrome DevTools Protocol client. Node builtins + global WebSocket only.
// No new project dependency is introduced.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function findChrome() {
  if (process.env.FV_CHROME && fs.existsSync(process.env.FV_CHROME)) return process.env.FV_CHROME;
  if (process.platform === 'win32') {
    const wins = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];
    for (const w of wins) if (fs.existsSync(w)) return w;
  }
  const roots = [path.join(os.homedir(), '.cache/ms-playwright')];
  const found = [];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    for (const d of fs.readdirSync(r)) {
      const p = path.join(r, d, 'chrome-linux64/chrome');
      if (fs.existsSync(p)) found.push({ dir: d, path: p });
    }
  }
  if (!found.length) throw new Error('no_chrome_found');
  found.sort((a, b) => Number(b.dir.split('-')[1]) - Number(a.dir.split('-')[1]));
  return found[0].path;
}

export async function launch({ headless = true, extraArgs = [], port } = {}) {
  const exe = findChrome();
  const win = process.platform === 'win32';
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-chrome-'));
  const debugPort = port || (9400 + Math.floor(Math.random() * 400));
  const args = [
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${debugPort}`,
    '--no-first-run', '--no-default-browser-check',
    ...(extraArgs.includes('--__nodisablegpu') ? [] : ['--disable-gpu']),
    '--autoplay-policy=no-user-gesture-required',
    ...(win ? [] : ['--no-sandbox', '--disable-dev-shm-usage']),
    ...(headless ? ['--headless=new'] : []),
    ...extraArgs.filter(a => a !== '--__nodisablegpu'),
    'about:blank'
  ];
  const proc = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: !win });
  let exited = null;
  proc.on('exit', c => { exited = c; });
  proc.stderr.on('data', () => {});
  proc.stdout.on('data', () => {});
  const deadline = Date.now() + 40000;
  let wsUrl = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${debugPort}/json/version`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) { wsUrl = (await r.json()).webSocketDebuggerUrl; if (wsUrl) break; }
    } catch {}
    await new Promise(r => setTimeout(r, 400));
  }
  if (!wsUrl) { try { proc.kill('SIGKILL'); } catch {} throw new Error(`chrome_start_failed (exit=${exited}) port=${debugPort}`); }
  return {
    proc, wsUrl, userDataDir, exe, debugPort,
    kill: () => {
      try { if (win) spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); else process.kill(-proc.pid, 'SIGKILL'); } catch {}
      try { proc.kill('SIGKILL'); } catch {}
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    }
  };
}

export class Session {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Map(); this.sessionId = null; }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = e => rej(new Error('ws_error')); });
    const s = new Session(ws);
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && s.pending.has(msg.id)) {
        const { resolve, reject } = s.pending.get(msg.id); s.pending.delete(msg.id);
        msg.error ? reject(new Error(`${msg.error.message}${msg.error.data ? ': ' + msg.error.data : ''}`)) : resolve(msg.result);
      } else if (msg.method) {
        for (const fn of s.listeners.get(msg.method) || []) fn(msg.params, msg.sessionId);
      }
    };
    return s;
  }
  on(method, fn) { if (!this.listeners.has(method)) this.listeners.set(method, []); this.listeners.get(method).push(fn); }
  send(method, params = {}, sessionId = this.sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  async attachToPage() {
    const { targetInfos } = await this.send('Target.getTargets', {}, null);
    let target = targetInfos.find(t => t.type === 'page');
    if (!target) {
      const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' }, null);
      target = { targetId };
    }
    const { sessionId } = await this.send('Target.attachToTarget', { targetId: target.targetId, flatten: true }, null);
    this.sessionId = sessionId;
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    return sessionId;
  }
  async navigate(url) {
    const done = new Promise(res => { const h = () => res(); this.on('Page.loadEventFired', h); });
    await this.send('Page.navigate', { url });
    await Promise.race([done, new Promise(r => setTimeout(r, 30000))]);
  }
  async eval(expression, { awaitPromise = true, timeoutMs = 600000 } = {}) {
    const r = await Promise.race([
      this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, allowUnsafeEvalBlockedByCSP: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('eval_timeout')), timeoutMs))
    ]);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}
