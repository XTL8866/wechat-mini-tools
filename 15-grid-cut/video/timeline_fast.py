# -*- coding: utf-8 -*-
"""快版时间轴：7 句，句间 0.15s，比原版紧。"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
AUD = os.path.join(HERE, "build", "audio_fast")

FALLBACK = [2.45, 2.55, 2.35, 2.30, 1.85, 2.50, 2.35]

GAP = 0.15
LEAD = 0.30
TAIL = 1.05


def _durs():
    p = os.path.join(AUD, "lines.json")
    if not os.path.exists(p):
        return list(FALLBACK)
    with open(p, encoding="utf-8") as f:
        d = [x["dur"] for x in json.load(f)]
    return d or list(FALLBACK)


DUR = _durs()


def build():
    t = LEAD
    start, end = [], []
    for d in DUR:
        start.append(t)
        end.append(t + d)
        t += d + GAP
    return {"start": start, "end": end, "total": end[-1] + TAIL}
