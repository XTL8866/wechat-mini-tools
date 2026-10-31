// 逻辑自测：node test.js
var S = require('./miniprogram/core/sticker.js');

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}

console.log('\n[1] 输入校验');
var r0 = S.buildPlan({ text: '' });
ok(!r0.ok && r0.code === 'EMPTY_TEXT', '空文字被拒', r0.code);
var rBlank = S.buildPlan({ text: '   \n\u3000 ' });
ok(!rBlank.ok && rBlank.code === 'EMPTY_TEXT', '全空白被拒');
var r13 = S.buildPlan({ text: '一二三四五六七八九十十一二' });
ok(!r13.ok && r13.code === 'TOO_LONG', '13 字被拒', r13.code);
var r12 = S.buildPlan({ text: '一二三四五六七八九十一二' });
ok(r12.ok, '正好 12 字可用', String(r12.ok));
var rNul = S.buildPlan({ text: '中\u200B秋\uFEFF' });
ok(rNul.ok && rNul.stats.chars === 2, '零宽字符被清掉', String(rNul.stats && rNul.stats.chars));
ok(S.normalizeText('  中  秋  ') === '中 秋', '空白归一');

console.log('\n[2] 断行与字号');
var p1 = S.buildPlan({ text: '陈' });
var p2 = S.buildPlan({ text: '陈乙' });
var p4 = S.buildPlan({ text: '中秋快乐' });
var p6 = S.buildPlan({ text: '一二三四五六' });
var p7 = S.buildPlan({ text: '一二三四五六七' });
var p12 = S.buildPlan({ text: '一二三四五六七八九十一二' });

ok(p1.text.lines.length === 1, '单字一行');
ok(p4.text.lines.length === 1, '4 字仍一行');
ok(p6.text.lines.length === 1, '6 字仍一行（阈值边界）');
ok(p7.text.lines.length === 2, '7 字断两行（跨过阈值）', String(p7.text.lines.length));
ok(p12.text.lines.length === 2, '12 字两行');
ok(p12.text.lines[0].text.length === 6 && p12.text.lines[1].text.length === 6, '两行均分',
   p12.text.lines.map(function (l) { return l.text.length; }).join('+'));
ok(p1.text.size > p2.text.size, '字越少字号越大', p1.text.size + ' vs ' + p2.text.size);
ok(p2.text.size > p4.text.size, '2 字比 4 字大', p2.text.size + ' vs ' + p4.text.size);
ok(p4.text.size >= p12.text.size, '4 字不小于 12 字', p4.text.size + ' vs ' + p12.text.size);

console.log('\n[3] 边界：不出安全区');
function safeW(p) { return p.canvas.w * (1 - S.PAD * 2); }
[p1, p2, p4, p6, p7, p12].forEach(function (p) {
  var right = 0;
  p.text.lines.forEach(function (line) {
    line.chars.forEach(function (c) {
      var edge = c.x + c.w;
      if (edge > right) right = edge;
    });
  });
  ok(right <= p.canvas.w - p.canvas.w * S.PAD + 1,
     '「' + p.text.lines.map(function (l) { return l.text; }).join('/') + '」右边界在安全区内',
     right.toFixed(1) + ' / ' + (p.canvas.w - p.canvas.w * S.PAD).toFixed(1));
});
ok(p12.box.w <= safeW(p12) + 1, '最长行宽不超安全区', p12.box.w + ' ≤ ' + safeW(p12));
ok(p1.text.size <= Math.min(1200 * 0.30, 900 * 0.42), '字号不超上限', String(p1.text.size));
ok(p12.text.size >= Math.round(1200 * 0.035), '字号不低于下限', String(p12.text.size));
ok(p12.box.y >= 0 && p12.box.y + p12.box.h <= 1200, '文字竖直不出画布',
   p12.box.y + '~' + (p12.box.y + p12.box.h));

console.log('\n[4] 画布尺寸');
var big = S.buildPlan({ text: '陈', imgW: 3000, imgH: 4000 });
ok(big.canvas.h === S.MAX_SIDE && big.canvas.w === 1200, '大图按最长边压到 1600',
   big.canvas.w + 'x' + big.canvas.h);
ok(big.canvas.scaled === true, '标记了已缩放');
var small = S.buildPlan({ text: '陈', imgW: 300, imgH: 400 });
ok(small.canvas.w === 300 && small.canvas.h === 400, '小图不放大');
ok(small.canvas.scaled === false, '小图不算缩放');
var none = S.buildPlan({ text: '陈' });
ok(none.canvas.w === 900 && none.canvas.h === 1200, '不给尺寸时按 3:4 兜底');
var wide = S.buildPlan({ text: '陈', imgW: 1600, imgH: 900 });
ok(wide.canvas.w === 1600 && wide.canvas.h === 900, '横图比例保留', wide.canvas.w + 'x' + wide.canvas.h);

console.log('\n[5] 颜色解析');
ok(S.parseColor('#fff').r === 255 && S.parseColor('#fff').b === 255, '#fff 展开正确');
ok(S.parseColor('#A1b2C3').g === 178, '大小写混写可解析', String(S.parseColor('#A1b2C3').g));
ok(S.parseColor('rgb(1, 2, 3)').g === 2, 'rgb() 可解析');
ok(Math.abs(S.parseColor('rgba(0,0,0,0.5)').a - 0.5) < 0.01, 'rgba 透明度可解析');
ok(S.parseColor('rgb(300,-5,0)').r === 255 && S.parseColor('rgb(300,-5,0)').g === 0, '越界值被夹到 0-255');
ok(S.parseColor('#12') === null, '长度不对返回 null');
ok(S.parseColor('紫色') === null, '认不出的中文色名返回 null');
ok(S.toHex('#abc') === '#AABBCC', 'toHex 展开简写', S.toHex('#abc'));
var back = S.toHex(S.parseColor('#3D4E6B'));
ok(back === '#3D4E6B', 'hex → rgb → hex 往返一致', back);
ok(S.toRgbString('#000000') === 'rgb(0, 0, 0)', 'toRgbString 正常色');
ok(S.toRgbString('rgba(0,0,0,0.4)') === 'rgba(0, 0, 0, 0.4)', 'toRgbString 带透明度');

