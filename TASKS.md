# TASKS.md — Free Video 任务台账

> 更新时间：2026-09-20
> 唯一状态词汇：`PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` / `SELF_TESTED` / `REVIEW_PENDING` / `ACCEPTED`
> `SELF_TESTED` ≠ 验收。`ACCEPTED` 只能由非作者 Reviewer 写入，Implementer 禁止自行标记。
> 详细任务卡在 `DEVELOPMENT-PLAN.md`；证据索引在 `TRACEABILITY.json`。

---

## STEP 进度总览

| STEP | 内容 | 状态 | Scope Guard |
|---|---|---|---|
| STEP 0 | 接管、治理体系、开发计划 | 完成 | — |
| STEP 1 | 完整复现现状（不改代码） | 完成 | — |
| STEP 2 | 统一修复验收与发布门禁 | **SELF_TESTED** / REVIEW_PENDING | ALLOW |
| STEP 3 | 页面任务状态恢复（FV-004） | **SELF_TESTED** / REVIEW_PENDING | BLOCK → 撤销 → 复裁 ALLOW |
| STEP 3G | 两个治理漏洞修复（CR-001） | **SELF_TESTED** / REVIEW_PENDING | ALLOW |
| STEP 4 | Workers AI（仅零费用部分） | **FIXTURE_AI PASS**（SELF_TESTED） | ALLOW |
| CR-002 | FV-010 根因修复 | **SELF_TESTED** / REVIEW_PENDING | **ALLOW**（2026-09-20） |
| STEP 5 | 素材 + F5 + 视频 | **SELF_TESTED** / REVIEW_PENDING | **ALLOW**（2026-09-20） |
| CR-003 | OBS-006 链式批准推导（A9） | **SELF_TESTED** / REVIEW_PENDING | **ALLOW**（2026-09-20） |
| CR-004 | FV-010 三语文案 | **作废**（用户 2026-09-20 否决） | — |
| OBS-007 | H.264 编码器单次回退（RB-1-003 / A10） | **SELF_TESTED** / REVIEW_PENDING | 单独看 **ALLOW**（整批因 GA-002 判 BLOCK） |
| OBS-008 | SW 离线承诺修复（RB-1-004 / A12） | **SELF_TESTED** / REVIEW_PENDING | **ALLOW**（2026-09-20） |
| HW-REG-001 | Windows 硬件 H.264 路径回归 | **PASS**（SELF_TESTED）/ REVIEW_PENDING | **ALLOW**（2026-09-20） |
| GA-002 | OBS-006 第二层根因：B3 链式化 | **REVIEW_PENDING**（A11 post-hoc 限定授权；作者不得自签关闭） | **BLOCK**（2026-09-20），保留在案 |
| STEP 6 | 三语 / PWA / 视觉 / 设备 | **部分 SELF_TESTED**（本地只读 14/15）/ REVIEW_PENDING；设备项 NOT_RUN | 本窗口无产品改动 |
| STEP 7 | Release Candidate + 独立复验 | **未开工** | — |
| STEP 8 | 生产发布 | **BLOCKED**（A8 = DENIED） | — |

---

## 十项 Codex 缺陷

| 缺陷 | 级别 | 复现 | 修复 | 验收 | 落点 |
|---|---|---|---|---|---|
| FV-001 | P1 | PASS | SELF_TESTED | REVIEW_PENDING | `scripts/web-integrity.mjs` |
| FV-002 | P1 | PASS | SELF_TESTED | REVIEW_PENDING | `scripts/web-integrity.mjs` |
| FV-003 | P1 | PASS | SELF_TESTED | REVIEW_PENDING | `scripts/deploy-production.mjs`、`scripts/verify.mjs` |
| FV-004 | P1 | PASS | SELF_TESTED | REVIEW_PENDING | `apps/web/app/video/page.tsx`（RB-1-001） |
| FV-005 | P1 | PASS | SELF_TESTED | REVIEW_PENDING | `apps/web/lib/client/video-renderer.ts`（RB-1-002） |
| FV-006 | P2 | PASS | SELF_TESTED | REVIEW_PENDING | 同上 |
| FV-007 | P2 | PASS | SELF_TESTED | REVIEW_PENDING | `worker/index.js` |
| FV-008 | P2 | PASS | SELF_TESTED | REVIEW_PENDING | `worker/index.js` |
| FV-009 | P2 | PASS | SELF_TESTED | REVIEW_PENDING | `apps/web/lib/client/video-renderer.ts` |
| FV-010 | P2 | PASS | SELF_TESTED | REVIEW_PENDING | 同上 + `worker/director.js`（CR-002 根因） |

