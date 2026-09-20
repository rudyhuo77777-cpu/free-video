// C2-1b: closes the extrapolation gap. The product concatenates every scene's voice into ONE
// multi-sentence utterance (apps/web/app/video/page.tsx:360), so the governing figure is the
// multi-sentence rate measured over the WHOLE WAV (leading + speech + trailing silence),
// because that is what the renderer decodes. Samples are sized like real 30/60/90/120s scripts.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
const outDir = path.join(root, 'evidence/dev/CR-002/C2-1b');
const wavDir = path.join(outDir, 'wav');
fs.mkdirSync(wavDir, { recursive: true });
const EXE = process.env.SUPERTONIC_EXE || '/mnt/c/Users/Hongyan/AppData/Local/Programs/Python/Python311/Scripts/supertonic.exe';
const THRESHOLD_DB = -50, WINDOW_MS = 20;

const SENTENCES = [
  'Cek bentuk dan detail produk ini sebelum kamu memilih',
  'Bahan stainless tebal membuat botol ini awet dipakai setiap hari',
  'Tutupnya rapat sehingga air tidak tumpah di dalam tas',
  'Ukurannya pas untuk dibawa ke kantor maupun ke kampus',
  'Bagian dalam mudah dibersihkan tanpa meninggalkan bau',
  'Suhu air tetap terjaga selama beberapa jam pemakaian',
  'Perhatikan juga bagian ulir tutup dan karet penyegelnya',
  'Dua bagian itu paling sering membuat air merembes di dalam tas',
  'Banyak orang memilih botol hanya karena warnanya saja',
  'Padahal ketebalan bahan jauh lebih menentukan ketahanannya',
  'Coba perhatikan apakah botol tetap kokoh setelah sering terbentur',
  'Cek juga apakah mulut botol cukup lebar untuk dibersihkan',
  'Pemakaian harian membuat sisa minuman menempel di dinding dalam',
  'Botol yang mudah dibuka penuh akan lebih higienis dalam jangka panjang',
  'Cek detail produknya sekarang sebelum kamu memutuskan'
];
// Word counts sized like the real narration budget for each duration.
const TARGETS = [
  { id: 'lf-30s', nominalDuration: 30, words: 60 },
  { id: 'lf-60s', nominalDuration: 60, words: 120 },
  { id: 'lf-60s-b', nominalDuration: 60, words: 133 },   // matches the audit's own sample size
  { id: 'lf-90s', nominalDuration: 90, words: 185 },
  { id: 'lf-120s', nominalDuration: 120, words: 245 }
];

function buildText(targetWords) {
  const parts = [];
  let words = 0, i = 0;
  while (words < targetWords) {
    const s = SENTENCES[i % SENTENCES.length]; i++;
    const w = s.split(/\s+/).length;
    if (words + w > targetWords) {
      const need = targetWords - words;
      parts.push(s.split(/\s+/).slice(0, need).join(' '));
      words += need;
    } else { parts.push(s); words += w; }
  }
  return parts.join('. ') + '.';
}

function readWav(file) {
  const b = fs.readFileSync(file);
  let pos = 12, fmt = null, dataOffset = null, dataLength = 0;
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4), size = b.readUInt32LE(pos + 4);
    if (id === 'fmt ') fmt = { channels: b.readUInt16LE(pos + 10), sampleRate: b.readUInt32LE(pos + 12), bitsPerSample: b.readUInt16LE(pos + 22) };
    if (id === 'data') { dataOffset = pos + 8; dataLength = size; }
    pos += 8 + size + (size % 2);
  }
  const frames = Math.floor(Math.min(dataLength, b.length - dataOffset) / 2 / fmt.channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) sum += b.readInt16LE(dataOffset + (i * fmt.channels + c) * 2) / 32768;
    mono[i] = sum / fmt.channels;
  }
  return { ...fmt, frames, mono, durationSec: frames / fmt.sampleRate };
}
function analyse(wav) {
  const win = Math.round(wav.sampleRate * WINDOW_MS / 1000), limit = Math.pow(10, THRESHOLD_DB / 20);
  const w = [];
  for (let i = 0; i + win <= wav.frames; i += win) {
    let s = 0; for (let j = i; j < i + win; j++) s += wav.mono[j] ** 2;
    w.push(Math.sqrt(s / win));
  }
  const first = w.findIndex(r => r > limit);
  let last = -1; for (let i = w.length - 1; i >= 0; i--) if (w[i] > limit) { last = i; break; }
  const toSec = n => (n * win) / wav.sampleRate;
  return { leading: toSec(first), trailing: wav.durationSec - toSec(last + 1), effective: toSec(last + 1) - toSec(first) };
}

