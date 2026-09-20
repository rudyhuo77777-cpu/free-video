import http from 'node:http';
import { launch, Session } from './cdp.mjs';
const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<title>p</title>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const FLAGSETS = {
  'disable-gpu(current)': { headless: true, extraArgs: [] },
  'gpu-enabled': { headless: true, extraArgs: ['--use-angle=default'], noDisableGpu: true },
  'swiftshader': { headless: true, extraArgs: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'], noDisableGpu: true },
  'headful': { headless: false, extraArgs: [], noDisableGpu: true }
};
const out = {};
for (const [name, cfg] of Object.entries(FLAGSETS)) {
  let b;
  try {
    b = await launch({ headless: cfg.headless, extraArgs: [...(cfg.extraArgs || []), ...(cfg.noDisableGpu ? ['--__nodisablegpu'] : [])] });
    const s = await Session.connect(b.wsUrl);
    await s.attachToPage();
    await s.navigate(`http://127.0.0.1:${port}/`);
    out[name] = await s.eval(`(async () => {
      const cfgs = {
        'avc1.64001f 720x1280 prefer-hardware': {codec:'avc1.64001f',width:720,height:1280,bitrate:2829000,framerate:15,hardwareAcceleration:'prefer-hardware'},
        'avc1.64001f 720x1280 no-pref':        {codec:'avc1.64001f',width:720,height:1280,bitrate:2829000,framerate:15},
        'avc1.4d001f 720x1280 no-pref':        {codec:'avc1.4d001f',width:720,height:1280,bitrate:2829000,framerate:15},
        'avc1.42001f 720x1280 no-pref':        {codec:'avc1.42001f',width:720,height:1280,bitrate:2829000,framerate:15},
        'avc1.64001f 540x960 prefer-hardware': {codec:'avc1.64001f',width:540,height:960,bitrate:1200000,framerate:12,hardwareAcceleration:'prefer-hardware'}
      };
      const r = {};
      for (const [k,c] of Object.entries(cfgs)) { try { r[k] = (await VideoEncoder.isConfigSupported(c)).supported; } catch(e) { r[k] = 'ERR:'+e.message; } }
      r.aac = (await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:1,bitrate:128000})).supported;
      return r;
    })()`);
    s.close();
  } catch (e) { out[name] = { launchError: String(e.message) }; }
  finally { try { b?.kill(); } catch {} }
}
console.log(JSON.stringify(out, null, 2));
server.close();
process.exit(0);
