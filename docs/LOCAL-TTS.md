# 本地语音与端口

语音桥仍通过本机127.0.0.1:8787提供服务，不是云端TTS，也不是手机内置语音。

精确允许的默认网页来源：localhost:3000、127.0.0.1:3000、localhost:8790、127.0.0.1:8790、https://freevideo.eco-velo.com。没有通配符。

在已配置好的 Windows Supertonic F5 环境，运行 `START-VOICE-BRIDGE-WINDOWS.ps1`（或 `node apps/voice-bridge/server.mjs`）。保留原先 `SUPERTONIC_EXE` / 相关环境配置；PowerShell入口仍读取本目录不入Git的 `.env.local`，其显式Origin配置会优先于默认值；本包不安装模型，也不捆绑参考音频或字体。

本次测试启动了真正的localhost HTTP语音桥，四个允许来源返回204、无关站点403、未配对/tts401。**没有执行Supertonic引擎，因此不是有声验收。**

单独通过 /health 或配对不等于成功出声；须以F5 / language=id实际合成一段音频，并在浏览器导出MP4后播放确认。HTTPS到loopback访问还可能触发浏览器本地网络权限要求，需要在目标设备确认。手机目前仍需另行本地TTS适配，不要假定装有Supertonic。
