# -*- coding: utf-8 -*-
"""快版旁白：7 句，语速 +28%，输出到 build/audio_fast/。"""
import asyncio
import json
import os
import re
import subprocess

import edge_tts
import imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
AUD = os.path.join(HERE, "build", "audio_fast")
FF = imageio_ffmpeg.get_ffmpeg_exe()

VOICE = "zh-CN-YunxiNeural"
RATE = "+28%"          # 原版 +6%，快版提到 +28%

# 7 句，单点信息，每句 2–3 秒
LINES = [
    "九宫格发歪了，问题在整张图。",
    "一张四比三，平台只按方块裁。",
    "切成九格，每格取自己那块。",
    "留一圈白边，排开不粘连。",
    "想放大，就切四格。",
    "九张一次存完，不用来回点。",
    "最后一张，你一般放什么？",
]


def dur_of(path):
    p = subprocess.run([FF, "-hide_banner", "-i", path], capture_output=True,
                       text=True, errors="replace")
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", p.stderr)
    if not m:
        return 0.0
    h, mi, s = m.groups()
    return int(h) * 3600 + int(mi) * 60 + float(s)


async def tts(text, path, tries=3):
    for i in range(tries):
        try:
            await edge_tts.Communicate(text, VOICE, rate=RATE).save(path)
            if os.path.exists(path) and os.path.getsize(path) > 1200:
                return True
        except Exception as e:
            print("  重试 %d/3: %s" % (i + 1, str(e)[:80]))
            await asyncio.sleep(1.5)
    return False


async def main():
    os.makedirs(AUD, exist_ok=True)
    out, total = [], 0.0
    for i, text in enumerate(LINES):
        path = os.path.join(AUD, "l%02d.mp3" % i)
        ok = await tts(text, path)
        d = dur_of(path) if ok else 0.0
        out.append({"i": i, "text": text, "file": path, "dur": round(d, 3)})
        total += d
        print("  %02d  %5.2fs  %s" % (i, d, text))

    with open(os.path.join(AUD, "lines.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("\n口播总长 %.2fs，成片约 %.1fs" % (total, total + len(LINES) * 0.18 + 0.3 + 0.7))


if __name__ == "__main__":
    asyncio.run(main())
