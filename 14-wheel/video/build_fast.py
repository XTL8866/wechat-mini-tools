# -*- coding: utf-8 -*-
"""快版成片（约 21 秒）：python build_fast.py [--stills]

照 07-ref-gen/video/build_fast.py 的骨架，只换台词、截图序列、对比卡和封面文案。
  1. 21 秒讲完，7 句，语速 +28%
  2. 第一帧就是「群里问一圈 vs 转盘一转」左右对比卡，1 秒内叉勾都出来
  3. 字幕压在画面上（y=1660, 64px），关键词抖音黄 + 7px 黑描边，不用底板
  4. 结尾抛问题，不留金句

转盘转动：界面只截了 24 个 15° 角度的静态整页图，这里按缓出曲线挑帧，
只把圆盘那一块（858×859）贴回固定窗口 —— 指针和中心按钮本来就不随转盘转，
所以贴回去不用重画。
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
#   textarea 367–899 / 开始转 924–1040 / 转盘 1073–1932 / 结果卡 1968–2242
#   记录头 2295 / 五行记录 2403–2970 / 解锁卡 3034–3212
#   s_empty 3046 高，s_res 3115，s_hist 3536，窗口 1920
#
# SCROLL_WHEEL=873 → 转盘落在 200–1059，整只圆盘和结果卡（1095–1369）
# 都在字幕 y=1660 之上；上一屏的「开始转」按钮停在 51–167，也还看得见。
SCROLL_TOP = 0
SCROLL_WHEEL = 873
SCROLL_HIST = 1300

# (白字段, 黄字段) —— 黄字段是要点，最多 8 个字
SUB = [
    ("问一圈吃什么，", "还是没定"),
    ("不是选不出来，", "是没人拍板"),
    ("一行一个选项，", "最多十二个"),
    ("点一下中间，", "盘自己停"),
    ("指针停哪格，", "就算哪个"),
    ("转完自动记账，", "谁中得多"),
    ("你们组最常争的，", "是哪顿饭？"),
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
        meta = json.load(open(os.path.join(HERE, "build", "state.json"), encoding="utf-8"))
        self.meta = meta
        sp = meta["spin"]
        self.from_, self.to_ = sp["from"], sp["to"]
        self.base, self.step = sp["base"], sp["step"]
        self.nframe = sp["frames"]

        self.page = {}
        for k in ("s_empty", "s_opts", "s_res", "s_hist"):
            self.page[k] = Image.open(os.path.join(UI, k + ".png")).convert("RGB")

        self.disc_box = tuple(meta["disc"])
        self.disc = []
        for k in range(self.nframe):
            im = Image.open(os.path.join(UI, "sp_%02d.png" % k)).convert("RGB")
            self.disc.append(im.crop(self.disc_box))

        self.base_img = Image.new("RGB", (W, H), BG)
        self.cache = {}

    def pane(self, shot, scroll=0):
        im = self.page[shot]
        maxy = max(0, im.height - UI_H)
        y = int(max(0, min(scroll, maxy)))
        out = Image.new("RGB", (W, UI_H), (255, 255, 255))
        out.paste(im.crop((0, y, W, y + UI_H)), (0, 0))
        return out

    def spin_pane(self, scroll, bucket):
        """固定窗口 + 旋转到 bucket 的圆盘。第 0 张就是最终落点角。"""
        out = self.pane("s_opts", scroll)
        x0, y0, x1, y1 = self.disc_box
        out.paste(self.disc[bucket], (x0, y0 - int(scroll)))
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


# ---------- 对比卡：左「群里问一圈」红叉 / 右「转盘一转」绿勾 ----------
GAP = 22
SIDE = 50
CARD_W = (W - SIDE * 2 - GAP) // 2      # 479
CARD_H = 660
CARD_Y = 580
LEFT_X = SIDE
RIGHT_X = SIDE + CARD_W + GAP

BAD_TXT = ["问了三遍没人拍板", "有人来回改主意", "最后还是「随便」"]
GOOD_TXT = ["选项贴进去就转", "指针停哪就算哪", "结果自动记下来"]


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
    demo = "随便" if not ok else "火锅"
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
    """0 秒起的开场。第一帧就是完整的左右对比卡：两块底板、两行说明、
    手绘红叉和绿勾全在。不做渐入式空卡 —— 头 0.3 秒只有两块空色块，
    等于又回到「纯色卡开场」，也满足不了「第一帧必须是对比卡」。"""
    canvas = ctx.base_img.copy().convert("RGBA")
    d = ImageDraw.Draw(canvas)

    f = ImageFont.truetype(FONT_RG, 42)
    d.text((W // 2, 420), "五个人，两分钟，定不下一顿饭", font=f,
           fill=DIM + (235,), anchor="mm")

    bad = _block("错 · 群里问一圈", BAD_TXT, (26, 26, 30), (112, 112, 122),
                 RED, False, 1.0, True)
    good = _block("对 · 转盘一转", GOOD_TXT, (250, 250, 248), (18, 18, 22),
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
    spin_dur = min(2.05, max(0.8, (S[4] - S[3]) - 0.12))
    print("  转盘 %.2fs  %.1f° → %.1f°（空转 %d 圈）" % (
        spin_dur, ctx.from_, ctx.to_, int(round((ctx.to_ - ctx.from_) / 360)) - 1))

    def bucket_of(rot):
        return int(round((rot - ctx.base) / ctx.step)) % ctx.nframe

    def frame_at(t):
        # ---- 句0 对比卡 ----
        if t < S[1]:
            return compare_card(ctx, SUB[0])

        # ---- 句1 空态：转盘里只有一行「先写两个以上的选项」 ----
        if t < S[2]:
            return compose(ctx, ctx.pane("s_empty", SCROLL_TOP), SUB[1])

        # ---- 句2 填好的选项 + 开始转，句尾顺势滚到整只转盘 ----
        if t < S[3]:
            p = ease_io((t - (S[3] - 0.62)) / 0.62)
            return compose(ctx, ctx.pane("s_opts", int(lerp(SCROLL_TOP, SCROLL_WHEEL, p))), SUB[2])

        # ---- 句3 转：缓出曲线挑帧，末帧正好是落点角 ----
        if t < S[4]:
            x = (t - S[3]) / spin_dur
            if x >= 1:
                return compose(ctx, ctx.pane("s_res", SCROLL_WHEEL), SUB[3])
            e = 1 - (1 - x) ** 3.2
            rot = ctx.from_ + (ctx.to_ - ctx.from_) * e
            return compose(ctx, ctx.spin_pane(SCROLL_WHEEL, bucket_of(rot)), SUB[3])

        # ---- 句4 停稳：结果卡写着「火锅」 ----
        if t < S[5]:
            return compose(ctx, ctx.pane("s_res", SCROLL_WHEEL), SUB[4])

        # ---- 句5 滚到记录：五条 + 谁中得多 ----
        if t < S[6]:
            p = ease_io((t - S[5]) / 0.42)
            return compose(ctx, ctx.pane("s_hist", int(lerp(SCROLL_WHEEL, SCROLL_HIST, p))), SUB[5])

        # ---- 句6 提问收尾：硬切回结果卡，不做过场 ----
        return compose(ctx, ctx.pane("s_res", SCROLL_WHEEL), SUB[6])

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
    final = os.path.join(OUT, "wheel-fast.mp4")
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
