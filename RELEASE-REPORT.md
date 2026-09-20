# Free Video v0.3.3.2 单包整合 — 交付与验证报告

日期：2026-09-17。

**结论：已完成单包整合及本轮离线验证；不是补丁，不需要另一个ZIP或旧工程目录。完整Next构建与云端/设备验收仍未在本次打包环境通过。**

## 1. 实际整合过程

在独立工作副本中执行原v0.3.3.1定向更新器，将其应用到重新解压的v0.3.3完整包；更新器实际退出0且更新后离线检查通过。随后独立比较原v0.3.3.1完整包，除evidence及归档清单外，整合后的发布源码全部匹配。

在这个已匹配的完整工程上更改发行标识为v0.3.3.2，更新报告中的版本标签，补齐单目录README/START-HERE和CODEX-AUDIT指令。没有把更新器/payload/旧基线ZIP塞进新包，用户解压后直接使用完整工程。

输入来源及SHA256：

| 输入 | SHA256 |
|---|---|
| v0.3.3 Backend Recovery | `0313124f5701d025e6d2002b5867b08c6e4d3a1c9b67707edddbed61ebbb98b9` |
| v0.3.3.1 Verification Update | `67e62dd214272ef114e0eb5d75432ea2b15fda789a49612303ef51c1998d256c` |
| v0.3.3.1 Full，用于独立交叉核对 | `4c9bb62b12614604fc708c44d66084e63d4001381e003371d7600a68b91dbb9c` |

这些是本次打包所用输入，**不是用户还要另外下载的文件**。

## 2. 没有改动的内容

与v0.3.3原包逐字节核对：

| 文件组 | 结果 |
|---|---:|
| apps/web发布文件，包含页面、CSS、三语、Renderer、TTS客户端和配置 | 23/23 相同 |
| Worker业务模块 | 4/4 相同 |
| D1迁移SQL | 2/2 相同 |
| Core TS源文件 | 5/5 相同 |
| Voice Bridge文件 | 2/2 相同 |
| Wrangler配置 | 4/4 相同 |
| 原UI脚本、Web与Core原始哈希清单 | 3/3 相同 |

整个apps/web原字节保留，这是发行包对比，不是重新将Next生成文件锁成构建后不许变化。

相对已整合的v0.3.3.1，本版现有可执行验收文件仅更改三处文件中的发行号文字；检查策略、断言、范围和预期保护哈希没有放宽。根package.json仅更改version，不新增/升级依赖。Worker、D1、AI和UI实现保持不变。

对外发行号v0.3.3.2；npm合法版本为`0.3.3-verification.2`；后台实现版本仍为`0.3.3-lite`。没有为了修改API版本号而触碰业务实现。

## 3. 本轮实际测试

环境：Linux容器，Node.js 22.16.0、npm 10.9.2。不是用户Windows机器。离线AI使用夹具/故障注入；D1接口形状适配器使用真实Node SQLite；未接云端AI或生产D1。

| 验证 | 结果 | 证据及限定 |
|---|---:|---|
| 实际应用原更新器并比对原完整v0.3.3.1源码 | PASS | `integration-source-comparison.json` 与来源清单 |
| 原UI哈希 | 18/18 PASS | `offline-check.txt`；原脚本和哈希不改 |
| 轻量结构 | 23/23 PASS | 同上；不是端到端验收 |
| 后端行为回归 | 69/69 PASS | 同上及`regression-results.json`；SQLite+模拟AI |
| Release Guards | 25/25 PASS | `release-guards.json` |
| 验收规则与失败停止回归 | 56/56 PASS | `verification-fix-results.json`；生成文件形态使用fixtures |
| 后端、工具、测试JS语法 | 23/23 PASS | `syntax-results.json` |
| 普通Next构建形态文件下运行完整Release Guards | 25/25 PASS | `generated-lf-guards.txt`；不是实际Next构建 |
| BOM+CRLF构建形态下运行完整Release Guards | 25/25 PASS | `generated-bom-crlf-guards.txt`；不是实际Next构建 |
| 用户手写标准声明的BOM+CRLF形态 | 25/25 PASS | `manual-bom-crlf-guards.txt` |
| 原根依赖/脚本不变、现有可执行文件仅发行号差异 | PASS | `scope-diff-v0331.json` |
| npm install真实尝试 | BLOCKED | `npm-install-attempt.txt`：EAI_AGAIN，registry.npmjs.org无法解析 |
| npm run build真实探测 | 未通过/依赖阻塞 | `next-build-attempt.txt`：next: not found；未冒充完整构建PASS |
| 本轮真实workerd/远程Workers AI/语音/素材入MP4/手机 | NOT_RUN | 没有环境或账号/设备验收证据 |

