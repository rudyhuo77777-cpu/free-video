// Local stack for browser-level reproduction: serves the REAL built static export and
// routes /api/* through the REAL worker/index.js with a SQLite D1 adapter.
// No Cloudflare, no remote AI, no production D1.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { D1Adapter } from '../../tests/helpers.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(root, 'apps/web/out');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

export function resolveStatic(pathname) {
  const clean = decodeURIComponent(pathname.split('?')[0]);
  if (clean.includes('..')) return null;
  const candidates = [path.join(OUT, clean), path.join(OUT, clean, 'index.html'), path.join(OUT, clean + '.html')];
  for (const c of candidates) { try { if (fs.statSync(c).isFile()) return c; } catch {} }
  return null;
}

export async function startStack({ db, ai, extraEnv = {}, onApi, beforeApi, staticRoutes = {} } = {}) {
  const worker = (await import('../../worker/index.js')).default;
  const database = db || new D1Adapter();
  const aiCalls = [];
  const aiBinding = ai || { run: async (model, req) => { aiCalls.push({ model, at: Date.now() }); const { director } = await import('../../tests/helpers.mjs'); return { response: director() }; } };
  const env = { DB: database, AI: aiBinding, FREE_SCRIPT_LIMIT: '3', ASSETS: { fetch: async () => new Response('ASSET_FIXTURE') }, ...extraEnv };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (staticRoutes[url.pathname]) { const r = staticRoutes[url.pathname]; res.writeHead(200, r.headers || {}); res.end(r.body); return; }
      if (url.pathname.startsWith('/api/')) {
        // Optional fault hook: lets a harness fail a specific API call at the transport level.
        const short = beforeApi?.({ method: req.method, path: url.pathname });
        if (short) { res.writeHead(short.status || 503, short.headers || { 'content-type': 'application/json' }); res.end(short.body ?? ''); return; }
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const request = new Request(url.toString(), {
          method: req.method,
          headers: Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string')),
          ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) })
        });
        const response = await worker.fetch(request, env);
        onApi?.({ method: req.method, path: url.pathname, status: response.status });
        const headers = {};
        for (const [k, v] of response.headers) headers[k] = v;
        res.writeHead(response.status, headers);
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const file = resolveStatic(url.pathname === '/' ? '/index.html' : url.pathname);
      if (!file) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ harnessError: String(e && e.message) }));
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return { server, port, origin: `http://127.0.0.1:${port}`, db: database, env, aiCalls, close: () => new Promise(r => server.close(r)) };
}
