/**
 * 头像文字贴纸引擎 v2（纯逻辑，零依赖）
 * 小程序 require() 和浏览器 <script> 共用同一份。
 *
 * 它不画像素，只算一份「绘制计划」：字号多大、断成几行、每行几个字、
 * 每个字落在哪个坐标、描边多宽、底板多大、用哪个颜色。
 * 小程序 canvas 和浏览器 canvas 各自照这份计划画，两边看到的完全一致。
 *
 * v2 相对 03 的三处实质改动：
 *  1. 自动配色不再看整张图的平均亮度，而是只量「文字将要占的那块区域」。
 *     头像下半截是亮衬衫、上半截是暗背景时，平均亮度会给出一个两头都不清楚的颜色。
 *  2. 断行带惩罚项：不让标点落在行首、不让单字落在行尾（「…快乐。的」那种）。
 *  3. 位置会收进画面：算完中心点再夹一次，上下档也不会把半行字挤出画布。
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

  // 字号档：乘的是「画布高度」的比例
  var SIZES = [
    { id: 's', name: '小', factor: 0.22, desc: '不压人像' },
    { id: 'm', name: '中', factor: 0.30, desc: '默认，一眼能看清' },
    { id: 'l', name: '大', factor: 0.38, desc: '撑满画面' }
  ];

  // 描边档：乘的是字号
  var STROKES = [
    { id: 0, name: '无', ratio: 0 },
    { id: 1, name: '细', ratio: 0.04 },
    { id: 2, name: '中', ratio: 0.07 },
    { id: 3, name: '粗', ratio: 0.11 }
  ];

  var MAX_CHARS = 12;      // 超过就不是贴纸了
  var MAX_SIDE = 1600;     // 导出最长边，再大存相册慢且没必要
  var PAD = 0.08;          // 左右安全边距（占宽度比例）
  var MAX_LINES = 2;
  var ONE_LINE_LIMIT = 6;  // 6 字以内优先一行
  var DEFAULT_COLOR = '#FFFFFF';
  var INK_DARK = '#101014';
  var INK_LIGHT = '#FFFFFF';

  // 行首禁则 / 行尾禁则
  var HEAD_BAN = '，。、；：？！）」』》〉】…—·,.;:?!)]}%';
  var TAIL_BAN = '（「『《〈【([{';

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

  /** #RGB / #RRGGBB / #RRGGBBAA / rgb() / rgba() / 少量英文名；认不出返回 null */
  function parseColor(raw) {
    if (raw == null) return null;
    if (typeof raw === 'object' && raw.r != null) {
      return {
        r: clamp255(raw.r), g: clamp255(raw.g), b: clamp255(raw.b),
        a: raw.a == null ? 1 : raw.a
      };
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
    var f = function (n) {
      var s = clamp255(n).toString(16).toUpperCase();
      return s.length < 2 ? '0' + s : s;
    };
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

  /** 给定背景亮度，返回对比度更高的文字色 */
  function pickInk(bgLum) {
    var l = typeof bgLum === 'number' && !isNaN(bgLum) ? bgLum : 0;
    var bg = { r: l * 255, g: l * 255, b: l * 255 };
    return contrast(INK_LIGHT, bg) >= contrast(INK_DARK, bg) ? INK_LIGHT : INK_DARK;
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

  /**
   * 只量某个矩形区域的平均亮度 —— v2 的核心改动。
   * @param {Uint8ClampedArray} data RGBA 像素（canvas getImageData().data）
   * @param {Number} w 画布宽
   * @param {Object} box {x,y,w,h}
   * @param {Number} step 采样步长，默认 4
   */
  function regionLuminance(data, w, box, step) {
    if (!data || !w || !box) return null;
    var h = Math.floor(data.length / 4 / w);
    if (h <= 0) return null;
    var x0 = Math.max(0, Math.floor(box.x));
    var x1 = Math.min(w - 1, Math.ceil(box.x + box.w));
    var y0 = Math.max(0, Math.floor(box.y));
    var y1 = Math.min(h - 1, Math.ceil(box.y + box.h));
    if (x1 <= x0 || y1 <= y0) return null;
    step = Math.max(1, Math.floor(step || 4));
    var sum = 0, n = 0;
    for (var y = y0; y <= y1; y += step) {
      for (var x = x0; x <= x1; x += step) {
        var i = (y * w + x) * 4;
        sum += luminance({ r: data[i], g: data[i + 1], b: data[i + 2] });
        n++;
      }
    }
    return n ? sum / n : null;
  }

  /** 描边色：和文字色反差最大的一侧 */
  function outlineOf(color) {
    var p = parseColor(color) || parseColor(DEFAULT_COLOR);
    return luminance(p) > 0.35 ? 'rgba(0,0,0,0.58)' : 'rgba(255,255,255,0.74)';
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
    // 零宽字符和不可见控制符会让字数统计和实际显示对不上
    return s.replace(/[\u200B-\u200D\uFEFF\u0000-\u001F]/g, '');
  }

  function findById(list, id, fallbackIdx) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[fallbackIdx == null ? 0 : fallbackIdx];
  }

  function findStroke(id) {
    var n = Number(id);
    for (var i = 0; i < STROKES.length; i++) if (STROKES[i].id === n) return STROKES[i];
    return STROKES[2];
  }

  /** 两行断点：均分 + 行首禁则 + 行尾禁则 + 孤字惩罚 */
  function breakLines(text) {
    var n = text.length;
    if (n <= ONE_LINE_LIMIT) return [text];
    var best = 1, bestScore = Infinity;
    for (var i = 1; i < n; i++) {
      var score = Math.abs(i - (n - i)) * 2;
      var head = text.charAt(i);
      var tail = text.charAt(i - 1);
      if (HEAD_BAN.indexOf(head) >= 0) score += 10;
      if (TAIL_BAN.indexOf(tail) >= 0) score += 10;
      if (i === 1 || n - i === 1) score += 6;          // 孤字
      if ('，。！？；'.indexOf(tail) >= 0) score -= 3;  // 顺势断句更自然
      if (tail === ' ') score -= 4;                    // 英文按词断
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return [text.slice(0, best), text.slice(best)];
  }

  /**
   * 生成绘制计划
   * @param {Object} opt
   *  - text     要贴的字（1–12）
   *  - imgW/imgH 原图尺寸，不知道传 0，按 3:4 兜底
   *  - fontId   字体 id
   *  - color    文字色；'auto' 或空 = 按 bgLum 自动选
   *  - posId    top/middle/bottom
   *  - sizeId   s/m/l
   *  - strokeId 0–3（0 = 不描边）
   *  - bar      是否加半透明底板
   *  - bgLum    文字区域的背景亮度 0–1，用 regionLuminance() 量出来再传进来
   */
  function buildPlan(opt) {
    opt = opt || {};
    var text = normalizeText(opt.text);
    if (!text) return fail('EMPTY_TEXT', '先打几个字');
    if (text.length > MAX_CHARS) {
      return fail('TOO_LONG', '最多 ' + MAX_CHARS + ' 个字，再多就挡住图了');
    }

    // ---- 画布：保留比例，最长边压到 1600 ----
    var iw = Math.round(Number(opt.imgW) || 0);
    var ih = Math.round(Number(opt.imgH) || 0);
    if (iw <= 0 || ih <= 0) { iw = 900; ih = 1200; }
    var scale = Math.min(1, MAX_SIDE / Math.max(iw, ih));
    var w = Math.max(2, Math.round(iw * scale));
    var h = Math.max(2, Math.round(ih * scale));

    var font = findById(FONTS, opt.fontId, 0);
    var pos = findById(POSITIONS, opt.posId, 1);
    var sizePreset = findById(SIZES, opt.sizeId, 1);
    var stroke = findStroke(opt.strokeId == null ? 2 : opt.strokeId);

    var safeW = w * (1 - PAD * 2);
    var maxSize = Math.min(h * sizePreset.factor, w * 0.46);
    var minSize = Math.max(14, Math.round(h * 0.035));
    var widthBias = font.weight >= 700 ? 1.03 : 1.0;   // 粗体字面更宽

    var lines = breakLines(text);
    if (lines.length > MAX_LINES) lines = lines.slice(0, MAX_LINES);

    var size = maxSize;
    var spacingRatio = 0.06;
    var widest = 0;
    while (size >= minSize) {
      var sp = size * spacingRatio;
      widest = 0;
      for (var i = 0; i < lines.length; i++) {
        var lw = textWidth(lines[i], size, font.family, sp) * widthBias;
        if (lw > widest) widest = lw;
      }
      var totalH = lines.length * size * 1.18;
      if (widest <= safeW && totalH <= h * 0.62) break;
      size -= 2;
    }
    size = Math.max(minSize, Math.round(size));

    var lineHeight = Math.round(size * 1.18);
    var spacing = size * spacingRatio;
    var warning = '';

    if (widest > safeW + 1) warning = '字有点多，字号已经压到最小';

    // ---- 位置：先按档位取中心，再夹进画面 ----
    var centerY = h * pos.ratio;
    var firstY = centerY - (lines.length - 1) * lineHeight / 2;
    var top = size * 0.5 + Math.round(h * 0.02);
    var bottom = h - size * 0.5 - Math.round(h * 0.02) - (lines.length - 1) * lineHeight;
    var clamped = false;
    if (top > bottom) { firstY = (top + bottom) / 2; clamped = true; }
    else if (firstY < top) { firstY = top; clamped = true; }
    else if (firstY > bottom) { firstY = bottom; clamped = true; }

    var outLines = lines.map(function (line, li) {
      var lw = textWidth(line, size, font.family, spacing) * widthBias;
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
        x += cw + spacing;
      }
      return {
        text: line,
        chars: chars,
        width: Math.round(lw * 100) / 100,
        x: Math.round(((w - lw) / 2) * 100) / 100,
        y: Math.round((firstY + li * lineHeight) * 100) / 100
      };
    });

    var boxW = 0;
    for (var q = 0; q < outLines.length; q++) boxW = Math.max(boxW, outLines[q].width);

    // ---- 颜色 ----
    var hasLum = typeof opt.bgLum === 'number' && !isNaN(opt.bgLum);
    var color = opt.color;
    var auto = !color || color === 'auto';
    if (auto) {
      color = hasLum ? pickInk(opt.bgLum) : DEFAULT_COLOR;
    } else {
      var parsed = parseColor(color);
      if (!parsed) {
        color = DEFAULT_COLOR;
        warning = warning || '颜色没认出来，先用白色';
      } else {
        color = toHex(parsed);
      }
    }

    var outline = stroke.ratio > 0;
    var strokeWidth = outline ? Math.max(2, Math.round(size * stroke.ratio)) : 0;

    if (hasLum) {
      var bgc = { r: opt.bgLum * 255, g: opt.bgLum * 255, b: opt.bgLum * 255 };
      var cr = contrast(color, bgc);
      if (cr < 1.5 && !outline) warning = warning || '几乎看不见，打开描边或换个颜色';
      else if (cr < 1.9 && outline) warning = warning || '和这块背景有点接近，描边可以再粗一档';
    }

    // ---- 底板 ----
    var bar = null;
    if (opt.bar) {
      var padX = size * 0.30;
      var padY = size * 0.26;
      var bw = Math.min(boxW + padX * 2, w * 0.94);
      var bh = (lines.length - 1) * lineHeight + size + padY * 2;
      var bx = (w - bw) / 2;
      var by = firstY - size * 0.5 - padY;
      if (by < 0) by = 0;
      if (by + bh > h) by = h - bh;
      bar = {
        x: Math.round(bx * 100) / 100,
        y: Math.round(by * 100) / 100,
        w: Math.round(bw * 100) / 100,
        h: Math.round(bh * 100) / 100,
        radius: Math.round(size * 0.18 * 100) / 100,
        fill: luminance(color) > 0.35 ? 'rgba(0,0,0,0.42)' : 'rgba(255,255,255,0.76)'
      };
    }

    var stats = {
      chars: text.length,
      lines: lines.length,
      fill: Math.round((boxW / w) * 1000) / 1000,
      sizeRatio: Math.round((size / h) * 1000) / 1000
    };
    if (hasLum) {
      stats.bgLum = Math.round(opt.bgLum * 1000) / 1000;
      stats.bgKind = opt.bgLum >= 0.5 ? '浅底' : '深底';
      var bgGray = { r: opt.bgLum * 255, g: opt.bgLum * 255, b: opt.bgLum * 255 };
      // 能看清的部分是「字色」和「描边」里对比度更高的那个。
      // 只看字色会误判：白字 + 黑描边压在浅底上，画面很清楚却报 2.2:1
      var crFill = contrast(color, bgGray);
      var crStroke = 0;
      if (outline) {
        crStroke = contrast(luminance(color) > 0.35 ? '#000000' : '#FFFFFF', bgGray);
      }
      var useStroke = outline && crStroke > crFill;
      stats.edge = useStroke ? '描边' : '字';
      stats.contrast = Math.round((useStroke ? crStroke : crFill) * 10) / 10;
      stats.contrastPlain = Math.round(crFill * 10) / 10;
    }

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
        strokeId: stroke.id,
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
      bar: bar,
      position: { id: pos.id, name: pos.name, ratio: pos.ratio, clamped: clamped },
      sizePreset: { id: sizePreset.id, name: sizePreset.name, factor: sizePreset.factor },
      bgLayers: samplePhoto(opt.sample || 'dark', w, h),
      stats: stats,
      warning: warning
    };
  }

  function fail(code, message) {
    return {
      ok: false, code: code, message: message,
      canvas: null, text: null, box: null, bar: null,
      stats: null, bgLayers: [], warning: ''
    };
  }

  /** 自查：所有字的右边界 / 底线是否都在安全区内 */
  function check(plan) {
    if (!plan || !plan.ok) return { ok: false, right: 0, limit: 0, note: '没有可检查的计划' };
    var limit = plan.canvas.w - plan.canvas.w * PAD;
    var right = 0;
    plan.text.lines.forEach(function (line) {
      line.chars.forEach(function (c) { if (c.x + c.w > right) right = c.x + c.w; });
    });
    var bottom = plan.text.lines[plan.text.lines.length - 1].y + plan.text.size * 0.5;
    return {
      ok: right <= limit + 1 && bottom <= plan.canvas.h && plan.box.y >= -1,
      right: Math.round(right * 10) / 10,
      limit: Math.round(limit * 10) / 10,
      bottom: Math.round(bottom * 10) / 10,
      note: right <= limit + 1 ? '在安全区内' : '超出右边界'
    };
  }

  /**
   * 示例图。用坐标描述而不是塞一张 jpg：
   * 预览页和小程序包各放一份图，改一次要改两处，换来的只是一张演示图。
   * light = 暖米色浅底（白字会看不见），dark = 冷色深底（黑字会看不见）。
   */
  function samplePhoto(kind, w, h) {
    if (kind === 'light') {
      return [
        { type: 'linear', x0: 0, y0: 0, x1: w * 0.8, y1: h, stops: [[0, '#FFFDF9'], [0.55, '#F9F0E1'], [1, '#F0E2CC']] },
        { type: 'circle', cx: w * 0.76, cy: h * 0.16, r: w * 0.42, fill: '#FFFFFF', alpha: 0.34 },
        { type: 'circle', cx: w * 0.14, cy: h * 0.06, r: w * 0.24, fill: '#FFE9C9', alpha: 0.42 },
        { type: 'ellipse', cx: w * 0.50, cy: h * 1.06, rx: w * 0.48, ry: h * 0.30, fill: '#F2E6D2' },
        { type: 'ellipse', cx: w * 0.50, cy: h * 1.00, rx: w * 0.30, ry: h * 0.10, fill: '#FAF1E2' },
        { type: 'rect', x: w * 0.50 - w * 0.075, y: h * 0.55, w: w * 0.15, h: h * 0.16, fill: '#F4DCC0' },
        { type: 'ellipse', cx: w * 0.50, cy: h * 0.42, rx: w * 0.20, ry: w * 0.235, fill: '#FAE6CE' },
        { type: 'hair', cx: w * 0.50, cy: h * 0.42, rx: w * 0.202, ry: w * 0.237, brow: h * 0.42 - w * 0.052, fill: '#6B4E3A' }
      ];
    }
    return [
      { type: 'linear', x0: 0, y0: 0, x1: w * 0.9, y1: h, stops: [[0, '#2B3850'], [0.58, '#5C7089'], [1, '#93A6B8']] },
      { type: 'circle', cx: w * 0.68, cy: h * 0.20, r: w * 0.46, fill: '#FFFFFF', alpha: 0.09 },
      { type: 'circle', cx: w * 0.12, cy: h * 0.10, r: w * 0.26, fill: '#F3E3C8', alpha: 0.10 },
      { type: 'ellipse', cx: w * 0.50, cy: h * 1.04, rx: w * 0.47, ry: h * 0.31, fill: '#1B2532' },
      { type: 'ellipse', cx: w * 0.50, cy: h * 0.99, rx: w * 0.30, ry: h * 0.10, fill: '#26323F' },
      { type: 'rect', x: w * 0.50 - w * 0.078, y: h * 0.55, w: w * 0.156, h: h * 0.16, fill: '#C79C7E' },
      { type: 'ellipse', cx: w * 0.50, cy: h * 0.42, rx: w * 0.205, ry: w * 0.240, fill: '#DDB394' },
      { type: 'hair', cx: w * 0.50, cy: h * 0.42, rx: w * 0.207, ry: w * 0.242, brow: h * 0.42 - w * 0.053, fill: '#241C17' }
    ];
  }

  var SAMPLE_KINDS = ['light', 'dark'];

  /** 色板去重，同色只留第一条 */
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

  /** 逐字展开（预览层 / 小程序层共用） */
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
    SIZES: SIZES,
    STROKES: STROKES,
    SAMPLE_KINDS: SAMPLE_KINDS,
    MAX_CHARS: MAX_CHARS,
    MAX_SIDE: MAX_SIDE,
    PAD: PAD,
    MAX_LINES: MAX_LINES,
    parseColor: parseColor,
    toHex: toHex,
    toRgbString: toRgbString,
    luminance: luminance,
    contrast: contrast,
    pickInk: pickInk,
    averageLuminance: averageLuminance,
    regionLuminance: regionLuminance,
    outlineOf: outlineOf,
    normalizeText: normalizeText,
    breakLines: breakLines,
    buildPlan: buildPlan,
    check: check,
    samplePhoto: samplePhoto,
    uniqueColors: uniqueColors,
    flattenChars: flattenChars,
    _textWidth: textWidth
  };
});
