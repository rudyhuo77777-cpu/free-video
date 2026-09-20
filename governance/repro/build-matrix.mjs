// Builds evidence/dev/STEP-1/BASELINE-MATRIX.md from the recorded evidence. Read-only.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const S1 = path.join(root, 'evidence/dev/STEP-1');
const read = p => { try { return fs.readFileSync(path.join(S1, p), 'utf8'); } catch { return null; } };
const cmd = t => { const j = read(`${t}/command.json`); return j ? JSON.parse(j) : null; };
const jsonOut = t => { const s = read(`${t}/stdout.log`); try { return JSON.parse(s); } catch { return null; } };

const rows = [];
const add = (layer, test, status, evidence, note) => rows.push({ layer, test, status, evidence, note });

const c = t => { const j = cmd(t); return j ? `exit ${j.exitCode}` : 'no record'; };

add('工程', '接管快照与全树哈希基线（110 文件）', 'PASS', 'governance/baseline-v0.3.3.2.sha256; evidence/dev/STEP-1/T1-1/', 'CHANGED=0 REMOVED=0 VIOLATIONS=0；不是历史来源证明');
add('工程', '环境记录', 'PASS', 'evidence/dev/STEP-1/T1-1/environment.json', 'WSL2; Node v22.22.3; npm 10.9.8; Chrome for Testing 151.0.7922.34; ffmpeg 6.1.1（审计为 Windows/Node24/Chrome152/ffmpeg8.1.2）');
add('依赖', '按声明安装并生成真实锁', 'PASS', `evidence/dev/STEP-1/T1-2/ (${c('T1-2')})`, '7/7 版本精确匹配；未执行 npm audit fix；未升级任何版本');
add('构建', '构建前同套离线检查', 'PASS', `evidence/dev/STEP-1/T1-3/ (${c('T1-3')})`, 'UI 18/18、结构 23/23、回归 69/69、release-guards 25/25、verification-fix 56/56');
add('构建', '第一次真实 next build', 'PASS', `evidence/dev/STEP-1/T1-4-build/ (${c('T1-4-build')})`, '真实构建，产出 apps/web/out/index.html');
add('构建', '第一次真实 typecheck', 'PASS', `evidence/dev/STEP-1/T1-4-typecheck/ (${c('T1-4-typecheck')})`, 'tsc --noEmit；未放宽 tsconfig');
add('构建', '第一次构建后同套离线检查', 'FAIL', `evidence/dev/STEP-1/T1-5/ (${c('T1-5')})`, 'FV-001；next-env.d.ts: unexpected content at line 4；release-guards 24/25');
add('构建', '第二次 npm run verify 入口', 'FAIL', `evidence/dev/STEP-1/T1-6-verify-second/ (${c('T1-6-verify-second')})`, '前置检查即退出 1，正确停止，未重复构建');
add('构建', '第二次独立真实增量 build', 'PASS', `evidence/dev/STEP-1/T1-6-build-second/ (${c('T1-6-build-second')})`, '为满足两次真实构建独立执行；不冒充 verify 成功');
add('构建', '第二次 typecheck', 'PASS', `evidence/dev/STEP-1/T1-6-typecheck-second/ (${c('T1-6-typecheck-second')})`, '真实 tsc --noEmit');
add('构建', '第二次构建后相同离线规则', 'FAIL', `evidence/dev/STEP-1/T1-6-offline-after-second/ (${c('T1-6-offline-after-second')})`, '同 FV-001；未恢复 next-env、未改基线');

const t7 = jsonOut('T1-7');
if (t7) {
  for (const s of t7.samples) {
    const isBypass = s.shouldReject && s.accepted;
    const isFalsePos = !s.shouldReject && !s.accepted;
    add('保护变异', s.id, (isBypass || isFalsePos) ? 'FAIL' : 'PASS', 'evidence/dev/STEP-1/T1-7/stdout.log',
      isBypass ? `FV-002 绕过：被接受；TS 解析为 ${s.tsStatementKinds.join(',') || '(无语句)'}，0 诊断`
      : isFalsePos ? `FV-001 误报：真实 Next 生成文件被拒 — ${s.error}`
      : s.shouldReject ? `正确拒绝：${s.error}` : '正确接受');
  }
  add('保护变异', `21 个冻结文件逐个单字节变异`, t7.frozenMutations.rejected === t7.frozenMutations.total ? 'PASS' : 'FAIL',
    'evidence/dev/STEP-1/T1-7/stdout.log', `${t7.frozenMutations.rejected}/${t7.frozenMutations.total} 被拦截`);
}

