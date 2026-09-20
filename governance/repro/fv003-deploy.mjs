// FV-003 reproduction.
// SAFETY: the isolated copy's node_modules contains ONLY a Wrangler RECORDER STUB.
// The real wrangler binary does not exist inside the test copy, so no Cloudflare API
// call is physically possible. A self-test proves the stub is the binary being executed
// before any scenario runs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fv003-'));
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
  // node_modules contains ONLY the recorder stub. No real wrangler inside the copy.
  const binDir = path.join(tmp, 'node_modules/wrangler/bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'wrangler.js'), STUB);
  fs.writeFileSync(path.join(tmp, 'node_modules/wrangler/package.json'), JSON.stringify({ name: 'wrangler', version: '4.131.1-RECORDER-STUB', type: 'module' }, null, 2));
  return tmp;
}

function invoke(dir, extraArgs = [], { failMigration = false } = {}) {
  const logFile = path.join(dir, 'stub.log');
  if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '');
  const r = spawnSync(process.execPath, ['scripts/deploy-production.mjs', ...extraArgs], {
    cwd: dir, encoding: 'utf8',
    env: {
      ...process.env, ...FAKE, CI: 'true',
      FV_STUB_LOG: logFile, FV_FAIL_MIGRATION: failMigration ? '1' : '0',
      WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_API_KEY: '', CLOUDFLARE_EMAIL: ''
    }
  });
  const recorded = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  return { result: r, recorded };
}

// ---- SELF-TEST: prove the stub, not the real wrangler, is what runs ----
const selfTestDir = makeCopy();
fs.mkdirSync(path.join(selfTestDir, 'apps/web/out'), { recursive: true });
fs.writeFileSync(path.join(selfTestDir, 'apps/web/out/index.html'), '<!doctype html><title>selftest</title>');
const selfTest = invoke(selfTestDir);
const stubProof = {
  wranglerPackageInCopy: JSON.parse(fs.readFileSync(path.join(selfTestDir, 'node_modules/wrangler/package.json'), 'utf8')).version,
  stubRecordedCalls: selfTest.recorded.map(x => x.wranglerArgs.join(' ')),
  allCallsCameFromStub: selfTest.recorded.length > 0 && selfTest.recorded.every(x => x.stub === true),
  stdoutShowsStubMarker: (selfTest.result.stdout || '').includes('[wrangler-stub]'),
  stdoutHasNoRealWranglerBanner: !(selfTest.result.stdout || '').includes('⛅️ wrangler'),
  noCloudflareApiMention: !((selfTest.result.stdout || '') + (selfTest.result.stderr || '')).includes('api.cloudflare.com')
};
fs.rmSync(selfTestDir, { recursive: true, force: true });
if (!stubProof.allCallsCameFromStub || !stubProof.stdoutShowsStubMarker || !stubProof.stdoutHasNoRealWranglerBanner) {
  console.log(JSON.stringify({ finding: 'FV-003', aborted: true, reason: 'stub_self_test_failed', stubProof }, null, 2));
  process.exit(2);
}

function runScenario(id, description, mutate, opts = {}) {
  const dir = makeCopy();
  try { mutate(dir); } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); return { id, description, setupError: e.message }; }
  const { result: r, recorded } = invoke(dir, [], opts);
  const resolvedWritten = fs.existsSync(path.join(dir, 'wrangler.resolved.jsonc'));
  fs.rmSync(dir, { recursive: true, force: true });
  const calls = recorded.map(x => x.wranglerArgs.join(' '));
  return {
    id, description, exitCode: r.status,
    stdoutTail: (r.stdout || '').trim().split('\n').slice(-3),
    stderrTail: (r.stderr || '').trim().split('\n').slice(-2),
    wranglerCalls: calls,
    reachedMigration: calls.some(c => c.includes('migrations apply')),
    reachedDeploy: calls.some(c => c.startsWith('deploy')),
    resolvedConfigWritten: resolvedWritten,
    allCallsFromStub: recorded.every(x => x.stub === true)
  };
}

const withOut = content => dir => {
  fs.mkdirSync(path.join(dir, 'apps/web/out'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'apps/web/out/index.html'), content);
};

const scenarios = [
  runScenario('A-config-modified', 'next.config.ts 被修改（完整 verifyWebIntegrity 会失败），18 项旧 UI 哈希仍正确',
    dir => { fs.appendFileSync(path.join(dir, 'apps/web/next.config.ts'), '\n// audit marker: unauthorized config change\n'); withOut('<!doctype html><title>stale</title>')(dir); }),
  runScenario('B-stale-artifact', 'out/index.html 为任意陈旧 HTML，与当前源码无绑定',
    withOut('<!doctype html><title>ARBITRARY UNVERIFIED ARTIFACT</title>')),
  runScenario('C-no-verify-record', '不存在 evidence/build-verification.json 成功记录',
    dir => { fs.rmSync(path.join(dir, 'evidence/build-verification.json'), { force: true }); withOut('<!doctype html><title>x</title>')(dir); }),
  runScenario('D-lock-changed', 'package-lock.json 在验证之后被改动',
    dir => { fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"name":"tampered","lockfileVersion":3,"packages":{}}'); withOut('<!doctype html><title>x</title>')(dir); }),
  runScenario('E-all-satisfied', '全部前提满足（对照：应到达 wrangler，顺序为先迁移后发布）',
    withOut('<!doctype html><title>ok</title>')),
  runScenario('F-migration-fails', '迁移子进程返回非零，deploy 不得执行',
    withOut('<!doctype html><title>x</title>'), { failMigration: true })
];

// PLAN-only must not call wrangler at all
{
  const dir = makeCopy();
  const { result: r, recorded } = invoke(dir, ['--plan']);
  fs.rmSync(dir, { recursive: true, force: true });
  scenarios.push({
    id: 'PLAN-only', description: 'deploy:plan 只输出计划，不调用 wrangler',
    exitCode: r.status, wranglerCalls: recorded.map(x => x.wranglerArgs.join(' ')),
    reachedMigration: false, reachedDeploy: false,
    planOutputKeys: (() => { try { return Object.keys(JSON.parse(r.stdout)); } catch { return null; } })()
  });
}

const bypassIds = ['A-config-modified', 'B-stale-artifact', 'C-no-verify-record', 'D-lock-changed'];
console.log(JSON.stringify({
  finding: 'FV-003', recordedAt: new Date().toISOString(),
  safety: 'node_modules inside every isolated copy contained ONLY a recorder stub (version 4.131.1-RECORDER-STUB). The real wrangler binary was absent from the test copy. No Cloudflare API request was possible.',
  stubSelfTest: stubProof,
  scenarios,
  summary: {
    bypassReproduced: scenarios.filter(s => bypassIds.includes(s.id) && s.reachedMigration).map(s => s.id),
    bypassNotReproduced: scenarios.filter(s => bypassIds.includes(s.id) && !s.reachedMigration).map(s => s.id),
    controlReachedWrangler: scenarios.filter(s => s.id === 'E-all-satisfied' && s.reachedMigration).map(s => s.id),
    correctlyStoppedAfterMigrationFailure: scenarios.filter(s => s.id === 'F-migration-fails' && s.reachedMigration && !s.reachedDeploy).map(s => s.id)
  }
}, null, 2));
