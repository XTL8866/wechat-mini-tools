var NameGen = require('../../core/names.js');
var Ads = require('../../core/ads.js');

var FREE_COUNT = 3;
var BATCH_COUNT = 20;

Page({
  data: {
    surname: '',
    surnameLen: 0,

    types: NameGen.TYPES,
    type: 'boy',
    typeHint: '',

    keywords: '',

    list: [],
    generating: false,
    unlocked: false,

    adUnitId: Ads.AD_UNIT_ID || ''
  },

  onLoad: function () {
    this._used = [];
    this._syncHint();
  },

  _syncHint: function () {
    var t = this.data.type;
    var hint = '';
    this.data.types.forEach(function (i) { if (i.id === t) hint = i.hint; });
    this.setData({ typeHint: hint });
  },

  onSurnameInput: function (e) {
    var v = e.detail.value || '';
    // 换了姓，旧结果就作废，不然名字和姓对不上
    if (v.trim() !== this.data.surname.trim()) {
      this._used = [];
      this.setData({ list: [] });
    }
    this.setData({ surname: v, surnameLen: v.length });
  },

  onKeywordInput: function (e) {
    var v = e.detail.value || '';
    if (v.trim() !== this.data.keywords.trim()) {
      this._used = [];
      this.setData({ list: [] });
    }
    this.setData({ keywords: v });
  },

  onType: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id === this.data.type) return;
    this._used = [];
    this.setData({ type: id, list: [] });
    this._syncHint();
  },

  onGenerate: function () {
    this._run(false);
  },

  _run: function (append) {
    var that = this;
    if (that.data.generating) return;

    var total = that.data.unlocked ? BATCH_COUNT : FREE_COUNT;
    var need = append ? Math.max(0, total - that.data.list.length) : total;
    if (need <= 0) return;

    that.setData({ generating: true });

    // 本地计算是瞬时的，留一点反馈时间让用户感知到「在算」
    setTimeout(function () {
      var r = NameGen.generate({
        surname: that.data.surname,
        type: that.data.type,
        keywords: that.data.keywords,
        count: need,
        exclude: that._used
      });

      if (!r.ok) {
        that.setData({ generating: false });
        wx.showToast({ title: r.message, icon: 'none' });
        return;
      }

      var fresh = r.list.map(function (x) {
        return {
          id: x.id,
          name: x.name,
          pinyin: x.pinyin,
          meaning: x.meaning,
          typeName: x.typeName,
          tonePattern: x.tonePattern,
          strokes: x.strokes
        };
      });

      that._used = r.usedIds;

      that.setData({
        list: append ? that.data.list.concat(fresh) : fresh,
        generating: false
      });

      if (r.warning) {
        wx.showToast({ title: r.warning, icon: 'none', duration: 2600 });
      }
    }, 320);
  },

  onCopy: function (e) {
    var i = e.currentTarget.dataset.index;
    var item = this.data.list[i];
    if (!item) return;
    var text = item.name + '\n' + item.pinyin + '\n' + item.meaning;
    wx.setClipboardData({
      data: text,
      success: function () {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  onUnlock: function () {
    var that = this;
    Ads.show({
      onReward: function (noAd) {
        that.setData({ unlocked: true });
        that._run(true);   // 追加到 20 个，已展示的不动
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
      title: '填上姓和关键词，名字带寓意一起出来',
      path: '/pages/index/index'
    };
  }
});
