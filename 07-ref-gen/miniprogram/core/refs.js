/* eslint-disable */
/**
 * 参考文献引擎 —— 按 GB/T 7714-2015 拼装 8 类文献的著录条目
 *
 * 为什么单独成 UMD 模块：小程序页面里 require('../../core/refs.js')，浏览器预览页里
 * <script src> 直接挂到 window.RefKit，两边跑的是同一份代码 —— 视频里截到的字符串
 * 和真机上一模一样，不用两处各写一遍再对齐。
 *
 * 约定：
 *  - 对外一律给 { ok:true, text, mark } 或 { ok:false, code, message }，不抛异常
 *  - 标点全用半角：著者后 ". "、题名后 "[J]. "、出版地后 ": "、年卷期间 ", "、页码前 ": "
 *  - 姓名：中文连写；西文姓在前姓全大写、名只留首字母且不加缩写点（GB/T 7714-2015 5.1）
 *  - 著者超过 3 个只留前 3 个，中文补「等」、西文补「et al」
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RefKit = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FREE_SAVE = 3;      // 免费能存几条
  var PRO_SAVE = 20;      // 解锁后能存几条
  var MAX_AUTHORS = 3;    // 超过这个数就截断
  var MAX_FIELD = 300;    // 普通字段长度上限，超了基本是粘错东西
  var MAX_URL = 500;
  var YEAR_MIN = 1000;
  var YEAR_MAX = 2100;

  /* ------------------------------------------------------------------ *
   * 文献类型：GB/T 7714 的文献类型标识码
   * ------------------------------------------------------------------ */
  var TYPES = [
    { key: 'J',  label: '期刊',   cn: '期刊论文', mark: '[J]' },
    { key: 'M',  label: '专著',   cn: '专著',     mark: '[M]' },
    { key: 'D',  label: '学位',   cn: '学位论文', mark: '[D]' },
    { key: 'C',  label: '会议',   cn: '会议论文', mark: '[C]' },
    { key: 'P',  label: '专利',   cn: '专利',     mark: '[P]' },
    { key: 'S',  label: '标准',   cn: '标准',     mark: '[S]' },
    { key: 'N',  label: '报纸',   cn: '报纸',     mark: '[N]' },
    { key: 'EB', label: '网页',   cn: '电子资源', mark: '[EB/OL]' }
  ];

  var TYPE_BY_KEY = {};
  TYPES.forEach(function (t) { TYPE_BY_KEY[t.key] = t; });

  /* ------------------------------------------------------------------ *
   * 字段定义。req 为必填；同一 key 在不同类型下标签可能不同（num / edition），
   * 由 fieldsOf() 覆写。
   * ------------------------------------------------------------------ */
  var FIELDS = {
    authors:   { label: '作者',       ph: '多个用逗号隔开', req: true },
    title:     { label: '题名',       ph: '文章或书的标题', req: true },
    journal:   { label: '刊名',       ph: '化工进展', req: true },
    year:      { label: '年',         ph: '2021', req: true },
    volume:    { label: '卷',         ph: '40' },
    issue:     { label: '期',         ph: '5' },
    pages:     { label: '页码',       ph: '2541-2550' },
    edition:   { label: '版本',       ph: '2（留空即第 1 版）' },
    place:     { label: '出版地',     ph: '北京', req: true },
    publisher: { label: '出版者',     ph: '科学出版社' },
    school:    { label: '保存单位',   ph: '河南工业大学', req: true },
    conf:      { label: '论文集名',   ph: '会议论文集名称', req: true },
    num:       { label: '编号',       ph: '' , req: true },
    date:      { label: '日期',       ph: '2023-05-14', req: true },
    paper:     { label: '报纸名',     ph: '光明日报', req: true },
    pubdate:   { label: '发布日期',   ph: '2023-03-01' },
    cited:     { label: '引用日期',   ph: '2026-11-04', req: true },
    url:       { label: '网址',       ph: 'https://…', req: true }
  };

  // 每种类型要填哪些格子，顺序就是界面上的顺序
  var TYPE_FIELDS = {
    J:  ['authors', 'title', 'journal', 'year', 'volume', 'issue', 'pages'],
    M:  ['authors', 'title', 'edition', 'place', 'publisher', 'year', 'pages'],
    D:  ['authors', 'title', 'place', 'school', 'year'],
    C:  ['authors', 'title', 'conf', 'place', 'publisher', 'year', 'pages'],
    P:  ['authors', 'title', 'num', 'date'],
    S:  ['num', 'title', 'place', 'publisher', 'year'],
    N:  ['authors', 'title', 'paper', 'date', 'edition'],
    EB: ['authors', 'title', 'pubdate', 'cited', 'url']
  };

  // 会议论文集的出版地经常查不到（很多是内部印的论文集），强制必填会把人卡住
  var REQ_OVERRIDE = {
    'C.place': false
  };

  // 同名字段在不同类型下的说法不一样，硬套一个标签会让人填错
  var LABEL_OVERRIDE = {
    'P.num':  { label: '专利号', ph: 'CN108765432A' },
    'S.num':  { label: '标准号', ph: 'GB/T 7714—2015' },
    'N.date': { label: '出版日期', ph: '2023-05-14' },
    'N.edition': { label: '版次', ph: '3（第 3 版）' },
    'M.pages': { label: '引文页码' },
    'C.pages': { label: '页码' }
  };

  /* ---------------------------- 基础工具 ---------------------------- */

  function err(code, message, field) {
    return { ok: false, code: code, message: message, field: field || '' };
  }

  function clean(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/\s+/g, ' ').trim();
  }

  // 题名末尾自带句号的，一律去掉，最后统一补一个
  function stripTail(s) {
    return s.replace(/[。．.、,，;；:：]+$/, '');
  }

  function isCJK(s) {
    return /[\u3400-\u9fff]/.test(s);
  }

  function normPages(v) {
    var s = clean(v);
    if (!s) return '';
    return s.replace(/[–—−~～至]/g, '-').replace(/\s*-\s*/g, '-');
  }

  /* ---------------------------- 著者 ---------------------------- */

  function splitAuthors(raw) {
    return clean(raw)
      .split(/[,，;；、\n]+/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return !!s; });
  }

  /**
   * 单个著者转成著录形式。
   * 中文：连写，中间的空白去掉（「张 三」→「张三」）。
   * 西文：姓在前、全大写；名只留首字母、不加缩写点（GB/T 7714-2015 5.1）。
   *
   * 难点是判断「名在前还是姓在前」：用户可能写 John Smith，也可能写 Smith J。
   * 规则：从尾部数连续的单字母（长度为 1）当缩写名，剩下的就是姓。
   *   「Smith J A」→ 姓 Smith，缩写 J A
   *   「John A Smith」→ 尾部不是单字母，走「名在前」分支，姓 Smith，缩写 J A
   *   「van der Waals J」→ 姓 van der Waals，缩写 J（复姓不会被截断）
   */
  function formatOne(name) {
    var s = clean(name);
    if (!s) return '';
    if (isCJK(s)) return s.replace(/\s+/g, '');

    var toks = s.split(/\s+/).map(function (t) {
      return t.replace(/\./g, '');
    }).filter(function (t) { return !!t; });
    if (!toks.length) return '';

    var k = toks.length;
    while (k > 1 && toks[k - 1].length === 1) k--;

    var surname, given;
    if (k < toks.length) {
      // 有尾部缩写名 → 已经是「姓 名」顺序
      surname = toks.slice(0, k).join(' ');
      given = toks.slice(k);
    } else if (toks.length > 1) {
      // 没有尾部缩写名 → 当作「名 姓」顺序，最后一节是姓
      surname = toks[toks.length - 1];
      given = toks.slice(0, toks.length - 1);
    } else {
      surname = toks[0];
      given = [];
    }
    if (!surname) { surname = toks[0]; given = []; }

    var initials = given.map(function (t) { return t.charAt(0); }).filter(Boolean);
    return [surname.toUpperCase()].concat(initials).join(' ');
  }

  function isLatinName(raw) {
    return !!raw && !isCJK(raw) && /[A-Za-z]/.test(raw);
  }

  /**
   * 著者列表 → "张三, 李四, 王五, 等"  /  "SMITH J, BROWN K, FORGE J, et al"
   * 注意「et al」不带点，因为后面紧接著者项结尾的点，拼出来正好是「et al.」
   */
  function formatAuthors(raw) {
    var list = splitAuthors(raw);
    if (!list.length) return '';
    var shown = list.slice(0, MAX_AUTHORS).map(formatOne);
    if (list.length > MAX_AUTHORS) shown.push(isLatinName(raw) ? 'et al' : '等');
    return shown.join(', ');
  }

  /* ---------------------------- 网格定义 ---------------------------- */

  function fieldMeta(typeKey, key) {
    var ov = LABEL_OVERRIDE[typeKey + '.' + key] || {};
    var base = FIELDS[key] || {};
    var req = base.req === true;
    var rk = typeKey + '.' + key;
    if (Object.prototype.hasOwnProperty.call(REQ_OVERRIDE, rk)) req = REQ_OVERRIDE[rk];
    return {
      key: key,
      label: ov.label || base.label || key,
      ph: ov.ph !== undefined ? ov.ph : (base.ph || ''),
      req: req
    };
  }

  function fieldsOf(typeKey) {
    var keys = TYPE_FIELDS[typeKey];
    if (!keys) return [];
    return keys.map(function (k) { return fieldMeta(typeKey, k); });
  }

  /* ---------------------------- 拼装 ---------------------------- */

  function editionText(v, lang) {
    var s = clean(v);
    if (!s) return '';
    if (/^\d+$/.test(s)) return s + '版';
    if (/版$/.test(s) || /\bed\.?$/i.test(s)) return s;
    return s + '版';
  }

  function joinPlace(place, publisher) {
    if (place && publisher) return place + ': ' + publisher;
    return place || publisher || '';
  }

  /**
   * 按类型拼一条著录。
   * @param {String} typeKey J/M/D/C/P/S/N/EB
   * @param {Object} input   { authors, title, ... }
   * @return {Object} { ok:true, text, mark, type, cn, authors, year }
   */
  function build(typeKey, input) {
    var t = TYPE_BY_KEY[typeKey];
    if (!t) return err('BAD_TYPE', '没有这种文献类型');
    input = input || {};

    var keys = TYPE_FIELDS[typeKey];
    var v = {};
    var i, k, meta;

    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      var raw = clean(input[k]);
      var cap = k === 'url' ? MAX_URL : MAX_FIELD;
      if (raw.length > cap) {
        return err('TOO_LONG', fieldMeta(typeKey, k).label + '太长了，检查一下是不是粘错了', k);
      }
      v[k] = raw;
    }

    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      meta = fieldMeta(typeKey, k);
      if (meta.req && !v[k]) return err('EMPTY', meta.label + '还没填', k);
    }

    if (v.year) {
      if (!/^\d{4}$/.test(v.year)) return err('BAD_YEAR', '年份写四位数字，例如 2021', 'year');
      var y = parseInt(v.year, 10);
      if (y < YEAR_MIN || y > YEAR_MAX) {
        return err('BAD_YEAR', '年份看着不对，' + YEAR_MIN + '–' + YEAR_MAX + ' 之间', 'year');
      }
    }

    if (v.url) {
      var u = v.url;
      if (/^www\./i.test(u)) u = 'https://' + u;
      if (!/^https?:\/\/[^\s]+$/i.test(u)) {
        return err('BAD_URL', '网址要以 http:// 或 https:// 开头', 'url');
      }
      v.url = u;
    }

    var text = '';
    var head, tail;

    if (typeKey === 'J') {
      // 著者. 题名[J]. 刊名, 年, 卷(期): 页码.
      if (v.volume && !/^\d+$/.test(v.volume)) {
        return err('BAD_VOLUME', '卷一般只填数字', 'volume');
      }
      tail = v.journal;
      if (v.year) tail += ', ' + v.year;
      if (v.volume) tail += ', ' + v.volume;
      if (v.issue) tail += '(' + v.issue + ')';
      if (v.pages) tail += ': ' + normPages(v.pages);
      text = formatAuthors(v.authors) + '. ' + stripTail(v.title) + t.mark + '. ' + tail + '.';
    } else if (typeKey === 'M') {
      // 著者. 题名[M]. 版本. 出版地: 出版者, 年: 页码.
      head = formatAuthors(v.authors) + '. ' + stripTail(v.title) + t.mark + '. ';
      if (v.edition) head += editionText(v.edition) + '. ';
      head += joinPlace(v.place, v.publisher) + ', ' + v.year;
      if (v.pages) head += ': ' + normPages(v.pages);
      text = head + '.';
    } else if (typeKey === 'D') {
      // 著者. 题名[D]. 保存地: 保存单位, 年.
      text = formatAuthors(v.authors) + '. ' + stripTail(v.title) + t.mark + '. ' +
        joinPlace(v.place, v.school) + ', ' + v.year + '.';
    } else if (typeKey === 'C') {
      // 著者. 题名[C]//论文集名. 出版地: 出版者, 年: 页码.
      tail = stripTail(v.conf);
      var pub = joinPlace(v.place, v.publisher);
      if (pub) tail += '. ' + pub;
      tail += ', ' + v.year;
      if (v.pages) tail += ': ' + normPages(v.pages);
      text = formatAuthors(v.authors) + '. ' + stripTail(v.title) + t.mark + '//' + tail + '.';
    } else if (typeKey === 'P') {
      // 专利申请者. 专利题名: 专利号[P]. 公告日期.
      text = formatAuthors(v.authors) + '. ' + stripTail(v.title) + ': ' +
        v.num + t.mark + '. ' + v.date + '.';
    } else if (typeKey === 'S') {
      // 标准号 标准名称[S]. 出版地: 出版者, 年.
      var body = v.num + ' ' + stripTail(v.title) + t.mark + '.';
      var sp = joinPlace(v.place, v.publisher);
      if (sp) body += ' ' + sp + ',';
      body += ' ' + v.year + '.';
      text = body.replace(/\s+,/g, ',');
    } else if (typeKey === 'N') {
      // 著者. 题名[N]. 报纸名, 出版日期(版次).
      tail = v.paper + ', ' + v.date;
      if (v.edition) {
        tail += '(' + (/^\d+$/.test(v.edition) ? v.edition : clean(v.edition)) + ')';
      }
      text = formatAuthors(v.authors) + '. ' + stripTail(v.title) + t.mark + '. ' + tail + '.';
    } else {
      // 著者. 题名[EB/OL]. (发布日期)[引用日期]. 网址.
      var mid = '';
      if (v.pubdate) mid += '(' + v.pubdate + ')';
      mid += '[' + v.cited + ']';
      text = formatAuthors(v.authors) + '. ' + stripTail(v.title) + t.mark + '. ' +
        mid + '. ' + v.url + '.';
    }

    text = text.replace(/\s{2,}/g, ' ').replace(/\.\./g, '.').trim();

    return {
      ok: true,
      type: typeKey,
      mark: t.mark,
      cn: t.cn,
      text: text,
      authors: formatAuthors(v.authors),
      year: v.year || ''
    };
  }

  /* ---------------------------- 列表 ---------------------------- */

  function keyOf(text) {
    return String(text || '').replace(/\s+/g, '').toLowerCase();
  }

  function limitOf(unlocked) {
    return unlocked ? PRO_SAVE : FREE_SAVE;
  }

  /**
   * 加一条。判重按「去掉所有空白 + 小写」的全文，和顺序无关的重复一定拦得住。
   * @return {Object} { ok, code, message, list, index }
   */
  function addEntry(list, entry, limit) {
    var arr = (list || []).slice();
    if (!entry || !entry.text) return err('EMPTY', '还没有生成内容');
    var key = keyOf(entry.text);
    for (var i = 0; i < arr.length; i++) {
      if (keyOf(arr[i].text) === key) {
        return { ok: false, code: 'DUP', message: '这条已经在列表里了', list: arr, index: i };
      }
    }
    var lim = limit || FREE_SAVE;
    if (arr.length >= lim) {
      return { ok: false, code: 'FULL', message: '最多存 ' + lim + ' 条，解锁后能存 ' + PRO_SAVE + ' 条', list: arr };
    }
    arr.push({
      type: entry.type,
      mark: entry.mark,
      cn: entry.cn,
      text: entry.text,
      authors: entry.authors,
      year: entry.year
    });
    return { ok: true, list: arr, index: arr.length - 1 };
  }

  function removeEntry(list, index) {
    var arr = (list || []).slice();
    if (index < 0 || index >= arr.length) return arr;
    arr.splice(index, 1);
    return arr;
  }

  /** 排序：默认按录入顺序；year 按年倒序；author 按著者字母/拼音。 */
  function sortList(list, by) {
    var arr = (list || []).slice();
    if (by === 'year') {
      arr.sort(function (a, b) {
        var ya = parseInt(a.year, 10) || 0;
        var yb = parseInt(b.year, 10) || 0;
        if (yb !== ya) return yb - ya;
        return String(a.authors).localeCompare(String(b.authors), 'zh');
      });
    } else if (by === 'author') {
      arr.sort(function (a, b) {
        return String(a.authors).localeCompare(String(b.authors), 'zh');
      });
    }
    return arr;
  }

  /** 导出整份列表。mode: num（带 [1]）/ plain（不带序号）/ md（列表项） */
  function exportAll(list, mode) {
    var arr = list || [];
    if (!arr.length) return '';
    return arr.map(function (it, i) {
      if (mode === 'plain') return it.text;
      if (mode === 'md') return '- ' + it.text;
      return '[' + (i + 1) + '] ' + it.text;
    }).join('\n');
  }

  /* ---------------------------- 示例 ---------------------------- */

  var SAMPLES = {
    J: {
      authors: '王建国, 李海涛, 张明远, 陈志强',
      title: '碱性水电解制氢技术研究进展',
      journal: '化工进展',
      year: '2021',
      volume: '40',
      issue: '5',
      pages: '2541-2550'
    },
    J_EN: {
      authors: 'John A Smith, Kate Brown, Ming Li, Peter Wang',
      title: 'Shaking without quaking',
      journal: 'Science',
      year: '1998',
      volume: '279',
      issue: '5359',
      pages: '2063-2064'
    },
    M: {
      authors: '张三',
      title: '碱性电解槽设计与运行',
      edition: '2',
      place: '北京',
      publisher: '化学工业出版社',
      year: '2020',
      pages: '35-48'
    },
    D: {
      authors: '李四',
      title: '多堆碱性电解水系统调度优化研究',
      place: '郑州',
      school: '河南工业大学',
      year: '2026'
    },
    C: {
      authors: '王五, 赵六',
      title: '风光耦合制氢系统容量配置',
      conf: '中国可再生能源学会学术年会论文集',
      place: '北京',
      publisher: '中国电力出版社',
      year: '2023',
      pages: '112-118'
    },
    P: {
      authors: '刘洋',
      title: '一种碱性电解槽用复合隔膜及其制备方法',
      num: 'CN108765432A',
      date: '2023-05-14'
    },
    S: {
      num: 'GB/T 19774—2005',
      title: '水电解制氢系统技术要求',
      place: '北京',
      publisher: '中国标准出版社',
      year: '2005'
    },
    N: {
      authors: '孙倩',
      title: '绿氢成本还能降多少',
      paper: '光明日报',
      date: '2024-03-18',
      edition: '7'
    },
    EB: {
      authors: '国家能源局',
      title: '氢能产业发展中长期规划（2021—2035 年）',
      pubdate: '2022-03-23',
      cited: '2026-11-04',
      url: 'https://www.nea.gov.cn/2022-03/23/c_1310525055.htm'
    }
  };

  function sample(typeKey) {
    return SAMPLES[typeKey] || SAMPLES.J;
  }

  function emptyForm(typeKey) {
    var o = {};
    (TYPE_FIELDS[typeKey] || []).forEach(function (k) { o[k] = ''; });
    return o;
  }

  return {
    TYPES: TYPES,
    FREE_SAVE: FREE_SAVE,
    PRO_SAVE: PRO_SAVE,
    MAX_AUTHORS: MAX_AUTHORS,
    fieldsOf: fieldsOf,
    typeOf: function (k) { return TYPE_BY_KEY[k] || null; },
    build: build,
    formatAuthors: formatAuthors,
    formatOne: formatOne,
    normPages: normPages,
    addEntry: addEntry,
    removeEntry: removeEntry,
    sortList: sortList,
    exportAll: exportAll,
    limitOf: limitOf,
    sample: sample,
    emptyForm: emptyForm
  };
});
