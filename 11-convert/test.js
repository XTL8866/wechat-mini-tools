/**
 * 单位换算引擎自测  node test.js
 * 不依赖测试框架，断言失败退出码 1。
 *
 * 最有价值的不是「跑通不报错」，而是第 5 组：每个类别的所有单位两两组合，
 * 换过去再换回来必须精确等于原值。系数表里任何一个数抄错、或者某个单位
 * 被写成了「约等于」，这一组立刻挂——因为换算不再自洽。
 * 第 3 组再拿法定定义值硬对一遍，防止「自洽但错」。
 */
const U = require('./miniprogram/core/units.js');

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
function near(actual, expect, label, tol) {
  const t = tol === undefined ? 1e-9 : tol;
  ok(actual !== null && Math.abs(actual - expect) <= t * Math.max(1, Math.abs(expect)), label,
    '期望 ' + expect + '，实际 ' + actual);
}

/* ================= 1. 数据表自检 ================= */

ok(Array.isArray(U.CATS) && U.CATS.length === 6, '六个类别');
const catKeys = U.CATS.map(c => c.key);
eq(new Set(catKeys).size, catKeys.length, '类别 key 不重复');
eq(catKeys.join(','), 'length,mass,area,temperature,pressure,power', '类别顺序固定');

U.CATS.forEach(c => {
  ok(!!c.name && !!c.base, c.key + ' 有中文名和基准单位');
  const keys = c.units.map(u => u.k);
  eq(new Set(keys).size, keys.length, c.key + ' 单位 key 不重复');
  ok(c.units.length >= 3 && c.units.length <= 6, c.key + ' 单位数量 3-6 个（一行放得下）');
  const base = c.units.filter(u => u.k === c.base)[0];
  ok(!!base, c.key + ' 有基准单位 ' + c.base);
  if (base && !c.temp) eq(base.f, 1, c.key + ' 基准单位系数为 1');
  c.units.forEach(u => {
    ok(!!u.name, c.key + '/' + u.k + ' 有中文名');
    if (!c.temp) ok(typeof u.f === 'number' && u.f > 0, c.key + '/' + u.k + ' 系数为正数');
  });
});

eq(U.unitChips('length').length, 6, '长度 6 个单位 chip');
eq(U.unitChips('temperature').length, 3, '温度 3 个单位 chip');
eq(U.unitChips('nope').length, 0, '不存在的类别返回空数组');
eq(U.catOf('mass').base, 'kg', '质量基准是 kg');
eq(U.catOf('nope'), null, '不存在的类别返回 null');
eq(U.unitOf('length', 'zz'), null, '不存在的单位返回 null');
ok(U.isTemp('temperature'), 'temperature 标记为仿射类别');
ok(!U.isTemp('length'), 'length 不是仿射类别');

/* ================= 2. 输入解析：空 / 非法 / 超长 / 边界 ================= */

eq(U.parseInput('').code, 'EMPTY', '空字符串判 EMPTY');
eq(U.parseInput(null).code, 'EMPTY', 'null 不崩，判 EMPTY');
eq(U.parseInput(undefined).code, 'EMPTY', 'undefined 不崩，判 EMPTY');
eq(U.parseInput('   \n , ; ').code, 'EMPTY', '全是空白和分隔符：判 EMPTY');
eq(U.parseInput('abc').code, 'BAD', '非数字判 BAD');
ok(U.parseInput('abc').message.indexOf('不是数字') > 0, '非数字给出可读提示');
eq(U.parseInput('1'.repeat(300)).code, 'LONG', '超长输入判 LONG');
ok(U.parseInput('1'.repeat(200)).code !== 'LONG', '正好 200 字符不判超长');
eq(U.parseInput('1e13').code, 'BAD', '1e13 超过上限');
eq(U.parseInput('-1e13').code, 'BAD', '-1e13 超过上限');
eq(U.parseInput('1e12').ok, true, '1e12 正好在上限');
eq(U.parseInput('12').values[0], 12, '12 解析成 12');
eq(U.parseInput('1.5').values[0], 1.5, '小数正常');
eq(U.parseInput('1e3').values[0], 1000, '科学计数 1e3 解析成 1000');
eq(U.parseInput('0').values[0], 0, '0 是合法数值');
eq(U.parseInput('12 12 12').values.length, 1, '重复数值去重');
eq(U.parseInput('12\n12.0\n1e1', 8).values.join(','), '12,10', '去重后保留首次出现的两个值');
eq(U.parseInput('12,34;56 78', 8).values.join(','), '12,34,56,78', '逗号/分号/空格/换行都能分隔');
eq(U.parseInput('12，34、56', 8).values.join(','), '12,34,56', '中文标点也能分隔');
eq(U.parseInput('−12', 8, 'temperature').values[0], -12, '全角减号认成负数');
eq(U.parseInput('-12', 8, 'length').code, 'BAD', '长度不允许负数');
eq(U.parseInput('-12', 8, 'temperature').ok, true, '温度允许负数');
eq(U.parseInput('0.0001', 8).values[0], 0.0001, '极小值不被吞掉');

