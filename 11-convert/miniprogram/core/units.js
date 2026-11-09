/**
 * 单位换算引擎（纯逻辑，零依赖）
 * 同时可被微信小程序 require() 和浏览器 <script> 加载。
 *
 * 数据来源：国际单位制定义 + 英美制法定换算系数（1959 年国际码/磅协定）。
 * 设计要点：
 * - 每个类别只存「到基准单位」的系数，不存两两之间的换算表。
 *   8 个单位两两组合是 64 个换算，存表就是 64 个数，还可能对不上；
 *   存 8 个系数、两级乘除，任意一对都能算，而且天然自洽：
 *   反向换算再换回来必须等于原值，这条恒等式在 test.js 里对 6 个类别全部单位对跑了一遍。
 * - 温度是唯一的例外：它不是比例关系，是仿射关系（°F 的零点和刻度都不同）。
 *   硬塞进「乘系数」的框架里，0°C→°F 会算成 0，所以单独给一组 toK / fromK 函数。
 * - 系数一律用「定义值」，不用「约等于」：
 *   1 in = 25.4 mm（法定）、1 lb = 0.45359237 kg（法定）、1 psi = 6894.757293168361 Pa。
 *   约等值看着一样，换算到工程量级（MPa、kN）就会差出有效数字。
 * - 亩按 1 亩 = 2000/3 m²，所以 15 亩 = 10000 m² = 1 ha，两个单位能对上，
 *   写成 666.67 就会算出 15 亩 = 1.000005 ha，看着像 bug。
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Units = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_INPUT = 200;      // 输入字符上限
  var FREE_VALUES = 1;      // 免费一次换算几个值
  var MAX_VALUES = 8;       // 解锁后一次几个值
  var MAX_ABS = 1e12;       // 数值上限，超过多半是手滑多按了几个 0

  /* ============ 温度的仿射换算 ============
   * 统一先转成开尔文，再从开尔文转出去。
   * 这样加一个单位只要写两个函数，不用管和其它单位的组合。
   */
  var TEMP_TO_K = {
    '°C': function (v) { return v + 273.15; },
    '°F': function (v) { return (v - 32) * 5 / 9 + 273.15; },
    'K': function (v) { return v; }
  };

  var TEMP_FROM_K = {
    '°C': function (k) { return k - 273.15; },
    '°F': function (k) { return (k - 273.15) * 9 / 5 + 32; },
    'K': function (k) { return k; }
  };

  /* ============ 类别与单位 ============
   * f = 1 个该单位等于多少个基准单位。
   * 基准单位：长度 m / 质量 kg / 面积 m² / 温度 K / 压力 Pa / 功率 W。
   */
  var CATS = [
    {
      key: 'length', name: '长度', base: 'm',
      units: [
        { k: 'mm', name: '毫米', f: 0.001 },
        { k: 'cm', name: '厘米', f: 0.01 },
        { k: 'm', name: '米', f: 1 },
        { k: 'km', name: '千米', f: 1000 },
        { k: 'in', name: '英寸', f: 0.0254 },
        { k: 'ft', name: '英尺', f: 0.3048 }
      ]
    },
    {
      key: 'mass', name: '质量', base: 'kg',
      units: [
        { k: 'g', name: '克', f: 0.001 },
        { k: 'kg', name: '千克', f: 1 },
        { k: 't', name: '吨', f: 1000 },
        { k: 'oz', name: '盎司', f: 0.028349523125 },
        { k: 'lb', name: '磅', f: 0.45359237 }
      ]
    },
    {
      key: 'area', name: '面积', base: 'm²',
      units: [
        { k: 'cm²', name: '平方厘米', f: 0.0001 },
        { k: 'm²', name: '平方米', f: 1 },
        { k: 'km²', name: '平方千米', f: 1000000 },
        { k: '亩', name: '亩', f: 2000 / 3 },
        { k: 'ha', name: '公顷', f: 10000 },
        { k: 'ft²', name: '平方英尺', f: 0.09290304 }
      ]
    },
    {
      key: 'temperature', name: '温度', base: 'K',
      temp: true,
      units: [
        { k: '°C', name: '摄氏度' },
        { k: '°F', name: '华氏度' },
        { k: 'K', name: '开尔文' }
      ]
    },
    {
      key: 'pressure', name: '压力', base: 'Pa',
      units: [
        { k: 'Pa', name: '帕', f: 1 },
        { k: 'kPa', name: '千帕', f: 1000 },
        { k: 'MPa', name: '兆帕', f: 1000000 },
        { k: 'bar', name: '巴', f: 100000 },
        { k: 'psi', name: '磅每平方英寸', f: 6894.757293168361 },
        { k: 'kgf/cm²', name: '公斤力每平方厘米', f: 98066.5 }
      ]
    },
    {
      key: 'power', name: '功率', base: 'W',
      units: [
        { k: 'W', name: '瓦', f: 1 },
        { k: 'kW', name: '千瓦', f: 1000 },
        { k: 'MW', name: '兆瓦', f: 1000000 },
        { k: 'hp', name: '马力（米制）', f: 735.49875 },
        { k: 'kcal/h', name: '千卡每小时', f: 1.163 }
      ]
    }
  ];

  var CAT_MAP = {};
  for (var i = 0; i < CATS.length; i++) CAT_MAP[CATS[i].key] = CATS[i];

  /* ============ 查询基础件 ============ */

  function catOf(key) {
    return CAT_MAP[key] || null;
  }

  function unitsOf(key) {
    var c = catOf(key);
    return c ? c.units : [];
  }

  function unitOf(key, u) {
    var list = unitsOf(key);
    for (var i = 0; i < list.length; i++) {
      if (list[i].k === u) return list[i];
    }
    return null;
  }

  function unitChips(key) {
    return unitsOf(key).map(function (u) { return u.k; });
  }

  function isTemp(key) {
    var c = catOf(key);
    return !!(c && c.temp);
  }

  /* ============ 换算 ============ */

  function toBase(key, u, v) {
    if (!isFinite(v)) return null;
    if (isTemp(key)) {
      var fn = TEMP_TO_K[u];
      return fn ? fn(v) : null;
    }
    var unit = unitOf(key, u);
    return unit ? v * unit.f : null;
  }

  function fromBase(key, u, b) {
    if (!isFinite(b)) return null;
    if (isTemp(key)) {
      var fn = TEMP_FROM_K[u];
      return fn ? fn(b) : null;
    }
    var unit = unitOf(key, u);
    return unit ? b / unit.f : null;
  }

  /**
   * 单值换算。类别或单位不认识、结果不是有限数 → null，不抛异常。
   */
  function convert(key, from, to, v) {
    var n = Number(v);
    if (!isFinite(n)) return null;
    if (!catOf(key) || !unitOf(key, from) || !unitOf(key, to)) return null;
    var b = toBase(key, from, n);
    if (b === null) return null;
    var out = fromBase(key, to, b);
    return isFinite(out) ? out : null;
  }

  /** 开尔文值，用来卡绝对零度 */
  function kelvin(key, u, v) {
    if (!isTemp(key)) return null;
    var fn = TEMP_TO_K[u];
    return fn ? fn(v) : null;
  }

  /* ============ 数字格式 ============ */

  function trimZeros(s) {
    if (s.indexOf('e') >= 0 || s.indexOf('E') >= 0) return s;
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  /**
   * 显示用：7 位有效数字，去掉尾零。
   * 1 m → ft 是 3.280839895013123，屏幕上给 3.28084 就够，多了反而像噪声。
   * 太大太小转科学计数，免得一行放不下 12 个 0。
   */
  function fmt(v) {
    if (v === null || v === undefined) return '—';
    var n = Number(v);
    if (!isFinite(n)) return '—';
    if (n === 0) return '0';
    var a = Math.abs(n);
    if (a >= 1e9 || a < 1e-6) return n.toExponential(4);
    return trimZeros(n.toPrecision(7));
  }

  /** 精确值：给「换算依据」那一行用，不做有效数字截断 */
  function exact(v) {
    if (v === null || v === undefined) return '—';
    var n = Number(v);
    if (!isFinite(n)) return '—';
    if (n === 0) return '0';
    if (Math.abs(n) >= 1e15) return n.toExponential(12);
    var s = String(n);
    if (s.indexOf('e') >= 0) {
      s = n.toFixed(15);
      s = trimZeros(s);
    }
    return s;
  }

  /* ============ 输入解析 ============ */

  function bad(code, message) {
    return { ok: false, code: code, message: message, values: [], warning: '' };
  }

  /**
   * 一行一个数，也认空格 / 逗号 / 分号分隔。中英文标点都吃。
   * 负号兼容全角减号和长破折号——手机输入法很容易打出「−12」这种。
   * 只有温度能是负数；长度 -5mm 没有意义，直接报错比静默算出 -5 更安全。
   */
  function parseInput(text, limit, catKey) {
    limit = limit || FREE_VALUES;
    if (text === null || text === undefined) return bad('EMPTY', '先填一个数值');
    var s = String(text).trim();
    if (!s) return bad('EMPTY', '先填一个数值');
    if (s.length > MAX_INPUT) return bad('LONG', '一次最多 ' + MAX_INPUT + ' 个字符');

    var parts = s.split(/[\s,;，、]+/).filter(function (x) { return x !== ''; });
    var values = [];
    var seen = {};
    var allowNeg = catKey ? catKey === 'temperature' : true;

    for (var i = 0; i < parts.length; i++) {
      var raw = parts[i].replace(/[−–—]/g, '-');
      var n = Number(raw);
      if (!isFinite(n)) return bad('BAD', '「' + parts[i].slice(0, 12) + '」不是数字');
      if (Math.abs(n) > MAX_ABS) return bad('BAD', '数值上限 ' + '1e12');
      if (n < 0 && !allowNeg) return bad('BAD', '这个类别不能是负数');
      var key = String(n);
      if (seen[key]) continue;      // 去重：同一个数算两遍没意义
      seen[key] = 1;
      values.push(n);
    }

    if (!values.length) return bad('EMPTY', '先填一个数值');

    var warning = '';
    if (values.length > limit) {
      warning = '免费版一次 ' + limit + ' 个，前 ' + limit + ' 个已换算';
      values = values.slice(0, limit);
    }
    return { ok: true, code: 'OK', message: '', values: values, warning: warning };
  }

  function limitOf(unlocked) {
    return unlocked ? MAX_VALUES : FREE_VALUES;
  }

  /* ============ 结果组装 ============ */

  /**
   * 一批值一次性换到目标单位。
   * 温度额外卡绝对零度：换算公式本身是线性的，-300°C 会乖乖算出 -26.85K，
   * 数字看着没问题，物理上不存在，得拦下来。
   */
  function batch(key, from, to, values) {
    if (!catOf(key)) return { ok: false, code: 'BAD', message: '不认识的类别', list: [] };
    if (!unitOf(key, from)) return { ok: false, code: 'BAD', message: '不认识的源单位', list: [] };
    if (!unitOf(key, to)) return { ok: false, code: 'BAD', message: '不认识的目标单位', list: [] };
    if (!values || !values.length) return { ok: false, code: 'EMPTY', message: '先填一个数值', list: [] };

    var list = [];
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (isTemp(key) && kelvin(key, from, v) < 0) {
        return { ok: false, code: 'PHYS', message: '低于绝对零度（-273.15°C）', list: [] };
      }
      var out = convert(key, from, to, v);
      if (out === null) return { ok: false, code: 'BAD', message: '换算失败', list: [] };
      list.push({
        v: v,
        out: out,
        vText: fmt(v),
        outText: fmt(out),
        from: from,
        to: to
      });
    }
    return { ok: true, code: 'OK', message: '', list: list };
  }

  /** 同类别下所有单位的对照，结果卡第 2 张用 */
  function table(key, from, v) {
    var us = unitsOf(key);
    var rows = [];
    for (var i = 0; i < us.length; i++) {
      var out = convert(key, from, us[i].k, v);
      if (out === null) continue;
      rows.push({
        k: us[i].k,
        name: us[i].name,
        text: fmt(out),
        on: us[i].k === from
      });
    }
    return rows;
  }

  /**
   * 换算依据：把当前这一对单位的定义写出来。
   * 1 ft = 0.3048 m 这种是定义值，不是测量值，写出来用户才敢用。
   */
  function basis(key, from, to) {
    if (!catOf(key)) return '';
    if (isTemp(key)) {
      if (from === to) return '同一单位，数值不变';
      if (from === '°C' && to === '°F') return '°F = °C × 9/5 + 32';
      if (from === '°F' && to === '°C') return '°C = (°F − 32) × 5/9';
      if (to === 'K') return 'K = °C + 273.15';
      var a = unitOf(key, from), b = unitOf(key, to);
      return (a ? a.k : from) + ' 与 ' + (b ? b.k : to) + ' 经开尔文中间量换算';
    }
    var u = unitOf(key, from);
    var t = unitOf(key, to);
    if (!u || !t) return '';
    var cat = catOf(key);
    if (from === to) return '1 ' + from + ' = 1 ' + to;
    return '1 ' + u.k + ' = ' + exact(u.f) + ' ' + cat.base +
      '，1 ' + t.k + ' = ' + exact(t.f) + ' ' + cat.base;
  }

  function fmtUnit(v, u) {
    return fmt(v) + ' ' + u;
  }

  /** 一条复制：第一行是主结果，多值时逐行列出 */
  function copyText(key, from, to, values) {
    if (!catOf(key) || !values || !values.length) return '';
    var lines = [];
    for (var i = 0; i < values.length; i++) {
      var out = convert(key, from, to, values[i]);
      if (out === null) continue;
      lines.push(fmt(values[i]) + ' ' + from + ' = ' + fmt(out) + ' ' + to);
    }
    return lines.join('\n');
  }

  return {
    CATS: CATS,
    MAX_INPUT: MAX_INPUT,
    FREE_VALUES: FREE_VALUES,
    MAX_VALUES: MAX_VALUES,
    MAX_ABS: MAX_ABS,
    catOf: catOf,
    unitsOf: unitsOf,
    unitOf: unitOf,
    unitChips: unitChips,
    isTemp: isTemp,
    toBase: toBase,
    fromBase: fromBase,
    convert: convert,
    kelvin: kelvin,
    fmt: fmt,
    exact: exact,
    parseInput: parseInput,
    limitOf: limitOf,
    batch: batch,
    table: table,
    basis: basis,
    fmtUnit: fmtUnit,
    copyText: copyText
  };
});
