/**
 * 文本润色引擎（纯逻辑，零依赖）
 * 同时可被微信小程序 require() 和浏览器 <script> 加载。
 *
 * 四种模式全部是本地规则运算，不接任何接口：
 * - 精简：删填充词 → 压缩冗余句式 → 合并重复片段 → 整理标点；减幅不足再删程度副词
 * - 扩写：补句间连接词 + 按关键词生成展开句（有字数上限，超了只补连接词）
 * - 口语转书面：口语词表替换 + 删句末语气词 + 感叹号转句号
 * - 改写降重：同义词替换（每个词条只用一次）+ 把字句转将字句 + 状语后置，随机种子可复现
 *
 * 为什么不用大模型：需求是本地跑、不登录、不联网。规则法做不到"懂语义"，
 * 但改的都是可验证的字符串操作，每条改动都能列出来给用户看。
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Polish = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MODES = [
    { id: 'tight', name: '精简', desc: '删掉填充词，同样的意思更短' },
    { id: 'expand', name: '扩写', desc: '补连接词和展开句，把话说完整' },
    { id: 'formal', name: '口语转书面', desc: '口语词换书面表达，去掉语气词' },
    { id: 'rewrite', name: '改写降重', desc: '换词换句式，重复率降下来' }
  ];

  var MAX_LEN = 1000;       // 单次处理的字数上限
  var MAX_EXPAND = 2600;    // 扩写后的硬上限，避免越写越长

  // ---------- 基础工具 ----------

  function normalize(raw) {
    var s = String(raw == null ? '' : raw);
    s = s.replace(/\r\n?/g, '\n');
    s = s.replace(/[\u3000\t]/g, ' ');
    s = s.replace(/ {2,}/g, ' ');
    s = s.replace(/ *\n */g, '\n');
    s = s.replace(/\n{3,}/g, '\n\n');
    return s.trim();
  }

  // 字数按非空白字符计，中英文一视同仁
  function countChars(s) {
    return String(s).replace(/\s/g, '').length;
  }

  // 按句末标点切句，保留分隔符；换行也算断句
  function splitSentences(text) {
    var out = [];
    var buf = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === '\n') {
        if (buf.trim()) out.push(buf.trim());
        buf = '';
        continue;
      }
      buf += ch;
      if ('。！？!?；;'.indexOf(ch) >= 0) {
        if (buf.trim()) out.push(buf.trim());
        buf = '';
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  function fixPunct(s) {
    s = s.replace(/[ \t]+([，。！？、；：])/g, '$1');
    s = s.replace(/，{2,}/g, '，');
    s = s.replace(/。{2,}/g, '。');
    s = s.replace(/，。/g, '。');
    s = s.replace(/、。/g, '。');
    s = s.replace(/；。/g, '。');
    s = s.replace(/([。！？])，/g, '$1');
    s = s.replace(/^[，。、；：]+/, '');
    s = s.replace(/\n{3,}/g, '\n\n');
    return s.trim();
  }

  /**
   * 逐条删字面量。长词优先，避免「我个人觉得」被「我觉得」拆坏。
   * 每命中一次记一条改动。
   */
  function delLiterals(text, words, changes, type) {
    var list = words.slice().sort(function (a, b) { return b.length - a.length; });
    var t = text;
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      var guard = 0;
      while (t.indexOf(w) >= 0 && guard < 8) {
        t = t.replace(w, '');
        changes.push({ from: w, to: '', type: type });
        guard++;
      }
    }
    return t;
  }

  function applyRules(text, rules, changes) {
    var t = text;
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      t = t.replace(r.re, function (m) {
        var rep = m.replace(r.re, r.rep);
        if (rep !== m) changes.push({ from: m, to: rep, type: r.type });
        return rep;
      });
    }
    return t;
  }

  // ---------- 精简 ----------

  var FILLERS = [
    '我个人觉得', '我个人认为', '在我看来', '说实话', '说真的', '其实吧', '其实',
    '基本上', '总的来说', '总体而言', '简单来说', '说白了', '怎么说呢',
    '这里需要注意的是', '需要指出的是', '众所周知', '毫无疑问',
    '在一定程度上', '某种程度上', '相对来说', '比较而言',
    '也就是说', '然后呢', '可以看到', '应该说', '可以说', '不得不'
  ];

  var REDUNDANT = [
    { re: /由于([^，。；]{1,20}?)的原因/g, rep: '因为$1', type: 'phrase' },
    { re: /因为([^，。；]{1,20}?)的原因/g, rep: '因为$1', type: 'phrase' },
    { re: /在([^，。；]{1,12}?)的情况下/g, rep: '在$1时', type: 'phrase' },
    { re: /在([^，。；]{1,12}?)的过程中/g, rep: '$1过程中', type: 'phrase' },
    { re: /当([^，。；]{1,12}?)的时候/g, rep: '当$1时', type: 'phrase' },
    { re: /如果([^，。；]{1,20}?)的话/g, rep: '如果$1', type: 'phrase' },
    { re: /对([^，。；]{1,12}?)进行(优化|调整|分析|研究|检查|处理|测试|评估|改造|升级|梳理)/g, rep: '$2$1', type: 'phrase' },
    { re: /进行了([^，。；]{1,12}?)的(优化|调整|分析|研究|改造|升级|评估)/g, rep: '$2了$1', type: 'phrase' },
    { re: /是否能够/g, rep: '能否', type: 'phrase' },
    { re: /能够/g, rep: '能', type: 'phrase' },
    { re: /([\u4e00-\u9fa5]{2,4})\1+/g, rep: '$1', type: 'repeat' }
  ];

  var REDUNDANT_B = [
    { re: /的时候/g, rep: '时', type: 'phrase' },
    { re: /的话/g, rep: '', type: 'phrase' },
    { re: /什么的/g, rep: '', type: 'phrase' },
    { re: /已经/g, rep: '', type: 'phrase' },
    { re: /一下子/g, rep: '', type: 'phrase' },
    { re: /等等等/g, rep: '等', type: 'phrase' }
  ];

  var DEGREE = ['非常', '十分', '特别', '真的', '确实', '相当', '极其', '格外'];

  function condense(text) {
    var changes = [];
    var t = text;

    t = delLiterals(t, FILLERS, changes, 'fill');
    t = applyRules(t, REDUNDANT, changes);
    t = fixPunct(t);

    var before = countChars(text);
    var cut = (before - countChars(t)) / Math.max(1, before);

    // 减幅不到 12% → 说明原文没什么水词，再往细里抠一层
    var second = false;
    if (cut < 0.12) {
      second = true;
      t = applyRules(t, REDUNDANT_B, changes);
      t = delLiterals(t, DEGREE, changes, 'degree');
      t = fixPunct(t);
    }

    var warning = '';
    if (countChars(t) >= before) {
      warning = '这段已经很紧凑了，没找到可删的冗余';
    } else if (second && (before - countChars(t)) / before < 0.08) {
      warning = '删的都是零碎词，减幅有限';
    }
    return { text: t, changes: changes, warning: warning };
  }

  // ---------- 扩写 ----------

  var CONNECTORS = ['同时', '更重要的是', '换句话说', '在此基础上', '进一步看', '从这个角度看'];

  var DETAIL = [
    '具体到{kw}这一环，细节往往比结论更要紧。',
    '换句话说，{kw}不是单点问题，而是一整套配合。',
    '放到实际场景里，{kw}的差别会被迅速放大。',
    '这一点，真正做过{kw}的人应该有体会。',
    '需要补充的是，{kw}的判断标准并不唯一。'
  ];

  var LEAD_STOP = /^(我们|我|你|他|她|它|这个|那个|其实|说实话|说白了|所以|但是|因为|如果|而且|并且|同时|另外|首先|其次|最后|然而|因此|在|从|对|和|与)+/;
  var LEAD_VERB = /^(觉得|认为|感觉|看到|发现|想|说|讲|知道)/;
  // 谓语/助动词标记：关键词取到它前面为止，避免把「很好用」当名词
  var PRED = /[是很太更要会能可该让把被有没不别太最挺较相当]/;
  // 关键词里出现这些字说明没抓到名词，直接用兜底词
  var BAD = '的了是我你他她它们觉说想能会要可把被没不就也还这那个些在到从对与';
  // 时间/指代类词不是好话题，抓到了也换兜底
  var REJECT = ['前期', '后期', '目前', '当前', '现在', '以后', '之前', '之后',
                '最近', '过去', '未来', '原来', '这里', '那里', '这种', '那种',
                '这样', '那样', '时候', '方面',
                '昨天', '今天', '明天', '前天', '后天', '上午', '下午', '晚上',
                '早上', '中午', '上周', '下周', '本月', '今年', '去年', '明年'];

  function pick(t) {
    var i = t.search(PRED);
    if (i === 0) return '';          // 一上来就是谓语，抓不到主语
    var head = i > 0 ? t.slice(0, i) : t;
    head = head.replace(/^[\u4e00-\u9fa5](?=[\u4e00-\u9fa5]{2,})/, function (c, off) {
      return off === 0 && '能会要可让把被去来用做'.indexOf(c) >= 0 ? '' : c;
    });
    // 两到四个字最稳；再长说明谓语没被拦住，只取前两字
    var kw = head.length >= 2 ? head.slice(0, head.length > 4 ? 2 : head.length) : '';
    if (kw.length < 2 || hasBad(kw, 1) || REJECT.indexOf(kw) >= 0 ||
        REJECT.indexOf(kw.slice(0, 2)) >= 0) return '';
    return kw;
  }

  function keywordOf(s) {
    var t = String(s).replace(/[，。！？、；：""''《》（）()\[\]\s]/g, '');
    t = t.replace(LEAD_STOP, '').replace(LEAD_VERB, '');
    if (!t) return '这件事';

    // 1) 「X的Y」优先取 X
    var m = t.match(/^([\u4e00-\u9fa5]{2,6})的/);
    if (m && !hasBad(m[1], 0) && REJECT.indexOf(m[1]) < 0) return m[1];

    // 2) 句首名词
    var c = pick(t);
    if (c) return c;

    // 3) 「的」后面那个词（前期的调研 → 调研）
    if (m) {
      c = pick(t.slice(m[0].length));
      if (c) return c;
    }
    return '这件事';
  }

  // floor: 允许出现在词尾的字数（两字词里第一个字必须干净）
  function hasBad(kw, floor) {
    for (var i = 0; i < kw.length - floor; i++) {
      if (BAD.indexOf(kw.charAt(i)) >= 0) return true;
    }
    return false;
  }

  function expand(text) {
    var sents = splitSentences(text);
    var changes = [];
    var out = [];
    var capped = false;
    var chars = countChars(text);
    var detail = 0;
    var MAX_DETAIL = 3;

    for (var i = 0; i < sents.length; i++) {
      var core = sents[i].replace(/[。！？!?；;\s]+$/, '');
      if (!core) continue;

      if (i > 0) {
        var pre = CONNECTORS[(i - 1) % CONNECTORS.length];
        if (core.indexOf(pre) !== 0) {
          core = pre + '，' + core;
          changes.push({ from: '句首', to: '加「' + pre + '」', type: 'connector' });
        }
      }
      out.push(core + '。');

      // 补几句展开：短句一句；长句按逗号子句数算，最多两句。
      // 全篇最多三句，再多就是注水了。
      var clauses = core.split('，').filter(function (x) { return x.trim(); });
      var want = countChars(core) <= 26
        ? 1
        : Math.min(2, Math.max(0, clauses.length - 1));

      for (var k = 0; k < want && detail < MAX_DETAIL; k++) {
        if (countChars(out.join('')) + 30 > MAX_EXPAND) { capped = true; break; }
        var src = clauses[Math.min(k, clauses.length - 1)] || core;
        var line = DETAIL[detail % DETAIL.length].replace(/\{kw\}/g, keywordOf(src));
        out.push(line);
        changes.push({ from: '补写', to: line.slice(0, 9) + '…', type: 'detail' });
        detail++;
      }
    }

    var t = fixPunct(out.join(''));
    var warning = '';
    if (capped) warning = '原文已经接近字数上限，只补了连接词';
    else if (chars <= 8) warning = '原文太短，展开句会占大头';
    return { text: t, changes: changes, warning: warning };
  }

  // ---------- 口语转书面 ----------

  // 长词在前，避免「我觉得」被单字规则拆散
  var FORMAL = [
    ['我觉得', '笔者认为'], ['我认为', '笔者认为'], ['我感觉', '可以认为'],
    ['我个人', '笔者'], ['咱们', '我们'], ['你看', ''], ['说白了', '简言之'],
    ['挺不错', '较为理想'], ['很不错', '较为理想'], ['挺好的', '较好'],
    ['挺好', '较好'], ['挺', '较为'],
    ['这个东西', '该事物'], ['那个东西', '该事物'], ['东西', '事物'],
    ['能不能', '能否'], ['行不行', '是否可行'], ['差不多', '大致'],
    ['大概', '约为'], ['好多', '许多'], ['一点儿', '少量'], ['马上', '立即'],
    ['老是', '频繁'], ['一下子', '迅速'], ['现在', '当前'], ['以后', '此后'],
    ['咋', '如何'], ['啥', '什么'], ['真的', '确实'], ['特别', '尤为'],
    ['搞', '开展'], ['弄', '处理'], ['不过', '然而'], ['所以', '因此'],
    ['而且', '并且'], ['还有', '此外'], ['比如', '例如'], ['反正', '无论如何'],
    ['很', '较']
  ];

  // 这些词里的「吧」不是语气词
  var KEEP_WORDS = ['酒吧', '网吧', '贴吧', '书吧', '氧吧', '茶吧', '吧台'];

  function dropModal(t) {
    // 句末语气词：只在标点前删，且排除「酒吧。」这类
    return t.replace(/([\u4e00-\u9fa5])([啊吧呢嘛哈呀哦啦])([。！？，,.!?])/g, function (m, pre, mod, p) {
      if (KEEP_WORDS.indexOf(pre + mod) >= 0) return m;
      return pre + p;
    }).replace(/([啊吧呢嘛哈呀哦啦])([。！？])/g, '$2');
  }

  function formal(text) {
    var changes = [];
    var t = text;
    var pairs = FORMAL.slice().sort(function (a, b) { return b[0].length - a[0].length; });

    for (var i = 0; i < pairs.length; i++) {
      var from = pairs[i][0], to = pairs[i][1];
      var guard = 0;
      while (t.indexOf(from) >= 0 && guard < 8) {
        t = t.replace(from, to);
        changes.push({ from: from, to: to, type: 'word' });
        guard++;
      }
    }

    var beforeModal = t;
    t = dropModal(t);
    if (t !== beforeModal) changes.push({ from: '语气词', to: '已删除', type: 'modal' });

    var bang = (t.match(/！/g) || []).length;
    if (bang) changes.push({ from: '！×' + bang, to: '。', type: 'punct' });
    t = t.replace(/！/g, '。').replace(/~/g, '');
    t = fixPunct(t);

    var warning = '';
    if (countChars(t) === countChars(text) && changes.length === 0) {
      warning = '没识别到口语词，原文可能已经偏书面';
    }
    return { text: t, changes: changes, warning: warning };
  }

  // ---------- 改写降重 ----------

  var SYN = [
    ['需要', '须'], ['进行', '开展'], ['提高', '提升'], ['降低', '减少'],
    ['使用', '采用'], ['目前', '当前'], ['主要', '首要'], ['重要', '关键'],
    ['因为', '由于'], ['所以', '因此'], ['但是', '然而'], ['如果', '倘若'],
    ['可以', '能够'], ['很多', '诸多'], ['一些', '若干'], ['非常', '颇为'],
    ['帮助', '有助于'], ['发现', '发觉'], ['效果', '成效'], ['影响', '作用'],
    ['情况', '情形'], ['时候', '时'], ['开始', '着手'], ['完成', '达成'],
    ['选择', '选取'], ['方法', '办法'], ['问题', '难点'], ['要求', '需'],
    ['保证', '确保'], ['建立', '构建'], ['增加', '增多'], ['减少', '削减'],
    ['支持', '支撑'], ['包括', '涵盖'], ['认为', '主张'], ['展示', '呈现']
  ];

  var SYN_NO = [];   // 目前没有需要排除的词条，留个位置方便后续加

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function structural(s, rnd, changes) {
    if (s.indexOf('把') >= 0 && rnd() < 0.85) {
      s = s.replace('把', '将');
      changes.push({ from: '把', to: '将', type: 'struct' });
    }
    if (/对[^，。；]{1,10}?进行/.test(s)) {
      s = s.replace(/对([^，。；]{1,10}?)进行/g, '对$1加以');
      changes.push({ from: '对…进行', to: '对…加以', type: 'struct' });
    }
    // 状语后置：在成本上，我们做了优化。 → 我们做了优化，在成本上。
    var m = s.match(/^在([^，。；]{2,12}?)(上|方面|层面|中)，(.{4,})$/);
    if (m && rnd() < 0.5) {
      s = m[3] + '，在' + m[1] + m[2];
      changes.push({ from: '在' + m[1] + m[2] + '，…', to: '…，在' + m[1] + m[2], type: 'struct' });
    }
    return s;
  }

  function rewrite(text, opt) {
    opt = opt || {};
    var seed = parseInt(opt.seed, 10);
    if (!seed || seed < 1) seed = 1;
    var rnd = mulberry32(seed);
    var changes = [];
    var used = {};
    var sents = splitSentences(text);
    var out = [];

    for (var i = 0; i < sents.length; i++) {
      var s = sents[i];

      // 收集候选，洗牌后按句子长度决定改几处（长句多改）
      var cands = [];
      for (var j = 0; j < SYN.length; j++) {
        var p = SYN[j];
        if (SYN_NO.indexOf(p[1]) >= 0) continue;
        if (used[p[0]]) continue;
        if (s.indexOf(p[0]) >= 0) cands.push(p);
      }
      for (var k = cands.length - 1; k > 0; k--) {
        var r = Math.floor(rnd() * (k + 1));
        var tmp = cands[k]; cands[k] = cands[r]; cands[r] = tmp;
      }
      // 每句改几处：句子越长改得越多，但一句最多四处，避免读起来不像人话
      var limit = Math.max(2, Math.min(4, Math.round(s.length / 30)));

      for (var n = 0; n < cands.length && limit > 0; n++) {
        var from = cands[n][0], to = cands[n][1];
        if (used[from]) continue;
        var at = s.indexOf(from);
        if (at < 0) continue;
        s = s.slice(0, at) + to + s.slice(at + from.length);
        used[from] = true;
        changes.push({ from: from, to: to, type: 'syn' });
        limit--;
      }

      s = structural(s, rnd, changes);
      out.push(s);
    }

    var t = fixPunct(out.join(''));
    var warning = '';
    if (t === text) warning = '这段可替换的词太少，建议手动改两句';
    else if (changes.length < 2) warning = '只改了少量词，重复率下降有限';
    return { text: t, changes: changes, warning: warning };
  }

  // ---------- 入口 ----------

  /**
   * @param {String} raw  原文
   * @param {String} mode tight | expand | formal | rewrite
   * @param {Object} opt  { seed } 仅 rewrite 用
   * @returns {Object} { ok, text, mode, changes, warning, before, after }
   */
  function polish(raw, mode, opt) {
    var text = normalize(raw);
    var m = mode && modeName(mode) ? mode : 'tight';

    if (!text) {
      return { ok: false, code: 'EMPTY', message: '先贴上要处理的文字', changes: [] };
    }
    if (text.length > MAX_LEN) {
      return {
        ok: false, code: 'TOO_LONG',
        message: '超过 ' + MAX_LEN + ' 字了，分段处理更准',
        changes: []
      };
    }

    var r;
    if (m === 'tight') r = condense(text);
    else if (m === 'expand') r = expand(text);
    else if (m === 'formal') r = formal(text);
    else r = rewrite(text, opt);

    var before = countChars(text);
    var after = countChars(r.text);
    var changes = r.changes.slice(0, 8);

    return {
      ok: true,
      mode: m,
      modeName: modeName(m),
      text: r.text,
      changes: changes,
      changeCount: r.changes.length,
      warning: r.warning || '',
      before: { chars: before, sentences: splitSentences(text).length },
      after: { chars: after, sentences: splitSentences(r.text).length },
      delta: after - before,
      ratio: before ? after / before : 1
    };
  }

  function modeName(id) {
    for (var i = 0; i < MODES.length; i++) if (MODES[i].id === id) return MODES[i].name;
    return '';
  }

  function modeDesc(id) {
    for (var i = 0; i < MODES.length; i++) if (MODES[i].id === id) return MODES[i].desc;
    return '';
  }

  return {
    MODES: MODES,
    MAX_LEN: MAX_LEN,
    MAX_EXPAND: MAX_EXPAND,
    normalize: normalize,
    countChars: countChars,
    splitSentences: splitSentences,
    polish: polish,
    modeName: modeName,
    modeDesc: modeDesc,
    _syn: SYN
  };
});