/* 上限与截断 */
eq(U.limitOf(false), 1, '免费额度 1 个');
eq(U.limitOf(true), 8, '解锁额度 8 个');
const p8 = U.parseInput('1,2,3,4,5,6,7,8,9,10', 8);
eq(p8.values.length, 8, '超额度截断到 8 个');
ok(p8.warning.indexOf('8') > 0, '截断时给出提示');
eq(U.parseInput('1,2', 1).values.length, 1, '免费只保留第一个');
eq(U.parseInput('1', 1).warning, '', '没超额度不提示');

/* ================= 3. 法定定义值硬对 ================= */

near(U.convert('length', 'in', 'mm', 1), 25.4, '1 in = 25.4 mm（法定）');
near(U.convert('length', 'ft', 'm', 1), 0.3048, '1 ft = 0.3048 m');
near(U.convert('length', 'mm', 'in', 12), 0.47244094488188976, '12 mm = 0.4724 in');
near(U.convert('length', 'km', 'm', 1), 1000, '1 km = 1000 m');
near(U.convert('length', 'm', 'ft', 1), 3.280839895013123, '1 m = 3.2808 ft');
near(U.convert('mass', 'lb', 'kg', 1), 0.45359237, '1 lb = 0.45359237 kg（法定）');
near(U.convert('mass', 'kg', 'lb', 1), 2.2046226218487757, '1 kg = 2.2046 lb');
near(U.convert('mass', 'oz', 'g', 1), 28.349523125, '1 oz = 28.3495 g');
near(U.convert('mass', 't', 'kg', 1), 1000, '1 t = 1000 kg');
near(U.convert('area', 'ha', 'm²', 1), 10000, '1 ha = 10000 m²');
near(U.convert('area', '亩', 'ha', 15), 1, '15 亩 = 1 ha', 1e-12);
near(U.convert('area', 'ft²', 'm²', 1), 0.09290304, '1 ft² = 0.09290304 m²');
near(U.convert('pressure', 'MPa', 'psi', 1), 145.03773773020922, '1 MPa = 145.0377 psi');
near(U.convert('pressure', 'bar', 'MPa', 1), 0.1, '1 bar = 0.1 MPa');
near(U.convert('pressure', 'kgf/cm²', 'bar', 1), 0.980665, '1 kgf/cm² = 0.980665 bar');
near(U.convert('pressure', 'Pa', 'kPa', 1000), 1, '1000 Pa = 1 kPa');
near(U.convert('power', 'hp', 'W', 1), 735.49875, '1 米制马力 = 735.49875 W');
near(U.convert('power', 'kW', 'hp', 1), 1.3596216173039045, '1 kW = 1.3596 hp');
near(U.convert('power', 'kcal/h', 'W', 1), 1.163, '1 kcal/h = 1.163 W');
near(U.convert('power', 'MW', 'kW', 2), 2000, '2 MW = 2000 kW');

/* ================= 4. 温度：仿射换算与绝对零度 ================= */

