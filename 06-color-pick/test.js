/**
 * 取色引擎自测  node test.js
 * 不依赖任何测试框架，断言失败直接退出码 1。
 * 像素数据一律用 makePixels 现造，不依赖任何图片文件 —— 测试跑在哪台机器上都一样。
 */
const C = require('./miniprogram/core/color.js');

let pass = 0;
const fails = [];

function ok(cond, label, extra) {
  if (cond) pass++;
  else fails.push(label + (extra ? '  → ' + extra : ''));
}

function eq(actual, expect, label) {
  ok(actual === expect, label,
    '期望 ' + JSON.stringify(expect) + '，实际 ' + JSON.stringify(actual));
}

function near(actual, expect, tol, label) {
  ok(Math.abs(actual - expect) <= tol, label,
    '期望 ' + expect + '±' + tol + '，实际 ' + actual);
}

function makePixels(w, h, fn) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fn(x, y);
      const i = (y * w + x) * 4;
      a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2];
      a[i + 3] = c[3] === undefined ? 255 : c[3];
    }
  }
  return a;
}

// ---------- 1. 空输入与非法输入 ----------
eq(C.parseHex('').code, 'EMPTY', '空串：判 EMPTY');
eq(C.parseHex(null).code, 'EMPTY', 'null：判 EMPTY');
eq(C.parseHex(undefined).code, 'EMPTY', 'undefined：判 EMPTY');
eq(C.parseHex('   ').code, 'EMPTY', '全空白：先 trim 再判 EMPTY');
eq(C.parseHex('#').code, 'BAD_LENGTH', '只有一个 #：位数不对');
eq(C.parseHex('#12345').code, 'BAD_LENGTH', '5 位：位数不对');
eq(C.parseHex('#gggggg').code, 'BAD_HEX', '非十六进制字符：判 BAD_HEX');
eq(C.parseHex('#FF 00 00').code, 'BAD_HEX', '中间夹空格：判 BAD_HEX');
eq(C.parseHex('x'.repeat(40)).code, 'TOO_LONG', '超长 40 字符：先被长度拦下');
eq(C.parseHex('f'.repeat(32)).code, 'BAD_LENGTH', '边界：正好 32 字符不判超长');
eq(C.parseHex('').ok, false, '失败结果带 ok=false');
ok(typeof C.parseHex('').message === 'string' && C.parseHex('').message.length > 0,
  '失败结果带可直接弹 toast 的 message');

// ---------- 2. 合法 hex 的各种写法 ----------
eq(C.parseHex('#FF4D3D').r, 255, '6 位：R');
eq(C.parseHex('#FF4D3D').g, 77, '6 位：G');
eq(C.parseHex('#FF4D3D').b, 61, '6 位：B');
eq(C.parseHex('#FF4D3D').hex, '#FF4D3D', '6 位：hex 原样大写输出');
eq(C.parseHex('#ff4d3d').hex, '#FF4D3D', '小写输入：输出统一大写');
eq(C.parseHex('ff4d3d').hex, '#FF4D3D', '不带 # 也能认');
eq(C.parseHex('0xFF4D3D').hex, '#FF4D3D', '0x 前缀也能认');
eq(C.parseHex('#f00').hex, '#FF0000', '3 位缩写：展开成 6 位');
eq(C.parseHex('#f00').g, 0, '3 位缩写：G=0');
eq(C.parseHex('#FF4D3D80').hex, '#FF4D3D', '8 位（带 alpha）：保留 RGB，丢掉透明度');
eq(C.parseHex('#f00f').hex, '#FF0000', '4 位（带 alpha）：展开 3 位再丢 alpha');
eq(C.parseHex('#000000').hex, '#000000', '边界：纯黑');
eq(C.parseHex('#FFFFFF').hex, '#FFFFFF', '边界：纯白');

