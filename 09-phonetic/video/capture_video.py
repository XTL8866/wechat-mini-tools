# -*- coding: utf-8 -*-
"""视频用界面帧：按 1080x1730 渲染（上方 UI，下方 190px 留给字幕条）。
   python capture_video.py
   页面是「查询工具」，没有转盘那种连续动画，所以只需要几个稳定状态；
   滚动位置靠打印出来的设备像素坐标反推（窗口 1730，切在字行中间会留半截字）。
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

POS_JS = """() => {
    const q = s => document.querySelector(s);
    const top = e => e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : -1;
    const bot = e => e ? top(e) + Math.round(e.getBoundingClientRect().height) : -1;
    const cards = [...document.querySelectorAll('.card')].map(c => top(c));
    return {
      page: document.body.scrollHeight,
      hero: top(q('.hero')),
      form: top(q('.form')),
      formBottom: bot(q('.form')),
      seg: top(q('.seg')),
      chips: top(q('.chips')),
      gen: top(q('.gen')),
      genBottom: bot(q('.gen')),
      res: top(q('.res')),
      card1: cards[0] || -1,
      card2: cards[1] || -1,
      card3: cards[2] || -1,
      card3Bottom: bot(document.querySelectorAll('.card')[2]),
      sec: top(q('.sec-head')),
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
        pg.add_style_tag(content="*{transition:none!important;animation:none!important}")
        pg.wait_for_timeout(200)

        def shot(name, report=False):
            pg.evaluate("window.__ctl.hideToast()")
            pg.evaluate("window.scrollTo(0, 0)")
            pg.wait_for_timeout(50)
            pg.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
            if report:
                pos = pg.evaluate(POS_JS)
                dev = {k: round(v * DSF) for k, v in pos.items()}
                print("  ->", name, "页高", pos["page"], "设备px", json.dumps(dev, ensure_ascii=False))
            else:
                print("  ->", name, pg.evaluate("document.body.scrollHeight"))

        # 0 空态
        pg.evaluate("window.__ctl.reset()")
        shot("s_empty", report=True)

        # 1 填好三个词，还没查
        pg.evaluate("window.__ctl.setText('schedule\\nthorough\\nenvironment')")
        pg.wait_for_timeout(80)
        shot("s_typed", report=True)

        # 2 查出来（默认英美并排）
        pg.evaluate("window.__ctl.generate()")
        pg.wait_for_timeout(100)
        shot("s_both", report=True)

        # 3 切英式
        pg.evaluate("window.__ctl.setAccent('uk')")
        pg.wait_for_timeout(80)
        shot("s_uk", report=True)

        # 4 切美式：schedule 的音标整套换掉，这一镜是文案里的「换一套」
        pg.evaluate("window.__ctl.setAccent('us')")
        pg.wait_for_timeout(80)
        shot("s_us", report=True)

        # 5 复制第一条（切回英美并排，和前一镜的「两套并排」接得上）
        pg.evaluate("window.__ctl.setAccent('both')")
        pg.wait_for_timeout(60)
        pg.evaluate("window.__ctl.copy(0)")
        pg.wait_for_timeout(60)
        shot("s_copied", report=True)

        # 6 多查几轮，记录本攒满 5 条
        pg.evaluate("window.__ctl.setAccent('both')")
        for w in ["invoice", "hypothesis", "thorough", "deadline", "parameter"]:
            pg.evaluate("window.__ctl.setText('%s')" % w)
            pg.evaluate("window.__ctl.generate()")
            pg.wait_for_timeout(60)
        shot("s_history", report=True)

        # 7 解锁后一次查 6 个，记录本扩到 60
        pg.evaluate("window.__ctl.unlock()")
        pg.evaluate("window.__ctl.setText('schedule\\nthorough\\nenvironment\\nparameter\\ninvoice\\nhypothesis')")
        pg.evaluate("window.__ctl.generate()")
        pg.wait_for_timeout(100)
        shot("s_unlock", report=True)

        st = pg.evaluate("window.__ctl.state()")
        with open(HERE / "build" / "state.json", "w", encoding="utf-8") as f:
            json.dump({"unlocked": st["unlocked"], "accent": st["accent"],
                       "words": [x["word"] for x in st["entries"]],
                       "history": [x["word"] for x in st["history"]]}, f, ensure_ascii=False)
        print("  当前:", [x["word"] for x in st["entries"]],
              "| 记录:", [x["word"] for x in st["history"]],
              "| 上限:", 60 if st["unlocked"] else 5)
        b.close()

    from PIL import Image
    for f in sorted(OUT.glob("*.png")):
        print("  %-14s %s" % (f.stem, Image.open(f).size))
    print("共 %d 张，输出: %s" % (len(list(OUT.glob('*.png'))), OUT))


if __name__ == "__main__":
    main()
