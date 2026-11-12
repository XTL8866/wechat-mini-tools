/**
 * 九宫格切图引擎（纯逻辑，零依赖）
 * 小程序 require() 和浏览器 <script> 共用同一份。
 *
 * 它不碰像素，只算一份「裁剪计划」：从原图哪块矩形取料、切几刀、
 * 每刀落在第几个像素、留白多宽、导出多大、文件名怎么排。
 * 小程序 canvas 和浏览器 canvas 各自照这份计划取料，两边切出来的完全一致。
 *
 * 三个必须算对的地方：
 *  1. 裁剪边长要能被格数整除。随便取 min(宽,高) 再除以 3 会得到 300.333，
 *     三刀下去累计误差半像素，拼回整图能看见 1px 的错位缝。
 *  2. 居中裁剪的余数只能丢在左/右（上/下）各一半，不能全丢一边，
 *     否则切出来的九张整体偏移，人脸偏到画面角上。
 *  3. 留白是「导出画布内缩」，不是「源图里挖掉」。源图里挖会让每格内容
 *     各少一圈，拼回去永远拼不上；导出内缩则是每张自带白边，平台按方块排也不会变形。
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GridCut = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var GRIDS = [
    { id: '2', n: 2, name: '2×2', desc: '四张，单张最大' },
    { id: '3', n: 3, name: '3×3', desc: '九张，朋友圈标准' },
    { id: '4', n: 4, name: '4×4', desc: '十六张，做拼图墙' }
  ];

  // ratio = 白边宽度 / 单张导出边长
  var PADS = [
    { id: 'none', name: '不留白', ratio: 0 },
    { id: 'thin', name: '细白边', ratio: 0.030 },
    { id: 'wide', name: '宽白边', ratio: 0.075 }
  ];

  var DEFAULT_OUT = 1080;
  var MIN_OUT = 240;
  var MAX_OUT = 2048;
  var MAX_PAD_RATIO = 0.4;   // 白边再宽就没内容了，夹在这里
  var MIN_CELL = 24;         // 每格源图不足 24px 就是糊的，直接拒
  var BIG_SIDE = 4096;       // 超过这个边长按警告处理（导出反正只有 1080）

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function gridOf(id) {
    for (var i = 0; i < GRIDS.length; i++) {
      if (GRIDS[i].id === String(id)) return GRIDS[i];
    }
    return GRIDS[1];
  }

  function padOf(id) {
    for (var i = 0; i < PADS.length; i++) {
      if (PADS[i].id === String(id)) return PADS[i];
    }
    return PADS[0];
  }

  /**
   * 居中正方裁剪。返回的 side 一定能被 n 整除，
   * 余数左右（上下）各分一半，多出来的 1px 给右边（下边）。
   */
  function calcCrop(imgW, imgH, n) {
    n = Math.max(1, Math.floor(n || 3));
    var side0 = Math.min(imgW, imgH);
    var side = Math.floor(side0 / n) * n;
    var x = Math.floor((imgW - side) / 2);
    var y = Math.floor((imgH - side) / 2);
    return {
      side: side,
      cell: side / n,
      x: x,
      y: y,
      cutW: imgW - side,   // 被裁掉的总宽度
      cutH: imgH - side
    };
  }

  function cellName(n, i) {
    return 'grid' + n + '_' + (i + 1) + '.png';
  }

  /**
   * 出计划。
   * @param {Object} o {imgW, imgH, grid, pad, out}
   *  imgW/imgH 原图像素；grid 是 GRIDS 的 id；pad 是 PADS 的 id；
   *  out 单张导出的边长（默认 1080）。
   */
  function buildPlan(o) {
    o = o || {};
    var imgW = o.imgW, imgH = o.imgH;

    if (!isNum(imgW) || !isNum(imgH) || imgW <= 0 || imgH <= 0) {
      return { ok: false, code: 'NO_IMAGE', message: '先选一张图' };
    }

    var g = gridOf(o.grid);
    var n = g.n;
    var p = padOf(o.pad);

    if (Math.min(imgW, imgH) < n * MIN_CELL) {
      return {
        ok: false, code: 'TOO_SMALL',
        message: '这张图太小，切' + n + '格每格不到 ' + MIN_CELL + ' 像素'
      };
    }

    var crop = calcCrop(imgW, imgH, n);

    var outCell = Math.round(clamp(isNum(o.out) ? o.out : DEFAULT_OUT, MIN_OUT, MAX_OUT));
    var padPx = Math.round(clamp(outCell * p.ratio, 0, Math.floor(outCell * MAX_PAD_RATIO)));
    var inner = outCell - padPx * 2;

    var cells = [];
    var outs = [];
    var names = [];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        var i = r * n + c;
        cells.push({
          i: i, r: r, c: c,
          sx: crop.x + c * crop.cell,
          sy: crop.y + r * crop.cell,
          sw: crop.cell,
          sh: crop.cell
        });
        outs.push({
          i: i, r: r, c: c,
          x: padPx, y: padPx, w: inner, h: inner,
          size: outCell
        });
        names.push(cellName(n, i));
      }
    }

    var plan = {
      ok: true,
      grid: g,
      pad: p,
      src: {
        w: imgW, h: imgH,
        crop: { x: crop.x, y: crop.y, w: crop.side, h: crop.side },
        side: crop.side, cell: crop.cell,
        cutW: crop.cutW, cutH: crop.cutH
      },
      out: {
        cell: outCell, padPx: padPx, inner: inner,
        bg: '#FFFFFF'
      },
      cells: cells,
      outs: outs,
      names: names,
      count: n * n,
      stats: {
        cropLoss: 1 - (crop.side * crop.side) / (imgW * imgH),
        scale: outCell / crop.cell,
        upscale: outCell > crop.cell,
        sourceSide: Math.min(imgW, imgH)
      }
    };
    plan.warnings = check(plan);
    return plan;
  }

  /** 提示语，不拦人。都是「知道就好」级别。 */
  function check(plan) {
    var w = [];
    if (!plan || !plan.ok) return w;
    var st = plan.stats;
    if (st.cropLoss > 0.005) {
      w.push('原图不是方的，' + Math.round(st.cropLoss * 100) + '% 被裁掉，留意主体别贴边');
    }
    if (st.upscale) {
      w.push('原图比导出尺寸小，会被放大，边缘会有点糊');
    }
    if (st.sourceSide > BIG_SIDE) {
      w.push('大图，导出前先降到 ' + plan.out.cell + ' 像素，不会丢细节');
    }
    if (plan.out.padPx === 0 && plan.pad.ratio > 0) {
      w.push('导出尺寸太小，白边被压成 0');
    }
    return w;
  }

  /** 预览用：把九张拼回一张时，图板里每格多大、间隔多宽 */
  function montage(plan, boardW, gap) {
    var n = plan.grid.n;
    gap = isNum(gap) ? gap : 6;
    var cell = Math.floor((boardW - gap * (n - 1)) / n);
    return {
      cols: n, rows: n, cell: cell, gap: gap,
      w: cell * n + gap * (n - 1),
      h: cell * n + gap * (n - 1)
    };
  }

  /** 结果页小标题：3×3 · 9 张 · 每张 1080×1080 */
  function summary(plan) {
    if (!plan || !plan.ok) return '';
    return plan.grid.name + ' · ' + plan.count + ' 张 · 每张 ' +
      plan.out.cell + '×' + plan.out.cell;
  }

  /* ---------------- 示例图（没有相册权限也能看到效果） ----------------
   * 画成 4:3 的风景照：切 3×3 时左右各裁掉一截，正好用来演示「非方图会裁边」。
   * 每个格子里的颜色都不同，截图里能一眼看出这是九张分开的图。
   */
  function samplePhoto(kind, w, h) {
    w = Math.max(2, Math.round(w || 1200));
    h = Math.max(2, Math.round(h || 900));
    var dusk = kind === 'dusk';
    var skyA = dusk ? '#3C4A78' : '#8FC4E8';
    var skyB = dusk ? '#D98E6A' : '#DCEFFB';
    var sea = dusk ? '#2A3B5C' : '#2F7E9E';
    var sea2 = dusk ? '#3A5075' : '#3E93B1';
    var hill = dusk ? '#4A3F52' : '#93AEBE';
    var sand = dusk ? '#B99A7C' : '#E9D6B2';

    var L = [];
    L.push({ type: 'linear', x0: 0, y0: 0, x1: 0, y1: h * 0.62,
             stops: [[0, skyA], [1, skyB]] });
    L.push({ type: 'circle', cx: w * 0.74, cy: h * 0.24, r: w * 0.062,
             fill: dusk ? '#F6D9A8' : '#FFEFC2' });
    L.push({ type: 'rect', x: 0, y: h * 0.60, w: w, h: h * 0.26, fill: sea });
    L.push({ type: 'rect', x: 0, y: h * 0.60, w: w, h: h * 0.05, fill: sea2 });
    L.push({ type: 'rect', x: 0, y: h * 0.84, w: w, h: h * 0.16, fill: sand });
    L.push({ type: 'poly', pts: [
      [0, h * 0.60], [w * 0.14, h * 0.40], [w * 0.27, h * 0.52],
      [w * 0.45, h * 0.33], [w * 0.62, h * 0.54], [w * 0.78, h * 0.44],
      [w * 0.90, h * 0.55], [w, h * 0.50], [w, h * 0.60]
    ], fill: hill });
    L.push({ type: 'poly', pts: [
      [w * 0.30, h * 0.60], [w * 0.52, h * 0.47], [w * 0.74, h * 0.60]
    ], fill: dusk ? '#332C40' : '#7B96A8' });
    // 沙滩上两个小人影，切图后每格内容才分得开
    L.push({ type: 'rect', x: w * 0.18, y: h * 0.86, w: w * 0.012, h: h * 0.08,
             fill: dusk ? '#6E5B4C' : '#C9AE86' });
    L.push({ type: 'rect', x: w * 0.62, y: h * 0.88, w: w * 0.012, h: h * 0.07,
             fill: dusk ? '#6E5B4C' : '#C9AE86' });
    return L;
  }

  return {
    GRIDS: GRIDS,
    PADS: PADS,
    DEFAULT_OUT: DEFAULT_OUT,
    MIN_OUT: MIN_OUT,
    MAX_OUT: MAX_OUT,
    MIN_CELL: MIN_CELL,
    gridOf: gridOf,
    padOf: padOf,
    calcCrop: calcCrop,
    cellName: cellName,
    buildPlan: buildPlan,
    check: check,
    montage: montage,
    summary: summary,
    samplePhoto: samplePhoto,
    _clamp: clamp
  };
});
