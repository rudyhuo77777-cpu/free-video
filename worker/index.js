import { normalizeAssetKeyword, normalizeAssetSearchQuery } from '../packages/core/dist/index.js';
import { ensureSchema,boundedInt,allowRate,quota,getJob,recoverExpired,reserveJob,completeJob,failJob } from './db.js';
import { createDirector,DEFAULT_MODEL,resolveModel } from './director.js';
import { ApiError,json,readJson,validUuid,getIdentity,withIdentity,sha256Hex,logError,fetchBounded } from './http.js';

const VALID_DURATIONS=new Set([15,30,60,90,120]);
const limitFor=env=>boundedInt(env.FREE_SCRIPT_LIMIT,3,1,100);
const log=(identity,stage,reason)=>logError(stage,identity?.requestId||'unknown',reason);

async function verifyTurnstile(request,env,token) {
  const secret=String(env.TURNSTILE_SECRET_KEY||'').trim();
  if(!secret)return {ok:true};
  if(!token)return {ok:false,error:'turnstile_required'};
  const form=new FormData(); form.set('secret',secret);form.set('response',String(token));
  const ip=request.headers.get('cf-connecting-ip');if(ip)form.set('remoteip',ip);
  try {
    const res=await fetchBounded('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form});
    if(!res.ok)return {ok:false,error:'turnstile_unavailable'};
    const data=await res.json();
    return data?.success ? {ok:true} : {ok:false,error:'turnstile_failed'};
  }catch{return {ok:false,error:'turnstile_unavailable'};}
}
async function handleQuota(request,env,identity) {
  await ensureSchema(env.DB);
  await recoverExpired(env.DB,identity.id);
  return json(await quota(env.DB,identity.id,limitFor(env)));
}
async function remainingSafely(env,identity) {
  try{return (await quota(env.DB,identity.id,limitFor(env))).remaining;}
  catch{log(identity,'d1_quota_read','quota_read_unavailable');return null;}
}
async function completedResponse(row,env,identity,duplicate=false) {
  const result=JSON.parse(row.result_json);
  // A failed display-only quota read MUST NOT reverse completed work.
  return json({jobId:row.idempotency_key,status:'completed',result,
    remaining:await remainingSafely(env,identity),duplicate,durable:true});
}
async function existingResponse(row,hash,env,identity) {
  if(!row)return null;
  if(row.request_hash && row.request_hash!==hash)throw new ApiError('idempotency_conflict',409,'idempotency');
  if(row.status==='completed'&&row.result_json)return completedResponse(row,env,identity,true);
  if(row.status==='reserved')return json({jobId:row.idempotency_key,status:'reserved',pollAfterMs:1500},202,{'retry-after':'2'});
  return null;
}
async function handleScript(request,env,identity) {
  const body=await readJson(request);
  const productName=typeof body.productName==='string'?body.productName.trim().slice(0,120):'';
  const duration=Number(body.duration);
  const rawKey=body.idempotencyKey??crypto.randomUUID();
  if(typeof rawKey!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(rawKey))throw new ApiError('invalid_idempotency_key',400);
  const idempotencyKey=rawKey;
  const fypContext=String(body.fypContext||'').trim().slice(0,3000);
  const productContext=String(body.productContext||'').trim().slice(0,4000);
  if(productName.length<2||!VALID_DURATIONS.has(duration))throw new ApiError('invalid_request',400);
  await ensureSchema(env.DB);
  await recoverExpired(env.DB,identity.id);
  const hash=await sha256Hex(JSON.stringify({productName,duration,fypContext,productContext}));
  const existing=await getJob(env.DB,identity.id,idempotencyKey);
  const repeat=await existingResponse(existing,hash,env,identity);if(repeat)return repeat;
  if(!env.AI||typeof env.AI.run!=='function')throw new ApiError('ai_binding_unavailable',503,'ai_director');
  try{resolveModel(env);}catch(error){throw new ApiError(error.code||'ai_model_unavailable',503,'ai_director');}
  const human=await verifyTurnstile(request,env,body.turnstileToken);
  if(!human.ok)throw new ApiError(human.error,human.error==='turnstile_unavailable'?503:403,'turnstile');
  // cf-connecting-ip is supplied by Cloudflare. Do not trust caller-controlled X-Forwarded-For.
  const ip=request.headers.get('cf-connecting-ip')||'local';
  const ipHash=await sha256Hex(`free-video-lite|${ip}`);
  const minuteOk=await allowRate(env.DB,`script:${ipHash}:${Math.floor(Date.now()/60000)}`,boundedInt(env.SCRIPT_RATE_LIMIT_PER_MINUTE,10,1,100),90);
  if(!minuteOk)return json({error:'rate_limited',stage:'rate'},429,{'retry-after':'60'});
  const day=new Date().toISOString().slice(0,10);
  const dailyOk=await allowRate(env.DB,`script-day:${ipHash}:${day}`,boundedInt(env.SCRIPT_DAILY_PER_IP_LIMIT,30,1,10000),172800);
  if(!dailyOk)return json({error:'rate_limited',stage:'daily_rate'},429,{'retry-after':'3600'});
  const limit=limitFor(env);
  const reservation=await reserveJob(env.DB,identity.id,idempotencyKey,hash,limit);
  if(!reservation.acquired) {
    const row=await getJob(env.DB,identity.id,idempotencyKey);
    const current=await existingResponse(row,hash,env,identity);if(current)return current;
    return json({error:'free_script_limit_reached',stage:'quota',...(await quota(env.DB,identity.id,limit))},402);
  }
  let director;
  try {director=await createDirector(env,productName,duration,fypContext,productContext);}
  catch(error) {
    const reason=error.code||'ai_upstream_unavailable';log(identity,'ai_director',reason);
    try {await failJob(env.DB,identity.id,idempotencyKey,reservation.token,reason);}
    catch {
      log(identity,'d1_refund','refund_pending_recovery');
      // Keep a fenced reserved record for recovery; never erase evidence of a charged failure.
      return json({error:'refund_pending_recovery',stage:'d1_refund',jobId:idempotencyKey,reason,quotaRecoveryPending:true},503,{'retry-after':'180'});
    }
    return json({error:'ai_generation_failed',stage:'ai_director',reason,jobId:idempotencyKey,quotaRefunded:true},503,{'retry-after':'15'});
  }
  try {
    const completed=await completeJob(env.DB,identity.id,idempotencyKey,reservation.token,director);
    if(!completed)return json({error:'attempt_expired',stage:'d1_persist',jobId:idempotencyKey},409);
  }catch {
    log(identity,'d1_persist','persistence_unconfirmed');
    // A write might have committed despite a lost response. Never blindly refund here.
    // Polling/retry returns the stored result, or the expired lease is later released.
    return json({error:'persistence_unconfirmed',stage:'d1_persist',jobId:idempotencyKey,quotaRecoveryPending:true},503,{'retry-after':'5'});
  }
  return json({jobId:idempotencyKey,status:'completed',result:director,remaining:await remainingSafely(env,identity),durable:true});
}
async function handleScriptStatus(request,env,identity,key) {
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(key))throw new ApiError('invalid_job_id',400);
  await ensureSchema(env.DB);await recoverExpired(env.DB,identity.id);
  const row=await getJob(env.DB,identity.id,key);
  if(!row)throw new ApiError('not_found',404);
  if(row.status==='completed'&&row.result_json)return completedResponse(row,env,identity,true);
  if(row.status==='failed'||row.status==='expired')return json({jobId:key,status:'failed',failedReason:row.error_code||'generation_failed',durable:true});
  return json({jobId:key,status:'reserved',pollAfterMs:1500,durable:true});
}
function splitList(value) {
  const values=Array.isArray(value)?value.map(String):String(value||'').split(/[\n,;]+/);
  return values.map(x=>x.trim().slice(0,400)).filter(Boolean).slice(0,20);
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

  if (request.method !== 'POST') return withIdentity(json({ error: 'method_not_allowed', stage: 'api' }, 405), identity);
  let body;
  try { body = await readJson(request); }
  catch (error) { return withIdentity(apiFailure(error, 'api'), identity); }
  const name = String(body.name || '').trim().slice(0, 120);
  if (name.length < 2) return withIdentity(json({ error: 'invalid_product_name', stage: 'api' }, 400), identity);
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


async function handleFypHandoff(request,env) {
  const body=await readJson(request,16*1024);
  const binding=String(body.returnBinding||'');
  if(!validUuid(binding))throw new ApiError('invalid_return_binding',403,'fyp');
  const productName=String(body.productName||'').trim().slice(0,120);
  const duration=Number(body.duration||30);
  const viralHook=String(body.viralHook||'').trim().slice(0,800);
  const directorHints=String(body.directorHints||'').trim().slice(0,3000);
  const sourceUrl=String(body.sourceUrl||'').trim().slice(0,1000);
  if(productName.length<2||!VALID_DURATIONS.has(duration)||(!viralHook&&!directorHints))throw new ApiError('invalid_handoff',400,'fyp');
  await ensureSchema(env.DB);
  const now=Math.floor(Date.now()/1000),token=crypto.randomUUID();
  const payload={productName,duration,viralHook,directorHints,sourceUrl};
  const rows=await env.DB.batch([
    env.DB.prepare(`INSERT INTO fyp_handoffs(token,guest_id,payload_json,expires_at,consumed)
      SELECT ?1,guest_id,?2,?3,0 FROM fyp_bindings WHERE token=?4 AND expires_at>?5`)
      .bind(token,JSON.stringify(payload),now+900,binding,now),
    env.DB.prepare(`DELETE FROM fyp_bindings WHERE token=?1 AND EXISTS(SELECT 1 FROM fyp_handoffs WHERE token=?2)`)
      .bind(binding,token)
  ]);
  if(!Number(rows[0]?.meta?.changes))throw new ApiError('invalid_return_binding',403,'fyp');
  return json({token,returnUrl:`${new URL(request.url).origin}/video#fyp_token=${encodeURIComponent(token)}`,expiresIn:900});
}
async function handleFypConsume(request,env,identity) {
  const body=await readJson(request,2048);
  const token=String(body.token||'');if(!validUuid(token))throw new ApiError('invalid_token',400,'fyp');
  await ensureSchema(env.DB);
  const now=Math.floor(Date.now()/1000);
  const row=await env.DB.prepare(`UPDATE fyp_handoffs SET consumed=1
    WHERE token=?1 AND guest_id=?2 AND expires_at>?3 AND consumed=0 RETURNING payload_json`)
    .bind(token,identity.id,now).first();
  if(row)return json({handoff:JSON.parse(row.payload_json)});
  const state=await env.DB.prepare('SELECT consumed FROM fyp_handoffs WHERE token=?1 AND guest_id=?2 AND expires_at>?3').bind(token,identity.id,now).first();
  return json({error:state?'already_consumed':'not_found_or_expired',stage:'fyp'},state?409:404);
}
// FV-007: only an ApiError carries a code we trust. Any other exception becomes a fixed
// code so an internal message can never reach the response. Every failure carries a stage.
function apiFailure(error, stage) {
  if (error instanceof ApiError) return json({ error: error.message, stage: error.stage || stage }, error.status || 400);
  return json({ error: 'invalid_request', stage }, 400);
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

// FV-008: everything a browser is told to fetch or open must clear an explicit URL rule.
// Applied at the ONE place every provider's results converge, so no provider can bypass it.
const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|\[?::1\]?|.*\.local|.*\.localhost|.*\.internal)$/i;
function isPrivateHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (PRIVATE_HOST.test(host)) return true;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  return host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
}
function safeHttpsUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  let url;
  try { url = new URL(raw); } catch { return undefined; }
  if (url.protocol !== 'https:') return undefined;
  if (url.username || url.password) return undefined;
  if (!url.hostname || isPrivateHost(url.hostname)) return undefined;
  return url.toString();
}
function sanitizeAssetResult(item) {
  const downloadUrl = safeHttpsUrl(item.downloadUrl);
  if (!downloadUrl) return null;
  return {
    ...item,
    downloadUrl,
    previewUrl: safeHttpsUrl(item.previewUrl) || downloadUrl,
    sourcePage: safeHttpsUrl(item.sourcePage),
    licenseUrl: safeHttpsUrl(item.licenseUrl)
  };
}

