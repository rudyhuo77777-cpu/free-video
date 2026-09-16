import { normalizeAssetKeyword, normalizeAssetSearchQuery, sanitizeDirector } from '@auria/core';

const VALID_DURATIONS = new Set([15, 30, 60, 90, 120]);
let schemaPromise;

async function verifyTurnstile(request, env, token) {
  const secret = String(env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret) return { ok: true };
  if (!token) return { ok: false, error: 'turnstile_required' };
  const form = new FormData();
  form.set('secret', secret);
  form.set('response', String(token));
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) form.set('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    if (!res.ok) return { ok: false, error: 'turnstile_unavailable' };
    const data = await res.json();
    return data?.success ? { ok: true } : { ok: false, error: 'turnstile_failed' };
  } catch {
    return { ok: false, error: 'turnstile_unavailable' };
  }
}

function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders
  });
  return new Response(JSON.stringify(data), { status, headers });
}

async function readJson(request, maxBytes = 24 * 1024) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new Error('request_too_large');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('request_too_large');
  try { return JSON.parse(text || '{}'); }
  catch { throw new Error('invalid_json'); }
}

function parseCookies(request) {
  const map = new Map();
  for (const part of String(request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    map.set(part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim()));
  }
  return map;
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function getIdentity(request) {
  const cookies = parseCookies(request);
  let id = cookies.get('free_video_guest');
  let setCookie;
  if (!validUuid(id)) {
    id = crypto.randomUUID();
    const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
    setCookie = `free_video_guest=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000${secure}`;
  }
  return { id, setCookie };
}

function withIdentity(response, identity) {
  if (!identity?.setCookie) return response;
  const headers = new Headers(response.headers);
  headers.append('set-cookie', identity.setCookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function ensureSchema(db) {
  if (!schemaPromise) {
    schemaPromise = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS guest_quota (
        guest_id TEXT PRIMARY KEY,
        used INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )`),

      db.prepare(`CREATE TABLE IF NOT EXISTS script_requests (
        idempotency_key TEXT PRIMARY KEY,
        guest_id TEXT NOT NULL,
        status TEXT NOT NULL,
        result_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`),

      db.prepare(`CREATE INDEX IF NOT EXISTS idx_script_guest
        ON script_requests(guest_id, created_at DESC)`),

      db.prepare(`CREATE TABLE IF NOT EXISTS product_projects (
        id TEXT PRIMARY KEY,
        guest_id TEXT NOT NULL,
        name TEXT NOT NULL,
        price TEXT,
        sku TEXT,
        target_audience TEXT,
        selling_points TEXT NOT NULL DEFAULT '[]',
        pain_points TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`),

      db.prepare(`CREATE INDEX IF NOT EXISTS idx_projects_guest
        ON product_projects(guest_id, updated_at DESC)`),

      db.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (
        bucket TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`),

      db.prepare(`CREATE TABLE IF NOT EXISTS fyp_bindings (
        token TEXT PRIMARY KEY,
        guest_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )`),

      db.prepare(`CREATE TABLE IF NOT EXISTS fyp_handoffs (
        token TEXT PRIMARY KEY,
        guest_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed INTEGER NOT NULL DEFAULT 0
      )`)
    ]).catch(error => {
      schemaPromise = undefined;
      throw error;
    });
  }

  await schemaPromise;
}
async function allowRate(db, bucket, limit, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const row = await db.prepare('SELECT count, expires_at FROM rate_limits WHERE bucket=?1').bind(bucket).first();
  if (!row || Number(row.expires_at) <= now) {
    await db.prepare(`INSERT INTO rate_limits(bucket,count,expires_at) VALUES(?1,1,?2)
      ON CONFLICT(bucket) DO UPDATE SET count=1, expires_at=excluded.expires_at`).bind(bucket, now + windowSeconds).run();
    return true;
  }
  if (Number(row.count) >= limit) return false;
  await db.prepare('UPDATE rate_limits SET count=count+1 WHERE bucket=?1').bind(bucket).run();
  return true;
}

async function quota(db, guestId, limit) {
  const row = await db.prepare('SELECT used FROM guest_quota WHERE guest_id=?1').bind(guestId).first();
  const used = Math.max(0, Number(row?.used || 0));
  return { used, remaining: Math.max(0, limit - used), limit };
}

async function reserveQuota(db, guestId, limit) {
  const now = Date.now();
  await db.prepare('INSERT OR IGNORE INTO guest_quota(guest_id,used,updated_at) VALUES(?1,0,?2)').bind(guestId, now).run();
  const result = await db.prepare('UPDATE guest_quota SET used=used+1, updated_at=?2 WHERE guest_id=?1 AND used < ?3').bind(guestId, now, limit).run();
  return Number(result?.meta?.changes || 0) > 0;
}

async function releaseQuota(db, guestId) {
  await db.prepare('UPDATE guest_quota SET used=CASE WHEN used>0 THEN used-1 ELSE 0 END, updated_at=?2 WHERE guest_id=?1')
    .bind(guestId, Date.now()).run();
}

function extractJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('ai_json_missing');
  return JSON.parse(raw.slice(first, last + 1));
}

async function createDirector(env, productName, duration, fypContext = '', productContext = '') {
  const sceneTarget = duration === 15 ? '4-5' : duration === 30 ? '6-8' : duration === 60 ? '10-14' : duration === 90 ? '14-18' : '18-24';
  const prompt = `Kamu adalah director video jualan Indonesia. Buat Director JSON valid saja, tanpa markdown. Produk: ${productName}. Durasi: ${duration} detik. Target scene: ${sceneTarget}. Bahasa voice/headline harus Bahasa Indonesia natural. Jangan klaim palsu. Gunakan template hanya dari: problem_hook, product_hero, solution_reveal, feature_3, before_after, zoom_detail, lifestyle, comparison, price_drop, social_proof, countdown_cta, final_cta. camera hanya: push_in, pull_out, pan_left, pan_right, float, orbit, static. transition: cut, fade, slide, zoom. Struktur wajib: {"version":"1.0","language":"id","ratio":"9:16","duration":${duration},"productName":"...","style":"fast-commerce","scenes":[{"id":"scene-1","duration":3,"template":"problem_hook","assetKeyword":"...","headline":"...","subheadline":"...","voice":"...","camera":"push_in","transition":"cut"}],"cta":"..."}. Total duration semua scene harus kira-kira ${duration} detik.${productContext ? `\nData Product Project yang harus dipakai sebagai fakta produk: ${productContext}` : ''}${fypContext ? `\nKonteks analisis FYP yang harus diadaptasi tanpa menyalin mentah: ${fypContext}` : ''}`;
  const model = env.AI_MODEL || '@cf/meta/llama-3.1-8b-instruct-fast';
  const result = await env.AI.run(model, {
    messages: [
      { role: 'system', content: 'Output JSON only. Create a high-quality Indonesian ecommerce video director plan. Do not invent product facts.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 4096
  });
  const text = result?.response ?? result?.result?.response ?? result?.choices?.[0]?.message?.content ?? '';
  return sanitizeDirector(extractJson(text), productName, duration);
}

function splitList(value) {
  const values = Array.isArray(value) ? value.map(String) : String(value || '').split(/[\n,;]+/);
  return values.map(x => x.trim().slice(0, 400)).filter(Boolean).slice(0, 20);
}

async function handleQuota(request, env, identity) {
  await ensureSchema(env.DB);
  const limit = Math.max(1, Number(env.FREE_SCRIPT_LIMIT || 3));
  return withIdentity(json(await quota(env.DB, identity.id, limit)), identity);
}

async function handleScript(request, env, identity) {
  await ensureSchema(env.DB);
  let body;
  try { body = await readJson(request); }
  catch (error) { return withIdentity(json({ error: error.message }, error.message === 'request_too_large' ? 413 : 400), identity); }

  const productName = String(body.productName || '').trim().slice(0, 120);
  const duration = Number(body.duration);
  const idempotencyKey = String(body.idempotencyKey || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || crypto.randomUUID();
  const fypContext = String(body.fypContext || '').trim().slice(0, 3000);
  const productContext = String(body.productContext || '').trim().slice(0, 4000);
  if (productName.length < 2 || !VALID_DURATIONS.has(duration)) return withIdentity(json({ error: 'invalid_request' }, 400), identity);

  const human = await verifyTurnstile(request, env, String(body.turnstileToken || ''));
  if (!human.ok) return withIdentity(json({ error: human.error }, human.error === 'turnstile_unavailable' ? 503 : 403), identity);

  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  const ipHash = await sha256Hex(`free-video-lite|${ip}`);
  const rateOk = await allowRate(env.DB, `script:${ipHash}:${Math.floor(Date.now() / 60000)}`, Number(env.SCRIPT_RATE_LIMIT_PER_MINUTE || 10), 90);
  if (!rateOk) return withIdentity(json({ error: 'rate_limited' }, 429, { 'retry-after': '30' }), identity);
  const dayKey = new Date().toISOString().slice(0, 10);
  const dailyOk = await allowRate(env.DB, `script-day:${ipHash}:${dayKey}`, Number(env.SCRIPT_DAILY_PER_IP_LIMIT || 30), 172800);
  if (!dailyOk) return withIdentity(json({ error: 'rate_limited' }, 429, { 'retry-after': '3600' }), identity);

  const existing = await env.DB.prepare('SELECT guest_id,status,result_json FROM script_requests WHERE idempotency_key=?1').bind(idempotencyKey).first();
  if (existing) {
    if (existing.guest_id !== identity.id) return withIdentity(json({ error: 'not_found' }, 404), identity);
    if (existing.status === 'completed' && existing.result_json) {
      const q = await quota(env.DB, identity.id, Number(env.FREE_SCRIPT_LIMIT || 3));
      return withIdentity(json({ jobId: idempotencyKey, status: 'completed', result: JSON.parse(existing.result_json), remaining: q.remaining, duplicate: true }), identity);
    }
    return withIdentity(json({ error: 'job_in_progress' }, 409, { 'retry-after': '5' }), identity);
  }

  const inserted = await env.DB.prepare('INSERT OR IGNORE INTO script_requests(idempotency_key,guest_id,status,created_at,updated_at) VALUES(?1,?2,\'reserved\',?3,?3)')
    .bind(idempotencyKey, identity.id, Date.now()).run();
  if (Number(inserted?.meta?.changes || 0) === 0) return withIdentity(json({ error: 'job_in_progress' }, 409), identity);

  const limit = Math.max(1, Number(env.FREE_SCRIPT_LIMIT || 3));
  const allowed = await reserveQuota(env.DB, identity.id, limit);
  if (!allowed) {
    await env.DB.prepare('DELETE FROM script_requests WHERE idempotency_key=?1 AND status=\'reserved\'').bind(idempotencyKey).run();
    const q = await quota(env.DB, identity.id, limit);
    return withIdentity(json({ error: 'free_script_limit_reached', used: q.used, remaining: q.remaining }, 402), identity);
  }

  try {
    const director = await createDirector(env, productName, duration, fypContext, productContext);
    await env.DB.prepare('UPDATE script_requests SET status=\'completed\', result_json=?2, updated_at=?3 WHERE idempotency_key=?1')
      .bind(idempotencyKey, JSON.stringify(director), Date.now()).run();
    const q = await quota(env.DB, identity.id, limit);
    return withIdentity(json({ jobId: idempotencyKey, status: 'completed', result: director, remaining: q.remaining }), identity);
  } catch (error) {
    console.error('[director]', error);
    await Promise.allSettled([
      env.DB.prepare('DELETE FROM script_requests WHERE idempotency_key=?1 AND status=\'reserved\'').bind(idempotencyKey).run(),
      releaseQuota(env.DB, identity.id)
    ]);
    return withIdentity(json({ error: 'ai_generation_failed' }, 503, { 'retry-after': '15' }), identity);
  }
}


async function handleScriptStatus(request, env, identity, jobId) {
  await ensureSchema(env.DB);
  const id = String(jobId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  if (!id) return withIdentity(json({ error: 'not_found' }, 404), identity);
  const row = await env.DB.prepare('SELECT guest_id,status,result_json,updated_at FROM script_requests WHERE idempotency_key=?1').bind(id).first();
  if (!row || row.guest_id !== identity.id) return withIdentity(json({ error: 'not_found' }, 404), identity);
  if (row.status === 'completed' && row.result_json) {
    return withIdentity(json({ jobId: id, status: 'completed', result: JSON.parse(row.result_json), pollAfterMs: 0, durable: true }), identity);
  }
  return withIdentity(json({ jobId: id, status: row.status || 'reserved', pollAfterMs: 1500, durable: true }), identity);
}

async function handleProjects(request, env, identity) {
  await ensureSchema(env.DB);
  if (request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT id,name,price,sku,target_audience,selling_points,pain_points,created_at FROM product_projects WHERE guest_id=?1 ORDER BY updated_at DESC LIMIT 100')
      .bind(identity.id).all();
    const projects = (rows.results || []).map(row => ({
      id: row.id,
      name: row.name,
      price: row.price || '',
      sku: row.sku || '',
      targetAudience: row.target_audience || '',
      sellingPoints: JSON.parse(row.selling_points || '[]'),
      painPoints: JSON.parse(row.pain_points || '[]'),
      createdAt: new Date(Number(row.created_at)).toISOString()
    }));
    return withIdentity(json({ projects }), identity);
  }

  if (request.method !== 'POST') return withIdentity(json({ error: 'method_not_allowed' }, 405), identity);
  let body;
  try { body = await readJson(request); }
  catch (error) { return withIdentity(json({ error: error.message }, error.message === 'request_too_large' ? 413 : 400), identity); }
  const name = String(body.name || '').trim().slice(0, 120);
  if (name.length < 2) return withIdentity(json({ error: 'invalid_product_name' }, 400), identity);
  const now = Date.now();
  const project = {
    id: crypto.randomUUID(),
    name,
    price: String(body.price || '').trim().slice(0, 80),
    sku: String(body.sku || '').trim().slice(0, 80),
    targetAudience: String(body.targetAudience || '').trim().slice(0, 500),
    sellingPoints: splitList(body.sellingPoints),
    painPoints: splitList(body.painPoints),
    createdAt: new Date(now).toISOString()
  };
  await env.DB.prepare(`INSERT INTO product_projects(id,guest_id,name,price,sku,target_audience,selling_points,pain_points,created_at,updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)`)
    .bind(project.id, identity.id, project.name, project.price, project.sku, project.targetAudience, JSON.stringify(project.sellingPoints), JSON.stringify(project.painPoints), now).run();
  return withIdentity(json({ project }, 201), identity);
}

async function handleFypStart(request, env, identity) {
  await ensureSchema(env.DB);
  const url = new URL(request.url);
  const product = String(url.searchParams.get('product') || '').slice(0, 120);
  const duration = VALID_DURATIONS.has(Number(url.searchParams.get('duration'))) ? Number(url.searchParams.get('duration')) : 30;
  const token = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO fyp_bindings(token,guest_id,expires_at) VALUES(?1,?2,?3)').bind(token, identity.id, Math.floor(Date.now()/1000) + 1800).run();
  const target = new URL(env.FYP_URL || 'https://fyp.eco-velo.com');
  target.searchParams.set('product', product);
  target.searchParams.set('duration', String(duration));
  target.searchParams.set('return_binding', token);
  target.searchParams.set('utm_source', 'free_video');
  target.searchParams.set('utm_medium', 'video_result');
  target.searchParams.set('utm_campaign', 'fyp_handoff');
  return withIdentity(new Response(null, { status: 302, headers: { location: target.toString(), 'cache-control': 'no-store' } }), identity);
}

async function handleFypHandoff(request, env) {
  await ensureSchema(env.DB);
  let body;
  try { body = await readJson(request, 16 * 1024); }
  catch (error) { return json({ error: error.message }, error.message === 'request_too_large' ? 413 : 400); }
  const binding = String(body.returnBinding || '');
  const row = await env.DB.prepare('SELECT guest_id,expires_at FROM fyp_bindings WHERE token=?1').bind(binding).first();
  const now = Math.floor(Date.now()/1000);
  if (!row || Number(row.expires_at) < now) return json({ error: 'invalid_return_binding' }, 403);
  const productName = String(body.productName || '').trim().slice(0, 120);
  const duration = Math.max(15, Math.min(120, Number(body.duration) || 30));
  const viralHook = String(body.viralHook || '').trim().slice(0, 800);
  const directorHints = String(body.directorHints || '').trim().slice(0, 3000);
  const sourceUrl = String(body.sourceUrl || '').trim().slice(0, 1000);
  if (productName.length < 2 || (!viralHook && !directorHints)) return json({ error: 'invalid_handoff' }, 400);
  const token = crypto.randomUUID();
  const payload = { productName, duration, viralHook, directorHints, sourceUrl };
  await env.DB.batch([
    env.DB.prepare('DELETE FROM fyp_bindings WHERE token=?1').bind(binding),
    env.DB.prepare('INSERT INTO fyp_handoffs(token,guest_id,payload_json,expires_at,consumed) VALUES(?1,?2,?3,?4,0)')
      .bind(token, row.guest_id, JSON.stringify(payload), now + 900)
  ]);
  const origin = new URL(request.url).origin;
  return json({ token, returnUrl: `${origin}/video#fyp_token=${encodeURIComponent(token)}`, expiresIn: 900 });
}

async function handleFypConsume(request, env, identity) {
  await ensureSchema(env.DB);
  let body;
  try { body = await readJson(request, 2048); }
  catch (error) { return withIdentity(json({ error: error.message }, error.message === 'request_too_large' ? 413 : 400), identity); }
  const token = String(body.token || '');
  if (!validUuid(token)) return withIdentity(json({ error: 'invalid_token' }, 400), identity);
  const row = await env.DB.prepare('SELECT guest_id,payload_json,expires_at,consumed FROM fyp_handoffs WHERE token=?1').bind(token).first();
  const now = Math.floor(Date.now()/1000);
  if (!row || row.guest_id !== identity.id || Number(row.expires_at) < now) return withIdentity(json({ error: 'not_found_or_expired' }, 404), identity);
  if (Number(row.consumed)) return withIdentity(json({ error: 'already_consumed' }, 409), identity);
  await env.DB.prepare('UPDATE fyp_handoffs SET consumed=1 WHERE token=?1 AND consumed=0').bind(token).run();
  return withIdentity(json({ handoff: JSON.parse(row.payload_json) }), identity);
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

async function searchPixabay(query, env) {
  if (!env.PIXABAY_API_KEY) return [];
  const params = new URLSearchParams({ key: env.PIXABAY_API_KEY, q: query, per_page: '6', safesearch: 'true', video_type: 'all' });
  const res = await fetch(`https://pixabay.com/api/videos/?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.hits || []).slice(0, 6).map(x => ({
    source: 'pixabay', id: String(x.id), type: 'video', previewUrl: x.videos?.tiny?.thumbnail || x.videos?.small?.thumbnail || '',
    downloadUrl: x.videos?.small?.url || x.videos?.medium?.url, sourcePage: x.pageURL, author: x.user,
    width: x.videos?.small?.width, height: x.videos?.small?.height, duration: x.duration
  })).filter(x => Boolean(x.downloadUrl));
}

async function searchPexels(query, env) {
  if (!env.PEXELS_API_KEY) return [];
  const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=6&orientation=portrait`, { headers: { Authorization: env.PEXELS_API_KEY } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.videos || []).slice(0, 6).map(x => {
    const file = [...(x.video_files || [])].filter(f => f.link && f.width && f.height).sort((a,b) => Math.abs((a.width || 0)-720)-Math.abs((b.width || 0)-720))[0];
    return { source: 'pexels', id: String(x.id), type: 'video', previewUrl: x.image || x.video_pictures?.[0]?.picture || '', downloadUrl: file?.link, sourcePage: x.url, author: x.user?.name, width: file?.width, height: file?.height, duration: x.duration };
  }).filter(x => Boolean(x.downloadUrl));
}

async function searchOpenverse(query) {
  const params = new URLSearchParams({ q: query, page_size: '20', mature: 'false', filter_dead: 'true', license: 'cc0,pdm' });
  const res = await fetch(`https://api.openverse.org/v1/images/?${params}`, { headers: { 'User-Agent': 'Free-Video/0.3.1' } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).map(x => {
    const license = String(x.license || '').toLowerCase();
    if (license !== 'cc0' && license !== 'pdm') return null;
    const url = String(x.thumbnail || x.url || '');
    if (!url) return null;
    return { source: 'openverse', id: String(x.id || x.identifier || url), type: 'image', previewUrl: url, downloadUrl: url, sourcePage: x.foreign_landing_url || undefined, author: String(x.creator || x.provider || 'Openverse').slice(0,120), width: Number(x.width)||undefined, height: Number(x.height)||undefined };
  }).filter(Boolean).slice(0,8);
}

async function searchCommons(query) {
  const params = new URLSearchParams({ action:'query', format:'json', origin:'*', generator:'search', gsrsearch:query, gsrnamespace:'6', gsrlimit:'8', prop:'imageinfo', iiprop:'url|size|mime|extmetadata', iiurlwidth:'900' });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { 'User-Agent': 'Free-Video/0.3.1' } });
  if (!res.ok) return [];
  const data = await res.json();
  return Object.values(data?.query?.pages || {}).map(page => {
    const info = page?.imageinfo?.[0];
    const mime = String(info?.mime || '');
    if (!info?.url || !mime.startsWith('image/') || mime.includes('svg')) return null;
    const meta = info.extmetadata || {};
    const author = stripHtml(meta.Artist?.value || meta.Credit?.value || 'Wikimedia Commons');
    const license = stripHtml(meta.LicenseShortName?.value || meta.UsageTerms?.value || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const safe = license === 'cc0' || license.startsWith('cc0 ') || license.includes('public domain') || license.includes('public domain mark');
    if (!safe) return null;
    return { source:'commons', id:String(page.pageid || page.title || info.url), type:'image', previewUrl:info.thumburl || info.url, downloadUrl:info.thumburl || info.url, sourcePage:page.pageid ? `https://commons.wikimedia.org/?curid=${encodeURIComponent(String(page.pageid))}` : undefined, author:author.slice(0,120), width:Number(info.thumbwidth || info.width)||undefined, height:Number(info.thumbheight || info.height)||undefined };
  }).filter(Boolean).slice(0,6);
}

async function searchMedia(rawQuery, env) {
  const query = normalizeAssetSearchQuery(rawQuery);
  const normalized = normalizeAssetKeyword(rawQuery);
  if (query.length < 2) return { query, cached: false, results: [] };
  const cache = caches.default;
  const cacheKey = new Request(`https://free-video-cache.invalid/media/${encodeURIComponent(normalized)}`);
  const cached = await cache.match(cacheKey);
  if (cached) return { query, cached: true, results: await cached.json() };
  const settled = await Promise.allSettled([
    searchPixabay(query, env),
    searchPexels(query, env),
    searchCommons(query),
    searchOpenverse(query)
  ]);
  const [pixabay, pexels, commons, openverse] = settled.map(x => x.status === 'fulfilled' ? x.value : []);
  const provider = [...pixabay, ...pexels];
  const keyless = [...commons, ...openverse];
  const merged = provider.length ? [...provider.slice(0,6), ...keyless.slice(0,2)] : keyless.slice(0,8);
  const results = [...new Map(merged.map(item => [`${item.source}:${item.id}`, item])).values()].slice(0,8);
  await cache.put(cacheKey, new Response(JSON.stringify(results), { headers: { 'content-type':'application/json', 'cache-control':`public,max-age=${results.length ? 86400 : 120}` } })).catch(() => undefined);
  return { query, cached: false, results };
}

async function planSceneAssets(scenes, productName, env) {
  const unique = [];
  const byKeyword = new Map();
  for (const scene of scenes.filter(scene => scene.assetKeyword)) {
    const keyword = normalizeAssetSearchQuery(scene.assetKeyword || '').slice(0,80);
    const cacheKey = normalizeAssetKeyword(scene.assetKeyword || '').slice(0,80);
    if (keyword.length < 2 || cacheKey.length < 2) continue;
    const existing = byKeyword.get(cacheKey);
    if (existing) existing.sceneIds.push(scene.id);
    else { const item = { keyword, cacheKey, sceneIds:[scene.id] }; byKeyword.set(cacheKey,item); unique.push(item); }
  }
  const selected = unique.slice(0,4);
  const used = new Set();
  const assignedIds = new Set();
  const assignments = [];
  for (const group of selected) {
    const response = await searchMedia(group.keyword, env);
    const asset = response.results.find(item => !used.has(`${item.source}:${item.id}`)) || response.results[0] || null;
    if (asset) used.add(`${asset.source}:${asset.id}`);
    for (const sceneId of group.sceneIds) { assignments.push({ sceneId, keyword:group.keyword, asset }); assignedIds.add(sceneId); }
  }
  const productKeyword = normalizeAssetSearchQuery(productName).slice(0,80);
  if (productKeyword.length >= 2) {
    const response = await searchMedia(productKeyword, env).catch(() => ({ results:[] }));
    const imageFallback = response.results.find(item => item.type === 'image' && item.source === 'commons') || response.results.find(item => item.type === 'image') || null;
    const fallback = imageFallback || response.results[0] || null;
    if (fallback) {
      for (const scene of scenes) if (!assignedIds.has(scene.id)) assignments.push({ sceneId:scene.id, keyword:productKeyword, asset:fallback });
      if (imageFallback && !assignments.some(item => item.asset?.type === 'image')) {
        const preferred = new Set(['product_hero','feature_3','zoom_detail','comparison','price_drop','countdown_cta','final_cta']);
        const anchor = scenes.find(scene => preferred.has(scene.template)) || scenes[scenes.length-1];
        if (anchor) {
          const existing = assignments.find(item => item.sceneId === anchor.id);
          if (existing) { existing.keyword = productKeyword; existing.asset = imageFallback; }
          else assignments.push({ sceneId:anchor.id, keyword:productKeyword, asset:imageFallback });
        }
      }
    }
  }
  return assignments;
}

async function handleAssetsPlan(request, env, identity) {
  let body;
  try { body = await readJson(request); }
  catch (error) { return withIdentity(json({ error: error.message }, error.message === 'request_too_large' ? 413 : 400), identity); }
  const rawScenes = Array.isArray(body.scenes) ? body.scenes : [];
  if (rawScenes.length < 1 || rawScenes.length > 24) return withIdentity(json({ error:'invalid_scene_count' }, 400), identity);
  const scenes = rawScenes.map((scene,index) => ({
    id:String(scene.id || `scene-${index+1}`).slice(0,80), duration:Math.max(1,Math.min(15,Number(scene.duration)||3)),
    template:String(scene.template || 'lifestyle'), assetKeyword:String(scene.assetKeyword || '').trim().slice(0,100)
  }));
  try { return withIdentity(json({ assignments: await planSceneAssets(scenes, String(body.productName || '').trim().slice(0,120), env) }), identity); }
  catch (error) { console.error('[assets-plan]', error); return withIdentity(json({ error:'media_broker_unavailable' }, 503), identity); }
}

async function handleAssetsSearch(request, env, identity) {
  const url = new URL(request.url);
  const q = String(url.searchParams.get('q') || '').trim().slice(0,100);
  if (q.length < 2) return withIdentity(json({ error:'query_too_short' }, 400), identity);
  try { return withIdentity(json(await searchMedia(q, env)), identity); }
  catch (error) { console.error('[assets-search]', error); return withIdentity(json({ error:'media_broker_unavailable' }, 503), identity); }
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const identity = getIdentity(request);
  try {
    if (url.pathname === '/api/health' && request.method === 'GET') return withIdentity(json({ ok:true, version:'0.3.1-lite', architecture:'cloudflare-lite', ai:'workers-ai', storage:'d1', render:'local-device' }), identity);
    if (url.pathname === '/api/scripts/quota' && request.method === 'GET') return handleQuota(request, env, identity);
    if (url.pathname === '/api/scripts/jobs' && request.method === 'POST') return handleScript(request, env, identity);
    const jobMatch = url.pathname.match(/^\/api\/scripts\/jobs\/([^/]+)$/);
    if (jobMatch && request.method === 'GET') return handleScriptStatus(request, env, identity, decodeURIComponent(jobMatch[1]));
    if (url.pathname === '/api/projects' && (request.method === 'GET' || request.method === 'POST')) return handleProjects(request, env, identity);
    if (url.pathname === '/api/fyp/start' && request.method === 'GET') return handleFypStart(request, env, identity);
    if (url.pathname === '/api/fyp/handoff' && request.method === 'POST') return handleFypHandoff(request, env);
    if (url.pathname === '/api/fyp/handoff/consume' && request.method === 'POST') return handleFypConsume(request, env, identity);
    if (url.pathname === '/api/assets/plan' && request.method === 'POST') return handleAssetsPlan(request, env, identity);
    if (url.pathname === '/api/assets/search' && request.method === 'GET') return handleAssetsSearch(request, env, identity);
    return withIdentity(json({ error:'not_found' }, 404), identity);
  } catch (error) {
    console.error('[api]', error);
    return withIdentity(json({ error:'internal_error' }, 500), identity);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  }
};

