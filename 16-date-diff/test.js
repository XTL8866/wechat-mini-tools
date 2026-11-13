// node test.js —— 全过才允许出片
var D = require('./miniprogram/core/datecalc.js');

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL  ' + name);
}
function eq(a, b, name) { ok(a === b, name + '  (期望 ' + b + '，实得 ' + a + ')'); }
function P(s) { return D.parseDate(s); }

console.log('— 1 解析：合法写法都吃得下 —');
eq(P('2026-11-13').ok, true, '2026-11-13 通过');
eq(P('2026-11-13').key, '2026-11-13', '回写成 key');
eq(P('2026/11/13').key, '2026-11-13', '斜杠分隔');
eq(P('2026.11.13').key, '2026-11-13', '点号分隔');
eq(P('2026年11月13日').key, '2026-11-13', '中文写法');
eq(P('2026年11月13').key, '2026-11-13', '中文无日字');
eq(P('20261113').key, '2026-11-13', '八位纯数字');
eq(P('  2026-11-13  ').key, '2026-11-13', '前后空格');
eq(P('2026-1-1').key, '2026-01-01', '个位月日补零');
eq(P('2026-11-13').weekdayName, '周五', '2026-11-13 是周五');
eq(P('2026-11-14').weekdayName, '周六', '11-14 是周六');
eq(P('2026-11-15').weekdayName, '周日', '11-15 是周日');
eq(P('1970-01-01').weekday, 4, '1970-01-01 是周四');
eq(P('2026-11-13').weekend, false, '周五不是周末');
eq(P('2026-11-14').weekend, true, '周六是周末');

console.log('— 2 解析：空、脏、不存在的日期一律拒绝 —');
eq(P('').ok, false, '空串拒绝');
eq(P('   ').ok, false, '全空格拒绝');
eq(P(null).ok, false, 'null 拒绝');
eq(P(undefined).ok, false, 'undefined 拒绝');
eq(P('').code, 'EMPTY', '空串判 EMPTY');
eq(P('2026-13-01').code, 'MONTH', '13 月判 MONTH');
eq(P('2026-00-10').code, 'MONTH', '0 月判 MONTH');
eq(P('2026-02-30').code, 'DAY', '2 月 30 判 DAY');
eq(P('2026-02-29').ok, false, '2026 不是闰年，2-29 拒绝');
eq(P('2024-02-29').ok, true, '2024 闰年，2-29 通过');
eq(P('2026-04-31').ok, false, '4 月 31 拒绝');
eq(P('2026-02-30').message, '2 月只有 28 天', '拒绝时把当月天数说清楚');
eq(P('1899-12-31').code, 'YEAR', '1899 超范围');
eq(P('2201-01-01').code, 'YEAR', '2201 超范围');
eq(P('abc').code, 'FORMAT', '字母判 FORMAT');
eq(P('2026-11').code, 'FORMAT', '只有年月判 FORMAT');
eq(P('2026-11-13 12:00').ok, false, '带时间不接受');
eq(P('1234567890123456789012345').code, 'TOO_LONG', '超长判 TOO_LONG');

console.log('— 3 间隔天数 —');
eq(D.diffDays('2026-11-13', '2026-11-20').days, 7, '同月相隔 7 天');
eq(D.diffDays('2026-11-20', '2026-11-13').days, -7, '反向为 -7');
eq(D.diffDays('2026-11-13', '2026-11-13').days, 0, '同一天 0');
eq(D.diffDays('2024-02-28', '2024-03-01').abs, 2, '闰年 2-28 到 3-1 是 2 天');
eq(D.diffDays('2023-02-28', '2023-03-01').abs, 1, '平年 2-28 到 3-1 是 1 天');
eq(D.diffDays('2026-12-31', '2027-01-01').abs, 1, '跨年是 1 天');
eq(D.diffDays('2026-11-13', 'bad').ok, false, '脏日期不给算');
eq(D.diffDays('', '').code, 'EMPTY', '空输入传回 EMPTY');

console.log('— 4 主计算：间隔 / 含首尾 / 周末 / 工作日 —');
var a = D.analyze({ start: '2026-11-13', end: '2026-11-20' });
eq(a.ok, true, '11-13 到 11-20 通过');
eq(a.absDays, 7, '间隔 7 天');
eq(a.totalDays, 8, '含首尾 8 天');
eq(a.weekendDays, 2, '含 11-14 / 11-15 两个周末');
eq(a.workdays, 6, '工作日 6 天');
eq(a.workdays + a.weekendDays, a.totalDays, '工作日 + 周末 = 总天数');
eq(a.ymdText, '0 年 0 月 7 天', '精确跨度 0 年 0 月 7 天');
eq(a.endWeekday, '周五', '结束日是周五');
eq(a.reversed, false, '正序');

