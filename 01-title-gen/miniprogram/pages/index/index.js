var TitleGen = require('../../core/titles.js');
var Ads = require('../../core/ads.js');

var FREE_COUNT = 3;
var BATCH_COUNT = 15;

Page({
  data: {
    topic: '',
    topicLen: 0,

    platforms: TitleGen.PLATFORMS,
    platform: 'douyin',
    platformHint: '',

    styles: TitleGen.STYLES,
    style: 'viral',
    styleHint: '',

    list: [],
    generating: false,
    unlocked: false,

    adUnitId: Ads.AD_UNIT_ID || ''
  },

  onLoad: function () {
    this._used = [];
    this._syncHints();
  },

  _syncHints: function () {
    var p = this.data.platform;
    var s = this.data.style;
    var ph = '';
    var sh = '';
    this.data.platforms.forEach(function (i) { if (i.id === p) ph = i.hint; });
    this.data.styles.forEach(function (i) { if (i.id === s) sh = i.desc; });
    this.setData({ platformHint: ph, styleHint: sh });
  },

  onTopicInput: function (e) {
    var v = e.detail.value || '';
    // 换了主题，旧结果就作废，避免标题和输入对不上
    if (v.trim() !== this.data.topic.trim()) {
      this._used = [];
      this.setData({ list: [], unlocked: this.data.unlocked });
    }
    this.setData({ topic: v, topicLen: v.length });
  },

  onPlatform: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id === this.data.platform) return;
    this._used = [];
    this.setData({ platform: id, list: [] });
    this._syncHints();
  },

  onStyle: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id === this.data.style) return;
    this._used = [];
    this.setData({ style: id, list: [] });
    this._syncHints();
  },

  onGenerate: function () {
    this._run(false);
  },

  _run: function (append) {
    var that = this;
    if (that.data.generating) return;

    var topic = (that.data.topic || '').trim();
    if (!topic) {
      wx.showToast({ title: '先输入产品或者主题', icon: 'none' });
      return;
    }

    var total = that.data.unlocked ? BATCH_COUNT : FREE_COUNT;
    var need = append ? Math.max(0, total - that.data.list.length) : total;
    if (need <= 0) return;

    that.setData({ generating: true });

    // 本地计算是瞬时的，留一点反馈时间让用户感知到"在算"
    setTimeout(function () {
      var r = TitleGen.generate({
        topic: topic,
        platform: that.data.platform,
        style: that.data.style,
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
          text: x.text,
          styleName: x.styleName,
          length: x.length,
          wide: !!x.long
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
    wx.setClipboardData({
      data: item.text,
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
        that._run(true);   // 追加到 15 条，已展示的不动
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
      title: '输入一个词，直接出 15 条能用的标题',
      path: '/pages/index/index'
    };
  }
});
