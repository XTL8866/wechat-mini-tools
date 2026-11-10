# -*- coding: utf-8 -*-
"""快版音轨：7 段旁白按时间轴拼成一条。python build_audio_fast.py"""
import json
import os
import re
import subprocess

import imageio_ffmpeg

import timeline_fast as TL

HERE = os.path.dirname(os.path.abspath(__file__))
AUD = os.path.join(HERE, "build", "audio_fast")
FF = imageio_ffmpeg.get_ffmpeg_exe()


def main():
    tl = TL.build()
    with open(os.path.join(AUD, "lines.json"), encoding="utf-8") as f:
        items = json.load(f)
    start = tl["start"]
    total = tl["total"]
    assert len(items) == len(start), "台词数与时间轴不一致"

    wavs = []
    for i, it in enumerate(items):
        w = os.path.join(AUD, "w%02d.wav" % i)
        subprocess.run([FF, "-y", "-i", it["file"], "-ar", "48000", "-ac", "2", w],
                       check=True, capture_output=True)
        wavs.append(w)

    inputs = []
    for w in wavs:
        inputs += ["-i", w]

    parts = []
    for i in range(len(items)):
        parts.append("[%d:a]adelay=%d:all=1[a%d]" % (i, int(round(start[i] * 1000)), i))
    mix = "".join("[a%d]" % i for i in range(len(items)))
    parts.append("%samix=inputs=%d:normalize=0:dropout_transition=0,"
                 "apad=pad_dur=%.2f,atrim=0:%.3f[m]"
                 % (mix, len(items), TL.TAIL, total))

    out = os.path.join(AUD, "voice.wav")
    subprocess.run([FF, "-y"] + inputs + [
        "-filter_complex", ";".join(parts), "-map", "[m]",
        "-ar", "48000", "-ac", "2", out], check=True, capture_output=True)

    d = subprocess.run([FF, "-hide_banner", "-i", out], capture_output=True,
                       text=True, errors="replace").stderr
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", d)
    dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0
    print("音轨 %.2fs（画面 %.2fs）" % (dur, total))


if __name__ == "__main__":
    main()
