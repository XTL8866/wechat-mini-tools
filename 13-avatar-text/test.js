// 逻辑自测：node test.js
var S = require('./miniprogram/core/sticker.js');

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? ' → ' + extra : '')); }
}

console.log('\n[1] 输入校验');
var r0 = S.buildPlan({ text: '' });
ok(!r0.ok && r0.code === 'EMPTY_TEXT', '空文字被拒', r0.code);
var rUndef = S.buildPlan({});
ok(!rUndef.ok && rUndef.code === 'EMPTY_TEXT', '不传文字被拒', rUndef.code);
var rBlank = S.buildPlan({ text: '   \n\u3000 ' });
ok(!rBlank.ok && rBlank.code === 'EMPTY_TEXT', '全空白被拒');
var r13 = S.buildPlan({ text: '一二三四五六七八九十十一二' });
ok(!r13.ok && r13.code === 'TOO_LONG', '13 字被拒', r13.code);
var r12 = S.buildPlan({ text: '一二三四五六七八九十一二' });
ok(r12.ok, '正好 12 字可用', String(r12.ok));
var rZ = S.buildPlan({ text: '中\u200B秋\uFEFF' });
ok(rZ.ok && rZ.stats.chars === 2, '零宽字符被清掉', String(rZ.stats && rZ.stats.chars));
ok(S.normalizeText('  中  秋  ') === '中 秋', '空白归一');
var rEmoji = S.buildPlan({ text: '\u0000\u001F' });
ok(!rEmoji.ok && rEmoji.code === 'EMPTY_TEXT', '纯控制符清完变空');

console.log('\n[2] 断行：均分 + 禁则');
var p1 = S.buildPlan({ text: '陈' });
var p2 = S.buildPlan({ text: '陈乙' });
var p4 = S.buildPlan({ text: '中秋快乐' });
var p6 = S.buildPlan({ text: '一二三四五六' });
var p7 = S.buildPlan({ text: '一二三四五六七' });
var p12 = S.buildPlan({ text: '一二三四五六七八九十一二' });
ok(p1.text.lines.length === 1, '单字一行');
ok(p6.text.lines.length === 1, '6 字仍一行（阈值边界）');
ok(p7.text.lines.length === 2, '7 字断两行', String(p7.text.lines.length));
ok(p12.text.lines.length === 2, '12 字两行');
ok(p12.text.lines[0].text.length === 6 && p12.text.lines[1].text.length === 6,
  '12 字两行均分', p12.text.lines.map(function (l) { return l.text.length; }).join('+'));
ok(p7.text.lines[0].text.length + p7.text.lines[1].text.length === 7, '断行不丢字');
var pComma = S.buildPlan({ text: '一二三四五，六七' });
ok(pComma.text.lines.length === 2, '带逗号的 8 字断两行');
ok(S.HEAD_BAN_TEST !== undefined || pComma.text.lines[1].text.charAt(0) !== '，',
  '标点不落在行首', pComma.text.lines.map(function (l) { return l.text; }).join(' / '));
var pTail = S.buildPlan({ text: '一二三四五「六七」' });
ok(pTail.text.lines[0].text.slice(-1) !== '「', '开引号不落在行尾',
  pTail.text.lines.map(function (l) { return l.text; }).join(' / '));
ok(S.breakLines('一二三四五六七八九十一二').join('|') === '一二三四五六|七八九十一二', 'breakLines 直接可调');
ok(S.breakLines('陈').length === 1, '短串不切');

console.log('\n[3] 字号：字数与档位');
ok(p1.text.size > p2.text.size, '字越少字号越大', p1.text.size + ' vs ' + p2.text.size);
ok(p2.text.size > p4.text.size, '2 字比 4 字大', p2.text.size + ' vs ' + p4.text.size);
ok(p4.text.size >= p12.text.size, '4 字不小于 12 字', p4.text.size + ' vs ' + p12.text.size);
// 用单字比档位：多字时三档都被宽度上限压成同一个字号，比的是错的
var sS = S.buildPlan({ text: '陈', sizeId: 's' });
var sM = S.buildPlan({ text: '陈', sizeId: 'm' });
var sL = S.buildPlan({ text: '陈', sizeId: 'l' });
ok(sS.text.size < sM.text.size && sM.text.size < sL.text.size, '小 < 中 < 大',
  sS.text.size + ' < ' + sM.text.size + ' < ' + sL.text.size);
var unkSize = S.buildPlan({ text: '中秋快乐', sizeId: 'xl' });
ok(unkSize.sizePreset.id === 'm', '未知字号档回落中', unkSize.sizePreset.id);
ok(p12.text.size >= Math.round(1200 * 0.035), '字号不低于下限', String(p12.text.size));