near(U.convert('temperature', '°C', '°F', 100), 212, '100°C = 212°F');
near(U.convert('temperature', '°C', '°F', 0), 32, '0°C = 32°F');
near(U.convert('temperature', '°C', '°F', -40), -40, '-40°C = -40°F（交点）');
near(U.convert('temperature', '°F', '°C', 98.6), 37, '98.6°F = 37°C');
near(U.convert('temperature', '°C', 'K', 0), 273.15, '0°C = 273.15 K');
near(U.convert('temperature', 'K', '°C', 0), -273.15, '0 K = -273.15°C');
near(U.convert('temperature', 'K', '°F', 0), -459.67, '0 K = -459.67°F');
near(U.convert('temperature', '°F', 'K', 32), 273.15, '32°F = 273.15 K');
near(U.convert('temperature', '°C', '°C', 37), 37, '同单位返回原值');
eq(U.kelvin('temperature', '°C', -273.15), 0, '绝对零度算出来正好 0 K');
eq(U.kelvin('length', 'm', 1), null, '非温度类别不算开尔文');
const pb = U.batch('temperature', '°C', 'K', [-300]);
eq(pb.ok, false, '低于绝对零度被拦');
eq(pb.code, 'PHYS', '绝对零度错码 PHYS');
ok(pb.message.indexOf('绝对零度') > 0, '绝对零度提示可读');
eq(U.batch('temperature', '°C', 'K', [-273.15]).ok, true, '正好绝对零度放行');
eq(U.batch('temperature', '°C', 'K', [-274]).ok, false, '差 1 度也拦');

/* ================= 5. 往返一致性：所有类别所有单位对 ================= */

U.CATS.forEach(c => {
  const ks = c.units.map(u => u.k);
  let bad = 0, cnt = 0;
  ks.forEach(a => {
    ks.forEach(b => {
      if (a === b) return;
      [0.5, 1, 12, 273.15, 1234.5678].forEach(v => {
        const fwd = U.convert(c.key, a, b, v);
        const back = fwd === null ? null : U.convert(c.key, b, a, fwd);
        cnt++;
        if (back === null || Math.abs(back - v) > 1e-9 * Math.max(1, Math.abs(v))) bad++;
      });
    });
  });
  eq(bad, 0, c.key + ' 往返换算全部回到原值（' + cnt + ' 组）');
  ok(cnt > 0, c.key + ' 至少有一组单位对');
});

/* 恒等：任何单位换自己不变 */
U.CATS.forEach(c => {
  c.units.forEach(u => {
    near(U.convert(c.key, u.k, u.k, 7.5), 7.5, c.key + '/' + u.k + ' 换自己是 7.5');
  });
});

/* ================= 6. 比例一致性：a→b 的比值与基准无关 ================= */

const r1 = U.convert('length', 'mm', 'in', 1);
const r2 = U.convert('length', 'cm', 'in', 1);
near(r1 * 10, r2, '10mm 与 1cm 换英寸结果相同（线性）');
near(U.convert('pressure', 'MPa', 'bar', 2.5), 25, '2.5 MPa = 25 bar');
near(U.convert('pressure', 'MPa', 'psi', 2.5), 362.59434432552305, '2.5 MPa = 362.5943 psi');
near(U.convert('length', 'mm', 'ft', 0), 0, '0 换算仍是 0');
near(U.convert('length', 'mm', 'ft', -100), U.convert('length', 'mm', 'ft', 100) * -1, '负数换算是线性外推');

/* ================= 7. 非法参数不抛异常 ================= */

eq(U.convert('nope', 'm', 'ft', 1), null, '未知类别返回 null');
eq(U.convert('length', 'zz', 'ft', 1), null, '未知源单位返回 null');
eq(U.convert('length', 'm', 'zz', 1), null, '未知目标单位返回 null');
eq(U.convert('length', 'm', 'ft', NaN), null, 'NaN 输入返回 null');
eq(U.convert('length', 'm', 'ft', Infinity), null, 'Infinity 返回 null');
eq(U.batch('nope', 'm', 'ft', [1]).ok, false, '批量未知类别失败');
eq(U.batch('length', 'm', 'ft', []).code, 'EMPTY', '批量空数组判 EMPTY');
eq(U.batch('length', 'm', 'ft', null).ok, false, '批量 null 不崩');
eq(U.toBase('length', 'zz', 1), null, 'toBase 未知单位返回 null');
eq(U.fromBase('length', 'zz', 1), null, 'fromBase 未知单位返回 null');
eq(U.table('nope', 'm', 1).length, 0, '未知类别对照表为空');
eq(U.basis('nope', 'm', 'ft'), '', '未知类别依据为空');
eq(U.copyText('nope', 'm', 'ft', [1]), '', '未知类别复制为空');
eq(U.copyText('length', 'm', 'ft', []), '', '空结果复制为空串');

