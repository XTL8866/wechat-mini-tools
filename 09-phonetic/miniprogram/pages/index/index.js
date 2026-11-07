var P = require('../../core/phonetic.js');
var Ads = require('../../core/ads.js');

Page({
  data: {
    text: '',
    wordCount: 0,
    cap: P.FREE_BATCH,
    statText: '',
    statWarn: false,

    accents: P.ACCENTS,
    accent: 'both',
    accentHint: '',

    samples: P.SAMPLES,
    sample: '',

    list: [],
    copied: -1,

    history: [],
    histCap: P.HIST_FREE,
    unlocked: false,

    adUnitId: Ads.AD_UNIT_ID || ''
  },

  onLoad: function () {
    this._syncHint();
    this._cap = function () {
      return this.data.unlocked ? P.MAX_BATCH : P.FREE_BATCH;
    };
  },

  _syncHint: function () {
    var hint = '';
    for (var i = 0; i < P.ACCENTS.length; i++) {
      if (P.ACCENTS[i].id === this.data.accent) hint = P.ACCENTS[i].hint;
    }
    this.setData({ accentHint: hint });
  },

  /* ---------------- 输入 ---------------- */

  onInput: function (e) {
    var v = e.detail.value || '';
    // 输入变了，上一次的结果就作废：留着会和输入框对不上
    var patch = { text: v, list: [], copied: -1, sample: '' };
    var p = P.parseInput(v, this._limit());
    if (p.ok) {
      patch.wordCount = p.words.length;
      patch.statText = p.words.length + ' 个词' + (p.dropped.dup ? ' · 去掉 ' + p.dropped.dup + ' 个重复' : '');
      patch.statWarn = false;
    } else {
      patch.wordCount = (p.words || []).length;
      patch.statText = p.message;
      patch.statWarn = true;
    }
    this.setData(patch);
  },

  onClear: function () {
    this.setData({ text: '', list: [], copied: -1, wordCount: 0, statText: '', statWarn: false, sample: '' });
  },

  _limit: function () {
    return this.data.unlocked ? P.MAX_BATCH : P.FREE_BATCH;
  },

  onAccent: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id === this.data.accent) return;
    this.setData({ accent: id }, this._syncHint);
    this._rerender();
  },

  onSample: function (e) {
    var key = e.currentTarget.dataset.key;
    var txt = P.sampleText(key);
    if (!txt) return;
    this.setData({ text: txt, sample: key, copied: -1 }, this._run);
  },

  /* ---------------- 查询 ---------------- */

  onGenerate: function () {
    this._run();
  },

  _run: function () {
    var that = this;
    var p = P.parseInput(that.data.text, that._limit());
    if (!p.ok) {
      that.setData({ statText: p.message, statWarn: true });
      wx.showToast({ title: p.message, icon: 'none' });
      return;
    }

    var r = P.batch(that.data.text, that._limit());
    if (!r.ok) {
      wx.showToast({ title: r.message, icon: 'none' });
      return;
    }

    var list = r.list.map(function (e) { return that._card(e); });
    that.setData({ list: list, copied: -1, statWarn: false });

    // 查过就进记录本，同一个词只保留最新一条
    var cap = P.limitOf(that.data.unlocked);
    var hist = that.data.history.slice();
    r.list.forEach(function (e) {
      hist = P.historyAdd(hist, { word: e.word, ipa: P.ipaOf(e, 'us'), t: that._now() }, cap);
    });
    that.setData({ history: hist, histCap: cap });

    if (r.warning) wx.showToast({ title: r.warning, icon: 'none' });
  },

  /** 只换音标体系时重算展示字段，不重复写记录 */
  _rerender: function () {
    var that = this;
    if (!that.data.list.length) return;
    var r = P.batch(that.data.text, that._limit());
    if (!r.ok) return;
    that.setData({ list: r.list.map(function (e) { return that._card(e); }), copied: -1 });
  },

  _card: function (e) {
    var both = this.data.accent === 'both';
    var main = e.same ? e.uk : (this.data.accent === 'us' ? e.us : e.uk);
    var sub = (both && !e.same) ? e.us : '';

    var meta = e.nSyl + ' 个音节 · 重音在第 ' + e.stress.index + ' 个 · ' + e.letters + ' 个字母';
    if (!e.found) meta += ' · 词库未收录';
    if (both && !e.same) meta += ' · 英 / 美两套';

    return {
      word: e.word,
      base: e.base,
      form: e.form,
      found: e.found,
      pos: e.pos,
      mean: e.mean,
      ipaMain: main,
      ipaSub: sub,
      meta: meta,
      syl: P.sylText(e, this.data.accent === 'us' ? 'us' : 'uk'),
      suggestText: (e.suggest || []).slice(0, 3).join(' / ')
    };
  },

  _now: function () {
    var d = new Date();
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return p(d.getHours()) + ':' + p(d.getMinutes());
  },

  /* ---------------- 复制 ---------------- */

  onCopy: function (e) {
    var i = e.currentTarget.dataset.index;
    var item = this.data.list[i];
    if (!item) return;
    var that = this;
    // 复制的是完整版：英美两套音标 + 释义 + 音节，贴到别处也能用
    var entry = P.lookup(item.word);
    wx.setClipboardData({
      data: P.shareText(entry),
      success: function () {
        that.setData({ copied: i });
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  onCopyAll: function () {
    if (!this.data.history.length) {
      wx.showToast({ title: '还没有记录', icon: 'none' });
      return;
    }
    var text = this.data.history.map(function (x, i) {
      return (i + 1) + '. ' + x.word + '  ' + x.ipa;
    }).join('\n');
    wx.setClipboardData({
      data: text,
      success: function () { wx.showToast({ title: '已复制全部', icon: 'success' }); }
    });
  },

  /* ---------------- 记录 / 解锁 ---------------- */

  onRemove: function (e) {
    var i = e.currentTarget.dataset.index;
    this.setData({ history: P.removeAt(this.data.history, i) });
  },

  onUnlock: function () {
    var that = this;
    Ads.show({
      onReward: function (noAd) {
        var cap = P.limitOf(true);
        that.setData({ unlocked: true, histCap: cap, cap: P.MAX_BATCH });
        wx.showToast({ title: noAd ? '已解锁全部额度' : '解锁成功', icon: 'success' });
      },
      onFail: function (msg) {
        wx.showToast({ title: msg || '没有看完广告，未解锁', icon: 'none' });
      }
    });
  },

  onShareAppMessage: function () {
    return {
      title: '输个单词，音标、音节、重音、释义一起出来',
      path: '/pages/index/index'
    };
  }
});
