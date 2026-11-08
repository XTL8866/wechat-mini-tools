/**
 * 公差引擎自测  node test.js
 * 不依赖测试框架，断言失败退出码 1。
 *
 * 最有价值的一条不是「跑通不报错」，而是第 6 组：
 * 孔的偏差是用同名轴按国标换算规则推出来的，所以对每个公差带都要求
 * 「tol === IT 值」——上偏差减下偏差必须正好等于查表得到的公差。
 * 换算规则里的 Δ 一旦漏加，这条立刻挂。
 * 第 7 组拿手册上的现成数值硬对，防止表格抄错一位。
 */
const T = require('./miniprogram/core/tol.js');

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
function near(actual, expect, label) {
  ok(Math.abs(actual - expect) < 1e-9, label, '期望 ' + expect + '，实际 ' + actual);
}

/* ================= 1. 输入解析：空 / 非法 / 超长 ================= */

eq(T.parseInput('').code, 'EMPTY', '空输入判 EMPTY');
eq(T.parseInput(null).code, 'EMPTY', 'null 不崩，判 EMPTY');
eq(T.parseInput('   \n , ;').code, 'EMPTY', '全是空白和分隔符：判 EMPTY');
eq(T.parseInput('abc').code, 'BAD', '非数字判 BAD');
ok(T.parseInput('abc').message.indexOf('不是') > 0, '非数字给出可读提示');
eq(T.parseInput('0').code, 'BAD', '尺寸 0 不合法');
eq(T.parseInput('-5').code, 'BAD', '负数不合法');
eq(T.parseInput('501').code, 'BAD', '超过 500mm 不合法');
eq(T.parseInput('1'.repeat(300)).code, 'LONG', '超长输入判 LONG');
eq(T.parseInput('25').sizes[0], 25, '单个尺寸解析成 25');
eq(T.parseInput('φ25').sizes[0], 25, '带 φ 前缀也能认');
eq(T.parseInput('⌀25.5').sizes[0], 25.5, '带 ⌀ 前缀 + 小数');
eq(T.parseInput('25, 30；40、50', 8).sizes.length, 4, '逗号 分号 顿号都是分隔符');
eq(T.parseInput('25\n25\n25').sizes.length, 1, '重复尺寸去重只留一个');
eq(T.parseInput('25\n25\n30').dropped.dup, 1, '去重计数正确');
eq(T.parseInput('1\n2\n3\n4\n5', 1).sizes.length, 1, '免费额度只放行 1 个');
ok(T.parseInput('1\n2\n3', 1).dropped.over === true, '超额度标记 over');
eq(T.parseInput('1\n2\n3', 8).sizes.length, 3, '解锁后放行 3 个');

/* ================= 2. 尺寸段边界 ================= */

eq(T.bandIndex(3), 0, 'φ3 落在 ≤3 段');
eq(T.bandIndex(3.001), 1, 'φ3.001 跳到 3–6 段');
eq(T.bandIndex(10), 2, 'φ10 落在 6–10 段（右端闭合）');
eq(T.bandIndex(10.001), 3, 'φ10.001 跳到 10–14 段');
eq(T.bandIndex(18), 4, 'φ18 落在细段 14–18 的右端');
eq(T.itValue(18, 7), 18, 'φ18 的 IT7 仍按 10–18 粗段取 18μm');
eq(T.bandIndex(500), 24, 'φ500 是最后一段');
eq(T.bandIndex(500.1), -1, 'φ500.1 越界返回 -1');
eq(T.bandIndex(0), -1, 'φ0 越界');
eq(T.bandText(0), '≤3', '首段文字');
eq(T.bandText(24), '450–500', '末段文字');

/* ================= 3. 标准公差 IT 值 ================= */

eq(T.itValue(25, 7), 21, 'φ25 IT7 = 21μm');
eq(T.itValue(25, 6), 13, 'φ25 IT6 = 13μm');
eq(T.itValue(8, 7), 15, 'φ8 IT7 = 15μm');
eq(T.itValue(160, 7), 40, 'φ160 IT7 = 40μm');
eq(T.itValue(500, 11), 400, 'φ500 IT11 = 400μm');
eq(T.itValue(25, 19), null, 'IT19 不存在返回 null');
eq(T.itValue(600, 7), null, '越界尺寸返回 null');

/* ================= 4. 轴的基本偏差 ================= */

