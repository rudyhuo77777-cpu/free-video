// T5-7 verification for FV-007 (error contract) and FV-008 (URL boundary + licence evidence).
// Real worker/index.js + SQLite adapter. Network is stubbed at the fetch boundary; no real
// provider request is made. No remote AI, no production D1.
import path from 'node:path';
import { D1Adapter, env, guest } from '../../tests/helpers.mjs';

const worker = (await import('../../worker/index.js')).default;
const report = { task: 'T5-7 FV-007 + FV-008 fix verification', recordedAt: new Date().toISOString(), cases: [] };

const reqWith = (p, init = {}) => new Request('http://localhost:8790' + p, {
  headers: { cookie: `free_video_guest=${guest}`, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.25', ...(init.headers || {}) }, ...init
});

function withProviders(openverseResults, commonsPages = {}) {
  const real = globalThis.fetch;
  globalThis.fetch = async url => {
    const u = String(url);
    if (u.includes('api.openverse.org')) return new Response(JSON.stringify({ results: openverseResults }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.includes('commons.wikimedia.org')) return new Response(JSON.stringify({ query: { pages: commonsPages } }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response('{}', { status: 500 });
  };
  return () => { globalThis.fetch = real; };
}

const add = (id, finding, note, data, verdict) => report.cases.push({ id, finding, note, ...data, verdict });

// --- FV-007: an unknown exception must never reach the response ---
{
  const db = new D1Adapter();
  const SENTINEL = 'AUDIT_PRIVATE_SENTINEL_do_not_leak';
  const body = new ReadableStream({ start(c) { c.error(new Error(SENTINEL)); } });
  const r = await worker.fetch(reqWith('/api/projects', { method: 'POST', body, duplex: 'half' }), env(db));
  const text = await r.text();
  const payload = JSON.parse(text);
  add('F7-1', 'FV-007', '请求 body reader 异步拒绝时不得回显底层 message',
    { status: r.status, payload, sentinelLeaked: text.includes(SENTINEL), hasStage: Boolean(payload.stage), hasRequestId: Boolean(payload.requestId) },
    !text.includes(SENTINEL) && payload.stage && payload.requestId && payload.error === 'invalid_request' ? 'PASS' : 'FAIL');
  db.close();
}
// --- FV-007: a known ApiError keeps its own code ---
{
  const db = new D1Adapter();
  const r = await worker.fetch(reqWith('/api/projects', { method: 'POST', body: 'not json' }), env(db));
  const payload = await r.json();
  add('F7-2', 'FV-007', '已知 ApiError 仍保留自己的稳定错误码',
    { status: r.status, payload }, payload.error === 'invalid_json' && payload.stage && payload.requestId ? 'PASS' : 'FAIL');
  db.close();
}
// --- FV-007: direct 400s carry a stage ---
{
  const db = new D1Adapter();
  const checks = [];
  for (const [p, init, expect] of [
    ['/api/assets/plan', { method: 'POST', body: JSON.stringify({ productName: 'x', scenes: [null] }) }, 'invalid_scene_count'],
    ['/api/projects', { method: 'POST', body: JSON.stringify({ name: 'x' }) }, 'invalid_product_name'],
    ['/api/assets/search?q=a', { method: 'GET' }, 'query_too_short'],
    ['/api/nope', { method: 'GET' }, 'not_found'],
    ['/api/projects', { method: 'PUT' }, 'method_not_allowed']
  ]) {
    const r = await worker.fetch(reqWith(p, init), env(db));
    const payload = await r.json();
    checks.push({ path: p, status: r.status, error: payload.error, stage: payload.stage || null, requestId: Boolean(payload.requestId) });
  }
  add('F7-3', 'FV-007', '所有直接错误出口都带 stage 与 requestId',
    { checks }, checks.every(c => c.stage && c.requestId) ? 'PASS' : 'FAIL');
  db.close();
}

// --- FV-008 negative: loopback download URL and javascript: source page ---
{
  const db = new D1Adapter();
  const restore = withProviders([{
    id: 'ov-loopback', license: 'cc0', license_version: '1.0',
    license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    thumbnail: 'http://127.0.0.1:8787/health', url: 'http://127.0.0.1:8787/health',
    foreign_landing_url: 'javascript:alert(1)', creator: 'Loopback Author', width: 900, height: 1600
  }]);
  let payload;
  try { payload = await (await worker.fetch(reqWith('/api/assets/search?q=botol+minum', { method: 'GET' }), env(db))).json(); }
  finally { restore(); }
  const entries = payload.results || [];
  add('F8-1', 'FV-008', 'loopback 下载地址与 javascript: 来源页必须被拒',
    { resultCount: entries.length, entries },
    entries.length === 0 ? 'PASS' : 'FAIL');
  db.close();
}
// --- FV-008 negative: a mix — the bad entry drops, the good one survives ---
{
  const db = new D1Adapter();
  const restore = withProviders([
    { id: 'bad-http', license: 'cc0', thumbnail: 'http://example.com/a.jpg', url: 'http://example.com/a.jpg', foreign_landing_url: 'https://example.com/a', creator: 'A' },
    { id: 'bad-creds', license: 'cc0', thumbnail: 'https://user:pass@example.com/b.jpg', url: 'https://user:pass@example.com/b.jpg', foreign_landing_url: 'https://example.com/b', creator: 'B' },
    { id: 'bad-private', license: 'cc0', thumbnail: 'https://192.168.1.10/c.jpg', url: 'https://192.168.1.10/c.jpg', foreign_landing_url: 'https://example.com/c', creator: 'C' },
    { id: 'bad-data-source', license: 'cc0', thumbnail: 'https://upload.wikimedia.org/d.jpg', url: 'https://upload.wikimedia.org/d.jpg', foreign_landing_url: 'data:text/html,evil', creator: 'D' },
    { id: 'good-1', license: 'cc0', license_version: '1.0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      thumbnail: 'https://upload.wikimedia.org/good.jpg', url: 'https://upload.wikimedia.org/good.jpg',
      foreign_landing_url: 'https://commons.wikimedia.org/wiki/File:Good.jpg', creator: 'Amraepowell', width: 900, height: 1600 }
  ]);
  let payload;
  try { payload = await (await worker.fetch(reqWith('/api/assets/search?q=botol+minum', { method: 'GET' }), env(db))).json(); }
  finally { restore(); }
  const entries = payload.results || [];
  const ids = entries.map(e => e.id);
  const good = entries.find(e => e.id === 'good-1');
  // Audit-literal contract: an unusable downloadUrl drops the whole entry; a hostile
  // sourcePage is REJECTED (removed) while a usable image is kept. Dropping the entire entry
  // on a bad sourcePage alone would be a stricter policy than the audit's minimal fix and is
  // recorded as an open question for the user, not applied unilaterally.
  const dataSource = entries.find(e => e.id === 'bad-data-source');
  add('F8-2', 'FV-008', '逐条边界：http / 含凭据 / 私有地址 的下载地址整条被拒；data: 来源页被剥离但可用图片保留',
    { resultCount: entries.length, ids, good, dataSourceEntry: dataSource },
    ids.length === 2
      && ids.includes('good-1') && ids.includes('bad-data-source')
      && !ids.includes('bad-http') && !ids.includes('bad-creds') && !ids.includes('bad-private')
      && dataSource && dataSource.sourcePage === undefined
      && dataSource.downloadUrl === 'https://upload.wikimedia.org/d.jpg'
      && good.downloadUrl.startsWith('https://')
      && good.sourcePage === 'https://commons.wikimedia.org/wiki/File:Good.jpg'
      && good.license === 'cc0'
      && good.licenseUrl === 'https://creativecommons.org/publicdomain/zero/1.0/'
      ? 'PASS' : 'FAIL');
  db.close();
}
// --- FV-008 positive: a realistic Wikimedia CC0 entry keeps its licence evidence ---
{
  const db = new D1Adapter();
  const restore = withProviders([], {
    '1': { pageid: 1, title: 'File:Metal_Water_Bottles.jpeg', imageinfo: [{
      url: 'https://upload.wikimedia.org/wikipedia/commons/x/Metal_Water_Bottles.jpeg',
      thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/x/900px.jpeg',
      mime: 'image/jpeg', thumbwidth: 900, thumbheight: 1600,
      extmetadata: { Artist: { value: 'Amraepowell' }, LicenseShortName: { value: 'CC0' },
        LicenseUrl: { value: 'https://creativecommons.org/publicdomain/zero/1.0/' } } }] }
  });
  let payload;
  try { payload = await (await worker.fetch(reqWith('/api/assets/search?q=botol+minum', { method: 'GET' }), env(db))).json(); }
  finally { restore(); }
  const entries = payload.results || [];
  const e = entries[0];
  add('F8-3', 'FV-008', '真实形态的 Wikimedia CC0 条目必须通过并保留许可依据',
    { resultCount: entries.length, entry: e },
    entries.length === 1 && e.license === 'cc0'
      && e.licenseUrl === 'https://creativecommons.org/publicdomain/zero/1.0/'
      && e.author === 'Amraepowell'
      && e.sourcePage === 'https://commons.wikimedia.org/?curid=1'
      ? 'PASS' : 'FAIL');
  db.close();
}
// --- FV-008: the cc0/pdm licence filter must still reject other licences ---
{
  const db = new D1Adapter();
  const restore = withProviders([
    { id: 'by-sa', license: 'by-sa', thumbnail: 'https://upload.wikimedia.org/x.jpg', url: 'https://upload.wikimedia.org/x.jpg', foreign_landing_url: 'https://example.com/x', creator: 'X' },
    { id: 'pdm-ok', license: 'pdm', thumbnail: 'https://upload.wikimedia.org/y.jpg', url: 'https://upload.wikimedia.org/y.jpg', foreign_landing_url: 'https://example.com/y', creator: 'Y' }
  ]);
  let payload;
  try { payload = await (await worker.fetch(reqWith('/api/assets/search?q=botol+minum', { method: 'GET' }), env(db))).json(); }
  finally { restore(); }
  const ids = (payload.results || []).map(e => e.id);
  add('F8-4', 'FV-008', '既有 cc0/pdm 许可过滤未被削弱',
    { ids }, ids.length === 1 && ids[0] === 'pdm-ok' ? 'PASS' : 'FAIL');
  db.close();
}

const fails = report.cases.filter(c => c.verdict === 'FAIL');
report.summary = { total: report.cases.length, pass: report.cases.length - fails.length, fail: fails.length, failedIds: fails.map(c => c.id) };
console.log(JSON.stringify(report, null, 2));
process.exit(fails.length ? 1 : 0);
