# GOVERNANCE.md — Free Video 治理规则

> 适用范围：本目录内一切开发活动。
> 与 `CLAUDE.md` 冲突时以 `CLAUDE.md` 为准；本文件是 `CLAUDE.md` 的执行细则。

---

## 1. 状态词汇（唯一合法的四个值）

| 状态 | 定义 | 允许使用的条件 |
|---|---|---|
| `PASS` | 该行所述**那一层**的验收条件被真实满足 | 必须有完整证据七元组（见 §2） |
| `FAIL` | 验收条件被真实执行且未满足 | 必须有失败输出与退出码 |
| `BLOCKED` | 前提条件不具备（权限、费用、账号、设备），无法执行 | 必须写明缺什么、需要谁批准 |
| `NOT_RUN` | 本轮未执行 | 必须写明为什么没跑，以及何时应跑 |

**没有第五种状态。** 禁止 “基本通过”“大致可用”“已修复”“应该没问题”。

### 1.1 层级不可外推

- `PASS` 只对该行所述层级有效
- 禁止计算“全站通过率”“成功率百分比”来代替验收
- 禁止用通过条数暗示产品成功

### 1.2 禁止的等价偷换

| 实际 | 禁止写成 |
|---|---|
| fixture / mock AI 通过 | 真实 AI PASS |
| `npm run build` exit 0 | 产品 PASS |
| `curl` 返回 HTTP 200 | 业务 PASS |
| MP4 文件存在 / 大小 > 0 | 视频 PASS |
| ffprobe 能读出时长 | 旁白完整 PASS |
| 存在 AAC 轨 | 有声 PASS |
| 作者自测 | 独立验收 PASS |
| headless Chrome 通过 | 手机真机 PASS |
| 历史 evidence 里写着 PASS | 当前版本 PASS |

---

## 2. 证据七元组（每个 PASS 必备）

任何 `PASS` 必须在 `evidence/dev/` 下留档，并在 `TRACEABILITY.json` 引用，包含：

1. **源码版本/哈希** — `governance/baseline-*.sha256` 对应条目，或当次全树哈希
2. **真实执行命令** — 原样可复制的命令行
3. **退出码** — 整数
4. **环境** — OS、Node、npm、浏览器、ffmpeg 版本
5. **原始证据路径** — 日志 / JSON / 截图 / MP4 的相对路径
6. **测试类型** — `structural` / `unit` / `integration-sqlite` / `integration-workerd` / `browser-headless` / `browser-real-device` / `real-cloud-ai` / `manual`
7. **执行者** — `Implementer(Claude)` / `Reviewer(<name>)` / `User`

缺任意一项 → 该项不得记 `PASS`，降级为 `NOT_RUN` 并说明缺哪一项。

---

## 3. 绝对禁止行为

1. 删除失败测试
2. 修改旧基线以取得 PASS（再基线只能走 §6 的 RB-1）
3. 降低验收阈值（包括放宽 tsconfig、放宽断言、缩小检查范围）
4. 关闭 OPFS 分支
5. 删除 90 / 120 秒时长选项
6. 缩短用户选择的视频时长
7. 裁掉有效旁白（有效 = 非静音，RMS 高于明确阈值）
8. 用静音 WAV 代替 F5 输出
9. 用固定模板输出冒充 AI 结果
10. 无限重试 / 隐式重试放大费用
11. 偷偷增加功能
12. 偷偷升级依赖或 AI 模型
13. 修改 UI（见 `PRD.md` §4）
14. 自行执行生产 D1 迁移、Cloudflare deploy、DNS/域名操作
15. 写入审计目录 `free-video-audit-20260918`
16. 在未先快照的情况下运行任何会写入 `evidence/` 的脚本；改动 `CLAUDE.md` §7.5 A 组的不可变文件（2026-09-19 按 CORRECTION-002 修订；原表述『覆盖既有 16 个历史文件』不可执行）
17. 在报告中使用 `CLAUDE.md` §3 表格里被禁止的等价说法

---

## 4. 纠错纪律（CORRECTION）

发现自己此前的汇报错误时：

- **保留**原记录，不删除、不改写
- 在 `CURRENT-STATE.md` 与 `TRACEABILITY.json` 追加一条 `CORRECTION` 条目，写明：
  原结论 / 实际情况 / 发现时间 / 发现方式 / 影响到的验收项 / 重跑结果
- 被纠正的验收项状态回退为 `NOT_RUN` 或 `FAIL`，需重新取证后才能再次标记

**禁止**：删掉历史记录后重新写成 PASS。

---

## 5. 角色与职责边界

### 5.1 Implementer（Claude，本会话）
- 可做：读代码、复现、写任务卡、按批准的任务卡改代码、作者自测、写证据
- 不可做：对自己的修改做最终技术验收；批准范围变更；执行真实 AI 付费调用；执行生产操作

### 5.2 Scope Guard（只读子 Agent）
- 唯一职责：**防扩展**
- 输入：改动清单（文件 + diff 摘要）
- 判据：每条改动必须能映射到以下三者之一
  1. `PRD.md` 中的明确需求
  2. `TRACEABILITY.json` 中的 Codex 缺陷编号（FV-001 … FV-010）
  3. 用户明确批准的 Change Request（`CR-xxx`）
