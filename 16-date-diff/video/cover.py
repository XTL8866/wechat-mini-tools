# -*- coding: utf-8 -*-
"""封面 1080x1440。文字全部落在 180-1260 区间，被裁成 1:1 时也不会切到字。
   卡片取「48 天 + 标签行 + 首行明细」那一段真实产出——看图就知道这工具给什么。
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
UI = os.path.join(HERE, "build", "ui", "s_nat.png")
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
f_foot = ImageFont.truetype(F_RG, 28)

# 结果页：大数字 1192–1419 / 标签行 1442–1531 / 首行明细 1722–1830
# 左右留 20 才不切掉「48」的左侧；上沿从 1180 起，避开「自然日 / 重算」那一行
SRC_TOP, SRC_BOT, SRC_X0, SRC_X1 = 1180, 1610, 20, 1060
CARD_W = 940

canvas = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(canvas)

d.text((72, 130), "日期差 · 工具 №16", font=f_tag, fill=DIM)

src = Image.open(UI).convert("RGB")
card = src.crop((SRC_X0, SRC_TOP, SRC_X1, SRC_BOT))
cw = CARD_W
ch = int(card.height * cw / card.width)
card = card.resize((cw, ch), Image.LANCZOS)

mask = Image.new("L", (cw, ch), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=26, fill=255)
canvas.paste(card, ((W - cw) // 2, 196), mask)

# 快版封面：写后果，不写功能
d.text((72, 790), "天数算错一天", font=f_big, fill=INK)
d.text((72, 902), "工期整个排歪", font=f_big, fill=RED)
d.text((72, 1046), "填两个日期：差几天、几个工作日，直接出", font=f_sub, fill=DIM)
d.text((72, 1122), "扣周末 · 精确到年月日 · 倒推哪天到期", font=f_foot, fill=(110, 110, 120))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
canvas.save(OUT)
print("封面:", OUT, canvas.size)
