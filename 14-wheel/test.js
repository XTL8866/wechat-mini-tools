/**
 * 转盘引擎自测  node test.js
 * 不依赖测试框架，断言失败退出码 1。
 * 角度那部分不是「跑出来什么就当对」——每条都按几何关系反算校验：
 * targetRotation 给出的角度，用 indexAt 回读必须还是同一个扇区。
 */
const W = require('./miniprogram/core/wheel.js');

let pass = 0;
const fails = [];

function ok(cond, label, extra) {
  if (cond) pass++;
  else fails.push(label + (extra ? '  → ' + extra : ''));
}
function eq(actual, expect, label) {
  ok(actual === expect, label, '期望 ' + JSON.stringify(expect) + '，实际 ' + JSON.stringify(actual));
}

/* ================= 1. 选项解析：空输入 / 边界 ================= */

eq(W.parseOptions('').code, 'TOO_FEW', '空输入：判 TOO_FEW');
eq(W.parseOptions(null).code, 'TOO_FEW', 'null 不崩，判 TOO_FEW');
eq(W.parseOptions(undefined).code, 'TOO_FEW', 'undefined 不崩，判 TOO_FEW');
eq(W.parseOptions('   \n\n\t  ').code, 'TOO_FEW', '全是空白：判 TOO_FEW');
eq(W.parseOptions('火锅').code, 'TOO_FEW', '只有一个选项：转不起来');
eq(W.parseOptions('火锅\n烧烤').ok, true, '两个选项：放行（下限）');

const p1 = W.parseOptions('火锅\n烧烤\n日料\n盖饭\n面条\n麻辣烫');
eq(p1.ok, true, '六个选项：放行');
eq(p1.options.length, 6, '六个选项：全部保留');
eq(p1.options[0], '火锅', '顺序保持原样');

/* ================= 2. 分隔符与清洗 ================= */

eq(W.parseOptions('火锅,烧烤,日料').options.length, 3, '英文逗号当分隔符');
eq(W.parseOptions('火锅，烧烤、日料；盖饭').options.length, 4, '中文逗号 / 顿号 / 分号都当分隔符');
eq(W.parseOptions('火锅\t烧烤').options.length, 2, '制表符当分隔符');
eq(W.parseOptions('- 火锅\n* 烧烤\n· 日料').options[0], '火锅', '行首项目符号被去掉');
eq(W.parseOptions('1. 火锅\n2) 烧烤\n3、日料').options.join('|'), '火锅|烧烤|日料', '行首序号被去掉');
eq(W.parseOptions('12点睡\n火锅').options[0], '12点睡', '「12点睡」不会被当成序号切掉');
eq(W.parseOptions('  火  锅  \n烧烤').options[0], '火 锅', '内部空格压成一个，首尾空格去掉');

/* ================= 3. 去重 ================= */

const p2 = W.parseOptions('火锅\n火锅\n烧烤\n火锅');
eq(p2.options.length, 2, '重复项去重：3 个火锅只留 1 个');
eq(p2.dropped.dup, 2, '重复项计数：丢掉 2 个');
eq(W.parseOptions('火锅\n火锅 ').code, 'TOO_FEW', '去重后不足两个：判 TOO_FEW');
eq(W.parseOptions('Hotpot\nhotpot').options.length, 1, '英文大小写不同也算重复');
eq(W.parseOptions('火锅\n\n\n烧烤').dropped.empty, 2, '空行计数：丢掉 2 个空行');

/* ================= 4. 超长 / 超量 ================= */

eq(W.parseOptions('火'.repeat(24) + '\n烧烤').ok, true, '边界：单项正好 24 字放行');
eq(W.parseOptions('火'.repeat(25) + '\n烧烤').code, 'TOO_LONG', '单项 25 字：判 TOO_LONG');
eq(W.parseOptions('火'.repeat(25)).field, 0, '超长项带下标，页面能定位');
eq(W.parseOptions('a\n'.repeat(301)).code, 'TOO_LONG', '整段 602 字：判 TOO_LONG');

