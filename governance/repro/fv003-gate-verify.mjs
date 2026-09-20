// STEP 2 verification of the FV-003 release gate.
// SAFETY: every isolated copy's node_modules contains ONLY a Wrangler RECORDER STUB.
// The real wrangler binary is absent from the copy, so no Cloudflare API call is possible.
// A self-test proves the stub is what runs before any scenario executes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { currentFingerprints } from '../../scripts/verify.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const FAKE = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), FREE_VIDEO_D1_ID: 'abcdef12-1234-4234-8234-123456789abc' };

const STUB = `#!/usr/bin/env node
// Wrangler RECORDER STUB. Records argv and exits. Makes no network request of any kind.
import fs from 'node:fs';
const log = process.env.FV_STUB_LOG;
const args = process.argv.slice(2);
fs.appendFileSync(log, JSON.stringify({ stub: true, wranglerArgs: args, at: new Date().toISOString() }) + '\\n');
const isMigration = args.includes('migrations');
process.stdout.write('[wrangler-stub] ' + args.join(' ') + '\\n');
process.exit(process.env.FV_FAIL_MIGRATION === '1' && isMigration ? 1 : 0);
`;

function makeCopy() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fv003gate-'));
  const files = [];
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.next', '.git', 'governance', '.claude'].includes(e.name)) continue;
      if (rel === '' && e.name === 'evidence') continue;
      const name = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), name);
      else if (e.isFile()) files.push(name);
    }
  })(root, '');
  for (const f of files) {
    const dst = path.join(tmp, f);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(root, f), dst);
  }
  fs.mkdirSync(path.join(tmp, 'evidence'), { recursive: true });
  const binDir = path.join(tmp, 'node_modules/wrangler/bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'wrangler.js'), STUB);
  fs.writeFileSync(path.join(tmp, 'node_modules/wrangler/package.json'), JSON.stringify({ name: 'wrangler', version: '4.131.1-RECORDER-STUB', type: 'module' }, null, 2));
  return tmp;
}

// Writes the record a genuinely successful `npm run verify` would have produced for THIS tree.
function writePassRecord(dir) {
  const rec = {
    release: '0.3.3.2', startedAt: new Date().toISOString(),
    phases: ['offline-before', 'build', 'typecheck', 'offline-after'], status: 'PASS',
    remoteAIExecuted: false, productionDeploymentExecuted: false,
    note: 'Synthesised by the STEP 2 gate verification to represent a successful verify of this exact tree.',
    finishedAt: new Date().toISOString(),
    ...currentFingerprints(dir)
  };
  fs.writeFileSync(path.join(dir, 'evidence/build-verification.json'), JSON.stringify(rec, null, 2) + '\n');
  return rec;
}

function invoke(dir, extraArgs = [], { failMigration = false } = {}) {
  // The log lives OUTSIDE the copy: anything written inside it would change the source
  // fingerprint the gate is checking.
  const logFile = path.join(os.tmpdir(), `fv-stub-${path.basename(dir)}.log`);
  fs.writeFileSync(logFile, '');
  const r = spawnSync(process.execPath, ['scripts/deploy-production.mjs', ...extraArgs], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, ...FAKE, CI: 'true', FV_STUB_LOG: logFile, FV_FAIL_MIGRATION: failMigration ? '1' : '0',
           WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_API_KEY: '', CLOUDFLARE_EMAIL: '' }
  });
  const recorded = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  try { fs.rmSync(logFile, { force: true }); } catch {}
  return { result: r, recorded };
}

const withOut = content => dir => {
  fs.mkdirSync(path.join(dir, 'apps/web/out'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'apps/web/out/index.html'), content);
};

// ---- SELF-TEST: prove the stub is the binary that runs ----
const stDir = makeCopy();
withOut('<!doctype html><title>selftest</title>')(stDir);
writePassRecord(stDir);
const st = invoke(stDir);
const stubProof = {
  wranglerPackageInCopy: JSON.parse(fs.readFileSync(path.join(stDir, 'node_modules/wrangler/package.json'), 'utf8')).version,
  stubRecordedCalls: st.recorded.map(x => x.wranglerArgs.join(' ')),
  allCallsCameFromStub: st.recorded.length > 0 && st.recorded.every(x => x.stub === true),
  stdoutShowsStubMarker: (st.result.stdout || '').includes('[wrangler-stub]'),
  stdoutHasNoRealWranglerBanner: !(st.result.stdout || '').includes('⛅️ wrangler'),
  noCloudflareApiMention: !((st.result.stdout || '') + (st.result.stderr || '')).includes('api.cloudflare.com')
};
fs.rmSync(stDir, { recursive: true, force: true });
if (!stubProof.allCallsCameFromStub || !stubProof.stdoutShowsStubMarker || !stubProof.stdoutHasNoRealWranglerBanner) {
  console.log(JSON.stringify({ aborted: true, reason: 'stub_self_test_failed', stubProof }, null, 2));
  process.exit(2);
}