async function searchPixabay(query, env) {
  if (!env.PIXABAY_API_KEY) return [];
  const params = new URLSearchParams({ key: env.PIXABAY_API_KEY, q: query, per_page: '6', safesearch: 'true', video_type: 'all' });
  const res = await fetchBounded(`https://pixabay.com/api/videos/?${params}`);
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
  const res = await fetchBounded(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=6&orientation=portrait`, { headers: { Authorization: env.PEXELS_API_KEY } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.videos || []).slice(0, 6).map(x => {
    const file = [...(x.video_files || [])].filter(f => f.link && f.width && f.height).sort((a,b) => Math.abs((a.width || 0)-720)-Math.abs((b.width || 0)-720))[0];
    return { source: 'pexels', id: String(x.id), type: 'video', previewUrl: x.image || x.video_pictures?.[0]?.picture || '', downloadUrl: file?.link, sourcePage: x.url, author: x.user?.name, width: file?.width, height: file?.height, duration: x.duration };
  }).filter(x => Boolean(x.downloadUrl));
}

async function searchOpenverse(query) {
  const params = new URLSearchParams({ q: query, page_size: '20', mature: 'false', filter_dead: 'true', license: 'cc0,pdm' });
  const res = await fetchBounded(`https://api.openverse.org/v1/images/?${params}`, { headers: { 'User-Agent': 'Free-Video/0.3.3' } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).map(x => {
    const license = String(x.license || '').toLowerCase();
    if (license !== 'cc0' && license !== 'pdm') return null;
    const url = String(x.thumbnail || x.url || '');
    if (!url) return null;
    return { source: 'openverse', id: String(x.id || x.identifier || url), type: 'image', previewUrl: url, downloadUrl: url, sourcePage: x.foreign_landing_url || undefined, author: String(x.creator || x.provider || 'Openverse').slice(0,120), license, licenseVersion: x.license_version ? String(x.license_version).slice(0,20) : undefined, licenseUrl: x.license_url || undefined, width: Number(x.width)||undefined, height: Number(x.height)||undefined };
  }).filter(Boolean).slice(0,8);
}

