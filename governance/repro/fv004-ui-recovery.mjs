// FV-004 reproduction: real built page + real worker + SQLite D1 adapter.
// Fault injected only at the D1 execution boundary: the completion UPDATE commits,
// then the receipt is lost (throws), so the worker answers 503 persistence_unconfirmed.
// AI is a deterministic fixture. No remote AI, no production D1.
import fs from 'node:fs';
import path from 'node:path';
import { D1Adapter } from '../../tests/helpers.mjs';
import { makeFixtureAi } from './fixture-director.mjs';
import { startStack } from './local-stack.mjs';
import { launch, Session } from './cdp.mjs';

const outDir = path.resolve(import.meta.dirname, '../../evidence/dev/STEP-1/T1-9/artifacts');
fs.mkdirSync(outDir, { recursive: true });

const base = new D1Adapter();
let lostAckArmed = true;
const injected = [];
const COMPLETE_SQL = /UPDATE script_requests SET status='completed'/;

// Proxy the D1 binding so the completion write COMMITS and only the receipt is lost.
const db = {
  prepare(sql) {
    const stmt = base.prepare(sql);
    if (!COMPLETE_SQL.test(sql)) return stmt;
    const wrap = s => ({
      ...s,
      bind: (...v) => wrap(s.bind(...v)),
      async first(column) {
        const row = await s.first(column);
        if (lostAckArmed) { lostAckArmed = false; injected.push({ at: new Date().toISOString(), sql: 'completion receipt dropped after commit' }); throw new Error('lost_ack_injected'); }
        return row;
      }
    });
    return wrap(stmt);
  },
  batch: (...a) => base.batch(...a)
};

const fixtureAi = makeFixtureAi();
const ai = fixtureAi.binding;
const apiLog = [];
const stack = await startStack({ db, ai, onApi: e => apiLog.push(e) });

const snapshot = () => ({
  scriptRows: base.sqlite.prepare("SELECT idempotency_key,status,quota_charged FROM script_requests ORDER BY created_at").all(),
  completedCount: base.sqlite.prepare("SELECT COUNT(*) n FROM script_requests WHERE status='completed'").get().n,
  quotaUsed: (base.sqlite.prepare('SELECT used FROM guest_quota LIMIT 1').get() || { used: 0 }).used,
  aiCalls: fixtureAi.counter.calls,
  aiDurations: [...fixtureAi.counter.durations]
});

const browser = await launch();
const results = { finding: 'FV-004', recordedAt: new Date().toISOString(), steps: [] };
try {
  const s = await Session.connect(browser.wsUrl);
  await s.attachToPage();
  const consoleErrors = [];
  s.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') consoleErrors.push(p.args?.map(a => a.value ?? a.description).join(' ')); });
  await s.navigate(`${stack.origin}/video`);
  await s.eval('new Promise(r=>setTimeout(r,1500))');

  const fill = `(() => {
    const input = document.querySelector('input.input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Botol minum stainless');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input.value;
  })()`;
  results.steps.push({ step: 'fill-product-name', value: await s.eval(fill) });

  const clickGenerate = `(async () => {
    const btn = [...document.querySelectorAll('button.primary-btn')].find(b => !b.disabled);
    if (!btn) return { clicked: false, reason: 'no enabled primary-btn' };
    btn.click();
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 250));
      const busy = [...document.querySelectorAll('button.primary-btn')].some(b => b.disabled);
      if (!busy && i > 4) break;
    }
    await new Promise(r => setTimeout(r, 800));
    return { clicked: true, bodyText: document.body.innerText.slice(0, 600) };
  })()`;

  const first = await s.eval(clickGenerate, { timeoutMs: 180000 });
  const afterFirst = snapshot();
  const shot1 = await s.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'after-lost-ack.png'), Buffer.from(shot1.data, 'base64'));
  results.steps.push({ step: 'first-generate-with-lost-ack', ui: first, db: afterFirst, injectedFaults: injected.length });

  // Same input, click again — exactly what a user does after seeing the error.
  const second = await s.eval(clickGenerate, { timeoutMs: 180000 });
  const afterSecond = snapshot();
  const shot2 = await s.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'after-retry.png'), Buffer.from(shot2.data, 'base64'));
  results.steps.push({ step: 'retry-same-input', ui: second, db: afterSecond });

  const keys = afterSecond.scriptRows.map(r => r.idempotency_key);
  results.analysis = {
    aiCallsAfterFirst: afterFirst.aiCalls,
    aiCallsAfterRetry: afterSecond.aiCalls,
    completedRowsAfterFirst: afterFirst.completedCount,
    completedRowsAfterRetry: afterSecond.completedCount,
    quotaUsedAfterFirst: afterFirst.quotaUsed,
    quotaUsedAfterRetry: afterSecond.quotaUsed,
    idempotencyKeys: keys,
    distinctKeys: new Set(keys).size,
    pageShowedResultAfterRetry: /Director|scene|Scene/i.test(second.bodyText || ''),
    consoleErrors
  };
  results.defectReproduced = afterSecond.aiCalls === 2 && afterSecond.completedCount === 2 && Number(afterSecond.quotaUsed) === 2 && new Set(keys).size === 2;
  results.apiLog = apiLog;
  s.close();
} finally {
  browser.kill();
  await stack.close();
  base.close();
}
console.log(JSON.stringify(results, null, 2));