**10/10 复现，10/10 修复（作者自测），0 项验收。**

---

## 待办（按优先级）

### P0 — 已解除
1. ~~**OBS-006**~~ —— 2026-09-20 按 A9 修复（CR-003 / GA-001）。检查器 `VIOLATIONS=0`；反向测试 14/14，R3 与 R6 由 BLOCK 变 ALLOW，原有 7 个 BLOCK 场景未翻转。状态 `SELF_TESTED`。
2. ~~**STEP 5 / CR-002 / CR-003 的 Scope Guard 裁定**~~ —— 2026-09-20 只读子 Agent 裁定 **ALLOW**，无 BLOCK 项。它提出的观察项（CR-003 未登记进 `changeRequests`）已按 CR-001 先例补登。裁定**不等于验收**，三者仍为 `SELF_TESTED / REVIEW_PENDING`。

### P1 — 等用户决策
3. ~~**FV-010 错误文案**~~ —— 用户 2026-09-20 **否决**（CR-004 作废）：治理与再基线成本超过该 UI 提示本身的价值。`narration_exceeds_duration` 继续显示英文标识符，作为已知缺口留在册（风险 R5）。
4. **批准 ID 冲突**：本次 A9（批准改 `scope-guard-check.mjs`）与 `DEVELOPMENT-PLAN.md` §12 既有 A9（确认 FV-010 报错为期望行为）**同号不同义**。未自行改号，**等用户裁决编号处置**。
5. **A6 真机**：未提供 Android / iPhone → STEP 6 设备项将记 `NOT_RUN`。
6. **A7 母语者**：未提供印尼语母语者 → 语音质量项与印尼语自然度记 `NOT_RUN`。

### P2 — 可继续的开发
7. **STEP 6**：三语跨页面同步、PWA、视觉终验（19 个未再基线冻结文件逐项核对）。
8. **STEP 7**：RC 打包 + 非作者独立复验。

### 永久阻断（用户已明确拒绝）
- **A4** `git init` = DENIED
- **A5** 真实收费 Workers AI = DENIED
- **A8** 生产 D1 迁移 / Cloudflare 部署 = DENIED

---

## 未完成的验收（按 `STEPS-AND-ACCEPTANCE.md`）

| 编号 | 内容 | 状态 | 缺什么 |
|---|---|---|---|
| 2.8–2.14、2.17 | 发布门禁场景 A–F 独立复验 | REVIEW_PENDING | 非作者 Reviewer |
| 3.1–3.14 | FV-004 各项 | REVIEW_PENDING | 同上 |
| 4.9–4.13 | 真实云端 AI | **BLOCKED** | A5 授权 |
| 5.1–5.17 | 视频层各项 | REVIEW_PENDING | 非作者 Reviewer |
| 6.1–6.7 | 三语 / PWA / 视觉 | **NOT_RUN** | STEP 6 未开工 |
| 6.8–6.10 | 真机、手机 TTS、母语者听审 | **NOT_RUN** | A6 / A7 |
| 7.1–7.7 | RC 与独立复验 | **NOT_RUN** | STEP 7 未开工 |
| 8.1–8.8 | 生产发布 | **BLOCKED** | A8 授权 |
| — | 真实 D1 底层 I/O 故障注入 | **NOT_RUN** | 本轮未执行 |
| — | 磁盘 `showSaveFilePicker` 流程 | **NOT_RUN** | 需 GUI 交互 |
| — | 取消操作与内存峰值/泄漏验收 | **NOT_RUN** | 未执行 |
| — | 逐词字幕 / 语音对齐听审 | **NOT_RUN** | A7 |
| — | 可选 Pixabay / Pexels 真实账号 | **NOT_RUN** | 需账号 |

