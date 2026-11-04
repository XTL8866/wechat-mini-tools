/**
 * 参考文献引擎自测  node test.js
 * 不依赖任何测试框架，断言失败退出码 1。
 * 期望值按 GB/T 7714-2015 的著录示例写死，不是「跑出来什么就当对」。
 */
const R = require('./miniprogram/core/refs.js');

let pass = 0;
const fails = [];

function ok(cond, label, extra) {
  if (cond) pass++;
  else fails.push(label + (extra ? '  → ' + extra : ''));
}
function eq(actual, expect, label) {
  ok(actual === expect, label, '期望 ' + JSON.stringify(expect) + '，实际 ' + JSON.stringify(actual));
}

// ---------- 1. 空输入 ----------
eq(R.build('J', {}).code, 'EMPTY', '空表单：先报第一个必填项');
eq(R.build('J', {}).field, 'authors', '空表单：第一个必填是作者');
eq(R.build('J', null).code, 'EMPTY', 'input 传 null 不崩，照样报 EMPTY');
eq(R.build('J', undefined).ok, false, 'input 传 undefined 不崩');
eq(R.build('', R.sample('J')).code, 'BAD_TYPE', '空类型：判 BAD_TYPE');
eq(R.build('X', R.sample('J')).code, 'BAD_TYPE', '不存在的类型：判 BAD_TYPE');
ok(typeof R.build('X', {}).message === 'string' && R.build('X', {}).message.length > 0,
  '失败结果带可直接弹 toast 的 message');

// 逐项缺字段
eq(R.build('J', { authors: '张三' }).field, 'title', '只填作者：报题名没填');
eq(R.build('J', { authors: '张三', title: '题名' }).field, 'journal', '缺刊名：报刊名没填');
eq(R.build('J', { authors: '张三', title: '题名', journal: '化工进展' }).field, 'year',
  '缺年：报年没填');
eq(R.build('P', { authors: '刘洋', title: '专利' }).field, 'num', '专利缺号：报专利号没填');
eq(R.build('EB', { authors: 'a', title: 'b', cited: '2026-11-04' }).field, 'url',
  '网页缺网址：报网址没填');

// 空白字符串等同没填
eq(R.build('J', { authors: '   ', title: '题名', journal: '刊', year: '2021' }).field, 'authors',
  '作者全是空格：等同没填');
eq(R.build('J', { authors: '张三', title: '   ', journal: '刊', year: '2021' }).field, 'title',
  '题名全是空格：等同没填');

// ---------- 2. 超长 ----------
const longTitle = '氢'.repeat(301);
eq(R.build('J', { authors: '张三', title: longTitle, journal: '刊', year: '2021' }).code,
  'TOO_LONG', '题名 301 字：判超长');
eq(R.build('J', { authors: '张三', title: '氢'.repeat(300), journal: '刊', year: '2021' }).ok,
  true, '边界：题名正好 300 字放行');
eq(R.build('EB', { authors: 'a', title: 'b', cited: '2026-11-04', url: 'https://' + 'a'.repeat(600) }).code,
  'TOO_LONG', '网址 600 字符：判超长');
eq(R.build('J', { authors: '张三', title: 'x', journal: '刊', year: '2021', pages: '9'.repeat(400) }).code,
  'TOO_LONG', '页码 400 字符：判超长');

// ---------- 3. 年份边界 ----------
eq(R.build('J', { authors: 'a', title: 't', journal: 'j', year: '21' }).code, 'BAD_YEAR',
  '两位年份：判 BAD_YEAR');
eq(R.build('J', { authors: 'a', title: 't', journal: 'j', year: '20211' }).code, 'BAD_YEAR',
  '五位年份：判 BAD_YEAR');
eq(R.build('J', { authors: 'a', title: 't', journal: 'j', year: '２０２１' }).code, 'BAD_YEAR',
  '全角数字：判 BAD_YEAR');
eq(R.build('J', { authors: 'a', title: 't', journal: 'j', year: '0999' }).code, 'BAD_YEAR',
  '边界外 0999：判 BAD_YEAR');
eq(R.build('J', { authors: 'a', title: 't', journal: 'j', year: '1000' }).ok, true,
  '边界内 1000：放行');
eq(R.build('J', { authors: 'a', title: 't', journal: 'j', year: '2100' }).ok, true,
  '边界内 2100：放行');
eq(R.build('J', { authors: 'a', title: 't', journal: 'j', year: '2101' }).code, 'BAD_YEAR',
  '边界外 2101：判 BAD_YEAR');

