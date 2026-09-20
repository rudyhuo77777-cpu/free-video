# STEPS-AND-ACCEPTANCE.md — 阶段闸门与硬验收标准

> 本文件只定义**闸门**：每个 STEP 的进入条件、出口条件、验收人。
> 具体任务卡在 `DEVELOPMENT-PLAN.md`。
> 闸门未满足 → 不得进入下一 STEP，不得声明完成。

---

## 通用规则

1. 每个 STEP 的出口条件必须**全部**满足，不允许"大部分通过"
2. 每个 `PASS` 必须满足 `GOVERNANCE.md` §2 的证据七元组
3. 验收人栏为 `Reviewer` 的项，Implementer 自测只能记 `self-test PASS`；
   没有独立 Reviewer → 记 `REVIEW_PENDING`，闸门**不通过**
4. 任何闸门项失败 → 按 `GOVERNANCE.md` §9 停止并报告

---

## STEP 0 — 接管与治理

**进入条件**：无

**出口条件**

| # | 硬验收标准 | 验收人 | 当前 |
|---|---|---|---|
| 0.1 | `CLAUDE.md`、`PRD.md`、`GOVERNANCE.md`、`STEPS-AND-ACCEPTANCE.md`、`CURRENT-STATE.md`、`DEVELOPMENT-PLAN.md`、`TRACEABILITY.json` 七个文件均存在于项目根目录 | Implementer | ✅ |
| 0.2 | `TRACEABILITY.json` 含 FV-001…FV-010 共 10 条，每条有 severity / locations / trigger / expected / actual / reproductionCommand / evidence / minimalFix | Implementer | ✅ |
| 0.3 | Scope Guard 已建立且**只读**：`.claude/agents/scope-guard.md` + `governance/SCOPE-GUARD.md` + `governance/scope-guard-check.mjs` | Implementer | ✅ |
| 0.4 | `governance/baseline-v0.3.3.2.sha256` 含 110 条记录 | Implementer | ✅ |
| 0.5 | 产品代码改动数 = **0**（`node governance/scope-guard-check.mjs` 报告 CHANGED=0, REMOVED=0） | Scope Guard | ✅ |
| 0.6 | 未写入审计目录，未覆盖 `evidence/` 下 16 个历史文件 | Scope Guard | ✅ |
| 0.7 | 用户批准 `DEVELOPMENT-PLAN.md`（A1） | **User** | ⏳ 待批准 |

**进入 STEP 1 的条件**：0.1–0.6 全部 ✅ **且** 0.7 获得用户批准。

---

## STEP 1 — 完整复现现状

**进入条件**：STEP 0 出口条件全部满足

**出口条件**