---

## 2026-09-20 追加

**治理冻结**（用户裁决）：CR-003 完成后不再新增治理文件、Agent、审批层、检查框架或新的治理功能。精力回到产品。

**当日产品门禁复验**（当前代码状态实测，非引用昨日结果）：

| 命令 | 结果 |
|---|---|
| `node scripts/ui-integrity.mjs` | 18/18 PASS，exit 0 |
| `node scripts/web-integrity.mjs` | 21/21 字节一致 + 2/2 内容校验，exit 0 |
| `npm run check:offline` | exit 0 |
| `npm test` | REGRESSION 95/95、RELEASE GUARDS 36/36、VERIFICATION FIX 74/74，exit 0 |
| `npm run verify` | exit 0（BUILD + TYPECHECK + 构建前/后 offline 检查齐全） |

以上全部是**夹具 AI / 本地门禁**，不是真实云端 AI、不是真机、不是独立验收。

**CR-002 语速分布已补记**（`evidence/dev/CR-002/C2-2/rate-distribution.json`）：21 个实测样本，词/秒 2.1028–3.6145，均值 2.4917，标准差 0.3567。产品实际形态 long-form-multi 为 2.1935±0.0381。预算 1.8925 对最慢实测留 11.1% 余量。

---

## 2026-09-20 第二窗口（约 100 分钟连续开发）

**目标**：OBS-007 最小 H.264 回退修复 + STEP 5 已批准范围内的 FV-005～FV-010 闭合。

| 项 | 结果 |
|---|---|
| `governance/repro/fv005-010-fix-verify.mjs` | **9/9 PASS**，exit 0（修复前 8 FAIL / 1 PASS） |
| 15/30/60/90/120 秒 × 各 2 次真实出片 | **10/10 成功**，ffprobe 逐个核验通过 |
| 分辨率 / 帧数 | 与修复前**完全一致**，无降级 |
| 视觉未变化 | 三态逐字节相同；`globals.css` 未变 |
| `npm test` | 95/95 + 36/36 + 74/74 |
| `npm run verify` / `check:offline` / `typecheck` / `build` | 全 exit 0 |
| `scope-guard-check` | `VIOLATIONS=0`；B3 链 `RB-1-002 → RB-1-003`；B4 链 `RB-1-001 → RB-1-002 → RB-1-003` |
| 反向测试 | **16/16 PASS**（新增 R12 / R13） |

**窗口内自行纠正的问题**（未停下询问，符合窗口规则）：
1. OBS-006 第二层根因 —— B3（`frozenApproval`）同样是单跳，RB-1-003 落地后误报。已用同一 `deriveChain` 修复，记 GA-002（A9 范围内）。
2. 我先前「本机 AAC 不可用，验收只能在 Windows 跑」的判断**错误**，已作废并更正。
3. 我先前写的验收标准「成功用例 `opfsLeftovers` 必须为空」**错误** —— OPFS 就是 90/120s 的产物存放处，昨日 Windows 成功用例同样有该条目。正确判据是 harness 的「无 `.crswap`、无 0 字节」。

**FV-005～FV-010 当前状态**：10/10 修复在位，本机真实出片链路**全部跑通**，状态仍为 `SELF_TESTED / REVIEW_PENDING`（缺非作者 Reviewer）。

---

## 2026-09-20 第三窗口（证据保护 + A11 登记 + STEP 6 本地只读）

