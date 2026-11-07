/**
 * 音标引擎自测  node test.js
 * 不依赖测试框架，断言失败退出码 1。
 *
 * 重点不是「跑出来什么就当对」：
 * 音节数、重音位置都是从音标现算的，所以对整本词库逐条要求
 * 「音节 ≥1」「重音落在 1..音节数 之间」——这两条不成立说明音标本身写坏了。
 */
const P = require('./miniprogram/core/phonetic.js');

let pass = 0;
const fails = [];

function ok(cond, label, extra) {
  if (cond) pass++;
  else fails.push(label + (extra ? '  → ' + extra : ''));
}
function eq(actual, expect, label) {
  ok(actual === expect, label, '期望 ' + JSON.stringify(expect) + '，实际 ' + JSON.stringify(actual));
}

/* ================= 1. 输入清洗 ================= */

eq(P.normalize('  Apple. '), 'apple', '首尾空格和句号被去掉，转小写');
eq(P.normalize('"Word!"'), 'word', '引号感叹号去掉');
eq(P.normalize(null), '', 'null 归一成空串，不抛异常');
eq(P.normalize('...'), '', '全是标点：归一成空串');
eq(P.normalize("don't"), "don't", '撇号保留（don\'t 是一个词）');

/* ================= 2. 解析：空 / 单条 / 批量 ================= */

eq(P.parseInput('').code, 'EMPTY', '空输入：判 EMPTY');
eq(P.parseInput(null).code, 'EMPTY', 'null 不崩，判 EMPTY');
eq(P.parseInput('  \n\n , ').code, 'EMPTY', '全是空白和逗号：判 EMPTY');
eq(P.parseInput('apple').ok, true, '单个词：放行');
eq(P.parseInput('apple').words.length, 1, '单个词：解析出 1 个');

const p1 = P.parseInput('apple\nschedule\nthorough');
eq(p1.words.length, 3, '三行三个词');
eq(p1.words[1], 'schedule', '顺序保持原样');
eq(P.parseInput('apple, schedule; thorough').words.length, 3, '英文逗号 / 分号也当分隔符');
eq(P.parseInput('apple，schedule、thorough').words.length, 3, '中文逗号和顿号也当分隔符');

/* ================= 3. 去重 ================= */

const p2 = P.parseInput('apple\nApple\napple\nschedule');
eq(p2.words.length, 2, '大小写不同也算重复：只留 2 个');
eq(p2.dropped.dup, 2, '重复计数：丢掉 2 个');
eq(P.parseInput('apple\n\n\nschedule').dropped.empty, 2, '空行计数：两个词之间 2 个空行');

/* ================= 4. 超长 / 超量 / 非英文 ================= */

eq(P.parseInput('a'.repeat(24)).ok, true, '边界：正好 24 个字母放行');
eq(P.parseInput('a'.repeat(25)).code, 'TOO_LONG', '25 个字母：判 TOO_LONG');
eq(P.parseInput('apple\n' + 'b'.repeat(25)).code, 'TOO_LONG', '批次里混一个超长词也拦下');
eq(P.parseInput('你好').code, 'NOT_WORD', '中文：判 NOT_WORD');
eq(P.parseInput('abc123').code, 'NOT_WORD', '字母混数字：判 NOT_WORD');

const many = ['a', 'b', 'c', 'd'].join('\n');
eq(P.parseInput(many, 3).code, 'TOO_MANY', '4 个词、上限 3：判 TOO_MANY');
eq(P.parseInput(many, 3).words.length, 3, 'TOO_MANY 时回传前 3 个');
eq(P.parseInput(many, 12).ok, true, '上限 12 时 4 个词放行');
eq(P.parseInput('a\nb\nc').ok, true, '免费额度 3 个：放行（边界）');

/* ================= 5. 词库条目完整性（逐条） ================= */

let badPos = [], badSyl = [], badStress = [], dupWord = [];
const seen = {};
P.WORDS.forEach(w => {
  const e = P.DICT[w];
  if (!e.pos || !e.mean) badPos.push(w);
  const n = P.syllables(e.uk).length;
  if (n < 1) badSyl.push(w);
  const st = P.stressOf(e.uk);
  if (st.index < 1 || st.index > n) badStress.push(w + ':' + st.index + '/' + n);
  if (seen[w]) dupWord.push(w);
  seen[w] = true;
  if (!e.us) badSyl.push(w + ':us');
});
eq(badPos.length, 0, '词库每条都有词性和释义', badPos.slice(0, 6).join(','));
eq(badSyl.length, 0, '词库每条都能切出音节', badSyl.slice(0, 6).join(','));
eq(badStress.length, 0, '词库每条的重音位置都落在音节范围内', badStress.slice(0, 6).join(','));
eq(dupWord.length, 0, '词库没有重复词条', dupWord.join(','));
ok(P.WORDS.length >= 300, '词库规模 ≥300 条，实际 ' + P.WORDS.length);

