// Captures the /video route in deterministic states: screenshot + DOM + computed styles.
// Used to prove a frozen-file edit changed NOTHING visible. Run once before the edit and
// once after, then compare. Providers and AI are deterministic stubs; no real AI, no D1.
import fs from 'node:fs';
import path from 'node:path';
import { D1Adapter } from '../../tests/helpers.mjs';
import { makeFixtureAi } from './fixture-director.mjs';
import { startStack } from './local-stack.mjs';
import { launch, Session } from './cdp.mjs';

const outDir = path.resolve(process.argv[2] || 'evidence/dev/STEP-3/visual/before');
fs.mkdirSync(outDir, { recursive: true });

// Deterministic 1x1 PNG served from the local origin as the only stock asset.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function providerStub(origin) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('api.openverse.org')) {
      return new Response(JSON.stringify({ results: [{
        id: 'fixture-asset-1', license: 'cc0', license_version: '1.0',
        license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
        thumbnail: `${origin}/fixture-asset.png`, url: `${origin}/fixture-asset.png`,
        foreign_landing_url: 'https://example.invalid/fixture', creator: 'Fixture Author',
        width: 900, height: 1600
      }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('commons.wikimedia.org')) {
      return new Response(JSON.stringify({ query: { pages: {} } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.startsWith(origin)) return real(url, init);
    return new Response('{}', { status: 503 });
  };
  return () => { globalThis.fetch = real; };
}

function lostAckDb(base, armed) {
  const COMPLETE = /UPDATE script_requests SET status='completed'/;
  return {
    prepare(sql) {
      const stmt = base.prepare(sql);
      if (!COMPLETE.test(sql)) return stmt;
      const wrap = s => ({ ...s, bind: (...v) => wrap(s.bind(...v)),
        async first(c) { const r = await s.first(c); if (armed.value) { armed.value = false; throw new Error('lost_ack_injected'); } return r; } });
      return wrap(stmt);
    },
    batch: (...a) => base.batch(...a)
  };
}

const CAPTURE = `(() => {
  const styleOf = el => {
    const cs = getComputedStyle(el);
    const keys = ['display','position','width','height','margin','padding','border','borderRadius','backgroundColor','color','font','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign','flexDirection','justifyContent','alignItems','gap','gridTemplateColumns','opacity','boxShadow','top','left','right','bottom','zIndex','overflow','transform'];
    return keys.map(k => k + ':' + cs[k]).join(';');
  };
  const nodes = [...document.querySelectorAll('body *')];
  return {
    url: location.pathname,
    title: document.title,
    html: document.documentElement.outerHTML,
    nodeCount: nodes.length,
    styles: nodes.map((el, i) => i + '|' + el.tagName + '|' + (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) + '|' + styleOf(el)).join('\\n'),
    rects: nodes.map((el, i) => { const r = el.getBoundingClientRect(); return i + '|' + el.tagName + '|' + [r.x, r.y, r.width, r.height].map(n => Math.round(n * 100) / 100).join(','); }).join('\\n'),
    textDump: document.body.innerText
  };
})()`;

const results = { capturedAt: new Date().toISOString(), states: [] };
const base = new D1Adapter();
const armed = { value: false };
const fixtureAi = makeFixtureAi();
const stack = await startStack({
  db: lostAckDb(base, armed), ai: fixtureAi.binding,
  staticRoutes: { '/fixture-asset.png': { body: PIXEL, headers: { 'content-type': 'image/png' } } }
});
// The browser must start BEFORE the provider stub is installed: the CDP client polls
// http://127.0.0.1:<port>/json/version through the same global fetch.
const browser = await launch();
const restoreFetch = providerStub(stack.origin);
try {
  const s = await Session.connect(browser.wsUrl);
  await s.attachToPage();
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 2400, deviceScaleFactor: 1, mobile: false });

  const capture = async (id, note) => {
    const data = await s.eval(CAPTURE);
    const shot = await s.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const png = Buffer.from(shot.data, 'base64');
    fs.writeFileSync(path.join(outDir, `${id}.png`), png);
    fs.writeFileSync(path.join(outDir, `${id}.html`), data.html);
    fs.writeFileSync(path.join(outDir, `${id}.styles.txt`), data.styles);
    fs.writeFileSync(path.join(outDir, `${id}.rects.txt`), data.rects);
    fs.writeFileSync(path.join(outDir, `${id}.text.txt`), data.textDump);
    results.states.push({ id, note, nodeCount: data.nodeCount, pngBytes: png.length, title: data.title });
    return data;
  };

  const settle = ms => s.eval(`new Promise(r=>setTimeout(r,${ms}))`);
  const clickGenerate = `(async () => {
    const btn = [...document.querySelectorAll('button.primary-btn')].find(b => !b.disabled);
    if (!btn) return 'no-button';
    btn.click();
    for (let i = 0; i < 160; i++) {
      await new Promise(r => setTimeout(r, 250));
      if (i > 4 && ![...document.querySelectorAll('button.primary-btn')].some(b => b.disabled)) break;
    }
    await new Promise(r => setTimeout(r, 1200));
    return 'done';
  })()`;

  // A: initial load
  await s.navigate(`${stack.origin}/video`);
  await settle(2000);
  await capture('A-initial', '首次加载，未做任何操作');

  // B: successful generate (no fault)
  armed.value = false;
  await s.eval(clickGenerate, { timeoutMs: 180000 });
  await settle(800);
  await capture('B-ready', '一次成功生成后的就绪态（Director 来自夹具）');

  // C: fresh page, generate with the completion receipt dropped
  armed.value = true;
  await s.navigate(`${stack.origin}/video`);
  await settle(2000);
  await s.eval(clickGenerate, { timeoutMs: 180000 });
  await settle(800);
  await capture('C-lost-ack-error', '完成回执丢失后的错误态');

  results.dbAfter = {
    completed: base.sqlite.prepare("SELECT COUNT(*) n FROM script_requests WHERE status='completed'").get().n,
    quotaUsed: (base.sqlite.prepare('SELECT used FROM guest_quota LIMIT 1').get() || { used: 0 }).used,
    aiCalls: fixtureAi.counter.calls
  };
  s.close();
} finally {
  browser.kill(); restoreFetch(); await stack.close(); base.close();
}
fs.writeFileSync(path.join(outDir, 'capture.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
process.exit(0);
