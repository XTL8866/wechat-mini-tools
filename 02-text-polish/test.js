// 逻辑自测：node test.js
var P = require('./miniprogram/core/polish.js');

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}

var SRC = '其实我觉得这个工具基本上挺好用的，我个人觉得它能够对流程进行优化，' +
          '在成本的情况下也比较好，说实话非常非常值得试试。';

console.log('\n[1] 输入校验');
var r0 = P.polish('', 'tight');
ok(!r0.ok && r0.code === 'EMPTY', '空输入被拒', JSON.stringify(r0));
var rBlank = P.polish('   \n\u3000  ', 'tight');
ok(!rBlank.ok && rBlank.code === 'EMPTY', '全空白被拒');
var over = new Array(P.MAX_LEN + 2).join('字');
var rLong = P.polish(over, 'tight');
ok(!rLong.ok && rLong.code === 'TOO_LONG', '超长被拒', String(over.length));
var edge = P.polish(new Array(P.MAX_LEN + 1).join('字'), 'tight');
ok(edge.ok, '正好 ' + P.MAX_LEN + ' 字仍可处理', String(P.MAX_LEN));
ok(P.normalize('  你好\u3000世界  ') === '你好 世界', '全角空格被归一');
ok(P.countChars('你好 ab\n') === 4, '字数不含空白', String(P.countChars('你好 ab\n')));
ok(P.splitSentences('一。二！三？').length === 3, '断句正确');

console.log('\n[2] 精简');
var a = P.polish(SRC, 'tight');
ok(a.ok, '精简成功');
ok(a.after.chars < a.before.chars, '字数变少', a.before.chars + '→' + a.after.chars);
ok(a.text.indexOf('其实') < 0, '填充词「其实」被删');
ok(a.text.indexOf('对流程进行优化') < 0 && a.text.indexOf('优化流程') >= 0, '「对X进行Y」压成「YX」', a.text);
ok(a.text.indexOf('能够') < 0, '「能够」压成「能」');
ok(a.text.indexOf('非常非常') < 0, '重复形容词被合并');
ok(a.text.indexOf('。。') < 0 && a.text.indexOf('，，') < 0, '标点没有残渣');
console.log('    ' + a.text);

var b = P.polish('今天下雨。', 'tight');
ok(b.ok && !!b.warning, '已紧凑文本给出提示', b.warning);
ok(b.after.chars <= b.before.chars, '不会把文本改长');

console.log('\n[3] 扩写');
var c = P.polish('这个工具很好用。它能省时间。', 'expand');
ok(c.after.chars > c.before.chars * 1.4, '篇幅明显变长', c.before.chars + '→' + c.after.chars);
ok(c.text.indexOf('{kw}') < 0, '模板占位符已替换');
ok(c.after.sentences > c.before.sentences, '句子数增加', c.before.sentences + '→' + c.after.sentences);
var c2 = P.polish('这个工具很好用。它能省时间。', 'expand');
ok(c2.text === c.text, '同输入结果稳定（确定性）');
ok(c.text.indexOf('同时') >= 0 || c.text.indexOf('换句话说') >= 0, '补上了连接词');
console.log('    ' + c.text);

var big = P.polish(new Array(60).join('这个工具很好用。'), 'expand');
ok(big.ok && big.after.chars <= P.MAX_EXPAND + 60, '接近上限时不再注水',
   String(big.after.chars));

console.log('\n[4] 口语转书面');
var d = P.polish('我觉得这个东西挺好的，你试试就知道了，真的挺好！', 'formal');
ok(d.text.indexOf('我觉得') < 0 && d.text.indexOf('笔者认为') >= 0, '「我觉得」→「笔者认为」', d.text);
ok(d.text.indexOf('这个东西') < 0 && d.text.indexOf('该事物') >= 0, '「这个东西」→「该事物」');
ok(d.text.indexOf('！') < 0, '感叹号转句号');
var d2 = P.polish('咱们走吧，这个东西真不错呢。', 'formal');
ok(d2.text.indexOf('吧') < 0 && d2.text.indexOf('呢') < 0, '句末语气词被删', d2.text);
var d3 = P.polish('晚上去酒吧。', 'formal');
ok(d3.text.indexOf('酒') >= 0, '「酒吧」不会被误删成「酒」', d3.text);
console.log('    ' + d.text);

console.log('\n[5] 改写降重');
var e1 = P.polish('我们需要提高效率，因为目前的方法效果不好，需要重新选择。', 'rewrite', { seed: 1 });
var e2 = P.polish('我们需要提高效率，因为目前的方法效果不好，需要重新选择。', 'rewrite', { seed: 1 });
var e3 = P.polish('我们需要提高效率，因为目前的方法效果不好，需要重新选择。', 'rewrite', { seed: 7 });
ok(e1.ok && e1.text !== '我们需要提高效率，因为目前的方法效果不好，需要重新选择。', '输出与原文不同');
ok(e1.text === e2.text, '同种子可复现');
ok(e1.text !== e3.text, '换种子结果不同');
ok(e1.after.sentences === e1.before.sentences, '句子数不变', e1.before.sentences + '→' + e1.after.sentences);
var synHit = e1.changes.filter(function (x) { return x.type === 'syn'; });
var froms = synHit.map(function (x) { return x.from; });
ok(new Set(froms).size === froms.length, '同一词条只用一次（去重）', froms.join(','));
console.log('    ' + e1.text);

console.log('\n[6] 模式与异常');
ok(P.polish('随便一段话。', 'unknown-mode').mode === 'tight', '未知模式回落精简');
ok(P.polish('x', 'rewrite', { seed: -3 }).ok, '非法种子不崩');
ok(P.polish('一段话，没有换行。', 'expand').changes.length > 0, '扩写有改动记录');
var f = P.polish(SRC, 'formal');
ok(f.changes.length > 0 && f.changes.length <= 8, '改动清单最多 8 条展示', String(f.changes.length));

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
