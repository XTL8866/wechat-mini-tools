# -*- coding: utf-8 -*-
"""封面 1080x1440。文字全部落在 180-1260 区间，被裁成 1:1 时也不会切到字。
   卡片取「九张切好的图」那一段真实产出——看图就知道这工具干什么，不用读字。
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
UI = os.path.join(HERE, "build", "ui", "s_cut.png")
OUT = os.path.join(HERE, "out", "cover-fast.png")

W, H = 1080, 1440
BG = (10, 10, 12)
INK = (242, 238, 230)
DIM = (150, 150, 160)
RED = (255, 77, 61)

F_BD = "C:/Windows/Fonts/msyhbd.ttc"
F_RG = "C:/Windows/Fonts/msyh.ttc"

f_tag = ImageFont.truetype(F_RG, 38)
f_big = ImageFont.truetype(F_BD, 84)
f_sub = ImageFont.truetype(F_RG, 34)

# 九张图板在长图里是 1848–2853，左右各留 6 的边 → 1012x1020
SRC_TOP, SRC_BOT, SRC_X0, SRC_X1 = 1840, 2860, 34, 1046
CARD_W = 640
FADE_H = 0

canvas = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(canvas)

d.text((72, 128), "九宫格切图 · 工具 №15", font=f_tag, fill=DIM)

src = Image.open(UI).convert("RGB")
card = src.crop((SRC_X0, SRC_TOP, SRC_X1, SRC_BOT))
cw = CARD_W
ch = int(card.height * cw / card.width)
card = card.resize((cw, ch), Image.LANCZOS)

mask = Image.new("L", (cw, ch), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=26, fill=255)
canvas.paste(card, ((W - cw) // 2, 214), mask)

# 快版封面：写后果，不写功能
d.text((72, 900), "手切九张", font=f_big, fill=INK)
d.text((72, 1012), "缝全是歪的", font=f_big, fill=RED)
d.text((72, 1152), "发出去，朋友一眼看出是拼的", font=f_sub, fill=DIM)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
canvas.save(OUT)
print("封面:", OUT, canvas.size)