- 输出：`ALLOW` 或 `BLOCK`（含理由与对应编号）
- **无权批准新功能**；遇到不确定一律 `BLOCK`
- 只读：不得修改任何文件

### 5.3 Independent Reviewer
- 必须**不是**该修改的作者
- 若当前环境无法提供真正独立的 Reviewer → 状态一律 `REVIEW_PENDING`
- **禁止伪造“独立审核通过”**；Implementer 自评只能写 `self-test PASS`，不能写 `accepted`

### 5.4 User（Hongyan）
批准：总体开发计划、范围变化、真实 AI 费用、生产数据库操作、GitHub/Cloudflare 部署、最终业务验收、RB-1 再基线。
不负责：逐行改代码、写 SQL、反复点击 Cloudflare。

---

## 6. RB-1：受控再基线程序（唯一合法的基线变更途径）

冻结文件（`PRD.md` §4 的 21 个 + `tests/core-baseline-sha256.json` 的 6 个）一旦被修改，
以下四处校验会同时失败，**必须一并、显式、经批准地更新**：

| # | 位置 | 内容 |
|---|---|---|
| 1 | `scripts/ui-integrity.mjs` | 18 条硬编码 sha256 |
| 2 | `tests/web-baseline-sha256.json` | 23 条 sha256 |
| 3 | `scripts/web-integrity.mjs:13` `manifestHash` | 上一文件自身的 sha256 |
| 4 | `tests/core-baseline-sha256.json` | 6 条 sha256（仅涉及 core/migration 时） |

### RB-1 步骤（缺一不可）

1. **申请**：写明文件、对应 FV/CR 编号、为什么必须改这个文件、有没有不改冻结文件的替代方案
2. **用户逐文件批准**（记录在 `TRACEABILITY.json` 的 `rebaseline` 段，含批准时间）
3. **改代码**（只改批准的文件、只改批准的行为）
4. **视觉未变化取证**：
   - `apps/web/app/globals.css` 字节未变（sha256 比对）
   - 受影响路由在相同状态下的渲染截图，与改动前逐像素比较，差异为 0
   - 浏览器控制台无新增红色 error
5. **更新上表 4 处基线**，每条记录 `旧hash → 新hash → 原因 → FV编号 → 批准时间`
6. **重跑**：`node scripts/check-offline.mjs`、`node tests/release-guards.mjs`、`node tests/verification-fix.mjs` 全部 exit 0
7. **写入** `CURRENT-STATE.md` 与 `TRACEABILITY.json`

### RB-1 禁止事项
- 禁止由任何脚本**自动重算**基线后放行
- 禁止“顺手”把其他文件的哈希一起更新
- 禁止在没有视觉比对证据时更新 UI 相关哈希

---

## 7. 费用与外部动作闸门

| 动作 | 默认 | 解锁条件 |
|---|---|---|
| 真实 Workers AI 推理 | **BLOCKED** | 用户书面授权，且明确：账号、固定模型、最大调用次数、最大 token、费用上限 |
| 真实生产 D1 迁移 | **BLOCKED** | 用户书面授权 + 备份确认 + 停止旧 writer |
| Cloudflare deploy | **BLOCKED** | 用户书面授权，且完整 verify 已 PASS 并与待发布产物绑定 |
| GitHub push / commit | **BLOCKED** | 用户书面授权 |
| 安装新依赖 | **BLOCKED** | 用户书面授权 + 记录原因 |
| 升级现有依赖 / 换 AI 模型 | **BLOCKED** | 用户书面授权 |
| 修改 `.env` | **BLOCKED** | 用户书面授权 |
| 本地 build / typecheck / 测试 / headless 浏览器 | 允许 | — |
| 公开 keyless 素材 API 只读查询 | 允许 | 不得高频、不得绕过 robots |

密钥不得出现在日志、报告或提交内容中。

---

## 8. 证据存放约定

```
evidence/                     # 包内既有 16 个历史文件；A 组不可变，B 组由包内脚本写入（见 CLAUDE.md §7.5）
evidence/dev/                 # 本轮新增证据根目录（Claude 写入）
  STEP-1/ STEP-2/ ...         # 按 STEP 分目录
    <task-id>/
      command.json            # 命令、cwd、env 摘要、开始/结束时间、退出码
      stdout.log / stderr.log
      artifacts/              # MP4、截图、JSON 结果
governance/
  baseline-v0.3.3.2.sha256    # 接管时刻全部 110 个文件的哈希
  evidence-snapshot-*/        # 运行包内脚本前的 evidence/ 快照
  repro/                      # 复现工具（只读产品代码）
  SCOPE-GUARD.md              # Scope Guard 章程
  scope-guard-check.mjs       # 只读机械检查器
```

`TRACEABILITY.json` 是索引，指向上述路径。

---

## 9. 停止条件（任一命中即刻停止并报告）

1. 任一验收标准缺失、含糊、不可验证或失败
2. 需要修改冻结文件但尚未获得 RB-1 批准
3. 需要真实 AI 费用、生产数据库或部署授权
4. Scope Guard 输出 `BLOCK`
5. 同一任务的测试连续失败 3 次
6. 发现需要改变 PRD 目标才能通过
7. 发现此前汇报有误（先走 §4 CORRECTION）

停止时必须写明：失败项、可能原因、最小下一步修复、不扩大范围。
