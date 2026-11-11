# -*- coding: utf-8 -*-
"""视频用界面帧：按 390x625 逻辑视口截长图，合成时按滚动位置裁 1080x1920 窗口。

转盘转动没法靠裁窗口做出来，所以按 15° 截 24 张整页图（sp_00..sp_23）。
这 24 张的基准角不是 0，而是「最终落点角」—— 这样末帧和停稳那一帧严格一致，
不会在减速末尾凭空跳 6°。基准角写进 build/state.json。

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
DSF = 2.7692             # 390*2.7692 = 1080, 625*2.7692 = 1731
STEP = 15
NFRAME = 360 // STEP     # 24


def main():
    from PIL import Image

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
            path = OUT / (name + ".png")
            pg.screenshot(path=str(path), full_page=True)
            # 转盘转过以后整页会多出几十像素宽（transform 撑开了 bbox），
            # 统一裁回 1080，合成时才敢按固定坐标裁窗口
            im = Image.open(path)
            if im.width != 1080:
                im.crop((0, 0, 1080, im.height)).save(path)
            print("  -> %-8s %s" % (name, im.size))

        def pos():
            return pg.evaluate("""() => {
                const q = s => document.querySelector(s);
                const px = e => e ? Math.round((e.getBoundingClientRect().top + window.scrollY) * %f) : -1;
                const pb = e => e ? Math.round((e.getBoundingClientRect().top + window.scrollY + e.offsetHeight) * %f) : -1;
                const r = e => e ? e.getBoundingClientRect() : null;
                const w = r(q('.wheel-wrap'));
                return {
                  page: Math.round(document.body.scrollHeight * %f),
                  form: px(q('.form')), formBot: pb(q('.form')),
                  gen: px(q('.gen')), genBot: pb(q('.gen')),
                  stage: px(q('.stage')), stageBot: pb(q('.stage')),
                  disc: w ? [Math.round(w.left * %f), Math.round(w.top * %f),
                             Math.round(w.right * %f), Math.round(w.bottom * %f)] : null,
                  res: px(q('.res')), resBot: pb(q('.res')),
                  sec: px(q('.sec-head')), items: px(q('.items')),
                  unlock: px(q('.unlock')), unlockBot: pb(q('.unlock')),
                  footer: px(q('.footer')), footerBot: pb(q('.footer'))
                };
            }""".replace("%f", str(DSF)))

        # 1 还没写选项
        pg.evaluate("window.__ctl.reset()")
        shot("s_empty")
        print("  空态", pos())

        # 2 五个选项填好、还没转
        pg.evaluate("window.__ctl.setPreset('food')")
        pg.wait_for_timeout(60)
        st_opts = pos()
        shot("s_opts")
        print("  填好", st_opts)

        # 3 先探一次落点（会污染 history，所以探完 reset）
        pg.evaluate("window.__ctl.generate(0.05)")
        pg.wait_for_timeout(80)
        probe = pg.evaluate("window.__ctl.state()")
        to = round(probe["rotation"], 2)
        base = to % 360
        print("  落点 %.2f  base %.2f  label %s" % (to, base, probe["built"]["label"]))

        pg.evaluate("window.__ctl.reset()")
        pg.evaluate("window.__ctl.setPreset('food')")
        pg.wait_for_timeout(60)
        for k in range(NFRAME):
            pg.evaluate("window.__ctl.setRotation(%f)" % ((base + k * STEP) % 360))
            pg.wait_for_timeout(25)
            shot("sp_%02d" % k)

        # 4 转停：rand 0.05 固定落在第 0 格
        pg.evaluate("window.__ctl.setRotation(0)")
        pg.evaluate("window.__ctl.generate(0.05)")
        pg.wait_for_timeout(120)
        st = pg.evaluate("window.__ctl.state()")
        assert abs(st["rotation"] - to) < 0.01, "落点和探针不一致：%s vs %s" % (st["rotation"], to)
        shot("s_res")
        print("  结果", st["built"], "rotation", to)
        print("  结果页", pos())

        # 5 再转四次，攒出记录和「谁中得多」
        for r in (0.55, 0.82, 0.12, 0.72):
            pg.evaluate("window.__ctl.generate(%f)" % r)
            pg.wait_for_timeout(60)
        shot("s_hist")
        print("  记录", pg.evaluate("window.__ctl.state().history.length"), pos())

        # 6 解锁
        pg.evaluate("window.__ctl.unlock()")
        pg.wait_for_timeout(100)
        shot("s_unlock")

        meta = {
            "spin": {
                "from": 0.0, "to": to, "base": base, "step": STEP, "frames": NFRAME,
                "label": probe["built"]["label"], "index": probe["built"]["index"],
                "n": 5,
            },
            "disc": st_opts["disc"],     # 转盘圆的外接正方形（设备像素，scroll 0 下）
            "stage": st_opts["stage"],
        }
        (HERE / "build" / "state.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        print("  落点:", meta["spin"], "圆:", meta["disc"])
        b.close()

    print("完成，输出:", OUT, "共", len(list(OUT.glob("*.png"))), "张")


if __name__ == "__main__":
    main()