// ---------- 4. 著者格式化 ----------
eq(R.formatAuthors('张三, 李四'), '张三, 李四', '中文两名：逗号分隔');
eq(R.formatAuthors('张三，李四；王五、赵六'), '张三, 李四, 王五, 等',
  '中英标点混着输也能拆，超过三个补「等」');
eq(R.formatAuthors('张三, 李四, 王五'), '张三, 李四, 王五', '正好三个：不补「等」');
eq(R.formatAuthors('张 三'), '张三', '中文名中间的空格去掉');
eq(R.formatAuthors('  , 张三 ,, '), '张三', '多余逗号和空段被丢掉');
eq(R.formatAuthors(''), '', '空著者：返回空串');

eq(R.formatOne('John Smith'), 'SMITH J', '名在前：姓提上来，名留首字母');
eq(R.formatOne('John A Smith'), 'SMITH J A', '名在前带中间名：两个首字母');
eq(R.formatOne('Smith J A'), 'SMITH J A', '已经是姓在前：原样大写');
eq(R.formatOne('John A. Smith'), 'SMITH J A', '缩写点被去掉（国标不加缩写点）');
eq(R.formatOne('van der Waals J'), 'VAN DER WAALS J', '复姓不被截断');
eq(R.formatOne('Smith'), 'SMITH', '只有姓：直接大写');
eq(R.formatAuthors('John A Smith, Kate Brown, Ming Li, Peter Wang'),
  'SMITH J A, BROWN K, LI M, et al', '西文四个：前三个 + et al');
eq(R.formatAuthors('John A Smith, Kate Brown'), 'SMITH J A, BROWN K', '西文两个：不补 et al');

// ---------- 5. 八种类型逐条比对 ----------
eq(R.build('J', R.sample('J')).text,
  '王建国, 李海涛, 张明远, 等. 碱性水电解制氢技术研究进展[J]. 化工进展, 2021, 40(5): 2541-2550.',
  '期刊：年, 卷(期): 页码');
eq(R.build('J', R.sample('J_EN')).text,
  'SMITH J A, BROWN K, LI M, et al. Shaking without quaking[J]. Science, 1998, 279(5359): 2063-2064.',
  '西文期刊：与国标示例逐字一致');
eq(R.build('M', R.sample('M')).text,
  '张三. 碱性电解槽设计与运行[M]. 2版. 北京: 化学工业出版社, 2020: 35-48.',
  '专著：版本项单列一段');
eq(R.build('D', R.sample('D')).text,
  '李四. 多堆碱性电解水系统调度优化研究[D]. 郑州: 河南工业大学, 2026.',
  '学位论文：地: 单位, 年');
eq(R.build('C', R.sample('C')).text,
  '王五, 赵六. 风光耦合制氢系统容量配置[C]//中国可再生能源学会学术年会论文集. 北京: 中国电力出版社, 2023: 112-118.',
  '会议论文：析出用 //');
eq(R.build('P', R.sample('P')).text,
  '刘洋. 一种碱性电解槽用复合隔膜及其制备方法: CN108765432A[P]. 2023-05-14.',
  '专利：题名: 专利号[P]. 公告日期');
eq(R.build('S', R.sample('S')).text,
  'GB/T 19774—2005 水电解制氢系统技术要求[S]. 北京: 中国标准出版社, 2005.',
  '标准：编号 名称[S]. 地: 出版者, 年');
eq(R.build('N', R.sample('N')).text,
  '孙倩. 绿氢成本还能降多少[N]. 光明日报, 2024-03-18(7).',
  '报纸：报纸名, 日期(版次)');
eq(R.build('EB', R.sample('EB')).text,
  '国家能源局. 氢能产业发展中长期规划（2021—2035 年）[EB/OL]. (2022-03-23)[2026-11-04]. https://www.nea.gov.cn/2022-03/23/c_1310525055.htm.',
  '电子资源：(发布)[引用]. 网址');
eq(R.build('J', R.sample('J')).mark, '[J]', '返回类型标识');

// ---------- 6. 可选字段缺失时的收敛 ----------
eq(R.build('J', { authors: 'a', title: 't', journal: 'j', year: '2021' }).text,
  'A. t[J]. j, 2021.', '期刊无卷期页：只剩刊名和年');
eq(R.build('J', { authors: 'a', title: 't', journal: 'j', year: '2021', issue: '5' }).text,
  'A. t[J]. j, 2021(5).', '期刊无卷有期：年后面直接跟期');
