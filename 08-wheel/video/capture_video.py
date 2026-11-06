# -*- coding: utf-8 -*-
"""视频用界面帧：按 1080x1730 渲染（上方 UI，下方 190px 留给字幕条）。
   python capture_video.py
   转盘不能靠裁窗口做出「转动」，所以额外截 24 张不同转角的整页图，
   合成时按缓出曲线挑帧，转起来是连续的。
"""
import pathlib

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
URL = "file:///" + (HERE.parent / "preview" / "index.html").as_posix()
OUT = HERE / "build" / "ui"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 390, 625          # 逻辑视口
DSF = 2.7692             # 390*2.7692 = 1080, 625*2.7692 = 1731

SPIN_FRAMES = 24         # 15 度一帧，正好一圈
POS_JS = """() => {
    const q = s => document.querySelector(s);
    const top = e => e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : -1;
    const bot = e => e ? top(e) + Math.round(e.getBoundingClientRect().height) : -1;
    return {
      page: document.body.scrollHeight,
      hero: top(q('.hero')),
      presets: top(q('.presets')),
      form: top(q('.form')),
      gen: top(q('.gen')),
      stage: top(q('.stage')),
      stageBottom: bot(q('.stage')),
      res: top(q('.res')),
      resBottom: bot(q('.res')),
      items: top(q('.items')),
      itemsBottom: bot(q('.items')),
      unlock: top(q('.unlock')),
      note: top(q('.note')),
      footer: bot(q('.footer'))
    };
}"""


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

        def shot(name, report=False):
            # 长图：视频里按滚动位置裁窗口，做出平滑滚动而不是硬切
            pg.evaluate("window.__ctl.hideToast()")
            pg.evaluate("window.scrollTo(0, 0)")
            pg.wait_for_timeout(50)
            pg.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
            if report:
                pos = pg.evaluate(POS_JS)
                dev = {k: round(v * DSF) for k, v in pos.items()}
                print("  ->", name, "页高", pos["page"], "设备px", dev)
            else:
                print("  ->", name, pg.evaluate("document.body.scrollHeight"))

        # 0 还没写选项：空转盘
        pg.evaluate("window.__ctl.reset()")
        shot("s_empty", report=True)

        # 1 填好六个选项，转盘已经分好格
        pg.evaluate("window.__ctl.setPreset('food')")
        pg.wait_for_timeout(80)
        shot("s_filled", report=True)

        # 2 转动过程：24 个转角
        for i in range(SPIN_FRAMES):
            pg.evaluate("window.__ctl.setRotation(%d)" % (i * 15))
            pg.wait_for_timeout(20)
            shot("s_spin%02d" % i)
        pg.evaluate("window.__ctl.setRotation(0)")

        # 3 停在「火锅」（五格里第一个）；视频里空转 4 圈，转轴数和合成那侧对齐
        pg.evaluate("window.__ctl.setTurns(4)")
        pg.evaluate("window.__ctl.generate(0.1)")
        pg.wait_for_timeout(120)
        shot("s_result", report=True)

        # 4 换一套选项：谁买单，四格
        pg.evaluate("window.__ctl.setPreset('pay')")
        pg.wait_for_timeout(60)
        pg.evaluate("window.__ctl.generate(0.6)")
        pg.wait_for_timeout(100)
        shot("s_preset4", report=True)

        # 5 不放回：今天做啥五格，连抽三次，抽过的不再出现
        pg.evaluate("window.__ctl.setNoRepeat(true)")
        pg.evaluate("window.__ctl.setPreset('todo')")
        pg.wait_for_timeout(60)
        for _ in range(3):
            pg.evaluate("window.__ctl.generate(0)")
            pg.wait_for_timeout(70)
        shot("s_norepeat", report=True)

        # 6 复制结果
        pg.evaluate("window.__ctl.copy()")
        pg.wait_for_timeout(60)
        shot("s_copied", report=True)

        # 7 解锁：5 条 → 60 条
        pg.evaluate("window.__ctl.unlock()")
        pg.wait_for_timeout(80)
        shot("s_unlock", report=True)

        st = pg.evaluate("window.__ctl.state()")
        import json
        with open(HERE / "build" / "state.json", "w", encoding="utf-8") as f:
            json.dump({"rotation": st["rotation"], "turns": st["turns"],
                       "label": st["built"] and st["built"]["label"]}, f, ensure_ascii=False)
        print("  当前结果:", st["built"] and st["built"]["label"],
              "| 记录:", [x["label"] for x in st["history"]],
              "| 上限:", 60 if st["unlocked"] else 5,
              "| 转角:", round(st["rotation"], 2))
        print("  窗口高(设备px):", round(H * DSF), " 每帧可滚:", round((st and 0 or 0)))
        b.close()

    from PIL import Image
    for f in sorted(OUT.glob("*.png"))[:4]:
        print("  %-14s %s" % (f.stem, Image.open(f).size))
    print("共 %d 张，输出: %s" % (len(list(OUT.glob('*.png'))), OUT))


if __name__ == "__main__":
    main()
