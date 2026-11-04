# -*- coding: utf-8 -*-
"""旁白合成：开场钩子 + 正文台词转成音频，输出真实时长供排轴。"""
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

# 系列固定开场钩子，每条片子都带，一个字都不改
HOOK = [
    "一天一款小工具，持续更新不重样。",
    "今天分享的这个，新手也能快速上手。",
]

LINES = [
    "参考文献的格式，总能被挑出毛病。",
    "所以我做了个小工具。",
    "选类型，填作者、年卷期页。",
    "完整引用直接拼出来，标点按国标。",
    "换成专著，版本和出版地照样排对。",
    "换成英文，姓前名缩写加 et al。",
    "全选复制，粘进文档就是编号列表。",
    "存不下就解锁，一次能放二十条。",
    "引用不返工，格式一次就对。",
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
    for tag, texts in (("h", HOOK), ("l", LINES)):
        out = []
        total = 0.0
        print("==", "开场钩子" if tag == "h" else "正文")
        for i, text in enumerate(texts):
            path = os.path.join(AUD, "%s%02d.mp3" % (tag, i))
            ok = await tts(text, path)
            d = dur_of(path) if ok else 0.0
            out.append({"i": i, "text": text, "file": path, "dur": round(d, 3)})
            total += d
            print("  %02d  %5.2fs  %s" % (i, d, text))
        name = "hook.json" if tag == "h" else "lines.json"
        with open(os.path.join(AUD, name), "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
        print("  小计 %.2fs\n" % total)


if __name__ == "__main__":
    asyncio.run(main())