const many = Array.from({ length: 13 }, (_, i) => '选项' + i).join('\n');
eq(W.parseOptions(many).code, 'TOO_MANY', '13 个选项：判 TOO_MANY');
eq(W.parseOptions(many).options.length, 12, 'TOO_MANY 时回传前 12 个，便于页面提示');
const twelve = Array.from({ length: 12 }, (_, i) => '选项' + i).join('\n');
eq(W.parseOptions(twelve).ok, true, '边界：正好 12 个放行');

/* ================= 5. 扇区几何 ================= */

eq(W.layout(1), null, '1 个扇区：layout 返回 null');
eq(W.layout(13), null, '13 个扇区：layout 返回 null');
eq(W.layout(6).seg, 60, '六格：每格 60 度');
eq(W.layout(7).segs[6].start, 308.57, '七格：末格起点 308.57');
eq(W.layout(4).segs[0].mid, 45, '四格：首格中心 45 度');
eq(W.layout(12).seg, 30, '十二格：每格 30 度');

// 首尾角度必须闭合，不能因为四舍五入留缝
for (let n = 2; n <= 12; n++) {
  const L = W.layout(n);
  eq(L.segs[n - 1].end, 360, `${n} 格：末格止点正好 360`);
  eq(L.segs[0].start, 0, `${n} 格：首格起点正好 0`);
}

// 相邻不同色（含首尾），7 格是最容易撞色的那个
for (let n = 2; n <= 12; n++) {
  const L = W.layout(n);
  let bad = 0;
  for (let i = 0; i < n; i++) {
    if (L.segs[i].color === L.segs[(i + 1) % n].color) bad++;
  }
  eq(bad, 0, `${n} 格：相邻扇区颜色都不相同`);
}

// 下半圈的标签要翻 180°，上半圈不翻
eq(W.layout(4).segs[0].flip, false, '四格首格（45°）不翻');
eq(W.layout(4).segs[1].flip, true, '四格次格（135°）翻 180');
eq(W.layout(4).segs[2].flip, true, '四格三格（225°）翻 180');
eq(W.layout(4).segs[3].flip, false, '四格末格（315°）不翻');

ok(W.layout(12).fontSize < W.layout(4).fontSize, '扇区越多字号越小');
eq(W.layout(14) === null, true, '越界扇区数不会硬算出负数');

// 亮底写深色字，暗底写白字
eq(W.inkOn('#E8C547'), '#211F1C', '黄底用深色字');
eq(W.inkOn('#FF4D3D'), '#FFFFFF', '红底用白字');
eq(W.inkOn('#4A7FB5'), '#FFFFFF', '蓝底用白字');
eq(W.inkOn('#FFF'), '#211F1C', '三位十六进制也能算亮度');
eq(W.luminance('zzzzzz'), 0, '非法十六进制亮度按 0 处理，不抛异常');
for (let n = 2; n <= 12; n++) {
  const L = W.layout(n);
  ok(L.segs.every(s => s.ink === '#FFFFFF' || s.ink === '#211F1C'), `${n} 格：每格都带字色`);
}

const css = W.conicCss(6);
ok(css.indexOf('conic-gradient') === 0, 'conicCss 输出 conic-gradient');
eq((css.match(/deg/g) || []).length, 12, '六格的 conicCss 有 12 个角度（每格起止各一）');
ok(W.conicCss(1).indexOf('#EDEDF0') > 0, '非法格数给灰色兜底背景');

/* ================= 6. 角度换算：互为逆运算 ================= */

eq(W.norm360(-30), 330, 'norm360(-30) = 330');
eq(W.norm360(725), 5, 'norm360(725) = 5');
eq(W.indexAt(0, 6), 0, '不转时指针压在首格');

for (let n = 2; n <= 12; n++) {
  let bad = [];
  for (let i = 0; i < n; i++) {
    const to = W.targetRotation(0, i, n, 6);
    const back = W.indexAt(to, n);
    if (back !== i) bad.push(i + '→' + back);
  }
  eq(bad.length, 0, `${n} 格：每个扇区转过去再读回来都对得上`, bad.join(','));
}

