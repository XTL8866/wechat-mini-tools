# -*- coding: utf-8 -*-
"""旁白合成：把 9 句台词转成音频，输出真实时长供排轴。"""
import asyncio
import json
import os
import re
import subprocess

import edge_tts
import imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
AUD = os.path.join(HERE, "build", "audio")
FF = imageio_ffmpeg.get_ffmpeg_exe()

VOICE = "zh-CN-YunxiNeural"
RATE = "+6%"

LINES = [
    "写东西最花时间的，往往不是想内容，是改句子。",
    "同一段话，有四种改法。",
    "先试精简，把水词删掉。",
    "不够长就扩写，短句补成完整表达。",
    "口语太重就转书面，换成正式说法。",
    "怕重复就改写降重，换词换句式。",
    "每处改动都列在下面，能一条条对。",
    "不满意就再跑一次。",
    "文字还是你的，只是顺了。",
]


def dur_of(path):
    p = subprocess.run([FF, "-hide_banner", "-i", path], capture_output=True,
                       text=True, errors="replace")
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", p.stderr)
    if not m:
        return 0.0
    h, mi, s = m.groups()
    return int(h) * 3600 + int(mi) * 60 + float(s)


async def tts(text, path):
    last = None
    for i in range(4):
        try:
            c = edge_tts.Communicate(text, voice=VOICE, rate=RATE)
            await c.save(path)
            if os.path.getsize(path) > 1200:
                return True
        except Exception as e:
            last = e
        await asyncio.sleep(1.2 * (i + 1))
    print("  ! TTS 失败:", text[:14], last)
    return False


async def main():
    os.makedirs(AUD, exist_ok=True)
    out = []
    total = 0.0
    for i, text in enumerate(LINES):
        path = os.path.join(AUD, "l%02d.mp3" % i)
        ok = await tts(text, path)
        d = dur_of(path) if ok else 0.0
        out.append({"i": i, "text": text, "file": path, "dur": round(d, 3)})
        total += d
        print("  %02d  %5.2fs  %s" % (i, d, text))

    with open(os.path.join(AUD, "lines.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("\n口播总长 %.2fs，加留白约 %.1fs" % (total, total + len(LINES) * 0.35 + 1.2))


if __name__ == "__main__":
    asyncio.run(main())
