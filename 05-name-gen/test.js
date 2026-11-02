/**
 * 起名引擎自测  node test.js
 * 不依赖任何测试框架，断言失败直接退出码 1。
 */
const N = require('./miniprogram/core/names.js');

let pass = 0;
const fails = [];

function ok(cond, label, extra) {
  if (cond) {
    pass++;
  } else {
    fails.push(label + (extra ? '  → ' + extra : ''));
  }
}

function eq(actual, expect, label) {
  ok(actual === expect, label, '期望 ' + JSON.stringify(expect) + '，实际 ' + JSON.stringify(actual));
}

// ---------- 1. 姓的规范化 ----------
eq(N.normalizeSurname('  林 '), '林', '姓：去空白');
eq(N.normalizeSurname('欧阳'), '欧阳', '姓：复姓保留两字');
eq(N.normalizeSurname('欧阳锋'), '欧阳', '姓：超过两字截断');
eq(N.normalizeSurname('Lin'), '', '姓：非汉字被剔除');
eq(N.surnameInfo('林').py, 'lín', '姓：拼音');
eq(N.surnameInfo('欧阳').py, 'ōu yáng', '姓：复姓拼音');
eq(N.surnameInfo('查无此姓').py, '', '姓：生僻姓不硬编拼音（返回空）');
eq(N.surnameInfo('').len, 0, '姓：空串长度为 0');

// ---------- 2. 关键词解析 ----------
eq(N.parseKeywords('山 水').length, 2, '关键词：空格分隔');
eq(N.parseKeywords('山，水、光/月').length, 4, '关键词：逗号顿号斜杠都算分隔符');
eq(N.parseKeywords('山 山 水').length, 2, '关键词：去重');
eq(N.parseKeywords('a b c d e f g').length, N.MAX_KEYWORDS, '关键词：最多保留 5 个');
eq(N.parseKeywords('   ').length, 0, '关键词：全空白视为空');
eq(N.parseKeywords('山水').length, 1, '关键词：连写不拆');

// ---------- 3. 空输入与超长 ----------
const noSurname = N.generate({ surname: '', type: 'boy' });
eq(noSurname.ok, false, '空输入：非品牌必须填姓');
eq(noSurname.code, 'EMPTY_SURNAME', '空输入：错误码');
ok(Array.isArray(noSurname.list) && noSurname.list.length === 0, '空输入：不返回结果');

const longKw = N.generate({ surname: '林', type: 'boy', keywords: '山'.repeat(21) });
eq(longKw.ok, false, '超长：关键词 21 字被拒');
eq(longKw.code, 'KEYWORD_TOO_LONG', '超长：关键词错误码');

const justOk = N.generate({ surname: '林', type: 'boy', keywords: '山'.repeat(20), count: 3, seed: 1 });
eq(justOk.ok, true, '边界：关键词正好 20 字可以通过');

const brandNoSurname = N.generate({ type: 'brand', keywords: '山', count: 3, seed: 1 });
eq(brandNoSurname.ok, true, '空输入：品牌类型不需要姓');

// ---------- 4. 条数的边界值 ----------
eq(N.generate({ surname: '林', type: 'boy', count: 0, seed: 1 }).list.length, 1, '边界：count=0 抬到 1');
eq(N.generate({ surname: '林', type: 'boy', seed: 1 }).list.length, 3, '边界：不传 count 默认 3');
eq(N.generate({ surname: '林', type: 'boy', count: 999, seed: 1 }).list.length, N.MAX_COUNT, '边界：count=999 压到 20');

// ---------- 5. 结果结构 ----------
const r = N.generate({ surname: '林', type: 'boy', keywords: '山 水', count: 6, seed: 7 });
eq(r.ok, true, '结构：正常生成');
ok(r.list.length === 6, '结构：要 6 条给 6 条', '实际 ' + r.list.length);

r.list.forEach((x, i) => {
  ok(x.given.length === 2, '结构：名字是两字 [' + i + ']', x.given);
  ok(x.name === '林' + x.given, '结构：全名 = 姓 + 名 [' + i + ']', x.name);
  ok(x.chars[0] !== x.chars[1], '结构：两个字不重复 [' + i + ']', x.given);
  ok(x.meaning.indexOf(x.chars[0]) === 0, '结构：寓意以首字开头 [' + i + ']', x.meaning);
  ok(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(x.pinyin), '结构：拼音带声调 [' + i + ']', x.pinyin);
  ok(x.tonePattern.length === 2 && /^[平仄]{2}$/.test(x.tonePattern), '结构：声调型是平仄两位 [' + i + ']', x.tonePattern);
  ok(x.strokes > 0, '结构：笔画数为正 [' + i + ']', String(x.strokes));
});

// 名字里不能出现姓的字
ok(r.list.every(x => x.chars.indexOf('林') < 0), '结构：名字不含姓的字');

// 同一批不重名
const names = r.list.map(x => x.name);
eq(new Set(names).size, names.length, '去重：同一批不重名');

// ---------- 6. 类型过滤 ----------
const girl = N.generate({ surname: '周', type: 'girl', count: 20, seed: 3 });
const girlChars = girl.list.map(x => x.chars).flat();
ok(girlChars.every(c => { const d = N._char(c); return d.g === 'g' || d.g === 'n'; }),
  '类型：女孩名不含纯男性字');

const boy = N.generate({ surname: '林', type: 'boy', count: 20, seed: 4 });
const boyChars = boy.list.map(x => x.chars).flat();
ok(boyChars.every(c => { const d = N._char(c); return d.g === 'b' || d.g === 'n'; }),
  '类型：男孩名不含纯女性字');

