// C2-1: measures the real local Supertonic F5 Indonesian speaking rate.
// Read-only against the product: it only runs the existing engine and analyses WAVs.
// Voice and language stay locked to F5 / id, exactly as apps/voice-bridge/server.mjs uses them.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
const outDir = path.join(root, 'evidence/dev/CR-002/C2-1');
const wavDir = path.join(outDir, 'wav');
fs.mkdirSync(wavDir, { recursive: true });

const EXE = process.env.SUPERTONIC_EXE || '/mnt/c/Users/Hongyan/AppData/Local/Programs/Python/Python311/Scripts/supertonic.exe';
// Silence threshold used to find where real speech starts and ends. Stated explicitly so the
// number is auditable; sensitivity at -40 and -60 dBFS is reported alongside.
const PRIMARY_THRESHOLD_DB = -50;
const WINDOW_MS = 20;

// Indonesian marketing narration in the product's own domain, four sentence styles.
const SAMPLES = [
  { id: 'short-1', style: 'short', text: 'Botol ini ringan dan mudah dibawa.' },
  { id: 'short-2', style: 'short', text: 'Tutupnya rapat sehingga air tidak tumpah.' },
  { id: 'short-3', style: 'short', text: 'Cek detail produknya sekarang.' },
  { id: 'short-4', style: 'short', text: 'Bahannya stainless tebal dan awet.' },
  { id: 'medium-1', style: 'medium', text: 'Bahan stainless tebal membuat botol ini awet dipakai setiap hari, bahkan untuk perjalanan jauh.' },
  { id: 'medium-2', style: 'medium', text: 'Ukurannya pas untuk dibawa ke kantor maupun ke kampus, dan tetap muat di dalam tas kecil.' },
  { id: 'medium-3', style: 'medium', text: 'Bagian dalam mudah dibersihkan tanpa meninggalkan bau, jadi kamu tidak perlu khawatir soal kebersihan.' },
  { id: 'medium-4', style: 'medium', text: 'Suhu air tetap terjaga selama beberapa jam pemakaian, cocok untuk kegiatan di luar ruangan.' },
  { id: 'long-1', style: 'long', text: 'Kalau kamu sering lupa membawa minum, botol ini membantu karena ukurannya pas di tas, tutupnya rapat, dan bahannya tidak mudah penyok meskipun sering terbentur di perjalanan setiap hari.' },
  { id: 'long-2', style: 'long', text: 'Sebelum memilih botol minum, cek dulu ketebalan bahannya, sistem penguncian tutupnya, dan apakah bagian dalamnya mudah dibersihkan, karena tiga hal itu yang paling menentukan kenyamanan pemakaian harian.' },
  { id: 'long-3', style: 'long', text: 'Banyak orang membeli botol minum hanya melihat warnanya, padahal yang lebih penting adalah apakah suhu air tetap terjaga, apakah tutupnya benar benar rapat, dan apakah ukurannya sesuai dengan tas yang biasa kamu pakai.' },
  { id: 'long-4', style: 'long', text: 'Perhatikan juga bagian ulir tutup dan karet penyegelnya, sebab dua bagian itu yang paling sering membuat air merembes di dalam tas, terutama kalau botol sering dimasukkan dan dikeluarkan sepanjang hari.' },
  { id: 'multi-1', style: 'multi-sentence', text: 'Cek bentuk dan detail produk ini sebelum kamu memilih. Bahan stainless tebal membuat botol ini awet dipakai setiap hari. Tutupnya rapat sehingga air tidak tumpah di dalam tas.' },
  { id: 'multi-2', style: 'multi-sentence', text: 'Ukurannya pas untuk dibawa ke kantor maupun ke kampus. Bagian dalam mudah dibersihkan tanpa meninggalkan bau. Suhu air tetap terjaga selama beberapa jam pemakaian. Cek detail produknya sekarang.' },
  { id: 'multi-3', style: 'multi-sentence', text: 'Apa yang perlu kamu cek sebelum membeli botol minum? Pertama, ketebalan bahannya. Kedua, sistem penguncian tutupnya. Ketiga, apakah bagian dalamnya mudah dibersihkan. Tiga hal itu paling menentukan.' },
  { id: 'multi-4', style: 'multi-sentence', text: 'Botol ini ringan dan mudah dibawa. Tutupnya rapat sehingga air tidak tumpah. Bahannya stainless tebal dan awet. Ukurannya pas di dalam tas. Cek detail produknya sekarang juga.' }
];

