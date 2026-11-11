# 14 · 幸运转盘抽签（快版重做 08）

选项一行一个贴进去，按一下转，停在哪个格子就是哪个。扇区按选项数等分，
指针停在哪儿由落点角度反算，转完回读一次校验；带「不放回」和记录统计。

## 相对 08 的实质改动

1. **视频换成快版**：20.5 秒 / 7 句 / 语速 +28%，首帧改成「群里问一圈 vs 转盘一转」左右对比卡。
   08 原版 2 秒跳出率 27% 是全系列最好的，转盘动画这个优势保留。
2. **转动改成静态帧合成**：按 15° 截 24 张整页图，合成时按缓出曲线挑帧，
   基准角取「最终落点角」而不是 0 —— 这样末帧和停稳那一帧严格一致，减速末尾不会凭空跳 6°。
3. 逻辑本身沿用 08 的 `wheel.js`（解析 / 扇区几何 / 落点 / 不放回 / 统计），未改算法。

## 目录

```
miniprogram/core/wheel.js   UMD 纯逻辑（选项解析 / 扇区几何 / 落点角度 / 不放回 / 统计）
miniprogram/core/ads.js     广告拉不到 = 视为解锁成功，不拦用户
miniprogram/pages/index/    小程序页面（只负责照着 layout 画扇区和标签）
preview/index.html          浏览器预览，和小程序共用 core/wheel.js，暴露 window.__ctl
test.js                     node test.js（172 项断言）
video/                      快版 20.5 秒视频链路
publish/                    成片.mp4 / 封面.png / 文案.txt
```

## 视频链路

```bash
cd video
python capture_video.py       # playwright 截 29 张整页长图（含 24 个转盘角度）
python tts_fast.py            # 7 句，语速 +28%
python build_audio_fast.py    # 拼 voice.wav
python build_fast.py          # 20.56s / 1080x1920 / 首帧左右对比卡
python cover.py               # 1080x1440 封面
cd ../..
python bgmmix.py --video mini-apps/14-wheel/video/out/wheel-fast.mp4 \
                 --out mini-apps/14-wheel/video/out/wheel-fast-bgm.mp4 \
                 --style lofi --lvl 0.34
```

快版规格：1080×1920、20–22 秒、7 句、语速 +28%；首帧左右对比卡（左深底灰字+手绘红叉 /
右浅底黑字+手绘绿勾）；字幕压在画面 y=1660，64px 白字 + #FFE100 关键词 + 7px 黑描边；
界面截图铺满 1920 不留黑条；收尾用问句，不用金句。
