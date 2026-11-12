# -*- coding: utf-8 -*-
"""视频用界面帧：按 390x625 逻辑视口截长图，合成时按滚动位置裁 1080x1920 窗口。

七张状态图：
  s_empty  还没选图
  s_ready  示例图 + 3×3 网格线（左右被裁的部分压暗）
  s_cut    切完：九张结果板
  s_pad    宽白边：每张内缩一圈
  s_grid2  换成 2×2：四张大图
  s_saved  已保存（按钮变灰）
  s_unlock 解锁后

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
DSF = 2.7692             # 390*2.7692 = 1080


def main():
    from PIL import Image

    meta = {}
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
            pg.wait_for_timeout(45)
            path = OUT / (name + ".png")
            pg.screenshot(path=str(path), full_page=True)
            im = Image.open(path)
            if im.width != 1080:
                im.crop((0, 0, 1080, im.height)).save(path)
            print("  -> %-8s %s" % (name, im.size))
            meta[name] = pg.evaluate("window.__ctl.measure()")

        # 1 空态
        pg.evaluate("window.__ctl.reset()")
        shot("s_empty")

        # 2 有图 + 3×3 网格线（左右压暗，看得见「会被裁掉」）
        pg.evaluate("window.__ctl.setImage('day')")
        pg.evaluate("window.__ctl.setGrid('3')")
        pg.wait_for_timeout(120)
        shot("s_ready")

        # 3 切完九张
        pg.evaluate("window.__ctl.generate()")
        pg.wait_for_timeout(120)
        st = pg.evaluate("window.__ctl.state()")
        assert st["result"], "切图失败"
        print("  3×3:", st["plan"]["count"], "张", st["plan"]["out"])
        shot("s_cut")

        # 4 宽白边
        pg.evaluate("window.__ctl.setPad('wide')")
        pg.wait_for_timeout(120)
        shot("s_pad")

        # 5 换成 2×2
        pg.evaluate("window.__ctl.setGrid('2')")
        pg.evaluate("window.__ctl.setPad('none')")
        pg.evaluate("window.__ctl.generate()")
        pg.wait_for_timeout(120)
        st2 = pg.evaluate("window.__ctl.state()")
        print("  2×2:", st2["plan"]["count"], "张")
        shot("s_grid2")

        # 6 回到九张并存好
        pg.evaluate("window.__ctl.setGrid('3')")
        pg.evaluate("window.__ctl.generate()")
        pg.evaluate("window.__ctl.save()")
        pg.wait_for_timeout(120)
        shot("s_saved")

        # 7 解锁
        pg.evaluate("window.__ctl.unlock()")
        pg.wait_for_timeout(120)
        shot("s_unlock")

        print("\n各状态坐标（设备像素）：")
        for k, v in meta.items():
            print(" ", k, v)
        (HERE / "build" / "measure.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        b.close()

    print("完成，输出:", OUT, "共", len(list(OUT.glob("*.png"))), "张")


if __name__ == "__main__":
    main()
