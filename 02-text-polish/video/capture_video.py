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

SAMPLE = ("其实我觉得这个方案基本上没什么问题，说实话我们在前期的调研过程中"
          "已经对流程进行了优化，所以现在能够把成本控制在比较低的水平，"
          "我个人觉得还是比较值得推广的。")


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome",
                              args=["--force-color-profile=srgb", "--disable-lcd-text"])
        pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=DSF)
        pg.goto(URL, wait_until="networkidle")
        pg.evaluate("document.fonts.ready")
        # 关掉所有过渡，避免截到动画中间态
        pg.add_style_tag(content="*{transition:none!important;animation:none!important}")

        def shot(name, full=True):
            # 长图：视频里按滚动位置裁窗口，做出平滑滚动而不是硬切
            pg.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
            print("  ->", name)

        # 1 空态
        pg.evaluate("window.__ctl.reset()")
        shot("s_empty")

        # 2 粘贴文字：两帧，做出「一段话填进来」的感觉
        pg.evaluate("window.__ctl.focus(true)")
        pg.evaluate("t => window.__ctl.setText(t)", SAMPLE[:29])
        pg.wait_for_timeout(60)
        shot("s_typed_1")
        pg.evaluate("t => window.__ctl.setText(t)", SAMPLE)
        pg.wait_for_timeout(60)
        shot("s_typed_2")

        # 3 按钮按下
        pg.evaluate("""() => {
            const b = document.getElementById('btn');
            b.style.opacity = '0.62';
            b.style.transform = 'scale(0.985)';
            window.__ctl.focus(false);
        }""")
        pg.wait_for_timeout(60)
        shot("s_btn_down")

        # 4-7 四种改法
        pg.evaluate("""() => {
            const b = document.getElementById('btn');
            b.style.opacity = ''; b.style.transform = '';
        }""")
        for mode, name in [("tight", "s_tight"), ("expand", "s_expand"),
                           ("formal", "s_formal"), ("rewrite", "s_rewrite")]:
            pg.evaluate("m => { window.__ctl.setMode(m); window.__ctl.hideToast(); "
                        "window.__ctl.generate(); window.__ctl.hideToast(); window.scrollTo(0,0); }", mode)
            pg.wait_for_timeout(160)
            shot(name)

        # 8 复制
        pg.evaluate("window.__ctl.copy(); window.__ctl.hideToast()")
        pg.wait_for_timeout(140)
        shot("s_copied")

        # 9 解锁
        pg.evaluate("window.__ctl.unlock()")
        pg.wait_for_timeout(160)
        shot("s_unlocked")

        hh = pg.evaluate("document.body.scrollHeight")
        print("  页面高:", hh, "| 视口高:", H)
        b.close()

    from PIL import Image
    for f in sorted(OUT.glob("*.png")):
        im = Image.open(f)
        print("  %-14s %s" % (f.stem, im.size))
    print("完成，输出:", OUT)


if __name__ == "__main__":
    main()
