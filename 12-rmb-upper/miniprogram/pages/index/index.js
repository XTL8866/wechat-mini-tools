var Rmb = require('../../core/rmb.js');
var Ads = require('../../core/ads.js');

/** 快捷金额：覆盖四种最容易写错的形态 */
var QUICK = [
  { v: '1234.56', t: '1234.56' },
  { v: '1200', t: '1200' },
  { v: '100500', t: '100500' },
  { v: '107.06', t: '107.06' },
  { v: '100000001', t: '100000001' }
];

Page({
  data: {
    amountText: '',
    amountHint: '',
    amountWarn: false,

    quick: QUICK,
    lastQuick: '',

    detail: null,
    rows: [],
    count: 0,
    generating: false,
    unlocked: false,
    copied: false,

    adUnitId: Ads.AD_UNIT_ID || ''
  },

  onLoad: function () {
    this.setData({ amountHint: '小数最多两位，最多算到 9999 亿元' });
  },

  /* ---------------- 输入 ---------------- */

  onAmountInput: function (e) {
    var v = e.detail.value || '';
    this.setData({ amountText: v, detail: null, rows: [], count: 0, copied: false, lastQuick: '' });
    this._syncHint(v);
  },

  _syncHint: function (v) {
    var p = Rmb.parseAmount(v);
    if (p.ok) {
      this.setData({ amountHint: '¥' + p.text + ' · 共 ' + String(p.cents).length + ' 个数位', amountWarn: false });
      if (p.warning) this.setData({ amountHint: p.warning, amountWarn: true });
    } else {
      this.setData({ amountHint: p.message, amountWarn: p.code !== 'EMPTY' });
    }
  },

  /** 点一个示例金额，直接算出来 */
  onQuick: function (e) {
    var v = e.currentTarget.dataset.v;
    this.setData({ amountText: v, lastQuick: v, detail: null, rows: [], count: 0, copied: false });
    this._syncHint(v);
    this._run();
  },

  /* ---------------- 转换 ---------------- */

  onGenerate: function () {
    this._run();
  },

  _run: function () {
    var that = this;
    if (that.data.generating) return;

    var limit = Rmb.limitOf(that.data.unlocked);
    var r = Rmb.batch(that.data.amountText, limit);
    if (!r.ok) {
      wx.showToast({ title: r.message, icon: 'none' });
      return;
    }

    that.setData({ generating: true });

    // 本地算，留一点时间让「转换中」这个状态被看见
    setTimeout(function () {
      var first = r.list[0];
      var rest = first.cents % 100;
      var tail = rest === 0 ? '到元为止，元后写「整」'
        : (rest % 10 === 0 ? '到角为止，角后写「整」'
          : (Math.floor(rest / 10) === 0 ? '角为零、分不为零，元后补一个「零」'
            : '有「分」，分后不写「整」'));

      that.setData({
        detail: {
          upper: first.upper,
          small: '¥' + first.text,
          tail: tail,
          levels: Rmb.levels(first.cents),
          rules: Rmb.rules()
        },
        rows: r.list.length > 1 ? r.list.map(function (x) {
          return { small: '¥' + x.text, upper: x.upper };
        }) : [],
        count: r.list.length,
        generating: false,
        copied: false
      });

      that._copyCache = Rmb.copyText(r.list);

      if (r.warning) {
        wx.showToast({ title: r.warning, icon: 'none', duration: 2400 });
      }
    }, 200);
  },

  /* ---------------- 复制 ---------------- */

  onCopy: function () {
    var d = this.data.detail;
    if (!d) return;
    var that = this;
    wx.setClipboardData({
      data: that._copyCache || d.upper,
      success: function () {
        that.setData({ copied: true });
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  /* ---------------- 解锁 ---------------- */

  onUnlock: function () {
    var that = this;
    Ads.show({
      onReward: function (noAd) {
        that.setData({ unlocked: true });
        that._syncHint(that.data.amountText);
        that._run();
        wx.showToast({
          title: noAd ? '已解锁全部额度' : '解锁成功',
          icon: 'success'
        });
      },
      onFail: function (msg) {
        wx.showToast({ title: msg || '没有看完广告，未解锁', icon: 'none' });
      }
    });
  },

  onShareAppMessage: function () {
    return {
      title: '金额填进去，大写直接出来，零和角分都不会错',
      path: '/pages/index/index'
    };
  }
});
