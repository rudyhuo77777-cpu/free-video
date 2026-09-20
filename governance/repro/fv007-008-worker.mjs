// FV-007 / FV-008 reproduction against the original worker/index.js.
// No network: global fetch is replaced by a boundary stub. No production D1.
import fs from 'node:fs';
import path from 'node:path';
import { D1Adapter, env, guest } from '../../tests/helpers.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const results = { finding: ['FV-007', 'FV-008'], recordedAt: new Date().toISOString(), cases: [] };
const worker = (await import('../../worker/index.js')).default;

function reqWith(pathname, init = {}) {
  return new Request('http://localhost:8790' + pathname, {
    headers: { cookie: `free_video_guest=${guest}`, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.25', ...(init.headers || {}) },
    ...init
  });
}

// ---- FV-007 case 1: request body reader rejects asynchronously ----
{
  const db = new D1Adapter();
  const SENTINEL = 'AUDIT_PRIVATE_SENTINEL_do_not_leak';
  const body = new ReadableStream({ start(c) { c.error(new Error(SENTINEL)); } });
  const r = await worker.fetch(reqWith('/api/projects', { method: 'POST', body, duplex: 'half' }), env(db));
  const text = await r.text();
  let payload = null; try { payload = JSON.parse(text); } catch {}
  results.cases.push({
    id: 'fv007-async-body-error-redaction', finding: 'FV-007',
    endpoint: 'POST /api/projects', status: r.status,
    contentType: r.headers.get('content-type'),
    payload,
    sentinelLeaked: text.includes(SENTINEL),
    hasStage: Boolean(payload && payload.stage),
    hasRequestId: Boolean(payload && payload.requestId),
    defectReproduced: text.includes(SENTINEL)
  });
  db.close();
}

// ---- FV-007 case 2: /api/assets/plan with scenes:[null] returns 400 without stage ----
{
  const db = new D1Adapter();
  const r = await worker.fetch(reqWith('/api/assets/plan', { method: 'POST', body: JSON.stringify({ productName: 'Botol minum', scenes: [null] }) }), env(db));
  const payload = await r.json();
  results.cases.push({
    id: 'fv007-stage-missing-on-direct-error', finding: 'FV-007',
    endpoint: 'POST /api/assets/plan', status: r.status, payload,
    hasStage: Boolean(payload.stage), hasRequestId: Boolean(payload.requestId),
    defectReproduced: r.status === 400 && !payload.stage
  });
  db.close();
}

// ---- FV-008: provider returns loopback download URL and javascript: source page ----
{
  const db = new D1Adapter();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('api.openverse.org')) {
      return new Response(JSON.stringify({ results: [{
        id: 'ov-loopback', license: 'cc0', license_version: '1.0',
        license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
        thumbnail: 'http://127.0.0.1:8787/health',
        url: 'http://127.0.0.1:8787/health',
        foreign_landing_url: 'javascript:alert(1)',
        creator: 'Loopback Author', width: 900, height: 1600
      }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('commons.wikimedia.org')) {
      return new Response(JSON.stringify({ query: { pages: {} } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 500 });
  };
  let payload = null, status = null;
  try {
    const r = await worker.fetch(reqWith('/api/assets/search?q=botol+minum', { method: 'GET' }), env(db));
    status = r.status; payload = await r.json();
  } finally { globalThis.fetch = realFetch; }
  const entries = (payload && payload.results) || [];
  const loopback = entries.filter(e => /^https?:\/\/(127\.|localhost|0\.0\.0\.0|\[::1\])/i.test(String(e.downloadUrl || '')));
  const jsSource = entries.filter(e => /^javascript:|^data:/i.test(String(e.sourcePage || '')));
  const licenseKept = entries.filter(e => e.license || e.licenseUrl);
  results.cases.push({
    id: 'fv008-url-boundary-and-license', finding: 'FV-008',
    endpoint: 'GET /api/assets/search', status, resultCount: entries.length,
    sample: entries[0] || null,
    loopbackUrlsInResult: loopback.length,
    javascriptOrDataSourcePages: jsSource.length,
    entriesRetainingLicense: licenseKept.length,
    defectReproduced: loopback.length > 0 || jsSource.length > 0 || (entries.length > 0 && licenseKept.length === 0)
  });
  db.close();
}

results.summary = {
  reproduced: results.cases.filter(c => c.defectReproduced).map(c => c.id),
  notReproduced: results.cases.filter(c => !c.defectReproduced).map(c => c.id)
};
console.log(JSON.stringify(results, null, 2));
