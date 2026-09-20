// Transpiles the ORIGINAL apps/web/lib/client/video-renderer.ts for the browser.
// Type-erasure only: no behaviour is changed, no code is rewritten.
import fs from 'node:fs';
import path from 'node:path';
import ts from '../../node_modules/typescript/lib/typescript.js';

export function buildRenderer() {
  const root = path.resolve(import.meta.dirname, '../..');
  const src = fs.readFileSync(path.join(root, 'apps/web/lib/client/video-renderer.ts'), 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, isolatedModules: true },
    fileName: 'video-renderer.ts'
  });
  return { code: out.outputText, sourceSha256: null, sourceLength: src.length };
}
