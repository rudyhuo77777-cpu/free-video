# PRD.md — Free Video 产品需求（冻结版）

> 状态：**FROZEN**（冻结）。
> 冻结日期：2026-09-18。
> 任何对本文件的修改都是范围变更，必须由用户明确批准，并在 `TRACEABILITY.json` 建立 `CR-` 编号。
> Scope Guard 以本文件 + `TRACEABILITY.json` 的缺陷编号作为唯一的“改动合法性来源”。

---

## 1. 产品

| 项 | 值 |
|---|---|
| 名称 | Free Video |
| 域名 | https://freevideo.eco-velo.com |
| 定位 | 免费、无视频额度、浏览器本地生成最长 120 秒竖屏营销视频 |
| 主市场 | 印度尼西亚 |

### 1.1 固定文案（逐字冻结，禁止改动一个字符）

| 语言 | 文案 | 落点 |
|---|---|---|
| 中文 | `全球首款免费生成超长视频120秒的网站` | `apps/web/app/page.tsx` |
| Bahasa Indonesia | `120 Detik. Gratis. Tanpa Kredit Video.` | `apps/web/app/page.tsx` |

结构性校验由 `scripts/lite-audit.mjs` 的 `fixed Indonesian copy preserved` / `fixed Chinese copy preserved` 两条断言强制。

### 1.2 语言

- 默认语言：**Bahasa Indonesia**
- 语言顺序：**Bahasa Indonesia → English → 中文**
- 三语必须跨页面同步（`apps/web/components/LanguageProvider.tsx`）
- 禁止新增/删除语言，禁止改变顺序与默认值

---

## 2. 主链（Happy Path）

```
产品信息（用户输入 / product project）
  → Workers AI Director（生成 Director JSON，@cf/meta/llama-3.3-70b-instruct-fp8-fast）
  → 素材（Openverse + Wikimedia Commons，keyless；Pixabay/Pexels 为可选 secret）
  → 本地 Supertonic 3 / F5 印尼语语音（localhost Voice Bridge 或浏览器 Natural Voice Pack）
  → 浏览器本地视频合成（Mediabunny 1.56.1，Canvas → H.264 + AAC）
  → 下载 MP4
```

**必须支持时长：15 / 30 / 60 / 90 / 120 秒。** 五个都必须真实可用，不得删减、不得静默缩短。

---

## 3. 架构（Cloudflare Lite，冻结）

```
Next.js static export (apps/web, output: 'export')
  → 单个 Cloudflare Worker (worker/index.js, name = free-video)
      ├── Workers AI binding (AI)
      ├── D1 binding (DB, 1 个，migrations_dir = migrations)
      └── Static assets binding (ASSETS, /api/* run_worker_first)
  → 浏览器本地渲染 (apps/web/lib/client/video-renderer.ts)
  → 可选 localhost Voice Bridge (apps/voice-bridge/server.mjs)
```

### 3.1 禁止重新引入

Railway、Redis、Postgres、BullMQ、Docker 重架构、复杂队列、CRM、Dashboard、支付、新平台、
服务端视频渲染、独立 AI worker、第二个 D1、任意新的托管服务。

结构性校验由 `scripts/lite-audit.mjs` 的 23 条断言强制。

### 3.2 平台次序

TikTok 相关能力不在本 PRD 范围内。本轮只做 Free Video 本体。

---

## 4. UI 冻结

**不改**：布局、CSS、颜色、按钮位置、尺寸、导航、品牌、现有三语文案。

字节冻结文件（21 个，由 `tests/web-baseline-sha256.json` + `scripts/web-integrity.mjs` 强制）：

```
apps/web/app/globals.css
apps/web/app/layout.tsx
apps/web/app/page.tsx
apps/web/app/projects/page.tsx
apps/web/app/tools/page.tsx
apps/web/app/video/page.tsx
apps/web/components/LanguageProvider.tsx
apps/web/components/Nav.tsx
apps/web/components/PwaRegistrar.tsx
apps/web/components/TurnstileBox.tsx
apps/web/lib/client/tts.ts
apps/web/lib/client/video-renderer.ts
apps/web/next.config.ts
apps/web/package.json
apps/web/public/fyp-local.html
apps/web/public/icon-192.png
apps/web/public/icon-512.png
apps/web/public/icon.svg
apps/web/public/manifest.webmanifest
apps/web/public/reset-local-cache.html
apps/web/public/sw.js
```

Next 托管文件（内容受限校验，非字节冻结）：`apps/web/next-env.d.ts`、`apps/web/tsconfig.json`。

### 4.1 允许的例外：非视觉客户端逻辑

为修复 `TRACEABILITY.json` 中已确认的缺陷，允许修改**不改变任何渲染结果**的客户端逻辑：

- 任务状态恢复（FV-004，`apps/web/app/video/page.tsx`）
- 视频封装配置与失败清理（FV-005，`apps/web/lib/client/video-renderer.ts`）
- 音频完整性与能量校验（FV-006 / FV-010，同上）
- 素材加载超时与释放（FV-009，同上）

**条件（全部必须满足）**：
1. 对应一个已确认的 FV 编号
2. 走 `GOVERNANCE.md` 的 RB-1 再基线程序，逐文件获得用户批准
3. 提供“视觉未变化”证据：同一路由、同一状态下渲染前后的截图像素级比较，以及 `globals.css` 字节未变
4. 不新增任何可见控件、文案、颜色、间距
5. 若某项修复必须新增可见控件（例如 FV-009 的“取消”按钮），**必须先单独申请 CR，未获批准则该部分不做**

---

## 5. 免费额度与配额

- 免费 AI 脚本额度：**3 次 / 访客**（D1 `script_requests` + 配额表）
- 已有脚本/项目生成视频：**永久免费，不扣额度**
- 同一逻辑任务（同 idempotencyKey + 同 request_hash）**只能扣一次额度、只能调用一次 AI**
- AI 失败必须退款额度；退款必须幂等，禁止重复退款
- 跨访客隔离：同 key 不同 guest 必须 404，禁止返回他人结果

---

## 6. 安全与合规默认值

- 素材仅限 CC0 / PDM 授权；许可信息必须可追溯
- 不向浏览器暴露 provider secret
- Voice Bridge 仅监听 127.0.0.1，需配对 + Origin 白名单
- 所有 API 失败返回稳定 JSON：`error` 码 + `stage` + `requestId`，不回显未知底层 message
- 生产部署需显式 `npm run deploy`，且必须先迁移后发布，迁移失败即停止

---

## 7. 明确不做（Out of Scope）

- 支付、订阅、CRM、Dashboard
- 服务端渲染视频
- 云端 TTS
- 社交平台账号自动化 / 自动发布
- 多租户、团队账号
- TikTok 集成
- 新的第三方托管服务

---

## 8. 验收口径

本 PRD 的任何一条被声明“满足”，必须有 `GOVERNANCE.md` 规定的完整证据。
Build 通过、HTTP 200、MP4 文件存在、mock AI 通过，**都不构成本 PRD 的验收**。
