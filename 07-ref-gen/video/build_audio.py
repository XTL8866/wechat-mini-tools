# -*- coding: utf-8 -*-
"""把开场钩子 + 9 段旁白按时间轴拼成一条音轨。python build_audio.py"""
import json
import os
import subprocess

import imageio_ffmpeg

import timeline

HERE = os.path.dirname(os.path.abspath(__file__))
AUD = os.path.join(HERE, "build", "audio")
FF = imageio_ffmpeg.get_ffmpeg_exe()


def load(name):
    p = os.path.join(AUD, name)
    if not os.path.exists(p):
        return []
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def main():
    tl = timeline.build()
    hook = load("hook.json")
    lines = load("lines.json")
    hstart = tl["hook"][0]
    start = hstart + tl["start"]
    total = tl["total"]

    items = hook + lines
    assert len(items) == len(start), "台词数与时间轴不一致：%d vs %d" % (len(items), len(start))

    # 统一成 48k 立体声，adelay 才能按秒对齐
    wavs = []
    for i, item in enumerate(items):
        w = os.path.join(AUD, "w%02d.wav" % i)
        subprocess.run([FF, "-y", "-i", item["file"], "-ar", "48000", "-ac", "2", w],
                       check=True, capture_output=True)
        wavs.append(w)

    inputs = []
    for w in wavs:
        inputs += ["-i", w]

    n = len(items)
    parts = []
    for i in range(n):
        ms = int(round(start[i] * 1000))
        parts.append("[%d:a]adelay=%d:all=1[a%d]" % (i, ms, i))
    mix = "".join("[a%d]" % i for i in range(n))
    parts.append("%samix=inputs=%d:normalize=0:dropout_transition=0,"
                 "apad=pad_dur=%.2f,atrim=0:%.3f[m]" % (mix, n, timeline.TAIL, total))

    out = os.path.join(AUD, "voice.wav")
    subprocess.run([FF, "-y"] + inputs + [
        "-filter_complex", ";".join(parts), "-map", "[m]",
        "-ar", "48000", "-ac", "2", out
    ], check=True, capture_output=True)

    d = subprocess.run([FF, "-hide_banner", "-i", out], capture_output=True,
                       text=True, errors="replace").stderr
    import re
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", d)
    dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0
    print("音轨: %s  %.2fs（时间轴 %.2fs，%d 句 = 钩子 %d + 正文 %d）"
          % (out, dur, total, n, len(hook), len(lines)))
    if abs(dur - total) > 0.3:
        print("! 音轨与画面长度差 %.2fs，可能被裁剪" % (dur - total))


if __name__ == "__main__":
    main()