const brand = N.generate({ type: 'brand', count: 8, seed: 5, keywords: '山' });
ok(brand.list.every(x => x.name.length === 2), '类型：品牌名也是两字');
ok(brand.list.every(x => !/[晗媛婉姝娴悦恬瑾瑶珊筠苓菀薇萱芸棠泠汀琴歌音]/.test(x.name)),
  '类型：品牌名不用偏柔美的人名字');

// ---------- 7. 关键词命中 ----------
const kwHit = N.generate({ surname: '林', type: 'boy', keywords: '山', count: 3, seed: 7 });
ok(kwHit.hitChars.length > 0, '关键词：能对上字库里的字', String(kwHit.hitChars.length));
ok(kwHit.list[0].hitChars.length > 0, '关键词：首条一定命中关键词', JSON.stringify(kwHit.list[0].hitChars));

const kwMulti = N.generate({ surname: '林', type: 'boy', keywords: '山水', count: 3, seed: 7 });
ok(kwMulti.hitChars.length > kwHit.hitChars.length, '关键词：连写的「山水」拆开算两组');

const kwNone = N.generate({ surname: '林', type: 'boy', keywords: '编程', count: 3, seed: 7 });
eq(kwNone.ok, true, '关键词：对不上也照常出结果');
ok(kwNone.warning.indexOf('没有对上') >= 0, '关键词：对不上时给出提示', kwNone.warning);

const noKw = N.generate({ surname: '林', type: 'boy', keywords: '', count: 3, seed: 7 });
ok(noKw.warning.indexOf('没填关键词') >= 0, '关键词：空关键词走通用字池并提示');

// ---------- 8. 跨批去重 ----------
const first = N.generate({ surname: '林', type: 'boy', keywords: '山', count: 3, seed: 11 });
const second = N.generate({
  surname: '林', type: 'boy', keywords: '山', count: 3, seed: 12, exclude: first.usedIds
});
const overlap = second.list.filter(x => first.usedIds.indexOf(x.name) >= 0);
eq(overlap.length, 0, '去重：换一批不会重复上一批的名字',
  overlap.map(x => x.name).join(','));

// ---------- 9. 确定性 ----------
const a = N.generate({ surname: '林', type: 'boy', keywords: '山', count: 5, seed: 42 });
const b = N.generate({ surname: '林', type: 'boy', keywords: '山', count: 5, seed: 42 });
eq(a.list.map(x => x.name).join(','), b.list.map(x => x.name).join(','), '确定性：同一个 seed 结果一致');

// ---------- 10. 音韵规则 ----------
eq(N.tonePattern({ t: 4 }, { t: 1 }), '仄平', '声调：4+1 是仄平');
eq(N.tonePattern({ t: 2 }, { t: 3 }), '平仄', '声调：2+3 是平仄');
eq(N.tonePattern({ t: 1 }, { t: 2 }), '平平', '声调：1+2 是平平');
eq(N.plain('lín'), 'lin', '拼音：去声调符号');
eq(N.plain('yǔ'), 'yu', '拼音：上声去符号');

// 三声连读要扣分：两个三声字直接比
const yv = N._char('雨');      // yǔ 3
const yv2 = N._char('屿');     // yǔ 3
const chuan = N._char('川');   // chuān 1
const none = { raw: '', py: '', tone: 0 };

const sanScore = N._score(yv, yv2, { type: 'neutral', hit: {}, surname: none });
const mixScore = N._score(yv, chuan, { type: 'neutral', hit: {}, surname: none });
ok(mixScore > sanScore, '音韵：三声连读比平仄交错得分低',
  sanScore + ' vs ' + mixScore);

const bad = N.generate({ surname: '林', type: 'boy', keywords: '雨屿', count: 1, seed: 1 });
ok(bad.list.length === 1, '音韵：三声组合仍能出结果（只是排后面）');

// 和姓同音要重罚：姓陈（chén）时「晨」被扣 35 分，换成姓周就不扣
const chen = { raw: '陈', py: 'chén', tone: 2 };
const zhou = { raw: '周', py: 'zhōu', tone: 1 };
const chenChar = N._char('晨');
const sChen = N._score(chenChar, chuan, { type: 'neutral', hit: {}, surname: chen });
const sZhou = N._score(chenChar, chuan, { type: 'neutral', hit: {}, surname: zhou });
eq(sZhou - sChen, 35, '音韵：与姓同音扣 35 分');

// 名字里出现姓的那个字，直接重罚 60（用「山」当姓，这个字字库里也有）
const shanSurname = { raw: '山', py: 'shān', tone: 1 };
const sSame = N._score(N._char('山'), chuan, { type: 'neutral', hit: {}, surname: shanSurname });
const sOther = N._score(N._char('森'), chuan, { type: 'neutral', hit: {}, surname: shanSurname });
ok(sOther - sSame >= 55, '音韵：名字用姓的那个字被重罚', (sOther - sSame) + ' 分');

// ---------- 11. 耗尽与兜底 ----------
const drain = N.generate({ surname: '林', type: 'boy', keywords: '山', count: 20, seed: 2 });
eq(drain.list.length, 20, '耗尽：要 20 条仍然给满 20 条');
ok(new Set(drain.list.map(x => x.name)).size === 20, '耗尽：20 条全不重名');

// ---------- 汇总 ----------
console.log('通过 %d 项', pass);
if (fails.length) {
  console.log('\n失败 %d 项：', fails.length);
  fails.forEach(f => console.log('  × ' + f));
  process.exit(1);
} else {
  console.log('全部通过');
}
