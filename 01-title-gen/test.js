// 逻辑自测：node test.js
var T = require('./miniprogram/core/titles.js');

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}

console.log('\n[1] 输入校验');
var r0 = T.generate({ topic: '', platform: 'douyin', style: 'viral', count: 3 });
ok(!r0.ok && r0.code === 'EMPTY_TOPIC', '空主题被拒');
var rLong = T.generate({ topic: '这是一个非常非常长而且完全不像主题的描述词汇超过三十个字了吧真的', count: 3 });
ok(!rLong.ok && rLong.code === 'TOPIC_TOO_LONG', '超长主题被拒');
ok(T.normalizeTopic('  保温杯。  ') === '保温杯', '标点与空格被清洗');
ok(T.normalizeTopic('保温杯，') === '保温杯', '尾随逗号被去掉');
ok(T.generate({ topic: '保温杯', count: 3 }).list.length === 3, '默认参数可用');

console.log('\n[2] 抖音 · 爆款 · 3 条');
var r1 = T.generate({ topic: '保温杯', platform: 'douyin', style: 'viral', count: 3 });
ok(r1.ok, '生成成功');
ok(r1.list.length === 3, '3 条', String(r1.list.length));
var ids1 = r1.list.map(function (x) { return x.id; });
ok(new Set(ids1).size === 3, '本轮无重复');
ok(r1.list.every(function (x) { return x.text.indexOf('保温杯') >= 0; }), '每条都含主题');
ok(r1.list.every(function (x) { return x.text.indexOf('{t}') < 0; }), '占位符已全部替换');
r1.list.forEach(function (x, i) { console.log('    ' + (i + 1) + '. ' + x.text + '  [' + x.styleName + ' / ' + x.length + '字]'); });

console.log('\n[3] 小红书 · 走心 · 15 条（不换模板）');
var r2 = T.generate({ topic: '保温杯', platform: 'xhs', style: 'heart', count: 15 });
ok(r2.list.length === 15, '15 条', String(r2.list.length));
ok(new Set(r2.list.map(function (x) { return x.id; })).size === 15, '15 条互不重复');
r2.list.slice(0, 15).forEach(function (x, i) { console.log('    ' + (i + 1) + '. ' + x.text); });

ok(!!r2.warning && r2.warning.indexOf('混入') >= 0, '跨风格补齐有提示', r2.warning || '(无)');

console.log('\n[4] 连续两轮去重');
var a = T.generate({ topic: '无线耳机', platform: 'douyin', style: 'viral', count: 8 });
var b = T.generate({ topic: '无线耳机', platform: 'douyin', style: 'viral', count: 8, exclude: a.usedIds });
var overlap = b.list.filter(function (x) { return a.usedIds.indexOf(x.id) >= 0; });
ok(overlap.length === 0, '第二轮与第一轮无重叠', overlap.map(function(x){return x.id;}).join(','));

console.log('\n[5] 池子用尽降级');
var c = T.generate({ topic: '咖啡', platform: 'douyin', style: 'viral', count: 15, exclude: a.usedIds.concat(b.usedIds) });
ok(c.list.length === 15, '用尽后仍凑满 15 条', String(c.list.length));
ok(new Set(c.list.map(function (x) { return x.id; })).size === 15, '跨风格补齐后仍不重复');
ok(!!c.warning, '给出提示文案', c.warning);
var dyCount = T._templates.douyin.length;
ok(dyCount >= 15, '抖音模板池至少 15 条', String(dyCount));

console.log('\n[6] 平台与风格隔离');
var d = T.generate({ topic: '宠物湿粮', platform: 'xhs', style: 'sell', count: 3 });
ok(d.list[0].style === 'sell', '优先命中目标风格', d.list[0].style);
ok(d.list.every(function (x) { return x.length <= 40; }), '没有异常长的标题');

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
