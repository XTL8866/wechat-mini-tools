# -*- coding: utf-8 -*-
"""封面 1080x1440。文字全部落在 180-1260 区间，被裁成 1:1 时也不会切到字。
   卡片取的是「转盘本体」那一段：转盘 + 指针最能说明这是个什么工具，
   比放整页缩略图清楚。
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
UI = os.path.join(HERE, "build", "ui", "s_result.png")
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

# 卡片源区域：上边界在「开始转」按钮下方，下边界在转盘下沿之后 ——
# 两头都落在块与块之间的空隙里，不会切出半行字
SRC_TOP, SRC_H = 1030, 912
CARD_W = 900

canvas = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(canvas)

d.text((72, 118), "转盘抽签 · 工具 №08", font=f_tag, fill=DIM)

src = Image.open(UI).convert("RGB")
card = src.crop((0, SRC_TOP, 1080, SRC_TOP + SRC_H))
cw = CARD_W
ch = int(card.height * cw / card.width)
card = card.resize((cw, ch), Image.LANCZOS)

mask = Image.new("L", (cw, ch), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=26, fill=255)
canvas.paste(card, ((W - cw) // 2, 200), mask)

d.text((72, 1000), "选不出来", font=f_big, fill=INK)
d.text((72, 1096), "就转一下", font=f_big, fill=RED)
d.text((72, 1218), "五格等分 · 落点算出来 · 抽过不放回", font=f_sub, fill=DIM)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
canvas.save(OUT)
print("封面:", OUT, canvas.size, "卡片高", ch)
