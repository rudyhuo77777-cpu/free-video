// Scope Guard mechanical checker — READ ONLY.
// It never writes, never repairs, never recomputes a baseline, never auto-approves.
// Exit codes: 0 = no change; 2 = changes need human adjudication; 3 = a change requires an
// approval that does not exist or does not match; 1 = checker could not run.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
// --root lets a KNOWN-GOOD copy of this checker inspect another tree. A checker that has
// itself been tampered with cannot be trusted to report its own exit code, so the trust
// base must be verified by a checker the attacker did not modify.
const selfDir = path.dirname(fileURLToPath(import.meta.url));
const rootArg = args.includes('--root') ? args[args.indexOf('--root') + 1] : null;
const root = path.resolve(rootArg || path.resolve(selfDir, '..'));
const asJson = args.includes('--json');
const baselineArg = args.includes('--baseline') ? args[args.indexOf('--baseline') + 1] : 'governance/baseline-v0.3.3.2.sha256';
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Governance files created after the takeover snapshot. Their presence is expected and
// is NOT a product-code change, but they are still reported under ADDED for transparency.
const GOVERNANCE_ADDITIONS = new Set([
  'CLAUDE.md', 'PRD.md', 'GOVERNANCE.md', 'STEPS-AND-ACCEPTANCE.md',
  'CURRENT-STATE.md', 'DEVELOPMENT-PLAN.md', 'TRACEABILITY.json', 'CHANGELOG.md'
]);

// governance/ is NO LONGER skipped: this tool must be able to report changes to the
// governance files, including itself. Working artifacts under governance/repro/ and
// governance/evidence-snapshot-*/ are listed but are never a violation on their own.
const SKIP_DIRS = new Set(['node_modules', '.next', 'out', '.git', '.claude']);

// ---------------------------------------------------------------------------
// Trust base. A change to any of these must be bound to an approval record in
// TRACEABILITY.json (governanceApprovals[] with matching path/from/to/approvedAt).
// ---------------------------------------------------------------------------
const SELF_PATH = 'governance/scope-guard-check.mjs';
const SELF_SHA256 = 'a7bf389c8c57608523e6dfdd30b312b9ef8cca3545bcab9eaa33dee53da57729';
const CONTROL_FILES = {
  'governance/SCOPE-GUARD.md': '2f24af74ecf7de2fa01e02e583487fb2e209f8bdeccfc2648800a2dc5a121a4f',
  'governance/baseline-v0.3.3.2.sha256': '99b2b0776af45a5cedbde72772f137bce189f7002ea114920e323a976af93872'
};
// Solves the self-reference problem: the constant line itself is normalised away before
// hashing, so every OTHER byte of this file is covered.
function normalizedSelf(src) {
  return src.replace(/^const SELF_SHA256 = '[^']*';$/m, "const SELF_SHA256 = '<SELF>';");
}

