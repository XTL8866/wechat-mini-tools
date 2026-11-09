# -*- coding: utf-8 -*-
"""快版成片（约 20.5 秒）：python build_fast.py [--stills]

和原版的区别：
  1. 22 秒讲完，7 句，语速 +28%
  2. 第一帧就是「错误格式 vs 国标格式」对比卡，不再用纯文字卡开场
  3. 字幕压在画面上（y=1560），关键词抖音黄
  4. 结尾抛问题，不留金句
"""
import json
import os
import subprocess
import sys

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFilter, ImageFont

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
YELLOW = (255, 225, 0)
DIM = (150, 150, 160)
GREEN = (32, 190, 112)
RED = (235, 74, 74)

FONT_BD = "C:/Windows/Fonts/msyhbd.ttc"
FONT_RG = "C:/Windows/Fonts/msyh.ttc"

SUB_SIZE = 64
SUB_Y = 1660

SCROLL_TOP = 0
SCROLL_BUILT = 470
SCROLL_BOOK = 632
SCROLL_LIST = 690
SCROLL_COPY = 790
SCROLL_END = 1030

# (白字段, 黄字段) —— 黄字段是要点，最多 8 个字
SUB = [
    ("格式错了，", "导师一眼看出"),
    ("选类型，填", "年卷期页"),
    ("点一下，", "国标格式拼好"),
    ("换专著，", "版本出版地照样对"),
    ("换英文，", "姓前名缩写"),
    ("全选复制，", "就是编号列表"),
    ("", "你被挑过最离谱的错？"),
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


# ---------- 对比卡：错误格式 vs 国标格式 ----------
CARD_W = 920
CARD_X = (W - CARD_W) // 2
BAD_TXT = ["王小明 张三 深度学习综述", "计算机学报 2021 44卷3期"]
GOOD_TXT = ["王小明, 张三. 深度学习综述[J].", "计算机学报, 2021, 44(3): 1-20."]


def draw_x(d, cx, cy, r, col, w=8):
    d.line([cx - r, cy - r, cx + r, cy + r], fill=col, width=w)
    d.line([cx + r, cy - r, cx - r, cy + r], fill=col, width=w)


def draw_check(d, cx, cy, r, col, w=8):
    d.line([cx - r, cy + r * 0.05, cx - r * 0.25, cy + r * 0.8], fill=col, width=w, joint="curve")
    d.line([cx - r * 0.25, cy + r * 0.8, cx + r, cy - r * 0.75], fill=col, width=w, joint="curve")


def _block(title, lines, bg, fg, mark, mark_col, y, h, ok):
    """画一块对比卡。ok=True 时右上角打绿勾，否则打红叉。"""
    card = Image.new("RGBA", (CARD_W, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    d.rounded_rectangle([0, 0, CARD_W - 1, h - 1], radius=28, fill=bg)

    ft = ImageFont.truetype(FONT_RG, 30)
    d.text((44, 34), title, font=ft, fill=(mark_col + (235,)) if not ok else (90, 90, 96, 235))

    f = ImageFont.truetype(FONT_RG if ok else FONT_RG, 40)
    ty = 96
    for ln in lines:
        d.text((44, ty), ln, font=f, fill=fg + (255,))
        ty += 62

    return card


def compare_card(ctx, lt, sub):
    """0–3 秒的开场对比卡。分三步出现：卡 → 红叉 → 绿勾。"""
    canvas = ctx.base.copy().convert("RGBA")
    d = ImageDraw.Draw(canvas)

    # 顶部引子
    a0 = ease_out((lt - 0.05) / 0.30)
    if a0 > 0:
        f = ImageFont.truetype(FONT_RG, 40)
        d.text((W // 2, 480), "同一篇文献，两种写法", font=f,
               fill=DIM + (int(235 * a0),), anchor="mm")

    # 上：错误版
    a1 = ease_out((lt - 0.10) / 0.30)
    if a1 > 0:
        bad = _block("你的写法", BAD_TXT, (26, 26, 30), (118, 118, 128), "", RED, 0, 380, False)
        if lt > 1.02:
            draw_x(ImageDraw.Draw(bad), CARD_W - 66, 52, 20, RED + (255,))
        canvas.alpha_composite(bad, (CARD_X, 560))

    # 下：国标版
    a2 = ease_out((lt - 0.52) / 0.32)
    if a2 > 0:
        good = _block("国标写法", GOOD_TXT, (250, 250, 248), (18, 18, 22), "", GREEN, 0, 380, True)
        if lt > 1.58:
            draw_check(ImageDraw.Draw(good), CARD_W - 66, 52, 22, GREEN + (255,))
        good.putalpha(good.getchannel("A").point(lambda v: int(v * a2)))
        canvas.alpha_composite(good, (CARD_X, 980))

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
            return compare_card(ctx, t - S[0], SUB[0])

        # ---- 句1 空表单 → 一秒填满 ----
        if t < S[2]:
            if t < S[1] + 0.85:
                p = ease_out((t - S[1]) / 0.85)
                return compose(ctx, "s_empty", int(lerp(0, 46, p)), SUB[1])
            return compose(ctx, "s_filled", SCROLL_TOP, SUB[1])

        # ---- 句2 点生成，滚到结果 ----
        if t < S[3]:
            p = ease_io((t - S[2]) / 0.38)
            return compose(ctx, "s_built", lerp(SCROLL_TOP, SCROLL_BUILT, p), SUB[2])

        # ---- 句3 换专著 ----
        if t < S[4]:
            p = ease_io((t - S[3]) / 0.38)
            return compose(ctx, "s_book", lerp(SCROLL_BUILT, SCROLL_BOOK, p), SUB[3])

        # ---- 句4 换英文 ----
        if t < S[5]:
            p = ease_io((t - S[4]) / 0.38)
            return compose(ctx, "s_en", lerp(SCROLL_BOOK, SCROLL_LIST, p), SUB[4])

        # ---- 句5 全选复制 ----
        if t < S[6]:
            p = ease_io((t - S[5]) / 0.32)
            scroll = lerp(SCROLL_LIST, SCROLL_COPY, p)
            toast = "已复制 3 条" if S[5] + 0.55 <= t < S[5] + 1.75 else None
            return compose(ctx, "s_copied", scroll, SUB[5], toast=toast)

        # ---- 句6 解锁 → 提问收尾 ----
        p = ease_io((t - S[6]) / 0.42)
        return compose(ctx, "s_unlock", lerp(SCROLL_COPY, SCROLL_END, p), SUB[6])

    if stills:
        ss = os.path.join(HERE, "build", "stills_fast")
        os.makedirs(ss, exist_ok=True)
        pts = [0.6, 1.2, 2.0, 2.9, 4.2, 5.8, 7.4, 9.4, 11.2, 13.0,
               14.6, 16.2, 17.6, 18.8, 19.8]
        for i, p in enumerate(pts):
            frame_at(p).save(os.path.join(ss, "t%02d_%04.1f.png" % (i, p)))
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
    final = os.path.join(OUT, "ref-gen-fast.mp4")
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
