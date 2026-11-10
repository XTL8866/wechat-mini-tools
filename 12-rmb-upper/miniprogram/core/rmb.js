/**
 * 人民币金额大写引擎（纯逻辑，零依赖）
 * 同时可被微信小程序 require() 和浏览器 <script> 加载。
 *
 * 规则依据：《正确填写票据和结算凭证的基本规定》（银发〔1997〕485 号）
 * - 到「元」为止的，元后写「整」；到「角」为止的，角后写「整」；
 *   有「分」的，分后不写「整」。
 * - 数字中间有 0 时要写「零」，连续多个 0 只写一个「零」。
 * - 角位为 0 而分位不为 0 时，元后要补一个「零」（¥107.06 → 壹佰零柒元零陆分）。
 *
 * 三个容易做错的地方，都在这份实现里定死了：
 *
 * 1. 用「分」为单位的整数算，不用浮点。
 *    1234.56 * 100 在浮点里是 123455.99999999999，直接取整会掉一分钱。
 *
 * 2. 组尾的零不读，组内的零只读一个。
 *    100500 读「壹拾万零伍佰」，不是「壹拾万零仟零佰零伍拾零」；
 *    但 100000001 的亿级和个级之间必须留一个零——因为中间整个万级都是空的。
 *    做法是「遇到 0 只记一个待补标记，等下一个非零数字出现时才吐出来」，
 *    所以结尾的零自然不读，跨级的零也自然只读一个。这条在 test.js 里对
 *    0–9999 全量跑了一遍不变量（不含「零零」、不以「零」结尾、数字顺序一致）。
 *
 * 3. 「壹拾」不写成「拾」。
 *    口语里 10 就是「十」，票据上必须写「壹拾」，否则可以被改成「贰拾」。
 *    所以 10–19 一律输出「壹拾X」，不做口语化省字。
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rmb = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DIGIT = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  var UNIT4 = ['', '拾', '佰', '仟'];
  var BIG4 = ['', '万', '亿'];          // 按 4 位一组的级名

  var MAX_CENTS = 99999999999999;        // 9999 亿 - 1 分，再大就超出常用票据范围
  var MAX_TEXT = 40;                     // 输入字符上限，够写 "¥1,234,567.89" 了
  var FREE_COUNT = 1;                    // 免费一次转几笔
  var MAX_COUNT = 8;                     // 解锁后一次几笔

  /* ============ 整数部分读法 ============ */

  /**
   * 整数（十进制字符串，不含小数点）转中文大写。
   * @param {string} s 例如 '100500'
   * @returns {string} '壹拾万零伍佰'
   */
  function intToUpper(s) {
    s = String(s).replace(/^0+/, '');
    if (!s) return '零';

    var out = '';
    var pendingZero = false;   // 已经路过 0，等下一个非零数字来决定要不要吐「零」
    var len = s.length;

    for (var i = 0; i < len; i++) {
      var d = s.charCodeAt(i) - 48;
      var pos = len - 1 - i;       // 从右数第几位（0 起）
      var p4 = pos % 4;            // 组内位置：0=个 1=拾 2=佰 3=仟

      if (d === 0) {
        pendingZero = true;
      } else {
        // 前面有零，且已经不是开头 —— 补一个「零」，多个零也只补一个
        if (pendingZero && out !== '') out += DIGIT[0];
        pendingZero = false;
        out += DIGIT[d] + UNIT4[p4];
      }

      // 走到一组的末位（个位）：这一组若有非零数字才挂级名
      if (p4 === 0 && pos > 0) {
        var gi = pos / 4;
        var from = Math.max(0, len - 1 - (pos + 3));
        var group = s.slice(from, len - pos);
        if (/[1-9]/.test(group) && BIG4[gi] !== undefined) out += BIG4[gi];
      }
    }

    // 整串都是 0（理论上被前面的 replace 挡掉了，兜一层）
    return out || '零';
  }

  /* ============ 金额 → 大写 ============ */

  /**
   * @param {number} cents 以「分」为单位的整数
   * @returns {string} '壹仟贰佰叁拾肆元伍角陆分'
   */
  function centsToUpper(cents) {
    var n = Math.round(Number(cents));
    if (!isFinite(n) || n < 0) return '';
    if (n > MAX_CENTS) return '';

    var yuan = Math.floor(n / 100);
    var rest = n % 100;
    var jiao = Math.floor(rest / 10);
    var fen = rest % 10;

    var s = (yuan === 0 ? DIGIT[0] : intToUpper(String(yuan))) + '元';

    if (jiao === 0 && fen === 0) {
      s += '整';
    } else if (jiao === 0) {
      // 角为零、分不为零：元后补一个零，否则「壹佰零柒元陆分」会被读成 107.6
      s += DIGIT[0] + DIGIT[fen] + '分';
    } else {
      s += DIGIT[jiao] + '角';
      // 有分则不写「整」；只有角没有分，角后写「整」
      s += fen ? DIGIT[fen] + '分' : '整';
    }
    return s;
  }

  /* ============ 数字格式 ============ */

  function group3(s) {
    return String(s).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** 小写核对用：固定两位小数，带千分位 */
  function fmtCents(cents) {
    var n = Math.round(Number(cents));
    if (!isFinite(n) || n < 0) return '—';
    var yuan = Math.floor(n / 100);
    var rest = n % 100;
    return group3(String(yuan)) + '.' + (rest < 10 ? '0' + rest : String(rest));
  }

  /* ============ 输入解析 ============ */

  function bad(code, message) {
    return { ok: false, code: code, message: message, cents: null, warning: '' };
  }

  /**
   * 吃这些写法：1234.56 / 1,234.56 / ￥1,234.56 / 1234 / 0.5 / .5 / 12.5 元
   * 千分位、货币符号、空格、结尾的「元」都当装饰去掉，不参与计算。
   * 负数直接拒：票据上没有负数，能填进去说明是填错了。
   */
  function parseAmount(text) {
    if (text === null || text === undefined) return bad('EMPTY', '先填一个金额');
    var raw = String(text).trim();
    if (!raw) return bad('EMPTY', '先填一个金额');
    if (raw.length > MAX_TEXT) return bad('LONG', '一次最多 ' + MAX_TEXT + ' 个字符');

    var s = raw.replace(/[￥¥,，\s元]/g, '').replace(/[−–—]/g, '-');
    if (!s) return bad('EMPTY', '先填一个金额');
    if (s === '-' || s === '.' || s === '-.') return bad('BAD', '「' + raw.slice(0, 12) + '」不是金额');
    if (!/^-?\d*(\.\d*)?$/.test(s)) return bad('BAD', '「' + raw.slice(0, 12) + '」不是金额');

    var n = Number(s);
    if (!isFinite(n)) return bad('BAD', '「' + raw.slice(0, 12) + '」不是金额');
    if (n < 0) return bad('NEG', '金额不能是负数');

    var cents = Math.round(n * 100);
    if (cents > MAX_CENTS) return bad('BIG', '最多算到 9999 亿元');

    var dec = s.split('.')[1] || '';
    var warning = '';
    if (dec.length > 2) warning = '小数超过两位，已四舍五入到分';

    return {
      ok: true,
      code: 'OK',
      message: '',
      cents: cents,
      amount: cents / 100,
      text: fmtCents(cents),
      warning: warning
    };
  }

  function limitOf(unlocked) {
    return unlocked ? MAX_COUNT : FREE_COUNT;
  }

  /**
   * 切成一笔一笔。
   * 逗号在这里是双关的：既可能是分隔符，也可能是 1,234.56 的千分位。
   * 所以先按换行/分号/顿号切，再看每一段长得像不像带了千分位的单个金额：
   * 像就整段留作一笔，不像才把逗号当分隔符切开。
   * 否则「1,234.56」会被切成一元和二三四点五六。
   */
  function splitAmounts(text) {
    var segs = String(text === null || text === undefined ? '' : text).split(/[\n;；、]+/);
    var out = [];
    for (var i = 0; i < segs.length; i++) {
      var t = segs[i].trim();
      if (!t) continue;
      if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) { out.push(t); continue; }
      var parts = t.split(/[,，]+/);
      for (var j = 0; j < parts.length; j++) {
        var p = parts[j].trim();
        if (p) out.push(p);
      }
    }
    return out;
  }

  /**
   * 一批金额一次转完。超过免费额度只转前面几笔并给提示，
   * 不整批拒绝——用户填了八笔，能拿到一笔也比什么都没有强。
   */
  function batch(text, limit) {
    limit = limit || FREE_COUNT;
    var lines = splitAmounts(text);

    if (!lines.length) return { ok: false, code: 'EMPTY', message: '先填一个金额', list: [] };

    var list = [];
    for (var i = 0; i < lines.length; i++) {
      var p = parseAmount(lines[i]);
      if (!p.ok) {
        return { ok: false, code: p.code, message: '「' + lines[i].slice(0, 12) + '」' + p.message, list: [] };
      }
      var seen = false;
      for (var j = 0; j < list.length; j++) if (list[j].cents === p.cents) seen = true;
      if (seen) continue;                       // 同一笔金额转两遍没意义，去重
      list.push({ cents: p.cents, text: p.text, upper: centsToUpper(p.cents) });
    }

    if (!list.length) return { ok: false, code: 'EMPTY', message: '先填一个金额', list: [] };

    var warning = '';
    if (list.length > limit) {
      warning = '免费版一次 ' + limit + ' 笔，前 ' + limit + ' 笔已转换';
      list = list.slice(0, limit);
    }
    return { ok: true, code: 'OK', message: '', list: list, warning: warning };
  }

  /* ============ 结果组装 ============ */

  /**
   * 亿 / 万 / 元 三级分解，用来说明「零」是从哪来的。
   * 固定三行，空级也留一行写「—」——版式稳定，录屏时不用为不同金额改滚动位置。
   */
  function levels(cents) {
    var yuan = Math.floor(Math.round(cents) / 100);
    var s = String(yuan);
    while (s.length < 12) s = '0' + s;
    s = s.slice(-12);

    var parts = [s.slice(0, 4), s.slice(4, 8), s.slice(8, 12)];
    var names = ['亿级', '万级', '元级'];
    var suffix = ['亿', '万', '元'];
    var rows = [];

    for (var i = 0; i < 3; i++) {
      var v = Number(parts[i]);
      var txt;
      if (v === 0) {
        txt = i === 2 ? '零元' : '—';
      } else {
        txt = intToUpper(String(v)) + suffix[i];
      }
      rows.push({
        name: names[i],
        digits: String(v),
        text: txt,
        on: v !== 0
      });
    }
    return rows;
  }

  /**
   * 写法要点：例子全部由引擎自己算出来，不手写。
   * 改了算法这里跟着变，不会出现「说明写一套、程序算另一套」。
   */
  function rules() {
    var a = 100500 * 100;     // 100500.00
    var b = 1200 * 100;       // 1200.00
    var c = 10706;            // 107.06
    return [
      { t: '零只写一个', v: fmtCents(a) + ' → ' + centsToUpper(a) },
      { t: '到元为止写「整」', v: fmtCents(b) + ' → ' + centsToUpper(b) },
      { t: '角为零、分不为零，元后补零', v: fmtCents(c) + ' → ' + centsToUpper(c) }
    ];
  }

  /** 一条复制：每行「小写 = 大写」 */
  function copyText(lines) {
    if (!lines || !lines.length) return '';
    return lines.map(function (x) {
      return '¥' + x.text + ' = ' + x.upper;
    }).join('\n');
  }

  return {
    DIGIT: DIGIT,
    MAX_CENTS: MAX_CENTS,
    MAX_TEXT: MAX_TEXT,
    FREE_COUNT: FREE_COUNT,
    MAX_COUNT: MAX_COUNT,
    intToUpper: intToUpper,
    centsToUpper: centsToUpper,
    fmtCents: fmtCents,
    group3: group3,
    parseAmount: parseAmount,
    limitOf: limitOf,
    batch: batch,
    levels: levels,
    rules: rules,
    copyText: copyText
  };
});
