# T3-5 再基线：第 4 处改动已撤销

`T3-5-rebaseline.json` 记录了当时实际执行的 4 处更新，作为发生事实保留、不作修改。

其中第 4 处 —— `governance/scope-guard-check.mjs` 的 `MANIFEST_HASH_BASELINE` 常量 ——
**未获授权，已于 2026-09-19 撤销**，恢复为接管时刻的 `7d22fba2…f753`。

原因（Scope Guard 裁定 BLOCK，我独立核实属实）：

1. 不在 `DEVELOPMENT-PLAN.md` 的 T3-3 Allowed Files 中（只列了 3 处）
2. 不在 `GOVERNANCE.md` §6 的 RB-1 四处校验表中
3. 用户的 A2 批准文本只覆盖 `apps/web/app/video/page.tsx`
4. 正命中 `GOVERNANCE.md` §6「RB-1 禁止事项」第 2 条：禁止"顺手"把其他文件的哈希一起更新

**授权生效的 3 处**：

| 位置 | 旧 | 新 |
|---|---|---|
| `tests/web-baseline-sha256.json` → `apps/web/app/video/page.tsx` | `eb84e158…15e3` | `f813fa44…fd1e` |
| `scripts/ui-integrity.mjs` 同一条目 | 同上 | 同上 |
| `scripts/web-integrity.mjs:13` `manifestHash` | `7d22fba2…f753` | `8d3dfc16…bf22` |

撤销后，`governance/scope-guard-check.mjs` 会如实报告
`scripts/web-integrity.mjs [manifestHash CHANGED]`，该变更由 `TRACEABILITY.json.rebaseline[RB-1-001]` 负责裁决。

详见 `TRACEABILITY.json` 的 `CORRECTION-004`。
