// T5-3/T5-4/T5-5/T5-6 verification against the ORIGINAL renderer source (type-erased only).
// Real Chrome, real WebCodecs, real OPFS. Narration uses REAL local Supertonic F5 / id WAVs
// produced in CR-002 C2-1/C2-1b. No remote AI, no production D1.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { buildRenderer } from './build-renderer.mjs';
import { fixtureDirector } from './fixture-director.mjs';
import { launch, Session } from './cdp.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const outDir = path.join(root, 'evidence/dev/STEP-5/T5-verify/artifacts');
fs.mkdirSync(outDir, { recursive: true });
const renderer = buildRenderer();
const MB = path.join(root, 'node_modules/mediabunny');
const AAC = path.join(root, 'node_modules/@mediabunny/aac-encoder');

// Real F5 narration, chosen so each one is shorter than the duration it is paired with.
const F5 = {
  '15s': 'evidence/dev/CR-002/C2-1/wav/multi-1.wav',      // 28 words, ~11.98s
  '30s': 'evidence/dev/CR-002/C2-1b/wav/lf-30s.wav',      // 60 words, ~27.68s
  '60s': 'evidence/dev/CR-002/C2-1b/wav/lf-60s.wav',      // 120 words, ~55.28s
  '90s': 'evidence/dev/CR-002/C2-1b/wav/lf-90s.wav',      // 185 words, ~86.53s
  '120s': 'evidence/dev/CR-002/C2-1b/wav/lf-120s.wav',    // 245 words, ~114.35s
  overflow: 'evidence/dev/CR-002/C2-1b/wav/lf-60s-b.wav'  // 133 words, ~62.48s -> overflows 60s
};
const wavBytes = Object.fromEntries(Object.entries(F5).map(([k, p]) => [k, fs.readFileSync(path.join(root, p))]));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const page = `<!doctype html><html><head><meta charset="utf-8"><title>renderer verify</title>
<script type="importmap">{"imports":{
  "mediabunny":"/nm/mediabunny/dist/bundles/mediabunny.mjs",
  "@mediabunny/aac-encoder":"/nm/aac/dist/bundles/mediabunny-aac-encoder.mjs"
}}</script></head><body>
<script>window.process={env:{}};</script>
<script type="module">
try { const m = await import('/repro/video-renderer.js'); window.renderDirectorToMp4 = m.renderDirectorToMp4; window.__ready = true; }
catch (e) { window.__loadError = String((e && (e.stack || e.message)) || e); }
</script></body></html>`;

const hanging = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(page); }
  if (u.pathname === '/repro/video-renderer.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); return res.end(renderer.code); }
  if (u.pathname === '/asset.png') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(PNG); }
  if (u.pathname === '/hang.png') { hanging.push(res); res.writeHead(200, { 'content-type': 'image/png' }); return; }
  const up = u.pathname.match(/^\/upload\/(.+)$/);
  if (up && req.method === 'POST') {
    // Returning multi-megabyte base64 through CDP Runtime.evaluate stalls; the page streams
    // the finished MP4 here instead. Harness plumbing only.
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => { fs.writeFileSync(path.join(outDir, decodeURIComponent(up[1])), Buffer.concat(chunks)); res.writeHead(200); res.end('ok'); });
    return;
  }
  const wav = u.pathname.match(/^\/wav\/(.+)$/);
  if (wav && wavBytes[wav[1]]) { res.writeHead(200, { 'content-type': 'audio/wav' }); return res.end(wavBytes[wav[1]]); }
  const serve = (base, rest) => { try { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); res.end(fs.readFileSync(path.join(base, rest))); } catch { res.writeHead(404); res.end('nf'); } };
  if (u.pathname.startsWith('/nm/aac/')) return serve(AAC, u.pathname.slice('/nm/aac/'.length));
  if (u.pathname.startsWith('/nm/mediabunny/')) return serve(MB, u.pathname.slice('/nm/mediabunny/'.length));
  res.writeHead(404); res.end('nf');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const report = { task: 'T5-3/4/5/6 renderer fix verification', recordedAt: new Date().toISOString(),
  narration: 'REAL local Supertonic F5 / id WAVs from CR-002 C2-1 and C2-1b', cases: [] };