const t8 = jsonOut('T1-8');
if (t8) {
  add('发布', 'Wrangler 录制桩自证（安全前提）', t8.stubSelfTest.allCallsCameFromStub && t8.stubSelfTest.stdoutHasNoRealWranglerBanner ? 'PASS' : 'FAIL',
    'evidence/dev/STEP-1/T1-8/stdout.log', `副本内 wrangler 版本 ${t8.stubSelfTest.wranglerPackageInCopy}；无真实 banner；无 api.cloudflare.com`);
  for (const s of t8.scenarios) {
    const bypass = ['A-config-modified', 'B-stale-artifact', 'C-no-verify-record', 'D-lock-changed'].includes(s.id);
    const status = bypass ? (s.reachedMigration ? 'FAIL' : 'PASS')
      : s.id === 'F-migration-fails' ? (!s.reachedDeploy ? 'PASS' : 'FAIL')
      : s.id === 'PLAN-only' ? (s.wranglerCalls.length === 0 ? 'PASS' : 'FAIL') : 'PASS';
    add('发布', `部署场景 ${s.id}`, status, 'evidence/dev/STEP-1/T1-8/stdout.log',
      `${s.description}；exit ${s.exitCode}；到达迁移=${s.reachedMigration}，到达 deploy=${s.reachedDeploy}` + (bypass && s.reachedMigration ? '（FV-003 绕过成立）' : ''));
  }
  add('发布', '第一次 T1-8 运行（作废）', 'FAIL', 'evidence/dev/STEP-1/T1-8-VOID-correction-001/', 'CORRECTION-001：拦截器失效，真实 wrangler 对假账号发起 5 次请求，全部 401；无真实资源被触及');
}

const t9 = jsonOut('T1-9');
if (t9) {
  const a = t9.analysis;
  add('浏览器恢复', '原 UI 丢完成回执后以相同输入再次点击', t9.defectReproduced ? 'FAIL' : 'PASS',
    'evidence/dev/STEP-1/T1-9/stdout.log; artifacts/after-lost-ack.png; artifacts/after-retry.png',
    `FV-004；AI 调用 ${a.aiCallsAfterFirst}→${a.aiCallsAfterRetry}，completed ${a.completedRowsAfterFirst}→${a.completedRowsAfterRetry}，used ${a.quotaUsedAfterFirst}→${a.quotaUsedAfterRetry}，不同 key ${a.distinctKeys} 个；AI 为夹具`);
  add('浏览器恢复', '页面控制台无红色 error', a.consoleErrors.length === 0 ? 'PASS' : 'FAIL', 'evidence/dev/STEP-1/T1-9/stdout.log', `${a.consoleErrors.length} 条`);
}

const t11 = jsonOut('T1-11');
if (t11) {
  for (const cse of t11.cases) {
    add('API 边界', cse.id, cse.defectReproduced ? 'FAIL' : 'PASS', 'evidence/dev/STEP-1/T1-11/stdout.log',
      cse.finding === 'FV-008'
        ? `FV-008；loopback=${cse.loopbackUrlsInResult}, javascript/data 来源=${cse.javascriptOrDataSourcePages}, 保留 license=${cse.entriesRetainingLicense}/${cse.resultCount}；mock fetch 边界，未发公网请求`
        : `FV-007；status ${cse.status}，哨兵泄漏=${cse.sentinelLeaked ?? 'n/a'}，含 stage=${cse.hasStage}`);
  }
}

for (const [tag, label] of [['T1-10-win', 'Windows Chrome 152 / GPU 开启'], ['T1-10', 'Linux Chrome 151 / --disable-gpu（见 CORRECTION-003）']]) {
const t10 = jsonOut(tag);
if (t10) {
  for (const sc of t10.scenarios) {
    const v = sc.value || {};
    let status = 'NOT_RUN', note = sc.harnessError ? `harness error: ${sc.harnessError}` : '';
    if (sc.id.startsWith('S1')) { status = v.ok ? 'PASS' : 'FAIL'; note = v.ok ? `对照：15s 内存路径成功，mode=${v.mode}, ${v.size} bytes` : `对照失败：${v.error}`; }
    if (sc.id.startsWith('S2') || sc.id.startsWith('S3')) { status = v.ok ? 'PASS' : 'FAIL'; note = `FV-005；${v.ok ? '成功（未复现）' : '失败：' + v.error}；OPFS 残留=${JSON.stringify(v.opfsLeftovers)}`; }
    if (sc.id.startsWith('S4')) { status = v.ok ? 'FAIL' : 'PASS'; note = `FV-006；全零 PCM ${v.ok ? '被接受并产出 MP4（缺陷成立）' : '被拒绝：' + v.error}`; }
    if (sc.id.startsWith('S5')) { status = v.settled === 'still-pending-after-12s' ? 'FAIL' : 'PASS'; note = `FV-009；${v.settled}，progress=${v.progress}，elapsed=${v.elapsedMs}ms`; }
    if (sc.id.startsWith('S6')) { status = v.ok ? 'FAIL' : 'PASS'; note = `FV-010；旁白 ${v.narrationSeconds}s vs 选定 60s，被裁 ${v.discardedTailSeconds}s，尾部 RMS ${v.discardedTailRmsDb?.toFixed?.(2)} dB，峰值 ${v.discardedTailPeak?.toFixed?.(3)}；${v.ok ? '仍返回成功 MP4（缺陷成立）' : '已失败：' + v.error}；旁白为合成音频，非 F5`; }
    if (/not supported in this environment/.test(v.error || '') || /not supported in this environment/.test(v.out?.error || '')) {
      status = 'NOT_RUN';
      note = `该场景未真正执行：harness 的 --disable-gpu 使 avc1.64001f+prefer-hardware 被判不支持（CORRECTION-003）。以 T1-10-win 为准。`;
    }
    add(`MP4/渲染 [${label}]`, sc.id, status, `evidence/dev/STEP-1/${tag}/stdout.log${sc.savedFile ? '; evidence/dev/STEP-1/T1-10-win/artifacts/' + sc.id + '.mp4' : ''}`, note);
  }
}
}
const mp4v = (() => { try { return JSON.parse(read('T1-10-win/mp4-verification.json')); } catch { return null; } })();
if (mp4v) for (const f of mp4v.files) {
  add('MP4/解码验证', f.file, 'PASS', 'evidence/dev/STEP-1/T1-10-win/mp4-verification.json',
    `${f.sizeBytes} bytes；${f.durationSec}s；${f.video.codec} ${f.video.width}x${f.video.height} ${f.video.frames} 帧；${f.audio.codec} ${f.audio.sampleRate}Hz；完整解码退出码 ${f.fullDecodeExitCode}；mean ${f.volumeDb.mean} dB / max ${f.volumeDb.max} dB`);
}

