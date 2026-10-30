var Polish = require('../../core/polish.js');
var Ads = require('../../core/ads.js');

var FREE_RUNS = 2;      // 免费跑两次
var SAMPLE = '其实我觉得这个方案基本上没什么问题，说实话我们在前期的调研过程中已经对流程进行了优化，所以现在能够把成本控制在比较低的水平，我个人觉得还是比较值得推广的。';

Page({
  data: {
    text: '',
    textLen: 0,
    maxLen: Polish.MAX_LEN,

    modes: Polish.MODES,
    mode: 'tight',
    modeDesc: '',
    seed: 1,

    result: null,
    deltaText: '',
    generating: false,
    runs: 0,
    unlocked: false,

    adUnitId: Ads.AD_UNIT_ID || ''
  },

  onLoad: function () {
    this._runs = 0;
    this.setData({ modeDesc: Polish.modeDesc('tight') });
  },

  onTextInput: function (e) {
    var v = e.detail.value || '';
    // 改了原文，旧结果就作废，避免结果和输入对不上
    this.setData({ text: v, textLen: v.length, result: null, deltaText: '' });
  },

  onMode: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id === this.data.mode) return;
    this.setData({
      mode: id,
      modeDesc: Polish.modeDesc(id),
      result: null,
      deltaText: ''
    });
  },

  onSample: function () {
    this.setData({
      text: SAMPLE,
      textLen: SAMPLE.length,
      result: null,
      deltaText: ''
    });
  },

  onClear: function () {
    this.setData({ text: '', textLen: 0, result: null, deltaText: '' });
  },

  onRun: function () {
    var that = this;
    if (that.data.generating) return;
    if (!that.data.unlocked && that._runs >= FREE_RUNS) {
      wx.showToast({ title: '免费 ' + FREE_RUNS + ' 次用完了，解锁不限次', icon: 'none' });
      return;
    }

    var raw = (that.data.text || '').trim();
    if (!raw) {
      wx.showToast({ title: '先贴上要处理的文字', icon: 'none' });
      return;
    }

    that.setData({ generating: true });

    // 本地计算是瞬时的，留一点反馈时间让用户感知到"在算"
    setTimeout(function () {
      var r = Polish.polish(raw, that.data.mode, { seed: that.data.seed });

      if (!r.ok) {
        that.setData({ generating: false });
        wx.showToast({ title: r.message, icon: 'none' });
        return;
      }

      that._runs++;

      var delta = r.delta;
      var sign = delta > 0 ? '多' : '少';
      // 改写降重是等长换词，字数几乎不变，这时报「几处改动」比报字数更有意义
      var text = delta === 0
        ? r.before.chars + ' 字 · ' + r.changeCount + ' 处改动'
        : r.before.chars + ' 字 → ' + r.after.chars + ' 字 · ' + sign + ' ' + Math.abs(delta) + ' 字';

      that.setData({
        result: {
          text: r.text,
          changes: r.changes,
          changeCount: r.changeCount,
          warning: r.warning,
          modeName: r.modeName
        },
        deltaText: text,
        generating: false,
        runs: that._runs
      });

      if (r.warning) {
        wx.showToast({ title: r.warning, icon: 'none', duration: 2600 });
      }
    }, 300);
  },

  onAgain: function () {
    // 改写降重换个种子，能得出另一版；其余模式重复跑意义不大，提示一下
    if (this.data.mode === 'rewrite') {
      this.setData({ seed: this.data.seed + 1 });
    }
    this.onRun();
  },

  onCopy: function () {
    var r = this.data.result;
    if (!r) return;
    wx.setClipboardData({
      data: r.text,
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
        that.onRun();
        wx.showToast({
          title: noAd ? '已解锁不限次' : '解锁成功',
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
      title: '一段话，四种改法：精简 / 扩写 / 转书面 / 降重',
      path: '/pages/index/index'
    };
  }
});