夹具形态检查在只包含整合工程的临时目录运行，不依赖旧目录或更新包。通过条数不是全站业务成功率，几组检查有重叠，不能累加成独立线上请求样本。

## 4. 构建后的检查策略

沿用v0.3.3.1正确区分：21个Web文件严格按原字节；`next-env.d.ts`与`tsconfig.json`按受限内容验证。没有重算原基线，没有删除失败断言。

合法Next声明/限定导入/BOM/CRLF允许；任意代码、额外声明、非预期导入、TypeScript抑制指令、损坏编码拒绝。tsconfig除已列明的jsx和dev类型include变化外，其余原结构不许任意弱化。

Next官方说明`next-env.d.ts`在dev/build/typegen中重新生成，不应手工编辑：
https://nextjs.org/docs/app/api-reference/config/typescript （2026-09-17核对）

`VERIFY-BUILD.cmd`执行前置检查、真实build/typecheck、后置同一套检查；不自动恢复或覆盖生成文件。此次本地测试证明门禁接受明确允许形态，但网络阻塞使本轮真正Next构建未完成，必须在可安装依赖的机器上实测。

## 5. 用户使用与Codex审计

只下载`free-video-v0.3.3.2-integrated-flat.zip`，解压到新目录。原v0.3.3目录无需删除、修改或搬移。不要覆盖旧目录混入历史文件。

自行检查：`CHECK-LOCAL.cmd` → `CHECK_EXIT=0`；之后`VERIFY-BUILD.cmd` → `VERIFY_BUILD_EXIT=0`。输出保存在本目录evidence。

交给Codex：打开本解压目录，要求读取`AGENTS.md`和`CODEX-AUDIT.md`，在独立副本审计。只审这个完整工程，不再应用更新器或要求第二个ZIP。无Git仓库也可以运行。

包内CODEX-AUDIT明确了真实构建、反向变异、后端/本地运行时、费用授权和生产禁区，不把本轮已知PASS当独立审计结果。

## 6. 不隐瞒的限制

没有修改GitHub、Cloudflare、DNS、线上D1或用户电脑，没有调用收费云端AI。沿用原后端并不等于已完成真实远程推理/音视频链路。手机本地TTS、第4次以后收费/Credits和素材最终MP4设备验收没有因整合自动完成。

当前环境依赖安装失败，未制造package-lock或假安装成功；使用者首次成功安装后保留真实锁文件。用户此前Windows v0.3.3构建日志仍是有效历史证据，但不冒充本版本轮build结果。

`SOURCE-MANIFEST.json`只验证刚解压的归档文件；运行测试会更新evidence，构建会更新允许的Next文件。工作树保护要用现有web-integrity/ui-integrity，不能重复制造整包哈希假FAIL。

## 7. 最终封包复验

发行前重新生成本版归档清单，再从最终ZIP解压至独立目录核验CRC、逐文件哈希，并运行完整离线套件。结果另附同次生成的fresh-zip-check日志。本报告中的“完整构建未验收”不因ZIP复验而改变。
