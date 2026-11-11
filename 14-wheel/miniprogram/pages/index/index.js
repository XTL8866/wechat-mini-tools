var WheelKit = require('../../core/wheel.js');
var Ads = require('../../core/ads.js');

var K_TEXT = 'wh_text';
var K_HIST = 'wh_hist';
var K_NOREPEAT = 'wh_norepeat';

function nowHM() {
  var d = new Date();
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return p(d.getHours()) + ':' + p(d.getMinutes());
}

Page({
  data: {
    presets: WheelKit.PRESETS,
    text: '',
    options: [],
    labs: [],
    wheelCss: WheelKit.conicCss(1),
    wheelEmpty: true,
    rotation: 0,
    spinning: false,

    noRepeat: false,
    round: 1,

    built: null,
    metaText: '',
    copied: false,

    history: [],
    limit: WheelKit.LIMITS.FREE_HISTORY,
    statLine: '',

    statText: '一行一个，最多 12 个',
    unlocked: false,
    adUnitId: Ads.AD_UNIT_ID || ''
  },

  onLoad: function () {
    var saved = { text: '', hist: [], nr: false };
    try {
      saved.text = wx.getStorageSync(K_TEXT) || '';
      saved.hist = wx.getStorageSync(K_HIST) || [];
      saved.nr = !!wx.getStorageSync(K_NOREPEAT);
    } catch (e) {}
    this.setData({
      text: saved.text,
      history: Array.isArray(saved.hist) ? saved.hist.slice(0, WheelKit.LIMITS.FREE_HISTORY) : [],
      noRepeat: saved.nr
    });
    this._refresh(saved.text);
    this._stat();
  },

  /* ---------------- 选项 ---------------- */

  _labs: function (options) {
    var L = WheelKit.layout(options.length);
    if (!L) return [];
    return L.segs.map(function (s, i) {
      return {
        i: i,
        mid: s.mid,
        flip: s.flip,
        fs: s.fontSize,
        ink: s.ink,
        text: WheelKit.wheelLabel(options[i], s.textMax)
      };
    });
  },

  /** 每次改选项都重算扇区，但不清掉已有结果（用户改完再转一次是常态）。 */
  _refresh: function (text) {
    var p = WheelKit.parseOptions(text);
    var options = p.ok ? p.options : (p.options || []);
    var patch = {
      options: options,
      labs: this._labs(options),
      wheelCss: WheelKit.conicCss(options.length),
      wheelEmpty: !p.ok,
      statText: p.ok
        ? options.length + ' 个选项' + (p.dropped.dup ? ' · 去掉 ' + p.dropped.dup + ' 个重复' : '')
        : p.message
    };
    this.setData(patch);
  },

  onInput: function (e) {
    var v = e.detail.value;
    this.setData({ text: v });
    this._refresh(v);
    try { wx.setStorageSync(K_TEXT, v); } catch (err) {}
  },

  onPreset: function (e) {
    var k = e.currentTarget.dataset.k;
    var t = WheelKit.presetText(k);
    if (!t) return;
    this.setData({ text: t, built: null, copied: false });
    this._refresh(t);
    try { wx.setStorageSync(K_TEXT, t); } catch (err) {}
  },

  onClear: function () {
    this.setData({ text: '', built: null, copied: false, rotation: 0 });
    this._refresh('');
    try { wx.setStorageSync(K_TEXT, ''); } catch (err) {}
  },

  onToggle: function () {
    var v = !this.data.noRepeat;
    this.setData({ noRepeat: v });
    try { wx.setStorageSync(K_NOREPEAT, v); } catch (err) {}
    wx.showToast({ title: v ? '抽过的不再出现' : '每次都可能重复', icon: 'none' });
  },

  /* ---------------- 转 ---------------- */

  onSpin: function () {
    if (this.data.spinning) return;
    var p = WheelKit.parseOptions(this.data.text);
    if (!p.ok) {
      wx.showToast({ title: p.message, icon: 'none' });
      return;
    }

    var r = WheelKit.spin({
      options: p.options,
      rotation: this.data.rotation,
      history: this.data.history,
      noRepeat: this.data.noRepeat,
      round: this.data.round
    }, Math.random);
    if (!r.ok) {
      wx.showToast({ title: r.message, icon: 'none' });
      return;
    }

    // 先把扇区和选项定下来，再改 rotation —— 同一帧里改两样，transition 会不生效
    this.setData({
      options: p.options,
      labs: this._labs(p.options),
      wheelCss: WheelKit.conicCss(p.options.length),
      wheelEmpty: false,
      spinning: true,
      built: null,
      copied: false
    });

    var that = this;
    this._spinTimer && clearTimeout(this._spinTimer);
    this._settleTimer && clearTimeout(this._settleTimer);

    this._spinTimer = setTimeout(function () {
      that.setData({ rotation: r.to });
      that._settleTimer = setTimeout(function () {
        that._settle(r);
      }, WheelKit.LIMITS.SPIN_MS + 80);
    }, 40);
  },

  _settle: function (r) {
    var max = WheelKit.limitOf(this.data.unlocked);
    var item = {
      label: r.label,
      round: this.data.noRepeat ? r.turn : 1,
      t: nowHM()
    };
    var hist = WheelKit.historyAdd(this.data.history, item, max);
    var left = WheelKit.poolOf({
      options: this.data.options,
      history: hist,
      noRepeat: this.data.noRepeat,
      round: this.data.noRepeat ? r.turn : 1
    });
    this.setData({
      spinning: false,
      built: { label: r.label, index: r.index, turn: r.turn },
      round: this.data.noRepeat ? r.turn : 1,
      history: hist,
      metaText: this.data.noRepeat
        ? '第 ' + r.turn + ' 轮 · 还剩 ' + left.left + ' 个'
        : '第 ' + hist.length + ' 次 · ' + this.data.options.length + ' 个选项'
    });
    this._stat();
    this._persist(hist);
  },

  /* ---------------- 记录 ---------------- */

  _persist: function (hist) {
    try { wx.setStorageSync(K_HIST, hist); } catch (e) {}
  },

  _stat: function () {
    var c = WheelKit.counts(this.data.history);
    var line = c.slice(0, 2).map(function (x) { return x.label + ' ' + x.n; }).join(' · ');
    this.setData({ statLine: line || '还没有记录' });
  },

  onRemove: function (e) {
    var i = parseInt(e.currentTarget.dataset.i, 10);
    var hist = WheelKit.removeAt(this.data.history, i);
    this.setData({ history: hist, limit: WheelKit.limitOf(this.data.unlocked) });
    this._stat();
    this._persist(hist);
  },

  /* ---------------- 复制 / 解锁 ---------------- */

  onCopy: function () {
    if (!this.data.built) {
      wx.showToast({ title: '先转一次', icon: 'none' });
      return;
    }
    var that = this;
    wx.setClipboardData({
      data: WheelKit.shareText(this.data.built),
      success: function () {
        that.setData({ copied: true });
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  onCopyAll: function () {
    if (!this.data.history.length) {
      wx.showToast({ title: '还没有记录', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: WheelKit.exportHistory(this.data.history),
      success: function () {
        wx.showToast({ title: '已复制 ' + this.data.history.length + ' 条', icon: 'success' });
      }.bind(this)
    });
  },

  onUnlock: function () {
    var that = this;
    Ads.show({
      onReward: function (noAd) {
        that.setData({
          unlocked: true,
          limit: WheelKit.LIMITS.PRO_HISTORY
        });
        wx.showToast({ title: noAd ? '已解锁，可存 60 条' : '解锁成功', icon: 'success' });
      },
      onFail: function (msg) {
        wx.showToast({ title: msg || '没有看完广告，未解锁', icon: 'none' });
      }
    });
  },

  onShareAppMessage: function () {
    return { title: '选不出来，就让它转一下', path: '/pages/index/index' };
  }
});
