# -*- coding: utf-8 -*-
"""视频用界面帧：按 1080x1730 渲染（上方 UI，下方 190px 留给字幕条）。
    python capture_video.py
"""
import pathlib
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
URL = "file:///" + (HERE.parent / "preview" / "index.html").as_posix()
OUT = HERE / "build" / "ui"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 390, 625          # 逻辑视口
DSF = 2.7692             # 390*2.7692 = 1080, 625*2.7692 = 1731


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome",
                              args=["--force-color-profile=srgb", "--disable-lcd-text"])
        pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=DSF)
        pg.goto(URL, wait_until="networkidle")
        pg.evaluate("document.fonts.ready")
        # 关掉所有过渡，避免截到动画中间态
        pg.add_style_tag(content="*{transition:none!important;animation:none!important}")

        def shot(name):
            # 长图：视频里按滚动位置裁窗口，做出平滑滚动而不是硬切
            pg.evaluate("window.__ctl.hideToast()")
            pg.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
            print("  ->", name)

        # 1 空态
        pg.evaluate("window.__ctl.reset()")
        shot("s_empty")

        # 2 选好示例图，还没打字
        pg.evaluate("window.__ctl.setImage(true)")
        pg.wait_for_timeout(80)
        shot("s_picked")

        # 3 打字：光标 + 一个字
        pg.evaluate("window.__ctl.focus(true)")
        pg.evaluate("window.__ctl.setText('陈')")
        pg.wait_for_timeout(60)
        shot("s_typed")

        # 4 生成（粗黑）
        pg.evaluate("window.__ctl.focus(false); window.__ctl.generate()")
        pg.wait_for_timeout(160)
        shot("s_heavy")

        # 5-6 换字体
        for fid, name in [("song", "s_song"), ("thin", "s_thin")]:
            pg.evaluate("f => window.__ctl.setFont(f)", fid)
            pg.evaluate("window.__ctl.generate(); window.__ctl.hideToast()")
            pg.wait_for_timeout(160)
            shot(name)

        # 7 换颜色
        pg.evaluate("window.__ctl.setFont('heavy'); window.__ctl.setColor('#F2C14E')")
        pg.evaluate("window.__ctl.generate(); window.__ctl.hideToast()")
        pg.wait_for_timeout(160)
        shot("s_gold")

        # 8 位置：上
        pg.evaluate("window.__ctl.setColor('auto'); window.__ctl.setPos('top')")
        pg.evaluate("window.__ctl.generate(); window.__ctl.hideToast()")
        pg.wait_for_timeout(160)
        shot("s_top")

        # 9 回到下面 + 解锁
        pg.evaluate("window.__ctl.setPos('bottom')")
        pg.evaluate("window.__ctl.generate(); window.__ctl.hideToast()")
        pg.wait_for_timeout(120)
        pg.evaluate("window.__ctl.unlock()")
        pg.wait_for_timeout(120)
        shot("s_unlocked")

        # 10 存到相册（toast 由 build_video 自己画，这里留一张干净的）
        pg.evaluate("window.__ctl.save()")
        pg.wait_for_timeout(140)
        shot("s_saved")

        hh = pg.evaluate("document.body.scrollHeight")
        print("  页面高:", hh, "| 视口高:", H)
        b.close()

    from PIL import Image
    for f in sorted(OUT.glob("*.png")):
        im = Image.open(f)
        print("  %-12s %s" % (f.stem, im.size))
    print("完成，输出:", OUT)


if __name__ == "__main__":
    main()