| # | 硬验收标准 | 验收人 |
|---|---|---|
| 1.1 | `npm install --no-audit --no-fund` 退出码 0；`npm ls` 显示 next@16.3.3、typescript@5.9.2、wrangler@4.131.1、react@19.2.0、react-dom@19.2.0、mediabunny@1.56.1、@mediabunny/aac-encoder@1.56.1 | Implementer |
| 1.2 | 构建前 `node scripts/check-offline.mjs` 退出码 0 | Implementer |
| 1.3 | 第 1 次 `npm run build` 退出码 0；`npm run typecheck` 退出码 0 | Implementer |
| 1.4 | 第 1 次构建后 `node scripts/check-offline.mjs` 退出码 **1**，报错含 `next-env.d.ts: unexpected content at line 4`；构建后的 `next-env.d.ts` 含 `import "./.next/types/root-params.d.ts";` | Implementer |
| 1.5 | 第 2 次 `npm run build` + `npm run typecheck` 退出码 0；第 2 次构建后检查退出码 1，同一报错 | Implementer |
| 1.6 | FV-002 复现：U+2028 + import、U+2029 + declare 两个样本被 `validateNextEnv` **接受**（当前绕过成立） | Implementer |
| 1.7 | FV-003 复现：改动 `next.config.ts` 后调用部署入口，控制流到达 wrangler 调用点（被拦截，**未真正执行**） | Reviewer |
| 1.8 | FV-004 复现：丢回执后重试 → AI 调用 1→2，`completed` 行 2 条，`used` 1→2，含两张截图 | Implementer |
| 1.9 | FV-005 复现：90 秒与 120 秒均抛 `All tracks must specify maximumPacketCount ... fastStart: reserve`；90 秒后 OPFS 残留 0 字节 mp4 与 crswap | Implementer |
| 1.10 | FV-006 复现：全零 PCM WAV 成功产出 MP4，`volumedetect` 的 mean/max ≈ -91 dB | Implementer |
| 1.11 | FV-009 复现：挂起图片连接场景 ≥12 s 无进展，`progress = 0` | Implementer |
| 1.12 | FV-010 复现：60 秒输出 60.010667 s，被裁尾部 5.683673 s 的 RMS ≈ -24.80 dB、峰值 ≈ 0.296 | Implementer |
| 1.13 | FV-007 复现：body reader 异步拒绝时底层 message 被回显；`scenes:[null]` 返回 400 但缺 `stage` | Implementer |
| 1.14 | FV-008 复现：loopback URL 与 `javascript:` sourcePage 进入结果；结果中无 `license`/`licenseUrl` | Implementer |
| 1.15 | 产品代码改动数 = **0** | Scope Guard |
| 1.16 | `evidence/dev/STEP-1/BASELINE-MATRIX.md` 每行含 层级/测试/状态/证据路径/边界 | Implementer |

**禁止**：为了让复现"好看"而修改任何产品代码；用审计目录的结论代替本项目的复现证据。

---

## STEP 2 — 统一修复验收与发布门禁

**进入条件**：STEP 1 出口条件全部满足

**出口条件**

| # | 硬验收标准 | 验收人 |
|---|---|---|
| 2.1 | 第 1 轮：`check-offline`(0) → `build`(0) → `typecheck`(0) → `check-offline`(**0**) | Reviewer |
| 2.2 | 第 2 轮：同上四步全部退出码 0 | Reviewer |
| 2.3 | 21 个冻结文件**逐个**单字节变异 → `verifyWebIntegrity` 全部抛错（21/21 拦截） | Reviewer |
| 2.4 | `validateNextEnv('// c import "untrusted-package";')` 抛错；`validateNextEnv('// c declare const x: any;')` 抛错 | Reviewer |
| 2.5 | 路径穿越、任意包导入、注入声明、重复引用（含 root-params 重复）、ts-nocheck、未知 `///` 指令、UTF-16 → 全部仍抛错 | Reviewer |
| 2.6 | `node --no-warnings tests/verification-fix.mjs` 退出码 0，PASS ≥ 63，FAIL = 0，原 V01–V56 断言文本未被修改（diff 证明） | Reviewer |
| 2.7 | `node --no-warnings tests/release-guards.mjs` 退出码 0，FAIL = 0，原 25 条断言未被修改 | Reviewer |
| 2.8 | 部署场景 A（`next.config.ts` 改动）→ 退出码 1，未到达 `d1 migrations apply` | **Reviewer（必须）** |
| 2.9 | 部署场景 B（`out/` 陈旧，指纹不匹配）→ 退出码 1，未到达 wrangler | **Reviewer（必须）** |
| 2.10 | 部署场景 C（无 verify 记录或 status≠PASS）→ 退出码 1 | **Reviewer（必须）** |
| 2.11 | 部署场景 D（`package-lock.json` 变更）→ 退出码 1 | **Reviewer（必须）** |
| 2.12 | 部署场景 E（全部满足）→ 到达 wrangler 调用点（被拦截），命令顺序为 `d1 migrations apply` 然后 `deploy` | **Reviewer（必须）** |
| 2.13 | 部署场景 F（迁移子进程非零）→ 不执行 `deploy` | **Reviewer（必须）** |
| 2.14 | `npm run deploy:plan` 退出码 0 且不调用 wrangler | Reviewer |
| 2.15 | `node scripts/ui-integrity.mjs` 输出 `18/18 PASS` | Implementer |
| 2.16 | 哈希差异清单**只含**：`scripts/web-integrity.mjs`、`tests/verification-fix.mjs`、`scripts/verify.mjs`、`scripts/deploy-production.mjs`、`tests/release-guards.mjs`（`manifestHash` 常量未变） | Scope Guard |
| 2.17 | 全程未真正执行 wrangler、未创建 `wrangler.resolved.jsonc` 指向真实账号、未进行任何远程 D1 操作 | **Reviewer（必须）** |

