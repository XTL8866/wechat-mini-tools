# -*- coding: utf-8 -*-
"""封面 1080x1440。文字全部落在 180-1260 区间，被裁成 1:1 时也不会切到字。
   卡片取的是「前两张结果卡」那一段：音标 + 释义 + 音节一眼看清，
   比放整页缩略图更能说明这是个什么工具。
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
UI = os.path.join(HERE, "build", "ui", "s_both.png")
OUT = os.path.join(HERE, "out", "cover.png")

W, H = 1080, 1440
BG = (10, 10, 12)
INK = (242, 238, 230)
DIM = (150, 150, 160)
RED = (255, 77, 61)

F_BD = "C:/Windows/Fonts/msyhbd.ttc"
F_RG = "C:/Windows/Fonts/msyh.ttc"

f_tag = ImageFont.truetype(F_RG, 38)
f_big = ImageFont.truetype(F_BD, 78)
f_sub = ImageFont.truetype(F_RG, 32)

# 卡片源区域：从第一张结果卡上沿到第二张卡下沿，两头都落在卡片分隔线上，
# 不会切出半行字（卡 1 = 1254-1681，卡 2 = 1681-2107）
SRC_TOP, SRC_H = 1254, 853
CARD_W = 900

canvas = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(canvas)

d.text((72, 118), "音标查询 · 工具 №09", font=f_tag, fill=DIM)

src = Image.open(UI).convert("RGB")
card = src.crop((0, SRC_TOP, 1080, SRC_TOP + SRC_H))
cw = CARD_W
ch = int(card.height * cw / card.width)
card = card.resize((cw, ch), Image.LANCZOS)

mask = Image.new("L", (cw, ch), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=26, fill=255)
canvas.paste(card, ((W - cw) // 2, 186), mask)

d.text((72, 1002), "一个词", font=f_big, fill=INK)
d.text((72, 1098), "音标看全", font=f_big, fill=RED)
d.text((72, 1220), "英式美式并排 · 音节拆开 · 重音标出来", font=f_sub, fill=DIM)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
canvas.save(OUT)
print("封面:", OUT, canvas.size, "卡片高", ch)
