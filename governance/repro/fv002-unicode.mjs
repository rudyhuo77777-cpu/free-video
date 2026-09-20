// FV-002 reproduction: U+2028 / U+2029 line separators let non-whitelisted TypeScript
// content pass validateNextEnv as if it were part of a // comment.
// Read-only against the product: mutations exist only in memory / a temp dir.
import fs from 'node:fs';
import path from 'node:path';
import ts from '../../node_modules/typescript/lib/typescript.js';
import { validateNextEnv, verifyWebIntegrity } from '../../scripts/web-integrity.mjs';

const seed = '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n';
const NOTE = '// NOTE: This file should not be edited\n';

const samples = [
  { id: 'env-unicode-line-separator', shouldReject: true,
    content: seed + NOTE.replace(/\n$/, '') + ' import "untrusted-package";\n' },
  { id: 'env-unicode-paragraph-separator', shouldReject: true,
    content: seed + NOTE.replace(/\n$/, '') + ' declare const injected: any;\n' },
  { id: 'env-unicode-line-separator-directive', shouldReject: true,
    content: seed + NOTE.replace(/\n$/, '') + ' /// <reference types="anything" />\n' },
  { id: 'real-next-generated', shouldReject: false,
    content: fs.readFileSync(path.resolve(import.meta.dirname, '../../apps/web/next-env.d.ts'), 'utf8') },
  // control samples that must keep working
  { id: 'control-path-traversal', shouldReject: true, content: seed + 'import "../../other.d.ts";\n' },
  { id: 'control-arbitrary-package', shouldReject: true, content: seed + 'import "untrusted-package";\n' },
  { id: 'control-ts-nocheck', shouldReject: true, content: seed + '// @ts-nocheck\n' },
  { id: 'control-seed-only', shouldReject: false, content: seed }
];

const results = samples.map(s => {
  let accepted = false, error = null;
  try { validateNextEnv(s.content); accepted = true; }
  catch (e) { error = e.message; }
  // Independent check: what does the real TypeScript parser think the injected text is?
  const sf = ts.createSourceFile('next-env.d.ts', s.content, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const kinds = sf.statements.map(st => ts.SyntaxKind[st.kind]);
  const diagnostics = sf.parseDiagnostics?.length ?? 0;
  const reproduced = s.shouldReject ? accepted : !accepted;
  return { id: s.id, shouldReject: s.shouldReject, accepted, error, tsStatementKinds: kinds, tsParseDiagnostics: diagnostics, bypassReproduced: reproduced };
});

// Also prove the 21 frozen files are still individually protected (control for the fix later).
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'fv002-'));
const root = path.resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tests/web-baseline-sha256.json'), 'utf8'));
const managed = ['apps/web/next-env.d.ts', 'apps/web/tsconfig.json'];
for (const p of Object.keys(manifest)) {
  const dst = path.join(tmp, p);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(root, p), dst);
}
// restore the pristine managed files so only the mutation under test differs
fs.writeFileSync(path.join(tmp, 'apps/web/next-env.d.ts'), seed);
const frozenResults = [];
for (const p of Object.keys(manifest).filter(x => !managed.includes(x))) {
  const file = path.join(tmp, p);
  const original = fs.readFileSync(file);
  const mutated = Buffer.from(original);
  mutated[mutated.length - 1] = mutated[mutated.length - 1] ^ 0x01; // single-byte flip
  fs.writeFileSync(file, mutated);
  let rejected = false, message = null;
  try { verifyWebIntegrity(tmp, root); } catch (e) { rejected = true; message = e.message; }
  fs.writeFileSync(file, original);
  frozenResults.push({ path: p, rejected, message });
}
fs.rmSync(tmp, { recursive: true, force: true });

const out = {
  finding: 'FV-002',
  recordedAt: new Date().toISOString(),
  samples: results,
  frozenMutations: { total: frozenResults.length, rejected: frozenResults.filter(f => f.rejected).length, results: frozenResults },
  summary: {
    bypassesReproduced: results.filter(s => s.shouldReject && s.accepted).map(s => s.id),
    falsePositives: results.filter(s => !s.shouldReject && !s.accepted).map(s => s.id)
  }
};
console.log(JSON.stringify(out, null, 2));
