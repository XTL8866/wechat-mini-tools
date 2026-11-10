# -*- coding: utf-8 -*-
"""快版成片（约 21 秒）：python build_fast.py [--stills]

照 07-ref-gen/video/build_fast.py 的骨架，只换台词、截图序列、对比卡和封面文案。
  1. 21 秒讲完，7 句，语速 +28%
  2. 第一帧就是「白字压浅底 vs 黑字压浅底」左右对比卡，1 秒内叉勾都出来
  3. 字幕压在画面上（y=1660, 64px），关键词抖音黄 + 7px 黑描边，不用底板
  4. 结尾抛问题，不留金句
"""
import json
import os
import subprocess
import sys

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

import timeline_fast as TL

HERE = os.path.dirname(os.path.abspath(__file__))
UI = os.path.join(HERE, "build", "ui")
AUD = os.path.join(HERE, "build", "audio_fast")
FRAMES = os.path.join(HERE, "build", "frames_fast")
OUT = os.path.join(HERE, "out")
FF = imageio_ffmpeg.get_ffmpeg_exe()

W, H = 1080, 1920
UI_H = 1920
FPS = 30

BG = (10, 10, 12)
INK = (255, 255, 255)
YELLOW = (255, 225, 0)          # #FFE100
DIM = (150, 150, 160)
GREEN = (32, 190, 112)
RED = (235, 74, 74)

FONT_BD = "C:/Windows/Fonts/msyhbd.ttc"
FONT_RG = "C:/Windows/Fonts/msyh.ttc"

SUB_SIZE = 64
SUB_Y = 1660

# 测量自 measure.py（设备像素），窗口 1920：
#   画布 266–1319 / 输入 1426–1714 / 生成按钮 3153–3297
#   结果头 3358 / 元信息 3516 / 两条对比度 3544–3656 / 保存 3693–3831 / 解锁 3875–4060
#   页高 4259（有结果）/ 3658（空态），最大滚动 2339 / 1738
# section 边界：字号 1757–2001 / 字体 2043–2221 / 颜色 2265–2522 / 位置 2564–2741
# SCROLL_RES=2255 落在「字体下沿 2221 → 颜色上沿 2265」这 44px 白缝里，
# 窗口上边不切 chip；下边 4175 刚过 footer 下沿 4174，也不切半行字。
# 结果头 → 保存按钮整段落在窗口 1103–1576，全部在字幕 y=1660 之上。
SCROLL_TOP = 0
SCROLL_RES = 2255

