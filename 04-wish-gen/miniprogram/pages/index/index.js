var WishGen = require('../../core/wishes.js');
var Ads = require('../../core/ads.js');

var FREE_COUNT = 3;
var BATCH_COUNT = 15;

Page({
  data: {
    name: '',
    nameLen: 0,

    scenes: WishGen.SCENES,
    scene: 'birthday',
    sceneHint: '',

    tones: WishGen.TONES,
    tone: 'warm',
    toneHint: '',

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
    var sc = this.data.scene;
    var tn = this.data.tone;
    var sh = '';
    var th = '';
    this.data.scenes.forEach(function (i) { if (i.id === sc) sh = i.hint; });
    this.data.tones.forEach(function (i) { if (i.id === tn) th = i.desc; });
    this.setData({ sceneHint: sh, toneHint: th });
  },

  onNameInput: function (e) {
    var v = e.detail.value || '';
    // 换了人名，旧结果就作废，避免称呼和称呼的人对不上
    if (v.trim() !== this.data.name.trim()) {
      this._used = [];
      this.setData({ list: [] });
    }
    this.setData({ name: v, nameLen: v.length });
  },

  onScene: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id === this.data.scene) return;
    this._used = [];
    this.setData({ scene: id, list: [] });
    this._syncHints();
  },

  onTone: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id === this.data.tone) return;
    this._used = [];
    this.setData({ tone: id, list: [] });
    this._syncHints();
  },

  onGenerate: function () {
    this._run(false);
  },

  _run: function (append) {
    var that = this;
    if (that.data.generating) return;

    var name = (that.data.name || '').trim();
    if (!name) {
      wx.showToast({ title: '先写上要祝福的人', icon: 'none' });
      return;
    }

    var total = that.data.unlocked ? BATCH_COUNT : FREE_COUNT;
    var need = append ? Math.max(0, total - that.data.list.length) : total;
    if (need <= 0) return;

    that.setData({ generating: true });

    // 本地计算是瞬时的，留一点反馈时间让用户感知到「在算」
    setTimeout(function () {
      var r = WishGen.generate({
        name: name,
        scene: that.data.scene,
        tone: that.data.tone,
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
          toneName: x.toneName,
          length: x.length,
          parts: x.parts,
          wide: x.parts > 1
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
      title: '写上名字和场合，直接出能发的祝福语',
      path: '/pages/index/index'
    };
  }
});
