export class ApiError extends Error {
  constructor(code, status = 500, stage = 'api', extra = {}) {
    super(code); this.status = status; this.stage = stage; this.extra = extra;
  }
}
export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff',...extraHeaders
  }});
}
export async function readJson(request, maxBytes = 24 * 1024) {
  if (Number(request.headers.get('content-length') || 0) > maxBytes) throw new ApiError('request_too_large',413);
  const reader = request.body?.getReader();
  const parts = []; let size = 0;
  if (reader) {
    try {
      while (true) {
        const {value,done} = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel().catch(()=>{}); throw new ApiError('request_too_large',413); }
        parts.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part,offset); offset+=part.length; }
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes) || '{}'); }
  catch { throw new ApiError('invalid_json',400); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError('invalid_json_object',400);
  return data;
}
export function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}
export function getIdentity(request) {
  let id;
  for (const part of String(request.headers.get('cookie') || '').split(';')) {
    const i=part.indexOf('=');
    if(i<0 || part.slice(0,i).trim()!=='free_video_guest') continue;
    try { id=decodeURIComponent(part.slice(i+1).trim()); } catch { id=undefined; }
    break;
  }
  let setCookie;
  if (!validUuid(id)) {
    id=crypto.randomUUID();
    setCookie=`free_video_guest=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000${new URL(request.url).protocol==='https:'?'; Secure':''}`;
  }
  return {id,setCookie};
}
export function withIdentity(response,identity) {
  if(!identity?.setCookie) return response;
  const headers=new Headers(response.headers); headers.append('set-cookie',identity.setCookie);
  return new Response(response.body,{status:response.status,headers});
}
export async function sha256Hex(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
// Do not log product text, AI payloads, cookies or keys. Error codes are separately whitelisted.
export function logError(stage,requestId,reason) {
  console.error(JSON.stringify({event:'free_video_error',stage,requestId,reason}));
}
export async function fetchBounded(url,options={},timeout=8000) {
  return fetch(url,{...options,signal:AbortSignal.timeout(timeout)});
}
