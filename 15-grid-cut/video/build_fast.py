# -*- coding: utf-8 -*-
"""快版成片（约 20.4 秒）：python build_fast.py [--stills]

照 14-wheel/video/build_fast.py 的骨架，只换台词、截图序列、对比卡和封面文案。
  1. 20 秒讲完，7 句，语速 +28%
  2. 第一帧就是「整张图直接发 vs 先切九张」左右对比卡，叉勾都在第 0 帧
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

# 版面（设备像素，scroll=0 下量出来）：
#   预览图 266–1009 / 切法 1186 / 白边 1473 / 切成按钮 1692–1836
#   结果头 1704 / 九张图板 1896–2901 / 保存按钮 3009–3147 / 解锁卡 3396–3582
#   s_empty 2351 高，s_ready 2188，s_cut 3888，s_grid2 3885，窗口 1920
#
# 准备页要滚 264：顶边正好落在预览图顶沿（266），主按钮升到 1428–1572，
# 落在字幕 y=1660 之上。不滚的话按钮 1692–1836 会被字幕劈成两半。
# 切完之后大蓝按钮会收起来（换成标题旁的「重新切」文字链），结果页只剩一个「保存」主按钮。
#
# SCROLL_BOARD=1610 → 结果头 46，九张图板 238–1243，说明 1269，
# 保存按钮 1351–1490，解锁卡 1739 起 —— 关键内容全在字幕 y=1660 之上，顶边也不切灰字。
SCROLL_TOP = 0
SCROLL_READY = 264
SCROLL_BOARD = 1610
SCROLL_IN = 1100                 # 滚进图板的起点

# (白字段, 黄字段) —— 黄字段是要点，最多 8 个字
SUB = [
    ("发歪了，", "问题在整张图"),
    ("一张 4:3，", "被裁成方块"),
    ("切成九格，", "每格取自己那块"),
    ("留一圈白边，", "排开不粘连"),
    ("想放大，", "就切四格"),
    ("九张一次存完，", "不用来回点"),
    ("最后一张，", "你一般放什么？"),
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
        self.page = {}
        for k in ("s_empty", "s_ready", "s_cut", "s_pad", "s_grid2", "s_saved", "s_unlock"):
            self.page[k] = Image.open(os.path.join(UI, k + ".png")).convert("RGB")
        self.base = Image.new("RGB", (W, H), BG)
        self.cache = {}

    def pane(self, shot, scroll=0):
        im = self.page[shot]
        maxy = max(0, im.height - UI_H)
        y = int(max(0, min(scroll, maxy)))
        out = Image.new("RGB", (W, UI_H), (255, 255, 255))
        out.paste(im.crop((0, y, W, y + UI_H)), (0, 0))
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


def compose(ctx, base_img, seg=None, toast=None):
    if not seg and not toast:
        return base_img
    canvas = base_img.convert("RGBA")
    if seg:
        canvas.alpha_composite(ctx.sub_layer(seg))
    if toast:
        tl = ctx.toast_layer(toast)
        canvas.alpha_composite(tl, (W // 2 - tl.width // 2, 800))
    return canvas.convert("RGB")


# ---------- 对比卡：左「整张图直接发」红叉 / 右「先切九张」绿勾 ----------
GAP = 22
SIDE = 50
CARD_W = (W - SIDE * 2 - GAP) // 2      # 479
CARD_H = 660
CARD_Y = 580
LEFT_X = SIDE
RIGHT_X = SIDE + CARD_W + GAP

BAD_TXT = ["平台裁成方块", "九张挤成一张", "顺序全乱"]
GOOD_TXT = ["切成 3×3 九张", "每张都是方的", "顺序按行排"]

DEMO_BAD = "1 张"
DEMO_GOOD = "9 张"


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

    # 中间那块「张数」：左边一张，右边九张，一眼看出差别
    demo = DEMO_GOOD if ok else DEMO_BAD
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


def compare_card(ctx, sub):
    """0 秒起的开场。第一帧就是完整的左右对比卡：两块底板、三行字、
    手绘红叉和绿勾全在。不做渐入式空卡 —— 头 0.3 秒只有两块空色块，
    等于又回到「纯色卡开场」，也满足不了「第一帧必须是对比卡」。"""
    canvas = ctx.base.copy().convert("RGBA")
    d = ImageDraw.Draw(canvas)

    f = ImageFont.truetype(FONT_RG, 42)
    d.text((W // 2, 420), "同一张图，两种发法", font=f,
           fill=DIM + (235,), anchor="mm")

    bad = _block("错 · 整张图直接发", BAD_TXT, (26, 26, 30), (112, 112, 122),
                 RED, False, 1.0, True)
    good = _block("对 · 先切九张", GOOD_TXT, (250, 250, 248), (18, 18, 22),
                  GREEN, True, 1.0, True)
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
            return compare_card(ctx, SUB[0])

        # ---- 句1 一张 4:3：左右被裁的部分压暗，网格线已经在图上 ----
        if t < S[2]:
            return compose(ctx, ctx.pane("s_ready", SCROLL_READY), SUB[1])

        # ---- 句2 切成九格：一进来就往下滚到九张图板 ----
        if t < S[3]:
            p = ease_io((t - S[2]) / 0.50)
            return compose(ctx, ctx.pane("s_cut", int(lerp(SCROLL_IN, SCROLL_BOARD, p))), SUB[2])

        # ---- 句3 留白：同一位置换成宽白边 ----
        if t < S[4]:
            return compose(ctx, ctx.pane("s_pad", SCROLL_BOARD), SUB[3])

        # ---- 句4 切四格 ----
        if t < S[5]:
            return compose(ctx, ctx.pane("s_grid2", SCROLL_BOARD), SUB[4])

        # ---- 句5 已保存 ----
        if t < S[6]:
            return compose(ctx, ctx.pane("s_saved", SCROLL_BOARD), SUB[5])

        # ---- 句6 提问收尾：回到九张图板 ----
        return compose(ctx, ctx.pane("s_cut", SCROLL_BOARD), SUB[6])

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
    final = os.path.join(OUT, "grid-cut-fast.mp4")
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
