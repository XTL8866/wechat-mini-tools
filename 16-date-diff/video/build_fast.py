# -*- coding: utf-8 -*-
"""快版成片（约 21.4 秒）：python build_fast.py [--stills]

照 15-grid-cut/video/build_fast.py 的骨架，只换台词、截图序列、对比卡和封面文案。
  1. 20 秒讲完，7 句，语速 +28%
  2. 第一帧就是「掰指头数 vs 填两个日期」左右对比卡，叉勾都在第 0 帧
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

# 版面（设备像素，scroll=0 下量出来，见 build/measure.json）：
#   输入卡 266–572 / 算法 chips 689 / 算一下 926–1070
#   结果头 1137 / 大数字 1192–1419 / 标签行 1442–1531 / 「明细」1545–1575
#   四行明细 1722–2154 / 倒推卡 2265–2630 / 解锁卡 2702–2888 / 复制按钮 2934–3073
#   结果页 3578 高，窗口 1920 → 最大滚 1658
#
# 字幕横带 1620–1700。明细四行是紧挨着的，中间没有缝，所以只能把这一带
# 放在「标签行 → 明细」或「明细 → 倒推卡」的空隙上，或者让明细整体退出这一带。
SCROLL_TOP = 0        # 输入卡 + 大数字同框；空隙 1575–1722 正好接住字幕
SCROLL_ROWS = 554     # 四行明细 1168–1600，空隙 1600–1711，一行都不压
SCROLL_ROWS2 = 593    # 同上再往下带 39px，画面持续下移，不是静止图
SCROLL_REV = 1500     # 顶边落在「标签行 → 明细」的白缝里；倒推卡 765–1130、复制按钮 1434–1573 全在横带之上
SCROLL_FEB = 554      # 闰年那组：367 天 + 「1 年 0 月 1 天」+ 起始日 2024年2月29日

# (白字段, 黄字段) —— 黄字段是要点，最多 8 个字
SUB = [
    ("跨月算天数，", "最容易算错"),
    ("两个日期填进去，", "差几天立刻出"),
    ("扣掉周六周日，", "工作日也能数"),
    ("精确到", "几年几月几天"),
    ("三十个工作日，", "倒推是哪天"),
    ("闰年二月，", "它自己认"),
    ("你上次算错天数，", "是什么场合？"),
]


def ease_io(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def lerp(a, b, x):
    return a + (b - a) * x


class Ctx:
    def __init__(self):
        self.page = {}
        for k in ("s_empty", "s_filled", "s_nat", "s_work", "s_rev", "s_feb"):
            self.page[k] = Image.open(os.path.join(UI, k + ".png")).convert("RGB")
        self.base = Image.new("RGB", (W, H), BG)
        self.cache = {}
        self.pane_cache = {}

    def pane(self, shot, scroll=0):
        key = (shot, scroll)
        if key in self.pane_cache:
            return self.pane_cache[key]
        im = self.page[shot]
        maxy = max(0, im.height - UI_H)
        y = int(max(0, min(scroll, maxy)))
        out = Image.new("RGB", (W, UI_H), (255, 255, 255))
        out.paste(im.crop((0, y, W, y + min(UI_H, im.height - y))), (0, 0))
        if len(self.pane_cache) < 90:
            self.pane_cache[key] = out
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


def compose(ctx, base_img, seg=None):
    if not seg:
        return base_img
    canvas = base_img.convert("RGBA")
    canvas.alpha_composite(ctx.sub_layer(seg))
    return canvas.convert("RGB")


# ---------- 对比卡：左「掰指头硬数」红叉 / 右「填两个日期」绿勾 ----------
GAP = 22
SIDE = 50
CARD_W = (W - SIDE * 2 - GAP) // 2      # 479
CARD_H = 660
CARD_Y = 560
LEFT_X = SIDE
RIGHT_X = SIDE + CARD_W + GAP

BAD_TXT = ["跨月就漏一天", "闰年二月记不住", "数完还得验一遍"]
GOOD_TXT = ["填起止两个日期", "扣周末出工作日", "闰年自动认"]

DEMO_BAD = "算错"
DEMO_GOOD = "48 天"


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
    f = ImageFont.truetype(FONT_RG, 32)
    a = int(255 * alpha)

    d.text((34, 42), title, font=ft, fill=(mark_col + (a,)) if not ok else (90, 90, 96, a))

    ty = 150
    for i, ln in enumerate(lines):
        d.text((34, ty), ln, font=f, fill=(fg[0], fg[1], fg[2], int(a * (1.0 if i < 2 else 0.74))))
        ty += 86

    # 中间那块「结果」：左边一个算错的字，右边一个真实天数，一眼看出差别
    demo = DEMO_GOOD if ok else DEMO_BAD
    fd = ImageFont.truetype(FONT_BD, 62)
    bb = d.textbbox((0, 0), demo, font=fd)
    dx = (CARD_W - (bb[2] - bb[0])) // 2
    d.text((dx, 432), demo, font=fd, fill=fg + (a,))

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
    d.text((W // 2, 400), "算一段日期，两种算法", font=f,
           fill=DIM + (235,), anchor="mm")

    bad = _block("错 · 掰指头硬数", BAD_TXT, (26, 26, 30), (112, 112, 122),
                 RED, False, 1.0, True)
    good = _block("对 · 填两个日期", GOOD_TXT, (250, 250, 248), (18, 18, 22),
                  GREEN, True, 1.0, True)
    canvas.alpha_composite(bad, (LEFT_X, CARD_Y))
    canvas.alpha_composite(good, (RIGHT_X, CARD_Y))

    # 卡下补一行同一区间的坐标：不留一大块纯黑，也把「同一份输入」点明
    f2 = ImageFont.truetype(FONT_RG, 36)
    d.text((W // 2, 1320), "同一段 2026-11-13 → 2026-12-31", font=f2,
           fill=(118, 118, 128, 255), anchor="mm")

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

        # ---- 句1 两个日期填进去：日期和大数字同框 ----
        if t < S[2]:
            return compose(ctx, ctx.pane("s_nat", SCROLL_TOP), SUB[1])

        # ---- 句2 扣周末算工作日 ----
        if t < S[3]:
            return compose(ctx, ctx.pane("s_work", SCROLL_ROWS), SUB[2])

        # ---- 句3 精确到年月日：同一页继续往下带一点，不做硬跳 ----
        if t < S[4]:
            p = ease_io((t - S[3]) / 0.55)
            return compose(ctx, ctx.pane("s_nat", int(lerp(SCROLL_ROWS, SCROLL_ROWS2, p))), SUB[3])

        # ---- 句4 工作日倒推：继续滚到倒推卡 ----
        if t < S[5]:
            p = ease_io((t - S[4]) / 0.62)
            return compose(ctx, ctx.pane("s_rev", int(lerp(SCROLL_ROWS2, SCROLL_REV, p))), SUB[4])

        # ---- 句5 闰年二月：起始日就是 2024-02-29，精确跨度 1 年 0 月 1 天 ----
        if t < S[6]:
            return compose(ctx, ctx.pane("s_feb", SCROLL_FEB), SUB[5])

        # ---- 句6 提问收尾：回到顶部，日期和「35 个工作日」一起给 ----
        return compose(ctx, ctx.pane("s_work", SCROLL_TOP), SUB[6])

    if stills:
        ss = os.path.join(HERE, "build", "stills_fast")
        os.makedirs(ss, exist_ok=True)
        pts = [0.15, 4.6, 7.6, 10.6, 13.9, 16.3, 18.6, 20.6]
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
        if i % 90 == 0:
            print("  %d/%d" % (i, n), flush=True)
    proc.stdin.close()
    proc.wait()

    audio = os.path.join(AUD, "voice.wav")
    final = os.path.join(OUT, "date-diff-fast.mp4")
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