console.log('\n[4] 安全区与位置收敛');
[p1, p2, p4, p6, p7, p12, sL].forEach(function (p) {
  var c = S.check(p);
  ok(c.ok, '「' + p.text.lines.map(function (l) { return l.text; }).join('/') + '」不出安全区',
    c.right + ' / ' + c.limit);
});
ok(p12.box.y >= 0 && p12.box.y + p12.box.h <= 1200, '文字竖直不出画布',
  p12.box.y + '~' + (p12.box.y + p12.box.h));
var topBig = S.buildPlan({ text: '一二三四五六七八九十一二', posId: 'top', sizeId: 'l' });
ok(topBig.box.y >= -1, '上档大字号被夹回画面内', String(topBig.box.y));
// 矮画布 + 两行 + 上档：只有夹取能救，不夹就会把第一行切掉
var clampCase = S.buildPlan({ text: '一二三四五六七', imgW: 400, imgH: 200, posId: 'top', sizeId: 'l' });
ok(clampCase.position.clamped === true && clampCase.box.y >= 0, '空间不够时夹取并标记 clamped',
  clampCase.box.y + ' / ' + clampCase.position.clamped);
ok(clampCase.text.lines.length === 2, '夹取不影响断行', String(clampCase.text.lines.length));
var botBig = S.buildPlan({ text: '一二三四五六七八九十一二', posId: 'bottom', sizeId: 'l' });
ok(botBig.box.y + botBig.box.h <= 1200 + 1, '下档大字号不溢出底部',
  String(botBig.box.y + botBig.box.h));
var mid = S.buildPlan({ text: '陈', posId: 'middle' });
ok(Math.abs(mid.text.lines[0].y - 1200 * 0.5) < 2, '中间档真的在中间', String(mid.text.lines[0].y));
var unkPos = S.buildPlan({ text: '陈', posId: 'left' });
ok(unkPos.position.id === 'middle', '未知位置回落中间', unkPos.position.id);

console.log('\n[5] 画布尺寸');
var big = S.buildPlan({ text: '陈', imgW: 3000, imgH: 4000 });
ok(big.canvas.h === S.MAX_SIDE && big.canvas.w === 1200, '大图压到最长边 1600',
  big.canvas.w + 'x' + big.canvas.h);
ok(big.canvas.scaled === true, '标记已缩放');
var small = S.buildPlan({ text: '陈', imgW: 300, imgH: 400 });
ok(small.canvas.w === 300 && small.canvas.h === 400, '小图不放大');
ok(small.canvas.scaled === false, '小图不算缩放');
var none = S.buildPlan({ text: '陈' });
ok(none.canvas.w === 900 && none.canvas.h === 1200, '不给尺寸按 3:4 兜底');
var wide = S.buildPlan({ text: '陈', imgW: 1600, imgH: 900 });
ok(wide.canvas.w === 1600 && wide.canvas.h === 900, '横图比例保留', wide.canvas.w + 'x' + wide.canvas.h);

console.log('\n[6] 颜色解析');
ok(S.parseColor('#fff').r === 255 && S.parseColor('#fff').b === 255, '#fff 展开正确');
ok(S.parseColor('#A1b2C3').g === 178, '大小写混写可解析', String(S.parseColor('#A1b2C3').g));
ok(S.parseColor('rgb(1, 2, 3)').g === 2, 'rgb() 可解析');
ok(Math.abs(S.parseColor('rgba(0,0,0,0.5)').a - 0.5) < 0.01, 'rgba 透明度可解析');
ok(S.parseColor('rgb(300,-5,0)').r === 255 && S.parseColor('rgb(300,-5,0)').g === 0, '越界值夹到 0-255');
ok(S.parseColor('#12') === null, '长度不对返回 null');
ok(S.parseColor('紫色') === null, '认不出的中文色名返回 null');
ok(S.toHex('#abc') === '#AABBCC', 'toHex 展开简写', S.toHex('#abc'));
ok(S.toHex(S.parseColor('#3D4E6B')) === '#3D4E6B', 'hex → rgb → hex 往返一致');
ok(S.toRgbString('#000000') === 'rgb(0, 0, 0)', 'toRgbString 正常色');
ok(S.toRgbString('rgba(0,0,0,0.4)') === 'rgba(0, 0, 0, 0.4)', 'toRgbString 带透明度');
ok(S.uniqueColors(['#fff', '#FFFFFF', '#000', 'rgb(255,255,255)']).length === 2,
  '重复色只留一次', S.uniqueColors(['#fff', '#FFFFFF', '#000', 'rgb(255,255,255)']).join(','));
