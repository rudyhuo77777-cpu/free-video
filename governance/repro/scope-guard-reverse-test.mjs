// G-3: reverse tests for the Scope Guard checker. Read-only against the real tree:
// every scenario runs in an isolated temp copy. Nothing in the project is modified.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');

// A copy carrying everything the checker reads: the tree it walks plus the approval record.
function makeCopy() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-rev-'));
  const files = [];
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.next', 'out', '.git', '.claude'].includes(e.name)) continue;
      if (rel === '' && e.name === 'evidence') continue;
      if (rel === 'governance' && e.name.startsWith('evidence-snapshot')) continue;
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
  return tmp;
}

// `pristine: true` runs the project's own (unmodified) checker against the copy. A checker
// that has itself been tampered with controls its own exit code, so self-tampering must be
// judged by a checker the attacker did not touch.
function runChecker(dir, { pristine = false } = {}) {
  const checker = pristine
    ? path.join(root, 'governance/scope-guard-check.mjs')
    : path.join(dir, 'governance/scope-guard-check.mjs');
  const argv = pristine ? [checker, '--root', dir, '--json'] : [checker, '--json'];
  const r = spawnSync(process.execPath, argv, { cwd: dir, encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* keep null */ }
  return { exitCode: r.status, json, stderr: (r.stderr || '').slice(-400) };
}

const results = [];
function scenario(id, note, expect, mutate, opts = {}) {
  const dir = makeCopy();
  try {
    mutate?.(dir);
    const { exitCode, json, stderr } = runChecker(dir, opts);
    const violations = json ? json.violations : null;
    const got = exitCode === 3 ? 'BLOCK' : 'ALLOW';
    const entry = {
      id, note, expect, got, exitCode,
      violationCount: violations ? violations.length : null,
      violations: violations ? violations.map(v => `[${v.rule}] ${v.path}`) : null,
      suppressions: json ? json.suppressions.map(s => `[${s.rule}] ${s.path} <- ${s.approvedBy.record}`) : null,
      checkerUsed: opts.pristine ? 'pristine (project copy, --root <tmp>)' : 'in-place (the copy\'s own checker)',
      verdict: got === expect ? 'PASS' : 'FAIL',
      stderr: stderr || undefined
    };
    results.push(entry);
    console.error(`[reverse] ${id}: expect=${expect} got=${got} -> ${entry.verdict}`);
    return entry;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// 1. Unauthorised change to a governance file (the charter)
scenario('R1-governance-file-tampered', '未授权修改治理文件 governance/SCOPE-GUARD.md', 'BLOCK',
  d => fs.appendFileSync(path.join(d, 'governance/SCOPE-GUARD.md'), '\n<!-- unauthorised edit -->\n'));

// 2. Unauthorised change to the Scope Guard checker itself
scenario('R2-scope-guard-self-tampered', '未授权修改 Scope Guard 自身', 'BLOCK',
  d => {
    const p = path.join(d, 'governance/scope-guard-check.mjs');
    const s = fs.readFileSync(p, 'utf8').replace(
      "const exitCode = violations.length ? 3 :",
      "const exitCode = false ? 3 :");   // an attacker disabling the violation exit code
    fs.writeFileSync(p, s);
  }, { pristine: true });

// 2b. Even rewriting the SELF constant does not hide an edit elsewhere in the file
scenario('R2b-self-tampered-with-recomputed-constant', '改 Scope Guard 并同时改写 SELF 常量（不重算）', 'BLOCK',
  d => {
    const p = path.join(d, 'governance/scope-guard-check.mjs');
    let s = fs.readFileSync(p, 'utf8').replace("const exitCode = violations.length ? 3 :", "const exitCode = false ? 3 :");
    s = s.replace(/^const SELF_SHA256 = '[^']*';$/m, "const SELF_SHA256 = '" + '0'.repeat(64) + "';");
    fs.writeFileSync(p, s);
  }, { pristine: true });

// 2c. Documented limitation: a checker tampered in place still REPORTS the violation, but
// its own exit code cannot be trusted. Recorded as an observation, not as a gate.
scenario('R2c-tampered-checker-selfreport', '被篡改的检查器就地运行（记录其自身仍报告违规，但退出码不可信）', 'ALLOW',
  d => {
    const p = path.join(d, 'governance/scope-guard-check.mjs');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace("const exitCode = violations.length ? 3 :", "const exitCode = false ? 3 :"));
  });

// 3. The A2-approved page.tsx rebaseline must pass
scenario('R3-approved-page-rebaseline', 'A2 已批准的 page.tsx rebaseline', 'ALLOW', null);

// 4. Using the A2 approval to change a DIFFERENT frozen file
scenario('R4-a2-used-on-other-frozen-file', '拿 A2 的批准去改其他冻结文件 globals.css', 'BLOCK',
  d => fs.appendFileSync(path.join(d, 'apps/web/app/globals.css'), ' '));

// 4b. Changing the approved file BEYOND the approved `to` hash
scenario('R4b-approved-file-changed-beyond-to', 'page.tsx 被改成批准记录 to 以外的值', 'BLOCK',
  d => fs.appendFileSync(path.join(d, 'apps/web/app/video/page.tsx'), '\n// drift beyond the approved hash\n'));

// 5. Tampering with the manifestHash constant
scenario('R5-manifest-hash-tampered', '篡改 scripts/web-integrity.mjs 的 manifestHash', 'BLOCK',
  d => {
    const p = path.join(d, 'scripts/web-integrity.mjs');
    const s = fs.readFileSync(p, 'utf8').replace(/const manifestHash = '[a-f0-9]{64}'/, "const manifestHash = '" + 'b'.repeat(64) + "'");
    fs.writeFileSync(p, s);
  });

// 6. Legitimate evidence / log / harness output must NOT produce a false BLOCK
scenario('R6-legit-evidence-and-logs', '合法 evidence / log / harness 产出不得假 BLOCK', 'ALLOW',
  d => {
    fs.mkdirSync(path.join(d, 'evidence/dev/STEP-9/T9-1'), { recursive: true });
    fs.writeFileSync(path.join(d, 'evidence/dev/STEP-9/T9-1/stdout.log'), 'ordinary log output\n');
    fs.writeFileSync(path.join(d, 'evidence/dev/STEP-9/T9-1/command.json'), '{"exitCode":0}\n');
    fs.mkdirSync(path.join(d, 'governance/repro'), { recursive: true });
    fs.writeFileSync(path.join(d, 'governance/repro/new-harness.mjs'), '// a new read-only harness\n');
    fs.mkdirSync(path.join(d, 'governance/evidence-snapshot-later'), { recursive: true });
    fs.writeFileSync(path.join(d, 'governance/evidence-snapshot-later/x.json'), '{}\n');
  });

// 7. A revoked/reverted approval must not suppress anything
scenario('R7-reverted-approval-does-not-suppress', '已 REVERTED 的批准记录不得再抑制告警', 'BLOCK',
  d => {
    const p = path.join(d, 'TRACEABILITY.json');
    const t = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const r of t.rebaseline || []) r.status = 'REVERTED — reverse test';
    fs.writeFileSync(p, JSON.stringify(t, null, 2));
  });

// 8-11. OBS-006 / A9: the chain derivation must not become a loophole. Every hop still has
// to be exactly bound, live and non-REVERTED; a broken, reverted, forked or cyclic chain
// resolves to nothing, i.e. BLOCK.
const MH_LOCATION = 'scripts/web-integrity.mjs:manifestHash';
function editTraceability(d, fn) {
  const p = path.join(d, 'TRACEABILITY.json');
  const t = JSON.parse(fs.readFileSync(p, 'utf8'));
  fn(t);
  fs.writeFileSync(p, JSON.stringify(t, null, 2));
}

// 8. A missing middle hop must not be bridged
scenario('R8-chain-broken-middle', '链条中间一跳被删除（RB-1-001 的 manifestHash 条目）', 'BLOCK',
  d => editTraceability(d, t => {
    for (const r of t.rebaseline || []) {
      if (r.id !== 'RB-1-001') continue;
      r.locationsUpdated = (r.locationsUpdated || []).filter(e => e.location !== MH_LOCATION);
    }
  }));

// 9. A REVERTED hop must break the chain
scenario('R9-chain-hop-reverted', '链条最后一跳被标记 REVERTED（RB-1-002 的 manifestHash 条目）', 'BLOCK',
  d => editTraceability(d, t => {
    for (const r of t.rebaseline || []) {
      if (r.id !== 'RB-1-002') continue;
      for (const e of r.locationsUpdated || []) {
        if (e.location === MH_LOCATION) e.status = 'REVERTED — reverse test';
      }
    }
  }));

// 10. Two live hops sharing one `from` are ambiguous and must never be resolved
scenario('R10-chain-ambiguous-fork', '同一 from 有两条候选条目（分叉），不得唯一推导', 'BLOCK',
  d => editTraceability(d, t => {
    for (const r of t.rebaseline || []) {
      if (r.id !== 'RB-1-001') continue;
      const src = (r.locationsUpdated || []).find(e => e.location === MH_LOCATION);
      if (src) r.locationsUpdated.push({ ...src, to: 'f'.repeat(64), note: 'reverse test fork' });
    }
  }));

// 11. A cyclic chain must be rejected, and must terminate rather than hang
const r11Started = Date.now();
scenario('R11-chain-cycle', '链条构成环（A→B→A），必须拒绝且不得挂起', 'BLOCK',
  d => editTraceability(d, t => {
    const A = '7d22fba2c03c505a5c7e4bda6cc312d152ce9d3dc795da66b9f0815c79c2f753';
    const B = 'a'.repeat(64);
    for (const r of t.rebaseline || []) {
      r.locationsUpdated = (r.locationsUpdated || []).filter(e => e.location !== MH_LOCATION);
      if (r.id === 'RB-1-001') r.locationsUpdated.push({ location: MH_LOCATION, path: 'tests/web-baseline-sha256.json', from: A, to: B, occurrencesReplaced: 1 });
      if (r.id === 'RB-1-002') r.locationsUpdated.push({ location: MH_LOCATION, path: 'tests/web-baseline-sha256.json', from: B, to: A, occurrencesReplaced: 1 });
    }
  }));
const r11Ms = Date.now() - r11Started;
console.error(`[reverse] R11-chain-cycle elapsed ${r11Ms} ms (termination proof)`);

// 12-13. OBS-006 second manifestation (B3 / frozenApproval, 2026-09-20). video-renderer.ts is
// now two approved hops away from the takeover baseline. The B3 chain must be exactly as
// unforgiving as the B4 one.
const RENDERER = 'apps/web/lib/client/video-renderer.ts';

// 12. Removing the middle rebaseline record must break the frozen-file chain
scenario('R12-frozen-chain-broken-middle', '冻结文件链条中间记录被删除（RB-1-002）', 'BLOCK',
  d => editTraceability(d, t => {
    t.rebaseline = (t.rebaseline || []).filter(r => !(r.id === 'RB-1-002' && r.path === RENDERER));
  }));

// 13. A REVERTED middle record must break the frozen-file chain
scenario('R13-frozen-chain-middle-reverted', '冻结文件链条中间记录被标记 REVERTED', 'BLOCK',
  d => editTraceability(d, t => {
    for (const r of t.rebaseline || []) {
      if (r.id === 'RB-1-002' && r.path === RENDERER) r.status = 'REVERTED — reverse test';
    }
  }));

const fails = results.filter(r => r.verdict === 'FAIL');
console.log(JSON.stringify({
  task: 'G-3 Scope Guard 反向测试', recordedAt: new Date().toISOString(),
  safety: '每个场景都在隔离临时副本中执行；项目目录只读，未做任何修改。',
  scenarios: results,
  chainCycleTerminationMs: r11Ms,
  summary: { total: results.length, pass: results.length - fails.length, fail: fails.length, failedIds: fails.map(r => r.id) }
}, null, 2));
process.exit(fails.length ? 1 : 0);
