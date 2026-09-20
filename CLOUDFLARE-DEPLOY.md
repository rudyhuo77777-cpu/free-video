# v0.3.3.2 整合包：先验证，迁移成功后才发布

本包没有替你修改任何线上服务。部署是显式动作，不会由 `CHECK-LOCAL.cmd` / `START-LOCAL.cmd` / `npm run verify` 自动执行。

## 1. 先通过本地验收

`VERIFY-BUILD.cmd` → `npm run test:runtime:local` → 获得云端AI用量授权后才运行 `npm run test:ai:real`。
本包已整合验收修复，不需要更新器或旧目录。
之后用本地预览完成真实素材和 Supertonic F5 有声15秒MP4。60/120秒及手机另作设备验收。
任何一项失败，保留 `evidence/` 输出，不要把生产部署当成修复编译错误的测试器。

## 2. 保留并确认现有资源，不重建

现有 Worker：`free-video`；现有GitHub仓库：`rudyhuo77777-cpu/free-video`；正式域名 `freevideo.eco-velo.com`。
确定当前 Worker `DB` binding 实际对应的 D1 ID，以及 Cloudflare account ID。

部署环境只需提供两项**非秘密标识符**：

```text
CLOUDFLARE_ACCOUNT_ID=你确认的32位Cloudflare账号ID
FREE_VIDEO_D1_ID=当前DB绑定已有数据库的UUID
```

它们可以设置为 Workers Builds 构建变量；本地显式发布时可以作为进程环境变量。
不得把API token、密码或Key提交到GitHub。CLI发布仍须已有 Cloudflare 登录或平台注入的部署凭据。不要把整个 `.env` / `.dev.vars` 上传。

也可以只把上述ID填到 `wrangler.jsonc` 的 `account_id` 与 `d1_databases[0].database_id`。包里故意没有真实ID，无法误部署到猜测的数据库。

## 3. 升级窗口

升级前备份现有D1，暂停旧版新增脚本请求并确认在途请求结束；迁移期间不要让v0.3.1/0.3.2旧writer继续写同一D1。该升级流程不宣称零停机并发兼容。

`0001_core.sql` 保持原字节不变，可对已有六张表运行 `IF NOT EXISTS`。
`0002_atomic_jobs.sql` 是新增列/索引和历史状态初始化，不含 DROP TABLE。

通过 **Wrangler migration ledger** 记录并跳过已应用的文件。不要手工反复粘贴0002的ALTER语句；重复裸执行ALTER不是幂等操作。不要跳过已有记录去重新应用0002，也不要回滚到旧writer。

旧版遗留 `reserved` 按原额度余额保守标记，过期后在下一次该访客请求中回收。若旧版已经删掉记录但扣了额度，本版不能从不存在的记录推断历史事实；需另行人工核对，不会静默清零所有用户额度。

## 4. Git集成参数（已有项目直接更新，不另建仓库）

```text
Project / Worker name: free-video
Production branch: main
Root: 仓库根目录
Build command: npm run verify
Deploy command: npm run deploy
```

**Deploy command不再用旧的 `npx wrangler deploy`。** `npm run deploy` 会：
- 校验账号ID、已有生产D1 ID、唯一DB binding、Worker名称；缺失即停止。
- 校验静态构建产物与UI哈希。
- 生成本机/构建环境临时 `wrangler.resolved.jsonc`，不含凭据。
- `wrangler d1 migrations apply DB --remote --config wrangler.resolved.jsonc`
- 只有迁移退出码为0才 `wrangler deploy --config wrangler.resolved.jsonc`。

`npm run deploy:plan` 只输出计划，不执行迁移或发布；同样必须先配置真实资源ID。

迁移成功但发布失败时，新列会保留；不要删除生产数据或再次清空仓库。保留错误结果，使用同一迁移账本重新发布修好的版本。

## 5. 上线后判据

`/api/health` 只代表进程存活；`/api/ready` 检查全部必需表/列/索引与AI binding和已知弃用配置，返回 `schemaVersion:2` / `inferenceChecked:false`，它不偷偷计费调用AI。

真正业务验收需一条成功的脚本请求、重复请求不多扣、实际素材/TTS/有声MP4。所有API异常返回JSON和 `x-request-id`，不再通过错误页颜色猜原因。

## 官方依据（2026-09-17查阅）

- D1迁移：https://developers.cloudflare.com/d1/reference/migrations/
- 显式apply命令：https://developers.cloudflare.com/workers/wrangler/commands/d1/
- D1事务batch：https://developers.cloudflare.com/d1/worker-api/d1-database/
- JSON Mode：https://developers.cloudflare.com/workers-ai/features/json-mode/
- 模型弃用公告：https://developers.cloudflare.com/changelog/post/2026-05-08-planned-model-deprecations/
