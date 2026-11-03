var ColorKit = require('../../core/color.js');
var Ads = require('../../core/ads.js');

var STORE_KEY = 'cp_palette';
var MAX_SIDE = 1080;      // 读像素用的画布最长边，够用又不至于卡

Page({
  data: {
    imgPath: '',
    picked: null,        // { hex, line, meta, r, g, b }
    fmt: { hex: '', rgb: '', hsl: '' },
    point: null,         // { x, y } 百分比，给标记定位
    copied: false,

    main: [],
    mainOn: -1,
    scanning: false,

    palette: [],
    palLimit: ColorKit.FREE_SAVE,

    unlocked: false,
    adUnitId: Ads.AD_UNIT_ID || ''
  },

  onLoad: function () {
    var saved = [];
    try {
      saved = wx.getStorageSync(STORE_KEY) || [];
    } catch (e) {
      saved = [];
    }
    this._pix = null;      // 像素数据放实例上，不进 data，几千个数字没法 setData
    this._pw = 0;
    this._ph = 0;
    this._boxW = 0;

    this.setData({
      palette: this._decorate(Array.isArray(saved) ? saved.slice(0, ColorKit.FREE_SAVE) : [])
    });
  },

  /* ---------------- 图片 ---------------- */

  onChoose: function () {
    var that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var f = res.tempFiles && res.tempFiles[0];
        if (!f || !f.tempFilePath) return;
        that._load(f.tempFilePath);
      }
    });
  },

  _load: function (path) {
    var that = this;
    wx.getImageInfo({
      src: path,
      success: function (info) {
        that._imgW = info.width || 1;
        that._imgH = info.height || 1;
        that.setData({ imgPath: path, picked: null, point: null, copied: false,
          fmt: { hex: '', rgb: '', hsl: '' }, main: [], mainOn: -1 });
        that._readPixels(path, that._imgW, that._imgH);
        // 等图片完成布局再量宽度，不然拿到的是 0
        setTimeout(function () { that._measure(); }, 120);
      },
      fail: function () {
        wx.showToast({ title: '这张图读不出来，换一张', icon: 'none' });
      }
    });
  },

  _measure: function () {
    var that = this;
    wx.createSelectorQuery().in(this).select('.shot').boundingClientRect(function (r) {
      if (r && r.width) that._boxW = r.width;
    }).exec();
  },

  /**
   * 把图缩到最长边 1080 再读像素 —— 原图可能有 4000px，全量读会卡死，
   * 取色这个用途 1080 已经足够准。
   */
  _readPixels: function (path, w, h) {
    var that = this;
    var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    var pw = Math.max(1, Math.round(w * scale));
    var ph = Math.max(1, Math.round(h * scale));

    var canvas, ctx;
    try {
      if (wx.createOffscreenCanvas) {
        canvas = wx.createOffscreenCanvas({ type: '2d', width: pw, height: ph });
        ctx = canvas.getContext('2d');
      }
    } catch (e) {
      canvas = null;
    }
    if (!canvas) {
      wx.showToast({ title: '当前版本读不了像素，请升级', icon: 'none' });
      return;
    }

    var img = canvas.createImage();
    img.onload = function () {
      ctx.drawImage(img, 0, 0, pw, ph);
      try {
        var data = ctx.getImageData(0, 0, pw, ph).data;
        that._pix = data;
        that._pw = pw;
        that._ph = ph;
      } catch (e) {
        wx.showToast({ title: '这张图读不了像素，换一张', icon: 'none' });
      }
    };
    img.onerror = function () {
      wx.showToast({ title: '图片解析失败，换一张', icon: 'none' });
    };
    img.src = path;
  },

  onTapImage: function (e) {
    if (!this._pix) {
      wx.showToast({ title: '图片还在读，稍等一秒', icon: 'none' });
      return;
    }
    if (!this._boxW) this._measure();

    var d = e.detail || {};
    var boxW = this._boxW || 1;
    var nx = (d.x || 0) / boxW;
    var ny = (d.y || 0) / (boxW * this._imgH / this._imgW);
    nx = Math.min(1, Math.max(0, nx));
    ny = Math.min(1, Math.max(0, ny));

    var c = ColorKit.pick(this._pix, this._pw, this._ph,
      Math.round(nx * this._pw), Math.round(ny * this._ph));
    if (!c.ok) {
      wx.showToast({ title: c.message, icon: 'none' });
      return;
    }
    this._apply(c, { x: nx * 100, y: ny * 100 });
  },

  /* ---------------- 取色与色卡 ---------------- */

  _apply: function (c, point) {
    var r = ColorKit.addToPalette(this.data.palette, c, ColorKit.paletteLimit(this.data.unlocked));

    var patch = {
      picked: {
        hex: c.hex,
        line: ColorKit.describe(c).name + ' · ' + ColorKit.tone(c),
        meta: '白字 ' + ColorKit.contrastRatio(c, '#FFFFFF') + ':1 · 黑字 ' +
          ColorKit.contrastRatio(c, '#101014') + ':1',
        r: c.r, g: c.g, b: c.b
      },
      fmt: ColorKit.allFormats(c),
      copied: false,
      mainOn: -1,
      palette: this._decorate(r.list)
    };
    if (point) patch.point = point;
    this.setData(patch);
    this._persist(r.list);

    if (!r.ok && r.code === 'FULL') wx.showToast({ title: r.message, icon: 'none' });
  },

  _decorate: function (list) {
    return (list || []).map(function (p) {
      return { hex: p.hex, r: p.r, g: p.g, b: p.b, name: p.name, ink: ColorKit.readableInk(p) };
    });
  },

  _persist: function (list) {
    try {
      wx.setStorageSync(STORE_KEY, list.map(function (p) {
        return { hex: p.hex, r: p.r, g: p.g, b: p.b, name: p.name };
      }));
    } catch (e) {}
  },

  /* ---------------- 主色 ---------------- */

  onScan: function () {
    var that = this;
    if (!this._pix) {
      wx.showToast({ title: '先选一张图片', icon: 'none' });
      return;
    }
    if (this.data.scanning) return;
    this.setData({ scanning: true });

    // 扫一张 1080 的图也就几十毫秒，留一点反馈时间让用户看到「在扫」
    setTimeout(function () {
      var n = ColorKit.mainLimit(that.data.unlocked);
      var list = ColorKit.extract(that._pix, that._pw, that._ph, n);
      if (!list.length) {
        that.setData({ scanning: false });
        wx.showToast({ title: '这张图扫不出主色，换一张', icon: 'none' });
        return;
      }
      var sum = list.reduce(function (a, b) { return a + b.ratio; }, 0) || 1;
      var main = list.map(function (m) {
        return {
          hex: m.hex, r: m.r, g: m.g, b: m.b,
          name: m.name, ratio: m.ratio,
          pct: Math.round(m.ratio / sum * 100)
        };
      });
      that.setData({ main: main, mainOn: -1, scanning: false });
    }, 260);
  },

  onPickMain: function (e) {
    var i = parseInt(e.currentTarget.dataset.i, 10);
    var m = this.data.main[i];
    if (!m) return;
    this.setData({ mainOn: i });
    this._apply(m, null);
  },

  /* ---------------- 复制 / 解锁 / 色卡操作 ---------------- */

  onCopy: function () {
    var p = this.data.picked;
    if (!p) {
      wx.showToast({ title: '先取一个颜色', icon: 'none' });
      return;
    }
    var that = this;
    var text = p.hex + '\n' + ColorKit.format(p, 'rgb') + '\n' + ColorKit.format(p, 'hsl');
    wx.setClipboardData({
      data: text,
      success: function () {
        that.setData({ copied: true });
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  onUnlock: function () {
    var that = this;
    Ads.show({
      onReward: function (noAd) {
        that.setData({ unlocked: true, palLimit: ColorKit.paletteLimit(true) });
        wx.showToast({ title: noAd ? '已解锁全部主色' : '解锁成功', icon: 'success' });
        if (that._pix) that.onScan();
      },
      onFail: function (msg) {
        wx.showToast({ title: msg || '没有看完广告，未解锁', icon: 'none' });
      }
    });
  },

  onPickSaved: function (e) {
    var i = parseInt(e.currentTarget.dataset.i, 10);
    var p = this.data.palette[i];
    if (!p) return;
    this.setData({
      picked: {
        hex: p.hex,
        line: ColorKit.describe(p).name + ' · ' + ColorKit.tone(p),
        meta: '白字 ' + ColorKit.contrastRatio(p, '#FFFFFF') + ':1 · 黑字 ' +
          ColorKit.contrastRatio(p, '#101014') + ':1',
        r: p.r, g: p.g, b: p.b
      },
      fmt: ColorKit.allFormats(p),
      copied: false
    });
    wx.showToast({ title: '已取回 ' + p.hex, icon: 'none' });
  },

  onRemoveSaved: function (e) {
    var i = parseInt(e.currentTarget.dataset.i, 10);
    var that = this;
    var p = this.data.palette[i];
    if (!p) return;
    wx.showModal({
      title: '删掉这张色卡？',
      content: p.hex + ' ' + p.name,
      confirmText: '删掉',
      success: function (res) {
        if (!res.confirm) return;
        var list = ColorKit.removeFromPalette(that.data.palette, i);
        that.setData({ palette: that._decorate(list) });
        that._persist(list);
      }
    });
  },

  onShareAppMessage: function () {
    return {
      title: '传一张图，点哪儿取哪儿',
      path: '/pages/index/index'
    };
  }
});
