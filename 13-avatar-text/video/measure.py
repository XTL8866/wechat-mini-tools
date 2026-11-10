# -*- coding: utf-8 -*-
"""量各块在长图里的设备像素位置，用来定 build_fast.py 的滚动量。
    python measure.py
"""
import pathlib

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
URL = "file:///" + (HERE.parent / "preview" / "index.html").as_posix()
DSF = 2.7692

JS = """() => {
  const q = s => document.querySelector(s);
  const px = e => e ? Math.round((e.getBoundingClientRect().top + window.scrollY) * %f) : -1;
  const pb = e => e ? Math.round((e.getBoundingClientRect().top + window.scrollY + e.offsetHeight) * %f) : -1;
  const r = {
    page: Math.round(document.body.scrollHeight * %f),
    stage: px(q('.stage')), stageBot: pb(q('.stage')),
    field: px(q('.field')), fieldBot: pb(q('.field')),
    sizes: px(q('#sizeChips')), colors: px(q('#swRow')),
    strokeRow: px(q('#strokeChips')), barRow: pb(q('#barBox')),
    btn: px(q('.btn-primary')), btnBot: pb(q('.btn-primary')),
    res: px(q('.result-head')), meta: pb(q('.meta-row')),
    meter1: px(q('.meter-row')), meterEnd: pb(q('.meter-row:nth-of-type(4)')),
    save: px(q('.btn-save')), saveBot: pb(q('.btn-save')),
    unlock: px(q('.unlock')), unlockBot: pb(q('.unlock')),
    footer: px(q('.footer')), footerBot: pb(q('.footer'))
  };
  return r;
}""" % (DSF, DSF, DSF)


def dump(tag, pg):
    r = pg.evaluate(JS)
    print(" " + tag, r)
    return r


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome")
        pg = b.new_page(viewport={"width": 390, "height": 625}, device_scale_factor=DSF)
        pg.goto(URL, wait_until="networkidle")
        pg.wait_for_timeout(300)

        pg.evaluate("""() => { const c = window.__ctl;
          c.reset(); c.setSample('light'); c.setText('中秋快乐');
          c.setColor('#FFFFFF'); c.setStroke(0); c.generate(); }""")
        pg.wait_for_timeout(150)
        dump("bad  ", pg)

        pg.evaluate("""() => { const c = window.__ctl;
          c.setColor('auto'); c.generate(); }""")
        pg.wait_for_timeout(150)
        dump("auto ", pg)

        pg.evaluate("""() => { const c = window.__ctl;
          c.setSize('l'); c.setText('今年也要好好吃饭睡觉'); c.generate(); }""")
        pg.wait_for_timeout(150)
        dump("long ", pg)

        pg.evaluate("""() => { const c = window.__ctl;
          c.setSize('m'); c.setText('中秋快乐'); c.setColor('#FFFFFF');
          c.setStroke(3); c.generate(); c.save(); }""")
        pg.wait_for_timeout(150)
        dump("saved", pg)
        b.close()


if __name__ == "__main__":
    main()