// Files that hold baseline hashes. Editing them is a re-baseline action and needs a
// matching, non-reverted locationsUpdated entry in an approved rebaseline record.
const BASELINE_HOLDERS = new Set([
  'tests/web-baseline-sha256.json',
  'tests/core-baseline-sha256.json',
  'scripts/ui-integrity.mjs'
]);
const MANIFEST_HASH_LOCATION = 'scripts/web-integrity.mjs:manifestHash';
const MANIFEST_HASH_BASELINE = '7d22fba2c03c505a5c7e4bda6cc312d152ce9d3dc795da66b9f0815c79c2f753';
function currentManifestHash() {
  try {
    const src = fs.readFileSync(path.join(root, 'scripts/web-integrity.mjs'), 'utf8');
    const m = src.match(/const\s+manifestHash\s*=\s*['"]([a-f0-9]{64})['"]/);
    return m ? m[1] : null;
  } catch { return null; }
}

// Paths whose bytes are frozen by a shipped baseline manifest.
function frozenPaths() {
  const frozen = new Set();
  const managed = new Set(['apps/web/next-env.d.ts', 'apps/web/tsconfig.json']);
  try {
    const web = JSON.parse(fs.readFileSync(path.join(root, 'tests/web-baseline-sha256.json'), 'utf8'));
    for (const p of Object.keys(web)) if (!managed.has(p)) frozen.add(p);
  } catch { /* unreadable manifest is reported by the integrity scripts themselves */ }
  try {
    const core = JSON.parse(fs.readFileSync(path.join(root, 'tests/core-baseline-sha256.json'), 'utf8'));
    for (const p of Object.keys(core)) frozen.add(p);
  } catch { /* same */ }
  return frozen;
}

// ---------------------------------------------------------------------------
// Approvals. Every suppression must name a record, a path and the exact from/to
// hashes. There is no blanket suppression: one approval never covers another file.
// ---------------------------------------------------------------------------
function loadApprovals() {
  try {
    const t = JSON.parse(fs.readFileSync(path.join(root, 'TRACEABILITY.json'), 'utf8'));
    const live = r => r && r.approvedAt && !String(r.status || '').toUpperCase().startsWith('REVERTED');
    return {
      rebaseline: (t.rebaseline || []).filter(live),
      governance: (t.governanceApprovals || []).filter(live)
    };
  } catch { return { rebaseline: [], governance: [] }; }
}

function frozenApproval(approvals, p, fromHash, toHash) {
  for (const r of approvals.rebaseline) {
    if (r.path !== p) continue;
    if (r.from !== fromHash || r.to !== toHash) continue;
    return { record: r.id, approval: r.approval, approvedAt: r.approvedAt };
  }
  return null;
}

// Live, non-REVERTED locationsUpdated entries for one location, as from -> to hops.
function locationHops(approvals, location) {
  const hops = [];
  for (const r of approvals.rebaseline) {
    for (const e of r.locationsUpdated || []) {
      if (e.location !== location) continue;
      if (String(e.status || '').toUpperCase().startsWith('REVERTED')) continue;
      hops.push({ from: e.from, to: e.to, record: r.id, approval: r.approval, approvedAt: r.approvedAt });
    }
  }
  return hops;
}

// OBS-006 / A9. A baseline value may legitimately have been re-baselined more than once
// (RB-1-001 took manifestHash 7d22fba2 -> 8d3dfc16, RB-1-002 took it 8d3dfc16 -> c1c3abbf).
// A single-hop match can never accept that, because no approved record says 7d22fba2 -> c1c3abbf
// and none should: forging one would be record falsification. So the chain is DERIVED from the
// takeover constant instead, one hop at a time. Nothing is relaxed: every hop must still name
// this exact location, be non-REVERTED, live, and start exactly where the previous hop ended.
// A fork, a dead end, a cycle or an overlong chain resolves to nothing, i.e. BLOCK.
const MAX_APPROVAL_CHAIN_HOPS = 32;
function locationChain(approvals, location, fromValue, toValue) {
  const hops = locationHops(approvals, location);
  const chain = [];
  const visited = new Set([fromValue]);
  let cursor = fromValue;
  let last = null;
  while (cursor !== toValue) {
    if (chain.length >= MAX_APPROVAL_CHAIN_HOPS) {
      return { ok: null, chain, stoppedAt: cursor, reason: `链条超过 ${MAX_APPROVAL_CHAIN_HOPS} 跳` };
    }
    const next = hops.filter(h => h.from === cursor);
    if (next.length === 0) {
      return { ok: null, chain, stoppedAt: cursor, reason: '没有以该值为 from 的已批准 locationsUpdated 条目' };
    }
    if (next.length > 1) {
      return { ok: null, chain, stoppedAt: cursor, reason: `同一 from 有 ${next.length} 条候选条目，无法唯一推导` };
    }
    if (visited.has(next[0].to)) {
      return { ok: null, chain, stoppedAt: cursor, reason: '链条出现环' };
    }
    visited.add(next[0].to);
    last = next[0];
    chain.push(last.record);
    cursor = last.to;
  }
  if (!last) return { ok: null, chain, stoppedAt: cursor, reason: 'from 与 to 相同，不构成再基线' };
  return { ok: { record: last.record, approval: last.approval, approvedAt: last.approvedAt, chain }, chain, stoppedAt: cursor, reason: null };
}

function locationApproval(approvals, location, fromValue, toValue) {
  // Unbound / partially bound lookup (baseline-holder files) keeps the original semantics:
  // one live entry naming this location is what suppresses the alert.
  if (fromValue === undefined || toValue === undefined) {
    for (const h of locationHops(approvals, location)) {
      if (fromValue !== undefined && h.from !== fromValue) continue;
      if (toValue !== undefined && h.to !== toValue) continue;
      return { record: h.record, approval: h.approval, approvedAt: h.approvedAt, chain: [h.record] };
    }
    return null;
  }
  return locationChain(approvals, location, fromValue, toValue).ok;
}

function governanceApproval(approvals, p, fromHash, toHash) {
  for (const r of approvals.governance) {
    if (r.path !== p) continue;
    if (r.from !== fromHash || r.to !== toHash) continue;
    return { record: r.id, approval: r.approval, approvedAt: r.approvedAt };
  }
  return null;
}

// ---------------------------------------------------------------------------
function walk(dir, rel, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const name = rel ? `${rel}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) { out.set(name, 'SYMLINK'); continue; }
    if (entry.isDirectory()) walk(full, name, out);
    else if (entry.isFile()) out.set(name, sha256(fs.readFileSync(full)));
  }
  return out;
}

function readBaseline(file) {
  const map = new Map();
  for (const line of fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([a-f0-9]{64})\s+(.+)$/);
    if (m) map.set(m[2].trim().replace(/^\.\//, ''), m[1]);
  }
  return map;
}

let baseline;
try { baseline = readBaseline(baselineArg); }
catch (error) {
  console.error(`scope-guard: cannot read baseline ${baselineArg}: ${error.message}`);
  process.exit(1);
}

const current = walk(root, '', new Map());
const frozen = frozenPaths();
const approvals = loadApprovals();

const changed = [];
const added = [];
const removed = [];
for (const [p, hash] of current) {
  if (!baseline.has(p)) { added.push(p); continue; }
  if (baseline.get(p) !== hash) changed.push({ path: p, from: baseline.get(p), to: hash });
}
for (const p of baseline.keys()) if (!current.has(p)) removed.push(p);

const violations = [];
const suppressions = [];

for (const c of [...changed, ...removed.map(p => ({ path: p, from: baseline.get(p), to: null }))]) {
  if (frozen.has(c.path)) {
    const ok = frozenApproval(approvals, c.path, c.from, c.to);
    if (ok) suppressions.push({ path: c.path, rule: 'B3', approvedBy: ok });
    else violations.push({ path: c.path, rule: 'B3', reason: `字节冻结文件被改动，且没有绑定到该文件与该 from/to 哈希的已批准 RB-1 记录（from=${String(c.from).slice(0, 12)}… to=${c.to ? String(c.to).slice(0, 12) + '…' : '(已删除)'}）` });
  }
  if (BASELINE_HOLDERS.has(c.path)) {
    const ok = locationApproval(approvals, c.path);
    if (ok) suppressions.push({ path: c.path, rule: 'B4', approvedBy: ok });
    else violations.push({ path: c.path, rule: 'B4', reason: '基线清单文件被改动，且没有已批准 RB-1 记录中对应该位置的 locationsUpdated 条目' });
  }
}

// manifestHash constant, bound to its exact old/new value.
const manifestNow = currentManifestHash();
if (manifestNow !== MANIFEST_HASH_BASELINE) {
  const walk = locationChain(approvals, MANIFEST_HASH_LOCATION, MANIFEST_HASH_BASELINE, manifestNow);
  if (walk.ok) suppressions.push({ path: MANIFEST_HASH_LOCATION, rule: 'B4', approvedBy: walk.ok });
  else {
    const walked = walk.chain.length ? `已沿 ${walk.chain.join(' → ')} 走到 ${String(walk.stoppedAt).slice(0, 12)}…，` : '';
    violations.push({ path: MANIFEST_HASH_LOCATION, rule: 'B4', reason: `manifestHash 常量为 ${String(manifestNow).slice(0, 12)}…，与接管基线不符：${walked}${walk.reason}` });
  }
}

// Governance trust base, including this file itself.
const controlStatus = [];
for (const [p, expected] of Object.entries(CONTROL_FILES)) {
  let actual = null;
  try { actual = sha256(fs.readFileSync(path.join(root, p))); } catch { actual = null; }
  const match = actual === expected;
  controlStatus.push({ path: p, match, actual });
  if (match) continue;
  const ok = governanceApproval(approvals, p, expected, actual);
  if (ok) suppressions.push({ path: p, rule: 'B-GOV', approvedBy: ok });
  else violations.push({ path: p, rule: 'B-GOV', reason: `治理控制文件被改动，且 TRACEABILITY.json.governanceApprovals 中没有绑定该 from/to 的已批准记录（expected=${String(expected).slice(0, 12)}… actual=${actual ? String(actual).slice(0, 12) + '…' : '(缺失)'}）` });
}
{
  let actual = null;
  try { actual = sha256(normalizedSelf(fs.readFileSync(path.join(root, SELF_PATH), 'utf8'))); } catch { actual = null; }
  const match = actual === SELF_SHA256;
  controlStatus.push({ path: SELF_PATH + ' (normalised self)', match, actual });
  if (!match) {
    const ok = governanceApproval(approvals, SELF_PATH, SELF_SHA256, actual);
    if (ok) suppressions.push({ path: SELF_PATH, rule: 'B-GOV', approvedBy: ok });
    else violations.push({ path: SELF_PATH, rule: 'B-GOV', reason: `Scope Guard 检查器自身被改动，且没有绑定该 from/to 的已批准 governanceApprovals 记录（expected=${String(SELF_SHA256).slice(0, 12)}… actual=${actual ? String(actual).slice(0, 12) + '…' : '(不可读)'}）` });
  }
}

const isGovernanceArtifact = p =>
  GOVERNANCE_ADDITIONS.has(p) || p.startsWith('evidence/dev/') ||
  p.startsWith('governance/repro/') || p.startsWith('governance/evidence-snapshot') ||
  p === 'governance/baseline-v0.3.3.2.sha256' || p === 'governance/SCOPE-GUARD.md' || p === SELF_PATH;

const productAdditions = added.filter(p => !isGovernanceArtifact(p));
const exitCode = violations.length ? 3 : (changed.length || removed.length || productAdditions.length) ? 2 : 0;

if (asJson) {
  console.log(JSON.stringify({
    baseline: baselineArg, changed, added, removed, productAdditions,
    controlFiles: controlStatus, suppressions, violations, exitCode,
    counts: { changed: changed.length, added: added.length, removed: removed.length, violations: violations.length, suppressions: suppressions.length }
  }, null, 2));
} else {
  console.log(`SCOPE GUARD CHECK (read-only) — baseline: ${baselineArg}`);
  console.log(`CHANGED=${changed.length} ADDED=${added.length} REMOVED=${removed.length} VIOLATIONS=${violations.length}`);
  console.log('\nCONTROL FILES (governance trust base):');
  for (const c of controlStatus) console.log(`  ${c.match ? 'OK      ' : 'MISMATCH'} ${c.path}`);
  if (changed.length) {
    console.log('\nCHANGED FILES:');
    for (const c of changed) console.log(`  ${c.path}${frozen.has(c.path) ? '  [FROZEN]' : ''}${BASELINE_HOLDERS.has(c.path) ? '  [BASELINE-HOLDER]' : ''}`);
  }
  if (added.length) {
    console.log('\nADDED FILES:');
    for (const p of added) console.log(`  ${p}${isGovernanceArtifact(p) ? '  [governance]' : ''}`);
  }
  if (removed.length) {
    console.log('\nREMOVED FILES:');
    for (const p of removed) console.log(`  ${p}`);
  }
  if (suppressions.length) {
    console.log('\nAPPROVED (each bound to a specific record, path and from/to):');
    for (const s of suppressions) {
      const a = s.approvedBy;
      const via = a.chain && a.chain.length > 1 ? `  [链: ${a.chain.join(' → ')}]` : '';
      console.log(`  [${s.rule}] ${s.path} — ${a.record} / ${a.approval} / ${a.approvedAt}${via}`);
    }
  }
  if (violations.length) {
    console.log('\nVIOLATIONS (no matching approval — Scope Guard must BLOCK):');
    for (const v of violations) console.log(`  [${v.rule}] ${v.path} — ${v.reason}`);
  }
  console.log('\nThis tool reports facts only. The ALLOW/BLOCK verdict is given by the Scope Guard role.');
}
process.exit(exitCode);
