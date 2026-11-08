# -*- coding: utf-8 -*-
"""封面 1080x1440。文字全部落在 180-1260 区间，被裁成 1:1 时也不会切到字。
   卡片取的是「孔 + 轴」两张紧挨着的卡：一眼看出这工具给的是什么——
   上偏差、下偏差、极限尺寸，不是一屏数字堆。
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
UI = os.path.join(HERE, "build", "ui", "s_single.png")
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

# 卡片源区域：孔卡上沿 → 轴卡下沿（卡 1 = 1224-1576，卡 2 = 1601-1953）
# 两头都落在卡片边界上，不会切出半行字
SRC_TOP, SRC_H = 1224, 729
CARD_W = 900

canvas = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(canvas)

d.text((72, 118), "公差查询 · 工具 №10", font=f_tag, fill=DIM)

src = Image.open(UI).convert("RGB")
card = src.crop((0, SRC_TOP, 1080, SRC_TOP + SRC_H))
cw = CARD_W
ch = int(card.height * cw / card.width)
card = card.resize((cw, ch), Image.LANCZOS)

mask = Image.new("L", (cw, ch), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=26, fill=255)
canvas.paste(card, ((W - cw) // 2, 186), mask)

d.text((72, 1002), "查个公差", font=f_big, fill=INK)
d.text((72, 1098), "不用翻手册", font=f_big, fill=RED)
d.text((72, 1220), "上下偏差 · 极限尺寸 · 间隙过盈", font=f_sub, fill=DIM)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
canvas.save(OUT)
print("封面:", OUT, canvas.size, "卡片高", ch)
