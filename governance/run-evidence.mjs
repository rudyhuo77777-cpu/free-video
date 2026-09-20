// Evidence runner — records command, cwd, exit code, timing, stdout/stderr for one command.
// Usage: node governance/run-evidence.mjs <evidenceDir> <command> [args...]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const [dir, command, ...args] = process.argv.slice(2);
if (!dir || !command) { console.error('usage: run-evidence.mjs <dir> <command> [args...]'); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const startedAt = new Date().toISOString();
const t0 = Date.now();
const r = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: process.env });
const finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(dir, 'stdout.log'), r.stdout ?? '');
fs.writeFileSync(path.join(dir, 'stderr.log'), r.stderr ?? '');
fs.writeFileSync(path.join(dir, 'command.json'), JSON.stringify({
  command, args, cwd: process.cwd(), startedAt, finishedAt, durationMs: Date.now() - t0,
  exitCode: r.status, signal: r.signal, error: r.error ? String(r.error.message) : null,
  node: process.version, platform: process.platform
}, null, 2) + '\n');
process.stdout.write(r.stdout ?? '');
process.stderr.write(r.stderr ?? '');
console.log(`\n[evidence] ${dir} exit=${r.status}`);
process.exit(r.status ?? 1);
