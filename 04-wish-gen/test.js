// 逻辑自测：node test.js
var W = require('./miniprogram/core/wishes.js');

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}

console.log('\n[1] 名字校验');
var r0 = W.generate({ name: '', scene: 'birthday', tone: 'warm', count: 3 });
ok(!r0.ok && r0.code === 'EMPTY_NAME', '空名字被拒');
var rSpace = W.generate({ name: '   ', count: 3 });
ok(!rSpace.ok && rSpace.code === 'EMPTY_NAME', '纯空格被拒');
var rLong = W.generate({ name: '这是一个非常长的名字肯定超过十二个字了', count: 3 });
ok(!rLong.ok && rLong.code === 'NAME_TOO_LONG', '超长名字被拒');
ok(W.normalizeName('  陈曦。  ') === '陈曦', '标点与首尾空格被清洗');
ok(W.normalizeName('陈  曦') === '陈 曦', '中间连续空格折成一个');
ok(W.normalizeName('陈曦，') === '陈曦', '尾随逗号被去掉');
ok(W.generate({ name: '陈曦' }).list.length === 3, '默认参数可用（3 条）');

console.log('\n[2] 生日 · 温暖 · 3 条');
var r1 = W.generate({ name: '陈曦', scene: 'birthday', tone: 'warm', count: 3 });
ok(r1.ok, '生成成功');
ok(r1.list.length === 3, '3 条', String(r1.list.length));
ok(new Set(r1.list.map(function (x) { return x.id; })).size === 3, '本轮无重复');
ok(r1.list.every(function (x) { return x.hasName && x.text.indexOf('陈曦') >= 0; }), '每条都含名字');
ok(r1.list.every(function (x) { return x.text.indexOf('{n}') < 0; }), '占位符已全部替换');
ok(r1.list.every(function (x) { return x.length === x.text.length; }), '字数统计准确');
r1.list.forEach(function (x, i) {
  console.log('    ' + (i + 1) + '. ' + x.text + '  [' + x.toneName + ' / ' + x.length + '字]');
});

console.log('\n[3] 短信拆条边界');
ok(W.smsParts('') === 1, '空串算 1 条');
var s70 = new Array(71).join('字');           // 70 字
var s71 = new Array(72).join('字');           // 71 字
ok(W.smsParts(s70) === 1, '70 字仍算 1 条');
ok(W.smsParts(s71) === 2, '71 字拆成 2 条', String(W.smsParts(s71)));
ok(W.smsParts(s71 + s71) === 3, '142 字拆成 3 条');

console.log('\n[4] 场景 × 语气 全覆盖');
var allOk = true, minPool = 99, dupId = [];
var seen = {};
W.SCENES.forEach(function (sc) {
  W.TONES.forEach(function (tn) {
    var pool = W._templates[sc.id][tn.id];
    if (!pool || pool.length < 5) allOk = false;
    if (pool) minPool = Math.min(minPool, pool.length);
    (pool || []).forEach(function (t) {
      if (seen[t.id]) dupId.push(t.id);
      seen[t.id] = 1;
    });
  });
});
ok(allOk, '每个场景 × 语气至少 5 条', '最少 ' + minPool + ' 条');
ok(dupId.length === 0, '模板 id 全局唯一', dupId.join(','));
ok(Object.keys(seen).length === 60, '模板总数 60 条', String(Object.keys(seen).length));

console.log('\n[5] 非法参数回退');
var rBadScene = W.generate({ name: '老周', scene: 'xxx', tone: 'yyy', count: 3 });
ok(rBadScene.ok && rBadScene.list[0].scene === 'birthday', '未知场景回退生日');
ok(rBadScene.list[0].tone === 'warm', '未知语气回退温暖');
var rBig = W.generate({ name: '老周', count: 999 });
ok(rBig.list.length === W.MAX_COUNT, 'count 上限 15（等于单场景模板池）', String(rBig.list.length));
var rZero = W.generate({ name: '老周', count: 0 });
ok(rZero.list.length === 1, 'count 下限 1', String(rZero.list.length));
var rNaN = W.generate({ name: '老周', count: 'abc' });
ok(rNaN.list.length === 3, 'count 非数字回退 3', String(rNaN.list.length));

console.log('\n[6] 连续两轮去重');
var a = W.generate({ name: '陈曦', scene: 'newyear', tone: 'funny', count: 3 });
var b = W.generate({ name: '陈曦', scene: 'newyear', tone: 'funny', count: 3, exclude: a.usedIds });
var overlap = b.list.filter(function (x) { return a.usedIds.indexOf(x.id) >= 0; });
ok(overlap.length === 0, '第二轮与第一轮无重叠', overlap.map(function (x) { return x.id; }).join(','));

console.log('\n[7] 池子用尽降级');
var c = W.generate({
  name: '陈曦', scene: 'birthday', tone: 'warm', count: 15,
  exclude: a.usedIds.concat(b.usedIds)
});
ok(c.list.length === 15, '用尽后仍凑满 15 条', String(c.list.length));
ok(new Set(c.list.map(function (x) { return x.id; })).size === 15, '跨语气补齐后仍不重复');
ok(!!c.warning, '给出提示文案', c.warning);
// 补齐时语气标签必须跟着模板走：bd-w / bd-f / bd-j 分别是温暖 / 得体 / 俏皮
var PREFIX = { w: 'warm', f: 'formal', j: 'funny' };
var tagOk = c.list.every(function (x) {
  return PREFIX[x.id.split('-')[1][0]] === x.tone;
});
ok(tagOk, '混入其他语气后标签仍与模板一致', c.list.map(function (x) { return x.id + ':' + x.tone; }).join(' '));
var nameOk = c.list.every(function (x) {
  var want = { warm: '温暖', formal: '得体', funny: '俏皮' }[x.tone];
  return x.toneName === want;
});
ok(nameOk, 'toneName 与 tone 对应');

console.log('\n[8] 场景与语气隔离');
var d = W.generate({ name: '王经理', scene: 'opening', tone: 'formal', count: 3 });
ok(d.list[0].tone === 'formal', '优先命中目标语气', d.list[0].tone);
ok(d.list.every(function (x) { return x.scene === 'opening'; }), '场景没有被串台');
ok(d.list.every(function (x) { return x.text.indexOf('{n}') < 0 && x.text.indexOf('王经理') >= 0; }), '名字替换正确');
ok(d.list.every(function (x) { return x.length <= 60; }), '没有异常长的句子');
d.list.forEach(function (x, i) { console.log('    ' + (i + 1) + '. ' + x.text); });

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
