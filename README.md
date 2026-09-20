# Free Video v0.3.3.2 — 单包整合版

**这是完整工程，不是补丁。只下载、解压这一个包即可。**

已将 v0.3.3 Backend Recovery 与 v0.3.3.1 Verification Fix 实际合并，并与原 v0.3.3.1 完整版的发布源码逐文件交叉核对。无需旧版本文件夹，不运行更新器，不需要应用第二个 ZIP。建议解压到新的 `free-video-v0.3.3.2-integrated-flat` 目录，避免与旧版残留文件混合。

## 你现在只需做的事

需要 Node.js >=22.16.0。在当前解压目录打开 PowerShell：

```powershell
.\CHECK-LOCAL.cmd
```

离线检查成功时显示 `CHECK_EXIT=0`。它不安装依赖、不调用云端AI、不修改GitHub、Cloudflare或生产D1。日志保存在 `evidence/local-check-output.txt`。

需要继续真实构建验证时：

```powershell
.\VERIFY-BUILD.cmd
```

这一条依次执行：构建前离线检查 → 缺少声明版本依赖时联网安装 → `npm run build` → `npm run typecheck` → 构建后再次执行同一套离线检查。任何一步失败立即停止。最终成功应为 `VERIFY_BUILD_EXIT=0`，日志为 `evidence/verify-build-output.txt`。

**不要再手工恢复、复制或编辑 `next-env.d.ts`。不要用 `git restore`，本 ZIP 不要求存在 `.git`。**

现有旧目录和已经安装的依赖不会被本包修改或搬移。新目录首次完整构建需要联网安装依赖；不要为了省一次安装把旧代码覆盖回来。

## 交给 Codex 审计

在 Codex 中打开本解压目录，输入：

```text
阅读当前目录的 AGENTS.md 和 CODEX-AUDIT.md，按其中要求在独立副本审计当前 v0.3.3.2 完整工程。不要修改原工程、UI或生产环境。不要要求另外一个 ZIP 或旧版本目录。
```

`CODEX-AUDIT.md` 已放在根目录。审计对象就是这一个完整工程。原UI/Core参考哈希、测试、迁移、验收脚本和本轮打包证据均在包内。离线检查依赖 Node 自带 SQLite；不是远程 Workers AI 测试。

## 本版边界

- UI、颜色、尺寸、布局、三语、页面、按钮位置、浏览器Renderer和TTS客户端不改。
- Worker业务模块、D1迁移SQL、Core源文件、AI默认模型及Wrangler绑定不改。
- `apps/web` 发布源码全23文件与v0.3.3原包字节一致；构建后对其中21文件仍严格验字节，另外两个Next管理文件按规则校验。
- 原18项UI哈希脚本和原23项Web哈希清单不改、不重算成新基线。
- `next-env.d.ts` 仅允许必需Next引用、允许的生成路由类型导入、普通注释和BOM/换行差异；任意代码或类型抑制仍失败。
- `tsconfig.json` 仅容许已列明的Next自动变化，其他配置仍按原结构严格验证。
- 不重新引入Railway、Docker、Postgres、Redis、BullMQ或独立常驻AI Worker。

对外发行版：`v0.3.3.2`；根package.json版本：`0.3.3-verification.2`。后端代码未改，API仍报告 `0.3.3-lite`；Web/Core子包版本未为凑发行号而改写。它们不是部署失败的判据。

## 原有后续入口

- `npm run test:runtime:local`：隔离的本地workerd/D1测试；需已安装Wrangler，不绑定远程AI或生产D1。
- `npm run preview`：先verify，迁移本地D1，启动8790预览。网页实际生成脚本时会使用远程Workers AI额度；先确认自己的账号授权和用量。
- `npm run test:ai:real`：真实云端AI测试，会使用AI额度。不是离线检查，审计代理需另取得费用/用量授权。
- Windows本地语音仍用Supertonic 3/F5/印尼语；手机TTS没有因此自动完成。
- 正式发布只按 `CLOUDFLARE-DEPLOY.md`，需要确认已有生产D1与账号，并显式迁移后才发布。不因解压或本地检查自动上线。

## 本轮验证结论

实际执行记录及限制见 `RELEASE-REPORT.md` 和 `evidence/`。本轮离线套件通过；真实依赖安装遇到 npm DNS `EAI_AGAIN`，Next构建探测因 `next: not found` 未通过。没有取得本版完整Next构建、真实远程AI、F5声音或最终手机MP4验收证据。

用户此前v0.3.3的Windows构建成功日志属于那次构建，不冒充本版新一轮测试。生成形态回归明确使用fixtures，不冒充真正的Next build。

## 文件清单说明

`SOURCE-MANIFEST.json` 用于校验刚解压的发行文件，运行测试或构建后evidence和生成文件可以改变；不要把归档清单直接当成构建后的不可变清单。

工作树使用 `npm run audit:web` / `npm run audit:ui`。`INTEGRATION-MANIFEST.json`记录来源ZIP哈希和未改变的原文件哈希，最终整合不需要在用户电脑再次执行。

Next生成文件规则依据：https://nextjs.org/docs/app/api-reference/config/typescript （本轮2026-09-17核对）
