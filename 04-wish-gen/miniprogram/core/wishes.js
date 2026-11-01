/**
 * 祝福语生成引擎（纯逻辑，零依赖）
 * 同时可被微信小程序 require() 和浏览器 <script> 加载。
 *
 * 设计要点：
 * - 不接任何 AI 接口，本地模板库 + 场景/语气两层标签，离线可用
 * - 场景决定「说什么事」，语气决定「用什么口气」，两层正交组合
 * - 模板里的 {n} 只出现一次，替换后句子读得通，不会出现半句话
 * - 记录已用模板，同一个人连续点不会拿到重样的；池子用尽才允许重复并给出提示
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WishGen = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SCENES = [
    { id: 'birthday', name: '生日', hint: '祝一整年，不只是当天' },
    { id: 'midautumn', name: '中秋', hint: '团圆和月亮，别写得太满' },
    { id: 'newyear', name: '拜年', hint: '新年问候，热乎一点' },
    { id: 'opening', name: '开业', hint: '开张道贺，图个吉利' }
  ];

  var TONES = [
    { id: 'warm', name: '温暖', desc: '像熟人说话，有分寸的亲近' },
    { id: 'formal', name: '得体', desc: '对长辈 / 客户，礼数到位' },
    { id: 'funny', name: '俏皮', desc: '发给朋友，能笑一下' }
  ];

  // {n} = 名字占位。每条只出现一次，保证替换后语义完整。
  var TEMPLATES = {
    birthday: {
      warm: [
        { id: 'bd-w1', text: '{n}，生日快乐。愿新的一岁，想要的都到来得刚刚好。' },
        { id: 'bd-w2', text: '{n}，又长大一岁啦。愿你被生活温柔对待，也被自己认真喜欢。' },
        { id: 'bd-w3', text: '今天是{n}的日子。愿你许下的愿望，都在这一年里慢慢应验。' },
        { id: 'bd-w4', text: '{n}，生日快乐。愿你有蛋糕、有鲜花，还有一整年的好运气。' },
        { id: 'bd-w5', text: '{n}，祝你生日快乐。往后每一年，都比上一年更自在一点。' }
      ],
      formal: [
        { id: 'bd-f1', text: '{n}，谨祝生日快乐。愿事业顺遂，身体康健，诸事如意。' },
        { id: 'bd-f2', text: '值{n}生辰，谨致祝贺。愿新的一年，所行皆坦途，所愿皆有成。' },
        { id: 'bd-f3', text: '{n}，生日快乐。感念一路同行，谨祝前程似锦，阖家安好。' },
        { id: 'bd-f4', text: '欣闻{n}生辰，谨表祝贺。愿岁岁平安，事事顺遂。' },
        { id: 'bd-f5', text: '{n}，恭祝生日快乐。愿工作顺利，家宅安宁，福气绵长。' }
      ],
      funny: [
        { id: 'bd-j1', text: '{n}，生日快乐！蛋糕先吃，卡路里明天再说。' },
        { id: 'bd-j2', text: '{n}，又一岁了。愿你的钱包和年龄一起涨，烦恼一起掉。' },
        { id: 'bd-j3', text: '祝{n}生日快乐！许愿的时候记得贪心一点，反正不要钱。' },
        { id: 'bd-j4', text: '{n}，生日快乐。愿你想吃就吃，想睡就睡，谁也管不着。' },
        { id: 'bd-j5', text: '{n}，生日快乐！今年别熬夜了——好吧，尽量。' }
      ]
    },

    midautumn: {
      warm: [
        { id: 'ma-w1', text: '{n}，中秋快乐。月亮很圆，愿你想见的人都在身边。' },
        { id: 'ma-w2', text: '{n}，又是一年中秋。愿你手里的月饼是甜的，心里的事是顺的。' },
        { id: 'ma-w3', text: '中秋到了，{n}。愿这一晚的月光，替我把想念捎给你。' },
        { id: 'ma-w4', text: '{n}，中秋快乐。愿你和家人围坐一桌，话不多但都暖心。' },
        { id: 'ma-w5', text: '{n}，月亮今晚很亮。愿你抬头的时候，刚好也在想家。' }
      ],
      formal: [
        { id: 'ma-f1', text: '{n}，谨祝中秋佳节快乐。愿阖家团圆，诸事顺遂。' },
        { id: 'ma-f2', text: '值此中秋，谨向{n}致以问候。愿月圆人安，事业顺达。' },
        { id: 'ma-f3', text: '{n}，中秋安康。感念支持，谨祝家和人顺，四时吉祥。' },
        { id: 'ma-f4', text: '中秋佳节，敬祝{n}节日愉快。愿阖家康泰，万事胜意。' },
        { id: 'ma-f5', text: '{n}，谨贺中秋。愿月满人和，所愿皆成。' }
      ],
      funny: [
        { id: 'ma-j1', text: '{n}，中秋快乐！月饼随便吃，体重秤今天就别看了。' },
        { id: 'ma-j2', text: '{n}，中秋到。愿你的假期比月饼馅还实在。' },
        { id: 'ma-j3', text: '祝{n}中秋快乐！五仁月饼有人爱，你也一定有人惦记。' },
        { id: 'ma-j4', text: '{n}，中秋快乐。月亮负责圆，你负责吃。' },
        { id: 'ma-j5', text: '{n}，中秋快乐！今晚的月亮免费，记得抬头领一下。' }
      ]
    },

    newyear: {
      warm: [
        { id: 'ny-w1', text: '{n}，新年好。愿新的一年，日子过得比想的顺一点。' },
        { id: 'ny-w2', text: '{n}，过年好。愿你身边的人还是那些人，日子却一年比一年好。' },
        { id: 'ny-w3', text: '新年到了，{n}。愿你去的地方都有好天气，见的人都带笑意。' },
        { id: 'ny-w4', text: '{n}，新年快乐。愿新的一年少些为难，多些如愿。' },
        { id: 'ny-w5', text: '{n}，过年好。愿你有热饭吃，有话说，有人等。' }
      ],
      formal: [
        { id: 'ny-f1', text: '{n}，谨贺新禧。愿新的一年事业精进，阖家安康。' },
        { id: 'ny-f2', text: '值此新春，谨向{n}致以问候。愿诸事顺遂，福气常在。' },
        { id: 'ny-f3', text: '{n}，恭祝新春愉快。感念一年来的支持，谨祝来年顺遂，诸事有成。' },
        { id: 'ny-f4', text: '新春佳节，敬祝{n}身体健康，工作顺利，阖家幸福。' },
        { id: 'ny-f5', text: '{n}，谨祝新年吉祥。愿所行皆稳，所愿皆达。' }
      ],
      funny: [
        { id: 'ny-j1', text: '{n}，新年好！新的一年，愿你的计划都能执行到第二天。' },
        { id: 'ny-j2', text: '{n}，过年好。红包可以不收，祝福必须收下。' },
        { id: 'ny-j3', text: '祝{n}新年快乐！体重涨一点没事，工资涨一点更好。' },
        { id: 'ny-j4', text: '{n}，新年快乐。愿你今年立的 flag，至少倒得优雅一点。' },
        { id: 'ny-j5', text: '{n}，过年好！饭桌上别客气，反正胖了也没人认出来。' }
      ]
    },

    opening: {
      warm: [
        { id: 'op-w1', text: '{n}，开业大吉。愿门口人不断，账上钱不少。' },
        { id: 'op-w2', text: '听说{n}开业了。愿这一间小店，撑得起你所有认真。' },
        { id: 'op-w3', text: '{n}，开业顺利。愿第一批客人变成回头客，回头客变成老朋友。' },
        { id: 'op-w4', text: '{n}，恭喜开业。愿生意一天比一天稳，日子一年比一年宽。' },
        { id: 'op-w5', text: '{n}，开张大吉。愿灯常亮，门常开，客常来。' }
      ],
      formal: [
        { id: 'op-f1', text: '{n}，谨祝开业大吉。愿客源广进，事业日隆。' },
        { id: 'op-f2', text: '欣闻{n}开业，谨致祝贺。愿生意兴隆，诸事顺遂。' },
        { id: 'op-f3', text: '{n}，恭贺开业。愿鸿图大展，财源广进。' },
        { id: 'op-f4', text: '值此{n}开业之际，谨表祝贺。愿经营顺利，前景可观。' },
        { id: 'op-f5', text: '{n}，谨贺开张。愿门庭若市，基业长稳。' }
      ],
      funny: [
        { id: 'op-j1', text: '{n}，开业大吉！愿你数钱数到手抽筋，关门关到不想关。' },
        { id: 'op-j2', text: '{n}，恭喜开业。愿第一个月就忙到没空看这条祝福。' },
        { id: 'op-j3', text: '祝{n}开业顺利！客人多得排队，成本低得离谱。' },
        { id: 'op-j4', text: '{n}，开张大吉。愿你只愁生意太好，不愁生意没有。' },
        { id: 'op-j5', text: '{n}，开业快乐！记得给自己留一天休息，别一开张就全年无休。' }
      ]
    }
  };

  var MAX_NAME = 12;       // 超过就不像称呼，像一段话了
  var MAX_COUNT = 15;      // 单场景模板池上限（3 种语气 × 5 条），再要也没有新的
  var SMS_UNIT = 70;       // 一条短信的字数上限，超了会被运营商拆条

  // 把语气标回模板本身。补齐时会混入别的语气，标签必须跟着模板走，
  // 否则用户会看到一条正式口吻的句子被标成「温暖」。
  Object.keys(TEMPLATES).forEach(function (sc) {
    Object.keys(TEMPLATES[sc]).forEach(function (tn) {
      TEMPLATES[sc][tn].forEach(function (t) {
        t.tone = tn;
        t.scene = sc;
      });
    });
  });

  function normalizeName(raw) {
    var s = String(raw == null ? '' : raw).trim();
    s = s.replace(/\s+/g, ' ');
    s = s.replace(/[。！？，、；：,.!?,;:]+$/g, '');
    return s;
  }

  function isScene(id) {
    for (var i = 0; i < SCENES.length; i++) if (SCENES[i].id === id) return true;
    return false;
  }

  function isTone(id) {
    for (var i = 0; i < TONES.length; i++) if (TONES[i].id === id) return true;
    return false;
  }

  function nameOf(id, list) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
    return '';
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function smsParts(text) {
    var n = String(text == null ? '' : text).length;
    return Math.max(1, Math.ceil(n / SMS_UNIT));
  }

  /**
   * 生成祝福语
   * @param {Object} opt
   *  - name     收祝福的人，必填
   *  - scene    'birthday' | 'midautumn' | 'newyear' | 'opening'
   *  - tone     'warm' | 'formal' | 'funny'
   *  - count    需要条数
   *  - exclude  已用过的模板 id，跨轮次去重
   * @returns {Object} { ok, list, usedIds, warning } 或 { ok:false, code, message }
   */
  function generate(opt) {
    opt = opt || {};
    var name = normalizeName(opt.name);
    var scene = isScene(opt.scene) ? opt.scene : 'birthday';
    var tone = isTone(opt.tone) ? opt.tone : 'warm';
    var count = parseInt(opt.count, 10);
    if (isNaN(count)) count = 3;              // undefined / 非数字 → 默认 3
    count = Math.max(1, Math.min(MAX_COUNT, count));   // 0 也要抬到 1
    var exclude = opt.exclude || [];

    if (!name) {
      return { ok: false, code: 'EMPTY_NAME', message: '先写上要祝福的人', list: [], usedIds: exclude };
    }
    if (name.length > MAX_NAME) {
      return {
        ok: false, code: 'NAME_TOO_LONG',
        message: '名字太长了，控制在 ' + MAX_NAME + ' 字以内', list: [], usedIds: exclude
      };
    }

    var byTone = TEMPLATES[scene];
    var usedSet = {};
    exclude.forEach(function (id) { usedSet[id] = true; });

    var primary = byTone[tone] || [];
    var secondary = [];
    TONES.forEach(function (t) {
      if (t.id !== tone) secondary = secondary.concat(byTone[t.id] || []);
    });

    var picked = [];
    var inBatch = {};
    var pickFrom = function (arr, allowRepeat) {
      shuffle(arr).forEach(function (t) {
        if (picked.length >= count) return;
        if (inBatch[t.id]) return;
        if (!allowRepeat && usedSet[t.id]) return;
        picked.push(t);
        inBatch[t.id] = true;
        usedSet[t.id] = true;
      });
    };

    pickFrom(primary, false);
    if (picked.length < count) pickFrom(secondary, false);

    var warning = '';
    if (picked.length < count) {
      pickFrom(primary.concat(secondary), true);
      warning = '这个场景的说法用完了，换个人名或换个语气试试';
    } else if (picked.length > 0) {
      var mixed = picked.some(function (t) { return t.tone !== tone; });
      if (mixed) warning = '「' + nameOf(tone, TONES) + '」的说法有限，已混入其他语气补齐';
    }

    var list = picked.slice(0, count).map(function (t, i) {
      var text = t.text.split('{n}').join(name);
      return {
        id: t.id,
        text: text,
        scene: t.scene,
        sceneName: nameOf(t.scene, SCENES),
        tone: t.tone,
        toneName: nameOf(t.tone, TONES),
        length: text.length,
        parts: smsParts(text),
        hasName: text.indexOf(name) >= 0,
        first: i === 0
      };
    });

    return { ok: true, list: list, usedIds: Object.keys(usedSet), warning: warning };
  }

  return {
    SCENES: SCENES,
    TONES: TONES,
    MAX_NAME: MAX_NAME,
    MAX_COUNT: MAX_COUNT,
    SMS_UNIT: SMS_UNIT,
    normalizeName: normalizeName,
    smsParts: smsParts,
    generate: generate,
    _templates: TEMPLATES
  };
});