/* ================= 6. 音节切分 ================= */

eq(P.syllables('ˈæpl').length, 2, 'apple：词尾 pl 成节，2 个音节');
eq(P.syllables('ˈbɒtl').length, 2, 'bottle：2 个音节');
eq(P.syllables('ˈsʌdn').length, 2, 'sudden：2 个音节');
eq(P.syllables('ˈneɪʃn').length, 2, 'nation：2 个音节');
eq(P.syllables('ˈbjuːtɪfl').length, 3, 'beautiful：3 个音节');
eq(P.syllables('ɪnˈvaɪrənmənt').length, 4, 'environment：4 个音节');
eq(P.syllables('kəmˈpjuːtə').length, 3, 'computer：3 个音节');
eq(P.syllables('ˈkʌntri').length, 2, 'country：2 个音节');
eq(P.syllables('').length, 0, '空音标切出 0 个音节');
eq(P.syllables('ˈʃedjuːl').length, 2, 'schedule（英）：2 个音节');

// 双元音不能被当成两个音节核
eq(P.syllables('haɪ').length, 1, 'aɪ 算一个音节核');
eq(P.syllables('ˈθaʊzənd').length, 2, 'thousand：2 个音节');

/* ================= 7. 重音 ================= */

eq(P.stressOf('ˈæpl').index, 1, 'apple 重音在第 1 个音节');
eq(P.stressOf('ɪnˈvaɪrənmənt').index, 2, 'environment 重音在第 2 个音节');
eq(P.stressOf('kəmˈpjuːtə').index, 2, 'computer 重音在第 2 个音节');
eq(P.stressOf('ˌɪntəˈnæʃnəl').index, 3, 'international 重音在第 3 个音节（主重音优先，不看次重音）');
eq(P.stressOf('ˈkʌmftəbl').index, 1, 'comfortable 重音在第 1 个音节');

/* ================= 8. 查询：命中 ================= */

const e1 = P.lookup('schedule');
eq(e1.ok, true, 'schedule 查得到');
eq(e1.found, true, 'schedule 在词库里');
eq(e1.source, 'dict', 'schedule 来源是词库');
eq(e1.uk, 'ˈʃedjuːl', 'schedule 英式音标');
eq(e1.us, 'ˈskedʒuːl', 'schedule 美式音标');
eq(e1.same, false, 'schedule 英美不同，same=false');
eq(e1.nSyl, 2, 'schedule 2 个音节');
eq(e1.pos, 'n.', 'schedule 词性 n.');
ok(e1.mean.indexOf('日程') === 0, 'schedule 释义以「日程」开头');
eq(P.lookup('APPLE').word, 'apple', '查询前统一小写');
eq(P.lookup('apple').same, true, 'apple 英美相同，same=true');
eq(P.ipaOf(P.lookup('apple'), 'both'), 'ˈæpl', '英美相同时不重复显示两遍');
ok(P.ipaOf(P.lookup('schedule'), 'both').indexOf('/') > 0, '英美不同时两套并排');

/* ================= 9. 查询：错误 ================= */

eq(P.lookup('').code, 'EMPTY', '空词：判 EMPTY');
eq(P.lookup(null).code, 'EMPTY', 'null：判 EMPTY');
eq(P.lookup('a'.repeat(25)).code, 'TOO_LONG', '超长：判 TOO_LONG');
eq(P.lookup('你好').code, 'NOT_WORD', '中文：判 NOT_WORD');

/* ================= 10. 词形还原 ================= */

eq(P.lookup('apples').base, 'apple', 'apples → apple');
ok(P.lookup('apples').form.indexOf('复数') === 0, 'apples 标注复数');
eq(P.lookup('studies').base, 'study', 'studies → study（y 还原）');
eq(P.lookup('studied').base, 'study', 'studied → study');
eq(P.lookup('running').base, 'run', 'running → run（双写辅音）');
eq(P.lookup('stopped').base, 'stop', 'stopped → stop');
eq(P.lookup('making').base, 'make', 'making → make（补回哑 e）');
eq(P.lookup('went').base, 'go', 'went → go（不规则表）');
eq(P.lookup('children').base, 'child', 'children → child');
eq(P.lookup('better').base, 'good', 'better → good');
eq(P.lookup('apples').uk, P.DICT.apple.uk, '变形词返回原形的音标');

/* ================= 11. 词库外：按拼读规则推算 ================= */

