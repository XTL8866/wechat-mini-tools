# -*- coding: utf-8 -*-
"""封面 1080x1440。文字全部落在 180-1260 区间，被裁成 1:1 时也不会切到字。
   卡片取的是「取色结果卡」那一段：色块 + hex + 色名 + 三种写法，
   缩到 940 宽刚好能看清，比放整页缩略图更有信息量。
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
UI = os.path.join(HERE, "build", "ui", "s_pick1.png")
OUT = os.path.join(HERE, "out", "cover.png")

W, H = 1080, 1440
BG = (10, 10, 12)
INK = (242, 238, 230)
DIM = (150, 150, 160)
RED = (255, 77, 61)

F_BD = "C:/Windows/Fonts/msyhbd.ttc"
F_RG = "C:/Windows/Fonts/msyh.ttc"

f_tag = ImageFont.truetype(F_RG, 38)
f_big = ImageFont.truetype(F_BD, 104)
f_sub = ImageFont.truetype(F_RG, 34)

# 卡片源区域：从取色结果卡的顶边开始，到「这张图的主色」标题前收住
SRC_TOP, SRC_H = 1292, 608
CARD_W = 940
FADE_H = 150

canvas = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(canvas)

d.text((72, 190), "取色 · 工具 №06", font=f_tag, fill=DIM)

src = Image.open(UI).convert("RGB")
card = src.crop((0, SRC_TOP, 1080, SRC_TOP + SRC_H))
cw = CARD_W
ch = int(card.height * cw / card.width)
card = card.resize((cw, ch), Image.LANCZOS)

# 底部渐白：让截断看起来是内容继续，而不是被切坏
grad = Image.new("L", (1, FADE_H))
for i in range(FADE_H):
    grad.putpixel((0, i), int(255 * (i / (FADE_H - 1)) ** 1.15))
card.paste(Image.new("RGB", (cw, FADE_H), (255, 255, 255)),
           (0, ch - FADE_H), grad.resize((cw, FADE_H)))

mask = Image.new("L", (cw, ch), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=26, fill=255)
canvas.paste(card, ((W - cw) // 2, 262), mask)

d.text((72, 838), "点哪儿", font=f_big, fill=INK)
d.text((72, 992), "取哪儿", font=f_big, fill=RED)
d.text((72, 1130), "HEX / RGB / HSL 一起给 · 主色自己扫", font=f_sub, fill=DIM)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
canvas.save(OUT)
print("封面:", OUT, canvas.size)
