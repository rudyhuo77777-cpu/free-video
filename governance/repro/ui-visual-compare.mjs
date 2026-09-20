// Compares the before/after visual captures. Read-only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
const B = path.join(root, 'evidence/dev/STEP-3/visual/before');
const A = path.join(root, 'evidence/dev/STEP-3/visual/after');
const sha = f => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch { return null; } };
const txt = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };

function pngDiff(a, b) {
  try {
    const out = execFileSync('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-filter_complex',
      '[0:v][1:v]blend=all_mode=difference,blackframe=amount=0:threshold=1', '-f', 'null', '-'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out;
  } catch (e) { return String(e.stderr || e.message); }
}
function pixelIdentical(a, b) {
  try {
    const stderr = execFileSync('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-filter_complex',
      '[0:v][1:v]psnr', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return stderr;
  } catch (e) {
    const s = String(e.stderr || '');
    const m = s.match(/average:(\S+)/);
    return m ? `psnr average:${m[1]}` : s.slice(-300);
  }
}

const pairs = [
  { id: 'A-initial', note: '首次加载 —— 必须逐像素相同' },
  { id: 'B-ready', note: '成功生成后的就绪态 —— 必须逐像素相同' }
];

const report = { comparedAt: new Date().toISOString(), mustBeIdentical: [], behaviourChanged: [], cssPrimitives: {} };

for (const p of pairs) {
  const bPng = path.join(B, `${p.id}.png`), aPng = path.join(A, `${p.id}.png`);
  const entry = {
    id: p.id, note: p.note,
    pngSha256Before: sha(bPng), pngSha256After: sha(aPng),
    pngIdentical: sha(bPng) === sha(aPng),
    domIdentical: txt(path.join(B, `${p.id}.html`)) === txt(path.join(A, `${p.id}.html`)),
    stylesIdentical: txt(path.join(B, `${p.id}.styles.txt`)) === txt(path.join(A, `${p.id}.styles.txt`)),
    rectsIdentical: txt(path.join(B, `${p.id}.rects.txt`)) === txt(path.join(A, `${p.id}.rects.txt`)),
    textIdentical: txt(path.join(B, `${p.id}.text.txt`)) === txt(path.join(A, `${p.id}.text.txt`))
  };
  if (!entry.pngIdentical) entry.psnr = pixelIdentical(bPng, aPng);
  report.mustBeIdentical.push(entry);
}

// The lost-ack state is the one whose BEHAVIOUR was fixed: it used to show an error and now
// shows the recovered result. The visual requirement is that it reuses the SAME ready layout,
// i.e. it introduces no new element types, classes or computed styles.
{
  const before = txt(path.join(B, 'C-lost-ack-error.styles.txt')) || '';
  const after = txt(path.join(A, 'C-lost-ack-error.styles.txt')) || '';
  const readyBefore = txt(path.join(B, 'B-ready.styles.txt')) || '';
  report.behaviourChanged.push({
    id: 'C-lost-ack-error',
    note: '行为被修复：原为错误态，现为恢复出的就绪态',
    nodeCountBefore: before.split('\n').filter(Boolean).length,
    nodeCountAfter: after.split('\n').filter(Boolean).length,
    afterMatchesPreExistingReadyLayout: after.split('\n').map(l => l.split('|').slice(1).join('|')).join('\n')
      === readyBefore.split('\n').map(l => l.split('|').slice(1).join('|')).join('\n')
  });
}

// No new CSS class or computed-style primitive anywhere.
const classesOf = dir => {
  const set = new Set();
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.styles.txt'))) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      const parts = line.split('|');
      if (parts.length > 2) for (const c of String(parts[2]).split(/\s+/).filter(Boolean)) set.add(c);
    }
  }
  return set;
};
const stylesOf = dir => {
  const set = new Set();
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.styles.txt'))) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      const parts = line.split('|');
      if (parts.length > 3) set.add(parts.slice(3).join('|'));
    }
  }
  return set;
};
const cb = classesOf(B), ca = classesOf(A), sb = stylesOf(B), sa = stylesOf(A);
report.cssPrimitives = {
  classesBefore: cb.size, classesAfter: ca.size,
  newClasses: [...ca].filter(c => !cb.has(c)),
  removedClasses: [...cb].filter(c => !ca.has(c)),
  computedStyleVariantsBefore: sb.size, computedStyleVariantsAfter: sa.size,
  newComputedStyleVariants: [...sa].filter(x => !sb.has(x)).length
};
report.globalsCssSha256 = sha(path.join(root, 'apps/web/app/globals.css'));
console.log(JSON.stringify(report, null, 2));