# (白字段, 黄字段) —— 黄字段是要点，最多 8 个字
SUB = [
    ("白字压浅底，", "等于没写"),
    ("不是字号小，", "颜色撞上了"),
    ("浅底给黑字，", "深底给白字"),
    ("字数变多，", "字号自己缩"),
    ("加一道描边，", "压哪都清楚"),
    ("点一下，", "头像存好了"),
    ("你头像上写的，", "名字还是外号？"),
]


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
                self.ui[f[:-4]] = Image.open(os.path.join(UI, f)).convert("RGB")
        self.base = Image.new("RGB", (W, H), BG)
        self.cache = {}

    def pane(self, shot, scroll=0):
        im = self.ui[shot]
        maxy = max(0, im.height - UI_H)
        y = int(max(0, min(scroll, maxy)))
        out = Image.new("RGB", (W, UI_H), (255, 255, 255))
        out.paste(im.crop((0, y, W, y + min(UI_H, im.height))), (0, 0))
        return out

    # ---------- 字幕：白字段 + 黄字段，压在画面上 ----------
    def sub_layer(self, seg):
        if seg in self.cache:
            return self.cache[seg]
        a, b = seg
        fw = ImageFont.truetype(FONT_RG, SUB_SIZE)
        fb = ImageFont.truetype(FONT_BD, SUB_SIZE)
        tmp = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
        w1 = tmp.textlength(a, font=fw) if a else 0
        w2 = tmp.textlength(b, font=fb) if b else 0
        total = w1 + w2
        x0 = (W - total) / 2

        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)

        # 先画一层下沉的黑描边当投影，再画字本身的黑描边 —— 不用底板，
        # 底板在任何浅色界面上都会糊成一块灰，比字本身还显眼
        for dy, alpha in ((5, 110), (0, 255)):
            if a:
                d.text((x0, SUB_Y + dy), a, font=fw, fill=(0, 0, 0, alpha),
                       stroke_width=9, stroke_fill=(0, 0, 0, alpha), anchor="lm")
            if b:
                d.text((x0 + w1, SUB_Y + dy), b, font=fb, fill=(0, 0, 0, alpha),
                       stroke_width=9, stroke_fill=(0, 0, 0, alpha), anchor="lm")
        if a:
            d.text((x0, SUB_Y), a, font=fw, fill=INK + (255,),
                   stroke_width=7, stroke_fill=(12, 12, 14, 255), anchor="lm")
        if b:
            d.text((x0 + w1, SUB_Y), b, font=fb, fill=YELLOW + (255,),
                   stroke_width=7, stroke_fill=(12, 12, 14, 255), anchor="lm")

        self.cache[seg] = layer
        return layer

    def toast_layer(self, text):
        key = "_t_" + text
        if key in self.cache:
            return self.cache[key]
        f = ImageFont.truetype(FONT_BD, 44)
        tmp = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
        bb = tmp.textbbox((0, 0), text, font=f)
        w, h = bb[2] - bb[0] + 96, bb[3] - bb[1] + 58
        layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.rounded_rectangle([0, 0, w - 1, h - 1], radius=18, fill=(16, 16, 20, 238))
        d.text((w // 2, h // 2 + 2), text, font=f, fill=INK + (255,), anchor="mm")
        self.cache[key] = layer
        return layer


def compose(ctx, shot, scroll, seg=None, toast=None):
    canvas = ctx.base.copy()
    if shot is not None:
        canvas.paste(ctx.pane(shot, scroll), (0, 0))
    if seg or toast:
        canvas = canvas.convert("RGBA")
        if seg:
            canvas.alpha_composite(ctx.sub_layer(seg))
        if toast:
            tl = ctx.toast_layer(toast)
            canvas.alpha_composite(tl, (W // 2 - tl.width // 2, 800))
        canvas = canvas.convert("RGB")
    return canvas


# ---------- 对比卡：左「白字压浅底」红叉 / 右「黑字压浅底」绿勾 ----------
GAP = 22
SIDE = 50
CARD_W = (W - SIDE * 2 - GAP) // 2      # 479
CARD_H = 660
CARD_Y = 580
LEFT_X = SIDE
RIGHT_X = SIDE + CARD_W + GAP

BAD_TXT = ["浅底图 + 白字", "对比度 1.1 : 1", "字被背景吃掉了"]
GOOD_TXT = ["浅底图 + 黑字", "对比度 14.2 : 1", "一眼就能认出来"]


def draw_x(d, cx, cy, r, col, w=10):
    """手绘红叉：字体没有 ✗ 字形，必须画线段。"""
    d.line([cx - r, cy - r, cx + r, cy + r], fill=col, width=w)
    d.line([cx + r, cy - r, cx - r, cy + r], fill=col, width=w)


def draw_check(d, cx, cy, r, col, w=10):
    """手绘绿勾：字体没有 ✓ 字形，必须画线段。"""
    d.line([cx - r, cy + r * 0.05, cx - r * 0.25, cy + r * 0.8], fill=col, width=w, joint="curve")
    d.line([cx - r * 0.25, cy + r * 0.8, cx + r, cy - r * 0.75], fill=col, width=w, joint="curve")


def _block(title, lines, bg, fg, mark_col, ok, alpha, mark_on):
    """画一块对比卡。底板始终在，文字随 alpha 渐入，叉/勾到点才画。"""
    card = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    d.rounded_rectangle([0, 0, CARD_W - 1, CARD_H - 1], radius=30, fill=bg)

    ft = ImageFont.truetype(FONT_BD, 34)
    f = ImageFont.truetype(FONT_RG, 34)
    fs = ImageFont.truetype(FONT_RG, 27)
    a = int(255 * alpha)

    d.text((34, 42), title, font=ft, fill=(mark_col + (a,)) if not ok else (90, 90, 96, a))

    ty = 148
    for i, ln in enumerate(lines):
        d.text((34, ty), ln, font=f if i < 2 else fs,
               fill=fg + (a,) if i < 2 else (fg[0], fg[1], fg[2], int(a * 0.72)))
        ty += 92 if i < 2 else 80

    # 中间那块「示意文字」：左灰字压深底几乎看不见，右黑字压浅底很清楚
    demo = "中秋快乐"
    fd = ImageFont.truetype(FONT_BD, 58)
    bb = d.textbbox((0, 0), demo, font=fd)
    dx = (CARD_W - (bb[2] - bb[0])) // 2
    d.text((dx, 430), demo, font=fd, fill=fg + (a,))

    if mark_on:
        cx, cy = CARD_W - 62, 434
        if ok:
            draw_check(d, cx, cy, 30, GREEN + (255,))
        else:
            draw_x(d, cx, cy, 26, RED + (255,))
    return card


def compare_card(ctx, t, sub):
    """0–3.55 秒的开场。t 是绝对时间。

    第一帧就是完整的左右对比卡：两块底板、两行说明、手绘红叉和绿勾全在。
    不做渐入式空卡 —— 头 0.3 秒只有两块空色块，等于又回到「纯色卡开场」，
    也满足不了「第一帧必须是对比卡」「1 秒内两块都出来」。
    """
    canvas = ctx.base.copy().convert("RGBA")
    d = ImageDraw.Draw(canvas)

    f = ImageFont.truetype(FONT_RG, 42)
    d.text((W // 2, 420), "同一张图，两种字色", font=f,
           fill=DIM + (235,), anchor="mm")

    a1 = 1.0
    a2 = 1.0
    bad = _block("错 · 白字压浅底", BAD_TXT, (26, 26, 30), (112, 112, 122),
                 RED, False, a1, True)
    good = _block("对 · 黑字压浅底", GOOD_TXT, (250, 250, 248), (18, 18, 22),
                  GREEN, True, a2, True)
    canvas.alpha_composite(bad, (LEFT_X, CARD_Y))
    canvas.alpha_composite(good, (RIGHT_X, CARD_Y))

    if sub:
        canvas.alpha_composite(ctx.sub_layer(sub))
    return canvas.convert("RGB")


def main():
    stills = "--stills" in sys.argv
    os.makedirs(FRAMES, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)

    tl = TL.build()
    S, E, total = tl["start"], tl["end"], tl["total"]
    n = int(round(total * FPS))
    print("时间轴:")
    for i in range(7):
        print("  句%d  %5.2f - %5.2f  %s%s" % (i, S[i], E[i], SUB[i][0], SUB[i][1]))
    print("  总长 %.2fs / %d 帧" % (total, n))

    ctx = Ctx()

    def frame_at(t):
        # ---- 句0 对比卡 ----
        if t < S[1]:
            return compare_card(ctx, t, SUB[0])

        # ---- 句1 浅底白字：从画布滚到结果区，露 1.1:1 红条 ----
        if t < S[2]:
            p = ease_io((t - S[1]) / 0.55)
            return compose(ctx, "s_bad", lerp(SCROLL_TOP, SCROLL_RES, p), SUB[1])

        # ---- 句2 自动配色：浅底黑字（结果区）→ 深底白字（画布） ----
        if t < S[3]:
            if t < (S[2] + S[3]) / 2:
                return compose(ctx, "s_auto", SCROLL_RES, SUB[2])
            return compose(ctx, "s_dark", SCROLL_TOP, SUB[2])

        # ---- 句3 字数变多：从结果区滚回画布，看两行字不出框 ----
        if t < S[4]:
            p = ease_io((t - S[3]) / 0.42)
            return compose(ctx, "s_long", lerp(SCROLL_RES, SCROLL_TOP, p), SUB[3])

        # ---- 句4 白字 + 粗描边压浅底，同版式硬切 ----
        if t < S[5]:
            return compose(ctx, "s_stroke", SCROLL_TOP, SUB[4])

        # ---- 句5 存到相册 ----
        if t < S[6]:
            p = ease_io((t - S[5]) / 0.40)
            scroll = lerp(SCROLL_TOP, SCROLL_RES, p)
            toast = "已存到相册" if S[5] + 0.62 <= t < S[5] + 1.85 else None
            return compose(ctx, "s_saved", scroll, SUB[5], toast=toast)

        # ---- 句6 提问收尾：停在结果区，同版式硬切，不做过场 ----
        return compose(ctx, "s_saved", SCROLL_RES, SUB[6])

    if stills:
        ss = os.path.join(HERE, "build", "stills_fast")
        os.makedirs(ss, exist_ok=True)
        pts = [0.2, 0.8, 1.6, 3.0, 4.2, 5.6, 7.0, 8.4, 9.8, 11.2,
               12.8, 14.2, 15.8, 17.4, 18.8, 20.2]
        for i, pnt in enumerate(pts):
            frame_at(pnt).save(os.path.join(ss, "t%02d_%04.1f.png" % (i, pnt)))
        print("静帧 ->", ss)
        return

    print("渲染 %d 帧…" % n)
    video = os.path.join(OUT, "base_fast.mp4")
    cmd = [FF, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", "%dx%d" % (W, H), "-r", str(FPS), "-i", "-",
           "-c:v", "libx264", "-preset", "medium", "-crf", "19",
           "-pix_fmt", "yuv420p", video]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL)
    for i in range(n):
        proc.stdin.write(frame_at(i / FPS).tobytes())
        if i % 60 == 0:
            print("  %d/%d" % (i, n), flush=True)
    proc.stdin.close()
    proc.wait()

    audio = os.path.join(AUD, "voice.wav")
    final = os.path.join(OUT, "avatar-text-fast.mp4")
    if os.path.exists(audio):
        subprocess.run([FF, "-y", "-i", video, "-i", audio,
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
                        "-shortest", "-movflags", "+faststart", final],
                       check=True, capture_output=True)
        print("成片:", final)
    else:
        print("缺音轨，先跑 build_audio_fast.py。已出无声版:", video)


if __name__ == "__main__":
    main()
