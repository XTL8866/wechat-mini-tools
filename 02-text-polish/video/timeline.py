# -*- coding: utf-8 -*-
"""画面与音轨共用的时间轴，避免两处常量不一致。"""

# 实测口播时长（tts.py 跑出来的真实值，改动台词后要重跑 tts.py 更新）
DUR = [4.82, 2.90, 2.90, 3.91, 4.15, 3.94, 3.72, 2.14, 3.14]
GAP = 0.16     # 句间留白
LEAD = 0.30    # 开头留白
TAIL = 0.70    # 结尾留白


def build():
    t = LEAD
    start = []
    for d in DUR:
        start.append(t)
        t += d + GAP
    end = [s + d for s, d in zip(start, DUR)]
    total = start[-1] + DUR[-1] + TAIL
    return start, end, total