function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a RIFF/WAVE file');
  let pos = 12, fmt = null, dataOffset = null, dataLength = 0;
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    if (id === 'fmt ') fmt = { audioFormat: b.readUInt16LE(pos + 8), channels: b.readUInt16LE(pos + 10), sampleRate: b.readUInt32LE(pos + 12), bitsPerSample: b.readUInt16LE(pos + 22) };
    if (id === 'data') { dataOffset = pos + 8; dataLength = size; }
    pos += 8 + size + (size % 2);
  }
  if (!fmt || dataOffset === null) throw new Error('missing fmt/data chunk');
  if (fmt.bitsPerSample !== 16 || fmt.audioFormat !== 1) throw new Error(`unsupported wav: fmt=${fmt.audioFormat} bits=${fmt.bitsPerSample}`);
  const frames = Math.floor(Math.min(dataLength, b.length - dataOffset) / 2 / fmt.channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) sum += b.readInt16LE(dataOffset + (i * fmt.channels + c) * 2) / 32768;
    mono[i] = sum / fmt.channels;
  }
  return { ...fmt, frames, mono, durationSec: frames / fmt.sampleRate };
}

function analyse(wav, thresholdDb) {
  const win = Math.max(1, Math.round(wav.sampleRate * WINDOW_MS / 1000));
  const limit = Math.pow(10, thresholdDb / 20);
  const windows = [];
  for (let i = 0; i + win <= wav.frames; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += wav.mono[j] * wav.mono[j];
    windows.push(Math.sqrt(sum / win));
  }
  let first = windows.findIndex(r => r > limit);
  let last = -1;
  for (let i = windows.length - 1; i >= 0; i--) if (windows[i] > limit) { last = i; break; }
  if (first < 0) return { speechFound: false };
  const toSec = w => (w * win) / wav.sampleRate;
  const speechStart = toSec(first);
  const speechEnd = toSec(last + 1);
  let sum = 0, n = 0, peak = 0;
  for (let i = first * win; i < Math.min(wav.frames, (last + 1) * win); i++) { sum += wav.mono[i] * wav.mono[i]; n++; peak = Math.max(peak, Math.abs(wav.mono[i])); }
  return {
    speechFound: true, thresholdDb,
    leadingSilenceSec: Number(speechStart.toFixed(4)),
    trailingSilenceSec: Number((wav.durationSec - speechEnd).toFixed(4)),
    effectiveSpeechSec: Number((speechEnd - speechStart).toFixed(4)),
    speechRmsDb: n ? Number((20 * Math.log10(Math.sqrt(sum / n))).toFixed(2)) : null,
    speechPeak: Number(peak.toFixed(4))
  };
}

