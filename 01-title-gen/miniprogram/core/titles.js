/**
 * 标题生成引擎（纯逻辑，零依赖）
 * 同时可被微信小程序 require() 和浏览器 <script> 加载。
 *
 * 设计要点：
 * - 不接任何 AI 接口，本地词库 + 模板组合，离线可用
 * - 模板带 style 标签，选风格时优先命中，不足时跨风格补齐
 * - 记录已用模板，尽量不重复；池子用尽自动重置
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TitleGen = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STYLES = [
    { id: 'viral', name: '爆款', desc: '强钩子，前三字抓人' },
    { id: 'heart', name: '走心', desc: '情绪共鸣，慢一点' },
    { id: 'sell', name: '带货', desc: '卖点前置，临门一脚' }
  ];

  var PLATFORMS = [
    { id: 'douyin', name: '抖音', hint: '口语 / 短 / 有冲突' },
    { id: 'xhs', name: '小红书', hint: '笔记感 / 可收藏' }
  ];

  // {t} = 主题占位。每条只出现一次，保证替换后语义完整。
  var TEMPLATES = {
    douyin: [
      { id: 'dy-v1', style: 'viral', text: '我用了半年{t}，说点没人说的' },
      { id: 'dy-v2', style: 'viral', text: '别再乱买{t}了，先看完这30秒' },
      { id: 'dy-v3', style: 'viral', text: '{t}的坑我替你踩完了，直接抄作业' },
      { id: 'dy-v4', style: 'viral', text: '这个{t}，我劝你别急着买' },
      { id: 'dy-v5', style: 'viral', text: '所有人都在夸{t}，我来说句实话' },
      { id: 'dy-v6', style: 'viral', text: '{t}选错一次，等于白花钱' },
      { id: 'dy-v7', style: 'viral', text: '关于{t}，我只说三句真话' },
      { id: 'dy-v8', style: 'viral', text: '我退了三个{t}，最后留下这个' },
      { id: 'dy-v9', style: 'viral', text: '{t}便宜的反而更稳，说个反常识' },
      { id: 'dy-v10', style: 'viral', text: '我把{t}换了，原因很现实' },
      { id: 'dy-v11', style: 'viral', text: '{t}值不值？我拆开算了笔账' },
      { id: 'dy-v12', style: 'viral', text: '做{t}这行的人，从来不这么挑' },

      { id: 'dy-h1', style: 'heart', text: '原来{t}也能这么温柔' },
      { id: 'dy-h2', style: 'heart', text: '关于{t}，我想说句心里话' },
      { id: 'dy-h3', style: 'heart', text: '我妈留下的那个{t}，我一直没换' },
      { id: 'dy-h4', style: 'heart', text: '一个人住之后，我才懂{t}的意义' },
      { id: 'dy-h5', style: 'heart', text: '{t}不贵，贵的是当时那份心意' },
      { id: 'dy-h6', style: 'heart', text: '用了十年{t}，才明白简单最好' },
      { id: 'dy-h7', style: 'heart', text: '深夜看到{t}，突然有点想家' },
      { id: 'dy-h8', style: 'heart', text: '那个{t}旧了，我还是舍不得扔' },

      { id: 'dy-s1', style: 'sell', text: '{t}这个价，闭眼入' },
      { id: 'dy-s2', style: 'sell', text: '{t}｜同价位真没对手' },
      { id: 'dy-s3', style: 'sell', text: '我把它放购物车半年，今天终于下单' },
      { id: 'dy-s4', style: 'sell', text: '{t}实测：三个细节打动我' },
      { id: 'dy-s5', style: 'sell', text: '这波{t}不囤，下次还得等' },
      { id: 'dy-s6', style: 'sell', text: '{t}到手第一件事，先看这里' },
      { id: 'dy-s7', style: 'sell', text: '预算有限就买这个{t}，不踩坑' },
      { id: 'dy-s8', style: 'sell', text: '{t}到底怎么选？一句话结论' }
    ],
    xhs: [
      { id: 'xhs-v1', style: 'viral', text: '{t}真的被我挖到宝了' },
      { id: 'xhs-v2', style: 'viral', text: '后悔没早点知道｜{t}怎么选' },
      { id: 'xhs-v3', style: 'viral', text: '{t}踩雷日记，血泪总结' },
      { id: 'xhs-v4', style: 'viral', text: '被问爆的{t}，一次性说清' },
      { id: 'xhs-v5', style: 'viral', text: '我大概是全网最会挑{t}的人' },
      { id: 'xhs-v6', style: 'viral', text: '{t}清单｜照着买不出错' },
      { id: 'xhs-v7', style: 'viral', text: '用了三个月，{t}我只推这一个' },
      { id: 'xhs-v8', style: 'viral', text: '{t}避坑指南，看完省一半钱' },
      { id: 'xhs-v9', style: 'viral', text: '劝退帖｜这三类{t}别碰' },
      { id: 'xhs-v10', style: 'viral', text: '挑{t}我只认这四条标准' },

      { id: 'xhs-h1', style: 'heart', text: '{t}陪我的第一千天' },
      { id: 'xhs-h2', style: 'heart', text: '关于{t}的一点小执念' },
      { id: 'xhs-h3', style: 'heart', text: '我的{t}有点旧，但舍不得换' },
      { id: 'xhs-h4', style: 'heart', text: '{t}这件小事，治愈了我一整天' },
      { id: 'xhs-h5', style: 'heart', text: '给{t}腾出一块地方，值' },
      { id: 'xhs-h6', style: 'heart', text: '搬家三次，{t}我每次都带着' },
      { id: 'xhs-h7', style: 'heart', text: '原来好{t}是这种感觉' },

      { id: 'xhs-s1', style: 'sell', text: '{t}｜自用回购第三次' },
      { id: 'xhs-s2', style: 'sell', text: '{t}到手，比想象中好用' },
      { id: 'xhs-s3', style: 'sell', text: '这个{t}我逢人就推' },
      { id: 'xhs-s4', style: 'sell', text: '{t}｜性价比选手，闭眼冲' },
      { id: 'xhs-s5', style: 'sell', text: '{t}开箱｜实拍无滤镜' },
      { id: 'xhs-s6', style: 'sell', text: '花小钱的{t}，用出了高级感' },
      { id: 'xhs-s7', style: 'sell', text: '{t}对比了三家，结论在这' }
    ]
  };

  var MAX_LEN = 30;      // 超过则提示，不硬截断
  var STORE_KEY = 'tg_used_v1';

  function normalizeTopic(raw) {
    var s = String(raw == null ? '' : raw).trim();
    s = s.replace(/\s+/g, ' ');
    s = s.replace(/[。！？，、；：,.!?,;:]+$/g, '');
    return s;
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function fill(tpl, topic) {
    return tpl.split('{t}').join(topic);
  }

  /**
   * 生成标题
   * @param {Object} opt
   *  - topic    主题词，必填
   *  - platform 'douyin' | 'xhs'
   *  - style    'viral' | 'heart' | 'sell'
   *  - count    需要条数
   *  - exclude  已用过的模板 id（跨轮次去重）
   * @returns {Object} { ok, list:[{id,text,style,styleName,long,first,length}], usedIds, warning }
   */
  function generate(opt) {
    opt = opt || {};
    var topic = normalizeTopic(opt.topic);
    var platform = TEMPLATES[opt.platform] ? opt.platform : 'douyin';
    var style = opt.style || 'viral';
    var count = Math.max(1, Math.min(30, parseInt(opt.count, 10) || 3));
    var exclude = opt.exclude || [];

    if (!topic) {
      return { ok: false, code: 'EMPTY_TOPIC', message: '先输入产品或者主题', list: [], usedIds: exclude };
    }
    if (topic.length > MAX_LEN) {
      return {
        ok: false, code: 'TOPIC_TOO_LONG',
        message: '主题太长了，控制在 ' + MAX_LEN + ' 字以内更准', list: [], usedIds: exclude
      };
    }

    var pool = TEMPLATES[platform];
    var usedSet = {};
    exclude.forEach(function (id) { usedSet[id] = true; });

    // 1) 同风格优先，2) 再跨风格补，3) 最后重置重复使用
    var primary = pool.filter(function (t) { return t.style === style; });
    var secondary = pool.filter(function (t) { return t.style !== style; });

    var picked = [];
    var inBatch = {};   // 本轮内绝不重复，即使池子用尽
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
      pickFrom(primary.concat(secondary), true);   // 池子用尽，允许重复
      warning = '可用角度用完了，换一批主题或换个风格会更好';
    } else if (picked.length > 0) {
      var mixed = picked.some(function (t) { return t.style !== style; });
      if (mixed) {
        var sn = '';
        for (var k = 0; k < STYLES.length; k++) if (STYLES[k].id === style) sn = STYLES[k].name;
        warning = '「' + sn + '」角度有限，已混入其他风格补齐';
      }
    }

    var styleMap = {};
    STYLES.forEach(function (s) { styleMap[s.id] = s.name; });

    var list = picked.slice(0, count).map(function (t, i) {
      var text = fill(t.text, topic);
      // 长度标记与「首推」是两个独立维度，不能共用一个字段
      return {
        id: t.id,
        text: text,
        style: t.style,
        styleName: styleMap[t.style] || '',
        long: text.length > MAX_LEN,   // 超过建议长度只提示，不截断（截断会破坏语义）
        first: i === 0,
        length: text.length
      };
    });

    return {
      ok: true,
      list: list,
      usedIds: Object.keys(usedSet),
      warning: warning
    };
  }

  function styleName(id) {
    for (var i = 0; i < STYLES.length; i++) if (STYLES[i].id === id) return STYLES[i].name;
    return '';
  }

  return {
    STYLES: STYLES,
    PLATFORMS: PLATFORMS,
    MAX_LEN: MAX_LEN,
    normalizeTopic: normalizeTopic,
    generate: generate,
    styleName: styleName,
    _templates: TEMPLATES
  };
});