var b = D.analyze({ start: '2026-11-20', end: '2026-11-13' });
eq(b.reversed, true, '反着填标记 reversed');
eq(b.absDays, 7, '反着填间隔仍是 7');
eq(b.ymd.d, 7, '反着填精确天数仍是正数');

var c = D.analyze({ start: '2026-11-14', end: '2026-11-15' });
eq(c.totalDays, 2, '周六到周日共 2 天');
eq(c.workdays, 0, '整个区间没有工作日');
eq(c.weekendDays, 2, '两天都是周末');

var d = D.analyze({ start: '2026-11-13', end: '2026-11-13' });
eq(d.absDays, 0, '同一天间隔 0');
eq(d.totalDays, 1, '同一天含首尾 1 天');
eq(d.workdays, 1, '周五算 1 个工作日');
eq(d.ymdText, '0 年 0 月 0 天', '同一天跨度为 0');

console.log('— 5 精确年月日 —');
eq(D.analyze({ start: '2026-01-31', end: '2026-03-01' }).ymdText, '0 年 1 月 1 天', '1-31 到 3-1 夹取为 1 月 1 天');
eq(D.analyze({ start: '2020-02-29', end: '2021-02-28' }).ymdText, '1 年 0 月 0 天', '闰日到次年 2-28 正好 1 年');
eq(D.analyze({ start: '2020-02-29', end: '2021-03-01' }).ymdText, '1 年 0 月 1 天', '闰日到 3-1 是 1 年 1 天');
eq(D.analyze({ start: '2026-11-13', end: '2027-11-13' }).ymdText, '1 年 0 月 0 天', '同年同日整一年');
eq(D.analyze({ start: '2026-11-13', end: '2029-02-20' }).ymdText, '2 年 3 月 7 天', '2 年 3 月 7 天');
eq(D.analyze({ start: '1900-01-01', end: '2000-01-01' }).ymdText, '100 年 0 月 0 天', '跨世纪整 100 年');

console.log('— 6 跳过日 / 补班日 —');
var s1 = D.analyze({ start: '2026-11-13', end: '2026-11-20', skip: ['2026-11-16'] });
eq(s1.skipDays, 1, '跳过 11-16 记 1 天');
eq(s1.workdays, 5, '工作日从 6 降到 5');
eq(s1.workdays + s1.weekendDays + s1.skipDays - s1.extraDays, s1.totalDays, '账平得上');
var s2 = D.analyze({ start: '2026-11-13', end: '2026-11-20', skip: ['2026-11-14'] });
eq(s2.skipDays, 0, '跳过周末不计入 skipDays');
eq(s2.workdays, 6, '跳过周末不影响工作日');
var s3 = D.analyze({ start: '2026-11-13', end: '2026-11-20', extra: ['2026-11-14'] });
eq(s3.extraDays, 1, '周六补班记 1 天');
eq(s3.workdays, 7, '工作日从 6 升到 7');
var s4 = D.analyze({ start: '2026-11-13', end: '2026-11-20', skip: '2026-11-16，2026-11-17' });
eq(s4.skipDays, 2, '逗号串起的跳过日也认');
var s5 = D.analyze({ start: '2026-11-13', end: '2026-11-20', skip: ['2026-13-40', ''] });
eq(s5.skipDays, 0, '非法跳过日被忽略不报错');

console.log('— 7 还剩几个工作日 —');
var w1 = D.workdaysLeft('2026-11-13', '2026-11-20');
eq(w1.workdays, 5, '不含今天，到 11-20 还剩 5 个工作日');
var w2 = D.workdaysLeft('2026-11-13', '2026-11-16');
eq(w2.workdays, 1, '到下周一还剩 1 个工作日（今天不算）');
var w3 = D.workdaysLeft('2026-11-13', '2026-11-13');
eq(w3.workdays, 0, '当天到期剩 0');
var w4 = D.workdaysLeft('2026-11-13', '2026-11-12');
eq(w4.overdue, true, '截止日已过标记 overdue');
eq(w4.workdays, 0, '逾期不给负数');
eq(D.workdaysLeft('2026-11-14', '2026-11-15').workdays, 0, '周六到周日 0 个工作日');
eq(D.workdaysLeft('bad', '2026-11-15').ok, false, '脏起始日拒绝');

console.log('— 8 工作日倒推 —');
eq(D.addWorkdays('2026-11-13', 1).key, '2026-11-16', '周五往后第 1 个工作日是周一');
eq(D.addWorkdays('2026-11-13', 5).key, '2026-11-20', '第 5 个工作日是 11-20');
eq(D.addWorkdays('2026-11-13', 5).weekdayName, '周五', '第 5 个工作日是周五');
eq(D.addWorkdays('2026-11-13', 0).key, '2026-11-13', '第 0 个还是当天');
eq(D.addWorkdays('2026-11-13', -1).key, '2026-11-12', '往前 1 个是周四');
eq(D.addWorkdays('2026-11-14', 1).key, '2026-11-16', '周六起算，第 1 个工作日是周一');
eq(D.addWorkdays('2026-11-13', 30).key, D.addWorkdays('2026-11-13', 30).key, '同参数结果稳定');
ok(D.addWorkdays('2026-11-13', 30).weekday !== 0 && D.addWorkdays('2026-11-13', 30).weekday !== 6,
  '倒推结果一定落在工作日');
