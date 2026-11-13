# -*- coding: utf-8 -*-
"""视频用界面帧：390x625 逻辑视口截长图，合成时按滚动位置裁 1080x1920 窗口。

六个状态：
  s_empty  两个日期都空着
  s_filled 日期填好、还没算
  s_nat    自然日结果（大数字 + 明细行）
  s_work   工作日结果（扣周末）
  s_rev    倒推到第 60 个工作日
  s_feb    闰年 2-29 起的跨度

    python capture_video.py
"""
import json
import pathlib

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
URL = "file:///" + (HERE.parent / "preview" / "index.html").as_posix()
OUT = HERE / "build" / "ui"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 390, 625          # 逻辑视口
DSF = 2.7692             # 390 * 2.7692 = 1080


def main():
    from PIL import Image

    meta = {}
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome",
                              args=["--force-color-profile=srgb", "--disable-lcd-text"])
        pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=DSF)
        pg.goto(URL, wait_until="networkidle")
        pg.evaluate("document.fonts.ready")
        pg.add_style_tag(content="*{transition:none!important;animation:none!important}")
        pg.wait_for_timeout(200)

        def shot(name):
            pg.evaluate("window.__ctl.hideToast()")
            pg.evaluate("window.scrollTo(0, 0)")
            pg.wait_for_timeout(45)
            path = OUT / (name + ".png")
            pg.screenshot(path=str(path), full_page=True)
            im = Image.open(path)
            if im.width != 1080:
                im.crop((0, 0, 1080, im.height)).save(path)
                im = Image.open(path)
            print("  -> %-8s %s" % (name, im.size))
            meta[name] = pg.evaluate("window.__ctl.measure()")

        # 1 空态
        pg.evaluate("window.__ctl.reset()")
        pg.evaluate("window.__ctl.setStart('')")
        pg.evaluate("window.__ctl.setEnd('')")
        pg.wait_for_timeout(100)
        shot("s_empty")

        # 2 填好未算
        pg.evaluate("window.__ctl.reset()")
        pg.evaluate("window.__ctl.setStart('2026-11-13')")
        pg.evaluate("window.__ctl.setEnd('2026-12-31')")
        pg.wait_for_timeout(100)
        shot("s_filled")

        # 3 自然日结果
        pg.evaluate("window.__ctl.generate()")
        pg.wait_for_timeout(100)
        st = pg.evaluate("window.__ctl.state()")
        assert st["result"] and st["result"]["ok"], "自然日没算出来"
        print("  自然日: %d 天 / 含首尾 %d 天" % (st["result"]["absDays"], st["result"]["totalDays"]))
        shot("s_nat")

        # 4 工作日结果
        pg.evaluate("window.__ctl.setMode('work')")
        pg.wait_for_timeout(100)
        st = pg.evaluate("window.__ctl.state()")
        print("  工作日: %d 天（周末 %d）" % (st["result"]["workdays"], st["result"]["weekendDays"]))
        shot("s_work")

        # 5 倒推 30 个工作日（先回到自然日，滚动过场时大数字不会从 48 跳成 35）
        pg.evaluate("window.__ctl.setMode('natural')")
        pg.evaluate("window.__ctl.setRevN(30)")
        pg.wait_for_timeout(100)
        st = pg.evaluate("window.__ctl.state()")
        print("  第 30 个工作日:", st["revN"])
        shot("s_rev")

        # 6 闰年起点
        pg.evaluate("window.__ctl.setMode('natural')")
        pg.evaluate("window.__ctl.setStart('2024-02-29')")
        pg.evaluate("window.__ctl.setEnd('2025-03-01')")
        pg.evaluate("window.__ctl.generate()")
        pg.wait_for_timeout(100)
        st = pg.evaluate("window.__ctl.state()")
        print("  闰年跨度:", st["result"]["ymdText"])
        shot("s_feb")

        print("\n各状态坐标（设备像素）：")
        for k, v in meta.items():
            print(" ", k, v)
        (HERE / "build" / "measure.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        b.close()

    print("完成，输出:", OUT, "共", len(list(OUT.glob("*.png"))), "张")


if __name__ == "__main__":
    main()
