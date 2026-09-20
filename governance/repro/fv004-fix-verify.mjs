// T3-4: verifies the FV-004 fix against the REAL built page + REAL worker + SQLite adapter.
// AI is a deterministic fixture. No remote AI, no production D1.
import fs from 'node:fs';
import path from 'node:path';
import { D1Adapter } from '../../tests/helpers.mjs';
import { makeFixtureAi } from './fixture-director.mjs';
import { startStack } from './local-stack.mjs';
import { launch, Session } from './cdp.mjs';

const outDir = path.resolve(import.meta.dirname, '../../evidence/dev/STEP-3/T3-4/artifacts');
fs.mkdirSync(outDir, { recursive: true });

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
function providerStub(origin) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('api.openverse.org')) return new Response(JSON.stringify({ results: [{ id: 'fx', license: 'cc0', thumbnail: `${origin}/fixture-asset.png`, url: `${origin}/fixture-asset.png`, foreign_landing_url: 'https://example.invalid/fx', creator: 'Fixture Author', width: 900, height: 1600 }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.includes('commons.wikimedia.org')) return new Response(JSON.stringify({ query: { pages: {} } }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.startsWith(origin)) return real(url, init);
    return new Response('{}', { status: 503 });
  };
  return () => { globalThis.fetch = real; };
}

// Drops the completion receipt AFTER the write commits, N times.
function faultDb(base, ctrl) {
  const COMPLETE = /UPDATE script_requests SET status='completed'/;
  return {
    prepare(sql) {
      const stmt = base.prepare(sql);
      if (!COMPLETE.test(sql)) return stmt;
      const wrap = s => ({ ...s, bind: (...v) => wrap(s.bind(...v)),
        async first(c) { const r = await s.first(c); if (ctrl.dropAcks > 0) { ctrl.dropAcks--; ctrl.dropped++; throw new Error('lost_ack_injected'); } return r; } });
      return wrap(stmt);
    },
    batch: (...a) => base.batch(...a)
  };
}

const CLICK = `(async () => {
  const btn = [...document.querySelectorAll('button.primary-btn')].find(b => !b.disabled);
  if (!btn) return { clicked: false };
  btn.click();
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (i > 4 && ![...document.querySelectorAll('button.primary-btn')].some(b => b.disabled)) break;
  }
  await new Promise(r => setTimeout(r, 900));
  return {
    clicked: true,
    hasDirector: document.body.innerText.includes('Director JSON') || document.querySelectorAll('.scene-card, [class*=scene]').length > 0,
    errorVisible: document.querySelectorAll('.error').length > 0,
    nodeCount: document.querySelectorAll('body *').length,
    text: document.body.innerText.slice(0, 400)
  };
})()`;
const SET_NAME = v => `(() => { const i = document.querySelector('input.input'); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event('input',{bubbles:true})); return i.value; })()`;

const report = { task: 'T3-4 FV-004 fix verification', recordedAt: new Date().toISOString(), cases: [] };

async function runCase(id, note, fn, { freeLimit = '3', disableSessionStorage = false } = {}) {
  const base = new D1Adapter();
  const ctrl = { dropAcks: 0, dropped: 0, blockStatusGets: 0, blockedGets: 0 };
  const fixtureAi = makeFixtureAi();
  const stack = await startStack({
    db: faultDb(base, ctrl), ai: fixtureAi.binding, extraEnv: { FREE_SCRIPT_LIMIT: freeLimit },
    beforeApi: ({ method, path: p }) => {
      if (method === 'GET' && /^\/api\/scripts\/jobs\//.test(p) && ctrl.blockStatusGets > 0) {
        ctrl.blockStatusGets--; ctrl.blockedGets++;
        return { status: 503, body: JSON.stringify({ error: 'transport_fault_injected' }) };
      }
      return null;
    },
    staticRoutes: { '/fixture-asset.png': { body: PIXEL, headers: { 'content-type': 'image/png' } } }
  });
  const browser = await launch();
  const restoreFetch = providerStub(stack.origin);
  const snap = () => ({
    completed: base.sqlite.prepare("SELECT COUNT(*) n FROM script_requests WHERE status='completed'").get().n,
    rows: base.sqlite.prepare('SELECT idempotency_key,status,quota_charged FROM script_requests ORDER BY created_at').all().length,
    keys: base.sqlite.prepare('SELECT idempotency_key FROM script_requests').all().map(r => r.idempotency_key),
    used: Number((base.sqlite.prepare('SELECT used FROM guest_quota LIMIT 1').get() || { used: 0 }).used),
    aiCalls: fixtureAi.counter.calls
  });
  let result;
  try {
    const s = await Session.connect(browser.wsUrl);
    await s.attachToPage();
    const consoleErrors = [];
    s.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') consoleErrors.push((p.args || []).map(a => a.value ?? a.description).join(' ')); });
    if (disableSessionStorage) {
      await s.send('Page.addScriptToEvaluateOnNewDocument', { source:
        `Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw new DOMException('denied','SecurityError');}});` });
    }
    result = await fn({ s, stack, ctrl, snap, browser });
    result.consoleErrors = consoleErrors;
    s.close();
  } finally { browser.kill(); restoreFetch(); await stack.close(); base.close(); }
  report.cases.push({ id, note, ...result });
  console.error(`[case] ${id} done`);
}

const settle = (s, ms) => s.eval(`new Promise(r=>setTimeout(r,${ms}))`);

// 3.1 / 3.2 — the audit scenario: the first click cannot recover in-flight (the replay call
// is blocked too), so the user sees an error and clicks again with the SAME input.
await runCase('C1-lost-ack-then-same-input', '丢完成回执且重放也失败 → 用户看到错误后以相同输入重试', async ({ s, stack, ctrl, snap }) => {
  await s.navigate(`${stack.origin}/video`); await settle(s, 1500);
  ctrl.dropAcks = 1; ctrl.blockStatusGets = 5;   // first click: receipt lost AND replay unavailable
  const first = await s.eval(CLICK, { timeoutMs: 200000 });
  const afterFirst = snap();
  const shot1 = await s.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'C1-after-first.png'), Buffer.from(shot1.data, 'base64'));
  ctrl.blockStatusGets = 0;                       // second click: replay is available again
  const second = await s.eval(CLICK, { timeoutMs: 200000 });
  const afterSecond = snap();
  const shot2 = await s.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'C1-after-retry.png'), Buffer.from(shot2.data, 'base64'));
  return { droppedAcks: ctrl.dropped, blockedGets: ctrl.blockedGets, first, afterFirst, second, afterSecond,
    verdict: afterFirst.aiCalls === 1 && first.errorVisible === true
      && afterSecond.aiCalls === 1 && afterSecond.completed === 1 && afterSecond.used === 1
      && second.errorVisible === false ? 'PASS' : 'FAIL' };
});