async function searchCommons(query) {
  const params = new URLSearchParams({ action:'query', format:'json', origin:'*', generator:'search', gsrsearch:query, gsrnamespace:'6', gsrlimit:'8', prop:'imageinfo', iiprop:'url|size|mime|extmetadata', iiurlwidth:'900' });
  const res = await fetchBounded(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { 'User-Agent': 'Free-Video/0.3.3' } });
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
    return { source:'commons', id:String(page.pageid || page.title || info.url), type:'image', previewUrl:info.thumburl || info.url, downloadUrl:info.thumburl || info.url, sourcePage:page.pageid ? `https://commons.wikimedia.org/?curid=${encodeURIComponent(String(page.pageid))}` : undefined, author:author.slice(0,120), license:license || undefined, licenseUrl:stripHtml(meta.LicenseUrl?.value || '') || undefined, width:Number(info.thumbwidth || info.width)||undefined, height:Number(info.thumbheight || info.height)||undefined };
  }).filter(Boolean).slice(0,6);
}

async function searchMedia(rawQuery, env) {
  const query = normalizeAssetSearchQuery(rawQuery);
  const normalized = normalizeAssetKeyword(rawQuery);
  if (query.length < 2) return { query, cached: false, results: [] };
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(`https://free-video-cache.invalid/media/${encodeURIComponent(normalized)}`);
  const cached = cache ? await cache.match(cacheKey).catch(() => null) : null;
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
  const results = [...new Map(merged.map(item => [`${item.source}:${item.id}`, item])).values()]
    .map(sanitizeAssetResult).filter(Boolean).slice(0,8);
  if (cache) await cache.put(cacheKey, new Response(JSON.stringify(results), { headers: { 'content-type':'application/json', 'cache-control':`public,max-age=${results.length ? 86400 : 120}` } })).catch(() => undefined);
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
  catch (error) { return withIdentity(apiFailure(error, 'assets'), identity); }
  const rawScenes = Array.isArray(body.scenes) ? body.scenes : [];
  if (rawScenes.some(s => !s || typeof s !== 'object' || Array.isArray(s)) || rawScenes.length < 1 || rawScenes.length > 24) return withIdentity(json({ error:'invalid_scene_count', stage:'assets' }, 400), identity);
  const scenes = rawScenes.map((scene,index) => ({
    id:String(scene.id || `scene-${index+1}`).slice(0,80), duration:Math.max(1,Math.min(15,Number(scene.duration)||3)),
    template:String(scene.template || 'lifestyle'), assetKeyword:String(scene.assetKeyword || '').trim().slice(0,100)
  }));
  try { return withIdentity(json({ assignments: await planSceneAssets(scenes, String(body.productName || '').trim().slice(0,120), env) }), identity); }
  catch (error) { console.error('[assets-plan]', error); return withIdentity(json({ error:'media_broker_unavailable', stage:'assets' }, 503), identity); }
}

