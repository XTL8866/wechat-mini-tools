var Tol = require('../../core/tol.js');
var Ads = require('../../core/ads.js');

function micronText(v) {
  return Tol.fmtMicron(v) + ' μm';
}

function mmText(v) {
  // 偏差转 mm 时保留符号，间隙 / 过盈只讲数值大小
  return Tol.fmtMm(v).replace('+', '') + ' mm';
}

Page({
  data: {
    sizeText: '',
    sizeHint: '',
    sizeWarn: false,

    holeChips: Tol.HOLE_CHIPS,
    shaftChips: Tol.SHAFT_CHIPS,
    hole: 'H7',
    shaft: 'g6',

    detail: null,      // 第一条的详细三卡
    rows: [],          // 批量时的逐尺寸列表
    copyAll: '',
    count: 0,
    generating: false,
    unlocked: false,
    copied: -1,

    adUnitId: Ads.AD_UNIT_ID || ''
  },

  onLoad: function () {
    this.setData({ sizeHint: '基本尺寸 0–500mm，一行一个' });
  },

  /* ---------------- 输入 ---------------- */

  onSizeInput: function (e) {
    var v = e.detail.value || '';
    this.setData({ sizeText: v, detail: null, rows: [], count: 0, copied: -1 });
    this._syncHint(v);
  },

  _syncHint: function (v) {
    var p = Tol.parseInput(v, Tol.limitOf(this.data.unlocked));
    if (p.ok) {
      var i = Tol.bandIndex(p.sizes[0]);
      this.setData({
        sizeHint: p.sizes.length + ' 个尺寸 · ' + Tol.bandCoarse(p.sizes[0]) + 'mm 段',
        sizeWarn: false
      });
    } else {
      this.setData({ sizeHint: p.message, sizeWarn: p.code !== 'EMPTY' });
    }
  },

  onHole: function (e) {
    var v = e.currentTarget.dataset.k;
    if (v === this.data.hole) return;
    this.setData({ hole: v });
    if (this.data.detail) this._run();
  },

  onShaft: function (e) {
    var v = e.currentTarget.dataset.k;
    if (v === this.data.shaft) return;
    this.setData({ shaft: v });
    if (this.data.detail) this._run();
  },

  onSample: function (e) {
    var v = e.currentTarget.dataset.k;
    this.setData({ sizeText: v, detail: null, rows: [], count: 0, copied: -1 });
    this._syncHint(v);
  },

  /* ---------------- 查询 ---------------- */

  onGenerate: function () {
    this._run();
  },

  _run: function () {
    var that = this;
    if (that.data.generating) return;

    var limit = Tol.limitOf(that.data.unlocked);
    var p = Tol.parseInput(that.data.sizeText, limit);
    if (!p.ok) {
      wx.showToast({ title: p.message, icon: 'none' });
      return;
    }

    that.setData({ generating: true });

    // 本地算，留一点时间让「查询中」这个状态被看见
    setTimeout(function () {
      var r = Tol.batch(that.data.sizeText, that.data.hole, that.data.shaft, limit);
      if (!r.ok) {
        that.setData({ generating: false });
        wx.showToast({ title: r.message, icon: 'none' });
        return;
      }

      var list = r.list;
      var d = list[0];

      that.setData({
        detail: that._detailOf(d),
        rows: list.length > 1 ? list.map(function (x) { return that._rowOf(x); }) : [],
        copyAll: list.length > 1 ? Tol.copyBatch(list) : '',
        count: list.length,
        generating: false,
        copied: -1
      });

      if (r.warning) {
        wx.showToast({ title: r.warning, icon: 'none', duration: 2400 });
      }
    }, 260);
  },

  _detailOf: function (r) {
    var fitRows;
    if (r.type === 'clearance') {
      fitRows = [
        { k: '最小间隙', v: mmText(r.xmin) },
        { k: '最大间隙', v: mmText(r.xmax) }
      ];
    } else if (r.type === 'interference') {
      fitRows = [
        { k: '最小过盈', v: mmText(-r.xmax) },
        { k: '最大过盈', v: mmText(r.maxInterference) }
      ];
    } else {
      fitRows = [
        { k: '最大间隙', v: mmText(r.xmax) },
        { k: '最大过盈', v: mmText(r.maxInterference) }
      ];
    }
    fitRows.push({ k: '配合公差', v: mmText(r.tf) });

    return {
      size: Tol.fmtSize(r.size),
      holeSpec: r.hole.spec,
      shaftSpec: r.shaft.spec,
      bandCoarse: r.hole.bandCoarse,
      holeRows: [
        { k: '上偏差 ES', v: micronText(r.hole.es) },
        { k: '下偏差 EI', v: micronText(r.hole.ei) },
        { k: '极限尺寸', v: Tol.fmtRange(r.hole.min, r.hole.max) }
      ],
      shaftRows: [
        { k: '上偏差 es', v: micronText(r.shaft.es) },
        { k: '下偏差 ei', v: micronText(r.shaft.ei) },
        { k: '极限尺寸', v: Tol.fmtRange(r.shaft.min, r.shaft.max) }
      ],
      fitType: r.type,
      fitName: r.typeName,
      fitRows: fitRows,
      copyText: Tol.copyText(r)
    };
  },

  _rowOf: function (r) {
    return {
      size: Tol.fmtSize(r.size),
      hole: Tol.fmtMicron(r.hole.es) + '/' + Tol.fmtMicron(r.hole.ei),
      shaft: Tol.fmtMicron(r.shaft.es) + '/' + Tol.fmtMicron(r.shaft.ei),
      fit: Tol.fitLine(r),
      type: r.typeName,
      typeKey: r.type
    };
  },

  /* ---------------- 复制 ---------------- */

  onCopy: function () {
    var d = this.data.detail;
    if (!d) return;
    wx.setClipboardData({
      data: this.data.copyAll || d.copyText,
      success: function () {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  onCopyText: function () {
    var d = this.data.detail;
    if (!d) return;
    wx.setClipboardData({
      data: d.copyText,
      success: function () {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  /* ---------------- 解锁 ---------------- */

  onUnlock: function () {
    var that = this;
    Ads.show({
      onReward: function (noAd) {
        that.setData({ unlocked: true });
        that._syncHint(that.data.sizeText);
        that._run();
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
      title: '输尺寸和公差带，直接出上下偏差和配合',
      path: '/pages/index/index'
    };
  }
});
