/* eslint-disable */
/**
 * 取色引擎 —— 取点、主色提取、HEX / RGB / HSL 互转、色卡增删、色名判定
 *
 * 为什么单独成 UMD 模块：小程序页面里 require('../../core/color.js')，浏览器预览页里
 * <script src> 直接挂到 window.ColorKit，两边跑的是同一份代码 —— 视频里截到的数字
 * 和真机上一模一样，不用两处各写一遍再对齐。
 *
 * 约定：
 *  - 对外一律给 #RRGGBB 大写；内部判重用 #rrggbb 小写，避免 #FFF 和 #ffffff 被当成两色
 *  - 任何失败都返回 { ok:false, code, message }，不抛异常 —— 页面直接把 message 弹 toast
 *  - 像素一律按 RGBA 四通道传（Uint8ClampedArray），来自 canvas getImageData
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ColorKit = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_INPUT = 32;      // 颜色串长度上限，超过直接判非法，不做截断计算
  var FREE_SAVE = 6;       // 免费色卡张数
  var PRO_SAVE = 60;       // 解锁后色卡张数
  var FREE_MAIN = 3;       // 免费主色个数
  var PRO_MAIN = 6;        // 解锁后主色个数
  var NEAR_MIN = 26;       // 两个主色之间小于这个距离就并掉
  var SAMPLE_CAP = 40000;  // 提主色最多抽这么多个像素点，大图不至于卡

  /* ------------------------------------------------------------------ *
   * 色名表：只用于「这个颜色叫什么」，判定用红均值加权距离，够用且不慢。
   * 常用的传统色名，覆盖红橙黄绿青蓝紫黑白灰，冷门名字不放，否则结果更飘。
   * ------------------------------------------------------------------ */
  var NAMES = [
    ['胭脂', '9D2933'], ['朱红', 'FF4C00'], ['妃色', 'ED5736'], ['品红', 'F00056'],
    ['桃红', 'F47983'], ['海棠红', 'DB5A6B'], ['石榴红', 'F20C00'], ['樱桃色', 'C93756'],
    ['大红', 'FF2121'], ['绯红', 'C83C23'], ['洋红', 'EB3C78'], ['枣红', 'C32136'],
    ['檀', 'B36D61'], ['殷红', 'BE002F'], ['酡颜', 'DC3023'], ['赫赤', 'C91F37'],
    ['嫣红', 'EF7A82'], ['粉红', 'FFB3A7'], ['绛紫', '8C4356'],

    ['橘黄', 'FF8936'], ['橙黄', 'FFA400'], ['杏黄', 'FFA631'], ['橘红', 'FF7500'],
    ['姜黄', 'FFC773'], ['缃色', 'F0C239'], ['茶色', 'B35C44'], ['驼色', 'A88462'],
    ['栗色', '60281E'], ['棕色', 'B25D25'], ['赭', '9C5333'], ['琥珀', 'CA6924'],
    ['金黄', 'F2BE45'], ['秋香色', 'D9B611'], ['牙色', 'EEDEB0'],

    ['嫩绿', 'BDDD22'], ['柳绿', 'AFDD22'], ['竹青', '789262'], ['葱青', '0EB83A'],
    ['青葱', '0AA344'], ['油绿', '00BC12'], ['绿沈', '0C8918'], ['碧色', '1BD1A5'],
    ['碧绿', '2ADD9C'], ['青碧', '48C0A3'], ['铜绿', '549688'], ['水绿', 'D4F2E7'],
    ['艾绿', 'A4E2C6'], ['松花色', 'BCE672'], ['黛绿', '426666'], ['墨绿', '50616D'],

    ['靛青', '177CB0'], ['藏青', '2E4E7E'], ['靛蓝', '065279'], ['石青', '1685A9'],
    ['天青', '78D5D7'], ['群青', '4C8DAE'], ['宝蓝', '4B5CC4'], ['藏蓝', '3B2E7E'],
    ['绀青', '003371'], ['蔚蓝', '3E8ED0'], ['孔雀蓝', '1E7E8C'], ['湖水蓝', '3D8E9E'],
    ['蟹壳青', '4E6E6A'], ['松石绿', '1AAE9E'], ['黛', '4A4266'], ['黛蓝', '425066'],

    ['紫色', '8D4BBB'], ['紫酱', '815476'], ['紫棠', '56004F'], ['青莲', '801DAE'],
    ['紫檀', '4C221B'], ['紫藤', '9B95C9'], ['丁香色', 'CCA4E3'], ['雪青', 'B0A4E3'],
    ['藕色', 'EDD1D8'], ['藕荷色', 'E4C6D0'],

    ['月白', 'D6ECF0'], ['花白', 'C2CCD0'], ['霜色', 'E9F1F6'], ['象牙白', 'FFFBF0'],
    ['茶白', 'F3F9F1'], ['鸭卵青', 'E0EEE8'], ['墨灰', '758A99'], ['苍色', '75878A'],
    ['水色', '88ADA6'], ['玄青', '3D3B4F'], ['乌黑', '1F1F1F'], ['墨色', '172326'],
    ['灰', '808080'], ['纯白', 'FFFFFF'], ['纯黑', '000000']
  ];

  var NAMED = NAMES.map(function (p) {
    var c = hexParts(p[1]);
    return { name: p[0], hex: '#' + p[1], r: c[0], g: c[1], b: c[2] };
  });

  /* ---------------------------- 基础工具 ---------------------------- */

  function err(code, message) {
    return { ok: false, code: code, message: message };
  }

  function num(v, dft) {
    var n = parseFloat(v);
    return isNaN(n) ? (dft || 0) : n;
  }

  function clampInt(v, lo, hi, dft) {
    var n = parseInt(v, 10);
    if (isNaN(n)) n = dft === undefined ? lo : dft;
    return Math.min(hi, Math.max(lo, n));
  }

  function clamp255(v) {
    return Math.min(255, Math.max(0, Math.round(num(v))));
  }

  function hexParts(six) {
    return [parseInt(six.slice(0, 2), 16), parseInt(six.slice(2, 4), 16), parseInt(six.slice(4, 6), 16)];
  }

  function pad2(n) {
    var s = n.toString(16).toUpperCase();
    return s.length === 1 ? '0' + s : s;
  }

  /* ---------------------------- 解析 ---------------------------- */

  function parseHex(input) {
    if (input === null || input === undefined) return err('EMPTY', '先输入一个颜色值');
    var s = String(input).trim();
    if (!s) return err('EMPTY', '先输入一个颜色值');
    if (s.length > MAX_INPUT) return err('TOO_LONG', '颜色值太长了，最多 ' + MAX_INPUT + ' 个字符');

    // 去掉 # 或 0x 前缀；带 alpha 的写法（#rgba / #rrggbbaa）只取 RGB，透明度这一版不参与计算
    var t = s.replace(/^#/, '').replace(/^0x/i, '').toLowerCase();
    if (t.length === 3 || t.length === 4) {
      t = t.slice(0, 3).replace(/./g, '$&$&');
    } else if (t.length === 6 || t.length === 8) {
      t = t.slice(0, 6);
    } else {
      return err('BAD_LENGTH', '颜色值要 3 位或 6 位，例如 #F00 或 #FF4D3D');
    }

    if (!/^[0-9a-f]{6}$/.test(t)) return err('BAD_HEX', '这不是一个合法的颜色值');

    var p = hexParts(t);
    return { ok: true, hex: '#' + t.toUpperCase(), r: p[0], g: p[1], b: p[2], input: s };
  }

  /**
   * 接受 #FFF / #FF4D3D / rgb(255,77,61) / rgb(255 77 61) / 255,77,61 /
   * hsl(6, 98%, 61%) 这几种写法，统一转成 { r, g, b, hex }。
   */
  function parseColor(input) {
    if (input === null || input === undefined) return err('EMPTY', '先输入一个颜色值');
    var s = String(input).trim();
    if (!s) return err('EMPTY', '先输入一个颜色值');
    if (s.length > MAX_INPUT) return err('TOO_LONG', '颜色值太长了，最多 ' + MAX_INPUT + ' 个字符');

    var low = s.toLowerCase();

    if (low.indexOf('rgb') === 0) {
      var rn = s.match(/-?\d+(\.\d+)?/g);
      if (!rn || rn.length < 3) return err('BAD_RGB', 'rgb() 里要三个数字');
      return {
        ok: true,
        hex: hexOf(parseFloat(rn[0]), parseFloat(rn[1]), parseFloat(rn[2])),
        r: clamp255(rn[0]), g: clamp255(rn[1]), b: clamp255(rn[2]),
        input: s
      };
    }

    if (low.indexOf('hsl') === 0) {
      var hn = s.match(/-?\d+(\.\d+)?/g);
      if (!hn || hn.length < 3) return err('BAD_HSL', 'hsl() 里要三个数字');
      var c = hslToRgb(parseFloat(hn[0]), parseFloat(hn[1]), parseFloat(hn[2]));
      return { ok: true, hex: hexOf(c.r, c.g, c.b), r: c.r, g: c.g, b: c.b, input: s };
    }

    if (low.indexOf(',') >= 0) {
      var cn = s.match(/-?\d+(\.\d+)?/g);
      if (!cn || cn.length < 3) return err('BAD_RGB', '三个数字用逗号隔开，例如 255,77,61');
      return {
        ok: true,
        hex: hexOf(parseFloat(cn[0]), parseFloat(cn[1]), parseFloat(cn[2])),
        r: clamp255(cn[0]), g: clamp255(cn[1]), b: clamp255(cn[2]),
        input: s
      };
    }

    return parseHex(s);
  }

  /** 任何形状（字符串 / {r,g,b} / 色卡项）都收敛成 { r, g, b }，拿不到就 null */
  function norm(c) {
    if (!c && c !== 0) return null;
    if (typeof c === 'string') {
      var p = parseColor(c);
      return p.ok ? { r: p.r, g: p.g, b: p.b } : null;
    }
    if (typeof c === 'object') {
      if (c.hex && (c.r === undefined || c.r === null)) {
        var q = parseColor(c.hex);
        return q.ok ? { r: q.r, g: q.g, b: q.b } : null;
      }
      if (c.r !== undefined && c.g !== undefined && c.b !== undefined) {
        return { r: clamp255(c.r), g: clamp255(c.g), b: clamp255(c.b) };
      }
    }
    return null;
  }

  /* ---------------------------- 格式输出 ---------------------------- */

  function hexOf(r, g, b) {
    return '#' + pad2(clamp255(r)) + pad2(clamp255(g)) + pad2(clamp255(b));
  }

  function keyOf(c) {
    var v = norm(c);
    return v ? hexOf(v.r, v.g, v.b).toLowerCase() : '';
  }

  function rgbToHsl(r, g, b) {
    var rr = clamp255(r) / 255, gg = clamp255(g) / 255, bb = clamp255(b) / 255;
    var max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
    var l = (max + min) / 2;
    var h = 0, s = 0;
    var d = max - min;
    if (d > 1e-9) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
      else if (max === gg) h = (bb - rr) / d + 2;
      else h = (rr - gg) / d + 4;
      h *= 60;
    }
    return { h: h, s: s * 100, l: l * 100 };
  }

  function hslToRgb(h, s, l) {
    var hh = num(h) % 360;
    if (hh < 0) hh += 360;
    hh = hh / 360;
    var ss = Math.min(1, Math.max(0, num(s) / 100));
    var ll = Math.min(1, Math.max(0, num(l) / 100));

    if (ss === 0) {
      var v = Math.round(ll * 255);
      return { r: v, g: v, b: v };
    }
    var q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    var p = 2 * ll - q;
    return {
      r: Math.round(hue2rgb(p, q, hh + 1 / 3) * 255),
      g: Math.round(hue2rgb(p, q, hh) * 255),
      b: Math.round(hue2rgb(p, q, hh - 1 / 3) * 255)
    };
  }

  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  /**
   * 三种写法一起给 —— 页面上的三行小字就是它算的。
   * 传进来什么都行（hex / rgb / 对象），只认 mode 决定返回哪一种。
   */
  function format(color, mode) {
    var c = norm(color);
    if (!c) return '';
    if (mode === 'rgb') return 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')';
    if (mode === 'hsl') {
      var x = rgbToHsl(c.r, c.g, c.b);
      var h = Math.round(x.h) % 360;
      if (h < 0) h += 360;
      return 'hsl(' + h + ', ' + Math.round(x.s) + '%, ' + Math.round(x.l) + '%)';
    }
    return hexOf(c.r, c.g, c.b);
  }

  /** 三种写法一次全给，避免页面里来回切 */
  function allFormats(color) {
    var c = norm(color);
    if (!c) return { hex: '', rgb: '', hsl: '' };
    return { hex: format(c, 'hex'), rgb: format(c, 'rgb'), hsl: format(c, 'hsl') };
  }

  /* ---------------------------- 色的属性 ---------------------------- */

  /** 红均值加权距离（redmean），比裸 RGB 欧氏距离更贴近肉眼判断，且没有开方开销 */
  function distance(a, b) {
    var rmean = (a.r + b.r) / 2;
    var dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
    return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
  }

  /** 这个颜色最接近哪个名字 */
  function describe(color) {
    var c = norm(color);
    if (!c) return { name: '', hex: '', distance: Infinity, exact: false };
    var best = null, bestD = Infinity;
    for (var i = 0; i < NAMED.length; i++) {
      var d = distance(c, NAMED[i]);
      if (d < bestD) { bestD = d; best = NAMED[i]; }
    }
    return {
      name: best.name,
      hex: best.hex,
      distance: Math.round(bestD),
      exact: bestD < 1
    };
  }

  /** 相对亮度（WCAG 定义，先做 sRGB 反伽马） */
  function luminance(color) {
    var c = norm(color);
    if (!c) return 0;
    var ch = [c.r, c.g, c.b].map(function (v) {
      var x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  function contrastRatio(a, b) {
    var la = luminance(a), lb = luminance(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10;
  }

  /** 这个底色上该配白字还是黑字 —— 抖音的自动取帧也会用到这个判断 */
  function readableInk(color) {
    return contrastRatio(color, { r: 255, g: 255, b: 255 }) >=
      contrastRatio(color, { r: 16, g: 16, b: 20 }) ? '#FFFFFF' : '#101014';
  }

  /**
   * 一句话说清这个颜色的调子：深浅 + 冷暖。
   * 「藏青 · 中等明度 · 冷色」比「这个颜色很好看」有用得多 ——
   * 用户真正想知道的是「它偏亮还是偏暗、能配暖色还是冷色」。
   */
  function tone(color) {
    var c = norm(color);
    if (!c) return '';
    var x = rgbToHsl(c.r, c.g, c.b);
    var light = x.l < 30 ? '深色' : (x.l > 72 ? '浅色' : '中等明度');
    var temp;
    if (x.s < 8) temp = '接近无彩';
    else if (x.h < 45 || x.h >= 330) temp = '暖色';
    else if (x.h < 75) temp = '偏暖';
    else if (x.h < 165) temp = '中性色';
    else if (x.h < 270) temp = '冷色';
    else temp = '偏冷';
    return light + ' · ' + temp;
  }

  /* ---------------------------- 取点 ---------------------------- */

  /**
   * 从像素数组里取一个点。
   * px/py 是图片坐标系（不是屏幕坐标），越界自动夹到边缘，所以点歪了也不会崩。
   */
  function pick(pixels, w, h, px, py) {
    if (!pixels || !w || !h) return err('NO_IMAGE', '先选一张图片');
    if (pixels.length < w * h * 4) return err('BAD_PIXELS', '像素数据不完整，换张图再试');
    var x = clampInt(Math.round(num(px)), 0, w - 1, 0);
    var y = clampInt(Math.round(num(py)), 0, h - 1, 0);
    var i = (y * w + x) * 4;
    var r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    return { ok: true, r: r, g: g, b: b, hex: hexOf(r, g, b), x: x, y: y };
  }

  /* ---------------------------- 主色提取 ---------------------------- */

  /**
   * 抽主色：先按 16 级量化桶计数（每通道 >> 4），再按「谁面积大」排，
   * 最后把彼此太近的并掉，保证出来的几个是能看出差别的几种色，
   * 而不是同一片天空的三档蓝。
   */
  function extract(pixels, w, h, n) {
    if (!pixels || !w || !h) return [];
    if (pixels.length < w * h * 4) return [];
    var want = clampInt(n, 1, PRO_MAIN, PRO_MAIN);
    var total = w * h;
    var step = Math.max(1, Math.ceil(Math.sqrt(total / SAMPLE_CAP)));

    var buckets = {};
    var sampled = 0;
    for (var y = 0; y < h; y += step) {
      for (var x = 0; x < w; x += step) {
        var i = (y * w + x) * 4;
        if (pixels[i + 3] !== undefined && pixels[i + 3] < 128) continue;  // 透明像素不算
        var r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        var k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        var bk = buckets[k];
        if (!bk) { bk = buckets[k] = { c: 0, r: 0, g: 0, b: 0 }; }
        bk.c++; bk.r += r; bk.g += g; bk.b += b;
        sampled++;
      }
    }
    if (!sampled) return [];

    var arr = [];
    for (var key in buckets) {
      if (!Object.prototype.hasOwnProperty.call(buckets, key)) continue;
      var o = buckets[key];
      arr.push({ r: Math.round(o.r / o.c), g: Math.round(o.g / o.c), b: Math.round(o.b / o.c), count: o.c });
    }
    arr.sort(function (a, b) { return b.count - a.count; });

    var out = [];
    for (var j = 0; j < arr.length && out.length < want; j++) {
      var cand = arr[j];
      var tooNear = false;
      for (var t = 0; t < out.length; t++) {
        if (distance(cand, out[t]) < NEAR_MIN) { tooNear = true; break; }
      }
      if (tooNear) continue;
      out.push({
        r: cand.r, g: cand.g, b: cand.b,
        hex: hexOf(cand.r, cand.g, cand.b),
        name: describe(cand).name,
        ratio: Math.round((cand.count / sampled) * 1000) / 1000
      });
    }
    return out;
  }

  /* ---------------------------- 色卡 ---------------------------- */

  function paletteLimit(unlocked) {
    return unlocked ? PRO_SAVE : FREE_SAVE;
  }

  function mainLimit(unlocked) {
    return unlocked ? PRO_MAIN : FREE_MAIN;
  }

  /**
   * 存一张色卡。重复的（大小写不同也算同一个）不重复存，满了给明确提示，
   * 两种情况都返回原 list，页面不用回滚。
   */
  function addToPalette(list, color, limit) {
    var cur = Array.isArray(list) ? list.slice() : [];
    var c = norm(color);
    if (!c) return { ok: false, code: 'EMPTY', message: '先取一个颜色', list: cur };

    var lim = clampInt(limit, 1, PRO_SAVE, FREE_SAVE);
    var k = keyOf(c);
    for (var i = 0; i < cur.length; i++) {
      if (keyOf(cur[i]) === k) {
        return { ok: false, code: 'DUP', message: '这个颜色已经在色卡里了', list: cur };
      }
    }
    if (cur.length >= lim) {
      return { ok: false, code: 'FULL', message: '色卡满了（' + lim + ' 张），删一张再存', list: cur };
    }

    var item = { hex: hexOf(c.r, c.g, c.b), r: c.r, g: c.g, b: c.b, name: describe(c).name };
    cur.push(item);
    return { ok: true, code: 'OK', message: '已存进色卡', list: cur, item: item };
  }

  /** 按下标删；下标越界原样返回，不报错 */
  function removeFromPalette(list, index) {
    var cur = Array.isArray(list) ? list.slice() : [];
    var i = parseInt(index, 10);
    if (isNaN(i) || i < 0 || i >= cur.length) return cur;
    cur.splice(i, 1);
    return cur;
  }

  /** 色卡导出成文本，一次粘到设计稿或群里 */
  function paletteText(list) {
    if (!Array.isArray(list) || !list.length) return '';
    return list.map(function (x, i) {
      var c = norm(x);
      return (i + 1) + '. ' + hexOf(c.r, c.g, c.b) + '  ' + format(c, 'rgb') + '  ' + describe(c).name;
    }).join('\n');
  }

  return {
    MAX_INPUT: MAX_INPUT,
    FREE_SAVE: FREE_SAVE,
    PRO_SAVE: PRO_SAVE,
    FREE_MAIN: FREE_MAIN,
    PRO_MAIN: PRO_MAIN,
    NAMES: NAMED,

    parseHex: parseHex,
    parseColor: parseColor,
    format: format,
    allFormats: allFormats,
    hexOf: hexOf,
    keyOf: keyOf,

    rgbToHsl: rgbToHsl,
    hslToRgb: hslToRgb,

    distance: distance,
    describe: describe,
    tone: tone,
    luminance: luminance,
    contrastRatio: contrastRatio,
    readableInk: readableInk,

    pick: pick,
    extract: extract,

    paletteLimit: paletteLimit,
    mainLimit: mainLimit,
    addToPalette: addToPalette,
    removeFromPalette: removeFromPalette,
    paletteText: paletteText
  };
});
