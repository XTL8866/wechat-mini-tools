var Sticker = require('../../core/sticker.js');
var Ads = require('../../core/ads.js');

var FREE_RUNS = 2;
var MAX_STAGE_H = 380;   // 预览区最高，再高就把下面的控件挤出首屏了

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
      // 用 scale + arc 画椭圆，兼容性比 ctx.ellipse 稳
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
      // 缩放坐标系里画上半圆 = 上半椭圆，正好贴合脸型
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
    maxChars: Sticker.MAX_CHARS,

    text: '',
    textLen: 0,
    fontId: 'heavy',
    fontDesc: Sticker.FONTS[0].desc,
    color: 'auto',
    colorHint: '',
    posId: 'bottom',
    outline: true,

    hasImage: false,
    stageW: 300,
    stageH: 380,

    result: false,
    resultW: 0,
    resultH: 0,
    resultFont: '',
    resultLines: 0,
    resultSize: 0,

    generating: false,
    unlocked: false,
    adUnitId: Ads.AD_UNIT_ID || ''
  },

  onLoad: function () {
    this._runs = 0;
    this._img = null;
    this._plan = null;
    this._ratio = 4 / 3;
    this._bgLum = null;

    var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    // 页面左右各 32rpx，换成 px
    this._contentW = info.windowWidth * (1 - 64 / 750);
    this.setData({ colorHint: '自动：按图片亮度挑最清楚的色' });
  },

  onReady: function () {
    this._fitStage(this._ratio);
  },

  /* ---------------- 画布 ---------------- */

  _fitStage: function (ratio) {
    var w = this._contentW;
    var h = w * ratio;
    if (h > MAX_STAGE_H) {
      h = MAX_STAGE_H;
      w = h / ratio;
    }
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

  _redraw: function (plan) {
    var that = this;
    var w = plan ? plan.canvas.w : 900;
    var h = plan ? plan.canvas.h : 1200;
    that._ensureCanvas(function () {
      var cv = that._canvas, ctx = that._ctx;
      if (!cv) return;
      cv.width = w;
      cv.height = h;
      ctx.clearRect(0, 0, w, h);
      if (that._img) {
        ctx.drawImage(that._img, 0, 0, w, h);
      } else if (plan) {
        drawLayers(ctx, plan.bgLayers, w, h);
      } else {
        drawLayers(ctx, Sticker.sampleAvatar(w, h), w, h);
      }
      if (plan && plan.text) drawText(ctx, plan);
      that._bgLum = that._sampleLum(ctx, w, h);
    });
  },

  _sampleLum: function (ctx, w, h) {
    try {
      var step = Math.max(8, Math.floor(Math.min(w, h) / 40));
      var data = ctx.getImageData(0, 0, w, h).data;
      var arr = [];
      for (var y = 0; y < h; y += step) {
        for (var x = 0; x < w; x += step) {
          var i = (y * w + x) * 4;
          arr.push([data[i], data[i + 1], data[i + 2]]);
        }
      }
      return Sticker.averageLuminance(arr);
    } catch (e) {
      return null;
    }
  },

  /* ---------------- 选图 ---------------- */

  onPick: function () {
    var that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: function (res) {
        var path = res.tempFiles[0].tempFilePath;
        that._loadImage(path, res.tempFiles[0].width, res.tempFiles[0].height);
      }
    });
  },

  onSample: function () {
    this._img = null;
    this._bgLum = null;
    this._fitStage(4 / 3);
    this.setData({ hasImage: true, result: false });
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
        that.setData({ hasImage: true, result: false }, function () {
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

  onTextInput: function (e) {
    var v = e.detail.value || '';
    this.setData({ text: v, textLen: v.length, result: false });
    this._plan = null;
  },

  onSampleText: function () {
    this.setData({ text: '陈', textLen: 1, result: false });
    this._plan = null;
  },

  onClearText: function () {
    this.setData({ text: '', textLen: 0, result: false });
    this._plan = null;
  },

  onFont: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id === this.data.fontId) return;
    var f = Sticker.FONTS.filter(function (x) { return x.id === id; })[0] || Sticker.FONTS[0];
    this.setData({ fontId: id, fontDesc: f.desc, result: false });
    this._plan = null;
  },

  onColor: function (e) {
    var v = e.currentTarget.dataset.v;
    this.setData({ color: v, result: false, colorHint: '已选 ' + v });
    this._plan = null;
  },

  onAuto: function () {
    this.setData({ color: 'auto', result: false, colorHint: '自动：按图片亮度挑最清楚的色' });
    this._plan = null;
  },

  onPos: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id === this.data.posId) return;
    this.setData({ posId: id, result: false });
    this._plan = null;
  },

  onOutline: function (e) {
    this.setData({ outline: e.detail.value, result: false });
    this._plan = null;
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

    that.setData({ generating: true });

    setTimeout(function () {
      var plan = Sticker.buildPlan({
        text: txt,
        imgW: that._canvas ? that._canvas.width : 900,
        imgH: that._canvas ? that._canvas.height : 1200,
        fontId: that.data.fontId,
        color: that.data.color,
        posId: that.data.posId,
        outline: that.data.outline,
        bgLum: that._bgLum
      });

      if (!plan.ok) {
        that.setData({ generating: false });
        wx.showToast({ title: plan.message, icon: 'none' });
        return;
      }

      that._runs++;
      that._plan = plan;
      that._fitStage(plan.canvas.h / plan.canvas.w);

      that.setData({
        generating: false,
        result: true,
        resultW: plan.canvas.w,
        resultH: plan.canvas.h,
        resultFont: plan.text.font.name,
        resultLines: plan.stats.lines,
        resultSize: plan.text.size
      }, function () {
        setTimeout(function () { that._redraw(plan); }, 40);
      });

      if (plan.warning) {
        wx.showToast({ title: plan.warning, icon: 'none', duration: 2600 });
      }
    }, 300);
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
      onReward: function (noAd) {
        that.setData({ unlocked: true });
        if (that.data.hasImage && that.data.text) that.onGenerate();
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
      title: '选一张图，打一行字，直接存成头像',
      path: '/pages/index/index'
    };
  }
});
