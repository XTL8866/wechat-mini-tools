# -*- coding: utf-8 -*-
"""封面 1080x1440。文字全部落在 180-1260 区间，被裁成 1:1 时也不会切到字。
   卡片取「大写结果 + 分级」两张：一眼看到 1234.56 的大写长什么样，
   以及亿/万/元三级是怎么拆的。
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
UI = os.path.join(HERE, "build", "ui", "s_main.png")
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

# 卡片源区域：大写卡上沿(1241) → 分级卡下沿(2052)，
# 两头都落在卡片边界上，不会切出半行字
SRC_TOP, SRC_H = 1241, 811
CARD_W = 800

canvas = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(canvas)

d.text((72, 148), "金额大写 · 工具 №12", font=f_tag, fill=DIM)

src = Image.open(UI).convert("RGB")
card = src.crop((0, SRC_TOP, 1080, SRC_TOP + SRC_H))
cw = CARD_W
ch = int(card.height * cw / card.width)
card = card.resize((cw, ch), Image.LANCZOS)

mask = Image.new("L", (cw, ch), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=26, fill=255)
canvas.paste(card, ((W - cw) // 2, 206), mask)

d.text((72, 938), "金额大写", font=f_big, fill=INK)
d.text((72, 1034), "零和角分不出错", font=f_big, fill=RED)
d.text((72, 1145), "报销 · 发票 · 合同 · 支票，一处填对", font=f_sub, fill=DIM)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
canvas.save(OUT)
print("封面:", OUT, canvas.size, "卡片高", ch)
