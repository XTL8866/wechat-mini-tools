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
        pg.wait_for_timeout(200)

        def shot(name, full=True):
            # 长图：视频里按滚动位置裁窗口，做出平滑滚动而不是硬切
            pg.evaluate("window.__ctl.hideToast()")
            pg.evaluate("window.scrollTo(0, 0)")
            pg.wait_for_timeout(40)
            pg.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
            print("  ->", name, pg.evaluate("document.body.scrollHeight"))

        # 1 还没填：空表单，结果卡是占位
        pg.evaluate("window.__ctl.reset()")
        shot("s_empty")

        # 2 填好期刊那七格，还没点生成
        pg.evaluate("window.__ctl.setType('J'); window.__ctl.fillSample()")
        pg.wait_for_timeout(80)
        shot("s_filled")

        # 3 生成：一条完整引用 + 自动进列表
        pg.evaluate("window.__ctl.generate()")
        pg.wait_for_timeout(100)
        shot("s_built")

        # 4 换类型：专著，版本项、出版地都跟上了
        pg.evaluate("window.__ctl.setType('M'); window.__ctl.fillSample()")
        pg.wait_for_timeout(60)
        pg.evaluate("window.__ctl.generate()")
        pg.wait_for_timeout(100)
        shot("s_book")

        # 5 换语言：英文文献，姓前名缩写 + et al
        pg.evaluate("window.__ctl.setType('J'); window.__ctl.setForm(window.SAMPLE_EN)")
        pg.wait_for_timeout(60)
        pg.evaluate("window.__ctl.generate()")
        pg.wait_for_timeout(100)
        shot("s_en")

        # 6 复制单条：按钮变「已复制」，toast 由合成层画
        pg.evaluate("window.__ctl.copyOne()")
        pg.wait_for_timeout(60)
        shot("s_copied")

        # 7 解锁：3 条 → 20 条
        pg.evaluate("window.__ctl.unlock()")
        pg.wait_for_timeout(80)
        shot("s_unlock")

        st = pg.evaluate("window.__ctl.state()")
        print("  当前结果:", st["built"] and st["built"]["text"])
        print("  列表:", [x["mark"] for x in st["list"]], "| 上限可存:", 20 if st["unlocked"] else 3)

        # 各块在长图里的纵向位置，用来定 build_video.py 的滚动量
        pos = pg.evaluate("""() => {
            const q = s => document.querySelector(s);
            const top = e => e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : -1;
            return {
              page: document.body.scrollHeight,
              form: top(q('.form')),
              gen: top(q('.gen')),
              res: top(q('.res')),
              resBottom: top(q('.res')) + q('.res').offsetHeight,
              listHead: top(q('.sec-head')),
              items: top(q('.items')),
              unlock: top(q('.unlock')),
              note: top(q('.note'))
            };
        }""")
        print("  版面位置(逻辑px):", pos)
        print("  换算设备px:", {k: round(v * DSF) for k, v in pos.items()})
        print("  窗口高:", round(H * DSF), "最大滚动:", round((pos["page"] - H) * DSF))
        b.close()

    from PIL import Image
    for f in sorted(OUT.glob("*.png")):
        im = Image.open(f)
        print("  %-14s %s" % (f.stem, im.size))
    print("完成，输出:", OUT)


if __name__ == "__main__":
    main()
