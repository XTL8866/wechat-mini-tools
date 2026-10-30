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

        def shot(name, full=True):
            # 长图：视频里按滚动位置裁窗口，做出平滑滚动而不是硬切
            pg.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
            print("  ->", name)

        # 1 空态
        pg.evaluate("window.__ctl.reset()")
        shot("s_empty")

        # 2 打字三帧
        pg.evaluate("window.__ctl.focus(true)")
        for i, txt in enumerate(["保", "保温", "保温杯"]):
            pg.evaluate("t => window.__ctl.setTopic(t)", txt)
            pg.wait_for_timeout(60)
            shot(f"s_typed_{i+1}")

        # 3 按钮按下
        pg.evaluate("""() => {
            const b = document.getElementById('btn');
            b.style.opacity = '0.62';
            b.style.transform = 'scale(0.985)';
            window.__ctl.focus(false);
        }""")
        pg.wait_for_timeout(60)
        shot("s_btn_down")

        # 4 生成 3 条（抖音 · 爆款）
        pg.evaluate("""() => {
            const b = document.getElementById('btn');
            b.style.opacity = ''; b.style.transform = '';
            window.__ctl.generate(3);
            window.scrollTo(0, 0);
        }""")
        pg.wait_for_timeout(160)
        shot("s_r3_viral")

        # 5 切走心
        pg.evaluate("window.__ctl.setStyle('heart'); window.__ctl.generate(3); window.scrollTo(0, 0)")
        pg.wait_for_timeout(160)
        shot("s_r3_heart")

        # 6 切小红书
        pg.evaluate("window.__ctl.setPlatform('xhs'); window.__ctl.generate(3); window.scrollTo(0, 0)")
        pg.wait_for_timeout(160)
        shot("s_r3_xhs")

        # 7 复制
        pg.evaluate("window.__ctl.copy(0); window.__ctl.hideToast()")
        pg.wait_for_timeout(140)
        shot("s_copied")   # 只保留「复制」变灰，toast 由合成层绘制

        # 8 解锁 15 条（停止在列表顶部）
        pg.evaluate("window.__ctl.unlock()")
        pg.wait_for_timeout(160)
        shot("s_unlocked")

        # 9 长图本身已含全内容，无需另截

        n = pg.evaluate("document.querySelectorAll('.item').length")
        hh = pg.evaluate("document.body.scrollHeight")
        print("  条目:", n, "| 页面高:", hh, "| 视口高:", H)
        b.close()

    from PIL import Image
    for f in sorted(OUT.glob("*.png")):
        im = Image.open(f)
        print("  %-18s %s" % (f.stem, im.size))
    print("完成，输出:", OUT)


if __name__ == "__main__":
    main()
