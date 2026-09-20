// Verification-only policy. Does not write, regenerate, or "repair" application files.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';

export const referenceRoot = path.resolve(import.meta.dirname, '..');
export const managedPaths = Object.freeze([
  'apps/web/next-env.d.ts',
  'apps/web/tsconfig.json'
]);
const manifestHash = '07055bc5ee5a199e52c5aa8f1c0f173c97d1756843518c57be422417334a8089';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function text(bytes, label, maxBytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8');
  if (!b.length || b.length > maxBytes) throw new Error(`${label}: empty or oversized file`);
  let s;
  try { s = new TextDecoder('utf-8', {fatal: true}).decode(b); }
  catch { throw new Error(`${label}: expected valid UTF-8`); }
  if (s.includes('\0') || s.includes('\ufffd')) throw new Error(`${label}: invalid text encoding`);
  return s.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

export function validateNextEnv(bytes) {
  const s = text(bytes, 'next-env.d.ts', 16384);
  const seen = new Set();
  let route = null;
  let rootParams = null;
  // TypeScript line terminators are LF, CR, LS (U+2028) and PS (U+2029). text() already
  // folded CR/CRLF into LF; LS/PS must end a line too, or content after a // comment on
  // such a line would be read as part of that comment.
  for (const [index, raw] of s.split(/[\n\u2028\u2029]/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const types = line.match(/^\/\/\/\s*<reference\s+types=["'](next|next\/image-types\/global)["']\s*\/?>$/);
    if (types) {
      if (seen.has(types[1])) throw new Error('next-env.d.ts: duplicate required reference');
      seen.add(types[1]); continue;
    }
    // Unknown triple-slash directives must NOT slip through as ordinary comments.
    if (/^\/\/\//.test(line)) throw new Error(`next-env.d.ts: unexpected directive at line ${index + 1}`);
    if (line.startsWith('//')) {
      if (/@ts-(?:no)?check|@ts-ignore|@ts-expect-error/i.test(line)) {
        throw new Error('next-env.d.ts: TypeScript suppression directives are not allowed');
      }
      continue;
    }
    const imp = line.match(/^import\s+["'](\.\/\.next\/(?:dev\/)?types\/(routes|root-params)\.d\.ts)["'];?$/);
    if (imp) {
      if (imp[2] === 'routes') {
        if (route) throw new Error('next-env.d.ts: duplicate generated route import');
        route = imp[1];
      } else {
        if (rootParams) throw new Error('next-env.d.ts: duplicate generated root-params import');
        rootParams = imp[1];
      }
      continue;
    }
    throw new Error(`next-env.d.ts: unexpected content at line ${index + 1}`);
  }
  if (!seen.has('next') || !seen.has('next/image-types/global')) {
    throw new Error('next-env.d.ts: both required Next.js references must be present');
  }
  return {requiredReferences: 2, generatedRouteImport: route, generatedRootParamsImport: rootParams};
}

export function validateTsconfig(bytes, baseline) {
  let value;
  try { value = JSON.parse(text(bytes, 'tsconfig.json', 65536)); }
  catch (e) { throw new Error(`tsconfig.json: ${e.message}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('tsconfig.json: expected object');
  const jsx = value.compilerOptions?.jsx;
  if (!['preserve', 'react-jsx'].includes(jsx)) throw new Error('tsconfig.json: unexpected jsx mode');
  if (!Array.isArray(value.include) || new Set(value.include).size !== value.include.length) {
    throw new Error('tsconfig.json: include must be an array without duplicate entries');
  }
  const devTypes = '.next/dev/types/**/*.ts';
  const normalized = structuredClone(value);
  normalized.compilerOptions.jsx = baseline.compilerOptions.jsx;
  normalized.include = normalized.include.filter(entry => entry !== devTypes);
  if (!isDeepStrictEqual(normalized, baseline)) {
    throw new Error('tsconfig.json: only Next.js jsx=react-jsx and the optional .next/dev/types/**/*.ts include are allowed to differ');
  }
  return {jsx, includesDevTypes: value.include.includes(devTypes)};
}

function regularFile(root, relative) {
  const filename = path.join(root, relative);
  if (!fs.existsSync(filename) || !fs.lstatSync(filename).isFile()) {
    throw new Error(`${relative}: missing or not a regular file`);
  }
  return fs.readFileSync(filename);
}

export function loadReference(root = referenceRoot) {
  const bytes = regularFile(root, 'tests/web-baseline-sha256.json');
  if (hash(bytes) !== manifestHash) throw new Error('Original Web baseline manifest has changed');
  const manifest = JSON.parse(bytes);
  if (Object.keys(manifest).length !== 23 || managedPaths.some(p => !manifest[p])) {
    throw new Error('Expected the original 23-file Web baseline');
  }
  const configBytes = regularFile(root, 'tests/web-tsconfig-reference.json');
  if (hash(configBytes) !== manifest['apps/web/tsconfig.json']) {
    throw new Error('Original tsconfig reference has changed');
  }
  return {manifest, tsconfig: JSON.parse(configBytes)};
}

function sourceInventory(root) {
  const names = [];
  function walk(dir, rel) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (rel === 'apps/web' && entry.isDirectory() && ['.next', 'out', 'node_modules'].includes(entry.name)) continue;
      if (rel === 'apps/web' && entry.isFile() && entry.name.endsWith('.tsbuildinfo')) continue;
      const name = rel + '/' + entry.name;
      if (entry.isSymbolicLink()) throw new Error(`${name}: unexpected symlink`);
      if (entry.isDirectory()) walk(path.join(dir, entry.name), name);
      else names.push(name);
    }
  }
  walk(path.join(root, 'apps/web'), 'apps/web');
  return names.sort();
}

export function verifyWebIntegrity(projectRoot = referenceRoot, refs = referenceRoot) {
  const {manifest, tsconfig} = loadReference(refs);
  const frozen = Object.entries(manifest).filter(([p]) => !managedPaths.includes(p));
  for (const [p, expected] of frozen) {
    if (hash(regularFile(projectRoot, p)) !== expected) throw new Error(`Web byte integrity failed: ${p}`);
  }
  const env = validateNextEnv(regularFile(projectRoot, managedPaths[0]));
  const config = validateTsconfig(regularFile(projectRoot, managedPaths[1]), tsconfig);
  const extra = sourceInventory(projectRoot).filter(p => !(p in manifest));
  if (extra.length) throw new Error(`Unexpected Web source files: ${extra.join(', ')}`);
  return {frozenFiles: frozen.length, managedFiles: managedPaths.length, env, config};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyWebIntegrity();
    console.log(`WEB INTEGRITY PASS: ${result.frozenFiles}/21 original files byte-identical; ${result.managedFiles}/2 Next-managed files content-validated.`);
    console.log('No files were rewritten. This is not a build, remote AI, or MP4 acceptance test.');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
