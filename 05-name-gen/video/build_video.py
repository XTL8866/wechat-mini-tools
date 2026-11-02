# -*- coding: utf-8 -*-
"""合成竖屏讲解片（约 40 秒）。python build_video.py
   画面 = 真实界面长图按滚动位置裁窗口 + 字幕条 + 开场钩子卡；音轨由 build_audio.py 生成。
"""
import json
import os
import subprocess
import sys

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

import timeline

HERE = os.path.dirname(os.path.abspath(__file__))
UI = os.path.join(HERE, "build", "ui")
AUD = os.path.join(HERE, "build", "audio")
FRAMES = os.path.join(HERE, "build", "frames")
OUT = os.path.join(HERE, "out")
FF = imageio_ffmpeg.get_ffmpeg_exe()

W, H = 1080, 1920
UI_H = 1730                 # 上方界面区
SUB_TOP = UI_H              # 下方字幕区
FPS = 30

BG = (10, 10, 12)
INK = (242, 238, 230)
DIM = (152, 152, 162)

FONT_BD = "C:/Windows/Fonts/msyhbd.ttc"
FONT_RG = "C:/Windows/Fonts/msyh.ttc"

SUB_FONT = ImageFont.truetype(FONT_RG, 52)
BIG_FONT = ImageFont.truetype(FONT_BD, 122)
LEAD_FONT = ImageFont.truetype(FONT_RG, 48)

# 结果列表出现后窗口停在这个滚动位置：正好露出「生成结果」和三条
SCROLL_LIST = 1347   # 结果页整页 3077 高，窗口 1730，滚到底才露全三条


def ease_out(x):
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3