ok(S.uniqueColors(['紫色', null, '#fff']).length === 1, '非法色被跳过');

console.log('\n[7] 亮度与自动配色');
ok(Math.abs(S.luminance('#FFFFFF') - 1) < 0.001, '白色亮度为 1');
ok(S.luminance('#000000') === 0, '黑色亮度为 0');
ok(Math.abs(S.contrast('#000000', '#FFFFFF') - 21) < 0.01, '黑白对比度 21:1');
ok(S.contrast('#777777', '#777777') === 1, '同色对比度 1');
ok(S.pickInk(0.95) === '#101014', '亮背景给黑字', S.pickInk(0.95));
ok(S.pickInk(0.05) === '#FFFFFF', '暗背景给白字', S.pickInk(0.05));
ok(Math.abs(S.averageLuminance([[255, 255, 255], [0, 0, 0]]) - 0.5) < 0.001, '平均亮度取中值');
ok(S.averageLuminance([]) === null, '空采样返回 null');

var autoLight = S.buildPlan({ text: '陈', color: 'auto', bgLum: 0.86 });
ok(autoLight.text.color === '#101014' && autoLight.text.autoColor === true, '浅底自动用黑字', autoLight.text.color);
var autoDark = S.buildPlan({ text: '陈', color: 'auto', bgLum: 0.12 });
ok(autoDark.text.color === '#FFFFFF', '深底自动用白字', autoDark.text.color);
ok(autoLight.stats.bgKind === '浅底' && autoDark.stats.bgKind === '深底', '统计里写明浅底/深底',
  autoLight.stats.bgKind + '/' + autoDark.stats.bgKind);
ok(autoLight.stats.contrast > 12, '自动配色后对比度足够', String(autoLight.stats.contrast));
var bad = S.buildPlan({ text: '陈', color: '#12' });
ok(bad.text.color === '#FFFFFF' && !!bad.warning, '非法颜色回落并提示', bad.warning);
var invisible = S.buildPlan({ text: '陈', color: '#FFFFFF', bgLum: 0.97, strokeId: 0 });
ok(/看不见/.test(invisible.warning), '白字压白底且不描边 → 明确提示', invisible.warning);
// 对比度取「字色 / 描边」里更高的那个，否则白字黑描边会被误报成看不清
var edgeLight = S.buildPlan({ text: '中秋快乐', color: '#101014', bgLum: 0.86 });
var edgeStroke = S.buildPlan({ text: '中秋快乐', color: '#FFFFFF', strokeId: 3, bgLum: 0.86 });
var edgeNone = S.buildPlan({ text: '中秋快乐', color: '#FFFFFF', strokeId: 0, bgLum: 0.86 });
ok(edgeLight.stats.edge === '字' && edgeLight.stats.contrast > 12, '黑字压浅底：按字色算',
  edgeLight.stats.contrast + ' ' + edgeLight.stats.edge);
ok(edgeStroke.stats.edge === '描边' && edgeStroke.stats.contrast > 12, '白字加黑描边：按描边算',
  edgeStroke.stats.contrast + ' ' + edgeStroke.stats.edge);
ok(edgeNone.stats.contrast < 2 && edgeNone.stats.contrastPlain === edgeNone.stats.contrast,
  '白字不描边：对比度低且两值一致', String(edgeNone.stats.contrast));

console.log('\n[8] 区域亮度（v2 核心）');
function buf(w, h, rgb) {
  var a = new Uint8ClampedArray(w * h * 4);
  for (var i = 0; i < w * h; i++) {
    a[i * 4] = rgb[0]; a[i * 4 + 1] = rgb[1]; a[i * 4 + 2] = rgb[2]; a[i * 4 + 3] = 255;
  }
  return a;
}
var whiteBuf = buf(40, 40, [255, 255, 255]);
ok(Math.abs(S.regionLuminance(whiteBuf, 40, { x: 0, y: 0, w: 40, h: 40 }, 2) - 1) < 0.001,
  '全白区域亮度 1');
