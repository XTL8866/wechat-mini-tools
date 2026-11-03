# -*- coding: utf-8 -*-
"""生成预览页用的示例图（1080x1080 白天海岸）。

为什么要现造一张：预览页要能真的读像素取色，就得有一张不受版权和隐私约束的图。
选白天海岸是因为它天生有五六块分得开的中间调色 —— 天是浅蓝、云是白、远山是青绿、
海是蓝绿、沙滩是暖沙色。这样「扫主色」扫出来是一片有层次的色条，
而不是一张夜景图扫出一堆近黑。

    python make_sample.py      # 输出 assets/sample.jpg
真实使用时换成人自己选的照片，这张只在预览和录屏里出现。
"""
import os

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "sample.jpg")

W = H = 1080
HOR = 470      # 海天线
SAND = 800     # 沙滩线

rng = np.random.default_rng(20261103)


def lerp_stops(y, stops):
    """stops = [(位置0..1, (r,g,b)), ...]，按位置线性插值。"""
    pos = [s[0] for s in stops]
    cols = np.array([s[1] for s in stops], dtype=float)
    t = y.astype(float)
    out = np.zeros((len(t), 3), dtype=float)
    for c in range(3):
        out[:, c] = np.interp(t, pos, cols[:, c])
    return out


def vertical(width, height, stops):
    base = lerp_stops(np.linspace(0, 1, height), stops)
    img = np.zeros((height, width, 3), dtype=float)
    img[:, :, 0] = base[:, 0:1]
    img[:, :, 1] = base[:, 1:2]
    img[:, :, 2] = base[:, 2:3]
    return img


img = np.zeros((H, W, 3), dtype=float)

# ---------- 天：上深下浅，靠海那侧发白 ----------
img[:HOR] = vertical(W, HOR, [
    (0.00, (138, 182, 216)),
    (0.45, (167, 203, 230)),
    (0.78, (203, 224, 238)),
    (1.00, (226, 238, 245)),
])

# ---------- 云：几团软的白斑，用高斯叠加 ----------
cloud = np.zeros((HOR, W), dtype=float)
gy, gx = np.mgrid[0:HOR, 0:W]
for cx, cy, rx, ry, a in ((250, 130, 210, 54, 0.95), (430, 108, 140, 40, 0.70),
                          (790, 196, 250, 62, 0.85), (960, 120, 160, 44, 0.60),
                          (600, 268, 300, 44, 0.55)):
    cloud += a * np.exp(-(((gx - cx) / rx) ** 2 + ((gy - cy) / ry) ** 2) * 2.6)
cloud = np.clip(cloud, 0, 1)
cloud = np.array(Image.fromarray((cloud * 255).astype(np.uint8))
                 .filter(ImageFilter.GaussianBlur(9)), dtype=float) / 255.0
for c, col in enumerate((252, 250, 246)):
    img[:HOR, :, c] = img[:HOR, :, c] * (1 - cloud) + col * cloud

# ---------- 远山：两层，越近越深 ----------
hills = Image.new("L", (W, HOR), 0)
hd = hills.load()
for x in range(W):
    back = 424 + int(26 * np.sin(x / 190.0 + 0.6) + 12 * np.sin(x / 71.0))
    for y in range(back, HOR):
        hd[x, y] = 150
for x in range(W):
    front = 442 + int(20 * np.sin(x / 150.0 + 2.1) + 9 * np.sin(x / 53.0 + 1.2))
    for y in range(front, HOR):
        hd[x, y] = 255
hills = hills.filter(ImageFilter.GaussianBlur(1.2))
hk = np.array(hills, dtype=float) / 255.0
for c, col in enumerate((94, 128, 122)):
    img[:HOR, :, c] = img[:HOR, :, c] * (1 - hk) + col * hk

# ---------- 海 ----------
sea_h = SAND - HOR
sea = vertical(W, sea_h, [
    (0.00, (74, 132, 148)),
    (0.18, (58, 118, 138)),
    (0.55, (44, 100, 124)),
    (0.88, (52, 116, 136)),
    (1.00, (86, 152, 164)),
])
# 横向浪脊：加一点沿 x 方向的相位扰动，否则整片海是几条笔直的亮线，一眼假
xs = np.arange(W)
for y in range(sea_h):
    t = y / sea_h
    ph = np.sin(y / (5.0 + 16 * t) + 3.0 * np.sin(y / 41.0) + 1.1 * np.sin(xs / 270.0 + y / 34.0))
    k = np.clip(ph, 0, 1) ** 2.6 * (0.04 + 0.075 * t)
    for c, col in enumerate((236, 246, 248)):
        sea[y, :, c] = sea[y, :, c] * (1 - k) + col * k
# 海天线底下那一道细碎的反光，是海面最好认的特征
glit = np.clip(1 - np.arange(sea_h) / 26.0, 0, 1) ** 2
for y in range(26):
    k = glit[y] * (0.34 + 0.16 * np.sin(xs / 40.0))
    for c, col in enumerate((244, 250, 250)):
        sea[y, :, c] = sea[y, :, c] * (1 - k) + col * k
img[HOR:SAND] = np.array(
    Image.fromarray(np.clip(sea, 0, 255).astype(np.uint8))
    .filter(ImageFilter.GaussianBlur(2.4)), dtype=float)

# ---------- 沙滩 ----------
sand = vertical(W, H - SAND, [
    (0.00, (216, 186, 148)),
    (0.22, (232, 208, 172)),
    (0.70, (236, 214, 180)),
    (1.00, (222, 196, 160)),
])
# 湿沙带：靠水那一侧偏深偏冷
for y in range(min(46, sand.shape[0])):
    k = (1 - y / 46.0) ** 1.6 * 0.55
    for c, col in enumerate((186, 166, 138)):
        sand[y, :, c] = sand[y, :, c] * (1 - k) + col * k
img[SAND:] = sand

# ---------- 缝合海天线与沙滩线，别留刀切口 ----------
for y0, hgt in ((HOR - 12, 26), (SAND - 10, 22)):
    strip = Image.fromarray(np.clip(img[y0:y0 + hgt], 0, 255).astype(np.uint8))
    img[y0:y0 + hgt] = np.array(strip.filter(ImageFilter.GaussianBlur(6)), dtype=float)

# ---------- 颗粒与轻微暗角 ----------
img = np.clip(img, 0, 255) + rng.normal(0, 1.9, img.shape)
fly, flx = np.mgrid[0:H, 0:W]
vig = 1 - 0.13 * (((flx - W / 2) ** 2 + (fly - H / 2) ** 2) / (W * W * 0.62))
img = np.clip(img * vig[:, :, None], 0, 255).astype(np.uint8)

out = Image.fromarray(img).filter(ImageFilter.GaussianBlur(0.4))
out.save(OUT, quality=88, subsampling=1)
print("示例图:", OUT, out.size, os.path.getsize(OUT) // 1024, "KB")
