# 音乐与音效

本项目按 [Playable Intelligence / OpusGameLabs 的 game-audio 技能](https://github.com/playableintelligence/game-creator/tree/main/skills/game-audio) 实现音频。已使用 Codex 的 skill-installer 安装到 `~/.codex/skills/game-audio`，并读取音序器、音效与混音指南。该技能为 MIT 许可；新增技能会在下一轮被自动发现，本轮已直接读取并应用。

## 原创配乐

`src/lib/audio.ts` 使用浏览器内置 Web Audio API 实时合成原创 lounge 配乐，无音频素材下载、第三方曲目、外部 API、密钥或运行时依赖。音乐为电钢琴质感和弦、柔和贝斯、轻刷鼓与留白旋律：

- 小姐牌：78 BPM，C 大调爵士扩展和弦，温暖轻快。
- 大姐牌：84 BPM，C 小调与降 A 色彩，节奏更鲜明。
- 少爷牌：72 BPM，D 小调到 C 大调的和声进行，柔和从容。

每个主题的旋律与留白跨 32 小节轮换，避免短片段机械重复。配乐下混到低音量，翻牌时短暂压低音乐，突出轻响提示。另有点击、抽牌、翻牌和洗牌四种合成音效。

## 应用接口

```ts
import { audio } from './lib/audio';

// 必须放在用户点击/触摸处理函数中。不要在加载或 useEffect 中直接启用。
await audio.enable();
audio.setMode('lady'); // 'queen' / 'gentleman'
audio.setVolume(0.5);  // 0–1
audio.play('draw');    // 'click' / 'flip' / 'shuffle'
audio.disable();      // 静音并停止调度
```

初始静音；只有调用 `enable()` 才创建 AudioContext。切换标签页后暂停音频、取消音符调度，回到页面时仅在用户之前主动开启的情况下恢复。`disable()` 同时停止音乐和音效，音量、静音偏好由应用 UI 存储。单次音效结束后断开节点，页面销毁时可用 `dispose()` 关闭上下文。

## 验证要点

- 音序器以音频时钟调度，提前 120 ms 排程、每 25 ms 检查一次；恢复后台页面时跳过过期事件，避免堆叠播放。
- 所有声音经过总音量与动态压缩器；音符有起音与衰减包络。
- 已在本机 Chrome 的无头 Playwright 会话验证：模块加载不创建 AudioContext；真实按钮点击后进入 running；三个主题及四种音效均运行且无页面异常；AnalyserNode 检测到非零波形；隐藏事件使上下文 suspended、调度器停止、活动声源归零；重新可见后恢复；关闭后总增益为 0、声源为 0；dispose 关闭上下文。
- 隐藏状态检查通过模拟 `visibilitychange` 验证处理逻辑，最终页面 UI 的点击和真实切后台体验仍应纳入整体验收。此自动检查证明音频产生与生命周期行为，不替代真人听感评价。
