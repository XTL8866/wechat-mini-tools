# -*- coding: utf-8 -*-
"""界面状态截图：python capture.py
用途：验证 6 个关键状态的真实渲染，供视频合成取帧
"""
import pathlib
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
URL = "file:///" + (HERE / "preview" / "index.html").as_posix()
OUT = HERE / "shots"
OUT.mkdir(exist_ok=True)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", args=["--force-color-profile=srgb", "--disable-lcd-text"])
        pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        pg.goto(URL, wait_until="networkidle")
        pg.evaluate("document.fonts.ready")

        def shot(name):
            pg.screenshot(path=str(OUT / f"{name}.png"))
            print("  ->", name)

        pg.evaluate("window.__ctl.reset()")
        shot("a_empty")

        pg.evaluate("window.__ctl.setTopic('保温杯'); window.__ctl.focus(true)")
        shot("b_typed")

        pg.evaluate("window.__ctl.focus(false); window.__ctl.generate(3)")
        pg.wait_for_timeout(150)
        shot("c_result3")

        pg.evaluate("window.__ctl.copy(0)")
        pg.wait_for_timeout(150)
        shot("d_copied")
        pg.evaluate("window.__ctl.hideToast()")

        pg.evaluate("window.__ctl.unlock(); window.scrollTo(0, document.body.scrollHeight)")
        pg.wait_for_timeout(150)
        shot("e_unlocked")

        pg.evaluate("""window.__ctl.reset();
            window.__ctl.setTopic('保温杯');
            window.__ctl.setPlatform('xhs');
            window.__ctl.setStyle('heart');
            window.__ctl.generate(3);
            window.scrollTo(0, 0)""")
        pg.wait_for_timeout(150)
        shot("f_xhs_heart")

        info = pg.evaluate("({h: document.body.scrollHeight, n: window.__ctl.state().list.length})")
        print("  页面高度:", info["h"], "| 列表条数:", info["n"])
        b.close()
    print("完成")


if __name__ == "__main__":
    main()
