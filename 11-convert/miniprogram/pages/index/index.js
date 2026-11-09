var Units = require('../../core/units.js');
var Ads = require('../../core/ads.js');

Page({
  data: {
    valueText: '',
    valueHint: '',
    valueWarn: false,

    cats: Units.CATS.map(function (c) { return { key: c.key, name: c.name }; }),
    cat: 'length',
    catName: '长度',
    fromChips: Units.unitChips('length'),
    toChips: Units.unitChips('length'),
    from: 'mm',
    to: 'in',

    detail: null,
    rows: [],
    count: 0,
    generating: false,
    unlocked: false,
    copied: false,

    adUnitId: Ads.AD_UNIT_ID || ''
  },

  onLoad: function () {
    this.setData({ valueHint: '一行一个，最多 ' + Units.MAX_VALUES + ' 个' });
  },

  /* ---------------- 输入 ---------------- */

  onValueInput: function (e) {
    var v = e.detail.value || '';
    this.setData({ valueText: v, detail: null, rows: [], count: 0, copied: false });
    this._syncHint(v);
  },

  _syncHint: function (v) {
    var p = Units.parseInput(v, Units.limitOf(this.data.unlocked), this.data.cat);
    if (p.ok) {
      this.setData({
        valueHint: p.values.length + ' 个数值 · ' + this.data.catName,
        valueWarn: false
      });
    } else {
      this.setData({ valueHint: p.message, valueWarn: p.code !== 'EMPTY' });
    }
  },

  /* ---------------- 类别与单位 ---------------- */

  onCat: function (e) {
    var k = e.currentTarget.dataset.k;
    if (k === this.data.cat) return;
    var c = Units.catOf(k);
    var chips = Units.unitChips(k);
    // 换类别时单位全部重来，取该类别前两个单位当默认对
    this.setData({
      cat: k,
      catName: c.name,
      fromChips: chips,
      toChips: chips,
      from: chips[0],
      to: chips[chips.length - 1],
      detail: null,
      rows: [],
      count: 0,
      copied: false
    });
    this._syncHint(this.data.valueText);
    if (this.data.valueText) this._run();
  },

  onFrom: function (e) {
    var v = e.currentTarget.dataset.k;
    if (v === this.data.from) return;
    // 源单位撞上目标单位时互换，避免「1 in → in」这种无意义结果
    var patch = { from: v };
    if (v === this.data.to) patch.to = this.data.from;
    this.setData(patch);
    if (this.data.detail) this._run();
  },

  onTo: function (e) {
    var v = e.currentTarget.dataset.k;
    if (v === this.data.to) return;
    var patch = { to: v };
    if (v === this.data.from) patch.from = this.data.to;
    this.setData(patch);
    if (this.data.detail) this._run();
  },

  /** 一步设好一对单位，切换演示用 */
  onPair: function (e) {
    var d = e.currentTarget.dataset;
    this.setData({ from: d.f, to: d.t });
    if (this.data.detail) this._run();
  },

  /* ---------------- 换算 ---------------- */

  onGenerate: function () {
    this._run();
  },

  _run: function () {
    var that = this;
    if (that.data.generating) return;

    var limit = Units.limitOf(that.data.unlocked);
    var p = Units.parseInput(that.data.valueText, limit, that.data.cat);
    if (!p.ok) {
      wx.showToast({ title: p.message, icon: 'none' });
      return;
    }

    that.setData({ generating: true });

    // 本地算，留一点时间让「换算中」这个状态被看见
    setTimeout(function () {
      var r = Units.batch(that.data.cat, that.data.from, that.data.to, p.values);
      if (!r.ok) {
        that.setData({ generating: false });
        wx.showToast({ title: r.message, icon: 'none' });
        return;
      }

      var first = r.list[0];
      var cat = that.data.cat;
      var back = Units.convert(cat, that.data.to, that.data.from, 1);

      that.setData({
        detail: {
          catName: that.data.catName,
          from: that.data.from,
          to: that.data.to,
          fromText: first.vText,
          outText: first.outText,
          exactText: Units.exact(first.out),
          backText: Units.fmt(back),
          mainRows: [
            { k: '精确值', v: Units.exact(first.out) + ' ' + that.data.to },
            { k: '反向核对', v: '1 ' + that.data.to + ' = ' + Units.fmt(back) + ' ' + that.data.from }
          ],
          tableRows: Units.table(cat, that.data.from, first.v),
          basis: Units.basis(cat, that.data.from, that.data.to),
          copyText: Units.copyText(cat, that.data.from, that.data.to, p.values)
        },
        rows: r.list.length > 1 ? r.list.map(function (x) {
          return { v: x.vText, out: x.outText, to: x.to };
        }) : [],
        count: r.list.length,
        generating: false,
        copied: false
      });

      if (p.warning) {
        wx.showToast({ title: p.warning, icon: 'none', duration: 2400 });
      }
    }, 220);
  },

  /* ---------------- 复制 ---------------- */

  onCopy: function () {
    var d = this.data.detail;
    if (!d) return;
    var that = this;
    wx.setClipboardData({
      data: d.copyText,
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
        that._syncHint(that.data.valueText);
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
      title: '输一个数，选两个单位，结果和换算依据一起给',
      path: '/pages/index/index'
    };
  }
});
