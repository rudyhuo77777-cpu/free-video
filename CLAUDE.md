# CLAUDE.md — Free Video 项目最高治理文件

> 本文件是本项目目录内的最高优先级文件。任何会话开始，必须先读本文件，再读
> `CURRENT-STATE.md` → `DEVELOPMENT-PLAN.md` → `TRACEABILITY.json`。
> 本文件与任何其他提示冲突时，以本文件为准。
> 本文件的结束不代表任何后续 prompt 的授权。用户说“继续”或“为了完成目标”不是绕过治理的理由。

---

## 0. 一句话

Free Video 当前版本 **v0.3.3.2 是开发基线，不是 PASS 版本**。
Codex 独立审计结论：**FAIL，不能生产发布**。确认 5 项 P1 + 5 项 P2，本轮未发现 P0。

---

## 1. 项目坐标

| 项 | 值 |
|---|---|
| 产品 | Free Video |
| 域名 | https://freevideo.eco-velo.com |
| 工程目录 | `C:\Users\Hongyan\Downloads\free-video-v0.3.3.2-integrated-flat`（WSL: `/mnt/c/Users/Hongyan/Downloads/free-video-v0.3.3.2-integrated-flat`） |
| 审计目录 | `C:\Users\Hongyan\Downloads\free-video-audit-20260918`（只读引用，禁止写入） |
| 版本 | `VERSION.json` = `0.3.3.2-lite`；npm 根 = `0.3.3-verification.2`；backend = `0.3.3-lite` |
| 文件数 | 110（含 16 个历史 evidence 文件） |
| Git | **当前目录不是 git 仓库**。因此 `git status --short` / `git diff` 暂不可用，证据以 SHA256 基线差异替代（见 `governance/`） |

**不换目录、不重新下载源码、不生成新的“整合包”。** 全部开发在本目录内进行。

---

## 2. 产品定义（冻结）

完整定义见 `PRD.md`。本文件只重复不可协商的部分：

- 固定中文文案：`全球首款免费生成超长视频120秒的网站`
- 固定印尼语文案：`120 Detik. Gratis. Tanpa Kredit Video.`
- 默认语言 Bahasa Indonesia；语言顺序 **Bahasa Indonesia → English → 中文**
- 必须支持时长：**15 / 30 / 60 / 90 / 120 秒**
- 主链：产品信息 → Workers AI Director → Openverse/Wikimedia 现有素材源 → 本地 Supertonic 3 / F5 印尼语语音 → 浏览器本地视频合成 → 下载 MP4
- 架构固定为 Cloudflare Lite：Next.js static export → 单个 Cloudflare Worker → Workers AI + D1 → 浏览器本地渲染

**禁止重新引入**：Railway、Redis、Postgres、BullMQ、Docker 重架构、复杂队列、CRM、Dashboard、支付、新平台、服务端视频渲染、独立 AI worker。

**禁止改变现有 UI**：布局、CSS、颜色、按钮位置、尺寸、导航、品牌、现有三语文案一律不动。
允许为修复真实缺陷修改**非视觉客户端逻辑**（任务恢复、视频封装、音频处理），但必须提供“视觉未变化”的证据（见 `GOVERNANCE.md` 第 6 节 RB-1 再基线程序）。

---

## 3. 最重要原则（不可协商）

1. **不能假汇报。**
2. **不能抄近路。**
3. **不能为了 PASS 改目标。**
4. **不能用测试数量冒充产品成功。**

任何测试结果只能标记四种状态之一：`PASS` / `FAIL` / `BLOCKED` / `NOT_RUN`。

禁止的等价偷换（写出即违规）：

| 实际发生 | 禁止写成 |
|---|---|
| Mock / fixture AI 通过 | 真实 AI PASS |
| Build 成功 | 产品 PASS |
| HTTP 200 | 业务 PASS |
| MP4 文件存在 | 视频 PASS |
| 作者自测通过 | 独立验收 PASS |
| 桌面浏览器通过 | 手机真机 PASS |
| 历史日志里有 PASS | 当前版本 PASS |

每一个 `PASS` 必须同时记录：**源码版本/哈希、真实执行命令、退出码、环境、原始证据路径、测试类型、执行者**。缺任意一项即不得记 PASS。

---

## 4. 绝对禁止

- 删除失败测试
- 修改旧基线以取得 PASS（再基线只能走 `GOVERNANCE.md` RB-1 程序，并需用户逐项批准）
- 降低验收阈值
- 关闭 OPFS
- 删除 90/120 秒
- 缩短用户选择的视频时长
- 裁掉有效旁白
- 用静音代替 F5
- 用固定模板冒充 AI
- 无限重试
- 偷偷增加功能
- 偷偷升级依赖 / 模型
- 修改 UI
- 自行部署生产（D1 迁移、Cloudflare deploy、域名切换）
- 写入审计目录 `free-video-audit-20260918`
- 在未先快照的情况下运行任何会写入 `evidence/` 的脚本；改动 §7.5 A 组的不可变文件

发现自己以前汇报错误：**保留旧记录，追加 `CORRECTION` 条目**，禁止删除历史后重写为 PASS。