const rows = [];
for (const t of TARGETS) {
  const text = buildText(t.words);
  const actualWords = text.trim().split(/\s+/).length;
  const wsl = path.join(wavDir, `${t.id}.wav`);
  const winPath = 'C:' + wsl.replace('/mnt/c', '').replace(/\//g, '\\');
  const started = Date.now();
  const r = spawnSync(EXE, ['tts', text, '-o', winPath, '--voice', 'F5', '--lang', 'id'], { encoding: 'utf8', timeout: 900000 });
  if (r.status !== 0 || !fs.existsSync(wsl)) { rows.push({ ...t, error: `exit ${r.status}: ${(r.stderr || r.stdout || '').slice(-200)}` }); console.error(`[C2-1b] ${t.id} FAILED`); continue; }
  const wav = readWav(wsl);
  const a = analyse(wav);
  const row = {
    ...t, actualWords, text: text.slice(0, 120) + '…',
    wavFile: path.relative(root, wsl),
    fileDurationSec: Number(wav.durationSec.toFixed(4)),
    leadingSilenceSec: Number(a.leading.toFixed(4)),
    trailingSilenceSec: Number(a.trailing.toFixed(4)),
    effectiveSpeechSec: Number(a.effective.toFixed(4)),
    wordsPerSecondEffective: Number((actualWords / a.effective).toFixed(3)),
    wordsPerSecondFileDuration: Number((actualWords / wav.durationSec).toFixed(3)),
    fitsNominalDuration: wav.durationSec <= t.nominalDuration,
    overflowSec: Number((wav.durationSec - t.nominalDuration).toFixed(3)),
    synthesisMs: Date.now() - started
  };
  rows.push(row);
  console.error(`[C2-1b] ${t.id}: ${actualWords}w -> file ${row.fileDurationSec}s (nominal ${t.nominalDuration}s), ${row.wordsPerSecondFileDuration} w/s on file duration`);
}

const ok = rows.filter(r => !r.error);
const fileRates = ok.map(r => r.wordsPerSecondFileDuration);
const effRates = ok.map(r => r.wordsPerSecondEffective);
const out = {
  task: 'C2-1b 长文本多句连读实测（闭合外推缺口）',
  recordedAt: new Date().toISOString(), engine: EXE, voice: 'F5', lang: 'id',
  why: '产品把全部场景旁白拼成一段多句连读再合成（apps/web/app/video/page.tsx:360），且渲染器解码整个 WAV（含头尾静音），因此支配性指标是「多句连读 + 文件时长」的词每秒。',
  method: { silenceThresholdDb: THRESHOLD_DB, windowMs: WINDOW_MS },
  wordsPerSecondOnFileDuration: { mean: Number((fileRates.reduce((a, b) => a + b, 0) / fileRates.length).toFixed(3)), min: Number(Math.min(...fileRates).toFixed(3)), max: Number(Math.max(...fileRates).toFixed(3)) },
  wordsPerSecondOnEffectiveSpeech: { mean: Number((effRates.reduce((a, b) => a + b, 0) / effRates.length).toFixed(3)), min: Number(Math.min(...effRates).toFixed(3)), max: Number(Math.max(...effRates).toFixed(3)) },
  auditReference: { words: 133, fileDurationSec: 65.683673, wordsPerSecond: 2.025, note: 'Codex 审计的真实 F5 样本，用作交叉校验' },
  samples: rows
};
fs.writeFileSync(path.join(outDir, 'measurements.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ ...out, samples: `${rows.length} rows -> measurements.json` }, null, 2));