**禁止**：为通过 2.1/2.2 而恢复或手写 `next-env.d.ts`、重算基线、放宽 tsconfig、跳过任一负样本。

---

## STEP 3 — 页面任务状态恢复（FV-004）

**进入条件**：STEP 2 出口条件全部满足 **且** 用户批准 A2（RB-1 修改 `apps/web/app/video/page.tsx`）

**出口条件**

| # | 硬验收标准 | 验收人 |
|---|---|---|
| 3.1 | 丢回执后**相同输入**重试：AI 调用次数保持 **1**，`completed` 行保持 **1**，`used` 保持 **1** | **Reviewer** |
| 3.2 | 同一场景下页面**显示出第一次已完成的 Director 结果** | **Reviewer** |
| 3.3 | **变更输入**后点击：产生新 key，AI 调用 2，`used` 2（证明未无脑复用） | Reviewer |
| 3.4 | 页面刷新后同一 session、相同输入再次点击 → 恢复原结果，AI 调用不增加 | Reviewer |
| 3.5 | 跨访客隔离未破坏：另一 guest 用同一 key → 404 | Reviewer |
| 3.6 | 并发同 key 8 请求仍只创建/扣一次 | Reviewer |
| 3.7 | sessionStorage 不可用（隐私模式）时不抛错、页面正常渲染、退回当前行为 | Reviewer |
| 3.8 | `/video` 路由在 初始 / creating / ready 三个状态下截图与改动前**逐像素差异 = 0** | **Reviewer** |
| 3.9 | `apps/web/app/globals.css` sha256 与 `governance/baseline-v0.3.3.2.sha256` 一致 | Scope Guard |
| 3.10 | 浏览器控制台无新增红色 error | Reviewer |
| 3.11 | RB-1 基线更新**只涉及 1 个**冻结文件哈希；其余 20 条逐条未变 | Scope Guard |
| 3.12 | `node scripts/check-offline.mjs` 退出码 0；`node --no-warnings tests/release-guards.mjs` 退出码 0 | Reviewer |
| 3.13 | `TRACEABILITY.json.rebaseline` 含 `旧hash → 新hash → FV-004 → 用户批准时间` | Implementer |
| 3.14 | 未改 `worker/**`、未改 `migrations/**`、未改按钮位置/尺寸/颜色/三语文案 | Scope Guard |

---

## STEP 4 — Workers AI / Director

**进入条件**：STEP 3 出口条件全部满足

**出口条件（无费用部分）**

| # | 硬验收标准 | 验收人 |
|---|---|---|
| 4.1 | 五种时长 × 10 类异常返回（空/对象/字符串/Markdown/截断/错误结构/空场景/空旁白/非法时长/重复 sceneId）全部有确定结果断言 | Reviewer |
| 4.2 | AI 调用次数上限 ≤ 2（主调用 + 一次 repair），无重叠 repair | Reviewer |
| 4.3 | 401/403/429/5xx 各一次失败即停，无无限重试 | Reviewer |
| 4.4 | 超时后不发起新的推理请求 | Reviewer |
| 4.5 | 迟到结果不覆写已退款 / 新 owner 的任务 | Reviewer |
| 4.6 | 明确断言：**不存在**用固定模板把坏 AI 结果补成成功的路径 | **Reviewer** |
| 4.7 | `node --no-warnings tests/regression.mjs` 退出码 0 | Implementer |
| 4.8 | 全部结果标记为 `unit` / `integration-sqlite`，**未**写成"AI PASS" | Scope Guard |

