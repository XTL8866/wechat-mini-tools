# -*- coding: utf-8 -*-
"""封面 1080x1440。取生成后那一屏的「图 + 字」，标题压在下半部分。
   被裁成 1:1 时只切上下留白，不会切到字。
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
UI = os.path.join(HERE, "build", "ui", "s_heavy.png")
OUT = os.path.join(HERE, "out", "cover.png")

W, H = 1080, 1440
BG = (10, 10, 12)
INK = (242, 238, 230)
DIM = (150, 150, 160)
RED = (255, 77, 61)

F_BD = "C:/Windows/Fonts/msyhbd.ttc"
F_RG = "C:/Windows/Fonts/msyh.ttc"

f_tag = ImageFont.truetype(F_RG, 38)
f_big = ImageFont.truetype(F_BD, 92)
f_sub = ImageFont.truetype(F_RG, 34)

# 只裁画布本身（x 145~935），整宽裁会把 stage 两侧的浅灰竖条一起带进来
SRC_L, SRC_R = 145, 935
SRC_TOP, SRC_BOTTOM = 272, 1220
CARD_W = 700

canvas = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(canvas)

d.text((72, 160), "头像文字贴纸 · 工具 №03", font=f_tag, fill=DIM)

src = Image.open(UI).convert("RGB")
card = src.crop((SRC_L, SRC_TOP, SRC_R, SRC_BOTTOM))
ch = int(card.height * CARD_W / card.width)
card = card.resize((CARD_W, ch), Image.LANCZOS)

mask = Image.new("L", (CARD_W, ch), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, CARD_W - 1, ch - 1], radius=26, fill=255)
canvas.paste(card, ((W - CARD_W) // 2, 230), mask)

d.text((72, 1120), "头像加字", font=f_big, fill=INK)
d.text((72, 1228), "不用会软件", font=f_big, fill=RED)
d.text((72, 1348), "选图 · 选字体颜色 · 存成头像", font=f_sub, fill=DIM)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
canvas.save(OUT)
print("封面:", OUT, canvas.size)
