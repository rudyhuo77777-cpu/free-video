# T5-1 Mediabunny 1.56.1 封装契约（调研，未改代码）

来源：本地已安装的 `node_modules/mediabunny/dist/modules/src/output-format.d.ts`（第 78–106 行）
与 `output.d.ts`（第 118–130 行）。未升级依赖，未联网取文档。

## 1. FV-005 的确切成因

`apps/web/lib/client/video-renderer.ts:278` 对磁盘/OPFS 分支使用 `fastStart: 'reserve'`。
官方类型定义原文：

> Use `'reserve'` to reserve space at the start of the file into which the metadata will be
> written later. This produces a file with Fast Start but **requires knowledge about the
> expected length of the file beforehand. When using this option, you must set the
> `BaseTrackMetadata.maximumPacketCount` field in the track metadata for all tracks.**

而现有代码第 286、291 行的 `addVideoTrack` / `addAudioTrack` 都没有提供 `maximumPacketCount`。
因此 90/120 秒（`longVideo = duration >= 90`，走 OPFS 分支）在 `output.start()` 抛出
`All tracks must specify maximumPacketCount in their metadata when using fastStart: 'reserve'.`

15/30/60 秒走 `fastStart: 'in-memory'`，不受此约束，所以只有长视频失败 —— 与 STEP 1 复现完全吻合。

## 2. 四个可选值的取舍

| 值 | 官方描述要点 | 对本产品的影响 |
|---|---|---|
| `false` | 元数据写在文件末尾，最快、内存最省 | 失去 Fast Start；文件仍可本地播放，但改变了原代码刻意选择的产品特性 |
| `'in-memory'` | 全部媒体块保留在内存直到 finalize | 正是长视频要避免的（OPFS 分支存在的理由就是不把整个 MP4 放进 JS 堆） |
| `'reserve'` | 预留头部空间，**必须**给每轨 `maximumPacketCount` | **保持原有意图，只需补上缺失的参数** |
| `'fragmented'` | fMP4，大文件也轻量；但"not as widely and wholly supported as regular MP4/MOV files" | 兼容性风险落在用户下载的成品 MP4 上，印尼手机端播放器兼容面未知 |

## 3. 选定路径：保留 `'reserve'`，补上正确且有界的 `maximumPacketCount`

**理由**：这是唯一既不改变产品既定特性（Fast Start + 不占 JS 堆）、也不引入播放兼容性风险的最小修复。
`'fragmented'` 虽然工程上更优雅，但会改变交付给用户的 MP4 容器形态，属于超出 FV-005 的产品变更。

## 4. 计算方式（依据官方给出的估算规则）

官方原文：

> - For video codecs, you can assume **one packet per frame**.
> - For audio codecs, there is one packet for each "audio chunk" ... **assume each packet is
>   roughly 10 ms or 512 samples long, whichever is shorter**.
> - If you're not fully sure, make sure to add a **buffer of around 33%**.

同时明确：

> When this field is set, it is **an error to provide more packets than** whatever this field specifies.

即**只能高估，不能低估**。据此：

```
videoMaxPackets = ceil(duration * fps * 1.34)
audioMaxPackets = ceil(duration / 0.010 * 1.34)      // 官方保守口径
```

参考值（长视频为 540×960 @ 12fps）：

| 时长 | 视频帧数 | videoMaxPackets | AAC 实际包数(48kHz,1024样本) | audioMaxPackets(保守口径) |
|---|---|---|---|---|
| 90s | 1080 | 1448 | ~4219 | 12060 |
| 120s | 1440 | 1930 | ~5625 | 16080 |

保守口径会多预留头部空间（预留的是 moov 空间，非媒体数据），代价是文件头部若干字节，
不影响可播放性。T5-3 将实测两种口径的产物大小与可解码性，择其一并留档。

## 5. 同时必须修的清理缺陷

STEP 1 复现记录：90 秒失败后 OPFS 残留 1 个 0 字节 `.mp4` 与 1 个 0 字节 `.crswap`。
现有代码第 256–305 行与 441–456 行没有 `try/finally`，失败或取消时不释放 `writable`、
不释放 `output`、不清理 OPFS 临时文件。T5-3 一并修复。

## 6. 明确不做

- 不升级 mediabunny（仍为 1.56.1）
- 不改 9:16 尺寸、不改 fps 策略、不改画质参数
- 不关闭 OPFS 分支、不删除 90/120 秒选项
- 不改用 `BufferTarget` 绕过