eq(D.addWorkdays('2026-11-13', 1.5).code, 'N', '小数工作日拒绝');
eq(D.addWorkdays('bad', 3).ok, false, '脏日期拒绝');
ok(D.addWorkdays('2026-11-13', 5000).ok, '5000 个工作日不卡死');

console.log('— 9 倒推与区间互证 —');
[7, 15, 30, 60].forEach(function (n) {
  var t = D.addWorkdays('2026-11-13', n);
  var back = D.workdaysLeft('2026-11-13', t.key);
  eq(back.workdays, n, n + ' 个工作日：倒推日期再数回来还是 ' + n);
});
var tz = D.addWorkdays('2026-11-13', 30);
eq(tz.key, '2026-12-25', '从 11-13 起第 30 个工作日是 12-25');
eq(tz.weekdayName, '周五', '12-25 是周五');

console.log('— 10 周号与年内第几天 —');
eq(D.isoWeek(P('2026-01-01')).week, 1, '2026-01-01 是第 1 周');
eq(D.isoWeek(P('2026-01-01')).year, 2026, '第 1 周归属 2026');
eq(D.isoWeek(P('2021-01-01')).week, 53, '2021-01-01 属 2020 年第 53 周');
eq(D.isoWeek(P('2021-01-01')).year, 2020, '跨年周归属上一年');
eq(D.dayOfYear(P('2024-12-31')), 366, '闰年最后一天是第 366 天');
eq(D.dayOfYear(P('2026-12-31')), 365, '平年最后一天是第 365 天');
eq(D.dayOfYear(P('2026-01-01')), 1, '元旦是第 1 天');

console.log('— 11 闰年与月长 —');
eq(D.isLeap(2024), true, '2024 闰年');
eq(D.isLeap(2026), false, '2026 平年');
eq(D.isLeap(1900), false, '1900 整百不闰');
eq(D.isLeap(2000), true, '2000 四百年闰');
eq(D.daysInMonth(2024, 2), 29, '2024 年 2 月 29 天');
eq(D.daysInMonth(2026, 2), 28, '2026 年 2 月 28 天');
eq(D.daysInMonth(2026, 4), 30, '4 月 30 天');
eq(D.daysInMonth(2026, 12), 31, '12 月 31 天');

console.log('— 12 长跨度与账目自洽 —');
var big = D.analyze({ start: '1900-01-01', end: '2200-01-01' });
eq(big.ok, true, '300 年跨度能算');
eq(big.totalDays, big.absDays + 1, '含首尾 = 间隔 + 1');
eq(big.workdays + big.weekendDays, big.totalDays, '300 年里工作日 + 周末 = 总天数');
ok(big.absDays > 109000 && big.absDays < 110000, '300 年天数在 11 万上下（实得 ' + big.absDays + '）');
[['2026-01-01', '2026-12-31'], ['2019-06-15', '2023-02-28'], ['2024-02-29', '2024-03-31']]
  .forEach(function (pair) {
    var r = D.analyze({ start: pair[0], end: pair[1] });
    eq(r.workdays + r.weekendDays, r.totalDays, pair[0] + '→' + pair[1] + ' 账目自洽');
  });

console.log('— 13 边界：最小年 / 最大年 / 全年 —');
eq(D.analyze({ start: '1900-01-01', end: '1900-12-31' }).totalDays, 365, '1900 年 365 天');
eq(D.analyze({ start: '2000-01-01', end: '2000-12-31' }).totalDays, 366, '2000 年 366 天');
eq(D.analyze({ start: '1900-01-01', end: '2200-12-31' }).ok, true, '两端极值仍可算');
eq(D.parseDate('1900-01-01').ok, true, '1900-01-01 合法');
eq(D.parseDate('2200-12-31').ok, true, '2200-12-31 合法');

console.log('— 14 输出文本 —');
eq(D.fmtCN('2026-11-13'), '2026年11月13日 周五', 'fmtCN 带星期');
eq(D.fmtCN('bad'), '', '脏日期返回空串');
eq(D.PRESETS.length, 3, '三个倒推预设');
eq(D.PRESETS[2].n, 30, '第三个预设是 30 个工作日');

console.log('\n' + (fail === 0 ? '全部通过' : '有失败') + '：' + pass + ' 项通过，' + fail + ' 项失败');
process.exit(fail === 0 ? 0 : 1);
