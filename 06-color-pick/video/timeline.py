# -*- coding: utf-8 -*-
"""画面与音轨共用的时间轴，避免两处常量不一致。

时长优先读 build/audio/*.json（tts.py 实测值），文件不在时才用下面的兜底常量。
改台词后只需重跑 tts.py，不用再手改数字。
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
AUD = os.path.join(HERE, "build", "audio")

# 兜底值：tts.py 正常跑过之后会被 JSON 覆盖
HOOK_DUR_FALLBACK = [3.48, 3.72]
DUR_FALLBACK = [3.84, 2.57, 3.42, 3.86, 3.10, 2.72, 3.02, 3.36, 2.86]

GAP = 0.18     # 句间留白
LEAD = 0.30    # 开头留白
TAIL = 0.78    # 结尾留白


def _durs(name, fallback):
    p = os.path.join(AUD, name)
    if not os.path.exists(p):
        return list(fallback)
    with open(p, encoding="utf-8") as f:
        d = [x["dur"] for x in json.load(f)]
    return d or list(fallback)


HOOK_DUR = _durs("hook.json", HOOK_DUR_FALLBACK)
DUR = _durs("lines.json", DUR_FALLBACK)


def build():
    """返回 dict：hook=(start,end)、start/end 为正文 9 句、total 为总长。"""
    t = LEAD

    hstart, hend = [], []
    for d in HOOK_DUR:
        hstart.append(t)
        hend.append(t + d)
        t += d + GAP

    start, end = [], []
    for d in DUR:
        start.append(t)
        end.append(t + d)
        t += d + GAP

    total = end[-1] + TAIL
    return {"hook": (hstart, hend), "start": start, "end": end, "total": total}
