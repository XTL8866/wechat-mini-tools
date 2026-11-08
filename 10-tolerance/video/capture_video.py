# -*- coding: utf-8 -*-
"""视频用界面帧：按 1080x1730 渲染（上方 UI，下方 190px 留给字幕条）。
   python capture_video.py
   页面是「查询工具」，稳定状态有限，主要是三卡结果 + 换配合 + 批量表。
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
      sec1: top(q('.sec')),
      sec2: top(document.querySelectorAll('.sec')[1]),
      gen: top(q('.gen')),
      genBottom: bot(q('.gen')),
      res: top(q('.res')),
      card1: cards[0] || -1,
      card1Bottom: bot(document.querySelectorAll('.card')[0]),
      card2: cards[1] || -1,
      card3: cards[2] || -1,
      card3Bottom: bot(document.querySelectorAll('.card')[2]),
      batch: top(q('#batchWrap')),
      batchBottom: bot(q('#batchWrap')),
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

        # 1 填好尺寸，还没查
        pg.evaluate("window.__ctl.setSize('25')")
        pg.wait_for_timeout(80)
        shot("s_typed")

        # 2 查出来：H7 / g6，三张卡
        pg.evaluate("window.__ctl.generate()")
        pg.wait_for_timeout(100)
        shot("s_single")

        # 3 换轴：g6 → k6，过渡配合
        pg.evaluate("window.__ctl.setFit('H7','k6')")
        pg.wait_for_timeout(100)
        shot("s_trans")

        # 4 换轴：k6 → s6，过盈配合
        pg.evaluate("window.__ctl.setFit('H7','s6')")
        pg.wait_for_timeout(100)
        shot("s_interf")

        # 5 复制：保持 s6 这一屏不动，只让按钮变「已复制」——
        #   换回 g6 再复制会让上一镜的过盈结论凭空消失，观感像工具重置了
        pg.evaluate("window.__ctl.copy()")
        pg.wait_for_timeout(60)
        shot("s_copied")

        # 6 解锁后批量三个尺寸（换回 g6，间隙配合的数值当对照表更好读）
        pg.evaluate("window.__ctl.unlock()")
        pg.evaluate("window.__ctl.setFit('H7','g6')")
        pg.evaluate("window.__ctl.setSize('25\\n40\\n60\\n90')")
        pg.evaluate("window.__ctl.generate()")
        pg.wait_for_timeout(120)
        shot("s_batch")

        st = pg.evaluate("window.__ctl.state()")
        with open(HERE / "build" / "state.json", "w", encoding="utf-8") as f:
            json.dump({"unlocked": st["unlocked"], "hole": st["hole"], "shaft": st["shaft"],
                       "sizes": [x["size"] for x in st["list"]],
                       "type": st["list"][0]["typeName"] if st["list"] else ""},
                      f, ensure_ascii=False)
        print("  当前:", st["hole"], "/", st["shaft"],
              "| 尺寸:", [x["size"] for x in st["list"]],
              "| 上限:", 8 if st["unlocked"] else 1)
        b.close()

    from PIL import Image
    for f in sorted(OUT.glob("*.png")):
        print("  %-14s %s" % (f.stem, Image.open(f).size))
    print("共 %d 张，输出: %s" % (len(list(OUT.glob('*.png'))), OUT))


if __name__ == "__main__":
    main()
