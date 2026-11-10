/**
 * 金额大写引擎自测  node test.js
 * 不依赖测试框架，断言失败退出码 1。
 *
 * 这份测试的重点不是「跑通不报错」，是三条最容易出错、又最不容易被发现的地方：
 *  第 3 组 —— 零的处理。101 / 1005 / 100500 / 100000001 四个位置各查一遍，
 *             多一个零少一个零，人眼扫过去都像对的，只能一条条钉死。
 *  第 4 组 —— 角分。0.05 写成「零元伍分」金额就差了十倍，这类错最贵。
 *  第 6 组 —— 不变量。0–9999 全量跑：不含「零零」、不以「零」结尾、
 *             大写里数字的顺序必须和小写去掉 0 之后一模一样。
 *             规则实现对不对，靠这一组兜底，不靠人肉枚举。
 */
const R = require('./miniprogram/core/rmb.js');

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

/** 元为单位的数 → 大写，省得每行都写 *100 */
function up(yuan) {
  return R.centsToUpper(Math.round(yuan * 100));
}

/* ================= 1. 常量与字表 ================= */

eq(R.DIGIT.length, 10, '大写数字 10 个');
eq(R.DIGIT.join(''), '零壹贰叁肆伍陆柒捌玖', '大写数字字表与票据规范一致');
ok(R.DIGIT.indexOf('柒') > 0 && R.DIGIT.indexOf('漆') < 0, '用「柒」不用「漆」');
eq(R.MAX_CENTS, 99999999999999, '上限 = 9999 亿元 - 1 分');
eq(R.FREE_COUNT, 1, '免费一次 1 笔');
eq(R.MAX_COUNT, 8, '解锁后一次 8 笔');
eq(R.limitOf(false), 1, '未解锁上限 1');
eq(R.limitOf(true), 8, '已解锁上限 8');

/* ================= 2. 输入解析：空 / 非法 / 超长 / 边界 ================= */

eq(R.parseAmount('').code, 'EMPTY', '空字符串判 EMPTY');
eq(R.parseAmount(null).code, 'EMPTY', 'null 不崩，判 EMPTY');
eq(R.parseAmount(undefined).code, 'EMPTY', 'undefined 不崩，判 EMPTY');
eq(R.parseAmount('   ').code, 'EMPTY', '纯空白判 EMPTY');
eq(R.parseAmount('￥ , 元').code, 'EMPTY', '只有货币符号和单位判 EMPTY');
eq(R.parseAmount('abc').code, 'BAD', '非数字判 BAD');
ok(R.parseAmount('12.3.4').code === 'BAD', '两个小数点判 BAD');
ok(R.parseAmount('1.2a').message.indexOf('不是金额') > 0, '非法输入给出可读提示');
eq(R.parseAmount('1'.repeat(41)).code, 'LONG', '超长输入判 LONG');
ok(R.parseAmount('1'.repeat(40)).code !== 'LONG', '正好 40 字符不判超长');
eq(R.parseAmount('-1').code, 'NEG', '负数判 NEG');
eq(R.parseAmount('−1').code, 'NEG', '全角负号也判 NEG');
eq(R.parseAmount('1234567890123').code, 'BIG', '超过 9999 亿判 BIG');

eq(R.parseAmount('1234.56').cents, 123456, '1234.56 解析成 123456 分');
eq(R.parseAmount('1,234.56').cents, 123456, '千分位逗号被忽略');
eq(R.parseAmount('￥1,234.56').cents, 123456, '货币符号被忽略');
eq(R.parseAmount('1234.56元').cents, 123456, '结尾的「元」被忽略');
eq(R.parseAmount(' 12 ').cents, 1200, '前后空格被忽略');
eq(R.parseAmount('.5').cents, 50, '只有小数部分 .5 解析成 50 分');
eq(R.parseAmount('1234').cents, 123400, '整数解析为整百分');
eq(R.parseAmount('1234.5').cents, 123450, '一位小数补成整百分');
eq(R.parseAmount('1234.567').cents, 123457, '三位小数四舍五入到分');
ok(R.parseAmount('1234.567').warning.indexOf('四舍五入') > 0, '三位小数给四舍五入提示');
eq(R.parseAmount('1234.56').warning, '', '两位小数不提示');
eq(R.parseAmount('0').cents, 0, '0 是合法金额');
eq(R.parseAmount('999999999999.99').cents, 99999999999999, '上限金额正好通过');
eq(R.parseAmount('1234.56').text, '1,234.56', '解析结果同时给出小写核对串');

/* ================= 3. 零的位置（最容易写错的一组） ================= */

