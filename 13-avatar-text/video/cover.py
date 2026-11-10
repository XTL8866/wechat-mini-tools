# -*- coding: utf-8 -*-
"""封面 1080x1440。文字全部落在 180-1260 区间，被裁成 1:1 时也不会切到字。
   卡片取「浅底图 + 自动挑的黑字」那一段真实产出，比放整页缩略图更有信息量。
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
UI = os.path.join(HERE, "build", "ui", "s_auto.png")
OUT = os.path.join(HERE, "out", "cover-fast.png")

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

# 画布在长图里是 266–1319，文字落在约 929–1245。
# 裁 780–1310 刚好带上完整的字和一点浅底，上下都不切笔画。
SRC_TOP, SRC_H = 780, 530
CARD_W = 960
FADE_H = 0

canvas = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(canvas)

d.text((72, 176), "头像文字贴纸 · 工具 №13", font=f_tag, fill=DIM)

src = Image.open(UI).convert("RGB")
card = src.crop((0, SRC_TOP, 1080, SRC_TOP + SRC_H))
cw = CARD_W
ch = int(card.height * cw / card.width)
card = card.resize((cw, ch), Image.LANCZOS)

if FADE_H > 0:
    grad = Image.new("L", (1, FADE_H))
    for i in range(FADE_H):
        grad.putpixel((0, i), int(255 * (i / (FADE_H - 1)) ** 1.15))
    card.paste(Image.new("RGB", (cw, FADE_H), (255, 255, 255)),
               (0, ch - FADE_H), grad.resize((cw, FADE_H)))

mask = Image.new("L", (cw, ch), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=26, fill=255)
canvas.paste(card, ((W - cw) // 2, 240), mask)

# 快版封面：写后果，不写功能
d.text((72, 790), "换了三张头像", font=f_big, fill=INK)
d.text((72, 936), "字都看不清", font=f_big, fill=RED)
d.text((72, 1090), "浅底给黑字 · 深底给白字 · 只看文字那块背景", font=f_sub, fill=DIM)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
canvas.save(OUT)
print("封面:", OUT, canvas.size)
