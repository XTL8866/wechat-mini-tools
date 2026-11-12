// node test.js —— 33 组断言，全过才算这块逻辑能上片
var G = require('./miniprogram/core/gridcut.js');

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name);
}
function eq(a, b, name) { ok(a === b, name + '  (期望 ' + b + '，实得 ' + a + ')'); }
function near(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name + '  (期望≈' + b + '，实得 ' + a + ')'); }
function p(o) { return G.buildPlan(o); }

var plan;

console.log('— 1 空输入与非法输入 —');
eq(p({}).ok, false, '空参数不通过');
eq(p().ok, false, '无参数不通过');
eq(p({ imgW: 0, imgH: 900 }).code, 'NO_IMAGE', '宽 0 判为无图');
eq(p({ imgW: 1200, imgH: -5 }).code, 'NO_IMAGE', '高负数判为无图');
eq(p({ imgW: '1200', imgH: 900 }).ok, false, '字符串尺寸不接受');
eq(p({ imgW: NaN, imgH: 900 }).ok, false, 'NaN 不接受');
eq(p({ imgW: 40, imgH: 40, grid: '3' }).code, 'TOO_SMALL', '40px 切 3×3 太小');
eq(p({ imgW: 80, imgH: 80, grid: '4' }).ok, false, '80px 切 4×4 太小（每格 20px）');
ok(p({ imgW: 100, imgH: 100, grid: '2' }).ok, '100px 切 2×2 可以');
ok(p({ imgW: 40, imgH: 40 }).message.length > 0, '拒绝时给得出原因');

console.log('— 2 居中正方裁剪 —');
plan = p({ imgW: 1200, imgH: 900, grid: '3' });
eq(plan.ok, true, '4:3 图切 3×3 通过');
eq(plan.src.side, 900, '裁剪边长取短边 900');
eq(plan.src.cell, 300, '每格 300');
eq(plan.src.crop.x, 150, '左右各让 150');
eq(plan.src.crop.y, 0, '上下不让');
near(plan.stats.cropLoss, 0.25, 0.001, '4:3 图裁掉 25%');
ok(p({ imgW: 1000, imgH: 1000, grid: '3' }).stats.cropLoss < 0.005, '方图基本不裁边');
near(p({ imgW: 1003, imgH: 1000, grid: '3' }).stats.cropLoss, 0, 0.006, '差 3px 只丢不到 0.6%');
eq(p({ imgW: 1000, imgH: 1000, grid: '3' }).src.side, 999, '1000 缩到能被 3 整除的 999');

console.log('— 3 整除与无缝拼接 —');
['2', '3', '4'].forEach(function (g) {
  var q = p({ imgW: 1999, imgH: 1333, grid: g });
  var n = Number(g);
  eq(q.src.side % n, 0, g + '×' + g + ' 裁剪边长能被 ' + n + ' 整除');
  eq(q.cells.length, n * n, g + '×' + g + ' 出 ' + (n * n) + ' 格');
  var seam = true, cover = 0;
  for (var i = 0; i < q.cells.length; i++) {
    var a = q.cells[i];
    cover += a.sw * a.sh;
    if (a.c % n < n - 1) {
      var right = q.cells[a.r * n + a.c + 1];
      if (a.sx + a.sw !== right.sx) seam = false;
    }
    if (a.r < n - 1) {
      var below = q.cells[(a.r + 1) * n + a.c];
      if (a.sy + a.sh !== below.sy) seam = false;
    }
    if (a.sw !== q.src.cell || a.sh !== q.src.cell) seam = false;
  }
  ok(seam, g + '×' + g + ' 相邻格边界严格相接、每格等大');
  eq(cover, q.src.side * q.src.side, g + '×' + g + ' 九格面积之和 = 裁剪面积');
});
var big = p({ imgW: 1999, imgH: 1333, grid: '3' });
ok(big.cells.every(function (c) {
  return c.sx >= 0 && c.sy >= 0 && c.sx + c.sw <= 1999 && c.sy + c.sh <= 1333;
}), '所有格子不越出原图');
ok(big.cells.every(function (c) {
  return c.sx === Math.round(c.sx) && c.sw === Math.round(c.sw);
}), '所有坐标是整数（不出现半像素缝）');

