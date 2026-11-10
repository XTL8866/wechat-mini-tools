# -*- coding: utf-8 -*-
"""视频用界面帧：按 390x625 逻辑视口截长图，合成时按滚动位置裁 1080x1920 窗口。
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
        # 关掉过渡，避免截到动画中间态
        pg.add_style_tag(content="*{transition:none!important;animation:none!important}")
        pg.wait_for_timeout(200)

        def shot(name):
            pg.evaluate("window.__ctl.hideToast()")
            pg.evaluate("window.scrollTo(0, 0)")
            pg.wait_for_timeout(40)
            pg.screenshot(path=str(OUT / (name + ".png")), full_page=True)
            print("  ->", name, pg.evaluate("document.body.scrollHeight"))

        # 1 还没选图
        pg.evaluate("window.__ctl.reset()")
        shot("s_empty")

        # 2 浅底图 + 手动选了白字 + 关描边 → 对比度 1.1，几乎看不见
        pg.evaluate("""window.__ctl.setSample('light');
                       window.__ctl.setText('中秋快乐');
                       window.__ctl.setColor('#FFFFFF');
                       window.__ctl.setStroke(0);""")
        pg.wait_for_timeout(60)
        pg.evaluate("window.__ctl.generate()")
        pg.wait_for_timeout(120)
        shot("s_bad")

        # 3 同一个位置改成「自动」：黑字，对比度 14 以上
        pg.evaluate("window.__ctl.setColor('auto')")
        pg.wait_for_timeout(60)
        pg.evaluate("window.__ctl.generate()")
        pg.wait_for_timeout(120)
        shot("s_auto")

        # 4 换深底图，自动给白字
        pg.evaluate("""window.__ctl.setSample('dark');
                       window.__ctl.generate()""")
        pg.wait_for_timeout(120)
        shot("s_dark")

        # 5 十多个字：字号自己缩成两行，顶不出边框
        pg.evaluate("""window.__ctl.setSample('light');
                       window.__ctl.setColor('auto');
                       window.__ctl.setSize('l');
                       window.__ctl.setText('今年也要好好吃饭睡觉');
                       window.__ctl.generate()""")
        pg.wait_for_timeout(120)
        shot("s_long")

        # 6 白字 + 粗描边：压浅底也清楚
        pg.evaluate("""window.__ctl.setSize('m');
                       window.__ctl.setText('中秋快乐');
                       window.__ctl.setColor('#FFFFFF');
                       window.__ctl.setStroke(3);
                       window.__ctl.generate()""")
        pg.wait_for_timeout(120)
        shot("s_stroke")

        # 7 存到相册
        pg.evaluate("window.__ctl.save()")
        pg.wait_for_timeout(80)
        shot("s_saved")

        # 8 解锁
        pg.evaluate("window.__ctl.unlock()")
        pg.wait_for_timeout(120)
        shot("s_unlock")

        st = pg.evaluate("window.__ctl.state()")
        print("  当前结果:", st["plan"] and st["plan"]["text"]["size"], st["color"], st["strokeId"])
        print("  亮度/对比度:", st["plan"]["stats"].get("bgLum"),
              st["plan"]["stats"].get("bgKind"), st["plan"]["stats"].get("contrast"))

        # 各块纵向位置，用来定 build_fast.py 的滚动量
        pos = pg.evaluate("""() => {
            const q = s => document.querySelector(s);
            const top = e => e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : -1;
            const bot = e => e ? top(e) + e.offsetHeight : -1;
            return {
              page: document.body.scrollHeight,
              stage: top(q('.stage')), stageBot: bot(q('.stage')),
              field: top(q('.field')),
              btn: top(q('.btn-primary')),
              res: top(q('.result-head')),
              meter: top(q('.meter-row')),
              save: top(q('.btn-save')),
              unlock: top(q('.unlock')),
              footer: top(q('.footer'))
            };
        }""")
        print("  版面位置(逻辑px):", pos)
        print("  换算设备px:", {k: round(v * DSF) for k, v in pos.items()})
        print("  窗口高:", round(H * DSF), "最大滚动:", round((pos["page"] - H) * DSF))
        b.close()

    from PIL import Image
    for f in sorted(OUT.glob("*.png")):
        im = Image.open(f)
        print("  %-10s %s" % (f.stem, im.size))
    print("完成，输出:", OUT)


if __name__ == "__main__":
    main()
