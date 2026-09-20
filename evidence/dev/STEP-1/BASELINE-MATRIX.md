# STEP 1 基线矩阵 — Free Video v0.3.3.2

生成时间：2026-09-19T01:44:26.591Z
执行者：Implementer(Claude)
源码指纹：见 `governance/baseline-v0.3.3.2.sha256`（接管时刻 110 文件）

> 状态只对该行所述层级有效。PASS 不等于全链路通过；未计算全站成功率。
> 复现类任务中 `FAIL` 表示**产品缺陷被成功复现**，不是测试工具失败。
> 本轮**未修改任何产品代码**。

计数：PASS=21、FAIL=24、NOT_RUN=7、BLOCKED=3（共 55 行）

| 层级 | 测试 | 结果 | 证据 | 边界/说明 |
|---|---|---|---|---|
| 工程 | 接管快照与全树哈希基线（110 文件） | PASS | governance/baseline-v0.3.3.2.sha256; evidence/dev/STEP-1/T1-1/ | CHANGED=0 REMOVED=0 VIOLATIONS=0；不是历史来源证明 |
| 工程 | 环境记录 | PASS | evidence/dev/STEP-1/T1-1/environment.json | WSL2; Node v22.22.3; npm 10.9.8; Chrome for Testing 151.0.7922.34; ffmpeg 6.1.1（审计为 Windows/Node24/Chrome152/ffmpeg8.1.2） |
| 依赖 | 按声明安装并生成真实锁 | PASS | evidence/dev/STEP-1/T1-2/ (exit 0) | 7/7 版本精确匹配；未执行 npm audit fix；未升级任何版本 |
| 构建 | 构建前同套离线检查 | PASS | evidence/dev/STEP-1/T1-3/ (exit 0) | UI 18/18、结构 23/23、回归 69/69、release-guards 25/25、verification-fix 56/56 |
| 构建 | 第一次真实 next build | PASS | evidence/dev/STEP-1/T1-4-build/ (exit 0) | 真实构建，产出 apps/web/out/index.html |
| 构建 | 第一次真实 typecheck | PASS | evidence/dev/STEP-1/T1-4-typecheck/ (exit 0) | tsc --noEmit；未放宽 tsconfig |
| 构建 | 第一次构建后同套离线检查 | FAIL | evidence/dev/STEP-1/T1-5/ (exit 1) | FV-001；next-env.d.ts: unexpected content at line 4；release-guards 24/25 |
| 构建 | 第二次 npm run verify 入口 | FAIL | evidence/dev/STEP-1/T1-6-verify-second/ (exit 1) | 前置检查即退出 1，正确停止，未重复构建 |
| 构建 | 第二次独立真实增量 build | PASS | evidence/dev/STEP-1/T1-6-build-second/ (exit 0) | 为满足两次真实构建独立执行；不冒充 verify 成功 |
| 构建 | 第二次 typecheck | PASS | evidence/dev/STEP-1/T1-6-typecheck-second/ (exit 0) | 真实 tsc --noEmit |
| 构建 | 第二次构建后相同离线规则 | FAIL | evidence/dev/STEP-1/T1-6-offline-after-second/ (exit 1) | 同 FV-001；未恢复 next-env、未改基线 |
| 保护变异 | env-unicode-line-separator | FAIL | evidence/dev/STEP-1/T1-7/stdout.log | FV-002 绕过：被接受；TS 解析为 ImportDeclaration，0 诊断 |
| 保护变异 | env-unicode-paragraph-separator | FAIL | evidence/dev/STEP-1/T1-7/stdout.log | FV-002 绕过：被接受；TS 解析为 FirstStatement，0 诊断 |
| 保护变异 | env-unicode-line-separator-directive | FAIL | evidence/dev/STEP-1/T1-7/stdout.log | FV-002 绕过：被接受；TS 解析为 (无语句)，0 诊断 |
| 保护变异 | real-next-generated | FAIL | evidence/dev/STEP-1/T1-7/stdout.log | FV-001 误报：真实 Next 生成文件被拒 — next-env.d.ts: unexpected content at line 4 |
| 保护变异 | control-path-traversal | PASS | evidence/dev/STEP-1/T1-7/stdout.log | 正确拒绝：next-env.d.ts: unexpected content at line 3 |
| 保护变异 | control-arbitrary-package | PASS | evidence/dev/STEP-1/T1-7/stdout.log | 正确拒绝：next-env.d.ts: unexpected content at line 3 |
| 保护变异 | control-ts-nocheck | PASS | evidence/dev/STEP-1/T1-7/stdout.log | 正确拒绝：next-env.d.ts: TypeScript suppression directives are not allowed |
| 保护变异 | control-seed-only | PASS | evidence/dev/STEP-1/T1-7/stdout.log | 正确接受 |
| 保护变异 | 21 个冻结文件逐个单字节变异 | PASS | evidence/dev/STEP-1/T1-7/stdout.log | 21/21 被拦截 |
| 发布 | Wrangler 录制桩自证（安全前提） | PASS | evidence/dev/STEP-1/T1-8/stdout.log | 副本内 wrangler 版本 4.131.1-RECORDER-STUB；无真实 banner；无 api.cloudflare.com |
| 发布 | 部署场景 A-config-modified | FAIL | evidence/dev/STEP-1/T1-8/stdout.log | next.config.ts 被修改（完整 verifyWebIntegrity 会失败），18 项旧 UI 哈希仍正确；exit 0；到达迁移=true，到达 deploy=true（FV-003 绕过成立） |
| 发布 | 部署场景 B-stale-artifact | FAIL | evidence/dev/STEP-1/T1-8/stdout.log | out/index.html 为任意陈旧 HTML，与当前源码无绑定；exit 0；到达迁移=true，到达 deploy=true（FV-003 绕过成立） |
| 发布 | 部署场景 C-no-verify-record | FAIL | evidence/dev/STEP-1/T1-8/stdout.log | 不存在 evidence/build-verification.json 成功记录；exit 0；到达迁移=true，到达 deploy=true（FV-003 绕过成立） |
| 发布 | 部署场景 D-lock-changed | FAIL | evidence/dev/STEP-1/T1-8/stdout.log | package-lock.json 在验证之后被改动；exit 0；到达迁移=true，到达 deploy=true（FV-003 绕过成立） |
| 发布 | 部署场景 E-all-satisfied | PASS | evidence/dev/STEP-1/T1-8/stdout.log | 全部前提满足（对照：应到达 wrangler，顺序为先迁移后发布）；exit 0；到达迁移=true，到达 deploy=true |
| 发布 | 部署场景 F-migration-fails | PASS | evidence/dev/STEP-1/T1-8/stdout.log | 迁移子进程返回非零，deploy 不得执行；exit 1；到达迁移=true，到达 deploy=false |
| 发布 | 部署场景 PLAN-only | PASS | evidence/dev/STEP-1/T1-8/stdout.log | deploy:plan 只输出计划，不调用 wrangler；exit 0；到达迁移=false，到达 deploy=false |
| 发布 | 第一次 T1-8 运行（作废） | FAIL | evidence/dev/STEP-1/T1-8-VOID-correction-001/ | CORRECTION-001：拦截器失效，真实 wrangler 对假账号发起 5 次请求，全部 401；无真实资源被触及 |
| 浏览器恢复 | 原 UI 丢完成回执后以相同输入再次点击 | FAIL | evidence/dev/STEP-1/T1-9/stdout.log; artifacts/after-lost-ack.png; artifacts/after-retry.png | FV-004；AI 调用 1→2，completed 1→2，used 1→2，不同 key 2 个；AI 为夹具 |
| 浏览器恢复 | 页面控制台无红色 error | PASS | evidence/dev/STEP-1/T1-9/stdout.log | 0 条 |
| API 边界 | fv007-async-body-error-redaction | FAIL | evidence/dev/STEP-1/T1-11/stdout.log | FV-007；status 400，哨兵泄漏=true，含 stage=false |
| API 边界 | fv007-stage-missing-on-direct-error | FAIL | evidence/dev/STEP-1/T1-11/stdout.log | FV-007；status 400，哨兵泄漏=n/a，含 stage=false |
| API 边界 | fv008-url-boundary-and-license | FAIL | evidence/dev/STEP-1/T1-11/stdout.log | FV-008；loopback=1, javascript/data 来源=1, 保留 license=0/1；mock fetch 边界，未发公网请求 |
| MP4/渲染 [Windows Chrome 152 / GPU 开启] | S1-15s-memory-control | PASS | evidence/dev/STEP-1/T1-10-win/stdout.log | 对照：15s 内存路径成功，mode=memory, 472257 bytes |
| MP4/渲染 [Windows Chrome 152 / GPU 开启] | S2-90s-opfs | FAIL | evidence/dev/STEP-1/T1-10-win/stdout.log | FV-005；失败：All tracks must specify maximumPacketCount in their metadata when using fastStart: 'reserve'.；OPFS 残留=[{"name":"free-video-botol-minum-stainless-90s-2e3aa5f3.mp4.crswap","size":0},{"name":"free-video-botol-minum-stainless-90s-2e3aa5f3.mp4","size":0}] |
| MP4/渲染 [Windows Chrome 152 / GPU 开启] | S3-120s-opfs | FAIL | evidence/dev/STEP-1/T1-10-win/stdout.log | FV-005；失败：All tracks must specify maximumPacketCount in their metadata when using fastStart: 'reserve'.；OPFS 残留=[{"name":"free-video-botol-minum-stainless-90s-2e3aa5f3.mp4.crswap","size":0},{"name":"free-video-botol-minum-stainless-90s-2e3aa5f3.mp4","size":0},{"name":"free-video-botol-minum-stainless-120s-480f8bec.mp4.crswap","size":0},{"name":"free-video-botol-minum-stainless-120s-480f8bec.mp4","size":0}] |
| MP4/渲染 [Windows Chrome 152 / GPU 开启] | S4-silent-negative-15s | FAIL | evidence/dev/STEP-1/T1-10-win/stdout.log; evidence/dev/STEP-1/T1-10-win/artifacts/S4-silent-negative-15s.mp4 | FV-006；全零 PCM 被接受并产出 MP4（缺陷成立） |
| MP4/渲染 [Windows Chrome 152 / GPU 开启] | S5-hanging-image-12s | FAIL | evidence/dev/STEP-1/T1-10-win/stdout.log | FV-009；still-pending-after-12s，progress=0，elapsed=12003ms |
| MP4/渲染 [Windows Chrome 152 / GPU 开启] | S6-60s-with-65.68s-narration | FAIL | evidence/dev/STEP-1/T1-10-win/stdout.log; evidence/dev/STEP-1/T1-10-win/artifacts/S6-60s-with-65.68s-narration.mp4 | FV-010；旁白 65.68366666666667s vs 选定 60s，被裁 5.683666666666667s，尾部 RMS -18.76 dB，峰值 0.340；仍返回成功 MP4（缺陷成立）；旁白为合成音频，非 F5 |
| MP4/渲染 [Linux Chrome 151 / --disable-gpu（见 CORRECTION-003）] | S1-15s-memory-control | NOT_RUN | evidence/dev/STEP-1/T1-10/stdout.log | 该场景未真正执行：harness 的 --disable-gpu 使 avc1.64001f+prefer-hardware 被判不支持（CORRECTION-003）。以 T1-10-win 为准。 |
| MP4/渲染 [Linux Chrome 151 / --disable-gpu（见 CORRECTION-003）] | S2-90s-opfs | FAIL | evidence/dev/STEP-1/T1-10/stdout.log | FV-005；失败：All tracks must specify maximumPacketCount in their metadata when using fastStart: 'reserve'.；OPFS 残留=[{"name":"free-video-botol-minum-stainless-90s-14c2d9c6.mp4.crswap","size":0},{"name":"free-video-botol-minum-stainless-90s-14c2d9c6.mp4","size":0}] |
| MP4/渲染 [Linux Chrome 151 / --disable-gpu（见 CORRECTION-003）] | S3-120s-opfs | FAIL | evidence/dev/STEP-1/T1-10/stdout.log | FV-005；失败：All tracks must specify maximumPacketCount in their metadata when using fastStart: 'reserve'.；OPFS 残留=[{"name":"free-video-botol-minum-stainless-90s-14c2d9c6.mp4.crswap","size":0},{"name":"free-video-botol-minum-stainless-90s-14c2d9c6.mp4","size":0},{"name":"free-video-botol-minum-stainless-120s-4aeabf15.mp4.crswap","size":0},{"name":"free-video-botol-minum-stainless-120s-4aeabf15.mp4","size":0}] |
| MP4/渲染 [Linux Chrome 151 / --disable-gpu（见 CORRECTION-003）] | S4-silent-negative-15s | NOT_RUN | evidence/dev/STEP-1/T1-10/stdout.log | 该场景未真正执行：harness 的 --disable-gpu 使 avc1.64001f+prefer-hardware 被判不支持（CORRECTION-003）。以 T1-10-win 为准。 |
| MP4/渲染 [Linux Chrome 151 / --disable-gpu（见 CORRECTION-003）] | S5-hanging-image-12s | FAIL | evidence/dev/STEP-1/T1-10/stdout.log | FV-009；still-pending-after-12s，progress=0，elapsed=12000ms |
| MP4/渲染 [Linux Chrome 151 / --disable-gpu（见 CORRECTION-003）] | S6-60s-with-65.68s-narration | NOT_RUN | evidence/dev/STEP-1/T1-10/stdout.log | 该场景未真正执行：harness 的 --disable-gpu 使 avc1.64001f+prefer-hardware 被判不支持（CORRECTION-003）。以 T1-10-win 为准。 |
| MP4/解码验证 | S4-silent-negative-15s.mp4 | PASS | evidence/dev/STEP-1/T1-10-win/mp4-verification.json | 472088 bytes；15.018667s；h264 720x1280 225 帧；aac 48000Hz；完整解码退出码 0；mean -91.0 dB / max -91.0 dB |
| MP4/解码验证 | S6-60s-with-65.68s-narration.mp4 | PASS | evidence/dev/STEP-1/T1-10-win/mp4-verification.json | 1764344 bytes；60.010667s；h264 720x1280 900 帧；aac 48000Hz；完整解码退出码 0；mean -19.1 dB / max -9.3 dB |
| 声音 | 真实 Supertonic 3 / F5 印尼语合成 | NOT_RUN | — | WSL2 环境无 Voice Bridge/Supertonic（需 Windows 侧 SUPERTONIC_EXE）。T1-10 旁白为明确标注的合成音频，不得当作 F5 验收 |
| 云端 AI | 真实 Workers AI 推理 | BLOCKED | — | 用户已明确：不调用收费真实 AI（A5=DENIED） |
| 生产 D1 | 真实账号/DB 身份、备份恢复、生产迁移 | BLOCKED | — | 用户已明确：不操作生产 D1（A8=DENIED） |
| 发布 | 生产发布 | BLOCKED | — | 用户已明确：不部署 Cloudflare（A8=DENIED） |
| 设备 | Android / iPhone 真机与手机本地 TTS | NOT_RUN | — | 未提供真机（A6 未答复）；禁止用桌面浏览器冒充 |
| 声音 | 母语者听感、发音、逐词字幕同步 | NOT_RUN | — | 未提供母语者（A7 未答复） |
| 独立 workerd | 真实 D1 底层 I/O 故障注入 | NOT_RUN | — | SQLite 适配器结果不能代替；本轮未执行 |

## 纠错记录

- **CORRECTION-001**：T1-8 第一次运行的 Wrangler 拦截器失效，真实 wrangler 对**假账号**发起 5 次 `d1 migrations apply --remote`，全部 **401 Unauthorized**。无任何真实 Cloudflare 资源被创建/修改/删除；deploy 从未触及。原始输出保留在 `T1-8-VOID-correction-001/`。已改为录制桩方案并自证后重跑。
- **CORRECTION-003**：会话中曾把 avc1.64001f 编码失败表述为环境限制，实为 harness 自带 `--disable-gpu` 所致（四组标志对比见 `governance/repro/probe-avc.mjs`）。启用 GPU 后 15s 对照组成功，FV-006/FV-010 随即复现。第一次 Windows 运行输出未删除。
- **CORRECTION-002**：运行 `scripts/check-offline.mjs` 覆盖了 `evidence/regression-results.json` 与 `evidence/release-guards.json`（16 个历史文件中的 2 个）。原内容不可恢复，仅存 sha256。根因是包内脚本无条件写入，原规则不可执行；规则已修订为"运行前必须先快照"。