function scenario(id, description, { prepare, mutate, record = true, failMigration = false, expectReachWrangler }) {
  const dir = makeCopy();
  try {
    prepare?.(dir);
    if (record) writePassRecord(dir);
    mutate?.(dir);
    const { result: r, recorded } = invoke(dir, [], { failMigration });
    const calls = recorded.map(x => x.wranglerArgs.join(' '));
    const reachedMigration = calls.some(c => c.includes('migrations apply'));
    const reachedDeploy = calls.some(c => c.startsWith('deploy'));
    return {
      id, description, exitCode: r.status,
      gateSteps: (r.stdout || '').split('\n').filter(l => l.includes('[release gate]')).map(l => l.replace(/.*\[release gate\] /, '')),
      blockedBy: (r.stderr || '').trim().split('\n').filter(Boolean).slice(-1)[0] || null,
      wranglerCalls: calls, reachedMigration, reachedDeploy,
      expectReachWrangler,
      verdict: reachedMigration === expectReachWrangler ? 'PASS' : 'FAIL',
      allCallsFromStub: recorded.every(x => x.stub === true)
    };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const scenarios = [
  scenario('A-config-modified', 'next.config.ts 在验证之后被修改', {
    prepare: withOut('<!doctype html><title>ok</title>'),
    mutate: d => fs.appendFileSync(path.join(d, 'apps/web/next.config.ts'), '\n// unauthorized config change\n'),
    expectReachWrangler: false }),
  scenario('B-stale-artifact', 'out/ 在验证之后被替换为任意陈旧 HTML', {
    prepare: withOut('<!doctype html><title>ok</title>'),
    mutate: withOut('<!doctype html><title>ARBITRARY UNVERIFIED ARTIFACT</title>'),
    expectReachWrangler: false }),
  scenario('C-no-verify-record', '不存在成功的 verify 记录', {
    prepare: withOut('<!doctype html><title>ok</title>'), record: false,
    expectReachWrangler: false }),
  scenario('C2-verify-record-FAIL', 'verify 记录存在但 status 为 FAIL', {
    prepare: withOut('<!doctype html><title>ok</title>'),
    mutate: d => { const p = path.join(d, 'evidence/build-verification.json'); const j = JSON.parse(fs.readFileSync(p, 'utf8')); j.status = 'FAIL'; fs.writeFileSync(p, JSON.stringify(j, null, 2)); },
    expectReachWrangler: false }),
  scenario('D-lock-changed', 'package-lock.json 在验证之后被改动', {
    prepare: withOut('<!doctype html><title>ok</title>'),
    mutate: d => fs.writeFileSync(path.join(d, 'package-lock.json'), '{"name":"tampered","lockfileVersion":3,"packages":{}}'),
    expectReachWrangler: false }),
  scenario('D2-frozen-ui-changed', '冻结 UI 文件在验证之后被改动', {
    prepare: withOut('<!doctype html><title>ok</title>'),
    mutate: d => fs.appendFileSync(path.join(d, 'apps/web/app/globals.css'), ' '),
    expectReachWrangler: false }),
  scenario('D3-nextenv-tampered', 'next-env.d.ts 被植入非法导入', {
    prepare: withOut('<!doctype html><title>ok</title>'),
    mutate: d => fs.appendFileSync(path.join(d, 'apps/web/next-env.d.ts'), 'import "untrusted-package";\n'),
    expectReachWrangler: false }),
  scenario('E-all-satisfied', '全部前提满足（对照：应到达 wrangler，先迁移后发布）', {
    prepare: withOut('<!doctype html><title>ok</title>'),
    expectReachWrangler: true }),
  scenario('F-migration-fails', '迁移子进程返回非零，deploy 不得执行', {
    prepare: withOut('<!doctype html><title>ok</title>'), failMigration: true,
    expectReachWrangler: true })
];

// PLAN-only must never call wrangler
{
  const dir = makeCopy();
  withOut('<!doctype html><title>ok</title>')(dir);
  const { result: r, recorded } = invoke(dir, ['--plan']);
  fs.rmSync(dir, { recursive: true, force: true });
  scenarios.push({ id: 'PLAN-only', description: 'deploy:plan 只输出计划', exitCode: r.status,
    wranglerCalls: recorded.map(x => x.wranglerArgs.join(' ')), reachedMigration: false, reachedDeploy: false,
    expectReachWrangler: false, verdict: recorded.length === 0 && r.status === 0 ? 'PASS' : 'FAIL',
    planOutputKeys: (() => { try { return Object.keys(JSON.parse(r.stdout)); } catch { return null; } })() });
}

const fOk = scenarios.find(s => s.id === 'F-migration-fails');
if (fOk) fOk.verdict = (fOk.reachedMigration && !fOk.reachedDeploy && fOk.exitCode !== 0) ? 'PASS' : 'FAIL';

const fails = scenarios.filter(s => s.verdict === 'FAIL');
console.log(JSON.stringify({
  task: 'T2-4 release gate verification', finding: 'FV-003', recordedAt: new Date().toISOString(),
  safety: 'node_modules inside every isolated copy contained ONLY a recorder stub (4.131.1-RECORDER-STUB). The real wrangler binary was absent. No Cloudflare API request was possible.',
  stubSelfTest: stubProof, scenarios,
  summary: { total: scenarios.length, pass: scenarios.length - fails.length, fail: fails.length, failedIds: fails.map(s => s.id) }
}, null, 2));
process.exit(fails.length ? 1 : 0);