// Explicitly unmet items
add('声音', '真实 Supertonic 3 / F5 印尼语合成', 'NOT_RUN', '—', 'WSL2 环境无 Voice Bridge/Supertonic（需 Windows 侧 SUPERTONIC_EXE）。T1-10 旁白为明确标注的合成音频，不得当作 F5 验收');
add('云端 AI', '真实 Workers AI 推理', 'BLOCKED', '—', '用户已明确：不调用收费真实 AI（A5=DENIED）');
add('生产 D1', '真实账号/DB 身份、备份恢复、生产迁移', 'BLOCKED', '—', '用户已明确：不操作生产 D1（A8=DENIED）');
add('发布', '生产发布', 'BLOCKED', '—', '用户已明确：不部署 Cloudflare（A8=DENIED）');
add('设备', 'Android / iPhone 真机与手机本地 TTS', 'NOT_RUN', '—', '未提供真机（A6 未答复）；禁止用桌面浏览器冒充');
add('声音', '母语者听感、发音、逐词字幕同步', 'NOT_RUN', '—', '未提供母语者（A7 未答复）');
add('独立 workerd', '真实 D1 底层 I/O 故障注入', 'NOT_RUN', '—', 'SQLite 适配器结果不能代替；本轮未执行');

const counts = rows.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
const md = `# STEP 1 基线矩阵 — Free Video v0.3.3.2

生成时间：${new Date().toISOString()}
执行者：Implementer(Claude)
源码指纹：见 \`governance/baseline-v0.3.3.2.sha256\`（接管时刻 110 文件）

> 状态只对该行所述层级有效。PASS 不等于全链路通过；未计算全站成功率。
> 复现类任务中 \`FAIL\` 表示**产品缺陷被成功复现**，不是测试工具失败。
> 本轮**未修改任何产品代码**。

计数：${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('、')}（共 ${rows.length} 行）

| 层级 | 测试 | 结果 | 证据 | 边界/说明 |
|---|---|---|---|---|
${rows.map(r => `| ${r.layer} | ${r.test} | ${r.status} | ${r.evidence} | ${r.note} |`).join('\n')}

## 纠错记录

- **CORRECTION-001**：T1-8 第一次运行的 Wrangler 拦截器失效，真实 wrangler 对**假账号**发起 5 次 \`d1 migrations apply --remote\`，全部 **401 Unauthorized**。无任何真实 Cloudflare 资源被创建/修改/删除；deploy 从未触及。原始输出保留在 \`T1-8-VOID-correction-001/\`。已改为录制桩方案并自证后重跑。
- **CORRECTION-003**：会话中曾把 avc1.64001f 编码失败表述为环境限制，实为 harness 自带 \`--disable-gpu\` 所致（四组标志对比见 \`governance/repro/probe-avc.mjs\`）。启用 GPU 后 15s 对照组成功，FV-006/FV-010 随即复现。第一次 Windows 运行输出未删除。
- **CORRECTION-002**：运行 \`scripts/check-offline.mjs\` 覆盖了 \`evidence/regression-results.json\` 与 \`evidence/release-guards.json\`（16 个历史文件中的 2 个）。原内容不可恢复，仅存 sha256。根因是包内脚本无条件写入，原规则不可执行；规则已修订为"运行前必须先快照"。
`;
fs.writeFileSync(path.join(S1, 'BASELINE-MATRIX.md'), md);
console.log(md.split('\n').slice(0, 12).join('\n'));
console.log(`\n[matrix] ${rows.length} rows written`);
