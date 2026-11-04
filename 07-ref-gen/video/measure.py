# -*- coding: utf-8 -*-
"""量各状态的关键坐标（设备像素），用来定 build_video.py 的滚动量。"""
import json
import pathlib

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
URL = "file:///" + (HERE.parent / "preview" / "index.html").as_posix()
DSF = 2.7692

JS = """(dsf) => {
  const q = s => document.querySelector(s);
  const box = s => {
    const e = q(s);
    if (!e || e.classList.contains('hidden')) return null;
    const r = e.getBoundingClientRect();
    return [Math.round((r.top + window.scrollY) * dsf), Math.round((r.bottom + window.scrollY) * dsf)];
  };
  return {
    page: Math.round(document.body.scrollHeight * dsf),
    chips: box('.types'), form: box('.form'), gen: box('.gen'),
    res: box('.res'), listHead: box('.sec-head'), items: box('.items'),
    unlock: box('.unlock'), note: box('.note')
  };
}"""

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    pg = b.new_page(viewport={"width": 390, "height": 625}, device_scale_factor=DSF)
    pg.goto(URL, wait_until="networkidle")
    pg.wait_for_timeout(200)

    def snap(name):
        d = pg.evaluate(JS, DSF)
        print("%-10s" % name, json.dumps(d, ensure_ascii=False))

    pg.evaluate("window.__ctl.reset()")
    snap("s_empty")
    pg.evaluate("window.__ctl.setType('J'); window.__ctl.fillSample()")
    snap("s_filled")
    pg.evaluate("window.__ctl.generate()")
    snap("s_built")
    pg.evaluate("window.__ctl.setType('M'); window.__ctl.fillSample(); window.__ctl.generate()")
    snap("s_book")
    pg.evaluate("window.__ctl.setType('J'); window.__ctl.setForm(window.SAMPLE_EN); window.__ctl.generate()")
    snap("s_en")
    pg.evaluate("window.__ctl.unlock()")
    snap("s_unlock")
    b.close()