// 从任意当前角度出发也要对（不是只有从 0 开始才行）
for (let n = 2; n <= 12; n++) {
  let bad = 0;
  for (let c = 0; c < 720; c += 37) {
    for (let i = 0; i < n; i++) {
      if (W.indexAt(W.targetRotation(c, i, n, 0), n) !== i) bad++;
    }
  }
  eq(bad, 0, `${n} 格：任意起始角度都能落到目标扇区`);
}

const t1 = W.targetRotation(0, 3, 6, 6);
ok(t1 > 0 && t1 >= 6 * 360, 'targetRotation 至少空转 6 圈');
eq(t1, 150 + 6 * 360, '六格落在第 4 格（中心 210°）：最终角 150 + 2160');
const t2 = W.targetRotation(5000, 0, 6, 2);
ok(t2 > 5000, 'targetRotation 永远大于当前角，不会倒着转');
eq(W.targetRotation(0, 99, 6, 0) !== undefined, true, '越界 index 不抛异常');
eq(W.indexAt(30, 13), -1, '非法格数：indexAt 返回 -1');

/* ================= 7. 抽签 ================= */

eq(W.pickIndex(4, 0), 0, 'rand=0 取第一个');
eq(W.pickIndex(4, 0.999), 3, 'rand≈1 取最后一个');
eq(W.pickIndex(4, 0.5), 2, 'rand=0.5 取第三个');
eq(W.pickIndex(4, 1), 3, 'rand=1 被夹到末位，不越界');
eq(W.pickIndex(4, -1), 0, 'rand 为负被夹到首位');
eq(W.pickIndex(4, NaN), 0, 'rand 为 NaN 回落到首位');
eq(W.pickIndex(4, () => 0.75), 3, 'rand 传函数也支持');

const state0 = { options: ['火锅', '烧烤', '日料', '盖饭'], rotation: 0 };
const s1 = W.spin(state0, 0.6);
eq(s1.ok, true, 'spin 正常返回');
eq(s1.index, 2, 'rand=0.6 → 第 3 个（日料）');
eq(s1.label, '日料', 'spin 的 label 与下标一致');
eq(s1.landed, true, 'spin 自校验 landed=true');
eq(W.indexAt(s1.to, 4), s1.index, 'spin 的 to 用 indexAt 回读仍是同一个扇区');

const s2 = W.spin({ options: ['火锅', '烧烤'], rotation: s1.to }, 0.1);
ok(s2.from === s1.to, '下一次从上一次停的位置接着转');
ok(s2.to > s2.from, '接着转的角度依然递增');
eq(W.indexAt(s2.to, 2), s2.index, '两格也能对得上');

eq(W.spin({ options: ['火锅'] }, 0.5).code, 'TOO_FEW', '少于两个选项：spin 报 TOO_FEW');
eq(W.spin({ options: [] }, 0.5).code, 'TOO_FEW', '空数组：spin 报 TOO_FEW');
const s3 = W.spin(state0, 0.5);
eq(s3.options, 4, '结果里带选项总数，结果卡要用');

/* ================= 8. 不放回 ================= */

eq(W.poolOf({ options: ['a', 'b', 'c'] }).pool.length, 3, '默认放回：池子全在');
eq(W.poolOf({ options: ['a', 'b', 'c'], noRepeat: true, history: [] }).pool.length, 3,
  '不放回但还没抽：池子全在');

const hist1 = [{ label: 'a', round: 1 }];
const pool1 = W.poolOf({ options: ['a', 'b', 'c'], noRepeat: true, history: hist1, round: 1 });
eq(pool1.pool.join(''), 'bc', '不放回：抽过的 a 从池子里去掉');
eq(pool1.left, 2, '不放回：剩余 2 个');