async function handleAssetsSearch(request, env, identity) {
  const url = new URL(request.url);
  const q = String(url.searchParams.get('q') || '').trim().slice(0,100);
  if (q.length < 2) return withIdentity(json({ error:'query_too_short', stage:'assets' }, 400), identity);
  try { return withIdentity(json(await searchMedia(q, env)), identity); }
  catch (error) { console.error('[assets-search]', error); return withIdentity(json({ error:'media_broker_unavailable', stage:'assets' }, 503), identity); }
}

async function dispatch(request,env,identity) {
  const url=new URL(request.url),p=url.pathname;
  if(p==='/api/health'&&request.method==='GET')return json({ok:true,version:'0.3.3-lite',architecture:'cloudflare-lite',ai:'workers-ai',storage:'d1',render:'local-device',check:'liveness-only'});
  if(p==='/api/ready'&&request.method==='GET') {
    await ensureSchema(env.DB,true);
    if(!env.AI||typeof env.AI.run!=='function')throw new ApiError('ai_binding_unavailable',503,'ai_director');
    let model;try{model=resolveModel(env);}catch(error){throw new ApiError(error.code||'ai_model_unavailable',503,'ai_director');}
    return json({ok:true,version:'0.3.3-lite',database:'ready',schemaVersion:2,model,inferenceChecked:false});
  }
  if(p==='/api/scripts/quota'&&request.method==='GET')return await handleQuota(request,env,identity);
  if(p==='/api/scripts/jobs'&&request.method==='POST')return await handleScript(request,env,identity);
  const match=p.match(/^\/api\/scripts\/jobs\/([^/]+)$/);
  if(match&&request.method==='GET'){
    let key;try{key=decodeURIComponent(match[1]);}catch{throw new ApiError('invalid_job_id',400);}
    return await handleScriptStatus(request,env,identity,key);
  }
  if(p==='/api/projects'&&['GET','POST'].includes(request.method))return await handleProjects(request,env,identity);
  if(p==='/api/fyp/start'&&request.method==='GET')return await handleFypStart(request,env,identity);
  if(p==='/api/fyp/handoff'&&request.method==='OPTIONS'){
    const origin=request.headers.get('origin');
    const allowed=new URL(env.FYP_URL||'https://fyp.eco-velo.com').origin;
    if(origin!==allowed)throw new ApiError('origin_not_allowed',403,'fyp');
    return new Response(null,{status:204,headers:{'access-control-allow-origin':allowed,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Content-Type','access-control-max-age':'600','vary':'Origin'}});
  }
  if(p==='/api/fyp/handoff'&&request.method==='POST')return await handleFypHandoff(request,env);
  if(p==='/api/fyp/handoff/consume'&&request.method==='POST')return await handleFypConsume(request,env,identity);
  if(p==='/api/assets/plan'&&request.method==='POST')return await handleAssetsPlan(request,env,identity);
  if(p==='/api/assets/search'&&request.method==='GET')return await handleAssetsSearch(request,env,identity);
  return json({error:'not_found',stage:'api'},404);
}
async function handleApi(request,env) {
  const requestId=crypto.randomUUID();let identity;let response;
  try {
    identity=getIdentity(request);identity.requestId=requestId;
    const url=new URL(request.url),origin=request.headers.get('origin');
    const fypOrigin=new URL(env.FYP_URL||'https://fyp.eco-velo.com').origin;
    if(request.method==='POST'&&origin&&origin!==url.origin&&!(url.pathname==='/api/fyp/handoff'&&origin===fypOrigin))throw new ApiError('origin_not_allowed',403);
    // The await is essential: async errors must enter THIS exception boundary.
    response=await dispatch(request,env,{id:identity.id,requestId});
  }catch(error) {
    let status=500,code='internal_error',stage='api';
    if(error instanceof ApiError){status=error.status;code=error.message;stage=error.stage;}
    else if(['database_not_initialized','database_binding_unavailable'].includes(error?.message)){
      status=503;code='quota_database_unavailable';stage='d1_schema';
    }else if(error?.message==='not_found'&&error.status===404){status=404;code='not_found';}
    else if(/D1|SQLITE|database/i.test(String(error?.message||''))){status=503;code='quota_database_unavailable';stage='d1_storage';}
    logError(stage,requestId,code);
    response=json({error:code,stage,requestId},status);
  }
  if(response.status>=400 && response.headers.get('content-type')?.includes('application/json')) {
    response=json({...await response.json(),requestId},response.status,Object.fromEntries(response.headers));
  }
  const headers=new Headers(response.headers);headers.set('x-request-id',requestId);
  if(new URL(request.url).pathname==='/api/fyp/handoff'){
    try{const allowed=new URL(env.FYP_URL||'https://fyp.eco-velo.com').origin;
      if(request.headers.get('origin')===allowed){headers.set('access-control-allow-origin',allowed);headers.set('vary','Origin');}
    }catch{}
  }
  return withIdentity(new Response(response.body,{status:response.status,headers}),identity);
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==='/api'||url.pathname.startsWith('/api/'))return await handleApi(request,env);
    if(!env.ASSETS||typeof env.ASSETS.fetch!=='function')return json({error:'assets_unavailable',stage:'assets'},503);
    return await env.ASSETS.fetch(request);
  }
};