/* ================= 8. 格式化 ================= */

eq(U.fmt(0), '0', '0 显示 0');
eq(U.fmt(1000), '1000', '整数不带小数点');
eq(U.fmt(3.280839895013123), '3.28084', '七位有效数字，去尾零');
eq(U.fmt(145.03773773020922), '145.0377', 'psi 结果七位有效');
eq(U.fmt(0.001), '0.001', '小数不丢前导零');
eq(U.fmt(1e10), '1.0000e+10', '超大数转科学计数');
eq(U.fmt(0.00001), '0.00001', '1e-5 仍用小数写');
eq(U.fmt(0.000012), '0.000012', '1.2e-5 写成 0.000012（千米那一行）');
eq(U.fmt(1e-8), '1.0000e-8', '1e-8 以下才转科学计数');
eq(U.fmt(null), '—', 'null 显示破折号');
eq(U.fmt(NaN), '—', 'NaN 显示破折号');
eq(U.fmt(-40), '-40', '负数正常显示');
eq(U.exact(0.3048), '0.3048', 'exact 保留定义值');
eq(U.exact(2000 / 3).indexOf('666.66') === 0, true, '亩的系数按 2000/3 展开');
eq(U.fmtUnit(25.4, 'mm'), '25.4 mm', '带单位拼装');

/* ================= 9. 对照表 / 依据 / 复制 ================= */

const tb = U.table('length', 'mm', 12);
eq(tb.length, 6, '长度对照表 6 行');
eq(tb.filter(r => r.on).length, 1, '对照表里当前单位标记唯一');
eq(tb.filter(r => r.k === 'mm')[0].text, '12', '对照表里源单位等于原值');
eq(tb.filter(r => r.k === 'in')[0].text, '0.4724409', '12mm 对照表给出英寸');
ok(tb.every(r => !!r.name), '每行都有中文单位名');
eq(U.table('temperature', '°C', 100).filter(r => r.k === '°F')[0].text, '212', '温度对照表 °F 一行');
eq(U.table('temperature', '°C', 100).length, 3, '温度对照表 3 行');

ok(U.basis('length', 'mm', 'in').indexOf('0.0254') > 0, '依据里写出英寸定义值');
ok(U.basis('length', 'm', 'm').indexOf('同一') >= 0 || U.basis('length', 'm', 'm').indexOf('= 1') > 0,
  '同单位依据说明不变');
ok(U.basis('temperature', '°C', '°F').indexOf('9/5') > 0, '温度依据写出公式');
eq(U.basis('length', 'zz', 'm'), '', '未知单位依据为空');

const ct = U.copyText('length', 'mm', 'in', [12]);
eq(ct, '12 mm = 0.4724409 in', '复制文本一行且格式固定');
eq(U.copyText('length', 'mm', 'in', [12, 25.4]).split('\n').length, 2, '两个值复制两行');
ok(U.copyText('pressure', 'MPa', 'psi', [2.5]).indexOf('psi') > 0, '复制文本带目标单位');
ok(U.copyText('length', 'mm', 'in', [12]).split('\n')[0].indexOf('=') > 0, '复制文本含等号');

/* ================= 10. 批量 ================= */

const b = U.batch('length', 'mm', 'in', [12, 25.4, 100]);
eq(b.ok, true, '批量成功');
eq(b.list.length, 3, '批量三行');
near(b.list[0].out, 0.47244094488188976, '批量第一行数值正确');
eq(b.list[1].vText, '25.4', '批量保留原值文本');
eq(b.list[2].outText, '3.937008', '批量第三行文本');
eq(b.list[0].from, 'mm', '批量带回源单位');
ok(U.batch('length', 'mm', 'in', [12]) !== U.batch('length', 'mm', 'in', [12]), '批量每次返回新对象');

/* ================= 汇总 ================= */

console.log('通过 ' + pass + ' 项，失败 ' + fails.length + ' 项');
if (fails.length) {
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