const wordCount = t => t.trim().split(/\s+/).filter(Boolean).length;
const results = [];
console.error(`[C2-1] engine: ${EXE}`);
for (const s of SAMPLES) {
  const wsl = path.join(wavDir, `${s.id}.wav`);
  const winPath = 'C:' + wsl.replace('/mnt/c', '').replace(/\//g, '\\');
  const started = Date.now();
  const r = spawnSync(EXE, ['tts', s.text, '-o', winPath, '--voice', 'F5', '--lang', 'id'], { encoding: 'utf8', timeout: 300000 });
  if (r.status !== 0 || !fs.existsSync(wsl)) {
    results.push({ ...s, error: `supertonic exit ${r.status}: ${(r.stderr || r.stdout || '').slice(-200)}` });
    console.error(`[C2-1] ${s.id} FAILED`);
    continue;
  }
  const wav = readWav(wsl);
  const primary = analyse(wav, PRIMARY_THRESHOLD_DB);
  const words = wordCount(s.text);
  const row = {
    ...s, words,
    wavFile: path.relative(root, wsl),
    sampleRate: wav.sampleRate, channels: wav.channels,
    fileDurationSec: Number(wav.durationSec.toFixed(4)),
    ...primary,
    wordsPerSecondEffective: primary.speechFound ? Number((words / primary.effectiveSpeechSec).toFixed(3)) : null,
    wordsPerSecondFileDuration: Number((words / wav.durationSec).toFixed(3)),
    sensitivity: {
      '-40dB': analyse(wav, -40),
      '-60dB': analyse(wav, -60)
    },
    synthesisMs: Date.now() - started
  };
  results.push(row);
  console.error(`[C2-1] ${s.id}: ${words} words, ${row.effectiveSpeechSec}s speech, ${row.wordsPerSecondEffective} w/s`);
}

const ok = results.filter(r => !r.error && r.speechFound);
const wps = ok.map(r => r.wordsPerSecondEffective);
const mean = wps.reduce((a, b) => a + b, 0) / wps.length;
const sd = Math.sqrt(wps.reduce((a, b) => a + (b - mean) ** 2, 0) / wps.length);
const byStyle = {};
for (const r of ok) {
  byStyle[r.style] = byStyle[r.style] || [];
  byStyle[r.style].push(r.wordsPerSecondEffective);
}
const summary = {
  task: 'C2-1 真实 F5 印尼语语速实测',
  recordedAt: new Date().toISOString(),
  engine: EXE, voice: 'F5', lang: 'id',
  method: {
    silenceThresholdDb: PRIMARY_THRESHOLD_DB, windowMs: WINDOW_MS,
    effectiveSpeech: '从首个 RMS 超过阈值的窗口起，到最后一个超过阈值的窗口止',
    sensitivityReported: ['-40dB', '-60dB']
  },
  samples: ok.length, failed: results.length - ok.length,
  wordsPerSecondEffective: {
    mean: Number(mean.toFixed(3)), sd: Number(sd.toFixed(3)),
    min: Number(Math.min(...wps).toFixed(3)), max: Number(Math.max(...wps).toFixed(3)),
    slowest: ok.reduce((a, b) => a.wordsPerSecondEffective < b.wordsPerSecondEffective ? a : b).id
  },
  byStyle: Object.fromEntries(Object.entries(byStyle).map(([k, v]) => [k, {
    n: v.length, mean: Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(3)),
    min: Number(Math.min(...v).toFixed(3)), max: Number(Math.max(...v).toFixed(3))
  }])),
  silence: {
    leadingSec: { min: Math.min(...ok.map(r => r.leadingSilenceSec)), max: Math.max(...ok.map(r => r.leadingSilenceSec)), mean: Number((ok.reduce((a, r) => a + r.leadingSilenceSec, 0) / ok.length).toFixed(4)) },
    trailingSec: { min: Math.min(...ok.map(r => r.trailingSilenceSec)), max: Math.max(...ok.map(r => r.trailingSilenceSec)), mean: Number((ok.reduce((a, r) => a + r.trailingSilenceSec, 0) / ok.length).toFixed(4)) }
  },
  currentValidatorUpperBound: '3.6 词/秒 (worker/director.js:78)',
  promptStatedRate: '1.5-2.5 kata/detik (worker/director.js:126)',
  rootCauseHypothesis: null,
  results
};
summary.rootCauseHypothesis = summary.wordsPerSecondEffective.max < 3.6
  ? `成立：全部 ${ok.length} 个样本的实测语速上限 ${summary.wordsPerSecondEffective.max} 词/秒 远低于验证器上界 3.6 词/秒`
  : `不成立：存在样本达到或超过 3.6 词/秒（max=${summary.wordsPerSecondEffective.max}），需停止 CR-002 并重新分析`;
fs.writeFileSync(path.join(outDir, 'measurements.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ ...summary, results: `${results.length} rows -> measurements.json` }, null, 2));