eq(T.fmtMicron(T.shaftDev('g', 6, 25).es), '-7', 'φ25 g6 上偏差 -7');
eq(T.fmtMicron(T.shaftDev('g', 6, 25).ei), '-20', 'φ25 g6 下偏差 -20');
eq(T.fmtMicron(T.shaftDev('h', 6, 25).es), '0', 'φ25 h6 上偏差 0');
eq(T.fmtMicron(T.shaftDev('h', 6, 25).ei), '-13', 'φ25 h6 下偏差 -13');
eq(T.fmtMicron(T.shaftDev('k', 6, 25).ei), '+2', 'φ25 k6 下偏差 +2');
eq(T.fmtMicron(T.shaftDev('k', 6, 25).es), '+15', 'φ25 k6 上偏差 +15');
eq(T.fmtMicron(T.shaftDev('n', 6, 25).ei), '+15', 'φ25 n6 下偏差 +15');
eq(T.fmtMicron(T.shaftDev('p', 6, 25).ei), '+22', 'φ25 p6 下偏差 +22');
eq(T.fmtMicron(T.shaftDev('s', 6, 25).ei), '+35', 'φ25 s6 下偏差 +35');
eq(T.fmtMicron(T.shaftDev('r', 6, 25).ei), '+28', 'φ25 r6 下偏差 +28');
eq(T.fmtMicron(T.shaftDev('f', 7, 25).es), '-20', 'φ25 f7 上偏差 -20');
eq(T.fmtMicron(T.shaftDev('js', 6, 25).es), '+6.5', 'φ25 js6 取 ±IT/2');
eq(T.fmtMicron(T.shaftDev('js', 6, 25).ei), '-6.5', 'φ25 js6 下偏差对称');
eq(T.fmtMicron(T.shaftDev('k', 9, 25).ei), '0', 'k 在 IT9 时贴零线（ei=0）');
eq(T.fmtMicron(T.shaftDev('c', 11, 25).es), '-110', 'φ25 c11 上偏差 -110');

/* ================= 5. 孔由轴换算 + Δ 修正 ================= */

eq(T.fmtMicron(T.holeDev('H', 7, 25).es), '+21', 'φ25 H7 上偏差 +21');
eq(T.fmtMicron(T.holeDev('H', 7, 25).ei), '0', 'φ25 H7 下偏差 0');
eq(T.fmtMicron(T.holeDev('K', 7, 25).es), '+6', 'φ25 K7 上偏差 +6（含 Δ=8）');
eq(T.fmtMicron(T.holeDev('K', 7, 25).ei), '-15', 'φ25 K7 下偏差 -15');
eq(T.fmtMicron(T.holeDev('M', 7, 25).es), '0', 'φ25 M7 上偏差 0');
eq(T.fmtMicron(T.holeDev('N', 7, 25).es), '-7', 'φ25 N7 上偏差 -7');
eq(T.fmtMicron(T.holeDev('P', 7, 25).es), '-14', 'φ25 P7 上偏差 -14');
eq(T.fmtMicron(T.holeDev('R', 7, 25).es), '-20', 'φ25 R7 上偏差 -20');
eq(T.fmtMicron(T.holeDev('S', 7, 25).es), '-27', 'φ25 S7 上偏差 -27');
eq(T.fmtMicron(T.holeDev('D', 7, 25).es), '+86', 'φ25 D7 上偏差 +86（EI=-es=+65）');
eq(T.fmtMicron(T.holeDev('D', 7, 25).ei), '+65', 'φ25 D7 下偏差 +65');
eq(T.fmtMicron(T.holeDev('D', 7, 12).ei), '+50', 'φ12 D7 下偏差 +50（10–18 段）');
eq(T.fmtMicron(T.holeDev('F', 8, 25).es), '+53', 'φ25 F8 上偏差 +53');
eq(T.fmtMicron(T.holeDev('G', 7, 25).es), '+28', 'φ25 G7 上偏差 +28');

// Δ 修正只在规定等级内加：P8 已经超过 IT7，不该再加
near(T.holeDev('P', 8, 25).es, -22, 'φ25 P8 不再加 Δ（等级 >IT7）');

/* ================= 6. 一致性：偏差差 = 公差 ================= */

T.HOLE_CODES.forEach(function (c) {
  [6, 7, 8, 9, 11].forEach(function (g) {
    [3, 10, 25, 60, 160, 400].forEach(function (d) {
      const dv = T.holeDev(c, g, d);
      const it = T.itValue(d, g);
      ok(dv && Math.abs((dv.es - dv.ei) - it) < 1e-9,
        '孔 ' + c + g + ' ⌀' + d + ' 的 ES-EI 必须等于 IT');
    });
  });
});

T.SHAFT_CODES.forEach(function (c) {
  [6, 7, 9].forEach(function (g) {
    [3, 10, 25, 60, 160, 400].forEach(function (d) {
      const dv = T.shaftDev(c, g, d);
      const it = T.itValue(d, g);
      ok(dv && Math.abs((dv.es - dv.ei) - it) < 1e-9,
        '轴 ' + c + g + ' ⌀' + d + ' 的 es-ei 必须等于 IT');
    });
  });
});

// 极限尺寸必须和偏差对得上
const L25 = T.limits(25, 'H7');
near(L25.max, 25.021, 'φ25 H7 最大极限尺寸 25.021');
near(L25.min, 25.000, 'φ25 H7 最小极限尺寸 25.000');
near(L25.tol, 21, 'φ25 H7 公差 21μm');

/* ================= 7. 配合：间隙 / 过渡 / 过盈 ================= */

const c1 = T.fit(25, 'H7', 'g6');
eq(c1.type, 'clearance', 'φ25 H7/g6 是间隙配合');
near(c1.xmin, 7, 'φ25 H7/g6 最小间隙 7μm');
near(c1.xmax, 41, 'φ25 H7/g6 最大间隙 41μm');
near(c1.tf, 34, 'φ25 H7/g6 配合公差 = 21+13');