eq(up(0), '零元整', '0 → 零元整');
eq(up(1), '壹元整', '1');
eq(up(10), '壹拾元整', '10 写「壹拾」不写「拾」');
eq(up(15), '壹拾伍元整', '15');
eq(up(20), '贰拾元整', '20');
eq(up(100), '壹佰元整', '100');
eq(up(101), '壹佰零壹元整', '101 中间补零');
eq(up(110), '壹佰壹拾元整', '110 结尾不补零');
eq(up(1000), '壹仟元整', '1000');
eq(up(1005), '壹仟零伍元整', '1005 三个零只读一个');
eq(up(1050), '壹仟零伍拾元整', '1050');
eq(up(1500), '壹仟伍佰元整', '1500');
eq(up(10000), '壹万元整', '10000');
eq(up(10001), '壹万零壹元整', '10001');
eq(up(10010), '壹万零壹拾元整', '10010');
eq(up(10100), '壹万零壹佰元整', '10100');
eq(up(11000), '壹万壹仟元整', '11000');
eq(up(100000), '壹拾万元整', '100000 是「壹拾万」不是「拾万」');
eq(up(100500), '壹拾万零伍佰元整', '100500 万级尾零不读，个级补一个零');
eq(up(1005000), '壹佰万零伍仟元整', '1005000');
eq(up(1000000), '壹佰万元整', '1000000');
eq(up(1000001), '壹佰万零壹元整', '1000001');
eq(up(10000000), '壹仟万元整', '10000000');
eq(up(100000000), '壹亿元整', '100000000');
eq(up(100000001), '壹亿零壹元整', '100000001 万级整级为空，只留一个零');
eq(up(100010000), '壹亿零壹万元整', '100010000');
eq(up(110000000), '壹亿壹仟万元整', '110000000');
eq(up(123456789), '壹亿贰仟叁佰肆拾伍万陆仟柒佰捌拾玖元整', '123456789 三级都满');
eq(up(1000000000), '壹拾亿元整', '1000000000');
eq(up(999999999999), '玖仟玖佰玖拾玖亿玖仟玖佰玖拾玖万玖仟玖佰玖拾玖元整', '上限整数');
eq(up(999999999999.99), '玖仟玖佰玖拾玖亿玖仟玖佰玖拾玖万玖仟玖佰玖拾玖元玖角玖分', '上限带角分');

/* ================= 4. 角分 ================= */

eq(up(1234.56), '壹仟贰佰叁拾肆元伍角陆分', '1234.56 完整角分');
eq(up(0.5), '零元伍角整', '0.5 只有角，角后写整');
eq(up(0.05), '零元零伍分', '0.05 角为零分不为零，元后补零');
eq(up(0.55), '零元伍角伍分', '0.55 角分都有');
eq(up(1200), '壹仟贰佰元整', '1200 到元为止写整');
eq(up(1200.5), '壹仟贰佰元伍角整', '1200.5 到角为止写整');
eq(up(1200.05), '壹仟贰佰元零伍分', '1200.05 元后补零');
eq(up(107.06), '壹佰零柒元零陆分', '107.06 元后补零，不是「壹佰零柒元陆分」');
eq(up(107.6), '壹佰零柒元陆角整', '107.6 角位有值不补零');
eq(up(10.01), '壹拾元零壹分', '10.01');
eq(up(100000.01), '壹拾万元零壹分', '100000.01 大额也要补零');
ok(up(1200.05).indexOf('零伍分') > 0, '补的零紧跟分位');

/* ================= 5. 分级 / 要点 / 复制 ================= */

const lv = R.levels(123456789 * 100);
eq(lv.length, 3, '分级固定三行');
eq(lv[0].name + '|' + lv[0].digits + '|' + lv[0].text, '亿级|1|壹亿', '亿级行');
eq(lv[1].name + '|' + lv[1].digits + '|' + lv[1].text, '万级|2345|贰仟叁佰肆拾伍万', '万级行');
eq(lv[2].name + '|' + lv[2].digits + '|' + lv[2].text, '元级|6789|陆仟柒佰捌拾玖元', '元级行');
eq(lv.filter(x => x.on).length, 3, '三级都非零');

const lv2 = R.levels(100000001 * 100);
eq(lv2[0].text, '壹亿', '一亿零一：亿级');
eq(lv2[1].text, '—', '一亿零一：万级为空显示破折号');
eq(lv2[1].on, false, '空级标记 on=false');
eq(lv2[2].text, '壹元', '一亿零一：元级');

const lv3 = R.levels(500 * 100);
eq(lv3[0].text, '—', '500 的亿级为空');
eq(lv3[1].text, '—', '500 的万级为空');
eq(lv3[2].text, '伍佰元', '500 的元级');
eq(R.levels(0)[2].text, '零元', '0 的元级写零元');
eq(R.fmtCents(123456), '1,234.56', '小写带千分位');
eq(R.fmtCents(5), '0.05', '小写补到分');
eq(R.fmtCents(120000), '1,200.00', '整数也补两位小数');
eq(R.group3(999999999999), '999,999,999,999', '千分位分组');