### 产品实测结果（分层，不做总数概括）
| 层级 | 套件 | 结果 |
|---|---|---|
| 冻结完整性 | 19 个未再基线冻结文件 vs 接管基线 | **19/19 逐字节一致** |
| 冻结完整性 | `ui-integrity` / `web-integrity` | 18/18 ｜ 21/21 + 2/2 |
| 三语 | 4 路由 × 3 语言渲染 / 跨页保持 / 刷新保持 / 默认语言 / 两条固定文案 | **5/5 PASS** |
| PWA | 本地注销、非本地注册激活、预缓存建立、缓存填充 | **3 PASS / 1 FAIL**（FAIL = OBS-008） |
| 离线 | 断网导航 `/`、`/video`、恢复网络 | **3/3 PASS** |
| 页面行为 | `/projects`、`/fyp-local.html` | **2/2 PASS** |
| STEP 6 合计 | — | **15 项：14 PASS / 1 FAIL** |

### Scope 决定
- OBS-007 / RB-1-003 / A10：Scope Guard 单独裁定 **ALLOW**
- GA-002：Scope Guard 裁定 **BLOCK**，保留在案；用户 A11 给出 post-hoc 一次性限定授权，状态 **REVIEW_PENDING**
- 本窗口零产品代码改动，`scope-guard-check` `VIOLATIONS=0`、退出码 2（合法值）

### 独立技术验收状态
**全部 REVIEW_PENDING。0 项 ACCEPTED。** 无非作者 Reviewer。作者不得自签关闭 GA-002。

### 证据缺失
1. 2026-09-19 Windows 12 条 MP4 二进制**已丢失**，仅存 ffprobe 核验记录（CORRECTION-005）
2. **修复后的硬件 H.264 路径回归未做** —— 本轮 10 条均为软件路径，不能替代
3. 真实云端 AI、手机真机、印尼语母语者听审：**从未执行**

### 剩余阻断
- A5 真实收费 AI = DENIED ｜ A6 真机未提供 ｜ A7 母语者未提供 ｜ A8 生产部署 = DENIED ｜ A4 git init = DENIED
- GA-002 独立复审未完成
- OBS-008（SW 缓存未填充）未修复，等用户决定

---

## 2026-09-20 第四窗口（OBS-008 + Windows 硬件回归）

### OBS-008：**SELF_TESTED**
根因实证：`res.clone()` 写在异步回调内，`Response body is already used` 被 catch 吞掉，document/script 缓存写入全部静默失败。
四项最小修复后三层分离验收 **8/8 PASS**：SW Cache Storage 由 **2 条增至 17 条**（含 `/`、`/video`、CSS、11 个 JS chunk）；**HTTP 缓存禁用 + 完全断网**下 `/` 与 `/video` 均打开真实页面（非错误页/空白页，默认印尼语，导航完整）；旧 cache 已清除；Console 无新增错误。
基线更新 2 处（`ui-integrity.mjs` 不含 sw.js）。manifestHash 链达四跳并正确解析。

### Windows hardware path：**PASS**（SELF_TESTED）
Windows HeadlessChrome + Intel Arc 140V。`prefer-hardware` 实测 true，**未错误进入 fallback**。
15/30/60/90/120 秒 × 各 2 次 = **10/10 成功**；ffprobe 10/10 通过；分辨率/帧率/时长无退化；原生 AAC 48000Hz；有效旁白完整。
**10 个产物字节数与 2026-09-19 原硬件运行逐一相同** —— 佐证走的是硬件路径且 OBS-007 修复未影响该路径。

### Scope 状态
本窗口裁定 **ALLOW**，无 BLOCK 项。GA-002 **保持 REVIEW_PENDING**，Scope Guard 原 BLOCK 记录未被改写。

### 独立 Reviewer 状态
**仍无。全部 REVIEW_PENDING，0 项 ACCEPTED。**

### 剩余真正阻断项
- GA-002 独立复审未完成（作者不得自签关闭）
- A5 真实收费云端 AI = DENIED；Director 语义质量从未被真实模型验证
- A6 手机真机未提供；A7 印尼语母语者听审未提供
- A8 生产部署 = DENIED；A4 git init = DENIED
- 2026-09-19 Windows 12 条 MP4 原始二进制已丢失（CORRECTION-005），仅存核验记录