const browser = await launch({ extraArgs: ['--__nodisablegpu'] });
try {
  const s = await Session.connect(browser.wsUrl);
  await s.attachToPage();
  await s.navigate(origin + '/');
  const ready = await s.eval(`new Promise(r=>{const t0=Date.now();const t=setInterval(()=>{if(window.__ready||window.__loadError||Date.now()-t0>20000){clearInterval(t);r({ready:!!window.__ready,loadError:window.__loadError||null})}},50)})`, { timeoutMs: 40000 });
  if (!ready.ready) { console.log(JSON.stringify({ aborted: true, detail: ready.loadError }, null, 2)); browser.kill(); server.close(); process.exit(3); }

  await s.eval(`window.__h = {
    async wav(name){ const r = await fetch('/wav/' + name); return await r.blob(); },
    silentWav(seconds, sampleRate = 44100){
      const n = Math.round(seconds * sampleRate), buf = new ArrayBuffer(44 + n*2), dv = new DataView(buf);
      const w = (o,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));};
      w(0,'RIFF');dv.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');dv.setUint32(16,16,true);
      dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,sampleRate,true);
      dv.setUint32(28,sampleRate*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);
      w(36,'data');dv.setUint32(40,n*2,true);
      return new Blob([buf],{type:'audio/wav'});
    },
    async opfsList(){ try { const r=await navigator.storage.getDirectory(); const d=await r.getDirectoryHandle('free-video-renders',{create:false}); const o=[]; for await (const [n,h] of d.entries()){let sz=null;try{sz=(await h.getFile()).size}catch{};o.push({name:n,size:sz});} return o; } catch(e){ return []; } },
    async opfsClear(){ try{ const r=await navigator.storage.getDirectory(); await r.removeEntry('free-video-renders',{recursive:true}); return true;}catch{return false;} },
    async save(name, blob){ await fetch('/upload/' + encodeURIComponent(name), { method: 'POST', body: blob }); return blob.size; },
    async tailRms(blob, fromSec){ const ac=new AudioContext(); const d=await ac.decodeAudioData(await blob.arrayBuffer());
      const start=Math.min(d.length,Math.ceil(fromSec*d.sampleRate)); const ch=d.getChannelData(0);
      let sum=0,n=0,peak=0; for(let i=start;i<ch.length;i++){sum+=ch[i]*ch[i];n++;peak=Math.max(peak,Math.abs(ch[i]));}
      const out={durationSec:d.duration,tailSeconds:d.duration-fromSec,rmsDb:n?20*Math.log10(Math.sqrt(sum/n)):null,peak};
      await ac.close(); return out; }
  }; 'ok'`);

  const assets = d => `Object.fromEntries(${JSON.stringify(d.scenes.map(x => x.id))}.map(id=>[id,{type:'image',downloadUrl:'${origin}/asset.png'}]))`;
  const add = (id, note, value, verdict) => { report.cases.push({ id, note, value, verdict }); console.error(`[${id}] ${verdict}`); };
  const run = (expr, timeoutMs = 1800000) => s.eval(expr, { timeoutMs });

  // --- T5-9 / C2-4: all five durations, twice each, with REAL F5 narration ---
  for (const dur of [15, 30, 60, 90, 120]) {
    const d = fixtureDirector(dur);
    const runs = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      const v = await run(`(async () => {
        await window.__h.opfsClear();
        const wav = await window.__h.wav('${dur}s');
        let out=null,error=null;
        try { const r = await window.renderDirectorToMp4(${JSON.stringify(d)}, { sceneAssets: ${assets(d)}, narrationWav: wav, preferDiskForLongVideo: false });
          await window.__h.save('t59-${dur}s-run${attempt}.mp4', r.blob);
          out = { mode: r.mode, size: r.blob.size, file: 't59-${dur}s-run${attempt}.mp4' };
        } catch(e){ error = e.message; }
        return { ok: !error, error, out, opfsLeftovers: await window.__h.opfsList() };
      })()`);
      runs.push(v);
    }
    // A finished OPFS export IS the file left in OPFS — that is the delivery path. What must
    // never remain is a .crswap scratch file or a 0-byte stub.
    add(`T5-9-${dur}s`, `${dur} 秒真实 F5 连续两次导出`, runs,
      runs.every(r => r.ok && r.out.size > 0
        && !r.opfsLeftovers.some(x => x.name.endsWith('.crswap') || x.size === 0)) ? 'PASS' : 'FAIL');
  }
  // --- FV-005 cleanup on failure ---
  {
    const d = fixtureDirector(90);
    const v = await run(`(async () => {
      await window.__h.opfsClear();
      const wav = await window.__h.silentWav(90);   // rejected by the FV-006 guard mid-setup
      let error=null; try { await window.renderDirectorToMp4(${JSON.stringify(d)}, { sceneAssets: ${assets(d)}, narrationWav: wav, preferDiskForLongVideo: false }); } catch(e){ error=e.message; }
      return { error, opfsLeftovers: await window.__h.opfsList() };
    })()`);
    add('FV-005-cleanup', '失败后 OPFS 不得残留临时文件', v, v.error && v.opfsLeftovers.length === 0 ? 'PASS' : 'FAIL');
  }
  // --- FV-006 ---
  {
    const d = fixtureDirector(15);
    const v = await run(`(async () => {
      await window.__h.opfsClear();
      const silent = await window.__h.silentWav(15);
      let silentResult=null, realResult=null;
      try { const r = await window.renderDirectorToMp4(${JSON.stringify(d)}, { sceneAssets: ${assets(d)}, narrationWav: silent, preferDiskForLongVideo: false }); silentResult = { unexpectedSuccess: true, size: r.blob.size }; }
      catch(e){ silentResult = { rejected: true, error: e.message }; }
      const real = await window.__h.wav('15s');
      try { const r = await window.renderDirectorToMp4(${JSON.stringify(d)}, { sceneAssets: ${assets(d)}, narrationWav: real, preferDiskForLongVideo: false });
        await window.__h.save('fv006-real-f5-15s.mp4', r.blob);
        realResult = { ok: true, size: r.blob.size, file: 'fv006-real-f5-15s.mp4' }; }
      catch(e){ realResult = { ok: false, error: e.message }; }
      return { silentResult, realResult };
    })()`);
    add('FV-006', '全零 PCM 被拒；真实 F5 通过',
      v, v.silentResult.rejected && v.silentResult.error === 'narration_silent' && v.realResult.ok ? 'PASS' : 'FAIL');
  }
  // --- FV-009 ---
  {
    const d = fixtureDirector(15);
    const v = await run(`(async () => {
      const wav = await window.__h.wav('15s');
      const started = performance.now();
      let settled=null,error=null;
      try { const r = await window.renderDirectorToMp4(${JSON.stringify(d)}, {
          sceneAssets: Object.fromEntries(${JSON.stringify(fixtureDirector(15).scenes.map(x => x.id))}.map(id=>[id,{type:'image',downloadUrl:'${origin}/hang.png'}])),
          narrationWav: wav, preferDiskForLongVideo: false });
        settled = { mode: r.mode }; } catch(e){ error = e.message; }
      return { settled, error, elapsedMs: Math.round(performance.now()-started) };
    })()`, 120000);
    add('FV-009', '挂起素材连接必须在有限时间内失败并走回退',
      v, v.elapsedMs < 60000 && (v.error === 'external_visual_unavailable' || v.settled) ? 'PASS' : 'FAIL');
  }
  // --- FV-010 ---
  {
    const d60 = fixtureDirector(60);
    const v = await run(`(async () => {
      await window.__h.opfsClear();
      const overflow = await window.__h.wav('overflow');   // 133 words, ~62.48s vs 60s target
      let overflowResult=null, normalResult=null;
      try { const r = await window.renderDirectorToMp4(${JSON.stringify(d60)}, { sceneAssets: ${assets(d60)}, narrationWav: overflow, preferDiskForLongVideo: false });
        const bytes=new Uint8Array(await r.blob.arrayBuffer()); overflowResult={ unexpectedSuccess:true, size:bytes.length }; }
      catch(e){ overflowResult={ rejected:true, error:e.message }; }
      const fitting = await window.__h.wav('60s');         // 120 words, ~55.28s -> silence only
      const before = await window.__h.tailRms(fitting, 55.283);
      try { const r = await window.renderDirectorToMp4(${JSON.stringify(d60)}, { sceneAssets: ${assets(d60)}, narrationWav: fitting, preferDiskForLongVideo: false });
        await window.__h.save('fv010-60s-fitting.mp4', r.blob);
        normalResult={ ok:true, size:r.blob.size, file:'fv010-60s-fitting.mp4' }; }
      catch(e){ normalResult={ ok:false, error:e.message }; }
      return { overflowResult, normalResult, fittingSourceTail: before };
    })()`);
    add('FV-010', '超出有效语音必须明确失败；仅尾部静音可裁',
      v, v.overflowResult.rejected && v.overflowResult.error === 'narration_exceeds_duration' && v.normalResult.ok ? 'PASS' : 'FAIL');
  }
  s.close();
} finally {
  for (const r of hanging) { try { r.destroy(); } catch {} }
  browser.kill(); server.close();
}
const fails = report.cases.filter(c => c.verdict === 'FAIL');
report.summary = { total: report.cases.length, pass: report.cases.length - fails.length, fail: fails.length, failedIds: fails.map(c => c.id) };
console.log(JSON.stringify(report, null, 2));
process.exit(fails.length ? 1 : 0);