console.log('— 4 留白 —');
plan = p({ imgW: 1200, imgH: 900, grid: '3', pad: 'none' });
eq(plan.out.padPx, 0, '不留白 padPx=0');
eq(plan.out.inner, plan.out.cell, '不留白内容=整张');
var thin = p({ imgW: 1200, imgH: 900, grid: '3', pad: 'thin', out: 1080 });
eq(thin.out.padPx, 32, '细白边 1080×3% = 32');
eq(thin.out.inner, 1080 - 64, '细白边内容 1016');
eq(thin.outs[0].x, 32, '内容从 padPx 起画');
var wide = p({ imgW: 1200, imgH: 900, grid: '3', pad: 'wide', out: 1080 });
eq(wide.out.padPx, 81, '宽白边 1080×7.5% = 81');
ok(wide.out.inner < thin.out.inner, '宽白边内容更小');
var crazy = p({ imgW: 1200, imgH: 900, pad: 'wide', out: 1080 });
var clamped = p({ imgW: 1200, imgH: 900, pad: 'wide', out: 240 });
eq(clamped.out.padPx, 18, '小图宽白边 240×7.5% = 18');
ok(crazy.out.padPx / crazy.out.cell <= 0.4 + 1e-9, '白边比例被夹在 40%');
ok(p({ imgW: 1200, imgH: 900, pad: 'nope' }).out.padPx === 0, '未知留白 id 退回不留白');

console.log('— 5 导出尺寸 —');
eq(p({ imgW: 1200, imgH: 900 }).out.cell, 1080, '默认导出 1080');
eq(p({ imgW: 1200, imgH: 900, out: 100 }).out.cell, 240, '过小夹到 240');
eq(p({ imgW: 1200, imgH: 900, out: 9999 }).out.cell, 2048, '过大夹到 2048');
eq(p({ imgW: 300, imgH: 300 }).stats.upscale, true, '小图会放大');
eq(p({ imgW: 4800, imgH: 4800 }).stats.upscale, false, '大图会缩小');
near(p({ imgW: 4800, imgH: 4800 }).stats.scale, 0.675, 0.01, '4800 图每格 1600，缩到 0.675 倍');

console.log('— 6 顺序、文件名词 —');
plan = p({ imgW: 1200, imgH: 900, grid: '3' });
eq(plan.cells[0].r, 0, '第 1 张在第 1 行');
eq(plan.cells[0].c, 0, '第 1 张在第 1 列');
eq(plan.cells[4].r, 1, '第 5 张在第 2 行中间');
eq(plan.cells[8].c, 2, '第 9 张在第 3 列');
eq(plan.names[0], 'grid3_1.png', '文件名从 1 开始');
eq(plan.names[8], 'grid3_9.png', '文件名到 9 结束');
eq(new Set(plan.names).size, 9, '九个文件名不重复');
eq(plan.count, 9, 'count = 9');
eq(p({ imgW: 900, imgH: 900, grid: '4' }).count, 16, '4×4 出 16 张');
eq(p({ imgW: 900, imgH: 900, grid: '?' }).grid.n, 3, '未知切法退回 3×3');

console.log('— 7 提示语与拼图板 —');
ok(p({ imgW: 1200, imgH: 900 }).warnings.length >= 1, '非方图给裁边提示');
eq(p({ imgW: 3000, imgH: 3000, out: 900 }).warnings.length, 0, '方图且不放大，无提示');
ok(p({ imgW: 6000, imgH: 6000 }).warnings.length >= 1, '超大图给降采样提示');
ok(G.summary(p({ imgW: 1200, imgH: 900 })).indexOf('9 张') > 0, '摘要含张数');
var m = G.montage(p({ imgW: 1200, imgH: 900 }), 320, 6);
eq(m.cols, 3, '拼图板 3 列');
eq(m.w, m.cell * 3 + 12, '拼图板宽 = 9 格 + 间隔');
eq(G.cellName(2, 0), 'grid2_1.png', '2×2 文件名前缀');

console.log('— 8 示例图 —');
var lay = G.samplePhoto('day', 1200, 900);
ok(lay.length >= 6, '示例图至少 6 层');
ok(lay.some(function (l) { return l.type === 'poly'; }), '含山体多边形');
ok(lay.filter(function (l) { return l.type === 'rect'; }).length >= 3, '含海/沙/人影矩形');

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