eq(R.build('J', { authors: 'a', title: 't', journal: 'j', year: '2021', volume: '40', issue: '5' }).text,
  'A. t[J]. j, 2021, 40(5).', '期刊无页码：末尾不留悬空冒号');
eq(R.build('M', { authors: 'a', title: 't', place: '北京', year: '2020' }).text,
  'A. t[M]. 北京, 2020.', '专著无出版者：不留下空冒号');
eq(R.build('M', { authors: 'a', title: 't', place: '北京', publisher: '社', year: '2020', edition: '3' }).text,
  'A. t[M]. 3版. 北京: 社, 2020.', '版本只填数字：自动补「版」');
eq(R.build('M', { authors: 'a', title: 't', place: '北京', publisher: '社', year: '2020', edition: '3版' }).text,
  'A. t[M]. 3版. 北京: 社, 2020.', '版本已带「版」：不重复补');
eq(R.build('C', { authors: 'a', title: 't', conf: '论文集', year: '2023' }).text,
  'A. t[C]//论文集, 2023.', '会议无论文集出版信息：不留多余标点');
eq(R.build('N', R.sample('N')).text.indexOf('(7)') > 0, true, '报纸版次包在圆括号里');

// ---------- 7. 题名尾部句号与页码规范化 ----------
eq(R.build('J', { authors: 'a', title: '制氢进展。', journal: 'j', year: '2021' }).text,
  'A. 制氢进展[J]. j, 2021.', '题名自带中文句号：去掉，不出现「。[J]」');
eq(R.build('J', { authors: 'a', title: 'Progress.', journal: 'j', year: '2021' }).text,
  'A. Progress[J]. j, 2021.', '题名自带英文句点：去掉，不出现「..」');
eq(R.normPages('12–18'), '12-18', '长破折号统一成半角连字符');
eq(R.normPages('12 - 18'), '12-18', '连字符两侧空格去掉');
eq(R.normPages('12—18'), '12-18', '中文破折号统一');
eq(R.normPages('12'), '12', '单页保持');
eq(R.build('J', { authors: 'a', title: 't', journal: 'j', year: '2021', pages: '12～18' }).text,
  'A. t[J]. j, 2021: 12-18.', '波浪号页码被规范化');
eq(R.build('J', { authors: 'a', title: 't', journal: 'j', year: '2021', volume: '4O' }).code,
  'BAD_VOLUME', '卷里混了字母 O：判 BAD_VOLUME');

// ---------- 8. 网址 ----------
eq(R.build('EB', { authors: 'a', title: 't', cited: '2026-11-04', url: 'www.abc.com' }).text,
  'A. t[EB/OL]. [2026-11-04]. https://www.abc.com.', 'www 开头：自动补 https://');
eq(R.build('EB', { authors: 'a', title: 't', cited: '2026-11-04', url: 'abc.com' }).code,
  'BAD_URL', '裸域名：判 BAD_URL');
eq(R.build('EB', { authors: 'a', title: 't', cited: '2026-11-04', url: 'ftp://a.com' }).code,
  'BAD_URL', '非 http 协议：判 BAD_URL');
eq(R.build('EB', { authors: 'a', title: 't', cited: '2026-11-04', url: 'https://a.com' }).text,
  'A. t[EB/OL]. [2026-11-04]. https://a.com.', '没有发布日期：括号整体不出现');

// ---------- 9. 列表：判重 / 上限 / 增删 ----------
let list = [];
let r1 = R.addEntry(list, R.build('J', R.sample('J')), R.FREE_SAVE);
eq(r1.ok, true, '加第一条：成功');
eq(r1.list.length, 1, '加第一条：长度 1');
eq(r1.index, 0, '加第一条：返回下标 0');

let r2 = R.addEntry(r1.list, R.build('J', R.sample('J')), R.FREE_SAVE);
eq(r2.ok, false, '同一条再加一次：失败');
eq(r2.code, 'DUP', '同一条再加一次：判 DUP');
eq(r2.list.length, 1, 'DUP 时列表长度不变');
eq(r2.index, 0, 'DUP 时返回已存在的下标');

// 只差空格和大小写也算重复
const dupText = { text: 'A. t[J]. j, 2021.', type: 'J', mark: '[J]' };
let d1 = R.addEntry([], dupText, 10);
let d2 = R.addEntry(d1.list, { text: 'a. T[J].  J,2021.', type: 'J', mark: '[J]' }, 10);
eq(d2.code, 'DUP', '只差大小写和空格：仍判 DUP');

