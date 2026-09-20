import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const HOST = '127.0.0.1';
const PORT = Number(process.env.AURIA_VOICE_BRIDGE_PORT || 8787);
const MAX_TEXT_CHARS = Number(process.env.AURIA_TTS_MAX_TEXT_CHARS || 6000);
const TOKEN = crypto.randomBytes(32).toString('base64url');
const ALLOWED_ORIGINS = new Set(
  String(process.env.AURIA_VOICE_ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:8790,http://127.0.0.1:8790,https://freevideo.eco-velo.com')
    .split(',').map(x => x.trim()).filter(Boolean)
);
let active = 0;

function originAllowed(req) {
  const origin = req.headers.origin;
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  return {
    ...(origin && ALLOWED_ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type,authorization',
    'Access-Control-Allow-Private-Network': 'true',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': 'no-store'
  };
}

function authorized(req) {
  const raw = String(req.headers.authorization || '');
  if (!raw.startsWith('Bearer ')) return false;
  const incoming = Buffer.from(raw.slice(7));
  const expected = Buffer.from(TOKEN);
  return incoming.length === expected.length && crypto.timingSafeEqual(incoming, expected);
}

function findSupertonic() {
  const explicit = process.env.SUPERTONIC_EXE;
  if (explicit && fsSync.existsSync(explicit)) return explicit;

  if (process.platform === 'win32') {
    const found = spawnSync('where.exe', ['supertonic'], { encoding: 'utf8', windowsHide: true });
    const line = String(found.stdout || '').split(/\r?\n/).map(x => x.trim()).find(Boolean);
    if (line && fsSync.existsSync(line)) return line;

    const local = process.env.LOCALAPPDATA || '';
    const appData = process.env.APPDATA || '';
    const candidates = [
      path.join(local, 'Packages', 'PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0', 'LocalCache', 'local-packages', 'Python313', 'Scripts', 'supertonic.exe'),
      path.join(appData, 'Python', 'Python313', 'Scripts', 'supertonic.exe')
    ];
    for (const candidate of candidates) if (fsSync.existsSync(candidate)) return candidate;
  }
  return null;
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_TEXT_CHARS * 3) throw new Error('body_too_large');
  }
  return JSON.parse(raw || '{}');
}

function runTts(exe, text, output) {
  return new Promise((resolve, reject) => {
    // Production bridge is intentionally locked to the tested Indonesian voice.
    const child = spawn(exe, ['tts', text, '-o', output, '--voice', 'F5', '--lang', 'id'], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('tts_timeout'));
    }, 120000);
    child.stderr.on('data', chunk => { stderr += String(chunk).slice(-4000); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`supertonic_exit_${code}:${stderr.slice(-500)}`));
    });
  });
}

const server = http.createServer(async (req, res) => {
  const headers = corsHeaders(req);
  if (!originAllowed(req)) {
    res.writeHead(403, { ...headers, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'origin_not_allowed' }));
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    const exe = findSupertonic();
    res.writeHead(exe ? 200 : 503, { ...headers, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: Boolean(exe), provider: exe ? 'supertonic-local' : null, voice: 'F5', lang: 'id', pairing: true }));
    return;
  }

  // Pairing is only reachable from explicitly allowed AURIA origins and localhost.
  if (req.method === 'POST' && req.url === '/pair') {
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ token: TOKEN, expires: 'bridge-restart' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/tts') {
    if (!authorized(req)) {
      res.writeHead(401, { ...headers, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'pairing_required' }));
      return;
    }
    if (active >= 1) {
      res.writeHead(429, { ...headers, 'Content-Type': 'application/json', 'Retry-After': '2' });
      res.end(JSON.stringify({ error: 'local_tts_busy' }));
      return;
    }

    const exe = findSupertonic();
    if (!exe) {
      res.writeHead(503, { ...headers, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'supertonic_not_found', hint: 'Set SUPERTONIC_EXE or add supertonic.exe to PATH.' }));
      return;
    }

    active++;
    const temp = path.join(os.tmpdir(), `free-video-tts-${crypto.randomUUID()}.wav`);
    try {
      const body = await readJson(req);
      const text = String(body.text || '').trim();
      if (text.length < 1 || text.length > MAX_TEXT_CHARS) {
        res.writeHead(400, { ...headers, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_text_length', max: MAX_TEXT_CHARS }));
        return;
      }
      await runTts(exe, text, temp);
      const wav = await fs.readFile(temp);
      res.writeHead(200, { ...headers, 'Content-Type': 'audio/wav', 'Content-Length': String(wav.length) });
      res.end(wav);
    } catch (error) {
      res.writeHead(500, { ...headers, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'tts_failed' }));
    } finally {
      active--;
      await fs.unlink(temp).catch(() => undefined);
    }
    return;
  }

  res.writeHead(404, { ...headers, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(PORT, HOST, () => {
  const exe = findSupertonic();
  console.log(`[Free Video Voice Bridge] http://${HOST}:${PORT}`);
  console.log(`[Free Video Voice Bridge] Supertonic: ${exe ? 'FOUND' : 'NOT FOUND'}`);
  console.log(`[Free Video Voice Bridge] Allowed origins: ${[...ALLOWED_ORIGINS].join(', ')}`);
  console.log('[Free Video Voice Bridge] Localhost only; /tts requires an in-memory pairing token. Voice is locked to F5 / id.');
});