**出口条件（真实 AI 部分）** — 默认 `BLOCKED`

| # | 硬验收标准 | 验收人 |
|---|---|---|
| 4.9 | 已获用户 A5 授权，且授权内容含：账号、固定模型、最大调用次数、最大 token、费用上限 | **User** |
| 4.10 | 五种时长各 1 次真实调用，总调用数 ≤ 授权上限 | Reviewer |
| 4.11 | 每次返回通过 `validateDirector` | Reviewer |
| 4.12 | 实际 token 用量与估算费用已记录且未超授权上限 | **User** |
| 4.13 | 印尼语质量 / 事实准确性：无母语者评审则记 `NOT_RUN`，**不得**由 Claude 自评 PASS | Scope Guard |

---

## STEP 5 — 素材 + F5 + 视频

**进入条件**：STEP 4 无费用部分出口条件满足 **且** 用户批准 A3（RB-1 修改 `video-renderer.ts`）
（真实 AI 部分可并行保持 `BLOCKED`，不阻塞本 STEP）

**出口条件**

| # | 硬验收标准 | 验收人 |
|---|---|---|
| 5.1 | 15 秒连续 2 次成功；每次 ffprobe 退出 0、完整解码退出 0、时长偏差 ≤ 0.1 s、H.264+AAC、`max_volume` > -60 dB、帧中可见真实素材与字幕 | Reviewer |
| 5.2 | 30 秒连续 2 次成功，同 5.1 标准 | Reviewer |
| 5.3 | 60 秒连续 2 次成功，同 5.1 标准 + 旁白完整性检查通过 | **Reviewer** |
| 5.4 | 90 秒连续 2 次成功，同 5.1 标准 + OPFS 分支 + 无残留临时文件 | **Reviewer** |
| 5.5 | 120 秒连续 2 次成功，同 5.4 标准 | **Reviewer** |
| 5.6 | 素材为真实公开 CC0/PDM 图片（非模板/占位），留有来源页与许可证据 | Reviewer |
| 5.7 | 语音为真实本地 Supertonic 3 / F5 印尼语输出（非静音、非占位） | Reviewer |
| 5.8 | 超长真实旁白（65.68 s vs 60 s）→ **明确失败**并返回特定错误码，不再产出静默截断的 MP4 | **Reviewer** |
| 5.9 | 全零 PCM WAV → 抛错，**不产出 MP4**；真实 F5 WAV（RMS ≈ -24 dB）通过；阈值标定记录存在 | **Reviewer** |
| 5.10 | 注入封装失败后 OPFS 无 0 字节 mp4、无 `.crswap` 残留 | Reviewer |
| 5.11 | 挂起图片连接 ≤ 12 s 内失败并回退；正常素材不受影响；无有效视觉素材仍抛 `external_visual_unavailable` | Reviewer |
| 5.12 | FV-007：body reader 拒绝不回显底层 message；所有 API 失败含 `stage` + `requestId` | Reviewer |
| 5.13 | FV-008：loopback / `javascript:` / `data:` 被拒；结果含 `license`/`licenseUrl`/`sourcePage`/`author`；真实 Wikimedia 样本仍通过 | Reviewer |
| 5.14 | RB-1 基线更新**只涉及 1 个**冻结文件哈希（`video-renderer.ts`）；其余 20 条未变 | Scope Guard |
| 5.15 | `node scripts/check-offline.mjs` 退出码 0；`tests/release-guards.mjs` 退出码 0；`tests/regression.mjs` 退出码 0 | Reviewer |
| 5.16 | 未关闭 OPFS、未删除任何时长选项、未缩短用户选择的时长、未新增可见控件 | **Scope Guard** |
| 5.17 | 未升级 mediabunny 或任何依赖版本 | Scope Guard |

