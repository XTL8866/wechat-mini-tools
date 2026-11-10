# -*- coding: utf-8 -*-
"""视频用界面帧：按 1080x1730 渲染（上方 UI，下方 190px 留给字幕条）。
   python capture_video.py
   页面是「金额大写」，稳定状态：空态、填好没转换、主结果、零在中间、
   上亿大额、复制、解锁后逐笔。滚动位置靠打印出来的设备像素坐标反推。
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
    const secs = [...document.querySelectorAll('.section')];
    const cards = [...document.querySelectorAll('.card')];
    return {
      page: document.body.scrollHeight,
      hero: top(q('.hero')),
      field: top(q('.field')),
      fieldBottom: bot(q('.field')),
      sec: top(secs[0]),
      secBottom: bot(secs[0]),
      gen: top(q('.gen')),
      genBottom: bot(q('.gen')),
      res: top(q('.res')),
      card1: cards[0] ? top(cards[0]) : -1,
      card1Bottom: cards[0] ? bot(cards[0]) : -1,
      card2: cards[1] ? top(cards[1]) : -1,
      card2Bottom: cards[1] ? bot(cards[1]) : -1,
      card3: cards[2] ? top(cards[2]) : -1,
      card3Bottom: cards[2] ? bot(cards[2]) : -1,
      upper: top(q('.upper')),
      batch: top(q('#batchWrap')),
      batchBottom: bot(q('#batchWrap')),
      unlock: top(q('.unlock')),
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

        def shot(name):
            pg.evaluate("window.__ctl.hideToast()")
            pg.evaluate("window.scrollTo(0, 0)")
            pg.wait_for_timeout(50)
            pg.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
            pos = pg.evaluate(POS_JS)
            dev = {k: round(v * DSF) for k, v in pos.items()}
            print("  ->", name, "页高", pos["page"], "设备px",
                  json.dumps(dev, ensure_ascii=False))

        # 0 空态
        pg.evaluate("window.__ctl.reset()")
        shot("s_empty")

        # 1 填好 1234.56，还没转换
        pg.evaluate("window.__ctl.setValue('1234.56')")
        pg.wait_for_timeout(80)
        shot("s_typed")

        # 2 转出来：1234.56 → 壹仟贰佰叁拾肆元伍角陆分
        pg.evaluate("window.__ctl.generate()")
        pg.wait_for_timeout(100)
        shot("s_main")

        # 3 零在中间：100500 → 壹拾万零伍佰元整
        pg.evaluate("window.__ctl.setQuick('100500')")
        pg.wait_for_timeout(120)
        shot("s_zero")

        # 4 上亿大额：100000001 → 壹亿零壹元整（万级整级为空）
        pg.evaluate("window.__ctl.setQuick('100000001')")
        pg.wait_for_timeout(120)
        shot("s_big")

        # 5 复制：保持 s_big 这一屏不动，只让按钮变「已复制」
        pg.evaluate("window.__ctl.copy()")
        pg.wait_for_timeout(60)
        shot("s_copied")

        # 6 解锁后逐笔四笔
        pg.evaluate("window.__ctl.unlock()")
        pg.evaluate("window.__ctl.setValue('1234.56\\n100500\\n107.06\\n1200\\n100000001')")
        pg.evaluate("window.__ctl.generate()")
        pg.wait_for_timeout(120)
        shot("s_batch")

        st = pg.evaluate("window.__ctl.state()")
        with open(HERE / "build" / "state.json", "w", encoding="utf-8") as f:
            json.dump({"unlocked": st["unlocked"],
                       "rows": [x["small"] for x in st["rows"]],
                       "upper": (st["detail"] or {}).get("upper", "")},
                      f, ensure_ascii=False)
        print("  当前:", (st["detail"] or {}).get("upper", ""),
              "| 逐笔:", [x["small"] for x in st["rows"]], "| 上限:", 8 if st["unlocked"] else 1)
        b.close()

    from PIL import Image
    for f in sorted(OUT.glob("*.png")):
        print("  %-14s %s" % (f.stem, Image.open(f).size))
    print("共 %d 张，输出: %s" % (len(list(OUT.glob('*.png'))), OUT))


if __name__ == "__main__":
    main()