// The fixed in-flight path: when the replay IS reachable, the very first click recovers and
// the user never sees the error at all. This must also cost exactly one script.
await runCase('C1b-lost-ack-recovers-in-flight', '丢完成回执但重放可用 → 首次点击即恢复', async ({ s, stack, ctrl, snap }) => {
  await s.navigate(`${stack.origin}/video`); await settle(s, 1500);
  ctrl.dropAcks = 1;
  const first = await s.eval(CLICK, { timeoutMs: 200000 });
  const afterFirst = snap();
  return { droppedAcks: ctrl.dropped, first, afterFirst,
    verdict: afterFirst.aiCalls === 1 && afterFirst.completed === 1 && afterFirst.used === 1 && first.errorVisible === false ? 'PASS' : 'FAIL' };
});

// 3.3 — different input really is a new operation
await runCase('C2-changed-input-is-new-operation', '变更输入后应产生新 key 并正常计费', async ({ s, stack, snap }) => {
  await s.navigate(`${stack.origin}/video`); await settle(s, 1500);
  await s.eval(CLICK, { timeoutMs: 200000 });
  const afterFirst = snap();
  await s.eval(SET_NAME('Botol Minum Stainless 2'));
  await settle(s, 300);
  await s.eval(CLICK, { timeoutMs: 200000 });
  const afterSecond = snap();
  return { afterFirst, afterSecond,
    verdict: afterFirst.aiCalls === 1 && afterSecond.aiCalls === 2 && afterSecond.used === 2 && new Set(afterSecond.keys).size === 2 ? 'PASS' : 'FAIL' };
});

// 3.4 — reload in the same tab after a visibly failed attempt, then click with the same input
await runCase('C3-reload-same-input-recovers', '首次失败后刷新页面，相同输入再次点击', async ({ s, stack, ctrl, snap }) => {
  await s.navigate(`${stack.origin}/video`); await settle(s, 1500);
  ctrl.dropAcks = 1; ctrl.blockStatusGets = 5;
  const first = await s.eval(CLICK, { timeoutMs: 200000 });
  const afterFirst = snap();
  ctrl.blockStatusGets = 0;
  await s.navigate(`${stack.origin}/video`); await settle(s, 1800);
  const afterReload = await s.eval(CLICK, { timeoutMs: 200000 });
  const afterSecond = snap();
  return { droppedAcks: ctrl.dropped, blockedGets: ctrl.blockedGets, first, afterFirst, afterReload, afterSecond,
    verdict: afterFirst.aiCalls === 1 && first.errorVisible === true
      && afterSecond.aiCalls === 1 && afterSecond.completed === 1 && afterSecond.used === 1 ? 'PASS' : 'FAIL' };
});

// 3.7 — sessionStorage unavailable must not break rendering
await runCase('C4-no-sessionstorage', 'sessionStorage 不可用（隐私模式）', async ({ s, stack, snap }) => {
  await s.navigate(`${stack.origin}/video`); await settle(s, 1500);
  const storageThrows = await s.eval(`(() => { try { sessionStorage.getItem('x'); return false; } catch { return true; } })()`);
  const clicked = await s.eval(CLICK, { timeoutMs: 200000 });
  const after = snap();
  return { storageThrows, clicked, after,
    verdict: storageThrows === true && clicked.clicked === true && after.aiCalls === 1 && after.used === 1 ? 'PASS' : 'FAIL' };
}, { disableSessionStorage: true });

// Regression guard — a genuine terminal error must still render the error UI
await runCase('C5-terminal-error-still-shown', '真实终态错误（免费额度用尽）仍显示错误 UI', async ({ s, stack, snap }) => {
  await s.navigate(`${stack.origin}/video`); await settle(s, 1500);
  const r1 = await s.eval(CLICK, { timeoutMs: 200000 });
  await s.eval(SET_NAME('Produk Kedua'));
  await settle(s, 300);
  const r2 = await s.eval(CLICK, { timeoutMs: 200000 });
  const after = snap();
  const shot = await s.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'C5-limit-reached.png'), Buffer.from(shot.data, 'base64'));
  return { r1, r2, after, errorClassRendered: r2.errorVisible,
    verdict: r2.errorVisible === true && after.aiCalls === 1 ? 'PASS' : 'FAIL' };
}, { freeLimit: '1' });

const fails = report.cases.filter(c => c.verdict === 'FAIL');
report.summary = { total: report.cases.length, pass: report.cases.length - fails.length, fail: fails.length, failedIds: fails.map(c => c.id) };
console.log(JSON.stringify(report, null, 2));
process.exit(fails.length ? 1 : 0);