// 上限边界
let three = [];
three = R.addEntry(three, R.build('J', R.sample('J')), 3).list;
three = R.addEntry(three, R.build('M', R.sample('M')), 3).list;
three = R.addEntry(three, R.build('D', R.sample('D')), 3).list;
eq(three.length, 3, '填满 3 条');
let full = R.addEntry(three, R.build('C', R.sample('C')), 3);
eq(full.code, 'FULL', '第 4 条：判 FULL');
eq(full.list.length, 3, 'FULL 时列表长度不变');
ok(full.message.indexOf('3') >= 0, 'FULL 的 message 里带上限数字');
let pro = R.addEntry(three, R.build('C', R.sample('C')), R.PRO_SAVE);
eq(pro.ok, true, '解锁后上限 20：第 4 条放行');
eq(R.limitOf(false), 3, '未解锁上限 3');
eq(R.limitOf(true), 20, '解锁上限 20');

eq(R.addEntry([], null).code, 'EMPTY', '空 entry：判 EMPTY');
eq(R.addEntry([], { text: '' }).code, 'EMPTY', 'text 为空：判 EMPTY');

let del = R.removeEntry(three, 1);
eq(del.length, 2, '删一条：长度减一');
eq(del[1].type, 'D', '删中间一条：后面的往前补');
eq(R.removeEntry(three, 9).length, 3, '删越界下标：原样返回');
eq(R.removeEntry(three, -1).length, 3, '删负数下标：原样返回');

// ---------- 10. 排序与导出 ----------
let mixed = [];
mixed = R.addEntry(mixed, R.build('M', R.sample('M')), 10).list;  // 2020
mixed = R.addEntry(mixed, R.build('D', R.sample('D')), 10).list;  // 2026
mixed = R.addEntry(mixed, R.build('J', R.sample('J')), 10).list;  // 2021
eq(mixed[0].year, '2020', '录入顺序：第一条第 2020 年');
let byYear = R.sortList(mixed, 'year');
eq(byYear[0].year, '2026', '按年倒序：2026 排第一');
eq(byYear[2].year, '2020', '按年倒序：2020 排最后');
eq(mixed[0].year, '2020', '排序不改原数组');
eq(R.sortList(mixed, 'none')[0].year, '2020', '按录入顺序：不动');

let out = R.exportAll(byYear, 'num');
ok(out.indexOf('[1] ') === 0, '带序号导出：从 [1] 开始');
eq(out.split('\n').length, 3, '带序号导出：三条三行');
ok(R.exportAll(byYear, 'plain').indexOf('[1]') < 0, '纯文本导出：不带序号');
eq(R.exportAll(byYear, 'md').split('\n')[0].slice(0, 2), '- ', 'Markdown 导出：行首是 "- "');
eq(R.exportAll([], 'num'), '', '空列表导出：空串');

// ---------- 11. 类型与网格 ----------
eq(R.TYPES.length, 8, '一共 8 种文献类型');
eq(R.TYPES.map(t => t.mark).join(','), '[J],[M],[D],[C],[P],[S],[N],[EB/OL]',
  '类型标识码与国标一致');
eq(R.typeOf('S').cn, '标准', '按标识码能取回类型信息');
eq(R.typeOf('ZZ'), null, '未知标识码：返回 null');
eq(R.fieldsOf('J').length, 7, '期刊要填 7 个格子');
eq(R.fieldsOf('P').length, 4, '专利要填 4 个格子');
eq(R.fieldsOf('S')[0].key, 'num', '标准第一个格子是标准号（不填作者）');
eq(R.fieldsOf('P')[2].label, '专利号', '专利号标签在专利类型下覆写');
eq(R.fieldsOf('S')[0].label, '标准号', '标准号标签在标准类型下覆写');
eq(R.fieldsOf('N')[4].label, '版次', '报纸最后一个格子叫版次');
eq(R.fieldsOf('ZZ').length, 0, '未知类型：返回空网格');
eq(Object.keys(R.emptyForm('D')).length, 5, '空表单按类型生成 5 个键');
eq(R.emptyForm('D').title, '', '空表单每个键都是空串');

// ---------- 汇总 ----------
console.log('\n通过 %d 项', pass);
if (fails.length) {
  console.log('失败 %d 项：', fails.length);
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('全部通过 ✓');
