# 本版实际验证证据

这里是v0.3.3.2本轮离线和整合检查输出，不混用过去版本的PASS。

- offline-check.txt：原UI、结构、后端、发布保护、Verification Fix全部离线执行。
- regression-results.json：真实Node SQLite的D1形状适配器+模拟AI，不是远程D1/AI。
- generated-*-guards.txt / manual-bom-crlf-guards.txt：明确标记的生成文件fixtures，不是实际Next构建。
- npm-install-attempt.txt / next-build-attempt.txt：本轮真实失败尝试；不能把未完成安装/Next build说成通过。
- integration-source-comparison.json / scope-diff-v0331.json：代码整合与不改UI/业务的字节对比。

运行本包后会新增或更新本机日志。SOURCE-MANIFEST仅用于原始归档校验，不能要求这些测试输出始终不变。
