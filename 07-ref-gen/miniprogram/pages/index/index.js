var RefKit = require('../../core/refs.js');
var Ads = require('../../core/ads.js');

var STORE_KEY = 'rf_list';
var SORT_NEXT = { none: 'year', year: 'author', author: 'none' };
var SORT_TEXT = { none: '录入顺序', year: '按年份', author: '按作者' };

Page({
  data: {
    types: RefKit.TYPES,
    typeKey: 'J',
    typeCn: '期刊论文',
    mark: '[J]',
    fields: [],
    form: {},
    built: null,

    list: [],
    limit: RefKit.FREE_SAVE,
    sortBy: 'none',
    sortText: '录入顺序',

    unlocked: false,
    copied: false,
    adUnitId: Ads.AD_UNIT_ID || ''
  },

  onLoad: function () {
    var saved = [];
    try {
      saved = wx.getStorageSync(STORE_KEY) || [];
    } catch (e) {
      saved = [];
    }
    this._sync('J');
    this.setData({
      list: Array.isArray(saved) ? saved.slice(0, RefKit.FREE_SAVE) : []
    });
  },

  /* ---------------- 类型切换 ---------------- */

  _sync: function (typeKey) {
    var t = RefKit.typeOf(typeKey) || RefKit.TYPES[0];
    var fields = RefKit.fieldsOf(t.key);
    var form = {};
    fields.forEach(function (f) { form[f.key] = ''; });
    this.setData({
      typeKey: t.key,
      typeCn: t.cn,
      mark: t.mark,
      fields: fields,
      form: form,
      built: null,
      copied: false
    });
  },

  onType: function (e) {
    var k = e.currentTarget.dataset.k;
    if (k === this.data.typeKey) return;
    this._sync(k);
  },

  /* ---------------- 表单 ---------------- */

  onInput: function (e) {
    var k = e.currentTarget.dataset.k;
    var patch = {};
    patch['form.' + k] = e.detail.value;
    patch.built = null;      // 内容改了就作废旧结果，避免「改完还复制到旧的」
    patch.copied = false;
    this.setData(patch);
  },

  onSample: function () {
    var s = RefKit.sample(this.data.typeKey);
    var form = {};
    this.data.fields.forEach(function (f) {
      form[f.key] = s[f.key] === undefined ? '' : s[f.key];
    });
    this.setData({ form: form, built: null, copied: false });
  },

  onClear: function () {
    var form = {};
    this.data.fields.forEach(function (f) { form[f.key] = ''; });
    this.setData({ form: form, built: null, copied: false });
  },

  /* ---------------- 生成 ---------------- */

  onGenerate: function () {
    var r = RefKit.build(this.data.typeKey, this.data.form);
    if (!r.ok) {
      wx.showToast({ title: r.message, icon: 'none' });
      return;
    }

    // 生成即入库：用户点这一下的目的就是拿到一条能用的引用，
    // 再让他点「加入列表」是多余的一步。重复的由引擎判重拦住。
    var add = RefKit.addEntry(this.data.list, r, RefKit.limitOf(this.data.unlocked));
    var patch = { built: r, copied: false };
    if (add.ok) {
      patch.list = add.list;
      this._persist(add.list);
    } else if (add.code === 'DUP') {
      wx.showToast({ title: '这条已经存过了', icon: 'none' });
    } else if (add.code === 'FULL') {
      wx.showToast({ title: add.message, icon: 'none' });
    }
    this.setData(patch);
  },

  /* ---------------- 列表 ---------------- */

  _persist: function (list) {
    try {
      wx.setStorageSync(STORE_KEY, list);
    } catch (e) {}
  },

  onSort: function () {
    var next = SORT_NEXT[this.data.sortBy] || 'none';
    var list = RefKit.sortList(this.data.list, next);
    this.setData({
      sortBy: next,
      sortText: SORT_TEXT[next],
      list: list
    });
    this._persist(list);
  },

  onRemove: function (e) {
    var i = parseInt(e.currentTarget.dataset.i, 10);
    var it = this.data.list[i];
    if (!it) return;
    var that = this;
    wx.showModal({
      title: '删掉这一条？',
      content: it.mark + ' ' + it.year + ' · ' + it.cn,
      confirmText: '删掉',
      success: function (res) {
        if (!res.confirm) return;
        var list = RefKit.removeEntry(that.data.list, i);
        that.setData({ list: list });
        that._persist(list);
      }
    });
  },

  /* ---------------- 复制 / 解锁 ---------------- */

  onCopyOne: function () {
    var b = this.data.built;
    if (!b) {
      wx.showToast({ title: '先生成一条引用', icon: 'none' });
      return;
    }
    var that = this;
    wx.setClipboardData({
      data: b.text,
      success: function () {
        that.setData({ copied: true });
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  onCopyAll: function () {
    if (!this.data.list.length) {
      wx.showToast({ title: '列表还是空的', icon: 'none' });
      return;
    }
    var text = RefKit.exportAll(this.data.list, 'num');
    var n = this.data.list.length;
    wx.setClipboardData({
      data: text,
      success: function () {
        wx.showToast({ title: '已复制 ' + n + ' 条', icon: 'success' });
      }
    });
  },

  onUnlock: function () {
    var that = this;
    Ads.show({
      onReward: function (noAd) {
        that.setData({ unlocked: true, limit: RefKit.PRO_SAVE });
        wx.showToast({ title: noAd ? '已解锁，可存 20 条' : '解锁成功', icon: 'success' });
      },
      onFail: function (msg) {
        wx.showToast({ title: msg || '没有看完广告，未解锁', icon: 'none' });
      }
    });
  },

  onShareAppMessage: function () {
    return {
      title: '填几个空，国标格式自己出来',
      path: '/pages/index/index'
    };
  }
});
