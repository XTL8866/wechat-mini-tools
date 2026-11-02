/**
 * 起名引擎（纯逻辑，零依赖）
 * 同时可被微信小程序 require() 和浏览器 <script> 加载。
 *
 * 设计要点：
 * - 不接任何 AI 接口，本地字库 + 关键词命中 + 音韵打分，离线可用
 * - 每个字自带拼音、声调、笔画、语义标签、一句寓意；名字的寓意是字义的拼接，
 *   不是随机拼出来的漂亮话
 * - 关键词做双向子串匹配（输入「山」能同时捞到 tags 里标了「山」的字），
 *   命中字加权，未命中也不会空手而归
 * - 音韵按真实规则扣分：三声连读拗口、同声母粘牙、和姓同音听不出边界
 * - 同一批里首字尽量不重复，避免十条结果长得像一条
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NameGen = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TYPES = [
    { id: 'boy', name: '男孩', hint: '偏硬朗，读着站得住' },
    { id: 'girl', name: '女孩', hint: '偏柔和，但不刻意' },
    { id: 'neutral', name: '中性', hint: '男女都能用，不设限' },
    { id: 'brand', name: '品牌', hint: '短、好记、不生僻，不用填姓' }
  ];

  /**
   * 字库
   * c 字 / py 拼音 / t 声调 / s 笔画 / g 倾向(b 男 g 女 n 中性) / tags 语义标签 / m 寓意
   */
  var CHARS = [
    // —— 山石一路 ——
    { c: '山', py: 'shān', t: 1, s: 3, g: 'b', tags: ['山'], m: '山势沉稳，立着不动' },
    { c: '岳', py: 'yuè', t: 4, s: 8, g: 'b', tags: ['山'], m: '高山之巅，气象开阔' },
    { c: '峰', py: 'fēng', t: 1, s: 10, g: 'b', tags: ['山'], m: '山脊之顶，向上而止' },
    { c: '屹', py: 'yì', t: 4, s: 6, g: 'b', tags: ['山'], m: '巍然不动，站得住' },
    { c: '峻', py: 'jùn', t: 4, s: 10, g: 'b', tags: ['山'], m: '山高而陡，带一点锋' },
    { c: '岩', py: 'yán', t: 2, s: 8, g: 'b', tags: ['山', '石'], m: '岩石坚实，经得住磨' },
    { c: '岚', py: 'lán', t: 2, s: 7, g: 'n', tags: ['山', '云'], m: '山间雾气，抓不住' },

    // —— 水一路 ——
    { c: '川', py: 'chuān', t: 1, s: 3, g: 'b', tags: ['水', '河'], m: '江河行地，绵长不息' },
    { c: '洲', py: 'zhōu', t: 1, s: 9, g: 'b', tags: ['水', '地'], m: '水中陆地，能停靠' },
    { c: '沅', py: 'yuán', t: 2, s: 7, g: 'b', tags: ['水', '河'], m: '沅水长流，清而有源' },
    { c: '沛', py: 'pèi', t: 4, s: 7, g: 'b', tags: ['水', '雨'], m: '雨水充沛，气力足' },
    { c: '泓', py: 'hóng', t: 2, s: 8, g: 'b', tags: ['水'], m: '水深而广，装得下' },
    { c: '泽', py: 'zé', t: 2, s: 8, g: 'n', tags: ['水', '恩'], m: '水聚成泽，润物无声' },
    { c: '澈', py: 'chè', t: 4, s: 15, g: 'n', tags: ['水', '清'], m: '水清见底，不含糊' },
    { c: '沐', py: 'mù', t: 4, s: 7, g: 'n', tags: ['水', '光'], m: '走在光里，被照拂' },
    { c: '溪', py: 'xī', t: 1, s: 13, g: 'n', tags: ['水'], m: '溪水细，但不断' },
    { c: '汀', py: 'tīng', t: 1, s: 5, g: 'g', tags: ['水', '岸'], m: '水边平地，浅而安稳' },
    { c: '泠', py: 'líng', t: 2, s: 8, g: 'g', tags: ['水', '声'], m: '水声清越，听着凉' },
    { c: '涵', py: 'hán', t: 2, s: 11, g: 'n', tags: ['水', '容'], m: '涵养，是把话咽下去' },
    { c: '清', py: 'qīng', t: 1, s: 11, g: 'n', tags: ['水', '清'], m: '清而不寒' },
    { c: '湖', py: 'hú', t: 2, s: 12, g: 'n', tags: ['水'], m: '湖面平阔，风来起皱' },
    { c: '渡', py: 'dù', t: 4, s: 12, g: 'n', tags: ['水', '行'], m: '把人送到对岸' },
    { c: '舟', py: 'zhōu', t: 1, s: 6, g: 'b', tags: ['水', '行'], m: '一叶小舟，能走远' },
    { c: '帆', py: 'fān', t: 1, s: 6, g: 'b', tags: ['水', '行'], m: '张帆等风，风来就走' },
    { c: '岸', py: 'àn', t: 4, s: 8, g: 'n', tags: ['水', '岸'], m: '回头能看见的地方' },

    // —— 木林草木 ——
    { c: '松', py: 'sōng', t: 1, s: 8, g: 'b', tags: ['木', '山'], m: '松立寒中，四时不改' },
    { c: '柏', py: 'bǎi', t: 3, s: 9, g: 'b', tags: ['木'], m: '柏树常青，耐久' },
    { c: '桐', py: 'tóng', t: 2, s: 10, g: 'n', tags: ['木'], m: '梧桐引凤，自带清气' },
    { c: '榆', py: 'yú', t: 2, s: 13, g: 'b', tags: ['木'], m: '榆木坚厚，踏实' },
    { c: '森', py: 'sēn', t: 1, s: 12, g: 'b', tags: ['木', '林'], m: '林木成森，气象大' },
    { c: '榕', py: 'róng', t: 2, s: 14, g: 'g', tags: ['木', '林'], m: '榕树垂荫，容得下人' },
    { c: '竹', py: 'zhú', t: 2, s: 6, g: 'n', tags: ['竹', '木'], m: '竹有节，长得直' },
    { c: '筠', py: 'yún', t: 2, s: 13, g: 'g', tags: ['竹'], m: '竹皮，柔而有节' },
    { c: '兰', py: 'lán', t: 2, s: 5, g: 'g', tags: ['花', '草'], m: '兰生幽谷，香自本心' },
    { c: '芷', py: 'zhǐ', t: 3, s: 7, g: 'g', tags: ['草', '花'], m: '白芷，清苦里带香' },
    { c: '苓', py: 'líng', t: 2, s: 8, g: 'g', tags: ['草', '药'], m: '茯苓，温和养人' },
    { c: '薇', py: 'wēi', t: 1, s: 16, g: 'g', tags: ['花', '草'], m: '蔷薇，带刺也开花' },
    { c: '萱', py: 'xuān', t: 1, s: 12, g: 'g', tags: ['草', '花'], m: '忘忧草，替人宽心' },
    { c: '芸', py: 'yún', t: 2, s: 7, g: 'g', tags: ['草'], m: '芸香，书页里的味道' },
    { c: '菀', py: 'wǎn', t: 3, s: 11, g: 'g', tags: ['草', '木'], m: '草木茂盛的样子' },
    { c: '棠', py: 'táng', t: 2, s: 12, g: 'g', tags: ['花', '木'], m: '海棠，开在春深处' },
    { c: '禾', py: 'hé', t: 2, s: 5, g: 'n', tags: ['禾', '田'], m: '禾苗，一季一收' },
    { c: '谷', py: 'gǔ', t: 3, s: 7, g: 'b', tags: ['谷', '田'], m: '山谷，能藏得住东西' },

    // —— 光与天 ——
    { c: '明', py: 'míng', t: 2, s: 8, g: 'n', tags: ['光', '智'], m: '明亮通透，不绕弯' },
    { c: '昭', py: 'zhāo', t: 1, s: 9, g: 'b', tags: ['光'], m: '昭然可见，不藏着' },
    { c: '昱', py: 'yù', t: 4, s: 9, g: 'n', tags: ['光', '日'], m: '日光初照，一天刚起' },
    { c: '晗', py: 'hán', t: 2, s: 11, g: 'n', tags: ['光', '日'], m: '天将亮未亮那会儿' },
    { c: '晨', py: 'chén', t: 2, s: 11, g: 'n', tags: ['光', '日'], m: '一日之始，还有余地' },
    { c: '朗', py: 'lǎng', t: 3, s: 10, g: 'b', tags: ['光', '明'], m: '清朗，心里不放阴天' },
    { c: '星', py: 'xīng', t: 1, s: 9, g: 'n', tags: ['星', '光'], m: '夜里一点光' },
    { c: '辰', py: 'chén', t: 2, s: 7, g: 'n', tags: ['星', '日'], m: '星辰，也是时辰' },
    { c: '霄', py: 'xiāo', t: 1, s: 10, g: 'b', tags: ['云', '天'], m: '云上之高，要抬头看' },
    { c: '云', py: 'yún', t: 2, s: 4, g: 'n', tags: ['云'], m: '云行无心，自在' },
    { c: '霁', py: 'jì', t: 4, s: 12, g: 'n', tags: ['云', '雨', '晴'], m: '雨后天晴，坎过去了' },
    { c: '雨', py: 'yǔ', t: 3, s: 8, g: 'n', tags: ['雨', '水'], m: '雨落有节，润物无声' },
    { c: '雪', py: 'xuě', t: 3, s: 11, g: 'g', tags: ['雪', '冬'], m: '雪落无声，落完就净' },
    { c: '霜', py: 'shuāng', t: 1, s: 17, g: 'g', tags: ['雪', '秋'], m: '霜降有信，时节分明' },
    { c: '风', py: 'fēng', t: 1, s: 4, g: 'n', tags: ['风'], m: '风行无碍，遇山就绕' },
    { c: '月', py: 'yuè', t: 4, s: 4, g: 'n', tags: ['月', '夜'], m: '月色，不刺眼的亮' },
    { c: '望', py: 'wàng', t: 4, s: 11, g: 'n', tags: ['月', '远'], m: '往远处看，往远处想' },

    // —— 德性与文气 ——
    { c: '序', py: 'xù', t: 4, s: 7, g: 'b', tags: ['文'], m: '有条有理，不慌' },
    { c: '叙', py: 'xù', t: 4, s: 9, g: 'n', tags: ['文', '言'], m: '慢慢说来，有分寸' },
    { c: '言', py: 'yán', t: 2, s: 7, g: 'b', tags: ['言', '文'], m: '说出口的话，认' },
    { c: '谨', py: 'jǐn', t: 3, s: 13, g: 'b', tags: ['德', '礼'], m: '谨慎有度，不越线' },
    { c: '恒', py: 'héng', t: 2, s: 9, g: 'b', tags: ['德', '久'], m: '持之以恒，不变卦' },
    { c: '毅', py: 'yì', t: 4, s: 15, g: 'b', tags: ['德', '勇'], m: '果决，扛得住事' },
    { c: '恪', py: 'kè', t: 4, s: 9, g: 'b', tags: ['德', '礼'], m: '守规矩，把本分做到' },
    { c: '知', py: 'zhī', t: 1, s: 8, g: 'n', tags: ['智', '文'], m: '知道分寸和深浅' },
    { c: '书', py: 'shū', t: 1, s: 4, g: 'n', tags: ['文', '书'], m: '书卷气，是读出来的' },
    { c: '墨', py: 'mò', t: 4, s: 15, g: 'b', tags: ['文', '书'], m: '墨色，落笔不悔' },
    { c: '疏', py: 'shū', t: 1, s: 12, g: 'n', tags: ['文', '静'], m: '疏朗，不挤不堵' },
    { c: '素', py: 'sù', t: 4, s: 10, g: 'n', tags: ['素', '白'], m: '本来面目，不加修饰' },
    { c: '初', py: 'chū', t: 1, s: 7, g: 'n', tags: ['始'], m: '刚开始，什么都没丢' },
    { c: '见', py: 'jiàn', t: 4, s: 4, g: 'n', tags: ['见'], m: '亲眼看见，不听说' },
    { c: '予', py: 'yǔ', t: 3, s: 4, g: 'n', tags: ['予'], m: '给出去的东西' },

    // —— 玉与器 ——
    { c: '珩', py: 'héng', t: 2, s: 10, g: 'b', tags: ['玉'], m: '玉上的横饰，有格' },
    { c: '瑾', py: 'jǐn', t: 3, s: 15, g: 'g', tags: ['玉'], m: '美玉，光往里收' },
    { c: '琢', py: 'zhuó', t: 2, s: 12, g: 'b', tags: ['玉', '工'], m: '雕琢，才成器' },
    { c: '玉', py: 'yù', t: 4, s: 5, g: 'n', tags: ['玉'], m: '温润，握久了才显' },
    { c: '瑶', py: 'yáo', t: 2, s: 14, g: 'g', tags: ['玉'], m: '美玉，远看也有光' },
    { c: '珊', py: 'shān', t: 1, s: 9, g: 'g', tags: ['玉', '海'], m: '珊瑚，海里长出来的' },

    // —— 性情 ——
    { c: '宁', py: 'níng', t: 2, s: 5, g: 'n', tags: ['安', '静'], m: '安宁，是没事发生' },
    { c: '安', py: 'ān', t: 1, s: 6, g: 'n', tags: ['安'], m: '安稳，脚踩得住地' },
    { c: '和', py: 'hé', t: 2, s: 8, g: 'n', tags: ['和', '安'], m: '和而不流，不硬不软' },
    { c: '悦', py: 'yuè', t: 4, s: 10, g: 'g', tags: ['喜', '心'], m: '心里那点高兴' },
    { c: '恬', py: 'tián', t: 2, s: 9, g: 'g', tags: ['安', '静'], m: '恬淡，不争也不缺' },
    { c: '婉', py: 'wǎn', t: 3, s: 11, g: 'g', tags: ['柔'], m: '婉转，话不说死' },
    { c: '姝', py: 'shū', t: 1, s: 9, g: 'g', tags: ['美'], m: '美好的样子' },
    { c: '娴', py: 'xián', t: 2, s: 10, g: 'g', tags: ['静', '美'], m: '娴静，慢但不冷' },
    { c: '媛', py: 'yuán', t: 2, s: 12, g: 'g', tags: ['美'], m: '女子美好的样子' },
    { c: '野', py: 'yě', t: 3, s: 11, g: 'b', tags: ['野', '地'], m: '原野开阔，不受拘' },
    { c: '原', py: 'yuán', t: 2, s: 10, g: 'b', tags: ['地', '野'], m: '平地起头，哪都是路' },
    { c: '越', py: 'yuè', t: 4, s: 12, g: 'b', tags: ['行', '远'], m: '越过去，才算数' },
    { c: '远', py: 'yuǎn', t: 3, s: 7, g: 'n', tags: ['远', '行'], m: '路远，心是定的' },
    { c: '征', py: 'zhēng', t: 1, s: 8, g: 'b', tags: ['行'], m: '出征，往前走不回头' },
    { c: '阔', py: 'kuò', t: 4, s: 12, g: 'b', tags: ['远', '大'], m: '开阔，左右都留得下' },
    { c: '白', py: 'bái', t: 2, s: 5, g: 'n', tags: ['白', '素'], m: '白，什么都不加' },
    { c: '屿', py: 'yǔ', t: 3, s: 6, g: 'n', tags: ['山', '海', '岛'], m: '海中小岛，安静自持' },
    { c: '琴', py: 'qín', t: 2, s: 12, g: 'g', tags: ['乐', '声'], m: '琴声，弹给自己听' },
    { c: '歌', py: 'gē', t: 1, s: 14, g: 'g', tags: ['乐', '声'], m: '歌声，往外走的声音' },
    { c: '音', py: 'yīn', t: 1, s: 9, g: 'n', tags: ['乐', '声'], m: '声音，落地就散' }
  ];

  // 常见姓，用于拼音和声调判断。查不到就只注名的音，不硬编。
  var SURNAME1 = {
    王: ['wáng', 2], 李: ['lǐ', 3], 张: ['zhāng', 1], 刘: ['liú', 2], 陈: ['chén', 2],
    杨: ['yáng', 2], 黄: ['huáng', 2], 赵: ['zhào', 4], 吴: ['wú', 2], 周: ['zhōu', 1],
    徐: ['xú', 2], 孙: ['sūn', 1], 马: ['mǎ', 3], 朱: ['zhū', 1], 胡: ['hú', 2],
    郭: ['guō', 1], 何: ['hé', 2], 高: ['gāo', 1], 林: ['lín', 2], 罗: ['luó', 2],
    郑: ['zhèng', 4], 梁: ['liáng', 2], 谢: ['xiè', 4], 宋: ['sòng', 4], 唐: ['táng', 2],
    许: ['xǔ', 3], 韩: ['hán', 2], 冯: ['féng', 2], 邓: ['dèng', 4], 曹: ['cáo', 2],
    彭: ['péng', 2], 曾: ['zēng', 1], 肖: ['xiāo', 1], 田: ['tián', 2], 董: ['dǒng', 3],
    袁: ['yuán', 2], 潘: ['pān', 1], 于: ['yú', 2], 蒋: ['jiǎng', 3], 蔡: ['cài', 4],
    余: ['yú', 2], 杜: ['dù', 4], 叶: ['yè', 4], 程: ['chéng', 2], 苏: ['sū', 1],
    魏: ['wèi', 4], 吕: ['lǚ', 3], 丁: ['dīng', 1], 任: ['rèn', 4], 沈: ['shěn', 3],
    姚: ['yáo', 2], 卢: ['lú', 2], 姜: ['jiāng', 1], 崔: ['cuī', 1], 钟: ['zhōng', 1],
    谭: ['tán', 2], 陆: ['lù', 4], 汪: ['wāng', 1], 范: ['fàn', 4], 金: ['jīn', 1],
    石: ['shí', 2], 廖: ['liào', 4], 贾: ['jiǎ', 3], 夏: ['xià', 4], 韦: ['wéi', 2],
    方: ['fāng', 1], 邹: ['zōu', 1], 孟: ['mèng', 4], 熊: ['xióng', 2], 秦: ['qín', 2],
    邱: ['qiū', 1], 江: ['jiāng', 1], 尹: ['yǐn', 3], 薛: ['xuē', 1], 段: ['duàn', 4],
    雷: ['léi', 2], 侯: ['hóu', 2], 龙: ['lóng', 2], 史: ['shǐ', 3], 陶: ['táo', 2],
    黎: ['lí', 2], 贺: ['hè', 4], 顾: ['gù', 4], 毛: ['máo', 2], 郝: ['hǎo', 3],
    龚: ['gōng', 1], 邵: ['shào', 4], 万: ['wàn', 4], 钱: ['qián', 2], 严: ['yán', 2],
    覃: ['qín', 2], 武: ['wǔ', 3], 戴: ['dài', 4], 莫: ['mò', 4], 孔: ['kǒng', 3],
    向: ['xiàng', 4], 汤: ['tāng', 1], 常: ['cháng', 2], 温: ['wēn', 1], 康: ['kāng', 1],
    施: ['shī', 1], 文: ['wén', 2], 牛: ['niú', 2], 樊: ['fán', 2], 葛: ['gé', 2],
    邢: ['xíng', 2], 安: ['ān', 1], 齐: ['qí', 2], 易: ['yì', 4], 乔: ['qiáo', 2],
    伍: ['wǔ', 3], 庞: ['páng', 2], 颜: ['yán', 2], 倪: ['ní', 2], 庄: ['zhuāng', 1],
    聂: ['niè', 4], 章: ['zhāng', 1], 鲁: ['lǔ', 3], 岳: ['yuè', 4], 翟: ['zhái', 2],
    殷: ['yīn', 1], 詹: ['zhān', 1], 申: ['shēn', 1], 欧: ['ōu', 1], 耿: ['gěng', 3]
  };

  var SURNAME2 = {
    欧阳: ['ōu yáng', 1], 上官: ['shàng guān', 4], 司马: ['sī mǎ', 1],
    诸葛: ['zhū gě', 1], 东方: ['dōng fāng', 1], 皇甫: ['huáng fǔ', 2],
    尉迟: ['yù chí', 4], 公孙: ['gōng sūn', 1], 慕容: ['mù róng', 4],
    长孙: ['zhǎng sūn', 3], 宇文: ['yǔ wén', 3], 司徒: ['sī tú', 1]
  };

  var MAX_SURNAME = 2;
  var MAX_KEYWORD_LEN = 20;   // 整串关键词的长度上限
  var MAX_KEYWORDS = 5;       // 超过就只取前 5 个，再多也不会有新方向
  var MAX_COUNT = 20;

  // ---------- 小工具 ----------

  /** 有 seed 就走确定性序列（测试和截图可复现），没 seed 用真随机 */
  function makeRand(seed) {
    if (seed == null) return Math.random;
    var s = seed >>> 0 || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function charIndex() {
    var m = {};
    for (var i = 0; i < CHARS.length; i++) m[CHARS[i].c] = CHARS[i];
    return m;
  }
  var IDX = charIndex();

  function isType(id) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return true;
    return false;
  }

  function typeName(id) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i].name;
    return '';
  }

  /** 姓：去空白，最长 2 字（复姓），不是汉字的字符直接去掉 */
  function normalizeSurname(raw) {
    var s = String(raw == null ? '' : raw).replace(/\s+/g, '');
    s = s.replace(/[^\u4e00-\u9fa5]/g, '');
    return s.slice(0, MAX_SURNAME);
  }

  function surnameInfo(raw) {
    var s = normalizeSurname(raw);
    if (!s) return { raw: '', py: '', tone: 0, len: 0 };
    var two = SURNAME2[s];
    if (two) return { raw: s, py: two[0], tone: two[1], len: 2 };
    var one = SURNAME1[s];
    return {
      raw: s,
      py: one ? one[0] : '',
      tone: one ? one[1] : 0,
      len: 1
    };
  }

  /** 关键词：支持空格 / 逗号 / 顿号 / 斜杠分隔，去重后截前 5 个 */
  function parseKeywords(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return [];
    var parts = s.split(/[\s,，、;；\/\|]+/);
    var out = [];
    var seen = {};
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
      if (!p) continue;
      if (seen[p]) continue;
      seen[p] = true;
      out.push(p);
      if (out.length >= MAX_KEYWORDS) break;
    }
    return out;
  }

  /** 关键词 ≈ 标签：双向包含，输入「山水」也能命中「山」「水」两组 */
  function tagMatch(tag, kw) {
    if (!tag || !kw) return false;
    return tag === kw || tag.indexOf(kw) >= 0 || kw.indexOf(tag) >= 0;
  }

  function poolOf(type) {
    if (type === 'boy') {
      return CHARS.filter(function (c) { return c.g === 'b' || c.g === 'n'; });
    }
    if (type === 'girl') {
      return CHARS.filter(function (c) { return c.g === 'g' || c.g === 'n'; });
    }
    if (type === 'brand') {
      // 品牌名不用偏柔美的字：「沛晗」「安婉」这种像人名，不像招牌
      return CHARS.filter(function (c) { return c.g !== 'g'; });
    }
    return CHARS.slice();
  }

  function toneLevel(t) {
    return t === 1 || t === 2 ? '平' : '仄';
  }

  function tonePattern(a, b) {
    return toneLevel(a.t) + toneLevel(b.t);
  }

  var TONE_NOTE = {
    平平: '两声都平，念着舒展。',
    仄仄: '两字都仄，短促有力。',
    平仄: '平起仄收，落得干脆。',
    仄平: '仄起平收，尾音收得稳。'
  };

  function initials(py) {
    // 只取声母，用来判断两字是不是同一声母（「张知」这种粘牙的）
    var two = ['zh', 'ch', 'sh'];
    for (var i = 0; i < two.length; i++) {
      if (py.indexOf(two[i]) === 0) return two[i];
    }
    var one = 'bpmfdtnlgkhjqxrzcsyw';
    return one.indexOf(py.charAt(0)) >= 0 ? py.charAt(0) : '';
  }

  // 声调符号 → 不带调的字母，用来判断「名字和姓是不是同一个音」
  var TONE_MAP = {
    'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
    'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
    'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
    'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
    'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
    'ǖ': 'ü', 'ǘ': 'ü', 'ǚ': 'ü', 'ǜ': 'ü'
  };

  function plain(py) {
    var out = '';
    for (var i = 0; i < py.length; i++) {
      var ch = py.charAt(i);
      out += TONE_MAP[ch] || ch;
    }
    return out;
  }

  // ---------- 打分 ----------

  function scorePair(a, b, opt) {
    var type = opt.type;
    var hit = opt.hit || {};
    var sInfo = opt.surname || { raw: '', py: '', tone: 0 };
    var s = 0;

    [a, b].forEach(function (ch) {
      if (hit[ch.c]) s += 45;                       // 命中关键词，权重最高
      if (ch.s > 15) s -= 6;                        // 笔画太多，写起来累
      else if (ch.s <= 4) s += 2;                   // 极简的字反而清爽
      else s += 4;
      if (type === 'boy' && ch.g === 'b') s += 8;
      if (type === 'girl' && ch.g === 'g') s += 8;
      if (type === 'neutral' && ch.g === 'n') s += 8;
      if (type === 'brand' && ch.s <= 12) s += 6;
    });

    // 声调
    if (a.t === 3 && b.t === 3) s -= 20;            // 两个三声连读要变调，念着别扭
    else if (a.t === b.t) s -= 5;
    else if (toneLevel(a.t) !== toneLevel(b.t)) s += 12;
    else s += 4;

    // 两字语义重叠（「泽澈」都是水）读着像同义反复，扣一点
    var overlap = false;
    for (var oi = 0; oi < a.tags.length; oi++) {
      if (b.tags.indexOf(a.tags[oi]) >= 0) { overlap = true; break; }
    }
    if (overlap) s -= 6;

    // 笔画搭配：差太多头重脚轻，一模一样又板
    var d = Math.abs(a.s - b.s);
    if (d === 0) s -= 5;
    else if (d >= 3 && d <= 10) s += 7;
    else if (d > 14) s -= 2;

    // 音：同声母粘牙；和姓同音，念出来听不出边界
    if (initials(a.py) && initials(a.py) === initials(b.py)) s -= 12;
    var sPy = sInfo.py ? plain(sInfo.py.split(' ')[0]) : '';
    if (sPy) {
      if (plain(a.py) === sPy) s -= 35;
      if (plain(b.py) === sPy) s -= 35;
    }
    if (sInfo.raw && (a.c === sInfo.raw || b.c === sInfo.raw)) s -= 60;

    return s;
  }

  // ---------- 生成 ----------

  function generate(opt) {
    opt = opt || {};
    var type = isType(opt.type) ? opt.type : 'neutral';
    var surname = surnameInfo(opt.surname);
    var kwRaw = String(opt.keywords == null ? '' : opt.keywords);
    var count = parseInt(opt.count, 10);
    if (isNaN(count)) count = 3;
    count = Math.max(1, Math.min(MAX_COUNT, count));   // 0 也抬到 1
    var exclude = opt.exclude || [];
    var rand = makeRand(opt.seed);

    if (type !== 'brand' && !surname.raw) {
      return {
        ok: false, code: 'EMPTY_SURNAME',
        message: '先写上姓，或者选「品牌」不填姓',
        list: [], usedIds: exclude
      };
    }
    if (kwRaw.length > MAX_KEYWORD_LEN) {
      return {
        ok: false, code: 'KEYWORD_TOO_LONG',
        message: '关键词太长了，' + MAX_KEYWORD_LEN + ' 字以内就够',
        list: [], usedIds: exclude
      };
    }

    var kws = parseKeywords(kwRaw);
    var pool = poolOf(type);

    // 关键词命中哪些字
    var hit = {};
    kws.forEach(function (kw) {
      pool.forEach(function (ch) {
        if (ch.c === kw) { hit[ch.c] = kw; return; }
        for (var i = 0; i < ch.tags.length; i++) {
          if (tagMatch(ch.tags[i], kw)) { hit[ch.c] = kw; return; }
        }
      });
    });
    var hitCount = Object.keys(hit).length;

    var usedSet = {};
    exclude.forEach(function (n) { usedSet[n] = true; });

    var scored = [];
    var byKey = {};   // 同样的两个字只有一种组合，倒过来算重复
    for (var i = 0; i < pool.length; i++) {
      for (var j = 0; j < pool.length; j++) {
        if (i === j) continue;
        var a = pool[i], b = pool[j];
        if (a.c === b.c) continue;
        var full = surname.raw + a.c + b.c;
        if (type !== 'brand' && (a.c === surname.raw || b.c === surname.raw)) continue;
        if (usedSet[full]) continue;
        var base = scorePair(a, b, { type: type, hit: hit, surname: surname });
        var key = a.c < b.c ? a.c + b.c : b.c + a.c;
        var prev = byKey[key];
        if (prev) {
          // 两个字顺序不同读音也不同，留顺口的那个方向
          if (base > prev.base) { prev.a = a; prev.b = b; prev.base = base; }
          continue;
        }
        byKey[key] = { a: a, b: b, base: base, jitter: rand() * 9 };
      }
    }
    Object.keys(byKey).forEach(function (k) { scored.push(byKey[k]); });

    scored.sort(function (x, y) {
      var dx = x.base + x.jitter, dy = y.base + y.jitter;
      if (dy !== dx) return dy - dx;
      return x.a.c < y.a.c ? -1 : 1;
    });

    // 分四轮挑，越往后越宽松，但每轮都要求首字不同：
    // 0 两字全新 → 1 单字最多用两次 → 2 只求首字不同 → 3 全放。
    // 如果第一轮只查首字，20 条会在这一轮就选满，后面的限制等于没写。
    var picked = [];
    var seenFirst = {};
    var usedChar = {};

    function pickFrom(list, need) {
      var out = [];
      for (var pass = 0; pass < 4 && out.length < need; pass++) {
        for (var k = 0; k < list.length && out.length < need; k++) {
          var it = list[k];
          if (it.taken) continue;
          var ac = usedChar[it.a.c] || 0;
          var bc = usedChar[it.b.c] || 0;
          if (pass === 0 && (seenFirst[it.a.c] || ac || bc)) continue;
          if (pass === 1 && (seenFirst[it.a.c] || ac >= 2 || bc >= 2)) continue;
          if (pass === 2 && seenFirst[it.a.c]) continue;
          it.taken = true;
          seenFirst[it.a.c] = true;
          usedChar[it.a.c] = ac + 1;
          usedChar[it.b.c] = bc + 1;
          out.push(it);
        }
      }
      return out;
    }

    // 命中关键词的组合必须先占满，再轮到通用池。
    // 一把抓的话，字库里源源不断的「两字全新」组合会把低分候选顶到前面，
    // 关键词就白填了。
    var hitList = [];
    var restList = [];
    scored.forEach(function (it) {
      if (hit[it.a.c] || hit[it.b.c]) hitList.push(it);
      else restList.push(it);
    });

    picked = pickFrom(hitList, count);
    if (picked.length < count) {
      picked = picked.concat(pickFrom(restList, count - picked.length));
    }
    // 挑选阶段受「首字不重复」约束，顺序会被打乱；展示前按真实得分排回去
    picked.sort(function (x, y) { return y.base - x.base; });

    var missCount = picked.filter(function (it) {
      return !hit[it.a.c] && !hit[it.b.c];
    }).length;

    var warning = '';
    if (!kws.length) {
      warning = '没填关键词，用的是通用字池';
    } else if (!hitCount) {
      warning = '「' + kws.join('、') + '」没有对上的字，先用通用字池';
    } else if (picked.length < count) {
      warning = '这个组合差不多用完了，换个关键词试试';
    } else if (missCount > 0) {
      warning = '对上「' + kws.join('、') + '」的字就这些，后面几条是同风格补充';
    }

    var list = picked.slice(0, count).map(function (it, i) {
      var a = it.a, b = it.b;
      var pyName = a.py + ' ' + b.py;
      var pyFull = surname.py ? surname.py + ' ' + pyName : pyName;
      var mz = a.c + '，' + a.m + '；' + b.c + '，' + b.m + '。';
      var pat = tonePattern(a, b);
      return {
        id: surname.raw + a.c + b.c,
        name: surname.raw + a.c + b.c,
        surname: surname.raw,
        given: a.c + b.c,
        pinyin: pyFull,
        pinyinGiven: pyName,
        meaning: mz,
        tonePattern: pat,
        toneNote: TONE_NOTE[pat],
        strokes: a.s + b.s,
        strokePair: a.s + '+' + b.s,
        chars: [a.c, b.c],
        hitChars: [a.c, b.c].filter(function (c) { return !!hit[c]; }),
        typeName: typeName(type),
        score: Math.round(it.base),
        first: i === 0
      };
    });

    return {
      ok: true,
      list: list,
      usedIds: exclude.concat(list.map(function (x) { return x.name; })),
      keywords: kws,
      hitChars: Object.keys(hit),
      warning: warning
    };
  }

  return {
    TYPES: TYPES,
    CHARS: CHARS,
    MAX_SURNAME: MAX_SURNAME,
    MAX_KEYWORD_LEN: MAX_KEYWORD_LEN,
    MAX_KEYWORDS: MAX_KEYWORDS,
    MAX_COUNT: MAX_COUNT,
    normalizeSurname: normalizeSurname,
    surnameInfo: surnameInfo,
    parseKeywords: parseKeywords,
    tonePattern: tonePattern,
    plain: plain,
    generate: generate,
    _char: function (c) { return IDX[c] || null; },
    _score: scorePair
  };
});