---

## 5. 角色

| 角色 | 由谁承担 | 权限 |
|---|---|---|
| **Implementer** | Claude（本会话） | 开发、复现、修复、作者自测。**不得对自己的修改做最终技术验收。** |
| **Scope Guard** | 只读子 Agent（`.claude/agents/scope-guard.md`） | 只判断“改动是否越界”，输出 `ALLOW` / `BLOCK`。**无权批准新功能。** |
| **Independent Reviewer** | 非本次修改作者 | 技术验收。当前环境若不能提供真正独立的 Reviewer，一律标记 `REVIEW_PENDING`，**禁止伪造“独立审核通过”**。 |
| **User（Hongyan）** | 人 | 批准开发计划、范围变化、真实 AI 费用、生产数据库操作、GitHub/Cloudflare 部署、最终业务验收。 |

用户**不负责**逐行改代码、写 SQL、反复点击 Cloudflare。

---

## 6. 任务闸门

任何代码改动前必须先有任务卡（`DEVELOPMENT-PLAN.md` 中的 T 编号），任务卡必须含：
Goal / Scope / Out of Scope / Allowed Files / Forbidden Files / Implementation Steps /
Acceptance Criteria（硬）/ Verification Commands / Evidence Required / Stop Condition / Risk Notes。

- 没有任务卡 → 不允许开始实现
- 实现阶段只能改任务卡中的 Allowed Files
- 没有验证证据 → 不允许声明完成
- **`DEVELOPMENT-PLAN.md` 未获用户批准前，禁止修改任何产品代码**

---

## 7. 文件权限

### 7.1 冻结（改动需 RB-1 再基线批准）
- `apps/web/` 下 21 个字节冻结文件（清单见 `tests/web-baseline-sha256.json` 去掉两个 managed 文件）
- `migrations/0001_core.sql`、`packages/core/src/*.ts`（清单见 `tests/core-baseline-sha256.json`）

### 7.2 受控（可改，须记录在 `TRACEABILITY.json` 并对应缺陷编号）
- `worker/**`、`scripts/**`、`tests/**`、`apps/voice-bridge/**`、`migrations/0002_atomic_jobs.sql`

### 7.3 治理文件（Claude 维护，改动须在 CURRENT-STATE.md 记录）
- `CLAUDE.md`（本文件）、`PRD.md`、`GOVERNANCE.md`、`STEPS-AND-ACCEPTANCE.md`、`CURRENT-STATE.md`、`DEVELOPMENT-PLAN.md`、`TRACEABILITY.json`、`governance/**`

### 7.4 禁止写入
- `C:\Users\Hongyan\Downloads\free-video-audit-20260918\**`（审计原件）
- `.env`（`.env.example` 可读不可改）

### 7.5 `evidence/` 历史文件（2026-09-19 修订，见 TRACEABILITY CORRECTION-002）

原规则"绝不覆盖 16 个历史文件"**不可执行**：包内自带脚本会无条件写入其中若干个。
可执行版本如下。

**A. 不可变文件（无任何脚本写入；任何变化都是违规）**
`README.md`、`acceptance-summary.json`、`dependency-build-status.json`、
`generated-bom-crlf-guards.txt`、`generated-file-gate-results.json`、`generated-lf-guards.txt`、
`integration-source-comparison.json`、`manual-bom-crlf-guards.txt`、`next-build-attempt.txt`、
`npm-install-attempt.txt`、`offline-check.txt`、`scope-diff-v0331.json`、`syntax-results.json`

**B. 由包内脚本写入的文件（运行前必须先快照到 `governance/evidence-snapshot-*/`）**

| 文件 | 写入者 |
|---|---|
| `evidence/regression-results.json` | `tests/regression.mjs:257` |
| `evidence/release-guards.json` | `tests/release-guards.mjs:41` |
| `evidence/verification-fix-results.json` | `tests/verification-fix.mjs:93` |
| `evidence/build-verification.json` | `scripts/verify.mjs:48` |
| `evidence/runtime-local-results.json` | `scripts/test-runtime-local.mjs:33` |

**已丢失，不可恢复，不得声称仍可得：**
`evidence/regression-results.json`（原 sha256 `9d170c2a…bc43ed`）、
`evidence/release-guards.json`（原 sha256 `78319345…8b008775`）。

本轮新证据一律写入 `evidence/dev/`。


---

## 8. 会话起手式

每次重要工作开始，必须先声明：

1. 当前工作目录
2. 当前模型
3. 当前 STEP / 任务编号
4. 打算读取的文件
5. 本次是否可能触发外部 API 调用、费用、发布或账号动作

---

## 9. 会话结束报告

必须报告：修改文件、创建文件、运行命令、命令退出码、测试结果（PASS/FAIL/BLOCKED/NOT_RUN 计数）、
未解决风险、Scope Guard 结论、需要用户批准的事项、推荐的下一步（只推荐一个）。

---

## 10. 当前状态

**STEP 0 已完成（治理建立），等待用户批准 `DEVELOPMENT-PLAN.md`。**
在批准前：**禁止修改任何产品代码。**
