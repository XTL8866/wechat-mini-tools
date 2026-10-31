/**
 * 头像文字贴纸引擎（纯逻辑，零依赖）
 * 同时可被微信小程序 require() 和浏览器 <script> 加载。
 *
 * 它不画像素，只算一份「绘制计划」：字号多大、断几行、每行几个字、
 * 每个字画在哪个坐标、描边多宽、用哪个颜色。小程序 canvas 和浏览器 canvas
 * 各自照着这份计划画，所以两处看到的界面完全一致。
 *
 * 为什么把排版放在 core 而不是各渲染层各写一遍：
 * 字号自适应是有取舍的（一行放不下就缩，缩到下限还放不下就断行），
 * 两处各写一遍必然长得不一样。测试也只能测 core 里的那一份。
 *
 * 为什么用等宽估算而不是真实 measureText：
 * node 里没有 canvas，测不了真实字宽。中文一个字就是一个 em，估算误差很小；
 * 边距留 8%，足够吸收西文和字体族的差异。印错的风险由测试兜住：
 * 断言「所有字的右边界不出安全区」。
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sticker = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FONTS = [
    { id: 'heavy', name: '粗黑', family: 'sans-serif', weight: 800, desc: '最抓眼，姓氏首选' },
    { id: 'song', name: '宋体', family: 'serif', weight: 700, desc: '有笔锋，偏正式' },
    { id: 'thin', name: '细黑', family: 'sans-serif', weight: 300, desc: '轻，不压图' },
    { id: 'mono', name: '等宽', family: 'monospace', weight: 600, desc: '方正，像标签' }
  ];

  var COLORS = [
    { id: 'white', name: '白', value: '#FFFFFF' },
    { id: 'ink', name: '墨黑', value: '#101014' },
    { id: 'red', name: '朱红', value: '#E8342A' },
    { id: 'gold', name: '暖金', value: '#F2C14E' },
    { id: 'teal', name: '青绿', value: '#1FA98B' },
    { id: 'blue', name: '靛蓝', value: '#2E5BE6' }
  ];

  var POSITIONS = [
    { id: 'top', name: '上面', ratio: 0.24 },
    { id: 'middle', name: '中间', ratio: 0.50 },
    { id: 'bottom', name: '下面', ratio: 0.78 }
  ];

  var MAX_CHARS = 12;    // 贴纸文字上限，超过就不是贴纸了
  var MAX_SIDE = 1600;   // 导出最长边，再大存相册慢且没必要
  var PAD = 0.08;        // 左右安全边距（占宽度比例）
  var MAX_LINES = 2;
  var ONE_LINE_LIMIT = 6;   // 6 字以内优先一行，超过就分两行
  var DEFAULT_COLOR = '#FFFFFF';
  var INK_DARK = '#101014';
  var INK_LIGHT = '#FFFFFF';

  // ---------- 颜色 ----------

  var NAMED = {
    white: [255, 255, 255], black: [0, 0, 0], red: [255, 0, 0],
    green: [0, 128, 0], blue: [0, 0, 255], yellow: [255, 255, 0],
    gray: [128, 128, 128], grey: [128, 128, 128], orange: [255, 165, 0]
  };

  function clamp255(n) {
    n = Math.round(n);
    return n < 0 ? 0 : (n > 255 ? 255 : n);
  }

  /**
   * 解析颜色。支持 #RGB / #RRGGBB / #RRGGBBAA / rgb() / rgba() / 少量英文名。
   * 解析不了就返回 null，由调用方决定回落值 —— 静默返回白色会让
   * 「颜色选错了」这种问题永远查不出来。
   */
  function parseColor(raw) {
    if (raw == null) return null;
    if (typeof raw === 'object' && raw.r != null) {
      return { r: clamp255(raw.r), g: clamp255(raw.g), b: clamp255(raw.b), a: raw.a == null ? 1 : raw.a };
    }
    var s = String(raw).trim().toLowerCase();
    if (!s) return null;
    if (NAMED[s]) return { r: NAMED[s][0], g: NAMED[s][1], b: NAMED[s][2], a: 1 };

    if (s.charAt(0) === '#') {
      var h = s.slice(1);
      if (h.length === 3 || h.length === 4) {
        h = h.split('').map(function (c) { return c + c; }).join('');
      }
      if (h.length === 6 || h.length === 8) {
        if (!/^[0-9a-f]+$/.test(h)) return null;
        return {
          r: parseInt(h.slice(0, 2), 16),
          g: parseInt(h.slice(2, 4), 16),
          b: parseInt(h.slice(4, 6), 16),
          a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
        };
      }
      return null;
    }

    var m = s.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      var p = m[1].split(',').map(function (x) { return x.trim(); });
      if (p.length < 3) return null;
      var nums = p.slice(0, 3).map(function (x) {
        return x.charAt(x.length - 1) === '%' ? parseFloat(x) * 2.55 : parseFloat(x);
      });
      if (nums.some(function (n) { return isNaN(n); })) return null;
      return {
        r: clamp255(nums[0]), g: clamp255(nums[1]), b: clamp255(nums[2]),
        a: p.length > 3 ? parseFloat(p[3]) : 1
      };
    }
    return null;
  }

  function toHex(c) {
    var p = typeof c === 'string' ? parseColor(c) : c;
    if (!p) return '';
    var f = function (n) { var s = clamp255(n).toString(16).toUpperCase(); return s.length < 2 ? '0' + s : s; };
    return '#' + f(p.r) + f(p.g) + f(p.b);
  }

  function toRgbString(c) {
    var p = typeof c === 'string' ? parseColor(c) : c;
    if (!p) return '';
    return p.a < 1
      ? 'rgba(' + p.r + ', ' + p.g + ', ' + p.b + ', ' + Math.round(p.a * 100) / 100 + ')'
      : 'rgb(' + p.r + ', ' + p.g + ', ' + p.b + ')';
  }

  /** WCAG 相对亮度，0 黑 1 白 */
  function luminance(c) {
    var p = typeof c === 'string' ? parseColor(c) : c;
    if (!p) return 0;
    var ch = [p.r, p.g, p.b].map(function (v) {
      var x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  /** 对比度，1:1 到 21:1 */
  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  /** 给定背景亮度，返回看得清的文字色 */
  function pickInk(bgLum) {
    var l = typeof bgLum === 'number' && !isNaN(bgLum) ? bgLum : 0;
    // 取对比度更高的那个；临界点不在 0.5，而在两者相等处（约 0.179）
    return contrast(INK_LIGHT, { r: l * 255, g: l * 255, b: l * 255 }) >=
           contrast(INK_DARK, { r: l * 255, g: l * 255, b: l * 255 })
      ? INK_LIGHT : INK_DARK;
  }

  /** 采样点求平均亮度，入参 [[r,g,b], ...] 或 [{r,g,b}, ...] */
  function averageLuminance(samples) {
    if (!samples || !samples.length) return null;
    var sum = 0, n = 0;
    for (var i = 0; i < samples.length; i++) {
      var s = samples[i];
      if (!s) continue;
      var c = Array.isArray(s) ? { r: s[0], g: s[1], b: s[2] } : s;
      if (c.r == null) continue;
      sum += luminance(c);
      n++;
    }
    return n ? sum / n : null;
  }

  /** 描边色：和文字色反差最大的一侧，白字配黑边，黑字配白边 */
  function outlineOf(color) {
    var p = parseColor(color) || parseColor(DEFAULT_COLOR);
    return luminance(p) > 0.35 ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.72)';
  }

  // ---------- 排版 ----------

  function charEm(ch, family) {
    var code = ch.charCodeAt(0);
    if (code < 128) {
      if (ch === ' ') return family === 'monospace' ? 0.6 : 0.3;
      if (/[A-Z0-9]/.test(ch)) return family === 'monospace' ? 0.62 : 0.64;
      if (/[a-z]/.test(ch)) return family === 'monospace' ? 0.62 : 0.54;
      return family === 'monospace' ? 0.62 : 0.5;
    }
    // 全角标点略窄于汉字，视觉上才不空
    if (/[，。、！？：；（）「」《》]/.test(ch)) return 0.98;
    return 1;
  }

  function textWidth(text, size, family, spacing) {
    var w = 0;
    for (var i = 0; i < text.length; i++) w += charEm(text.charAt(i), family) * size;
    if (text.length > 1) w += spacing * (text.length - 1);
    return w;
  }

  function normalizeText(raw) {
    var s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    // 去掉零宽字符和不可见控制符，它们会让字数统计和实际显示对不上
    s = s.replace(/[\u200B-\u200D\uFEFF\u0000-\u001F]/g, '');
    return s;
  }

  function findFont(id) {
    for (var i = 0; i < FONTS.length; i++) if (FONTS[i].id === id) return FONTS[i];
    return FONTS[0];
  }

  function findPosition(id) {
    for (var i = 0; i < POSITIONS.length; i++) if (POSITIONS[i].id === id) return POSITIONS[i];
    return POSITIONS[1];
  }

  /** 把 12 字切成尽量均等的两行，切点取「两行宽度差最小」的那个 */
  function splitBalanced(text) {
    var best = 1, bestDiff = Infinity;
    for (var i = 1; i < text.length; i++) {
      var diff = Math.abs(i - (text.length - i));
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    return [text.slice(0, best), text.slice(best)];
  }

  /**
   * 生成绘制计划
   * @param {Object} opt
   *  - text     要贴的字
   *  - imgW/imgH 原图尺寸，不知道就传 0，按 3:4 兜底
   *  - fontId   字体
   *  - color    文字色（'auto' 或具体色值）
   *  - posId    位置 top/middle/bottom
   *  - outline  是否描边
   *  - bgLum    背景平均亮度 0-1，可选；给了才能自动选色
   * @returns {Object} plan
   */
  function buildPlan(opt) {
    opt = opt || {};
    var text = normalizeText(opt.text);
    if (!text) {
      return fail('EMPTY_TEXT', '先打几个字');
    }
    if (text.length > MAX_CHARS) {
      return fail('TOO_LONG', '最多 ' + MAX_CHARS + ' 个字，再多就挡住图了');
    }

    // ---- 画布尺寸：保留比例，最长边压到 1600 ----
    var iw = Math.round(Number(opt.imgW) || 0);
    var ih = Math.round(Number(opt.imgH) || 0);
    if (iw <= 0 || ih <= 0) { iw = 900; ih = 1200; }
    var scale = Math.min(1, MAX_SIDE / Math.max(iw, ih));
    var w = Math.max(2, Math.round(iw * scale));
    var h = Math.max(2, Math.round(ih * scale));

    var font = findFont(opt.fontId);
    var pos = findPosition(opt.posId);

    var safeW = w * (1 - PAD * 2);
    var maxSize = Math.min(h * 0.30, w * 0.42);
    var minSize = Math.max(14, Math.round(h * 0.035));

    // ---- 断行：6 字以内一行，超过分两行 ----
    var lines;
    if (text.length <= ONE_LINE_LIMIT) {
      lines = [text];
    } else {
      lines = splitBalanced(text);
    }
    if (lines.length > MAX_LINES) lines = lines.slice(0, MAX_LINES);

    // 字体越粗，字面越宽，给一点点补偿，避免粗黑压出安全区
    var widthBias = (font.weight >= 700 ? 1.03 : 1.0);

    var size = maxSize;
    var spacingRatio = 0.06;
    var widest = 0;
    // 逐级缩小直到两行都放得下（步长 2px，30% 高度 ≈ 480px，最多几十轮）
    while (size >= minSize) {
      var sp = size * spacingRatio;
      widest = 0;
      for (var i = 0; i < lines.length; i++) {
        var lw = textWidth(lines[i], size, font.family, sp) * widthBias;
        if (lw > widest) widest = lw;
      }
      // 行数也要压住总高，别让两行贴到画布边上
      var totalH = lines.length * size * 1.18;
      if (widest <= safeW && totalH <= h * 0.62) break;
      size -= 2;
    }
    size = Math.max(minSize, Math.round(size));

    var lineHeight = Math.round(size * 1.18);
    var spacing = size * spacingRatio;
    var warning = '';

    if (widest > safeW + 1) {
      // 缩到下限还是溢出：这是「字太多」的硬边界，只能提示
      warning = '字有点多，字号已经压到最小';
    }

    // ---- 位置 ----
    var centerY = h * pos.ratio;
    var firstY = centerY - (lines.length - 1) * lineHeight / 2;

    var outLines = lines.map(function (line, li) {
      var sp = spacing;
      var lw = textWidth(line, size, font.family, sp) * widthBias;
      var x = (w - lw) / 2;
      var chars = [];
      for (var k = 0; k < line.length; k++) {
        var cw = charEm(line.charAt(k), font.family) * size;
        chars.push({
          ch: line.charAt(k),
          x: Math.round(x * 100) / 100,
          y: Math.round((firstY + li * lineHeight) * 100) / 100,
          w: Math.round(cw * 100) / 100
        });
        x += cw + sp;
      }
      return {
        text: line,
        chars: chars,
        width: Math.round(lw * 100) / 100,
        x: Math.round(((w - lw) / 2) * 100) / 100,
        y: Math.round((firstY + li * lineHeight) * 100) / 100
      };
    });

    // ---- 颜色 ----
    var color = opt.color;
    var auto = !color || color === 'auto';
    if (auto) {
      color = (typeof opt.bgLum === 'number' && !isNaN(opt.bgLum))
        ? pickInk(opt.bgLum)
        : DEFAULT_COLOR;
    } else {
      var parsed = parseColor(color);
      if (!parsed) {
        color = DEFAULT_COLOR;
        warning = warning || '颜色没认出来，先用白色';
      } else {
        color = toHex(parsed);
      }
    }

    var outline = opt.outline !== false;
    var strokeWidth = outline ? Math.max(2, Math.round(size * 0.07)) : 0;

    // 文字和背景太接近 → 明确提示，不要让人存完才发现看不见
    if (typeof opt.bgLum === 'number' && !isNaN(opt.bgLum)) {
      var bgc = { r: opt.bgLum * 255, g: opt.bgLum * 255, b: opt.bgLum * 255 };
      if (contrast(color, bgc) < 1.8 && outline) {
        warning = warning || '和背景有点接近，可以开描边或换颜色';
      }
    }

    var boxW = 0;
    for (var q = 0; q < outLines.length; q++) boxW = Math.max(boxW, outLines[q].width);

    return {
      ok: true,
      code: 'OK',
      canvas: { w: w, h: h, ratio: Math.round((w / h) * 1000) / 1000, scaled: scale < 1 },
      text: {
        lines: outLines,
        size: size,
        lineHeight: lineHeight,
        spacing: Math.round(spacing * 100) / 100,
        color: color,
        autoColor: auto,
        outline: outline,
        strokeWidth: strokeWidth,
        strokeColor: outlineOf(color),
        font: { id: font.id, name: font.name, family: font.family, weight: font.weight },
        cssFont: font.weight + ' ' + size + 'px ' + font.family
      },
      box: {
        x: Math.round(((w - boxW) / 2) * 100) / 100,
        y: Math.round((firstY - size * 0.5) * 100) / 100,
        w: Math.round(boxW * 100) / 100,
        h: Math.round((lines.length * lineHeight) * 100) / 100
      },
      position: { id: pos.id, name: pos.name, ratio: pos.ratio },
      bgLayers: sampleAvatar(w, h),
      stats: {
        chars: text.length,
        lines: lines.length,
        fill: Math.round((boxW / w) * 1000) / 1000,
        sizeRatio: Math.round((size / h) * 1000) / 1000
      },
      warning: warning
    };
  }

  function fail(code, message) {
    return {
      ok: false, code: code, message: message,
      canvas: null, text: null, box: null, stats: null, bgLayers: [], warning: ''
    };
  }

  /**
   * 示例头像：极简人物剪影。
   * 不引外部图片，是因为预览页和小程序包里各放一份图，改一次要改两处，
   * 而且打包体积换来的只是一张「演示用」的图。用坐标描述，两边画出来一样。
   */
  function sampleAvatar(w, h) {
    var PI = Math.PI;
    return [
      // 背景：斜向冷色渐变 + 两团柔光，比纯色更像一张照片
      { type: 'linear', x0: 0, y0: 0, x1: w * 0.9, y1: h, stops: [[0, '#46587A'], [0.58, '#7E93AE'], [1, '#C3D0DC']] },
      { type: 'circle', cx: w * 0.68, cy: h * 0.20, r: w * 0.46, fill: '#FFFFFF', alpha: 0.10 },
      { type: 'circle', cx: w * 0.12, cy: h * 0.10, r: w * 0.26, fill: '#F3E3C8', alpha: 0.10 },
      // 肩：一整片深色托住人像，不留断层
      { type: 'ellipse', cx: w * 0.50, cy: h * 1.04, rx: w * 0.47, ry: h * 0.31, fill: '#24303F' },
      { type: 'ellipse', cx: w * 0.50, cy: h * 0.99, rx: w * 0.30, ry: h * 0.10, fill: '#2F3E52' },
      // 脖子
      { type: 'rect', x: w * 0.50 - w * 0.078, y: h * 0.55, w: w * 0.156, h: h * 0.16, fill: '#D9AF8F' },
      // 脸：略高的椭圆，用圆形会变成大头娃娃
      { type: 'ellipse', cx: w * 0.50, cy: h * 0.42, rx: w * 0.205, ry: w * 0.240, fill: '#EBC4A4' },
      // 头发：沿脸的上半椭圆描一遍再收到发际线。
      // 半径必须跟着脸的 rx/ry 走，用正圆会盖不住椭圆的头顶，两侧露出肤色月牙
      { type: 'hair', cx: w * 0.50, cy: h * 0.42, rx: w * 0.207, ry: w * 0.242, brow: h * 0.42 - w * 0.053, fill: '#2E241E' }
    ];
  }

  /** 色板去重，用于自定义色卡；同色只留第一条 */
  function uniqueColors(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (c) {
      var hex = toHex(c);
      if (!hex || seen[hex]) return;
      seen[hex] = true;
      out.push(hex);
    });
    return out;
  }

  /** 给一行字拆成可逐字绘制的数组（预览层/小程序层共用） */
  function flattenChars(plan) {
    var out = [];
    if (!plan || !plan.text) return out;
    plan.text.lines.forEach(function (line) {
      line.chars.forEach(function (c) { out.push(c); });
    });
    return out;
  }

  return {
    FONTS: FONTS,
    COLORS: COLORS,
    POSITIONS: POSITIONS,
    MAX_CHARS: MAX_CHARS,
    MAX_SIDE: MAX_SIDE,
    PAD: PAD,
    parseColor: parseColor,
    toHex: toHex,
    toRgbString: toRgbString,
    luminance: luminance,
    contrast: contrast,
    pickInk: pickInk,
    averageLuminance: averageLuminance,
    outlineOf: outlineOf,
    normalizeText: normalizeText,
    buildPlan: buildPlan,
    sampleAvatar: sampleAvatar,
    uniqueColors: uniqueColors,
    flattenChars: flattenChars,
    _textWidth: textWidth
  };
});
