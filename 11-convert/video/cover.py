# -*- coding: utf-8 -*-
"""封面 1080x1440。文字全部落在 180-1260 区间，被裁成 1:1 时也不会切到字。
   卡片取「主结果 + 全部单位」两张：一眼看出 12 mm 换成 0.4724409 in，
   以及同类别其他单位各是多少，不是一屏菜单。
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

# 卡片源区域：主结果卡上沿(1573) → 全部单位卡下沿(2598)，
# 两头都落在卡片边界上，不会切出半行字
SRC_TOP, SRC_H = 1573, 1025
CARD_W = 800

canvas = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(canvas)

d.text((72, 118), "单位换算 · 工具 №11", font=f_tag, fill=DIM)

src = Image.open(UI).convert("RGB")
card = src.crop((0, SRC_TOP, 1080, SRC_TOP + SRC_H))
cw = CARD_W
ch = int(card.height * cw / card.width)
card = card.resize((cw, ch), Image.LANCZOS)

mask = Image.new("L", (cw, ch), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=26, fill=255)
canvas.paste(card, ((W - cw) // 2, 186), mask)

d.text((72, 975), "单位换算", font=f_big, fill=INK)
d.text((72, 1071), "不用记系数", font=f_big, fill=RED)
d.text((72, 1180), "长度 · 质量 · 面积 · 压力 · 功率 · 温度", font=f_sub, fill=DIM)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
canvas.save(OUT)
print("封面:", OUT, canvas.size, "卡片高", ch)
