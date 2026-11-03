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

# 示例图上的两个取色点（归一化坐标）—— 一个落在海面上，一个落在沙滩上，
# 两次取色差得够远，才看得出「点哪儿取哪儿」
P_SEA = (0.55, 0.62)
P_SAND = (0.30, 0.88)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome",
                              args=["--force-color-profile=srgb", "--disable-lcd-text"])
        pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=DSF)
        pg.goto(URL, wait_until="networkidle")
        pg.evaluate("document.fonts.ready")
        # 关掉所有过渡，避免截到动画中间态
        pg.add_style_tag(content="*{transition:none!important;animation:none!important}")

        # 等图片解码完成、像素可读
        pg.wait_for_function("() => { const s = window.__ctl.state(); "
                             "return s && document.getElementById('cv').width > 1; }")
        pg.wait_for_timeout(220)

        def shot(name, full=True):
            # 长图：视频里按滚动位置裁窗口，做出平滑滚动而不是硬切
            pg.evaluate("window.__ctl.hideToast()")
            pg.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
            print("  ->", name)

        # 1 还没取色
        pg.evaluate("window.__ctl.reset()")
        shot("s_empty")

        # 2 点海面
        pg.evaluate("([x, y]) => window.__ctl.pickAt(x, y)", list(P_SEA))
        pg.wait_for_timeout(80)
        shot("s_pick1")

        # 3 换到沙滩，颜色立刻换
        pg.evaluate("([x, y]) => window.__ctl.pickAt(x, y)", list(P_SAND))
        pg.wait_for_timeout(80)
        shot("s_pick2")

        # 4 扫主色（免费 3 个）
        pg.evaluate("window.__ctl.generate()")
        pg.wait_for_timeout(120)
        shot("s_main3")

        # 5 复制（按钮变「已复制」，toast 由合成层画）
        pg.evaluate("window.__ctl.copy()")
        pg.wait_for_timeout(80)
        shot("s_copied")

        # 6 解锁：点几个主色进色卡，再解锁成 6 个主色
        pg.evaluate("window.__ctl.pickMain(0); window.__ctl.pickMain(1); window.__ctl.pickMain(2)")
        pg.wait_for_timeout(100)
        pg.evaluate("window.__ctl.unlock()")
        pg.wait_for_timeout(140)
        shot("s_unlock6")

        st = pg.evaluate("window.__ctl.state()")
        hh = pg.evaluate("document.body.scrollHeight")
        print("  当前色:", st["picked"] and st["picked"]["hex"],
              "| 主色:", [m["hex"] for m in st["main"]],
              "| 色卡:", [p["hex"] for p in st["palette"]])
        print("  页面高:", hh, "| 视口高:", H)
        b.close()

    from PIL import Image
    for f in sorted(OUT.glob("*.png")):
        im = Image.open(f)
        print("  %-14s %s" % (f.stem, im.size))
    print("完成，输出:", OUT)


if __name__ == "__main__":
    main()
