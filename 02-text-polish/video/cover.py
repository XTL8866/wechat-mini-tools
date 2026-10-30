# -*- coding: utf-8 -*-
"""封面 1080x1440。文字全部落在 180-1260 区间，被裁成 1:1 时也不会切到字。
   卡片底部做渐白收尾，避免内容被硬切断看着像截坏了。
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
UI = os.path.join(HERE, "build", "ui", "s_rewrite.png")
OUT = os.path.join(HERE, "out", "cover.png")

W, H = 1080, 1440
BG = (10, 10, 12)
INK = (242, 238, 230)
DIM = (150, 150, 160)
RED = (255, 77, 61)

F_BD = "C:/Windows/Fonts/msyhbd.ttc"
F_RG = "C:/Windows/Fonts/msyh.ttc"

f_tag = ImageFont.truetype(F_RG, 38)
f_big = ImageFont.truetype(F_BD, 108)
f_sub = ImageFont.truetype(F_RG, 34)

# 卡片源区域：从「改后」标题往下截，含结果正文和改动清单开头
SRC_TOP, SRC_H = 1290, 440
CARD_W = 940
FADE_H = 78

canvas = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(canvas)

d.text((72, 200), "文本润色 · 工具 №02", font=f_tag, fill=DIM)

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
canvas.paste(card, ((W - cw) // 2, 280), mask)

d.text((72, 922), "一段话", font=f_big, fill=INK)
d.text((72, 1040), "四种改法", font=f_big, fill=RED)
d.text((72, 1182), "精简 · 扩写 · 转书面 · 降重", font=f_sub, fill=DIM)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
canvas.save(OUT)
print("封面:", OUT, canvas.size)