var blackBuf = buf(40, 40, [0, 0, 0]);
ok(S.regionLuminance(blackBuf, 40, { x: 0, y: 0, w: 40, h: 40 }, 2) === 0, '全黑区域亮度 0');
// 上半白下半黑：整图平均 0.5，但只看下半区应该是 0
var mixBuf = new Uint8ClampedArray(40 * 40 * 4);
for (var y = 0; y < 40; y++) {
  var v = y < 20 ? 255 : 0;
  for (var x = 0; x < 40; x++) {
    var i2 = (y * 40 + x) * 4;
    mixBuf[i2] = v; mixBuf[i2 + 1] = v; mixBuf[i2 + 2] = v; mixBuf[i2 + 3] = 255;
  }
}
ok(S.regionLuminance(mixBuf, 40, { x: 0, y: 22, w: 38, h: 16 }, 2) === 0, '只量下半区得到 0（整图平均会是 0.5）');
ok(Math.abs(S.regionLuminance(mixBuf, 40, { x: 0, y: 0, w: 40, h: 40 }, 2) - 0.5) < 0.02,
  '整图采样得到 0.5');
ok(S.regionLuminance(null, 40, { x: 0, y: 0, w: 1, h: 1 }) === null, '没有像素数据返回 null');
ok(S.regionLuminance(whiteBuf, 40, { x: 100, y: 100, w: 10, h: 10 }) === null, '框在画布外返回 null');

console.log('\n[9] 描边与底板');
var noStroke = S.buildPlan({ text: '陈', strokeId: 0 });
var thin = S.buildPlan({ text: '陈', strokeId: 1 });
var thick = S.buildPlan({ text: '陈', strokeId: 3 });
ok(noStroke.text.outline === false && noStroke.text.strokeWidth === 0, '0 档不描边');
ok(thin.text.strokeWidth > 0 && thick.text.strokeWidth > thin.text.strokeWidth, '描边档位递增',
  thin.text.strokeWidth + ' < ' + thick.text.strokeWidth);
ok(p1.text.strokeWidth === Math.max(2, Math.round(p1.text.size * 0.07)), '默认档线宽随字号走',
  p1.text.strokeWidth + ' / ' + p1.text.size);
ok(p1.text.strokeColor.indexOf('rgba') === 0, '描边色是半透明对比色', p1.text.strokeColor);
ok(p1.bar === null, '默认不加底板');
var barP = S.buildPlan({ text: '中秋快乐', bar: true });
ok(!!barP.bar && barP.bar.w > barP.box.w, '底板比文字块宽', barP.bar && (barP.bar.w + ' vs ' + barP.box.w));
ok(barP.bar.x >= 0 && barP.bar.x + barP.bar.w <= barP.canvas.w + 0.5, '底板不横向溢出');
ok(barP.bar.y >= 0 && barP.bar.y + barP.bar.h <= barP.canvas.h + 0.5, '底板不纵向溢出');
ok(barP.bar.fill.indexOf('rgba') === 0, '底板是半透明色', barP.bar.fill);
var barInk = S.buildPlan({ text: '中秋快乐', bar: true, color: '#101014' });
ok(barInk.bar.fill !== barP.bar.fill, '黑字配亮底板，白字配暗底板', barInk.bar.fill);

console.log('\n[10] 预设与绘制数据');
var fids = S.FONTS.map(function (f) { return f.id; });
ok(new Set(fids).size === fids.length, '字体 id 无重复', fids.join(','));
var cvals = S.COLORS.map(function (c) { return c.value.toUpperCase(); });
ok(new Set(cvals).size === cvals.length, '色板颜色无重复', cvals.join(','));
var pids = S.POSITIONS.map(function (p) { return p.id; });
ok(new Set(pids).size === pids.length, '位置 id 无重复');
ok(S.SIZES.length === 3 && S.STROKES.length === 4, '字号 3 档 / 描边 4 档',
  S.SIZES.length + '/' + S.STROKES.length);
ok(S.SAMPLE_KINDS.join(',') === 'light,dark', '两张示例图：浅底 + 深底');
ok(S.samplePhoto('light', 900, 1200).length >= 6, '浅底示例图有足够图层');
ok(S.samplePhoto('dark', 900, 1200).every(function (l) { return typeof l.type === 'string'; }),
  '图层都带类型');
ok(S.flattenChars(p12).length === 12, '逐字数据条数等于字数', String(S.flattenChars(p12).length));
ok(S.flattenChars(null).length === 0, '空计划不崩');
var line0 = p4.text.lines[0];
ok(line0.chars[1].x > line0.chars[0].x, '行内 x 递增');
ok(line0.chars[0].x >= p4.canvas.w * S.PAD - 1, '首字不贴左边', line0.chars[0].x.toFixed(1));
ok(p4.stats.fill > 0.3 && p4.stats.fill <= 0.85, '填充比例合理', String(p4.stats.fill));
ok(S.check(null).ok === false, 'check(null) 不崩');

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