// ---------- 3. 多种写法解析 ----------
eq(C.parseColor('rgb(255, 77, 61)').hex, '#FF4D3D', 'rgb() 逗号写法');
eq(C.parseColor('rgb(255 77 61)').hex, '#FF4D3D', 'rgb() 空格写法');
eq(C.parseColor('rgba(255, 77, 61, 0.5)').hex, '#FF4D3D', 'rgba() 忽略 alpha');
eq(C.parseColor('255, 77, 61').hex, '#FF4D3D', '裸逗号三个数字');
eq(C.parseColor('rgb(300, -20, 61)').hex, '#FF003D', 'rgb 越界：300 夹到 255，-20 夹到 0');
eq(C.parseColor('rgb(1,2)').code, 'BAD_RGB', 'rgb 少一个数：报错');
eq(C.parseColor('hsl()').code, 'BAD_HSL', 'hsl 空括号：报错');
ok(/^#[0-9A-F]{6}$/.test(C.parseColor('hsl(6, 98%, 60%)').hex), 'hsl() 正常解析成 hex');
ok(C.distance(C.parseColor('hsl(6, 98%, 60%)'), C.parseHex('#FF4D3D')) < 20,
  'hsl 与等价 hex 的距离足够小');
eq(C.parseColor('hsl(400, 120%, 150%)').hex, '#FFFFFF', 'hsl 越界：h 绕回、s/l 夹到范围内');

// ---------- 4. RGB ↔ HSL ----------
const red = C.rgbToHsl(255, 0, 0);
eq(red.h, 0, '红色：H=0');
eq(red.s, 100, '红色：S=100%');
eq(red.l, 50, '红色：L=50%');
eq(C.rgbToHsl(0, 0, 0).s, 0, '黑色：S=0');
eq(C.rgbToHsl(255, 255, 255).l, 100, '白色：L=100%');
near(C.rgbToHsl(0, 128, 255).h, 210, 1, '天蓝：H≈210');

const back = C.hslToRgb(0, 100, 50);
eq(back.r, 255, 'HSL→RGB：红色 R');
eq(back.g, 0, 'HSL→RGB：红色 G');
eq(back.b, 0, 'HSL→RGB：红色 B');
eq(C.hslToRgb(360, 100, 50).r, C.hslToRgb(0, 100, 50).r, 'H=360 等价于 H=0');
eq(C.hslToRgb(0, 0, 50).r, 128, 'S=0 时退化成灰色');

// 双向往返：三个通道误差不超过 1
[['#FF4D3D', 255, 77, 61], ['#2E3B5E', 46, 59, 94], ['#A4E2C6', 164, 226, 198], ['#101014', 16, 16, 20]]
  .forEach(([hex, r, g, b]) => {
    const h = C.rgbToHsl(r, g, b);
    const c = C.hslToRgb(h.h, h.s, h.l);
    ok(Math.abs(c.r - r) <= 1 && Math.abs(c.g - g) <= 1 && Math.abs(c.b - b) <= 1,
      '往返无损：' + hex, JSON.stringify(c));
  });

// ---------- 5. 三种格式输出 ----------
eq(C.format('#FF4D3D', 'hex'), '#FF4D3D', 'format hex');
eq(C.format('#FF4D3D', 'rgb'), 'rgb(255, 77, 61)', 'format rgb');
eq(C.format('#FF4D3D', 'hsl').indexOf('hsl(') === 0, true, 'format hsl 以 hsl( 开头');
eq(C.format('#FF4D3D', 'hsl'), 'hsl(5, 100%, 62%)', 'format hsl 具体值');
eq(C.format('#FF4D3D', 'nope'), '#FF4D3D', '未知 mode：退回 hex');
eq(C.format('乱写', 'rgb'), '', '非法输入：format 返回空串');
const all = C.allFormats({ r: 255, g: 77, b: 61 });
eq(all.hex, '#FF4D3D', 'allFormats：hex');
eq(all.rgb, 'rgb(255, 77, 61)', 'allFormats：rgb');
eq(all.hsl, C.format('#FF4D3D', 'hsl'), 'allFormats：hsl 与单取一致');

// ---------- 6. 色名与对比度 ----------
eq(C.describe('#FFFFFF').name, '纯白', '色名：纯白');
eq(C.describe('#000000').name, '纯黑', '色名：纯黑');
eq(C.describe('#808080').name, '灰', '色名：灰');
ok(C.describe('#FF4D3D').distance < 45, '色名：#FF4D3D 命中的是邻近色',
  C.describe('#FF4D3D').name + ' / ' + C.describe('#FF4D3D').distance);
eq(C.describe('乱写').name, '', '色名：非法输入给空名字');
eq(C.contrastRatio('#FFFFFF', '#000000'), 21, '对比度：黑白 21:1');eq(C.readableInk('#FFFFFF'), '#101014', '浅底配深字');
eq(C.readableInk('#101014'), '#FFFFFF', '深底配浅字');
ok(C.luminance('#FFFFFF') > C.luminance('#808080'), '亮度：白 > 灰');
ok(C.luminance('#101014') < 0.02, '亮度：近黑接近 0');

// 调子：深浅 + 冷暖
eq(C.tone('#FFFFFF'), '浅色 · 接近无彩', '调子：纯白是无彩浅色');
eq(C.tone('#101014'), '深色 · 冷色', '调子：近黑是深冷');
eq(C.tone('#2D657E'), '中等明度 · 冷色', '调子：深海蓝是中等明度冷色');
eq(C.tone('#E2CBAB'), '浅色 · 暖色', '调子：沙色是浅暖');
eq(C.tone('#FF4D3D'), '中等明度 · 暖色', '调子：亮红是暖色');
eq(C.tone(''), '', '调子：空输入给空串');
ok(C.tone('#5E7E79').indexOf('中性') >= 0 || C.tone('#5E7E79').indexOf('冷') >= 0,
  '调子：青色偏冷或中性', C.tone('#5E7E79'));

// ---------- 7. 取点 ----------
const rainbow = makePixels(4, 4, (x, y) => [x * 60, y * 60, 120]);
const p0 = C.pick(rainbow, 4, 4, 1, 1);
eq(p0.r, 60, '取点：R 取对');
eq(p0.g, 60, '取点：G 取对');
eq(p0.b, 120, '取点：B 取对');
eq(p0.hex, '#3C3C78', '取点：hex 拼对');
eq(C.pick(rainbow, 4, 4, -5, -5).x, 0, '取点：负坐标夹到 0');
eq(C.pick(rainbow, 4, 4, 999, 999).x, 3, '取点：超右边界夹到 w-1');
eq(C.pick(rainbow, 4, 4, 999, 999).y, 3, '取点：超下边界夹到 h-1');
eq(C.pick(rainbow, 4, 4, 1.6, 1.4).x, 2, '取点：小数坐标四舍五入');
eq(C.pick(null, 4, 4, 0, 0).code, 'NO_IMAGE', '取点：没有图片时报 NO_IMAGE');
eq(C.pick(new Uint8ClampedArray(8), 4, 4, 0, 0).code, 'BAD_PIXELS', '取点：像素数据不足时报 BAD_PIXELS');

// ---------- 8. 主色提取 ----------
const twoTone = makePixels(40, 40, (x) => (x < 20 ? [220, 30, 40] : [40, 90, 200]));
const ex2 = C.extract(twoTone, 40, 40, 6);
eq(ex2.length, 2, '主色：两种色就出两种，不硬凑');
ok(ex2[0].ratio > 0.45 && ex2[0].ratio < 0.55, '主色：面积占比约一半', String(ex2[0].ratio));
ok(ex2.every(x => /^#[0-9A-F]{6}$/.test(x.hex)), '主色：每项都带合法 hex');
ok(ex2.every(x => typeof x.name === 'string' && x.name.length > 0), '主色：每项都带色名');

const gradient = makePixels(60, 60, (x, y) => [x * 4, y * 4, 128]);
const exG = C.extract(gradient, 60, 60, 3);
eq(exG.length, 3, '主色：渐变图按要的个数给满');
ok(C.distance(exG[0], exG[1]) >= 26, '主色：相近的色被并掉，不会给三档一样的蓝');

eq(C.extract(null, 10, 10, 3).length, 0, '主色：没有像素返回空数组');
eq(C.extract(new Uint8ClampedArray(10), 10, 10, 3).length, 0, '主色：像素不足返回空数组');
ok(C.extract(gradient, 60, 60, 99).length <= C.PRO_MAIN, '主色：要 99 个也只给上限内');
eq(C.extract(gradient, 60, 60, 0).length, 1, '主色：要 0 个抬到 1');

// 带透明的像素不参与统计
const holed = makePixels(20, 20, (x, y) => (y < 10 ? [255, 0, 0, 0] : [0, 128, 255]));
const exH = C.extract(holed, 20, 20, 6);
eq(exH.length, 1, '主色：全透明那一半被跳过');
ok(exH[0].b > 200, '主色：剩下的是那块蓝', exH[0].hex);

// ---------- 9. 色卡增删 ----------
let pl = [];
eq(C.addToPalette(pl, '').code, 'EMPTY', '色卡：空颜色被拒');
eq(C.addToPalette(pl, '乱写').code, 'EMPTY', '色卡：非法颜色被拒');

let r1 = C.addToPalette(pl, '#FF4D3D', 6);
eq(r1.ok, true, '色卡：正常添加');
eq(r1.list.length, 1, '色卡：加完是 1 张');
eq(r1.item.name.length > 0, true, '色卡：色卡项自带色名');

r1 = C.addToPalette(r1.list, '#ff4d3d', 6);
eq(r1.ok, false, '色卡：同一色再存被拒');
eq(r1.code, 'DUP', '色卡：判重错误码');
eq(r1.list.length, 1, '色卡：重复不增加条数');

const dupList = [{ hex: '#FF0000', r: 255, g: 0, b: 0 }];
eq(C.addToPalette(dupList, '#f00', 6).code, 'DUP', '色卡：#f00 与 #FF0000 算同一个色');
eq(C.addToPalette(dupList, 'rgb(255,0,0)', 6).code, 'DUP', '色卡：rgb 写法也判得出来重复');

// 上限
let full = [];
for (let i = 0; i < 6; i++) {
  full = C.addToPalette(full, C.hexOf(i * 40, 10, 10), 6).list;
}
eq(full.length, 6, '色卡：能存到上限');
const over = C.addToPalette(full, '#00FF00', 6);
eq(over.code, 'FULL', '色卡：满了报 FULL');
eq(over.list.length, 6, '色卡：满了不覆盖也不追加');
eq(C.addToPalette([], '#123456', undefined).ok, true, '色卡：不传上限走默认 6');
eq(C.addToPalette([], '#123456', 999).list.length, 1, '色卡：上限传 999 也不报错');
eq(C.paletteLimit(false), 6, '色卡：免费上限 6');
eq(C.paletteLimit(true), 60, '色卡：解锁上限 60');
eq(C.mainLimit(false), 3, '主色：免费 3 个');
eq(C.mainLimit(true), 6, '主色：解锁 6 个');

// 删除
eq(C.removeFromPalette(full, 0).length, 5, '色卡：删掉一张');
eq(C.removeFromPalette(full, -1).length, 6, '色卡：负下标不动');
eq(C.removeFromPalette(full, 99).length, 6, '色卡：越界下标不动');
eq(C.removeFromPalette(full, 'x').length, 6, '色卡：非数字下标不动');

// ---------- 10. 导出 ----------
eq(C.paletteText([]), '', '导出：空色卡给空串');
const lines = C.paletteText(full).split('\n');
eq(lines.length, 6, '导出：6 张就是 6 行');
ok(lines[0].indexOf('#') > 0, '导出：行内有 hex');
ok(lines[0].indexOf('rgb(') > 0, '导出：行内有 rgb');

// ---------- 汇总 ----------
console.log('通过 %d 项', pass);
if (fails.length) {
  console.log('\n失败 %d 项：', fails.length);
  fails.forEach(f => console.log('  × ' + f));
  process.exit(1);
} else {
  console.log('全部通过');
}