const u1 = P.lookup('zorbantic');
eq(u1.ok, true, '词库外的词也返回结果，不报错');
eq(u1.found, false, '词库外的词 found=false');
eq(u1.source, 'rule', '词库外的词 source=rule');
ok(u1.uk.length > 0, '推算音标非空');
eq(u1.uk, P.g2p('zorbantic'), '推算音标与 g2p 一致');
eq(P.g2p('zorbantic'), P.g2p('zorbantic'), 'g2p 是确定性的，两次一致');
eq(P.g2p(''), '', 'g2p 空串返回空串');
ok(P.g2p('make').indexOf('eɪ') >= 0, 'g2p：a_e 读长音 eɪ');
ok(P.g2p('nation').indexOf('ʃn') >= 0, 'g2p：tion 读 ʃn');

/* ================= 12. 拼写建议 ================= */

eq(P.editDistance('apple', 'apple'), 0, '编辑距离：同一个词为 0');
eq(P.editDistance('', 'abc'), 3, '编辑距离：空串对 3 个字母为 3');
eq(P.editDistance('apple', 'aple'), 1, '编辑距离：少一个字母为 1');
const sug = P.suggest('enviroment', 4);
ok(sug.indexOf('environment') === 0, '漏写 n 能推回 environment', sug.join(','));
eq(P.suggest('xkcdqzw', 4).length, 0, '完全不像的词不给建议，不瞎猜');
ok(P.lookup('enviroment').suggest.length > 0, '词库外结果里带建议列表');

/* ================= 13. 批量 ================= */

const b1 = P.batch('apple\nschedule', 3);
eq(b1.ok, true, '批量：两个词放行');
eq(b1.list.length, 2, '批量：出两条结果');
eq(b1.list[1].word, 'schedule', '批量：顺序保持');
eq(P.batch('', 3).code, 'EMPTY', '批量：空输入判 EMPTY');
const b2 = P.batch('apple\nschedule\nthorough\ndeadline', 3);
eq(b2.ok, true, '批量超额：仍返回结果');
eq(b2.list.length, 3, '批量超额：只查前 3 个');
eq(b2.truncated, true, '批量超额：标 truncated');
ok(b2.warning.indexOf('最多查 3') >= 0, '批量超额：给出可弹的提示');

/* ================= 14. 文案与记录 ================= */

const s1 = P.shareText(P.lookup('schedule'));
ok(s1.indexOf('schedule') === 0, '复制文案以单词开头');
ok(s1.indexOf('英') > 0 && s1.indexOf('美') > 0, '英美不同时文案里两套都写');
ok(s1.indexOf('2 个音节') > 0, '文案里带音节数');
eq(P.shareText(null), '', '没有结果时复制文案为空串');
eq(P.shareText(P.lookup('apple')).split('\n')[0], 'apple  ˈæpl', '英美相同时文案只写一套');

let h = [];
h = P.historyAdd(h, { word: 'apple' }, 5);
h = P.historyAdd(h, { word: 'schedule' }, 5);
eq(h.length, 2, '记录：加两条');
eq(h[0].word, 'schedule', '记录：新的排在最前');
h = P.historyAdd(h, { word: 'apple' }, 5);
eq(h.length, 2, '记录：同一个词不重复占位');
eq(h[0].word, 'apple', '记录：重查的词挪到最前');
let hf = [];
for (let i = 0; i < 8; i++) hf = P.historyAdd(hf, { word: 'w' + i }, 5);
eq(hf.length, 5, '记录：超过上限只留 5 条');
eq(hf[0].word, 'w7', '记录：留的是最新的');
eq(P.limitOf(false), 5, '未解锁上限 5');
eq(P.limitOf(true), 60, '解锁后上限 60');
eq(P.removeAt([{ word: 'a' }, { word: 'b' }], 0).length, 1, '删除一条');
eq(P.removeAt([{ word: 'a' }], 9).length, 1, '越界下标不删东西');
eq(P.removeAt(null, 0).length, 0, 'null 列表不崩');

/* ================= 15. 其他常量 ================= */

eq(P.MAX_BATCH, 12, '批量上限 12');
eq(P.FREE_BATCH, 3, '免费额度 3');
eq(P.ACCENTS.length, 3, '三种音标显示方式');
eq(P.SAMPLES.length, 3, '三套示例词');
eq(P.sampleText('daily').split('\n').length, 3, '「常用」示例 3 个词');
eq(P.sampleText('nope'), '', '不存在的示例返回空串');
P.SAMPLES.forEach(s => {
  s.words.forEach(w => ok(!!P.DICT[w], '示例词 ' + w + ' 在词库里'));
});
ok(P.sylText(P.lookup('schedule'), 'uk').indexOf('ˈ') === 0,
  '音节串：重音在第 1 个音节时带前缀 ˈ');
ok(P.sylText(P.lookup('environment'), 'uk').indexOf('ˈ') > 0,
  '音节串：重音在第 2 个音节时不带前缀');
ok(P.sylText(P.lookup('environment'), 'uk').indexOf(' · ') > 0, '音节串用 · 分隔');

/* ================= 汇总 ================= */

console.log('通过 ' + pass + ' 项，失败 ' + fails.length + ' 项');
if (fails.length) {
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