const hist2 = [{ label: 'a', round: 1 }, { label: 'b', round: 1 }, { label: 'c', round: 1 }];
const pool2 = W.poolOf({ options: ['a', 'b', 'c'], noRepeat: true, history: hist2, round: 1 });
eq(pool2.pool.length, 3, '全抽完：自动开新一轮，池子重置');
eq(pool2.round, 2, '新一轮轮次 +1');

// 上一轮的记录不该挡这一轮的抽签
const pool3 = W.poolOf({
  options: ['a', 'b'], noRepeat: true, round: 2,
  history: [{ label: 'a', round: 1 }, { label: 'b', round: 1 }]
});
eq(pool3.pool.length, 2, '上一轮的记录不影响这一轮');

// 连抽三轮，每轮内不重复
let st = { options: ['甲', '乙', '丙'], rotation: 0, history: [], noRepeat: true, round: 1 };
const seq = [];
for (let i = 0; i < 3; i++) {
  const r = W.spin(st, () => i === 0 ? 0.9 : (i === 1 ? 0.5 : 0.1));
  seq.push(r.label);
  st = {
    options: st.options, rotation: r.to, noRepeat: true, round: r.turn,
    history: W.historyAdd(st.history, { label: r.label, round: r.turn }, 60)
  };
}
eq(new Set(seq).size, 3, '三轮抽出来三个不同的标签');

/* ================= 9. 记录 ================= */

const h0 = W.historyAdd([], { label: '火锅' }, 5);
eq(h0.length, 1, '空列表加一条');
eq(W.historyAdd(h0, { label: '烧烤' }, 5)[0].label, '烧烤', '新记录插在最前面');
let hf = [];
for (let i = 0; i < 8; i++) hf = W.historyAdd(hf, { label: 'x' + i }, 5);
eq(hf.length, 5, '超过上限：只留 5 条');
eq(hf[0].label, 'x7', '留的是最新的 5 条');
eq(W.historyAdd([], { label: 'a' }, 0).length, 1, '上限传 0 回落到默认值，不会清空');
eq(W.limitOf(false), 5, '未解锁上限 5');
eq(W.limitOf(true), 60, '解锁后上限 60');

eq(W.removeAt([{ label: 'a' }, { label: 'b' }], 0).length, 1, '删一条');
eq(W.removeAt([{ label: 'a' }], 9).length, 1, '越界下标不删东西');
eq(W.removeAt(null, 0).length, 0, 'null 列表不崩');

const cnt = W.counts([
  { label: '火锅' }, { label: '烧烤' }, { label: '火锅' }, { label: '火锅' }
]);
eq(cnt[0].label, '火锅', '统计：次数最多的排第一');
eq(cnt[0].n, 3, '统计：火锅 3 次');
eq(cnt.length, 2, '统计：去重后两类');
eq(W.counts([]).length, 0, '空记录统计为空');
eq(W.counts([{ label: '' }]).length, 0, '空标签不计入统计');

/* ================= 10. 输出文本 ================= */

eq(W.shareText({ label: '火锅' }), '转盘选中：火锅', '复制文案：基础格式');
eq(W.shareText({ label: '火锅', turn: 2 }), '转盘选中：火锅（第 2 轮）', '第二轮带轮次');
eq(W.shareText(null), '', '没有结果时复制文案为空串');
eq(W.exportHistory([{ label: 'a', t: '10:30' }, { label: 'b' }]), '1. a  10:30\n2. b',
  '导出记录：带序号和时间');
eq(W.wheelLabel('石头剪刀布', 4), '石头剪刀…', '盘面标签超长截断');
eq(W.wheelLabel('火锅', 4), '火锅', '未超长原样返回');
eq(W.presetText('food').split('\n').length, 5, '「吃什么」预设 5 项');
eq(W.presetOf('nope'), null, '不存在的预设返回 null');
eq(W.PRESETS.length, 4, '四套预设');

/* ================= 汇总 ================= */

console.log('通过 ' + pass + ' 项，失败 ' + fails.length + ' 项');
if (fails.length) {
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
