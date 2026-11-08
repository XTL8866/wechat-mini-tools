/**
 * 公差查询引擎（纯逻辑，零依赖）
 * 同时可被微信小程序 require() 和浏览器 <script> 加载。
 *
 * 数据来源：GB/T 1800.1（等同采用 ISO 286-1），基本尺寸 ≤500mm。
 * 设计要点：
 * - 只存三张表：标准公差 IT1–IT18（13 个尺寸段）、轴的 es（a–h）、轴的 ei（k–s）
 * - 孔的偏差不是另抄一张表，而是按标准的换算规则从同名轴推出来：
 *     A–H   EI = -es
 *     JS    ES = +IT/2, EI = -IT/2
 *     K–N   等级 ≤IT8 时 ES = -ei + Δ，>IT8 时 ES = -ei
 *     P–S   等级 ≤IT7 时 ES = -ei + Δ，>IT7 时 ES = -ei
 *   其中 Δ = IT(n) - IT(n-1)。表是抄的，规则是算的，两者能互相校验，
 *   改一位数字就能在 test.js 里被「已知配合」那几条断言抓出来。
 * - 尺寸分段用「细段」（25 段），因为 a/b/c 和 r/s 在 50–80、80–120 这些
 *   大段里还会再分，只在 IT 表上共用 13 个粗段。共用一张细表能保证
 *   偏差和公差取到的是同一段，不会错位。
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Tol = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ============ 尺寸分段 ============
   * 细段 25 个：基本偏差用这一段。
   * COARSE[i] 是细段 i 落在哪个 IT 粗段（13 段）。
   */
  var BANDS = [
    [0, 3], [3, 6], [6, 10], [10, 14], [14, 18], [18, 24], [24, 30], [30, 40],
    [40, 50], [50, 65], [65, 80], [80, 100], [100, 120], [120, 140], [140, 160],
    [160, 180], [180, 200], [200, 225], [225, 250], [250, 280], [280, 315],
    [315, 355], [355, 400], [400, 450], [450, 500]
  ];

  var COARSE = [
    0, 1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 11, 11, 12, 12
  ];

  var COARSE_TEXT = [
    '≤3', '3–6', '6–10', '10–18', '18–30', '30–50', '50–80',
    '80–120', '120–180', '180–250', '250–315', '315–400', '400–500'
  ];

  /* ============ 标准公差 IT1–IT18（μm，13 粗段） ============ */
  var IT = [
    [0.8, 1.2, 2, 3, 4, 6, 10, 14, 25, 40, 60, 100, 140, 250, 400, 600, 1000, 1400],
    [1, 1.5, 2.5, 4, 5, 8, 12, 18, 30, 48, 75, 120, 180, 300, 480, 750, 1200, 1800],
    [1, 1.5, 2.5, 4, 6, 9, 15, 22, 36, 58, 90, 150, 220, 360, 580, 900, 1500, 2200],
    [1.2, 2, 3, 5, 8, 11, 18, 27, 43, 70, 110, 180, 270, 430, 700, 1100, 1800, 2700],
    [1.5, 2.5, 4, 6, 9, 13, 21, 33, 52, 84, 130, 210, 330, 520, 840, 1300, 2100, 3300],
    [1.5, 2.5, 4, 7, 11, 16, 25, 39, 62, 100, 160, 250, 390, 620, 1000, 1600, 2500, 3900],
    [2, 3, 5, 8, 13, 19, 30, 46, 74, 120, 190, 300, 460, 740, 1200, 1900, 3000, 4600],
    [2.5, 4, 6, 10, 15, 22, 35, 54, 87, 140, 220, 350, 540, 870, 1400, 2200, 3500, 5400],
    [3.5, 5, 8, 12, 18, 25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300],
    [4.5, 7, 10, 14, 20, 29, 46, 72, 115, 185, 290, 460, 720, 1150, 1850, 2900, 4600, 7200],
    [6, 8, 12, 16, 23, 32, 52, 81, 130, 210, 320, 520, 810, 1300, 2100, 3200, 5200, 8100],
    [7, 9, 13, 18, 25, 36, 57, 89, 140, 230, 360, 570, 890, 1400, 2300, 3600, 5700, 8900],
    [8, 10, 15, 20, 27, 40, 63, 97, 155, 250, 400, 630, 970, 1500, 2500, 4000, 6300, 9700]
  ];

  /* ============ 轴的基本偏差（μm，25 细段） ============
   * LOWER_H  : a–h 给的是上偏差 es，ei = es - IT
   * LOWER_K  : k–s 给的是下偏差 ei，es = ei + IT
   */
  var ES_AH = {
    c: [-60, -70, -80, -95, -95, -110, -110, -120, -130, -140, -150, -170, -180,
      -200, -210, -230, -240, -260, -280, -300, -330, -360, -400, -440, -480],
    d: [-20, -30, -40, -50, -50, -65, -65, -80, -80, -100, -100, -120, -120,
      -145, -145, -145, -170, -170, -170, -190, -190, -210, -210, -230, -230],
    e: [-14, -20, -25, -32, -32, -40, -40, -50, -50, -60, -60, -72, -72,
      -85, -85, -85, -100, -100, -100, -110, -110, -125, -125, -135, -135],
    f: [-6, -10, -13, -16, -16, -20, -20, -25, -25, -30, -30, -36, -36,
      -43, -43, -43, -50, -50, -50, -56, -56, -62, -62, -68, -68],
    g: [-2, -4, -5, -6, -6, -7, -7, -9, -9, -10, -10, -12, -12,
      -14, -14, -14, -15, -15, -15, -17, -17, -18, -18, -20, -20],
    h: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  };

  var EI_KS = {
    m: [2, 4, 6, 7, 7, 8, 8, 9, 9, 11, 11, 13, 13, 15, 15, 15, 17, 17, 17, 20, 20, 21, 21, 23, 23],
    n: [4, 8, 10, 12, 12, 15, 15, 17, 17, 20, 20, 23, 23, 27, 27, 27, 31, 31, 31, 34, 34, 37, 37, 40, 40],
    p: [6, 12, 15, 18, 18, 22, 22, 26, 26, 32, 32, 37, 37, 43, 43, 43, 50, 50, 50, 56, 56, 62, 62, 68, 68],
    r: [10, 15, 19, 23, 23, 28, 28, 34, 34, 41, 43, 51, 54, 63, 65, 68, 77, 80, 84, 94, 98, 108, 114, 126, 132],
    s: [14, 19, 23, 28, 28, 35, 35, 43, 43, 53, 59, 71, 79, 92, 100, 108, 122, 130, 140, 158, 170, 190, 208, 232, 252]
  };

  // k 只对 IT4–IT7 有非零下偏差，其余等级 ei = 0
  var EI_K = [0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 5, 5];

  /* ============ 对外常量 ============ */

  var GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

  var HOLE_CODES = ['C', 'D', 'E', 'F', 'G', 'H', 'JS', 'K', 'M', 'N', 'P', 'R', 'S'];
  var SHAFT_CODES = ['c', 'd', 'e', 'f', 'g', 'h', 'js', 'k', 'm', 'n', 'p', 'r', 's'];

  // 常用公差带（界面上的 chip）
  // 六个刚好铺满一行，八个会折出 6+2 的尾巴，看着像没排好
  var HOLE_CHIPS = ['H7', 'H8', 'H9', 'H11', 'K7', 'N7'];
  var SHAFT_CHIPS = ['g6', 'h6', 'h7', 'k6', 'n6', 'p6', 's6'];

  var FREE_SIZES = 1;
  var MAX_SIZES = 8;
  var MAX_INPUT = 200;

  // 基本尺寸示例（界面上点一下就填）
  var SAMPLES = [
    { key: 'shaft', name: '轴颈', text: '25' },
    { key: 'bore', name: '孔', text: '40' },
    { key: 'small', name: '小件', text: '8' },
    { key: 'big', name: '大件', text: '160' }
  ];

  /* ============ 基础查表 ============ */

  function bandIndex(d) {
    if (!(d > 0) || d > 500) return -1;
    for (var i = 0; i < BANDS.length; i++) {
      if (d > BANDS[i][0] && d <= BANDS[i][1]) return i;
    }
    return 0; // d ≤ 3，含 d 恰好等于 0 被上一行挡掉的情况
  }

  function bandText(i) {
    if (i < 0) return '';
    var b = BANDS[i];
    if (b[0] === 0) return '≤' + b[1];
    return b[0] + '–' + b[1];
  }

  /** 标准公差值，单位 μm */
  function itValue(d, grade) {
    var i = bandIndex(d);
    if (i < 0) return null;
    if (!(grade >= 1 && grade <= 18)) return null;
    return IT[COARSE[i]][grade - 1];
  }

  /** 轴的基本偏差 { es, ei }，单位 μm */
  function shaftDev(code, grade, d) {
    var i = bandIndex(d);
    if (i < 0) return null;
    var t = itValue(d, grade);
    if (t === null) return null;

    if (code === 'js') return { es: t / 2, ei: -t / 2 };
    if (code === 'h') return { es: 0, ei: -t };
    if (ES_AH[code]) return { es: ES_AH[code][i], ei: ES_AH[code][i] - t };

    if (code === 'k') {
      // k 的 ei 只在 IT4–IT7 按表取，其余等级贴零线
      var ek = (grade >= 4 && grade <= 7) ? EI_K[i] : 0;
      return { es: ek + t, ei: ek };
    }
    if (EI_KS[code]) {
      var e = EI_KS[code][i];
      return { es: e + t, ei: e };
    }
    return null;
  }

  /** 孔的基本偏差 { es, ei }，由同名轴按换算规则推出 */
  function holeDev(code, grade, d) {
    var i = bandIndex(d);
    if (i < 0) return null;
    var t = itValue(d, grade);
    if (t === null) return null;

    var up = String(code).toUpperCase();
    if (up === 'JS') return { es: t / 2, ei: -t / 2 };
    if (up === 'H') return { es: t, ei: 0 };

    // A–H：EI = -es（同名轴的上偏差取反）
    var low = String(code).toLowerCase();
    if (ES_AH[low] && up !== 'H') {
      var ei = -ES_AH[low][i];
      return { es: ei + t, ei: ei };
    }

    // K–S：ES = -ei（必要时加 Δ 修正）
    var base;
    if (low === 'k') base = (grade >= 4 && grade <= 7) ? EI_K[i] : 0;
    else if (EI_KS[low]) base = EI_KS[low][i];
    else return null;

    var es = -base;
    var needDelta = false;
    if (up === 'K' || up === 'M' || up === 'N') needDelta = grade <= 8;
    else needDelta = grade <= 7;          // P / R / S
    if (needDelta && grade > 1) {
      es += t - IT[COARSE[i]][grade - 2];
    }
    return { es: es, ei: es - t };
  }

  /** 统一入口：kind = 'hole' | 'shaft' */
  function dev(kind, code, grade, d) {
    return kind === 'hole' ? holeDev(code, grade, d) : shaftDev(code, grade, d);
  }

  /* ============ 公差带字符串 ============ */

  /**
   * 'H7' → { ok, kind:'hole', code:'H', grade:7 }
   * 'g6' → { ok, kind:'shaft', code:'g', grade:6 }
   * 大小写决定是孔还是轴，这是国标写法，不改。
   */
  function parseSpec(text) {
    var s = String(text == null ? '' : text).replace(/\s+/g, '');
    if (!s) return { ok: false, message: '公差带是空的' };
    var m = /^([A-Za-z]{1,2})(\d{1,2})$/.exec(s);
    if (!m) return { ok: false, message: '写法像 H7、g6 这样：代号 + 等级' };
    var code = m[1];
    var grade = parseInt(m[2], 10);
    var isHole = code === code.toUpperCase();
    var list = isHole ? HOLE_CODES : SHAFT_CODES;
    var norm = isHole ? code.toUpperCase() : code.toLowerCase();
    if (list.indexOf(norm) < 0) {
      return { ok: false, message: '不支持 ' + code + ' 这个代号' };
    }
    if (!(grade >= 1 && grade <= 18)) {
      return { ok: false, message: '公差等级只能是 IT1–IT18' };
    }
    return { ok: true, kind: isHole ? 'hole' : 'shaft', code: norm, grade: grade, text: norm + grade };
  }

  /** 公差带的完整解：偏差 + 极限尺寸 */
  function limits(d, specText) {
    var p = parseSpec(specText);
    if (!p.ok) return { ok: false, message: p.message };
    var i = bandIndex(d);
    if (i < 0) return { ok: false, message: '基本尺寸要在 0–500mm 之间' };
    var dv = dev(p.kind, p.code, p.grade, d);
    if (!dv) return { ok: false, message: p.code + p.grade + ' 在这个尺寸段没有数据' };
    var t = itValue(d, p.grade);
    return {
      ok: true,
      kind: p.kind,
      spec: p.text,
      code: p.code,
      grade: p.grade,
      size: d,
      band: bandText(i),
      bandCoarse: COARSE_TEXT[COARSE[i]],
      bandIndex: i,
      it: t,
      es: dv.es,
      ei: dv.ei,
      max: d + dv.es / 1000,
      min: d + dv.ei / 1000,
      // 公差 = 上偏差 - 下偏差，和查表得到的 IT 值必须一致
      tol: dv.es - dv.ei
    };
  }

  /** 一对配合：孔 + 轴 */
  function fit(d, holeText, shaftText) {
    var h = limits(d, holeText);
    if (!h.ok) return { ok: false, message: '孔 ' + holeText + '：' + h.message };
    var s = limits(d, shaftText);
    if (!s.ok) return { ok: false, message: '轴 ' + shaftText + '：' + s.message };
    if (h.kind !== 'hole' || s.kind !== 'shaft') {
      return { ok: false, message: '前面是孔（大写），后面是轴（小写）' };
    }

    // 间隙取正、过盈取负，先统一算两端，再按符号判类型
    var xmax = h.es - s.ei;
    var xmin = h.ei - s.es;
    var type, typeName;
    if (xmin >= 0) { type = 'clearance'; typeName = '间隙配合'; }
    else if (xmax <= 0) { type = 'interference'; typeName = '过盈配合'; }
    else { type = 'transition'; typeName = '过渡配合'; }

    return {
      ok: true,
      size: d,
      hole: h,
      shaft: s,
      xmax: xmax,          // 最大间隙（可能为负）
      xmin: xmin,          // 最小间隙（可能为负，负值即过盈）
      maxClearance: xmax > 0 ? xmax : 0,
      maxInterference: xmin < 0 ? -xmin : 0,
      type: type,
      typeName: typeName,
      tf: h.it + s.it      // 配合公差 = 孔公差 + 轴公差
    };
  }

  /* ============ 输入解析 ============ */

  /** 一行一个尺寸，也认逗号 / 分号 / 顿号 */
  function parseInput(text, limit) {
    limit = limit || FREE_SIZES;
    var raw = String(text == null ? '' : text);
    if (raw.length > MAX_INPUT) {
      return { ok: false, code: 'LONG', sizes: [], message: '一次最多输入 ' + MAX_INPUT + ' 个字符' };
    }
    var parts = raw.split(/[\s,;、，；]+/).filter(function (x) { return x !== ''; });
    if (!parts.length) {
      return { ok: false, code: 'EMPTY', sizes: [], message: '先输入基本尺寸' };
    }

    var out = [];
    var dup = 0;
    var bad = [];
    var over = false;
    for (var i = 0; i < parts.length; i++) {
      var v = Number(parts[i].replace(/[φΦ⌀Øø]/g, ''));
      if (!isFinite(v)) { bad.push(parts[i]); continue; }
      if (v <= 0 || v > 500) { bad.push(parts[i]); continue; }
      var key = Math.round(v * 1000) / 1000;
      if (out.indexOf(key) >= 0) { dup++; continue; }
      out.push(key);
    }

    if (bad.length) {
      return {
        ok: false, code: 'BAD', sizes: [],
        message: '「' + bad[0] + '」不是 0–500 之间的尺寸'
      };
    }
    if (!out.length) {
      return { ok: false, code: 'EMPTY', sizes: [], message: '先输入基本尺寸' };
    }
    if (out.length > limit) {
      over = true;
      out = out.slice(0, limit);
    }
    return {
      ok: true, code: 'OK', sizes: out, dropped: { dup: dup, over: over },
      message: over ? '一次最多 ' + limit + ' 个尺寸' : ''
    };
  }

  /** 批量：同一组配合套到多个尺寸上 */
  function batch(text, holeText, shaftText, limit) {
    var p = parseInput(text, limit);
    if (!p.ok) return { ok: false, code: p.code, message: p.message, list: [] };
    var list = [];
    for (var i = 0; i < p.sizes.length; i++) {
      var r = fit(p.sizes[i], holeText, shaftText);
      if (!r.ok) return { ok: false, code: 'BAD', message: r.message, list: [] };
      list.push(r);
    }
    return { ok: true, list: list, dropped: p.dropped, warning: p.message };
  }

  /* ============ 格式化 ============ */

  /** μm → 带符号的偏差串，例：+21 / 0 / -7 / +10.5 */
  function fmtMicron(v) {
    if (v === 0) return '0';
    var s = Math.abs(v) % 1 === 0 ? String(Math.abs(v)) : Math.abs(v).toFixed(1);
    return (v > 0 ? '+' : '-') + s;
  }

  /** μm → mm（3 位小数），例：+0.021 */
  function fmtMm(v) {
    var s = (Math.abs(v) / 1000).toFixed(3);
    return (v > 0 ? '+' : (v < 0 ? '-' : '')) + s;
  }

  /** 基本尺寸 → 规范写法，去掉多余的 0 */
  function fmtSize(v) {
    return String(Math.round(v * 1000) / 1000);
  }

  function fmtNum(v) {
    return String(Math.round(v * 1000) / 1000);
  }

  /** 极限尺寸区间，例：25.000–25.021。尺寸必须补满三位小数，
   *  写成 25–25.021 会被看成上下限都是整数，这在图纸上是要出事的 */
  function fmtRange(a, b) {
    return a.toFixed(3) + '–' + b.toFixed(3);
  }

  /** 公差等级取的粗段文字，例：⌀25 → 18–30（不是基本偏差用的细段 24–30） */
  function bandCoarse(d) {
    var i = bandIndex(d);
    if (i < 0) return '';
    return COARSE_TEXT[COARSE[i]];
  }

  /** 配合的一句话结论 */
  function fitLine(r) {
    if (!r.ok) return '';
    if (r.type === 'clearance') {
      return '间隙 ' + fmtMm(r.xmin).replace('+', '') + ' ~ ' + fmtMm(r.xmax).replace('+', '');
    }
    if (r.type === 'interference') {
      // 两端都是负值，取反才是「过盈量」：最小过盈 = -xmax，最大过盈 = -xmin
      return '过盈 ' + fmtMm(-r.xmax).replace('+', '') + ' ~ ' +
        fmtMm(-r.xmin).replace('+', '');
    }
    return '间隙最大 ' + fmtMm(r.xmax).replace('+', '') +
      '，过盈最大 ' + fmtMm(r.maxInterference).replace('+', '');
  }

  /** 复制到剪贴板的文本 */
  function copyText(r) {
    if (!r || !r.ok) return '';
    var L = [
      '⌀' + fmtSize(r.size) + '  孔' + r.hole.spec + ' / 轴' + r.shaft.spec,
      '孔 ' + r.hole.spec + '  ES ' + fmtMicron(r.hole.es) + '  EI ' + fmtMicron(r.hole.ei) +
        '  μm  极限 ' + fmtRange(r.hole.min, r.hole.max),
      '轴 ' + r.shaft.spec + '  es ' + fmtMicron(r.shaft.es) + '  ei ' + fmtMicron(r.shaft.ei) +
        '  μm  极限 ' + fmtRange(r.shaft.min, r.shaft.max),
      r.typeName + '：' + fitLine(r) + ' mm',
      '配合公差 ' + fmtMm(r.tf).replace('+', '') + ' mm（IT' + r.hole.grade + ' + IT' + r.shaft.grade + '）'
    ];
    return L.join('\n');
  }

  /** 批量结果整段复制 */
  function copyBatch(list) {
    if (!list || !list.length) return '';
    var head = '孔' + list[0].hole.spec + ' / 轴' + list[0].shaft.spec + '　' + list[0].typeName;
    var rows = list.map(function (r) {
      return '⌀' + fmtSize(r.size) + '  ' +
        fmtMicron(r.hole.es) + '/' + fmtMicron(r.hole.ei) + '  ' +
        fmtMicron(r.shaft.es) + '/' + fmtMicron(r.shaft.ei) + '  ' +
        fitLine(r);
    });
    return [head, '尺寸　孔ES/EI　轴es/ei　配合'].concat(rows).join('\n');
  }

  function limitOf(unlocked) {
    return unlocked ? MAX_SIZES : FREE_SIZES;
  }

  return {
    BANDS: BANDS,
    IT: IT,
    GRADES: GRADES,
    HOLE_CODES: HOLE_CODES,
    SHAFT_CODES: SHAFT_CODES,
    HOLE_CHIPS: HOLE_CHIPS,
    SHAFT_CHIPS: SHAFT_CHIPS,
    SAMPLES: SAMPLES,
    COARSE_TEXT: COARSE_TEXT,
    FREE_SIZES: FREE_SIZES,
    MAX_SIZES: MAX_SIZES,
    MAX_INPUT: MAX_INPUT,
    bandIndex: bandIndex,
    bandText: bandText,
    bandCoarse: bandCoarse,
    itValue: itValue,
    shaftDev: shaftDev,
    holeDev: holeDev,
    dev: dev,
    parseSpec: parseSpec,
    limits: limits,
    fit: fit,
    parseInput: parseInput,
    batch: batch,
    fmtMicron: fmtMicron,
    fmtMm: fmtMm,
    fmtSize: fmtSize,
    fmtRange: fmtRange,
    fitLine: fitLine,
    copyText: copyText,
    copyBatch: copyBatch,
    limitOf: limitOf
  };
});
