# -*- coding: utf-8 -*-
"""快版时间轴：7 句，句间 0.15s，比原版紧。"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
AUD = os.path.join(HERE, "build", "audio_fast")

FALLBACK = [2.90, 2.30, 2.30, 2.74, 2.38, 2.74, 2.33]

GAP = 0.15
LEAD = 0.30
TAIL = 0.60


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
