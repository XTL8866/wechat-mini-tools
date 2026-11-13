// 日期差与工作日 · 页面层
// 只负责收集两个日期、把结果显示出来；差几天、扣几个周末、往前倒推是哪天，
// 全部交给 core/datecalc.js —— 这样小程序和 preview/index.html 算出来的完全一致。
var DateCalc = require('../../core/datecalc.js');
var Ads = require('../../core/ads.js');

function weekOf(key) {
  var p = DateCalc.parseDate(key);
  return p.ok ? p.weekdayName : '日期不对';
}

Page({
  data: {
    start: '',
    end: '',
    startWeek: '',
    endWeek: '',
    rangeHint: '—',

    mode: 'natural',
    modeHint: '含起止两天，周末也一起数',

    result: false,
    showEmpty: true,
    resTitle: '自然日',
    bigNum: '0',
    tags: [],
    rows: [],

    revN: 30,
    revPresets: DateCalc.PRESETS,
    revOut: '',
    revNote: '',

    unlocked: false,
    adUnitId: Ads.AD_UNIT_ID || ''
  },

  onLoad: function () {
    this._runs = 0;
    var today = DateCalc.fromIndex(DateCalc.dayIndex(
      new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()
    ));
    var key = DateCalc.toKey(today.y, today.m, today.d);
    this.setData({ start: key, end: key });
    this.sync();
  },

  onInput: function (e) {
    var k = e.currentTarget.dataset.k;
    var v = e.detail.value;
    var patch = {};
    patch[k] = v;
    patch.result = false;
    this.setData(patch);
    this.sync();
  },

  useToday: function () {
    var d = new Date();
    var key = DateCalc.toKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
    this.setData({ start: key, end: key, result: false });
    this.sync();
  },

  useMonthEnd: function () {
    var a = DateCalc.parseDate(this.data.start);
    if (!a.ok) { wx.showToast({ title: a.message, icon: 'none' }); return; }
    var last = DateCalc.daysInMonth(a.y, a.m);
    this.setData({ end: DateCalc.toKey(a.y, a.m, last), result: false });
    this.sync();
  },

  setMode: function (e) {
    var id = e.currentTarget.dataset.id === 'work' ? 'work' : 'natural';
    this.setData({ mode: id }, this.sync);
  },

  pickRev: function (e) {
    this.setData({ revN: Number(e.currentTarget.dataset.n) || 30 }, this.sync);
  },

  /** 只刷新星期、区间和提示这些跟着输入走的文案 */
  sync: function () {
    var s = this.data.start, t = this.data.end;
    var a = DateCalc.parseDate(s), b = DateCalc.parseDate(t);
    this.setData({
      startWeek: s ? weekOf(s) : '',
      endWeek: t ? weekOf(t) : '',
      rangeHint: (a.ok && b.ok) ? (Math.abs(b.idx - a.idx) + 1) + ' 天区间' : '—',
      showEmpty: !this.data.result && !(a.ok && b.ok),
      modeHint: this.data.mode === 'work'
        ? '含起止两天，扣掉周六周日'
        : '含起止两天，周末也一起数'
    });
  },

  compute: function () {
    var r = DateCalc.analyze({ start: this.data.start, end: this.data.end });
    if (!r.ok) {
      this.setData({ result: false });
      this.sync();
      wx.showToast({ title: r.message, icon: 'none' });
      return;
    }
    this._last = r;
    this._runs++;

    var work = this.data.mode === 'work';
    var tags = [
      '含首尾 ' + r.totalDays + ' 天',
      '周末 ' + r.weekendDays + ' 天',
      r.ymdText
    ];
    var rows = [
      { k: '从起始到结束', v: r.absDays + ' 天' },
      { k: '折合', v: r.weeks + ' 周零 ' + r.restDays + ' 天' },
      { k: '起始日', v: DateCalc.fmtCN(r.start.key) },
      { k: '结束日', v: DateCalc.fmtCN(r.end.key) }
    ];
    var t = DateCalc.addWorkdays(r.start.key, this.data.revN);

    this.setData({
      result: true,
      showEmpty: false,
      resTitle: work ? '工作日' : '自然日',
      bigNum: String(work ? r.workdays : r.absDays),
      tags: tags,
      rows: rows,
      revOut: t.ok
        ? '第 ' + this.data.revN + ' 个工作日 = ' + t.text
        : '算不出来：' + t.message,
      revNote: '从 ' + DateCalc.fmtCN(r.start.key) + ' 起算，不含起始日当天',
      unlocked: this.data.unlocked
    });
  },

  unlock: function () {
    var self = this;
    if (this.data.unlocked) { return; }
    Ads.show({
      onReward: function (noAd) {
        self.setData({ unlocked: true });
        wx.showToast({ title: noAd ? '已解锁' : '已解锁，不限次数', icon: 'none' });
      },
      onFail: function (msg) {
        wx.showToast({ title: msg || '没看完广告', icon: 'none' });
      }
    });
  },

  copyResult: function () {
    if (!this._last) { return; }
    var r = this._last;
    var txt = r.start.key + ' → ' + r.end.key + '：' + r.absDays + ' 天，含首尾 ' +
      r.totalDays + ' 天，工作日 ' + r.workdays + ' 天，' + r.ymdText;
    wx.setClipboardData({ data: txt });
  }
});
