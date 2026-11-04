# -*- coding: utf-8 -*-
"""封面 1080x1440。文字全部落在 180-1260 区间，被裁成 1:1 时也不会切到字。
   卡片取的是「生成按钮 + 结果卡」那一段：一条真实的 GB/T 7714 引用 + 生成按钮，
   比放整页缩略图更有信息量。
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
UI = os.path.join(HERE, "build", "ui", "s_built.png")
OUT = os.path.join(HERE, "out", "cover.png")

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

# 卡片源区域：上边界正好是「生成引用」按钮上沿，下边界正好是列表第一条开始处 ——
# 两头都落在块与块之间的空隙里，不会切出半行字
SRC_TOP, SRC_H = 1345, 465
CARD_W = 960
FADE_H = 0        # 上下边界都落在块之间的空隙里，不需要渐隐

canvas = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(canvas)

d.text((72, 176), "参考文献 · 工具 №07", font=f_tag, fill=DIM)

src = Image.open(UI).convert("RGB")
card = src.crop((0, SRC_TOP, 1080, SRC_TOP + SRC_H))
cw = CARD_W
ch = int(card.height * cw / card.width)
card = card.resize((cw, ch), Image.LANCZOS)

# 底部渐白：让截断看起来是内容继续，而不是被切坏（FADE_H=0 时整段跳过）
if FADE_H > 0:
    grad = Image.new("L", (1, FADE_H))
    for i in range(FADE_H):
        grad.putpixel((0, i), int(255 * (i / (FADE_H - 1)) ** 1.15))
    card.paste(Image.new("RGB", (cw, FADE_H), (255, 255, 255)),
               (0, ch - FADE_H), grad.resize((cw, FADE_H)))

mask = Image.new("L", (cw, ch), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=26, fill=255)
canvas.paste(card, ((W - cw) // 2, 240), mask)

d.text((72, 768), "填几个空", font=f_big, fill=INK)
d.text((72, 914), "国标格式", font=f_big, fill=RED)
d.text((72, 1058), "GB/T 7714 · 八种类型 · 标点不用管", font=f_sub, fill=DIM)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
canvas.save(OUT)
print("封面:", OUT, canvas.size)