console.log('\n[6] 亮度与对比');
ok(Math.abs(S.luminance('#FFFFFF') - 1) < 0.001, '白色亮度为 1');
ok(S.luminance('#000000') === 0, '黑色亮度为 0');
ok(Math.abs(S.contrast('#000000', '#FFFFFF') - 21) < 0.01, '黑白对比度 21:1');
ok(S.contrast('#777777', '#777777') === 1, '同色对比度 1');
ok(S.pickInk(0.95) === '#101014', '亮背景给深色字', S.pickInk(0.95));
ok(S.pickInk(0.05) === '#FFFFFF', '暗背景给白字', S.pickInk(0.05));
ok(S.pickInk(undefined) === '#FFFFFF', '没给亮度时按白字兜底');
ok(Math.abs(S.averageLuminance([[255, 255, 255], [0, 0, 0]]) - 0.5) < 0.001, '平均亮度取中值');
ok(S.averageLuminance([]) === null, '空采样返回 null');

console.log('\n[7] 选项回落与描边');
var unkFont = S.buildPlan({ text: '陈', fontId: 'comic' });
ok(unkFont.text.font.id === 'heavy', '未知字体回落粗黑', unkFont.text.font.id);
var unkPos = S.buildPlan({ text: '陈', posId: 'left' });
ok(unkPos.position.id === 'middle', '未知位置回落中间', unkPos.position.id);
var top = S.buildPlan({ text: '陈', posId: 'top' });
var bot = S.buildPlan({ text: '陈', posId: 'bottom' });
ok(top.box.y < bot.box.y, '上档位置高于下档', top.box.y.toFixed(0) + ' < ' + bot.box.y.toFixed(0));
ok(top.box.y >= 0, '上档不出画布顶部', String(top.box.y));
ok(bot.box.y + bot.box.h <= 1200, '下档不出画布底部', String(bot.box.y + bot.box.h));
var noOut = S.buildPlan({ text: '陈', outline: false });
ok(noOut.text.strokeWidth === 0 && noOut.text.outline === false, '关描边时线宽为 0');
ok(p1.text.strokeWidth === Math.max(2, Math.round(p1.text.size * 0.07)), '描边宽度随字号走',
   p1.text.strokeWidth + ' / ' + p1.text.size);
ok(p1.text.strokeColor.indexOf('rgba') === 0, '描边色是半透明对比色', p1.text.strokeColor);

console.log('\n[8] 自动配色');
var auto = S.buildPlan({ text: '陈', color: 'auto', bgLum: 0.9 });
ok(auto.text.color === '#101014' && auto.text.autoColor === true, '浅背景自动用深色字', auto.text.color);
var autoDark = S.buildPlan({ text: '陈', color: 'auto', bgLum: 0.1 });
ok(autoDark.text.color === '#FFFFFF', '深背景自动用白字');
var bad = S.buildPlan({ text: '陈', color: '#12' });
ok(bad.text.color === '#FFFFFF' && !!bad.warning, '非法颜色回落并提示', bad.warning);
var lowC = S.buildPlan({ text: '陈', color: '#FFFFFF', bgLum: 0.98 });
ok(!!lowC.warning, '白字压白背景会提示', lowC.warning);

console.log('\n[9] 预设与去重');
var fids = S.FONTS.map(function (f) { return f.id; });
ok(new Set(fids).size === fids.length, '字体 id 无重复', fids.join(','));
var cvals = S.COLORS.map(function (c) { return c.value.toUpperCase(); });
ok(new Set(cvals).size === cvals.length, '色板颜色无重复', cvals.join(','));
ok(S.uniqueColors(['#fff', '#FFFFFF', '#000', 'rgb(255,255,255)']).length === 2,
   '重复色只留一次', S.uniqueColors(['#fff', '#FFFFFF', '#000', 'rgb(255,255,255)']).join(','));
ok(S.uniqueColors(['紫色', null, '#fff']).length === 1, '非法色被跳过');
var pids = S.POSITIONS.map(function (p) { return p.id; });
ok(new Set(pids).size === pids.length, '位置 id 无重复');

console.log('\n[10] 绘制数据');
ok(S.flattenChars(p12).length === 12, '逐字数据条数等于字数', String(S.flattenChars(p12).length));
ok(S.flattenChars(null).length === 0, '空计划不崩');
var line0 = p4.text.lines[0];
ok(line0.chars[1].x > line0.chars[0].x, '行内 x 递增');
ok(p4.text.lines[0].chars[0].x >= p4.canvas.w * S.PAD - 1, '首字不贴左边',
   p4.text.lines[0].chars[0].x.toFixed(1));
ok(p4.bgLayers.length >= 6, '示例头像有足够图层', String(p4.bgLayers.length));
ok(p4.bgLayers.every(function (l) { return typeof l.type === 'string'; }), '图层都有类型');
ok(p4.stats.fill > 0.3 && p4.stats.fill <= 0.85, '填充比例合理', String(p4.stats.fill));

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
