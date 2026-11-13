/**
 * 日期差与工作日 —— 全部纯算术，不碰本地时区
 *
 * 为什么不用 new Date('2026-11-13')：
 *   字符串带 '-' 的日期在 JS 里按 UTC 解析，但 new Date(y, m, d) 按本地时区；
 *   跨时区、夏令时切换那天会差出 1 天。这里统一走「距 1970-01-01 的天数」整数，
 *   只在 Date.UTC 上取一次基准，之后所有加减都是整数运算。
 *
 * 为什么工作日用公式而不是逐天循环：
 *   逐天遍历 200 年要跑 7 万次，看着能忍，但每加一个节假日就要重跑一遍。
 *   完整周直接给出 7 天里几天是周末，余数用「首个目标星期几的偏移」算，
 *   一次除法就够，跳过日再单独扣。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DateCalc = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MS_DAY = 86400000;
  var WEEK_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  var MIN_Y = 1900;
  var MAX_Y = 2200;

  function isLeap(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  function daysInMonth(y, m) {
    var t = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return t[m - 1];
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function toKey(y, m, d) {
    return y + "-" + pad2(m) + "-" + pad2(d);
  }

  /** 距 1970-01-01 的天数（1970-01-01 自身为 0）。全模块唯一的时间基准。 */
  function dayIndex(y, m, d) {
    return Math.round(Date.UTC(y, m - 1, d) / MS_DAY);
  }

  function fromIndex(idx) {
    var t = new Date(idx * MS_DAY);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }

  /** 0=周日 … 6=周六。1970-01-01 是周四。 */
  function weekdayOf(idx) {
    var r = idx % 7;
    if (r < 0) r += 7;
    return (r + 4) % 7;
  }

  function isWeekendIdx(idx) {
    var w = weekdayOf(idx);
    return w === 0 || w === 6;
  }

  var RE_SEP = /^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})$/;
  var RE_CN = /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/;
  var RE_PLAIN = /^(\d{4})(\d{2})(\d{2})$/;

  /**
   * 解析日期。接受 2026-11-13 / 2026/11/13 / 2026.11.13 / 2026年11月13日 / 20261113。
   * 不接受 2026-02-30 这种「格式对但不存在」的日期 —— 静默进位成 3-02 是更坏的行为。
   */
  function parseDate(input) {
    if (input === null || input === undefined) {
      return { ok: false, code: "EMPTY", message: "请填日期" };
    }
    var s = String(input).replace(/\s+/g, " ").trim();
    if (!s) return { ok: false, code: "EMPTY", message: "请填日期" };
    if (s.length > 24) return { ok: false, code: "TOO_LONG", message: "日期写太长了" };

    var m = RE_SEP.exec(s) || RE_CN.exec(s) || RE_PLAIN.exec(s);
    if (!m) return { ok: false, code: "FORMAT", message: "照 2026-11-13 的样子填" };

    var y = +m[1], mo = +m[2], dd = +m[3];
    if (y < MIN_Y || y > MAX_Y) {
      return { ok: false, code: "YEAR", message: "只算 " + MIN_Y + "–" + MAX_Y + " 年" };
    }
    if (mo < 1 || mo > 12) return { ok: false, code: "MONTH", message: "月份要 1–12" };
    var dim = daysInMonth(y, mo);
    if (dd < 1 || dd > dim) {
      return { ok: false, code: "DAY", message: mo + " 月只有 " + dim + " 天" };
    }
    var idx = dayIndex(y, mo, dd);
    return {
      ok: true, y: y, m: mo, d: dd, idx: idx,
      key: toKey(y, mo, dd),
      weekday: weekdayOf(idx),
      weekdayName: WEEK_CN[weekdayOf(idx)],
      weekend: isWeekendIdx(idx)
    };
  }

  /** 整数天差（b - a），带符号。 */
  function diffDays(a, b) {
    var pa = typeof a === "string" ? parseDate(a) : a;
    var pb = typeof b === "string" ? parseDate(b) : b;
    if (!pa || !pb || !pa.ok || !pb.ok) {
      var bad = !pa || !pa.ok ? pa : pb;
      return { ok: false, code: bad && bad.code ? bad.code : "BAD_DATE",
        message: bad && bad.message ? bad.message : "日期不对" };
    }
    return { ok: true, days: pb.idx - pa.idx, abs: Math.abs(pb.idx - pa.idx) };
  }

  function shiftMonths(y, m, d, delta) {
    var t = y * 12 + (m - 1) + delta;
    var ny = Math.floor(t / 12);
    var nm = t - ny * 12 + 1;
    return { y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) };
  }

  /**
   * 精确年月日跨度：从 a 开始逐月加，加不动了剩下的就是天数。
   * 月内天数会夹取（1-31 加一个月落在 2 月 → 2-28），不是直接相减位数
   * —— 2026-01-31 到 2026-03-01 是「1 个月 1 天」，不是「1 个月 -30 天」。
   */
  function ymdBetween(pa, pb) {
    var a = pa, b = pb;
    var y = b.y - a.y;
    if (y < 0) y = 0;
    var anchor = shiftMonths(a.y, a.m, a.d, y * 12);
    if (dayIndex(anchor.y, anchor.m, anchor.d) > b.idx) {
      y -= 1;
      if (y < 0) y = 0;
    }
    var mo = 0;
    while (mo < 13) {
      var nx = shiftMonths(a.y, a.m, a.d, y * 12 + mo + 1);
      if (dayIndex(nx.y, nx.m, nx.d) > b.idx) break;
      mo++;
    }
    var at = shiftMonths(a.y, a.m, a.d, y * 12 + mo);
    var dd = b.idx - dayIndex(at.y, at.m, at.d);
    return { y: y, m: mo, d: dd, total: y * 12 + mo };
  }

  /** [start, start+n-1] 里第 wd 个星期几出现几次。纯除法，不循环。 */
  function countWeekday(startIdx, n, wd) {
    if (n <= 0) return 0;
    var first = (wd - weekdayOf(startIdx) + 7) % 7;
    if (first >= n) return 0;
    return Math.floor((n - 1 - first) / 7) + 1;
  }

  function idxSet(list) {
    var out = {}, i, p;
    if (!list) return out;
    if (typeof list === "string") list = list.split(/[,，\s]+/);
    for (i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      p = typeof list[i] === "number" ? { ok: true, idx: list[i] } : parseDate(list[i]);
      if (p && p.ok) out[p.idx] = true;
    }
    return out;
  }

  function isWorkIdx(idx, skip, extra) {
    if (extra && extra[idx]) return true;
    if (skip && skip[idx]) return false;
    return !isWeekendIdx(idx);
  }

  /**
   * 主计算。
   * @param {Object} o { start, end, skip:[], extra:[] }
   *   skip  额外不算工作的日子（请假、调休放假）
   *   extra 周末但要上班的日子（调休补班）
   * @returns 自然日 / 含首尾总天数 / 周末天数 / 工作日天数 / 精确年月日 / 周数
   */
  function analyze(o) {
    o = o || {};
    var pa = parseDate(o.start);
    if (!pa.ok) return { ok: false, field: "start", code: pa.code, message: pa.message };
    var pb = parseDate(o.end);
    if (!pb.ok) return { ok: false, field: "end", code: pb.code, message: pb.message };

    var lo = pa.idx <= pb.idx ? pa : pb;
    var hi = pa.idx <= pb.idx ? pb : pa;
    var n = hi.idx - lo.idx + 1;              // 含首尾
    var skip = idxSet(o.skip);
    var extra = idxSet(o.extra);

    var weekend = countWeekday(lo.idx, n, 6) + countWeekday(lo.idx, n, 0);
    var skipIn = 0, extraIn = 0, k, idx;
    for (k in skip) {
      if (!skip.hasOwnProperty(k)) continue;
      idx = +k;
      if (idx >= lo.idx && idx <= hi.idx && !isWeekendIdx(idx)) skipIn++;
    }
    for (k in extra) {
      if (!extra.hasOwnProperty(k)) continue;
      idx = +k;
      if (idx >= lo.idx && idx <= hi.idx && isWeekendIdx(idx)) extraIn++;
    }

    var workdays = n - weekend - skipIn + extraIn;
    var ymd = ymdBetween(lo, hi);

    return {
      ok: true,
      start: pa,
      end: pb,
      reversed: pa.idx > pb.idx,
      sign: pa.idx <= pb.idx ? 1 : -1,
      absDays: hi.idx - lo.idx,               // 间隔，不含首尾
      totalDays: n,                            // 含首尾
      weekendDays: weekend,
      skipDays: skipIn,
      extraDays: extraIn,
      workdays: workdays,
      weeks: Math.floor((hi.idx - lo.idx) / 7),
      restDays: (hi.idx - lo.idx) % 7,
      ymd: ymd,
      ymdText: ymd.y + " 年 " + ymd.m + " 月 " + ymd.d + " 天",
      startWeekday: pa.weekdayName,
      endWeekday: pb.weekdayName,
      startIsWeekend: pa.weekend,
      endIsWeekend: pb.weekend
    };
  }

  /**
   * 还剩几个工作日：不数今天，数到截止日（含）。
   * 为什么不含今天：今天已经在你手上了，问「还剩」问的是后面还能干几天。
   */
  function workdaysLeft(fromKey, toKey, opts) {
    opts = opts || {};
    var pa = parseDate(fromKey);
    if (!pa.ok) return { ok: false, code: pa.code, message: pa.message };
    var pb = parseDate(toKey);
    if (!pb.ok) return { ok: false, code: pb.code, message: pb.message };
    if (pb.idx <= pa.idx) {
      return { ok: true, workdays: 0, overdue: pb.idx < pa.idx, days: pb.idx - pa.idx };
    }
    var skip = idxSet(opts.skip), extra = idxSet(opts.extra);
    var n = pb.idx - pa.idx;                   // (from, to]
    var weekend = countWeekday(pa.idx + 1, n, 6) + countWeekday(pa.idx + 1, n, 0);
    var work = n - weekend, k, idx;
    for (k in skip) {
      if (!skip.hasOwnProperty(k)) continue;
      idx = +k;
      if (idx > pa.idx && idx <= pb.idx && !isWeekendIdx(idx)) work--;
    }
    for (k in extra) {
      if (!extra.hasOwnProperty(k)) continue;
      idx = +k;
      if (idx > pa.idx && idx <= pb.idx && isWeekendIdx(idx)) work++;
    }
    return { ok: true, workdays: work, overdue: false, days: n };
  }

  /**
   * 从 start 往后数第 n 个工作日（不含 start 本身），n 可为负。
   * n=0 返回 start 当天。
   */
  function addWorkdays(startKey, n, opts) {
    opts = opts || {};
    var p = parseDate(startKey);
    if (!p.ok) return { ok: false, code: p.code, message: p.message };
    if (typeof n !== "number" || !isFinite(n) || Math.floor(n) !== n) {
      return { ok: false, code: "N", message: "工作日数要整数" };
    }
    if (Math.abs(n) > 100000) return { ok: false, code: "N", message: "跨度太大了" };
    var skip = idxSet(opts.skip), extra = idxSet(opts.extra);
    var step = n >= 0 ? 1 : -1;
    var left = Math.abs(n), idx = p.idx, guard = 0;
    var limit = Math.abs(n) * 3 + 400;
    while (left > 0) {
      idx += step;
      guard++;
      if (guard > limit) return { ok: false, code: "LOOP", message: "算不出来" };
      if (isWorkIdx(idx, skip, extra)) left--;
    }
    var q = fromIndex(idx);
    var key = toKey(q.y, q.m, q.d);
    return {
      ok: true, key: key, y: q.y, m: q.m, d: q.d,
      idx: idx, weekday: weekdayOf(idx), weekdayName: WEEK_CN[weekdayOf(idx)],
      text: q.y + "年" + q.m + "月" + q.d + "日 " + WEEK_CN[weekdayOf(idx)]
    };
  }

  /** ISO 8601 周号：周一为周首，包含 1 月 4 日的那周是第 1 周。 */
  function isoWeek(p) {
    var idx = typeof p === "number" ? p : p.idx;
    var wd = weekdayOf(idx);
    var shift = (wd === 0 ? 6 : wd - 1);      // 到本周一的偏移
    var thursday = idx - shift + 3;
    var t = fromIndex(thursday);
    var jan4 = dayIndex(t.y, 1, 4);
    var jan4wd = weekdayOf(jan4);
    var firstMon = jan4 - (jan4wd === 0 ? 6 : jan4wd - 1);
    return { year: t.y, week: Math.floor((thursday - firstMon) / 7) + 1 };
  }

  function dayOfYear(p) {
    var idx = typeof p === "number" ? p : p.idx;
    var q = fromIndex(idx);
    return idx - dayIndex(q.y, 1, 1) + 1;
  }

  function fmtCN(key) {
    var p = parseDate(key);
    if (!p.ok) return "";
    return p.y + "年" + p.m + "月" + p.d + "日 " + p.weekdayName;
  }

  /** 界面上的倒推预设 —— 只放常用档，不做无限输入 */
  var PRESETS = [
    { id: "7", n: 7, name: "7 个工作日" },
    { id: "15", n: 15, name: "15 个工作日" },
    { id: "30", n: 30, name: "30 个工作日" }
  ];

  return {
    isLeap: isLeap,
    daysInMonth: daysInMonth,
    parseDate: parseDate,
    toKey: toKey,
    dayIndex: dayIndex,
    fromIndex: fromIndex,
    weekdayOf: weekdayOf,
    isWeekendIdx: isWeekendIdx,
    diffDays: diffDays,
    ymdBetween: ymdBetween,
    analyze: analyze,
    workdaysLeft: workdaysLeft,
    addWorkdays: addWorkdays,
    isoWeek: isoWeek,
    dayOfYear: dayOfYear,
    fmtCN: fmtCN,
    PRESETS: PRESETS,
    WEEK_CN: WEEK_CN
  };
});