---

## STEP 6 — 三语 / PWA / 视觉 / 设备

**进入条件**：STEP 5 出口条件全部满足

**出口条件**

| # | 硬验收标准 | 验收人 |
|---|---|---|
| 6.1 | `node scripts/ui-integrity.mjs` 输出 `18/18 PASS` | Implementer |
| 6.2 | 除 RB-1 批准的 2 个文件外，其余 19 个冻结文件 sha256 与接管基线**完全一致** | Scope Guard |
| 6.3 | 被 RB-1 修改的 2 个文件对应路由截图与 v0.3.3.2 原版**逐像素差异 = 0** | **Reviewer** |
| 6.4 | 4 条路由 × 3 种语言（id/en/zh）均可渲染，控制台无红色 error | Reviewer |
| 6.5 | 语言切换跨页面保持；默认语言为 Bahasa Indonesia；语言顺序 id → en → zh | Reviewer |
| 6.6 | 两条固定文案逐字存在于 `apps/web/app/page.tsx` | Scope Guard |
| 6.7 | `manifest.webmanifest`、`sw.js` sha256 未变 | Scope Guard |
| 6.8 | Android / iPhone 真机：未提供设备则记 `NOT_RUN`；**禁止**用桌面浏览器或 devtools 模拟冒充通过 | **Scope Guard** |
| 6.9 | 手机本地 TTS：未测则记 `NOT_RUN` | Scope Guard |
| 6.10 | 母语者听感 / 逐词字幕同步：未做则记 `NOT_RUN` | Scope Guard |

---

## STEP 7 — Release Candidate

**进入条件**：STEP 6 出口条件全部满足

**出口条件**

| # | 硬验收标准 | 验收人 |
|---|---|---|
| 7.1 | 产出**一个**完整 RC，不产出零碎补丁包 | Implementer |
| 7.2 | `governance/baseline-rc.sha256` 记录 RC 全树哈希 | Implementer |
| 7.3 | `CHANGELOG.md` 每条含：日期、任务 ID、修改文件、完成内容、验证命令、风险说明 | Implementer |
| 7.4 | `TRACEABILITY.json` 中 FV-001…FV-010 全部有终态（`fixed` / `open` / `deferred`）与证据路径 | Implementer |
| 7.5 | 所有标记 `PASS` 的项均满足证据七元组 | **Reviewer** |
| 7.6 | 由**非本次修改作者**独立复跑 STEP 2 / 3 / 5 的全部 Completion Gate 并给出书面结论 | **Independent Reviewer** |
| 7.7 | 若无独立 Reviewer → 整个 RC 标记 `REVIEW_PENDING`，**闸门不通过** | Scope Guard |

---

## STEP 8 — 生产发布

**进入条件**：STEP 7 出口条件全部满足 **且** 用户明确批准 A8

**出口条件**

| # | 硬验收标准 | 验收人 |
|---|---|---|
| 8.1 | 生产 D1 已备份，备份可恢复性已确认 | **User** |
| 8.2 | 旧 writer 已停止，在途请求已结束 | **User** |
| 8.3 | 生产迁移通过 Wrangler 账本执行；`0001` 不重复裸执行；`0002` 仅 apply 一次 | **User** |
| 8.4 | 迁移退出码 0；失败则**不执行** deploy | **User** |
| 8.5 | `deploy` 退出码 0 | **User** |
| 8.6 | `https://freevideo.eco-velo.com` 上：默认 Bahasa Indonesia、两条固定文案存在、四条路由可达 | **User** |
| 8.7 | 生产环境 15/60/120 秒各至少 1 次真实成功导出 | **User** |
| 8.8 | 最终业务验收结论由用户给出 | **User** |

**Claude 不得自行执行 8.1–8.8 中的任何一步。**
