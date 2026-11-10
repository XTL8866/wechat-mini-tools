// 头像文字贴纸 v2 · 页面层
// 只负责「取图 / 取亮度 / 照计划画像素」，排版和配色全部交给 core/sticker.js，
// 这样小程序 canvas 和 preview/index.html 看到的是同一份结果。
var Sticker = require('../../core/sticker.js');
var Ads = require('../../core/ads.js');

var FREE_RUNS = 2;
var MAX_STAGE_H = 380;

function drawLayers(ctx, layers, w, h) {
  layers.forEach(function (L) {
    ctx.save();
    if (L.type === 'linear') {
      var g = ctx.createLinearGradient(L.x0, L.y0, L.x1, L.y1);
      L.stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (L.type === 'circle') {
      ctx.globalAlpha = L.alpha == null ? 1 : L.alpha;
      ctx.fillStyle = L.fill;
      ctx.beginPath();
      ctx.arc(L.cx, L.cy, L.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (L.type === 'ellipse') {
      ctx.globalAlpha = L.alpha == null ? 1 : L.alpha;
      ctx.fillStyle = L.fill;
      ctx.translate(L.cx, L.cy);
      ctx.scale(L.rx, L.ry);
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
    } else if (L.type === 'arc') {
      ctx.fillStyle = L.fill;
      ctx.beginPath();
      ctx.arc(L.cx, L.cy, L.r, L.from, L.to);
      ctx.closePath();
      ctx.fill();
    } else if (L.type === 'hair') {
      ctx.fillStyle = L.fill;
      ctx.translate(L.cx, L.cy);
      ctx.scale(L.rx, L.ry);
      ctx.beginPath();
      ctx.arc(0, 0, 1, Math.PI, Math.PI * 2);
      ctx.lineTo(1, (L.brow - L.cy) / L.ry);
      ctx.lineTo(-1, (L.brow - L.cy) / L.ry);
      ctx.closePath();
      ctx.fill();
    } else if (L.type === 'rect') {
      ctx.fillStyle = L.fill;
      ctx.fillRect(L.x, L.y, L.w, L.h);
    }
    ctx.restore();
  });
}

/** 圆角底板：canvas 2d 没有 roundRect 的老基础库也能画 */
function drawBar(ctx, bar) {
  if (!bar) return;
  var r = Math.min(bar.radius, bar.w / 2, bar.h / 2);
  var x = bar.x, y = bar.y, w = bar.w, h = bar.h;
  ctx.save();
  ctx.fillStyle = bar.fill;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawText(ctx, plan) {
  var t = plan.text;
  ctx.font = t.cssFont;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  t.lines.forEach(function (line) {
    line.chars.forEach(function (c) {
      if (t.outline) {
        ctx.lineWidth = t.strokeWidth * 2;
        ctx.strokeStyle = t.strokeColor;
        ctx.strokeText(c.ch, c.x, c.y);
      }
      ctx.fillStyle = t.color;
      ctx.fillText(c.ch, c.x, c.y);
    });
  });
}

Page({
  data: {
    fonts: Sticker.FONTS,
    colors: Sticker.COLORS,
    positions: Sticker.POSITIONS,
    sizes: Sticker.SIZES,
    strokes: Sticker.STROKES,
    maxChars: Sticker.MAX_CHARS,

    text: '',
    textLen: 0,
    fontId: 'heavy',
    color: 'auto',
    posId: 'bottom',
    sizeId: 'm',
    sizeDesc: Sticker.SIZES[1].desc,
    strokeId: 2,
    bar: false,
    colorHint: '自动：只量文字那块背景，不量整张图',

    hasImage: false,
    sample: 'light',
    stageW: 300,
    stageH: 380,

    result: false,
    resultW: 0,
    resultH: 0,
    resultFont: '',
    resultMeta: '',
    bgLumText: '',
    lumPercent: 50,
    crLabel: '字色对比度',
    crText: '—',
    crPercent: 50,
    crLow: false,

    generating: false,
    saved: false,
    unlocked: false,
    adUnitId: Ads.AD_UNIT_ID || ''
  },

  onLoad: function () {
    this._runs = 0;
    this._img = null;
    this._plan = null;
    this._ratio = 4 / 3;
    var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this._contentW = info.windowWidth * (1 - 64 / 750);
  },

  onReady: function () {
    this._fitStage(this._ratio);
  },

  /* ---------------- 画布 ---------------- */

  _fitStage: function (ratio) {
    var w = this._contentW;
    var h = w * ratio;
    if (h > MAX_STAGE_H) { h = MAX_STAGE_H; w = h / ratio; }
    this._ratio = ratio;
    this.setData({ stageW: Math.round(w), stageH: Math.round(h) });
  },

  _ensureCanvas: function (cb) {
    var that = this;
    if (that._canvas && that._ctx) return cb();
    wx.createSelectorQuery().in(that).select('#cv')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) return;
        that._canvas = res[0].node;
        that._ctx = that._canvas.getContext('2d');
        cb();
      });
  },

  _bgLayers: function (w, h) {
    return Sticker.samplePhoto(this.data.sample === 'light' ? 'light' : 'dark', w, h);
  },

  /** 只画背景，不画字 —— 取亮度时必须字还没上去，否则量到的是字自己 */
  _paintBg: function (w, h) {
    var cv = this._canvas, ctx = this._ctx;
    cv.width = w;
    cv.height = h;
    ctx.clearRect(0, 0, w, h);
    if (this._img) ctx.drawImage(this._img, 0, 0, w, h);
    else drawLayers(ctx, this._bgLayers(w, h), w, h);
  },

  _regionLum: function (box, w, h) {
    try {
      var d = this._ctx.getImageData(0, 0, w, h).data;
      return Sticker.regionLuminance(d, w, box, 3);
    } catch (e) {
      return null;
    }
  },

  _planArgs: function (bgLum, w, h) {
    return {
      text: this.data.text,
      imgW: w,
      imgH: h,
      fontId: this.data.fontId,
      color: this.data.color,
      posId: this.data.posId,
      sizeId: this.data.sizeId,
      strokeId: this.data.strokeId,
      bar: this.data.bar,
      bgLum: bgLum,
      sample: this.data.sample
    };
  },

  /** 两遍排版：第一遍只求文字落在哪，第二遍带着那块背景的亮度定字色 */
  _redraw: function (plan) {
    var that = this;
    var w = plan ? plan.canvas.w : 900;
    var h = plan ? plan.canvas.h : 1200;
    that._ensureCanvas(function () {
      if (!that._canvas) return;
      that._paintBg(w, h);
      if (plan && plan.text) {
        drawBar(that._ctx, plan.bar);
        drawText(that._ctx, plan);
      }
    });
  },

  /* ---------------- 选图 ---------------- */

  onPick: function () {
    var that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: function (res) {
        var f = res.tempFiles[0];
        that._loadImage(f.tempFilePath, f.width, f.height);
      }
    });
  },

  onSample: function () {
    var next = this.data.sample === 'light' ? 'dark' : 'light';
    this._img = null;
    this._fitStage(4 / 3);
    this.setData({ sample: next, hasImage: true, result: false, saved: false, generating: false });
    this._plan = null;
    var that = this;
    setTimeout(function () { that._redraw(null); }, 40);
  },

  _loadImage: function (path, w, h) {
    var that = this;
    that._ensureCanvas(function () {
      var img = that._canvas.createImage();
      img.onload = function () {
        that._img = img;
        var ratio = (h || img.height) / (w || img.width);
        that._fitStage(ratio);
        that.setData({ hasImage: true, result: false, saved: false }, function () {
          setTimeout(function () { that._redraw(null); }, 40);
        });
      };
      img.onerror = function () {
        wx.showToast({ title: '这张图读不了，换一张', icon: 'none' });
      };
      img.src = path;
    });
  },

  /* ---------------- 选项 ---------------- */

  _invalidate: function (patch) {
    patch = patch || {};
    patch.result = false;
    patch.saved = false;
    patch.generating = false;
    this._plan = null;
    this.setData(patch);
  },

  onTextInput: function (e) {
    var v = (e.detail.value || '').slice(0, Sticker.MAX_CHARS);
    this._invalidate({ text: v, textLen: v.length });
  },

  onSampleText: function () {
    this._invalidate({ text: '中秋快乐', textLen: 4 });
  },

  onClearText: function () {
    this._invalidate({ text: '', textLen: 0 });
  },

  onFont: function (e) {
    this._invalidate({ fontId: e.currentTarget.dataset.id });
  },

  onSize: function (e) {
    var id = e.currentTarget.dataset.id;
    var s = Sticker.SIZES.filter(function (x) { return x.id === id; })[0] || Sticker.SIZES[1];
    this._invalidate({ sizeId: id, sizeDesc: s.desc });
  },

  onStroke: function (e) {
    this._invalidate({ strokeId: Number(e.currentTarget.dataset.id) });
  },

  onColor: function (e) {
    var v = e.currentTarget.dataset.v;
    this._invalidate({ color: v, colorHint: v === 'auto' ? '自动：只量文字那块背景，不量整张图' : '已手动选 ' + v });
  },

  onPos: function (e) {
    this._invalidate({ posId: e.currentTarget.dataset.id });
  },

  onBar: function (e) {
    this._invalidate({ bar: e.detail.value });
  },

  /* ---------------- 生成 ---------------- */

  onGenerate: function () {
    var that = this;
    if (that.data.generating) return;
    if (!that.data.unlocked && that._runs >= FREE_RUNS) {
      wx.showToast({ title: '免费 ' + FREE_RUNS + ' 次用完了，解锁不限次', icon: 'none' });
      return;
    }
    if (!that.data.hasImage) {
      wx.showToast({ title: '先选一张图', icon: 'none' });
      return;
    }
    var txt = (that.data.text || '').trim();
    if (!txt) {
      wx.showToast({ title: '先打几个字', icon: 'none' });
      return;
    }
    if (txt.length > Sticker.MAX_CHARS) {
      wx.showToast({ title: '最多 ' + Sticker.MAX_CHARS + ' 个字', icon: 'none' });
      return;
    }

    that.setData({ generating: true });
    that._ensureCanvas(function () {
      setTimeout(function () {
        var w = that._canvas ? that._canvas.width : 900;
        var h = that._canvas ? that._canvas.height : 1200;

        var pre = Sticker.buildPlan(that._planArgs(null, w, h));
        if (!pre.ok) {
          that.setData({ generating: false });
          wx.showToast({ title: pre.message, icon: 'none' });
          return;
        }

        that._paintBg(pre.canvas.w, pre.canvas.h);
        var lum = that._regionLum(pre.box, pre.canvas.w, pre.canvas.h);

        var plan = Sticker.buildPlan(that._planArgs(lum, pre.canvas.w, pre.canvas.h));
        if (!plan.ok) {
          that.setData({ generating: false });
          wx.showToast({ title: plan.message, icon: 'none' });
          return;
        }

        var st = plan.stats;
        var lumVal = st.bgLum == null ? 0.5 : st.bgLum;
        var cr = st.contrast == null ? 1 : st.contrast;

        that._runs++;
        that._plan = plan;
        that._fitStage(plan.canvas.h / plan.canvas.w);

        that.setData({
          generating: false,
          result: true,
          saved: false,
          resultW: plan.canvas.w,
          resultH: plan.canvas.h,
          resultFont: plan.text.font.name,
          resultMeta: st.lines + ' 行 · 字号 ' + plan.text.size +
            ' · 描边 ' + (plan.text.outline ? plan.text.strokeWidth : '关'),
          bgLumText: lumVal.toFixed(2) + ' ' + (st.bgKind || ''),
          lumPercent: Math.round(lumVal * 100),
          crLabel: (st.edge || '字') + '对比度',
          crText: cr.toFixed(1) + ':1',
          crPercent: Math.min(100, Math.round(cr / 21 * 100)),
          crLow: cr < 3,
          colorHint: '自动量了文字那块：' + (st.bgKind || '未知') + '，挑对比度最高的色'
        }, function () {
          setTimeout(function () { that._redraw(plan); }, 40);
        });

        if (plan.warning) {
          wx.showToast({ title: plan.warning, icon: 'none', duration: 2600 });
        }
      }, 260);
    });
  },

  /* ---------------- 保存 ---------------- */

  onSave: function () {
    var that = this;
    if (!that._plan) {
      wx.showToast({ title: '先生成一张', icon: 'none' });
      return;
    }
    wx.canvasToTempFilePath({
      canvas: that._canvas,
      fileType: 'jpg',
      quality: 0.94,
      success: function (res) {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: function () {
            that.setData({ saved: true });
            wx.showToast({ title: '已存到相册', icon: 'success' });
          },
          fail: function (err) {
            var msg = String(err && err.errMsg || '');
            if (msg.indexOf('auth') >= 0 || msg.indexOf('deny') >= 0) {
              wx.showModal({
                title: '需要相册权限',
                content: '在设置里打开「保存到相册」后才能存图',
                confirmText: '去设置',
                success: function (r) { if (r.confirm) wx.openSetting(); }
              });
            } else {
              wx.showToast({ title: '保存失败，稍后再试', icon: 'none' });
            }
          }
        });
      },
      fail: function () {
        wx.showToast({ title: '生成图片失败', icon: 'none' });
      }
    }, that);
  },

  /* ---------------- 解锁 ---------------- */

  onUnlock: function () {
    var that = this;
    Ads.show({
      onReward: function () {
        that.setData({ unlocked: true });
        wx.showToast({ title: '已解锁，不限次数', icon: 'success' });
      },
      onFail: function (msg) {
        wx.showToast({ title: msg || '没有看完，未解锁', icon: 'none' });
      }
    });
  },

  onShareAppMessage: function () {
    return {
      title: '选一张图，打一行字，直接存成头像',
      path: '/pages/index/index'
    };
  }
});
