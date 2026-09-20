// Probe: does this Chrome support the capabilities FV-005/006/009/010 reproduction needs?
// Must be served from a secure context (http://localhost) — data: URLs are opaque origins.
import http from 'node:http';
import { launch, Session } from './cdp.mjs';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><title>probe</title><body>probe</body>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

console.error('[p] launching');
const b = await launch();
console.error('[p] chrome up on port '+b.debugPort);
try {
  const s = await Session.connect(b.wsUrl);
  await s.attachToPage();
  await s.navigate(`http://127.0.0.1:${port}/`);
  const caps = await s.eval(`(async () => {
    const out = {
      origin: location.origin,
      isSecureContext,
      ua: navigator.userAgent,
      videoEncoder: typeof VideoEncoder !== 'undefined',
      audioEncoder: typeof AudioEncoder !== 'undefined',
      opfs: Boolean(navigator.storage && navigator.storage.getDirectory),
      showSaveFilePicker: typeof window.showSaveFilePicker === 'function',
      audioContext: typeof AudioContext !== 'undefined'
    };
    if (out.videoEncoder) {
      try { out.avc = (await VideoEncoder.isConfigSupported({codec:'avc1.42001f',width:720,height:1280,bitrate:2000000,framerate:15})).supported; } catch(e){ out.avc='ERR:'+e.message; }
      try { out.avcLong = (await VideoEncoder.isConfigSupported({codec:'avc1.42001f',width:540,height:960,bitrate:1200000,framerate:12})).supported; } catch(e){ out.avcLong='ERR:'+e.message; }
    }
    if (out.audioEncoder) {
      try { out.aac = (await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:1,bitrate:128000})).supported; } catch(e){ out.aac='ERR:'+e.message; }
    }
    if (out.opfs) {
      try { const r = await navigator.storage.getDirectory(); const d = await r.getDirectoryHandle('probe',{create:true}); const f = await d.getFileHandle('t.bin',{create:true}); const w = await f.createWritable(); await w.write(new Uint8Array([1,2,3])); await w.close(); out.opfsWrite = (await f.getFile()).size; await d.removeEntry('t.bin'); } catch(e){ out.opfsWrite='ERR:'+e.message; }
    }
    return out;
  })()`);
  console.log(JSON.stringify(caps, null, 2));
  s.close();
} finally { b.kill(); server.close(); process.exit(0); }
