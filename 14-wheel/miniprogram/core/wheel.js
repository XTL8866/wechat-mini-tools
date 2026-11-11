/* eslint-disable */
/**
 * 转盘引擎 —— 选项解析、扇区几何、落点角度、不放回抽签、记录统计
 *
 * 为什么单独成 UMD 模块：小程序页面 require('../../core/wheel.js')，浏览器预览页
 * <script src> 挂到 window.WheelKit，两边跑的是同一份代码 —— 录屏里转盘停在哪一格、
 * 结果卡写什么字，都是这里算出来的，不是截图时手摆的。
 *
 * 坐标约定（所有角度都用「从 12 点方向起、顺时针为正」）：
 *  - 第 i 个扇区占 [i*seg, (i+1)*seg)，seg = 360/n
 *  - 指针固定在 12 点方向（0°），转盘顺时针转 rotation 度
 *  - 扇区 i 的中心 c_i = (i+0.5)*seg，当 c_i + rotation ≡ 0 (mod 360) 时指针停在它中间
 *      → 命中 index 需要的最终角 F_i = (360 - c_i) mod 360
 *  - 于是 indexAt(rotation) 与 targetRotation(index) 互为逆运算，测试里互相验证
 *
 * 约定：对外一律返回 { ok:true, ... } 或 { ok:false, code, message }，不抛异常。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WheelKit = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LIMITS = {
    MIN: 2,              // 少于两个选项不叫抽签
    MAX: 12,             // 再多扇区就糊了，标签也放不下
    LABEL_MAX: 24,       // 单个选项最多几个字
    MAX_INPUT: 600,      // 整段输入上限，超了基本是粘错东西
    FREE_HISTORY: 5,     // 免费能记几条
    PRO_HISTORY: 60,     // 解锁后能记几条
    TURNS: 6,            // 每次转至少空转几圈，不然「转」没手感
    SPIN_MS: 2400        // 前端动画时长，两边渲染层共用
  };

  // 六个低饱和度的色，白底上不刺眼；只用这一个数组，不随机取色，
  // 保证同一组选项每次打开颜色都一样，录屏和真机能对上。
  var PALETTE = ['#FF4D3D', '#F2994A', '#E8C547', '#5B9E7C', '#4A7FB5', '#8E6BC4'];

  var PRESETS = [
    { key: 'food', label: '吃什么', items: ['火锅', '烧烤', '日料', '面条', '麻辣烫'] },
    { key: 'pay', label: '谁买单', items: ['我买', '你买', 'AA', '石头剪刀布'] },
    { key: 'todo', label: '今天做啥', items: ['改论文', '读文献', '画图', '整理桌面', '早点睡'] },
    { key: 'weekend', label: '周末去哪', items: ['爬山', '看展', '逛公园', '在家躺平', '骑车'] }
  ];

  /* ------------------------------------------------------------------ *
   * 选项解析
   * ------------------------------------------------------------------ */

  // 行首的项目符号 / 序号（"- 火锅" "3. 火锅" "3、火锅"），但「12点睡」这种不动
  var ORDINAL_RE = /^\s*(?:[-*·•]|\d+[.、)])\s*/;

  /**
   * 先按行切、去掉行首序号，再按行内分隔符切。
   * 顺序不能反：顿号既是分隔符又常被当成序号后缀（"3、日料"），
   * 先把顿号换成换行的话，序号就落到下一行变成一个孤零零的「3」。
   */
  function splitChunks(text) {
    var t = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    var lines = t.split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].replace(ORDINAL_RE, '');
      var parts = ln.split(/[,，、;；\t]+/);
      for (var j = 0; j < parts.length; j++) out.push(parts[j]);
    }
    return out;
  }

  function trimLabel(s) {
    var t = String(s == null ? '' : s);
    t = t.replace(/\u3000/g, ' ');
    return t.replace(/\s+/g, ' ').trim();
  }

  /**
   * 把一段文本解析成选项数组。
   * 空行和重复项静默丢掉（记在 dropped 里给页面提示），超长和数量越界才报错。
   */
  function parseOptions(text) {
    if (String(text == null ? '' : text).length > LIMITS.MAX_INPUT) {
      return { ok: false, code: 'TOO_LONG', message: '一次最多贴 600 个字，分几段来吧' };
    }
    var chunks = splitChunks(text);
    var out = [];
    var seen = {};
    var empty = 0;
    var dup = 0;

    for (var i = 0; i < chunks.length; i++) {
      var s = trimLabel(chunks[i]);
      if (!s) { empty++; continue; }
      if (s.length > LIMITS.LABEL_MAX) {
        return {
          ok: false, code: 'TOO_LONG', field: i,
          message: '「' + s.slice(0, 8) + '…」太长了，一项最多 24 字'
        };
      }
      // 判重按小写比对：同一项写成「火锅」和「火锅 」只留一个
      var k = s.toLowerCase();
      if (seen[k]) { dup++; continue; }
      seen[k] = true;
      out.push(s);
    }

    if (out.length > LIMITS.MAX) {
      return {
        ok: false, code: 'TOO_MANY', options: out.slice(0, LIMITS.MAX),
        message: '最多 ' + LIMITS.MAX + ' 个选项，现在有 ' + out.length + ' 个'
      };
    }
    if (out.length < LIMITS.MIN) {
      return {
        ok: false, code: 'TOO_FEW', options: out,
        message: out.length === 0
          ? '先写两个以上的选项'
          : (dup > 0 ? '重复的都去掉了，只剩 ' + out.length + ' 个' : '至少两个选项才转得起来')
      };
    }
    return { ok: true, options: out, dropped: { empty: empty, dup: dup } };
  }

  /* ------------------------------------------------------------------ *
   * 扇区几何：颜色、角度、字号、标签截断 —— 两个渲染层照着画
   * ------------------------------------------------------------------ */

  function round2(x) {
    return Math.round(x * 100) / 100;
  }

  /**
   * 取第 i 个扇区的颜色，保证相邻（含首尾）不同色。
   * 只有 n%6===1 时末项会和首项撞色（比如 7 格：0..5 用完再回到 0），
   * 这时把末项往后挪一格。
   */
  function colorAt(i, n) {
    var idx = i;
    if (n % PALETTE.length === 1 && i === n - 1) idx = i + 1;
    return PALETTE[idx % PALETTE.length];
  }

  /**
   * 扇区上写白字还是黑字。
   * 黄橙色上写白字会糊成一片，所以按亮度分：亮底用深色字。
   * 两个渲染层都读这个值，不各写一份。
   */
  function luminance(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return 0;
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return 0;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  function inkOn(hex) {
    return luminance(hex) > 0.70 ? '#211F1C' : '#FFFFFF';
  }

  function fontSizeOf(n) {    if (n <= 4) return 15;
    if (n <= 6) return 13.5;
    if (n <= 8) return 12.5;
    if (n <= 10) return 11.5;
    return 10.5;
  }

  function textMaxOf(n) {
    if (n <= 4) return 6;
    if (n <= 6) return 5;
    if (n <= 8) return 4;
    return 3;
  }

  function layout(n) {
    n = Math.floor(Number(n));
    if (!(n >= LIMITS.MIN && n <= LIMITS.MAX)) return null;
    var seg = 360 / n;
    var fontSize = fontSizeOf(n);
    var textMax = textMaxOf(n);
    var segs = [];
    for (var i = 0; i < n; i++) {
      var start = i * seg;
      var end = (i + 1) * seg;
      var mid = start + seg / 2;
      segs.push({
        i: i,
        start: round2(start),
        end: round2(end),
        mid: round2(mid),
        color: colorAt(i, n),
        ink: inkOn(colorAt(i, n)),
        // 下半圈的标签整体翻 180°，不然字是倒的
        flip: mid > 90 && mid < 270,
        fontSize: fontSize,
        textMax: textMax
      });
    }
    return {
      n: n,
      seg: round2(seg),
      fontSize: fontSize,
      textMax: textMax,
      radiusPct: n <= 4 ? 0.60 : 0.64,
      segs: segs
    };
  }

  /** 转盘底色，两个渲染层都直接用它当 CSS 背景。 */
  function conicCss(n) {
    var L = layout(n);
    if (!L) return 'conic-gradient(#EDEDF0 0deg 360deg)';
    var parts = [];
    for (var i = 0; i < L.segs.length; i++) {
      var s = L.segs[i];
      parts.push(s.color + ' ' + s.start + 'deg ' + s.end + 'deg');
    }
    return 'conic-gradient(' + parts.join(', ') + ')';
  }

  /** 扇区里的短标签：太长就截断加省略号，两边一致。 */
  function wheelLabel(text, max) {
    var t = String(text == null ? '' : text);
    if (t.length <= max) return t;
    return t.slice(0, max) + '…';
  }

  /* ------------------------------------------------------------------ *
   * 角度换算
   * ------------------------------------------------------------------ */

  function norm360(x) {
    var r = x % 360;
    return r < 0 ? r + 360 : r;
  }

  /** 当前转角下指针压在第几个扇区上。 */
  function indexAt(rotation, n) {
    n = Math.floor(Number(n));
    if (!(n >= LIMITS.MIN && n <= LIMITS.MAX)) return -1;
    var seg = 360 / n;
    // 指针在 0°：它对应「转盘上」的角度是 360 - rotation
    var ang = norm360(360 - norm360(rotation));
    var i = Math.floor(ang / seg);
    return i >= n ? n - 1 : i;
  }

  /**
   * 让指针落在 index 这个扇区正中间，需要转到的绝对角度（一定大于 current）。
   * turns 是额外空转圈数，默认 6 圈。
   */
  function targetRotation(current, index, n, turns) {
    n = Math.floor(Number(n));
    if (!(n >= LIMITS.MIN && n <= LIMITS.MAX)) return 0;
    if (!(index >= 0 && index < n)) index = 0;
    var t = Math.floor(Number(turns));
    if (!(t >= 0)) t = LIMITS.TURNS;
    var seg = 360 / n;
    var mid = (index + 0.5) * seg;
    var want = norm360(360 - mid);
    var cur = norm360(current);
    return current + norm360(want - cur) + t * 360;
  }

  /* ------------------------------------------------------------------ *
   * 抽签
   * ------------------------------------------------------------------ */

  function pickIndex(n, rand) {
    n = Math.floor(Number(n));
    if (!(n > 0)) return -1;
    var r = typeof rand === 'function' ? rand() : (typeof rand === 'number' ? rand : Math.random());
    if (typeof r !== 'number' || !isFinite(r)) r = 0;
    if (r < 0) r = 0;
    if (r >= 1) r = 0.999999999;
    return Math.min(n - 1, Math.floor(r * n));
  }

  /**
   * 这一转能抽的池子。
   * 不放回模式下，已经抽过的标签不再进池；抽完了自动开下一轮（round +1）。
   */
  function poolOf(state) {
    state = state || {};
    var opts = (state.options || []).slice();
    if (!state.noRepeat) return { pool: opts, round: 1, used: 0, left: opts.length };
    var used = {};
    var hist = state.history || [];
    for (var i = 0; i < hist.length; i++) {
      if (hist[i] && hist[i].round === (state.round || 1)) used[hist[i].label] = true;
    }
    var pool = [];
    for (var j = 0; j < opts.length; j++) if (!used[opts[j]]) pool.push(opts[j]);
    if (!pool.length) return { pool: opts, round: (state.round || 1) + 1, used: opts.length, left: opts.length };
    return { pool: pool, round: state.round || 1, used: opts.length - pool.length, left: pool.length };
  }

  /**
   * 转一次。state = { options, rotation, history, noRepeat, round, turns }
   * rand 可传函数或 [0,1) 的数，测试里传定值就能锁定落点。
   */
  function spin(state, rand) {
    state = state || {};
    var opts = state.options || [];
    if (opts.length < LIMITS.MIN) {
      return { ok: false, code: 'TOO_FEW', message: '至少两个选项才转得起来' };
    }
    if (opts.length > LIMITS.MAX) {
      return { ok: false, code: 'TOO_MANY', message: '最多 ' + LIMITS.MAX + ' 个选项' };
    }
    var p = poolOf(state);
    var k = pickIndex(p.pool.length, rand);
    var label = p.pool[k];
    var index = opts.indexOf(label);
    if (index < 0) index = 0;
    var from = Number(state.rotation) || 0;
    var to = targetRotation(from, index, opts.length, state.turns);
    return {
      ok: true,
      index: index,
      label: label,
      from: from,
      to: to,
      delta: round2(to - from),
      turn: p.round,
      left: p.left,
      options: opts.length,
      landed: indexAt(to, opts.length) === index
    };
  }

  /* ------------------------------------------------------------------ *
   * 记录
   * ------------------------------------------------------------------ */

  function historyAdd(list, item, max) {
    var out = [item].concat(list || []);
    var cap = Math.floor(Number(max));
    if (!(cap > 0)) cap = LIMITS.FREE_HISTORY;
    return out.slice(0, cap);
  }

  function removeAt(list, i) {
    var out = (list || []).slice();
    if (i >= 0 && i < out.length) out.splice(i, 1);
    return out;
  }

  /** 谁中得多 —— 记录列表下面那行统计。 */
  function counts(list) {
    var map = {};
    var order = [];
    (list || []).forEach(function (it) {
      if (!it || !it.label) return;
      if (!map[it.label]) { map[it.label] = 0; order.push(it.label); }
      map[it.label]++;
    });
    var arr = order.map(function (l) { return { label: l, n: map[l] }; });
    arr.sort(function (a, b) { return b.n - a.n || (a.label < b.label ? -1 : 1); });
    return arr;
  }

  function limitOf(unlocked) {
    return unlocked ? LIMITS.PRO_HISTORY : LIMITS.FREE_HISTORY;
  }

  function shareText(result) {
    if (!result || !result.label) return '';
    var s = '转盘选中：' + result.label;
    if (result.turn && result.turn > 1) s += '（第 ' + result.turn + ' 轮）';
    return s;
  }

  function exportHistory(list) {
    return (list || []).map(function (it, i) {
      return (i + 1) + '. ' + it.label + (it.t ? '  ' + it.t : '');
    }).join('\n');
  }

  function presetOf(key) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].key === key) return PRESETS[i];
    return null;
  }

  function presetText(key) {
    var p = presetOf(key);
    return p ? p.items.join('\n') : '';
  }

  return {
    LIMITS: LIMITS,
    PALETTE: PALETTE,
    PRESETS: PRESETS,
    parseOptions: parseOptions,
    trimLabel: trimLabel,
    layout: layout,
    conicCss: conicCss,
    colorAt: colorAt,
    luminance: luminance,
    inkOn: inkOn,
    wheelLabel: wheelLabel,
    norm360: norm360,
    indexAt: indexAt,
    targetRotation: targetRotation,
    pickIndex: pickIndex,
    poolOf: poolOf,
    spin: spin,
    historyAdd: historyAdd,
    removeAt: removeAt,
    counts: counts,
    limitOf: limitOf,
    shareText: shareText,
    exportHistory: exportHistory,
    presetOf: presetOf,
    presetText: presetText
  };
});
