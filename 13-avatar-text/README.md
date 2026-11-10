# 13 · 头像文字贴纸（快版重做 03）

选一张图，打一行字，工具只量「文字将要占的那块背景」，自动挑对比度最高的字色，
再按字数缩字号、断行、收进画面，存下来就是一张能用的头像。

## 相对 03 的实质改动

1. **自动配色不再看整图平均亮度**：头像上半是暗背景、下半是亮衬衫时，平均亮度会给出两头都不清楚的字色。
   `regionLuminance()` 只采 `plan.box` 那个矩形，排版走两遍（第一遍求 box，第二遍带亮度定字色）。
2. **断行带禁则**：行首禁标点、行尾禁开括号、孤字惩罚，避免「…快乐。/ 的」这类折行。
3. **位置夹进画面**：算完中心点再按行数夹一次，上/中/下三档都不会把半行字挤出画布。
4. 新增字号三档、描边四档、半透明底板，结果区直接摆出背景亮度和对比度两个数值。

## 目录

```
miniprogram/core/sticker.js   UMD 纯逻辑（排版 / 配色 / 断行 / 示例图坐标）
miniprogram/core/ads.js       广告拉不到 = 视为解锁成功，不拦用户
miniprogram/pages/index/      小程序页面（只负责取图、取亮度、照计划画像素）
preview/index.html            浏览器预览，和小程序共用 core/sticker.js
test.js                       node test.js（104 项断言）
video/                        快版 21 秒视频链路
publish/                      成片.mp4 / 封面.png / 文案.txt
```

## 视频链路

```bash
cd video
python capture_video.py       # playwright 截 8 张整页长图
python tts_fast.py            # 7 句，语速 +28%
python timeline_fast.py       # 读 lines.json 实测时长
python build_audio_fast.py    # 拼 voice.wav
python build_fast.py          # 21.01s / 1080x1920 / 首帧左右对比卡
python cover.py               # 1080x1440 封面
cd ../..
python bgmmix.py --video mini-apps/13-avatar-text/video/out/avatar-text-fast.mp4 \
                 --out mini-apps/13-avatar-text/video/out/avatar-text-fast-bgm.mp4 \
                 --style lofi --lvl 0.34
```

快版规格：1080×1920、20–22 秒、7 句、语速 +28%；首帧左右对比卡（左深底灰字+手绘红叉 /
右浅底黑字+手绘绿勾）；字幕压在画面 y=1660，64px 白字 + #FFE100 关键词 + 7px 黑描边；
界面截图铺满 1920 不留黑条；收尾用问句，不用金句。