def ease_io(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def lerp(a, b, x):
    return a + (b - a) * x


class Ctx:
    def __init__(self):
        self.ui = {}
        for f in os.listdir(UI):
            if f.endswith(".png"):
                im = Image.open(os.path.join(UI, f)).convert("RGB")
                self.ui[f[:-4]] = im
        self.base = Image.new("RGB", (W, H), BG)
        self._sub_cache = {}

    def pane(self, shot, scroll=0):
        """按滚动位置裁出 1080x1730 的界面窗口。"""
        im = self.ui[shot]
        maxy = max(0, im.height - UI_H)
        y = int(max(0, min(scroll, maxy)))
        out = Image.new("RGB", (W, UI_H), (255, 255, 255))
        out.paste(im.crop((0, y, W, y + min(UI_H, im.height))), (0, 0))
        return out

    def toast_layer(self, text):
        key = "_t_" + text
        if key in self._sub_cache:
            return self._sub_cache[key]
        f = ImageFont.truetype(FONT_RG, 42)
        tmp = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
        bb = tmp.textbbox((0, 0), text, font=f)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        w, h = tw + 88, th + 54
        layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.rounded_rectangle([0, 0, w - 1, h - 1], radius=16, fill=(16, 16, 20, 232))
        d.text((w // 2, h // 2 + 2), text, font=f, fill=(255, 255, 255, 255), anchor="mm")
        self._sub_cache[key] = layer
        return layer

    def sub_layer(self, text):
        if text in self._sub_cache:
            return self._sub_cache[text]
        layer = Image.new("RGBA", (W, SUB_TOP * 2), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        maxw = W - 170

        # 优先一行；放不下就降一级字号；仍放不下才断两行，且两行长度要均衡
        font, lines = SUB_FONT, None
        if d.textlength(text, font=font) <= maxw:
            lines = [text]
        else:
            small = ImageFont.truetype(FONT_RG, 46)
            if d.textlength(text, font=small) <= maxw:
                font, lines = small, [text]
            else:
                total = d.textlength(text, font=font)
                n = max(2, int(total // maxw) + 1)
                target = total / n
                lines, cur = [], ""
                for ch in text:
                    if cur and d.textlength(cur + ch, font=font) > target and len(lines) < n - 1:
                        lines.append(cur)
                        cur = ch
                    elif cur and d.textlength(cur + ch, font=font) > maxw:
                        lines.append(cur)
                        cur = ch
                    else:
                        cur += ch
                if cur:
                    lines.append(cur)

        lines = lines[:2]
        lh = 74
        cy = SUB_TOP + 92 - (len(lines) - 1) * lh // 2
        for i, ln in enumerate(lines):
            d.text((W // 2, cy + i * lh), ln, font=font, fill=INK, anchor="mm")
        self._sub_cache[text] = layer
        return layer


def compose(ctx, shot, scroll, sub=None, ui_alpha=1.0, toast=None):
    canvas = ctx.base.copy()
    if shot is not None and ui_alpha > 0:
        pane = ctx.pane(shot, scroll)
        if ui_alpha < 1.0:
            pane = Image.blend(Image.new("RGB", (W, UI_H), BG), pane, ui_alpha)
        canvas.paste(pane, (0, 0))
        # 界面区到此为止，硬切；白底渐隐到深色只会变成一条灰雾带
    if sub or toast:
        canvas = canvas.convert("RGBA")
        if sub:
            canvas.alpha_composite(ctx.sub_layer(sub))
        if toast:
            tl = ctx.toast_layer(toast)
            canvas.alpha_composite(tl, (W // 2 - tl.width // 2, 1530))
        canvas = canvas.convert("RGB")
    return canvas


def compose_curtain(ctx, l1, l2, a1, a2):
    canvas = ctx.base.copy().convert("RGBA")
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if a1 > 0 and l1:
        d.text((W // 2, 846), l1, font=LEAD_FONT, fill=DIM + (int(255 * a1),), anchor="mm")
    if a2 > 0 and l2:
        d.text((W // 2, 976), l2, font=BIG_FONT, fill=INK + (int(255 * a2),), anchor="mm")
    canvas.alpha_composite(layer)
    return canvas.convert("RGB")


# 系列固定开场钩子：文字按「小字铺垫 + 大字落点」两行，和正片幕布卡同一套视觉
HOOK_CARDS = [
    ("一天一款小工具", "持续更新不重样"),
    ("今天分享的这个", "新手也能上手"),
]

# 正片两张幕布卡
CARD_OPEN = ("起名字这事", "还是那几个字")
CARD_END = ("起名别硬凑", "让字自己说话")


def main():
    os.makedirs(FRAMES, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    tl = timeline.build()
    hstart, hend = tl["hook"]
    start, end, total = tl["start"], tl["end"], tl["total"]
    n_frames = int(round(total * FPS))
    print("时间轴:")
    for i in range(len(HOOK_CARDS)):
        print("  钩子%d %5.2f - %5.2f" % (i, hstart[i], hend[i]))
    for i in range(9):
        print("  句%d  %5.2f - %5.2f" % (i, start[i], end[i]))
    print("  总长 %.2fs / %d 帧" % (total, n_frames))

    subs = json.load(open(os.path.join(AUD, "lines.json"), encoding="utf-8"))
    sub_text = [x["text"] for x in subs]

    ctx = Ctx()
    print("已载入界面帧:", sorted(ctx.ui.keys()))

    S = start
    E = end
    HDUR = timeline.HOOK_DUR

    # 解锁后整页 9400 多高，滚到深处才看得出「一次出 20 个」
    SCROLL_DEEP1 = 2900
    SCROLL_DEEP2 = 5100

    def hook_frame(k, t):
        """开场钩子卡：小字先淡入，大字随后压上来，卡尾 0.2s 淡出到黑。"""
        lt = t - hstart[k]
        dur = HDUR[k]
        a_out = 1.0
        if lt > dur - 0.20:
            a_out = max(0.0, 1 - (lt - (dur - 0.20)) / 0.20)
        a1 = ease_io((lt - 0.10) / 0.55) * a_out if lt >= 0.10 else 0.0
        a2 = ease_io((lt - 0.72) / 0.62) * a_out if lt >= 0.72 else 0.0
        l1, l2 = HOOK_CARDS[k]
        return compose_curtain(ctx, l1, l2, a1, a2)

    def frame_at(t):
        # ---- 开场钩子 ----
        if t < S[0]:
            for k in range(len(HOOK_CARDS)):
                if hstart[k] <= t < hend[k] + timeline.GAP:
                    return hook_frame(k, t)
            return ctx.base.copy()

        # ---- 句0 开场幕布：问题 ----
        if t < S[1]:
            lt = t - S[0]
            a1 = ease_io((lt - 0.25) / 0.70) if lt >= 0.25 else 0.0
            a2 = ease_io((lt - 1.00) / 0.75) if lt >= 1.00 else 0.0
            fade = 1.0
            if lt > timeline.DUR[0] - 0.02:
                fade = max(0.0, 1 - (lt - (timeline.DUR[0] - 0.02)) / 0.22)
            return compose_curtain(ctx, CARD_OPEN[0], CARD_OPEN[1], a1 * fade, a2 * fade)

        # ---- 句1 界面淡入 ----
        if t < S[2]:
            a = ease_io((t - S[1]) / 0.42)
            return compose(ctx, "s_empty", 0, sub_text[1], ui_alpha=a)

        # ---- 句2 填姓 → 敲关键词 ----
        if t < S[3]:
            span = S[3] - S[2]
            if t < S[2] + span * 0.36:
                shot = "s_typed_1"
            elif t < S[2] + span * 0.70:
                shot = "s_typed_2"
            else:
                shot = "s_typed_3"
            return compose(ctx, shot, 0, sub_text[2])

        # ---- 句3 点按 → 生成 → 滚到结果 ----
        if t < S[4]:
            span = S[4] - S[3]
            if t < S[3] + 0.40:
                return compose(ctx, "s_btn_down", 0, sub_text[3])
            if t < S[3] + 0.58:
                return compose(ctx, "s_typed_3", 0, sub_text[3])
            if t < S[3] + 0.76:
                return compose(ctx, "s_r3_boy", 0, sub_text[3])
            p = ease_out((t - (S[3] + 0.76)) / max(0.01, span - 0.98))
            return compose(ctx, "s_r3_boy", lerp(0, SCROLL_LIST, p), sub_text[3])

        # ---- 句4 换类型：女孩 ----
        if t < S[5]:
            if t < S[4] + 0.42:
                return compose(ctx, "s_r3_boy", SCROLL_LIST, sub_text[4])
            p = ease_io((t - (S[4] + 0.42)) / 0.62)
            return compose(ctx, "s_girl", lerp(SCROLL_LIST - 560, SCROLL_LIST, p), sub_text[4])

        # ---- 句5 换关键词：月 光 ----
        if t < S[6]:
            if t < S[5] + 0.42:
                return compose(ctx, "s_girl", SCROLL_LIST, sub_text[5])
            p = ease_io((t - (S[5] + 0.42)) / 0.62)
            return compose(ctx, "s_moon", lerp(SCROLL_LIST - 560, SCROLL_LIST, p), sub_text[5])

        # ---- 句6 复制 ----
        if t < S[7]:
            if t < S[6] + 0.30:
                return compose(ctx, "s_moon", SCROLL_LIST, sub_text[6])
            if t < S[6] + 1.70:
                return compose(ctx, "s_copied", SCROLL_LIST, sub_text[6], toast="已复制")
            return compose(ctx, "s_moon", SCROLL_LIST, sub_text[6])

        # ---- 句7 解锁 20 个并下滚 ----
        if t < S[8]:
            if t < S[7] + 0.30:
                return compose(ctx, "s_unlocked", SCROLL_LIST, sub_text[7])
            if t < S[7] + 1.10:
                p = ease_io((t - (S[7] + 0.30)) / 0.80)
                return compose(ctx, "s_unlocked", lerp(SCROLL_LIST, SCROLL_DEEP1, p), sub_text[7])
            p = ease_out((t - (S[7] + 1.10)) / 0.95)
            return compose(ctx, "s_unlocked", lerp(SCROLL_DEEP1, SCROLL_DEEP2, p), sub_text[7])

        # ---- 句8 收尾 ----
        a = 0.0
        if t < S[8] + 0.50:
            a = max(0.0, 1 - (t - S[8]) / 0.50)
        if a > 0:
            return compose(ctx, "s_unlocked", SCROLL_DEEP2, None, ui_alpha=a)
        a1 = ease_io((t - (S[8] + 0.62)) / 0.72) if t > S[8] + 0.62 else 0.0
        a2 = ease_io((t - (S[8] + 1.36)) / 0.78) if t > S[8] + 1.36 else 0.0
        fade = 1.0
        if t > total - 0.55:
            fade = max(0.0, 1 - (t - (total - 0.55)) / 0.55)
        return compose_curtain(ctx, CARD_END[0], CARD_END[1], a1 * fade, a2 * fade)

    if "--stills" in sys.argv:
        st = os.path.join(HERE, "build", "stills")
        os.makedirs(st, exist_ok=True)
        pts = [0.9, 2.4, 3.6, 5.4, 7.2, 9.0, 10.2, 11.6, 13.0, 14.8,
               16.4, 18.0, 20.0, 22.2, 24.0, 26.0, 28.6, 31.0, 34.0, 37.0]
        for tt in pts:
            frame_at(tt).save(os.path.join(st, "t%05.1f.png" % tt))
        print("静帧已出:", st)
        return

    print("渲染 %d 帧…" % n_frames)
    for i in range(n_frames):
        t = i / FPS
        img = frame_at(t)
        img.save(os.path.join(FRAMES, "f%04d.png" % i))
        if i % 60 == 0:
            print("  %d/%d  (%.1fs)" % (i, n_frames, t), flush=True)

    print("编码…")
    video = os.path.join(OUT, "base.mp4")
    subprocess.run([
        FF, "-y", "-framerate", str(FPS), "-i", os.path.join(FRAMES, "f%04d.png"),
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", video
    ], check=True, capture_output=True)
    print("无声母版:", video)

    audio = os.path.join(AUD, "voice.wav")
    if os.path.exists(audio):
        final = os.path.join(OUT, "name-gen.mp4")
        subprocess.run([
            FF, "-y", "-i", video, "-i", audio,
            "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
            "-shortest", "-movflags", "+faststart", final
        ], check=True, capture_output=True)
        print("成片: %s  %.2fs" % (final, total))
    else:
        print("! 缺 voice.wav，先跑 build_audio.py")


if __name__ == "__main__":
    main()
