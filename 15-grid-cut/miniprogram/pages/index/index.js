// 图片九宫格切图 · 页面层
// 只负责「取图 / 照计划取料画像素 / 存相册」，切几刀、每刀落在哪个像素、
// 白边多宽全部交给 core/gridcut.js —— 这样小程序和 preview/index.html 切出来的完全一致。
var GridCut = require('../../core/gridcut.js');
var Ads = require('../../core/ads.js');

var FREE_RUNS = 2;
var MAX_STAGE_H = 300;

Page({
  data: {
    grids: GridCut.GRIDS,
    pads: GridCut.PADS,
    gridId: '3',
    padId: 'none',
    gridDesc: GridCut.GRIDS[1].desc,
    padDesc: '不留白：九张拼回去严丝合缝',

    hasImage: false,
    imgW: 0,
    imgH: 0,
    stageW: 300,
    stageH: 268,

    cutting: false,
    result: false,
    files: [],
    count: 0,
    summary: '',
    metaText: '',
    saved: false,
    unlocked: false,
    adUnitId: Ads.AD_UNIT_ID || ''
  },

  onLoad: function () {
    this._runs = 0;
    this._img = null;
    this._plan = null;
    var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this._contentW = info.windowWidth * (1 - 64 / 750);
  },

  /* ---------------- 取图 ---------------- */

  onPick: function () {
    var that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['original', 'compressed'],
      success: function (res) {
        var f = res.tempFiles && res.tempFiles[0];
        if (f) that._loadImage(f.tempFilePath);
      }
    });
  },

  /** 用示例图：没有相册权限也能看到九张切出来的样子 */
  onSample: function () {
    this._dusk = !this._dusk;
    this._loadSample(this._dusk ? 'dusk' : 'day');
  },

  _loadImage: function (path) {
    var that = this;
    wx.getImageInfo({
      src: path,
      success: function (info) {
        that.setData({ imgW: info.width, imgH: info.height });
        that._fitStage(info.width, info.height);
        that._ensureCanvas(function (canvas, ctx) {
          var img = canvas.createImage();
          img.onload = function () {
            that._img = { node: img, w: info.width, h: info.height };
            that._paintStage();
            that.setData({ hasImage: true, result: false, saved: false, files: [] });
            that._plan = null;
          };
          img.src = path;
        });
      },
      fail: function () { wx.showToast({ title: '这张图读不出来', icon: 'none' }); }
    });
  },

  _loadSample: function (kind) {
    var that = this;
    var W = 1200, H = 900;
    this._ensureCanvas(function (canvas, ctx) {
      canvas.width = W;
      canvas.height = H;
      var layers = GridCut.samplePhoto(kind, W, H);
      layers.forEach(function (L) {
        ctx.save();
        if (L.type === 'linear') {
          var g = ctx.createLinearGradient(L.x0, L.y0, L.x1, L.y1);
          L.stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
        } else if (L.type === 'circle') {
          ctx.fillStyle = L.fill;
          ctx.beginPath();
          ctx.arc(L.cx, L.cy, L.r, 0, Math.PI * 2);
          ctx.fill();
        } else if (L.type === 'rect') {
          ctx.fillStyle = L.fill;
          ctx.fillRect(L.x, L.y, L.w, L.h);
        } else if (L.type === 'poly') {
          ctx.fillStyle = L.fill;
          ctx.beginPath();
          L.pts.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      });
      // 截成图片再用，后面的取料流程和真图完全一样
      wx.canvasToTempFilePath({
        canvas: canvas,
        x: 0, y: 0, width: W, height: H,
        destWidth: W, destHeight: H,
        fileType: 'png',
        success: function (r) { that._loadImage(r.tempFilePath); },
        fail: function () { wx.showToast({ title: '示例图生成失败', icon: 'none' }); }
      });
    });
  },

  /* ---------------- 画布 ---------------- */

  _fitStage: function (w, h) {
    var sw = this._contentW, sh = sw * h / w;
    if (sh > MAX_STAGE_H) { sh = MAX_STAGE_H; sw = sh * w / h; }
    this.setData({ stageW: Math.round(sw), stageH: Math.round(sh) });
  },

  _ensureCanvas: function (cb) {
    var that = this;
    if (that._canvas && that._ctx) return cb(that._canvas, that._ctx);
    wx.createSelectorQuery().in(that).select('#cv')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) return;
        var c = res[0].node;
        that._canvas = c;
        that._ctx = c.getContext('2d');
        cb(c, that._ctx);
      });
  },

  /** 预览：图 + 网格线 + 裁掉的部分压暗 */
  _paintStage: function () {
    var that = this;
    if (!this._img) return;
    this._ensureCanvas(function (canvas, ctx) {
      var dpr = 2;
      var s = that.data;
      canvas.width = s.stageW * dpr;
      canvas.height = s.stageH * dpr;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(that._img.node, 0, 0, canvas.width, canvas.height);

      var plan = GridCut.buildPlan({
        imgW: that._img.w, imgH: that._img.h,
        grid: that.data.gridId, pad: that.data.padId
      });
      if (!plan.ok) return;
      var kx = canvas.width / that._img.w, ky = canvas.height / that._img.h;
      var crop = plan.src.crop;
      ctx.fillStyle = 'rgba(8,8,10,0.58)';
      if (crop.x > 0) ctx.fillRect(0, 0, crop.x * kx, canvas.height);
      if (crop.x + crop.w < that._img.w) {
        ctx.fillRect((crop.x + crop.w) * kx, 0, canvas.width - (crop.x + crop.w) * kx, canvas.height);
      }
      if (crop.y > 0) ctx.fillRect(0, 0, canvas.width, crop.y * ky);
      if (crop.y + crop.h < that._img.h) {
        ctx.fillRect(0, (crop.y + crop.h) * ky, canvas.width, canvas.height - (crop.y + crop.h) * ky);
      }
      var n = plan.grid.n, i;
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = 2 * dpr;
      for (i = 1; i < n; i++) {
        var gx = (crop.x + crop.w * i / n) * kx;
        var gy = (crop.y + crop.h * i / n) * ky;
        ctx.beginPath(); ctx.moveTo(gx, crop.y * ky); ctx.lineTo(gx, (crop.y + crop.h) * ky); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(crop.x * kx, gy); ctx.lineTo((crop.x + crop.w) * kx, gy); ctx.stroke();
      }
    });
  },

  /* ---------------- 参数 ---------------- */

  onGrid: function (e) {
    var id = e.currentTarget.dataset.id;
    var g = GridCut.gridOf(id);
    this.setData({ gridId: g.id, gridDesc: g.desc, result: false, saved: false, files: [] });
    this._paintStage();
  },

  onPad: function (e) {
    var id = e.currentTarget.dataset.id;
    var p = GridCut.padOf(id);
    this.setData({
      padId: p.id,
      padDesc: p.ratio === 0
        ? '不留白：九张拼回去严丝合缝'
        : '每张内缩 ' + Math.round(p.ratio * 1000) / 10 + '%，排在一起有分隔感',
      result: false, saved: false, files: []
    });
    this._paintStage();
  },

  /* ---------------- 切图 ---------------- */

  onGenerate: function () {
    var that = this;
    if (!this._img) { wx.showToast({ title: '先选一张图', icon: 'none' }); return; }

    var plan = GridCut.buildPlan({
      imgW: this._img.w, imgH: this._img.h,
      grid: this.data.gridId, pad: this.data.padId, out: 1080
    });
    if (!plan.ok) { wx.showToast({ title: plan.message, icon: 'none' }); return; }
    if (plan.warnings.length) {
      wx.showToast({ title: plan.warnings[0], icon: 'none', duration: 2200 });
    }

    this.setData({ cutting: true });
    this._plan = plan;

    this._cutCanvas(function (canvas, ctx) {
      var files = [];
      var n = plan.out.cell;

      function step(i) {
        if (i >= plan.cells.length) {
          var gap = 7;
          var nn = plan.grid.n;
          var cw = Math.floor((that._contentW - gap * (nn - 1)) / nn);
          that.setData({
            cutting: false, result: true, saved: false, files: files,
            count: plan.count,
            cellPx: cw,
            summary: GridCut.summary(plan),
            metaText: '白边 ' + plan.out.padPx + 'px · 内容 ' + plan.out.inner + 'px'
          });
          return;
        }
        canvas.width = n;
        canvas.height = n;
        ctx.fillStyle = plan.out.bg;
        ctx.fillRect(0, 0, n, n);
        var cell = plan.cells[i];
        ctx.drawImage(that._img.node, cell.sx, cell.sy, cell.sw, cell.sh,
                      plan.out.padPx, plan.out.padPx, plan.out.inner, plan.out.inner);

        wx.canvasToTempFilePath({
          canvas: canvas,
          x: 0, y: 0, width: n, height: n,
          destWidth: n, destHeight: n,
          fileType: 'png',
          success: function (r) {
            files.push({ i: i, path: r.tempFilePath });
            step(i + 1);
          },
          fail: function () {
            that.setData({ cutting: false });
            wx.showToast({ title: '第 ' + (i + 1) + ' 张导出失败', icon: 'none' });
          }
        });
      }
      step(0);
    });
  },

  _cutCanvas: function (cb) {
    var that = this;
    if (that._cutCv) return cb(that._cutCv, that._cutCtx);
    wx.createSelectorQuery().in(that).select('#cut')
      .fields({ node: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) return;
        that._cutCv = res[0].node;
        that._cutCtx = that._cutCv.getContext('2d');
        cb(that._cutCv, that._cutCtx);
      });
  },

  /* ---------------- 保存 ---------------- */

  onSave: function () {
    var that = this;
    if (!this.data.result || !this.data.files.length) {
      wx.showToast({ title: '先切一次', icon: 'none' });
      return;
    }
    var files = this.data.files.slice();
    var done = 0, failed = 0;

    function next(k) {
      if (k >= files.length) {
        wx.showToast({
          title: failed ? ('存好 ' + done + ' 张，' + failed + ' 张失败') : ('已存 ' + done + ' 张'),
          icon: 'none'
        });
        that.setData({ saved: !failed });
        return;
      }
      wx.saveImageToPhotosAlbum({
        filePath: files[k].path,
        success: function () { done++; next(k + 1); },
        fail: function (err) {
          // 拒过一次权限就别再弹九下
          if (err && String(err.errMsg || '').indexOf('auth') >= 0) {
            failed = files.length - k;
            wx.showToast({ title: '没给相册权限，去设置里开一下', icon: 'none' });
            return;
          }
          failed++;
          next(k + 1);
        }
      });
    }
    next(0);
  },

  /* ---------------- 解锁 ---------------- */

  onUnlock: function () {
    var that = this;
    Ads.show({
      onReward: function (noAd) {
        that.setData({ unlocked: true });
        wx.showToast({ title: noAd ? '已解锁（无广告时直接放行）' : '已解锁，不限次数', icon: 'none' });
      },
      onFail: function (msg) {
        wx.showToast({ title: msg || '广告没看完', icon: 'none' });
      }
    });
  }
});