const c2 = T.fit(25, 'H7', 'k6');
eq(c2.type, 'transition', 'φ25 H7/k6 是过渡配合');
near(c2.xmax, 19, 'φ25 H7/k6 最大间隙 19μm');
near(c2.maxInterference, 15, 'φ25 H7/k6 最大过盈 15μm');

const c3 = T.fit(25, 'H7', 's6');
eq(c3.type, 'interference', 'φ25 H7/s6 是过盈配合');
near(c3.maxInterference, 48, 'φ25 H7/s6 最大过盈 48μm');
eq(c3.maxClearance, 0, '过盈配合没有间隙');

const c4 = T.fit(25, 'H7', 'h6');
eq(c4.type, 'clearance', 'φ25 H7/h6 是间隙配合');
near(c4.xmin, 0, 'φ25 H7/h6 最小间隙 0');

const c5 = T.fit(50, 'H8', 'f7');
eq(c5.type, 'clearance', 'φ50 H8/f7 是间隙配合');
near(c5.xmax, 89, 'φ50 H8/f7 最大间隙 = 39+50');

// 方向写反要拦住
ok(T.fit(25, 'g6', 'H7').ok === false, '孔写小写 / 轴写大写：拒绝');

/* ================= 8. 公差带写法 ================= */

eq(T.parseSpec('H7').kind, 'hole', 'H7 是孔');
eq(T.parseSpec('g6').kind, 'shaft', 'g6 是轴');
eq(T.parseSpec('H7').grade, 7, 'H7 等级 7');
eq(T.parseSpec(' js6 ').code, 'js', '容忍首尾空格');
eq(T.parseSpec('X7').ok, false, 'X7 代号不支持');
eq(T.parseSpec('H19').ok, false, 'H19 等级超范围');
eq(T.parseSpec('7H').ok, false, '写反顺序不认');
eq(T.parseSpec('').ok, false, '空字符串不认');

/* ================= 9. 批量 ================= */

const b = T.batch('25\n40\n60', 'H7', 'g6', 8);
eq(b.ok, true, '批量三个尺寸放行');
eq(b.list.length, 3, '批量出三条结果');
eq(b.list[1].size, 40, '第二条是 φ40');
ok(b.list.every(r => r.type === 'clearance'), '同一组配合每条都是间隙配合');

const b2 = T.batch('', 'H7', 'g6', 8);
eq(b2.ok, false, '空输入批量失败');

const b3 = T.batch('25\nabc', 'H7', 'g6', 8);
eq(b3.ok, false, '有一条非法就整体失败，不静默丢掉');

/* ================= 10. 文本输出 ================= */

eq(T.fmtMicron(0), '0', '零偏差显示 0');
eq(T.fmtMicron(21), '+21', '正偏差带上 +');
eq(T.fmtMicron(-7), '-7', '负偏差带 -');
eq(T.fmtMicron(10.5), '+10.5', '半个微米保留一位小数');
eq(T.fmtMm(21), '+0.021', 'μm 转 mm 三位小数');
eq(T.fmtMm(-7), '-0.007', '负值转 mm');
eq(T.fmtRange(24.98, 24.993), '24.980–24.993', '极限尺寸补满三位小数');
eq(T.fmtRange(25, 25.021), '25.000–25.021', '整尺寸也要补到三位小数');
eq(T.bandCoarse(25), '18–30', '⌀25 的公差段按粗段报 18–30');
eq(T.bandCoarse(25.5), '18–30', '⌀25.5 同在 18–30 粗段');
eq(T.bandCoarse(500), '400–500', '⌀500 落在末段');
ok(T.copyText(c1).indexOf('φ') < 0 && T.copyText(c1).indexOf('⌀25') === 0,
  '复制文本以 ⌀25 开头');
ok(T.copyText(c1).split('\n').length === 5, '复制文本五行');
ok(T.copyText(c1).indexOf('间隙') > 0, '复制文本里有配合结论');
ok(T.copyBatch(b.list).indexOf('⌀40') > 0, '批量复制包含 φ40 那一行');
eq(T.copyText(null), '', '空结果复制返回空串');

/* ================= 11. 界面依赖的常量 ================= */

eq(T.HOLE_CHIPS.length, 6, '孔 chip 六个，一行放得下');
eq(T.SHAFT_CHIPS.length, 7, '轴 chip 七个');
T.HOLE_CHIPS.forEach(s => ok(T.limits(25, s).ok, '孔 chip ' + s + ' 在 φ25 算得出'));
T.SHAFT_CHIPS.forEach(s => ok(T.limits(25, s).ok, '轴 chip ' + s + ' 在 φ25 算得出'));
eq(T.limitOf(false), 1, '免费状态只能查 1 个尺寸');
eq(T.limitOf(true), 8, '解锁后能查 8 个尺寸');
eq(T.SAMPLES.length, 4, '四个示例尺寸');

/* ================= 汇总 ================= */

console.log('通过 ' + pass + ' 项，失败 ' + fails.length + ' 项');
if (fails.length) {
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