const rules = R.rules();
eq(rules.length, 3, '要点三条');
ok(rules[0].v.indexOf('壹拾万零伍佰元整') > 0, '要点第一条的例子由引擎算出');
ok(rules[1].v.indexOf('壹仟贰佰元整') > 0, '要点第二条的例子由引擎算出');
ok(rules[2].v.indexOf('壹佰零柒元零陆分') > 0, '要点第三条的例子由引擎算出');

/* ================= 6. 不变量：0–9999 全量 ================= */

const CN = '零壹贰叁肆伍陆柒捌玖';
let badZero = [], badTail = [], badOrder = [], badHead = [];
for (let n = 0; n <= 9999; n++) {
  const s = R.centsToUpper(n * 100);
  if (s.indexOf('零零') >= 0) badZero.push(n);
  if (n > 0 && s.endsWith('零元整')) badHead.push(n);
  if (!s.endsWith('元整') || (n > 0 && s.slice(0, -2).endsWith('零'))) badTail.push(n);
  // 大写里的数字顺序必须等于小写去掉 0 之后的顺序
  const raw = String(n).replace(/0/g, '').split('').map(d => CN[+d]).join('');
  const got = s.split('').filter(ch => CN.indexOf(ch) >= 0 && ch !== '零').join('');
  if (raw !== got) badOrder.push(n + ':' + s);
}
eq(badZero.length, 0, '0–9999 不出现连续两个「零」', badZero.slice(0, 5).join(','));
eq(badTail.length, 0, '0–9999 结尾不是「零」', badTail.slice(0, 5).join(','));
eq(badHead.length, 0, '0–9999（除 0）不以「零元」开头', badHead.slice(0, 5).join(','));
eq(badOrder.length, 0, '0–9999 数字顺序与小写一致', badOrder.slice(0, 3).join(' '));

/* ================= 7. 批量转换 ================= */

eq(R.batch('').code, 'EMPTY', '批量：空输入判 EMPTY');
eq(R.batch('  \n ').code, 'EMPTY', '批量：只有换行判 EMPTY');
const b1 = R.batch('1234.56', 1);
eq(b1.ok, true, '批量：单笔成功');
eq(b1.list.length, 1, '批量：单笔一条结果');
eq(b1.list[0].upper, '壹仟贰佰叁拾肆元伍角陆分', '批量：单笔大写正确');
const b2 = R.batch('1234.56\n1200\n100500', 8);
eq(b2.list.length, 3, '批量：三笔换行分隔');
eq(b2.list[2].upper, '壹拾万零伍佰元整', '批量：第三笔大写正确');
eq(R.batch('1234.56,1200;100500', 8).list.length, 3, '批量：逗号分号也能分隔');
eq(R.batch('1,234.56\n1,200', 8).list.length, 2, '批量：千分位不当作分隔符');
eq(R.batch('1,234.56\n1,200', 8).list[0].upper, '壹仟贰佰叁拾肆元伍角陆分', '批量：带千分位的那笔算对了');
eq(R.batch('1234.56\n1234.56\n1,234.56', 8).list.length, 1, '批量：同一金额去重');
eq(R.batch('1234.56\nabc', 8).ok, false, '批量：有一笔非法则整体报错');
ok(R.batch('1234.56\nabc', 8).message.indexOf('abc') > 0, '批量：错误信息指出是哪一笔');
const b3 = R.batch('1\n2\n3\n4\n5', 1);
eq(b3.list.length, 1, '批量：未解锁只转 1 笔');
ok(b3.warning.indexOf('前 1 笔') > 0, '批量：超出额度给提示');
eq(R.batch('1\n2\n3\n4\n5', 8).list.length, 5, '批量：解锁后 5 笔全转');
eq(R.batch('1\n2\n3\n4\n5\n6\n7\n8\n9', 8).list.length, 8, '批量：解锁后最多 8 笔');

const ct = R.copyText(b2.list);
eq(ct.split('\n').length, 3, '复制文本三行');
eq(ct.split('\n')[0], '¥1,234.56 = 壹仟贰佰叁拾肆元伍角陆分', '复制文本格式');
eq(R.copyText([]), '', '空列表复制为空串');
eq(R.copyText(null), '', 'null 复制为空串');

/* ================= 8. 异常输入不崩 ================= */

eq(R.centsToUpper(-100), '', '负分返回空串');
eq(R.centsToUpper(NaN), '', 'NaN 返回空串');
eq(R.centsToUpper(R.MAX_CENTS + 1), '', '超上限返回空串');
eq(R.intToUpper('0'), '零', 'intToUpper(0)');
eq(R.intToUpper('000123'), '壹佰贰拾叁', 'intToUpper 去前导零');
eq(R.intToUpper(''), '零', 'intToUpper 空串兜底');

/* ================= 汇总 ================= */

if (fails.length) {
  console.log('\n失败 ' + fails.length + ' 项：');
  fails.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));
  console.log('\n通过 ' + pass + ' / ' + (pass + fails.length));
  process.exit(1);
}
console.log('全部通过 ' + pass + ' 项断言');
