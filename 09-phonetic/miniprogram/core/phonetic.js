/**
 * 音标查询引擎（纯逻辑，零依赖）
 * 同时可被微信小程序 require() 和浏览器 <script> 加载。
 *
 * 设计要点：
 * - 不联网、不调接口。内置词库 + 拼读规则兜底，离线可用
 * - 音节数、重音位置不写死在数据里，全部从音标本身算出来，和音标永远一致
 * - 词库没收录的词不装作认识：音标按拼读规则推算，并明确标注「推算」
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Phonetic = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ============ 词库 ============
   * 每行 word|英式音标|美式音标|词性与释义
   * 美式留空表示英美相同，避免同一串音标写两遍。
   */
  var RAW = [
    // —— 生活常用 ——
    'about|əˈbaʊt||prep. 关于；大约',
    'above|əˈbʌv||prep. 在…上方',
    'accept|əkˈsept||v. 接受，同意',
    'achieve|əˈtʃiːv||v. 实现，达到',
    'across|əˈkrɒs|əˈkrɔːs|prep. 穿过；在对面',
    'address|əˈdres|ˈædres|n. 地址 v. 处理',
    'admit|ədˈmɪt||v. 承认；准许进入',
    'advice|ədˈvaɪs||n. 建议，忠告',
    'afford|əˈfɔːd|əˈfɔːrd|v. 负担得起',
    'afraid|əˈfreɪd||adj. 害怕的',
    'afternoon|ˌɑːftəˈnuːn|ˌæftərˈnuːn|n. 下午',
    'again|əˈɡen||adv. 再一次',
    'agree|əˈɡriː||v. 同意',
    'airport|ˈeəpɔːt|ˈerpɔːrt|n. 机场',
    'allow|əˈlaʊ||v. 允许',
    'almost|ˈɔːlməʊst|ˈɔːlmoʊst|adv. 几乎',
    'already|ɔːlˈredi||adv. 已经',
    'always|ˈɔːlweɪz||adv. 总是',
    'amount|əˈmaʊnt||n. 数量',
    'answer|ˈɑːnsə|ˈænsər|n./v. 回答',
    'apple|ˈæpl||n. 苹果',
    'arrive|əˈraɪv||v. 到达',
    'attention|əˈtenʃn||n. 注意',
    'autumn|ˈɔːtəm||n. 秋天',
    'available|əˈveɪləbl||adj. 可用的',
    'avoid|əˈvɔɪd||v. 避免',
    'awful|ˈɔːfl||adj. 糟糕的',
    'balance|ˈbæləns||n. 平衡 v. 权衡',
    'basic|ˈbeɪsɪk||adj. 基本的',
    'beautiful|ˈbjuːtɪfl||adj. 美丽的',
    'because|bɪˈkɒz|bɪˈkɔːz|conj. 因为',
    'become|bɪˈkʌm||v. 变成',
    'before|bɪˈfɔː|bɪˈfɔːr|prep. 在…之前',
    'begin|bɪˈɡɪn||v. 开始',
    'behind|bɪˈhaɪnd||prep. 在…后面',
    'believe|bɪˈliːv||v. 相信',
    'belong|bɪˈlɒŋ|bɪˈlɔːŋ|v. 属于',
    'below|bɪˈləʊ|bɪˈloʊ|prep. 在…下面',
    'between|bɪˈtwiːn||prep. 在…之间',
    'borrow|ˈbɒrəʊ|ˈbɑːroʊ|v. 借入',
    'bother|ˈbɒðə|ˈbɑːðər|v. 打扰；费心',
    'bottle|ˈbɒtl|ˈbɑːtl|n. 瓶子',
    'bottom|ˈbɒtəm|ˈbɑːtəm|n. 底部',
    'branch|brɑːntʃ|bræntʃ|n. 树枝；分店',
    'breakfast|ˈbrekfəst||n. 早餐',
    'breathe|briːð||v. 呼吸',
    'bridge|brɪdʒ||n. 桥',
    'bright|braɪt||adj. 明亮的；聪明的',
    'brother|ˈbrʌðə|ˈbrʌðər|n. 兄弟',
    'budget|ˈbʌdʒɪt||n. 预算',
    'build|bɪld||v. 建造',
    'business|ˈbɪznəs||n. 生意；事务',
    'busy|ˈbɪzi||adj. 忙的',
    'button|ˈbʌtn||n. 按钮；纽扣',
    'camera|ˈkæmərə||n. 相机',
    'cancel|ˈkænsl||v. 取消',
    'careful|ˈkeəfl|ˈkerfl|adj. 小心的',
    'carry|ˈkæri||v. 携带',
    'catch|kætʃ||v. 抓住；赶上',
    'cause|kɔːz||n. 原因 v. 引起',
    'certain|ˈsɜːtn|ˈsɜːrtn|adj. 确定的；某些',
    'challenge|ˈtʃælɪndʒ||n. 挑战',
    'change|tʃeɪndʒ||v./n. 改变',
    'cheap|tʃiːp||adj. 便宜的',
    'choice|tʃɔɪs||n. 选择',
    'choose|tʃuːz||v. 选择',
    'child|tʃaɪld||n. 孩子',
    'circle|ˈsɜːkl|ˈsɜːrkl|n. 圆；圈子',
    'city|ˈsɪti||n. 城市',
    'class|klɑːs|klæs|n. 班级；课程',
    'clean|kliːn||adj. 干净的 v. 清洁',
    'clear|klɪə|klɪr|adj. 清楚的',
    'clever|ˈklevə|ˈklevər|adj. 聪明的',
    'close|kləʊz|kloʊz|v. 关闭',
    'coffee|ˈkɒfi|ˈkɔːfi|n. 咖啡',
    'cold|kəʊld|koʊld|adj. 冷的',
    'college|ˈkɒlɪdʒ|ˈkɑːlɪdʒ|n. 学院',
    'comfortable|ˈkʌmftəbl||adj. 舒适的',
    'common|ˈkɒmən|ˈkɑːmən|adj. 常见的',
    'company|ˈkʌmpəni||n. 公司；陪伴',
    'compare|kəmˈpeə|kəmˈper|v. 比较',
    'complete|kəmˈpliːt||adj. 完整的 v. 完成',
    'computer|kəmˈpjuːtə|kəmˈpjuːtər|n. 电脑',
    'confirm|kənˈfɜːm|kənˈfɜːrm|v. 确认',
    'connect|kəˈnekt||v. 连接',
    'consider|kənˈsɪdə|kənˈsɪdər|v. 考虑',
    'contain|kənˈteɪn||v. 包含',
    'continue|kənˈtɪnjuː||v. 继续',
    'control|kənˈtrəʊl|kənˈtroʊl|v./n. 控制',
    'convenient|kənˈviːniənt||adj. 方便的',
    'correct|kəˈrekt||adj. 正确的 v. 改正',
    'cost|kɒst|kɔːst|n. 费用 v. 花费',
    'cotton|ˈkɒtn|ˈkɑːtn|n. 棉',
    'country|ˈkʌntri||n. 国家；乡村',
    'courage|ˈkʌrɪdʒ|ˈkɜːrɪdʒ|n. 勇气',
    'cover|ˈkʌvə|ˈkʌvər|v. 覆盖 n. 封面',
    'create|kriˈeɪt||v. 创造',
    'crowded|ˈkraʊdɪd||adj. 拥挤的',
    'culture|ˈkʌltʃə|ˈkʌltʃər|n. 文化',
    'curious|ˈkjʊəriəs|ˈkjʊriəs|adj. 好奇的',
    'current|ˈkʌrənt|ˈkɜːrənt|adj. 当前的 n. 电流',
    'custom|ˈkʌstəm||n. 习俗',
    'customer|ˈkʌstəmə|ˈkʌstəmər|n. 顾客',
    'damage|ˈdæmɪdʒ||n./v. 损坏',
    'danger|ˈdeɪndʒə|ˈdeɪndʒər|n. 危险',
    'decide|dɪˈsaɪd||v. 决定',
    'decrease|dɪˈkriːs||v. 减少',
    'deep|diːp||adj. 深的',
    'deliver|dɪˈlɪvə|dɪˈlɪvər|v. 递送；交付',
    'demand|dɪˈmɑːnd|dɪˈmænd|n./v. 需求',
    'design|dɪˈzaɪn||n./v. 设计',
    'detail|ˈdiːteɪl|dɪˈteɪl|n. 细节',
    'develop|dɪˈveləp||v. 发展；开发',
    'different|ˈdɪfrənt||adj. 不同的',
    'difficult|ˈdɪfɪkəlt||adj. 困难的',
    'dinner|ˈdɪnə|ˈdɪnər|n. 晚餐',
    'direct|dəˈrekt||adj. 直接的 v. 指导',
    'discover|dɪˈskʌvə|dɪˈskʌvər|v. 发现',
    'discuss|dɪˈskʌs||v. 讨论',
    'distance|ˈdɪstəns||n. 距离',
    'divide|dɪˈvaɪd||v. 分开；除以',
    'doctor|ˈdɒktə|ˈdɑːktər|n. 医生',
    'double|ˈdʌbl||adj. 双倍的',
    'doubt|daʊt||n./v. 怀疑',
    'dream|driːm||n. 梦 v. 做梦',
    'dress|dres||n. 连衣裙 v. 穿衣',
    'drink|drɪŋk||v. 喝',
    'drive|draɪv||v. 驾驶',
    'during|ˈdjʊərɪŋ|ˈdʊrɪŋ|prep. 在…期间',
    'early|ˈɜːli|ˈɜːrli|adj./adv. 早',
    'earn|ɜːn|ɜːrn|v. 赚得',
    'earth|ɜːθ|ɜːrθ|n. 地球；泥土',
    'easy|ˈiːzi||adj. 容易的',
    'edge|edʒ||n. 边缘',
    'education|ˌedʒuˈkeɪʃn||n. 教育',
    'effect|ɪˈfekt||n. 效果；影响',
    'effort|ˈefət|ˈefərt|n. 努力',
    'either|ˈaɪðə|ˈiːðər|adv. 也（否定）；两者之一',
    'empty|ˈempti||adj. 空的',
    'enough|ɪˈnʌf||adj./adv. 足够',
    'enter|ˈentə|ˈentər|v. 进入',
    'environment|ɪnˈvaɪrənmənt||n. 环境',
    'equal|ˈiːkwəl||adj. 相等的',
    'escape|ɪˈskeɪp||v. 逃走',
    'even|ˈiːvn||adv. 甚至',
    'event|ɪˈvent||n. 事件',
    'exact|ɪɡˈzækt||adj. 精确的',
    'example|ɪɡˈzɑːmpl|ɪɡˈzæmpl|n. 例子',
    'excellent|ˈeksələnt||adj. 优秀的',
    'except|ɪkˈsept||prep. 除…之外',
    'exchange|ɪksˈtʃeɪndʒ||n./v. 交换',
    'excited|ɪkˈsaɪtɪd||adj. 兴奋的',
    'exercise|ˈeksəsaɪz|ˈeksərsaɪz|n./v. 锻炼',
    'expect|ɪkˈspekt||v. 期望',
    'expensive|ɪkˈspensɪv||adj. 昂贵的',
    'experience|ɪkˈspɪəriəns|ɪkˈspɪriəns|n. 经验',
    'explain|ɪkˈspleɪn||v. 解释',
    'express|ɪkˈspres||v. 表达',
    'extra|ˈekstrə||adj. 额外的',
    'factory|ˈfæktri||n. 工厂',
    'familiar|fəˈmɪliə|fəˈmɪliər|adj. 熟悉的',
    'famous|ˈfeɪməs||adj. 著名的',
    'farmer|ˈfɑːmə|ˈfɑːrmər|n. 农民',
    'fashion|ˈfæʃn||n. 时尚',
    'fault|fɔːlt||n. 过错；缺点',
    'favorite|ˈfeɪvərɪt||adj. 最喜欢的',
    'feature|ˈfiːtʃə|ˈfiːtʃər|n. 特征 v. 以…为特色',
    'fee|fiː||n. 费用',
    'feeling|ˈfiːlɪŋ||n. 感觉',
    'festival|ˈfestɪvl||n. 节日',
    'fever|ˈfiːvə|ˈfiːvər|n. 发烧',
    'field|fiːld||n. 田野；领域',
    'figure|ˈfɪɡə|ˈfɪɡjər|n. 数字；身材 v. 认为',
    'fill|fɪl||v. 装满',
    'final|ˈfaɪnl||adj. 最后的',
    'finally|ˈfaɪnəli||adv. 最后',
    'finger|ˈfɪŋɡə|ˈfɪŋɡər|n. 手指',
    'finish|ˈfɪnɪʃ||v. 完成',
    'fire|ˈfaɪə|ˈfaɪər|n. 火 v. 解雇',
    'first|fɜːst|fɜːrst|adj./adv. 第一',
    'fix|fɪks||v. 修理；固定',
    'flight|flaɪt||n. 航班',
    'floor|flɔː|flɔːr|n. 地板；楼层',
    'flower|ˈflaʊə|ˈflaʊər|n. 花',
    'follow|ˈfɒləʊ|ˈfɑːloʊ|v. 跟随',
    'foreign|ˈfɒrən|ˈfɔːrən|adj. 外国的',
    'forget|fəˈɡet|fərˈɡet|v. 忘记',
    'forgive|fəˈɡɪv|fərˈɡɪv|v. 原谅',
    'forward|ˈfɔːwəd|ˈfɔːrwərd|adv. 向前',
    'free|friː||adj. 免费的；自由的',
    'fresh|freʃ||adj. 新鲜的',
    'friend|frend||n. 朋友',
    'frighten|ˈfraɪtn||v. 使害怕',
    'front|frʌnt||n. 前面',
    'fuel|ˈfjuːəl||n. 燃料',
    'full|fʊl||adj. 满的',
    'function|ˈfʌŋkʃn||n. 功能',
    'future|ˈfjuːtʃə|ˈfjuːtʃər|n. 未来',
    'gain|ɡeɪn||v. 获得',
    'garden|ˈɡɑːdn|ˈɡɑːrdn|n. 花园',
    'general|ˈdʒenrəl||adj. 一般的',
    'gentle|ˈdʒentl||adj. 温和的',
    'gift|ɡɪft||n. 礼物；天赋',
    'glass|ɡlɑːs|ɡlæs|n. 玻璃；杯子',
    'go|ɡəʊ|ɡoʊ|v. 去',
    'goal|ɡəʊl|ɡoʊl|n. 目标；进球',
    'good|ɡʊd||adj. 好的',
    'bad|bæd||adj. 坏的',
    'government|ˈɡʌvənmənt|ˈɡʌvərnmənt|n. 政府',
    'grade|ɡreɪd||n. 等级；分数',
    'graduate|ˈɡrædʒuət||v. 毕业 n. 毕业生',
    'great|ɡreɪt||adj. 很好的',
    'grow|ɡrəʊ|ɡroʊ|v. 生长',
    'guard|ɡɑːd|ɡɑːrd|v. 守卫 n. 警卫',
    'guess|ɡes||v. 猜',
    'guest|ɡest||n. 客人',
    'guide|ɡaɪd||n. 指南 v. 引导',
    'habit|ˈhæbɪt||n. 习惯',
    'handle|ˈhændl||v. 处理 n. 把手',
    'happen|ˈhæpən||v. 发生',
    'happy|ˈhæpi||adj. 快乐的',
    'hardly|ˈhɑːdli|ˈhɑːrdli|adv. 几乎不',
    'health|helθ||n. 健康',
    'heavy|ˈhevi||adj. 重的',
    'height|haɪt||n. 高度',
    'hello|həˈləʊ|həˈloʊ|int. 你好',
    'help|help||v./n. 帮助',
    'hero|ˈhɪərəʊ|ˈhɪroʊ|n. 英雄',
    'hide|haɪd||v. 隐藏',
    'history|ˈhɪstri||n. 历史',
    'hobby|ˈhɒbi|ˈhɑːbi|n. 爱好',
    'holiday|ˈhɒlədeɪ|ˈhɑːlədeɪ|n. 假日',
    'honest|ˈɒnɪst|ˈɑːnɪst|adj. 诚实的',
    'hope|həʊp|hoʊp|v./n. 希望',
    'horrible|ˈhɒrəbl|ˈhɔːrəbl|adj. 可怕的',
    'hospital|ˈhɒspɪtl|ˈhɑːspɪtl|n. 医院',
    'hotel|həʊˈtel|hoʊˈtel|n. 旅馆',
    'however|haʊˈevə|haʊˈevər|adv. 然而',
    'huge|hjuːdʒ||adj. 巨大的',
    'human|ˈhjuːmən||adj. 人的 n. 人',
    'hurry|ˈhʌri|ˈhɜːri|v. 匆忙',
    'hurt|hɜːt|hɜːrt|v. 使受伤',
    'idea|aɪˈdɪə|aɪˈdiːə|n. 主意',
    'ignore|ɪɡˈnɔː|ɪɡˈnɔːr|v. 忽视',
    'imagine|ɪˈmædʒɪn||v. 想象',
    'important|ɪmˈpɔːtnt|ɪmˈpɔːrtnt|adj. 重要的',
    'improve|ɪmˈpruːv||v. 改进',
    'include|ɪnˈkluːd||v. 包括',
    'increase|ɪnˈkriːs||v. 增加',
    'indeed|ɪnˈdiːd||adv. 确实',
    'industry|ˈɪndəstri||n. 工业',
    'influence|ˈɪnfluəns||n./v. 影响',
    'information|ˌɪnfəˈmeɪʃn|ˌɪnfərˈmeɪʃn|n. 信息',
    'inside|ˌɪnˈsaɪd||prep. 在…里面',
    'instead|ɪnˈsted||adv. 代替',
    'interest|ˈɪntrəst||n. 兴趣；利息',
    'international|ˌɪntəˈnæʃnəl|ˌɪntərˈnæʃnəl|adj. 国际的',
    'introduce|ˌɪntrəˈdjuːs|ˌɪntrəˈduːs|v. 介绍',
    'invent|ɪnˈvent||v. 发明',
    'invite|ɪnˈvaɪt||v. 邀请',
    'island|ˈaɪlənd||n. 岛',
    'issue|ˈɪʃuː||n. 问题；期号 v. 发布',
    'item|ˈaɪtəm||n. 项目；条目',
    'journey|ˈdʒɜːni|ˈdʒɜːrni|n. 旅程',
    'judge|dʒʌdʒ||v. 判断 n. 法官',
    'juice|dʒuːs||n. 果汁',
    'keep|kiːp||v. 保持',
    'key|kiː||n. 钥匙；关键',
    'kind|kaɪnd||adj. 友善的 n. 种类',
    'kitchen|ˈkɪtʃɪn||n. 厨房',
    'knowledge|ˈnɒlɪdʒ|ˈnɑːlɪdʒ|n. 知识',
    'language|ˈlæŋɡwɪdʒ||n. 语言',
    'large|lɑːdʒ|lɑːrdʒ|adj. 大的',
    'last|lɑːst|læst|adj. 最后的 v. 持续',
    'late|leɪt||adj. 晚的',
    'laugh|lɑːf|læf|v. 笑',
    'lazy|ˈleɪzi||adj. 懒的',
    'learn|lɜːn|lɜːrn|v. 学习',
    'leave|liːv||v. 离开；留下',
    'lecture|ˈlektʃə|ˈlektʃər|n. 讲座',
    'lesson|ˈlesn||n. 课',
    'letter|ˈletə|ˈletər|n. 信；字母',
    'level|ˈlevl||n. 水平',
    'library|ˈlaɪbrəri|ˈlaɪbreri|n. 图书馆',
    'light|laɪt||n. 光 adj. 轻的',
    'likely|ˈlaɪkli||adj. 可能的',
    'limit|ˈlɪmɪt||n. 限制 v. 限定',
    'listen|ˈlɪsn||v. 听',
    'little|ˈlɪtl||adj. 小的',
    'local|ˈləʊkl|ˈloʊkl|adj. 当地的',
    'lonely|ˈləʊnli|ˈloʊnli|adj. 孤独的',
    'lucky|ˈlʌki||adj. 幸运的',
    'lunch|lʌntʃ||n. 午餐',
    'machine|məˈʃiːn||n. 机器',
    'magazine|ˌmæɡəˈziːn|ˈmæɡəziːn|n. 杂志',
    'maintain|meɪnˈteɪn||v. 维持',
    'major|ˈmeɪdʒə|ˈmeɪdʒər|adj. 主要的 n. 专业',
    'manage|ˈmænɪdʒ||v. 管理；设法做到',
    'make|meɪk||v. 做；制造',
    'many|ˈmeni||adj. 许多',
    'market|ˈmɑːkɪt|ˈmɑːrkɪt|n. 市场',
    'marry|ˈmæri||v. 结婚',
    'matter|ˈmætə|ˈmætər|n. 事情 v. 要紧',
    'measure|ˈmeʒə|ˈmeʒər|v. 测量 n. 措施',
    'medicine|ˈmedsn|ˈmedɪsn|n. 药',
    'meeting|ˈmiːtɪŋ||n. 会议',
    'memory|ˈmeməri||n. 记忆',
    'mention|ˈmenʃn||v. 提到',
    'message|ˈmesɪdʒ||n. 消息',
    'method|ˈmeθəd||n. 方法',
    'middle|ˈmɪdl||n. 中间',
    'mind|maɪnd||n. 头脑 v. 介意',
    'minute|ˈmɪnɪt||n. 分钟',
    'mirror|ˈmɪrə|ˈmɪrər|n. 镜子',
    'mistake|mɪˈsteɪk||n. 错误',
    'modern|ˈmɒdn|ˈmɑːdərn|adj. 现代的',
    'moment|ˈməʊmənt|ˈmoʊmənt|n. 片刻',
    'money|ˈmʌni||n. 钱',
    'month|mʌnθ||n. 月',
    'mountain|ˈmaʊntən|ˈmaʊntn|n. 山',
    'move|muːv||v. 移动',
    'music|ˈmjuːzɪk||n. 音乐',
    'natural|ˈnætʃrəl||adj. 自然的',
    'nature|ˈneɪtʃə|ˈneɪtʃər|n. 自然',
    'nearly|ˈnɪəli|ˈnɪrli|adv. 几乎',
    'necessary|ˈnesəsəri|ˈnesəseri|adj. 必要的',
    'need|niːd||v./n. 需要',
    'nervous|ˈnɜːvəs|ˈnɜːrvəs|adj. 紧张的',
    'never|ˈnevə|ˈnevər|adv. 从不',
    'notice|ˈnəʊtɪs|ˈnoʊtɪs|v. 注意到 n. 通知',
    'number|ˈnʌmbə|ˈnʌmbər|n. 数字',
    'object|ˈɒbdʒɪkt|ˈɑːbdʒekt|n. 物体 v. 反对',
    'observe|əbˈzɜːv|əbˈzɜːrv|v. 观察',
    'obvious|ˈɒbviəs|ˈɑːbviəs|adj. 明显的',
    'occur|əˈkɜː|əˈkɜːr|v. 发生',
    'offer|ˈɒfə|ˈɔːfər|v. 提供 n. 报价',
    'office|ˈɒfɪs|ˈɔːfɪs|n. 办公室',
    'often|ˈɒfn|ˈɔːfn|adv. 经常',
    'opinion|əˈpɪnjən||n. 意见',
    'opportunity|ˌɒpəˈtjuːnəti|ˌɑːpərˈtuːnəti|n. 机会',
    'order|ˈɔːdə|ˈɔːrdər|n. 顺序；订单 v. 点单',
    'ordinary|ˈɔːdnri|ˈɔːrdneri|adj. 普通的',
    'organize|ˈɔːɡənaɪz|ˈɔːrɡənaɪz|v. 组织',
    'outside|ˌaʊtˈsaɪd||prep. 在…外面',
    'owner|ˈəʊnə|ˈoʊnər|n. 主人',
    'package|ˈpækɪdʒ||n. 包裹',
    'paper|ˈpeɪpə|ˈpeɪpər|n. 纸；论文',
    'parent|ˈpeərənt|ˈperənt|n. 父母',
    'particular|pəˈtɪkjələ|pərˈtɪkjələr|adj. 特定的',
    'partner|ˈpɑːtnə|ˈpɑːrtnər|n. 伙伴',
    'passenger|ˈpæsɪndʒə|ˈpæsɪndʒər|n. 乘客',
    'patient|ˈpeɪʃnt||n. 病人 adj. 有耐心的',
    'pattern|ˈpætn|ˈpætərn|n. 模式',
    'perhaps|pəˈhæps|pərˈhæps|adv. 也许',
    'period|ˈpɪəriəd|ˈpɪriəd|n. 时期',
    'person|ˈpɜːsn|ˈpɜːrsn|n. 人',
    'picture|ˈpɪktʃə|ˈpɪktʃər|n. 图片',
    'place|pleɪs||n. 地方 v. 放置',
    'plan|plæn||n./v. 计划',
    'please|pliːz||int. 请',
    'plenty|ˈplenti||n. 大量',
    'point|pɔɪnt||n. 点 v. 指向',
    'police|pəˈliːs||n. 警察',
    'popular|ˈpɒpjələ|ˈpɑːpjələr|adj. 流行的',
    'position|pəˈzɪʃn||n. 位置',
    'possible|ˈpɒsəbl|ˈpɑːsəbl|adj. 可能的',
    'power|ˈpaʊə|ˈpaʊər|n. 力量；电力',
    'practice|ˈpræktɪs||n. 练习',
    'prepare|prɪˈpeə|prɪˈper|v. 准备',
    'present|ˈpreznt||adj. 出席的 n. 礼物',
    'pressure|ˈpreʃə|ˈpreʃər|n. 压力',
    'pretty|ˈprɪti||adj. 漂亮的 adv. 相当',
    'prevent|prɪˈvent||v. 阻止',
    'price|praɪs||n. 价格',
    'problem|ˈprɒbləm|ˈprɑːbləm|n. 问题',
    'process|ˈprəʊses|ˈprɑːses|n. 过程 v. 处理',
    'produce|prəˈdjuːs|prəˈduːs|v. 生产',
    'product|ˈprɒdʌkt|ˈprɑːdʌkt|n. 产品',
    'progress|ˈprəʊɡres|ˈprɑːɡres|n. 进步',
    'project|ˈprɒdʒekt|ˈprɑːdʒekt|n. 项目',
    'promise|ˈprɒmɪs|ˈprɑːmɪs|n./v. 承诺',
    'proper|ˈprɒpə|ˈprɑːpər|adj. 适当的',
    'protect|prəˈtekt||v. 保护',
    'prove|pruːv||v. 证明',
    'provide|prəˈvaɪd||v. 提供',
    'public|ˈpʌblɪk||adj. 公共的',
    'purpose|ˈpɜːpəs|ˈpɜːrpəs|n. 目的',
    'quality|ˈkwɒləti|ˈkwɑːləti|n. 质量',
    'question|ˈkwestʃən||n. 问题',
    'quick|kwɪk||adj. 快的',
    'quiet|ˈkwaɪət||adj. 安静的',
    'quite|kwaɪt||adv. 相当',
    'radio|ˈreɪdiəʊ|ˈreɪdioʊ|n. 收音机',
    'raise|reɪz||v. 举起；提高',
    'rather|ˈrɑːðə|ˈræðər|adv. 相当；宁可',
    'reach|riːtʃ||v. 到达；伸手',
    'ready|ˈredi||adj. 准备好的',
    'realize|ˈriːəlaɪz||v. 意识到',
    'reason|ˈriːzn||n. 原因',
    'receive|rɪˈsiːv||v. 收到',
    'recent|ˈriːsnt||adj. 最近的',
    'recognize|ˈrekəɡnaɪz||v. 认出',
    'recommend|ˌrekəˈmend||v. 推荐',
    'record|ˈrekɔːd|ˈrekərd|n. 记录 v. 录制',
    'reduce|rɪˈdjuːs|rɪˈduːs|v. 减少',
    'refuse|rɪˈfjuːz||v. 拒绝',
    'regard|rɪˈɡɑːd|rɪˈɡɑːrd|v. 看待',
    'regular|ˈreɡjələ|ˈreɡjələr|adj. 规律的',
    'relax|rɪˈlæks||v. 放松',
    'remain|rɪˈmeɪn||v. 保持；剩下',
    'remember|rɪˈmembə|rɪˈmembər|v. 记得',
    'remove|rɪˈmuːv||v. 移除',
    'repeat|rɪˈpiːt||v. 重复',
    'replace|rɪˈpleɪs||v. 替换',
    'reply|rɪˈplaɪ||v./n. 回答',
    'report|rɪˈpɔːt|rɪˈpɔːrt|n./v. 报告',
    'require|rɪˈkwaɪə|rɪˈkwaɪər|v. 需要',
    'research|rɪˈsɜːtʃ|ˈriːsɜːrtʃ|n./v. 研究',
    'respect|rɪˈspekt||n./v. 尊重',
    'rest|rest||n./v. 休息',
    'result|rɪˈzʌlt||n. 结果',
    'return|rɪˈtɜːn|rɪˈtɜːrn|v. 返回',
    'review|rɪˈvjuː||n./v. 复习；评论',
    'rich|rɪtʃ||adj. 富有的',
    'right|raɪt||adj. 正确的；右边的',
    'river|ˈrɪvə|ˈrɪvər|n. 河流',
    'road|rəʊd|roʊd|n. 路',
    'robot|ˈrəʊbɒt|ˈroʊbɑːt|n. 机器人',
    'rock|rɒk|rɑːk|n. 岩石',
    'room|ruːm||n. 房间',
    'rough|rʌf||adj. 粗糙的',
    'round|raʊnd||adj. 圆的',
    'rule|ruːl||n. 规则 v. 统治',
    'run|rʌn||v. 跑',
    'safe|seɪf||adj. 安全的',
    'salary|ˈsæləri||n. 薪水',
    'sale|seɪl||n. 销售',
    'same|seɪm||adj. 相同的',
    'sample|ˈsɑːmpl|ˈsæmpl|n. 样品',
    'save|seɪv||v. 节省；拯救',
    'schedule|ˈʃedjuːl|ˈskedʒuːl|n. 日程 v. 安排',
    'science|ˈsaɪəns||n. 科学',
    'season|ˈsiːzn||n. 季节',
    'seat|siːt||n. 座位',
    'second|ˈsekənd||n. 秒 adj. 第二',
    'secret|ˈsiːkrət||n. 秘密',
    'seem|siːm||v. 似乎',
    'select|sɪˈlekt||v. 选择',
    'sell|sel||v. 卖',
    'send|send||v. 寄；发送',
    'sense|sens||n. 感觉；意义',
    'separate|ˈseprət||adj. 分开的 v. 分离',
    'serious|ˈsɪəriəs|ˈsɪriəs|adj. 严肃的',
    'serve|sɜːv|sɜːrv|v. 服务',
    'service|ˈsɜːvɪs|ˈsɜːrvɪs|n. 服务',
    'settle|ˈsetl||v. 解决；定居',
    'several|ˈsevrəl||adj. 几个',
    'share|ʃeə|ʃer|v. 分享 n. 份额',
    'shift|ʃɪft||n. 班次 v. 移动',
    'shine|ʃaɪn||v. 发光',
    'short|ʃɔːt|ʃɔːrt|adj. 短的',
    'should|ʃʊd||v. 应该',
    'shout|ʃaʊt||v. 喊',
    'show|ʃəʊ|ʃoʊ|v. 展示',
    'sick|sɪk||adj. 生病的',
    'side|saɪd||n. 边',
    'sign|saɪn||n. 标志 v. 签名',
    'silent|ˈsaɪlənt||adj. 安静的',
    'similar|ˈsɪmələ|ˈsɪmələr|adj. 相似的',
    'simple|ˈsɪmpl||adj. 简单的',
    'since|sɪns||prep. 自从 conj. 因为',
    'single|ˈsɪŋɡl||adj. 单一的',
    'sister|ˈsɪstə|ˈsɪstər|n. 姐妹',
    'skill|skɪl||n. 技能',
    'sleep|sliːp||v./n. 睡觉',
    'slow|sləʊ|sloʊ|adj. 慢的',
    'small|smɔːl||adj. 小的',
    'smart|smɑːt|smɑːrt|adj. 聪明的',
    'smile|smaɪl||v./n. 微笑',
    'smoke|sməʊk|smoʊk|n. 烟 v. 吸烟',
    'social|ˈsəʊʃl|ˈsoʊʃl|adj. 社会的',
    'solve|sɒlv|sɑːlv|v. 解决',
    'sometimes|ˈsʌmtaɪmz||adv. 有时',
    'sorry|ˈsɒri|ˈsɑːri|adj. 抱歉的',
    'sound|saʊnd||n. 声音 v. 听起来',
    'source|sɔːs|sɔːrs|n. 来源',
    'south|saʊθ||n. 南方',
    'space|speɪs||n. 空间',
    'speak|spiːk||v. 说话',
    'special|ˈspeʃl||adj. 特别的',
    'speed|spiːd||n. 速度',
    'spend|spend||v. 花费',
    'spirit|ˈspɪrɪt||n. 精神',
    'spread|spred||v. 传播',
    'staff|stɑːf|stæf|n. 员工',
    'stage|steɪdʒ||n. 阶段；舞台',
    'stand|stænd||v. 站立',
    'standard|ˈstændəd|ˈstændərd|n. 标准',
    'star|stɑː|stɑːr|n. 星星',
    'start|stɑːt|stɑːrt|v. 开始',
    'state|steɪt||n. 状态；州 v. 陈述',
    'station|ˈsteɪʃn||n. 车站',
    'stay|steɪ||v. 停留',
    'steal|stiːl||v. 偷',
    'step|step||n. 步骤',
    'still|stɪl||adv. 仍然',
    'stock|stɒk|stɑːk|n. 库存；股票',
    'stop|stɒp|stɑːp|v. 停止',
    'store|stɔː|stɔːr|n. 商店 v. 储存',
    'story|ˈstɔːri||n. 故事',
    'straight|streɪt||adj. 直的',
    'strange|streɪndʒ||adj. 奇怪的',
    'street|striːt||n. 街道',
    'strength|streŋθ||n. 力量',
    'stress|stres||n. 压力 v. 强调',
    'strong|strɒŋ|strɔːŋ|adj. 强壮的',
    'structure|ˈstrʌktʃə|ˈstrʌktʃər|n. 结构',
    'student|ˈstjuːdnt|ˈstuːdnt|n. 学生',
    'study|ˈstʌdi||v./n. 学习',
    'stupid|ˈstjuːpɪd|ˈstuːpɪd|adj. 愚蠢的',
    'subject|ˈsʌbdʒɪkt||n. 科目；主题',
    'succeed|səkˈsiːd||v. 成功',
    'sudden|ˈsʌdn||adj. 突然的',
    'suffer|ˈsʌfə|ˈsʌfər|v. 遭受',
    'suggest|səˈdʒest|səɡˈdʒest|v. 建议',
    'suitable|ˈsuːtəbl||adj. 合适的',
    'supply|səˈplaɪ||v./n. 供应',
    'support|səˈpɔːt|səˈpɔːrt|v./n. 支持',
    'suppose|səˈpəʊz|səˈpoʊz|v. 假设',
    'sure|ʃʊə|ʃʊr|adj. 确信的',
    'surface|ˈsɜːfɪs|ˈsɜːrfɪs|n. 表面',
    'surprise|səˈpraɪz|sərˈpraɪz|n./v. 惊讶',
    'survive|səˈvaɪv|sərˈvaɪv|v. 幸存',
    'sweet|swiːt||adj. 甜的',
    'switch|swɪtʃ||n. 开关 v. 切换',
    'system|ˈsɪstəm||n. 系统',
    'table|ˈteɪbl||n. 桌子；表格',
    'target|ˈtɑːɡɪt|ˈtɑːrɡɪt|n. 目标',
    'task|tɑːsk|tæsk|n. 任务',
    'taste|teɪst||n. 味道 v. 品尝',
    'teach|tiːtʃ||v. 教',
    'team|tiːm||n. 团队',
    'technology|tekˈnɒlədʒi|tekˈnɑːlədʒi|n. 技术',
    'tell|tel||v. 告诉',
    'temperature|ˈtemprətʃə|ˈtemprətʃər|n. 温度',
    'term|tɜːm|tɜːrm|n. 术语；学期',
    'test|test||n./v. 测试',
    'thank|θæŋk||v. 感谢',
    'theory|ˈθɪəri|ˈθɪri|n. 理论',
    'thick|θɪk||adj. 厚的',
    'thin|θɪn||adj. 薄的',
    'think|θɪŋk||v. 想',
    'though|ðəʊ|ðoʊ|conj. 虽然',
    'thought|θɔːt||n. 想法',
    'thousand|ˈθaʊzənd||num. 千',
    'through|θruː||prep. 穿过',
    'throw|θrəʊ|θroʊ|v. 扔',
    'ticket|ˈtɪkɪt||n. 票',
    'time|taɪm||n. 时间',
    'tired|ˈtaɪəd|ˈtaɪərd|adj. 疲倦的',
    'today|təˈdeɪ||adv. 今天',
    'together|təˈɡeðə|təˈɡeðər|adv. 一起',
    'tomorrow|təˈmɒrəʊ|təˈmɑːroʊ|adv. 明天',
    'tonight|təˈnaɪt||adv. 今晚',
    'total|ˈtəʊtl|ˈtoʊtl|adj. 总的',
    'touch|tʌtʃ||v. 触摸',
    'toward|təˈwɔːd|tɔːrd|prep. 朝向',
    'town|taʊn||n. 城镇',
    'trade|treɪd||n./v. 贸易',
    'traffic|ˈtræfɪk||n. 交通',
    'train|treɪn||n. 火车 v. 训练',
    'travel|ˈtrævl||v./n. 旅行',
    'treat|triːt||v. 对待；治疗',
    'tree|triː||n. 树',
    'trouble|ˈtrʌbl||n. 麻烦',
    'true|truː||adj. 真的',
    'trust|trʌst||v./n. 信任',
    'truth|truːθ||n. 真相',
    'try|traɪ||v. 尝试',
    'turn|tɜːn|tɜːrn|v. 转 n. 轮次',
    'type|taɪp||n. 类型 v. 打字',
    'under|ˈʌndə|ˈʌndər|prep. 在…下面',
    'understand|ˌʌndəˈstænd|ˌʌndərˈstænd|v. 理解',
    'unit|ˈjuːnɪt||n. 单元',
    'until|ənˈtɪl||prep. 直到',
    'update|ˌʌpˈdeɪt|ˈʌpdeɪt|v./n. 更新',
    'useful|ˈjuːsfl||adj. 有用的',
    'usual|ˈjuːʒuəl||adj. 通常的',
    'value|ˈvæljuː||n. 价值',
    'various|ˈveəriəs|ˈveriəs|adj. 各种各样的',
    'vehicle|ˈviːəkl||n. 车辆',
    'version|ˈvɜːʃn|ˈvɜːrʒn|n. 版本',
    'village|ˈvɪlɪdʒ||n. 村庄',
    'visit|ˈvɪzɪt||v./n. 拜访',
    'voice|vɔɪs||n. 声音',
    'volume|ˈvɒljuːm|ˈvɑːljuːm|n. 体积；音量',
    'wait|weɪt||v. 等待',
    'walk|wɔːk||v. 走',
    'warm|wɔːm||adj. 温暖的',
    'watch|wɒtʃ|wɑːtʃ|v. 观看 n. 手表',
    'water|ˈwɔːtə|ˈwɔːtər|n. 水',
    'weather|ˈweðə|ˈweðər|n. 天气',
    'week|wiːk||n. 周',
    'weight|weɪt||n. 重量',
    'welcome|ˈwelkəm||v. 欢迎',
    'whole|həʊl|hoʊl|adj. 整个的',
    'wide|waɪd||adj. 宽的',
    'window|ˈwɪndəʊ|ˈwɪndoʊ|n. 窗户',
    'winter|ˈwɪntə|ˈwɪntər|n. 冬天',
    'wonder|ˈwʌndə|ˈwʌndər|v. 想知道 n. 奇迹',
    'work|wɜːk|wɜːrk|v./n. 工作',
    'worry|ˈwʌri|ˈwɜːri|v. 担心',
    'write|raɪt||v. 写',
    'wrong|rɒŋ|rɔːŋ|adj. 错误的',
    'year|jɪə|jɪr|n. 年',
    'young|jʌŋ||adj. 年轻的',

    // —— 学术 ——
    'analysis|əˈnæləsɪs||n. 分析',
    'conclusion|kənˈkluːʒn||n. 结论',
    'data|ˈdeɪtə||n. 数据',
    'efficiency|ɪˈfɪʃnsi||n. 效率',
    'evidence|ˈevɪdəns||n. 证据',
    'factor|ˈfæktə|ˈfæktər|n. 因素',
    'hypothesis|haɪˈpɒθəsɪs|haɪˈpɑːθəsɪs|n. 假设',
    'methodology|ˌmeθəˈdɒlədʒi|ˌmeθəˈdɑːlədʒi|n. 方法论',
    'parameter|pəˈræmɪtə|pəˈræmɪtər|n. 参数',
    'significant|sɪɡˈnɪfɪkənt||adj. 显著的',
    'simulation|ˌsɪmjuˈleɪʃn||n. 仿真',
    'variable|ˈveəriəbl|ˈveriəbl|n. 变量 adj. 可变的',
    'hydrogen|ˈhaɪdrədʒən||n. 氢',
    'electrolysis|ɪˌlekˈtrɒləsɪs|ɪˌlekˈtrɑːləsɪs|n. 电解',
    'literature|ˈlɪtrətʃə|ˈlɪtrətʃʊr|n. 文献；文学',

    // —— 商务 ——
    'client|ˈklaɪənt||n. 客户',
    'contract|ˈkɒntrækt|ˈkɑːntrækt|n. 合同 v. 收缩',
    'deadline|ˈdedlaɪn||n. 截止日期',
    'invoice|ˈɪnvɔɪs||n. 发票',
    'margin|ˈmɑːdʒɪn|ˈmɑːrdʒɪn|n. 利润；边缘',
    'negotiate|nɪˈɡəʊʃieɪt|nɪˈɡoʊʃieɪt|v. 谈判',
    'proposal|prəˈpəʊzl|prəˈpoʊzl|n. 提案',
    'revenue|ˈrevənjuː|ˈrevənuː|n. 营收',
    'shipment|ˈʃɪpmənt||n. 货运；发货',
    'thorough|ˈθʌrə|ˈθɜːroʊ|adj. 彻底的'
  ];

  /* ============ 逆序词形表 ============
   * 规则算不出来的才列在这儿。规则能算的（-s / -ed / -ing / -er / -est）不进表。
   */
  var IRREGULAR = {
    went: 'go', gone: 'go', goes: 'go',
    was: 'be', were: 'be', been: 'be', am: 'be', is: 'be', are: 'be',
    had: 'have', has: 'have',
    did: 'do', done: 'do', does: 'do',
    said: 'say', made: 'make', took: 'take', taken: 'take',
    came: 'come', saw: 'see', seen: 'see', knew: 'know', known: 'know',
    got: 'get', given: 'give', gave: 'give',
    found: 'find', thought: 'think', told: 'tell', felt: 'feel',
    left: 'leave', kept: 'keep', held: 'hold', brought: 'bring',
    bought: 'buy', caught: 'catch', taught: 'teach', fought: 'fight',
    wrote: 'write', written: 'write', spoke: 'speak', spoken: 'speak',
    broke: 'break', broken: 'break', chose: 'choose', chosen: 'choose',
    drove: 'drive', driven: 'drive', ate: 'eat', eaten: 'eat',
    fell: 'fall', fallen: 'fall', grew: 'grow', grown: 'grow',
    lost: 'lose', met: 'meet', paid: 'pay', sold: 'sell', sent: 'send',
    spent: 'spend', stood: 'stand', won: 'win', wore: 'wear', worn: 'wear',
    children: 'child', men: 'man', women: 'woman', feet: 'foot',
    teeth: 'tooth', mice: 'mouse', people: 'person',
    better: 'good', best: 'good', worse: 'bad', worst: 'bad',
    more: 'many', most: 'many', less: 'little'
  };

  var MAX_WORD = 24;
  var MAX_BATCH = 12;
  var FREE_BATCH = 3;
  var HIST_FREE = 5;
  var HIST_MAX = 60;

  var ACCENTS = [
    { id: 'uk', name: '英式', hint: '英式音标（RP）' },
    { id: 'us', name: '美式', hint: '美式音标（GA）' },
    { id: 'both', name: '英美', hint: '两套并排，差异一眼看出' }
  ];

  var SAMPLES = [
    { key: 'daily', name: '常用', words: ['schedule', 'thorough', 'environment'] },
    { key: 'study', name: '学术', words: ['hypothesis', 'parameter', 'significant'] },
    { key: 'biz', name: '商务', words: ['invoice', 'negotiate', 'deadline'] }
  ];

  /* ============ 词库解析 ============ */

  var DICT = {};
  var WORDS = [];
  (function () {
    RAW.forEach(function (line) {
      var p = line.split('|');
      if (p.length < 4) return;
      var w = p[0];
      var uk = p[1];
      var us = p[2] || p[1];
      var pos = p[3] || '';
      var mean = p.length > 4 ? p.slice(3).join('|') : '';
      // 释义统一放在第 4 段：pos 与 mean 用第一个空格切开
      var sp = pos.indexOf(' ');
      var posTag = sp > 0 ? pos.slice(0, sp) : pos;
      var meaning = sp > 0 ? pos.slice(sp + 1) : mean;
      if (!uk) return;
      DICT[w] = { word: w, uk: uk, us: us, pos: posTag, mean: meaning };
      WORDS.push(w);
    });
  })();

  /* ============ 音标 → 音节 / 重音 ============ */

  // 双元音与长元音：必须先整体认成一个音节核，否则 eɪ 会被当成两个音节
  var DIPH = ['eɪ', 'aɪ', 'ɔɪ', 'aʊ', 'əʊ', 'oʊ', 'ɪə', 'eə', 'ʊə'];
  var LONGV = { 'iː': 'i', 'uː': 'u', 'ɑː': 'a', 'ɔː': 'o', 'ɜː': 'b' };
  var NUC = 'aeiouæʌɒɪʊəɜ';

  function isNuc(t) {
    return NUC.indexOf(t) >= 0;
  }

  /** 把音标切成 token，双元音/长元音算一个 token。 */
  function tokenize(ipa) {
    var s = String(ipa || '').replace(/[ˈˌ.]/g, '');
    var out = [];
    var i = 0;
    while (i < s.length) {
      var two = s.substr(i, 2);
      if (DIPH.indexOf(two) >= 0) { out.push({ t: two, n: true }); i += 2; continue; }
      if (LONGV[two]) { out.push({ t: two, n: true }); i += 2; continue; }
      out.push({ t: s[i], n: isNuc(s[i]) });
      i += 1;
    }
    return out;
  }

  /**
   * 音节切分：两个音节核之间的辅音串，最后一个留给后一个音节（做声母），
   * 其余归前一个音节。词尾「辅音 + l/n/m」单独成节（apple / sudden / nation）。
   */
  function syllables(ipa) {
    var tk = tokenize(ipa);
    if (!tk.length) return [];
    var idx = [];
    for (var i = 0; i < tk.length; i++) if (tk[i].n) idx.push(i);
    if (!idx.length) return [tk.map(function (x) { return x.t; }).join('')];

    var syls = [];
    var start = 0;
    for (var k = 0; k < idx.length; k++) {
      var nucAt = idx[k];
      var next = k + 1 < idx.length ? idx[k + 1] : tk.length;
      var cluster = next - nucAt - 1;
      var end;
      if (k + 1 === idx.length) {
        end = tk.length;                       // 最后一个音节吃到词尾
      } else if (cluster <= 1) {
        end = nucAt + 1;                       // 单辅音或没有辅音：全给下一个
      } else {
        end = nucAt + 1 + (cluster - 1);       // 只把最后一个辅音留给下一个
      }
      syls.push({ from: start, to: end });
      start = end;
    }

    // 词尾成节辅音：最后一个音节形如「核 + 两个以上辅音，且末位是 l/n/m」
    var last = syls[syls.length - 1];
    var tailTok = tk.slice(last.from, last.to);
    if (syls.length >= 1 && tailTok.length >= 2) {
      var nucCount = tailTok.filter(function (x) { return x.n; }).length;
      var tail = tailTok[tailTok.length - 1].t;
      if (nucCount === 1 && 'lnm'.indexOf(tail) >= 0 && tailTok.length - 1 - lastNucIdx(tailTok) >= 2) {
        // 切在最后一个音节核之后：ap-ple / na-tion / sud-den，不是「a · pl」这种半个辅音
        var cut = last.from + lastNucIdx(tailTok) + 1;
        syls[syls.length - 1] = { from: last.from, to: cut };
        syls.push({ from: cut, to: last.to });
      }
    }

    return syls.map(function (s) {
      return tk.slice(s.from, s.to).map(function (x) { return x.t; }).join('');
    });
  }

  function lastNucIdx(toks) {
    for (var i = toks.length - 1; i >= 0; i--) if (toks[i].n) return i;
    return -1;
  }

  /** 重音落在第几个音节（从 1 开始），以及是主重音还是次重音。 */
  function stressOf(ipa) {
    var s = String(ipa || '');
    var p = s.indexOf('ˈ');
    if (p < 0) p = s.indexOf('ˌ');
    if (p < 0) return { index: 1, primary: false };
    var head = s.slice(0, p);
    var n = syllables(head).length;
    // head 末尾可能切出一个残音节（只有辅音），按「核的个数」算更稳
    var cnt = tokenize(head).filter(function (x) { return x.n; }).length;
    return { index: (cnt || n || 0) + 1, primary: s[p] === 'ˈ' };
  }

  /* ============ 拼读规则（词库没收录时的兜底） ============ */

  // 长的放前面，先匹配到就吃掉，不再逐字母念
  var G2P = [
    ['tion', 'ʃn'], ['sion', 'ʒn'], ['cial', 'ʃl'], ['tial', 'ʃl'],
    ['ture', 'tʃə'], ['sure', 'ʒə'], ['ough', 'ɔː'], ['augh', 'ɔː'],
    ['eigh', 'eɪ'], ['igh', 'aɪ'], ['dge', 'dʒ'], ['tch', 'tʃ'],
    ['air', 'eə'], ['ear', 'ɪə'], ['eer', 'ɪə'], ['oor', 'ɔː'],
    ['our', 'aʊə'], ['ure', 'jʊə'], ['que', 'k'],
    ['ch', 'tʃ'], ['sh', 'ʃ'], ['th', 'θ'], ['ph', 'f'], ['wh', 'w'],
    ['ck', 'k'], ['ng', 'ŋ'], ['qu', 'kw'], ['gh', ''],
    ['ee', 'iː'], ['ea', 'iː'], ['oo', 'uː'], ['ou', 'aʊ'], ['ow', 'aʊ'],
    ['oi', 'ɔɪ'], ['oy', 'ɔɪ'], ['ai', 'eɪ'], ['ay', 'eɪ'], ['oa', 'əʊ'],
    ['au', 'ɔː'], ['aw', 'ɔː'], ['ei', 'eɪ'], ['ey', 'eɪ'], ['ie', 'iː'],
    ['ar', 'ɑː'], ['or', 'ɔː'], ['er', 'ɜː'], ['ir', 'ɜː'], ['ur', 'ɜː']
  ];

  var ONE = {
    a: 'æ', b: 'b', c: 'k', d: 'd', e: 'e', f: 'f', g: 'ɡ', h: 'h',
    i: 'ɪ', j: 'dʒ', k: 'k', l: 'l', m: 'm', n: 'n', o: 'ɒ', p: 'p',
    q: 'k', r: 'r', s: 's', t: 't', u: 'ʌ', v: 'v', w: 'w', x: 'ks',
    y: 'ɪ', z: 'z'
  };

  /** 拼读规则推算音标。只保证「念得出来」，不保证和词典一致。 */
  function g2p(word) {
    var w = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return '';
    var out = '';
    var i = 0;
    while (i < w.length) {
      var hit = null;
      for (var k = 0; k < G2P.length; k++) {
        var g = G2P[k][0];
        if (w.substr(i, g.length) === g) { hit = G2P[k]; break; }
      }
      if (hit) {
        // 词尾的 gh 不发音（high / though 已由 igh/ou 覆盖，这里兜住其余情况）
        if (hit[0] === 'gh' && i + 2 < w.length) { i += 2; continue; }
        out += hit[1];
        i += hit[0].length;
        continue;
      }
      var ch = w[i];
      var nxt = w[i + 1] || '';

      // 元音 + 单个辅音 + e 结尾：读长音（make / time / note）
      if ('aeiou'.indexOf(ch) >= 0 && nxt && 'bcdfgklmnprstvz'.indexOf(nxt) >= 0 &&
          i + 2 === w.length - 1 && w[i + 2] === 'e' && !/[aeiou]/.test(nxt)) {
        var lng = { a: 'eɪ', e: 'iː', i: 'aɪ', o: 'əʊ', u: 'juː' };
        out += lng[ch] + ONE[nxt];
        i += 3;
        continue;
      }
      // 词尾的哑 e（apple 里的 e 也要念，长度不足 3 的不吞）
      if (ch === 'e' && i === w.length - 1 && w.length > 2) { i += 1; continue; }
      // 词尾 y 读 i
      if (ch === 'y' && i === w.length - 1) { out += 'i'; i += 1; continue; }
      // c / g 在 e i y 前软化
      if (ch === 'c' && 'eiy'.indexOf(nxt) >= 0) { out += 's'; i += 1; continue; }
      if (ch === 'g' && 'eiy'.indexOf(nxt) >= 0) { out += 'dʒ'; i += 1; continue; }
      out += ONE[ch] || '';
      i += 1;
    }
    if (!out) return '';
    var syl = syllables(out);
    // 重音：单音节不标；多音节默认第一个音节，-tion/-ic 结尾把重音挪到倒数第二个
    var idx = 1;
    if (syl.length >= 3 && /(tion|sion|ic|ity|ial)$/.test(w)) idx = syl.length - 1;
    if (syl.length === 1) return out;
    var cut = 0;
    var tk = tokenize(out);
    // 找第 idx 个音节核的起点
    var seen = 0;
    for (var j = 0; j < tk.length; j++) {
      if (tk[j].n) {
        seen++;
        if (seen === idx) { cut = j; break; }
      }
    }
    var s2 = out.slice(0, cut) + 'ˈ' + out.slice(cut);
    return s2;
  }

  /* ============ 输入处理 ============ */

  function normalize(raw) {
    var s = String(raw == null ? '' : raw).trim().toLowerCase();
    // 只去标点/引号/空白，不能连中文和数字一起吞掉 —— 否则「abc123」会被修成合法单词
    s = s.replace(/^[\s"'“”‘’.,!?;:()\[\]…·~\-]+/, '');
    s = s.replace(/[\s"'“”‘’.,!?;:()\[\]…·~]+$/, '');
    return s;
  }

  /**
   * 解析输入：一行一个，也认逗号/空格/分号/顿号。
   * @returns {ok, words, dropped:{dup, empty}, code, message}
   */
  function parseInput(raw, max) {
    var limit = max || FREE_BATCH;
    var text = String(raw == null ? '' : raw);
    // 分隔符不合并：连续空行也要能数出来，否则「去掉了几个空行」永远是 0
    var parts = text.split(/[\n,，、;；\t]| {2,}/);
    var words = [];
    var seen = {};
    var dup = 0, empty = 0;

    for (var i = 0; i < parts.length; i++) {
      var w = normalize(parts[i]);
      if (!w) { empty++; continue; }
      if (w.length > MAX_WORD) {
        return {
          ok: false, code: 'TOO_LONG', words: words, dropped: { dup: dup, empty: empty },
          message: '有单词超过 ' + MAX_WORD + ' 个字母，先拆开再查'
        };
      }
      if (!/^[a-z][a-z'-]*$/.test(w)) {
        return {
          ok: false, code: 'NOT_WORD', words: words, dropped: { dup: dup, empty: empty },
          message: '「' + w + '」不是英文单词'
        };
      }
      if (seen[w]) { dup++; continue; }
      seen[w] = true;
      words.push(w);
    }

    if (!words.length) {
      return { ok: false, code: 'EMPTY', words: [], dropped: { dup: dup, empty: empty }, message: '先输入一个单词' };
    }
    if (words.length > limit) {
      return {
        ok: false, code: 'TOO_MANY', words: words.slice(0, limit),
        dropped: { dup: dup, empty: empty, over: words.length - limit },
        message: '一次最多查 ' + limit + ' 个，先留前 ' + limit + ' 个'
      };
    }
    return { ok: true, words: words, dropped: { dup: dup, empty: empty }, message: '' };
  }

  /* ============ 词形还原 ============ */

  function lemmatize(word) {
    var w = normalize(word);
    if (!w) return { base: '', form: '' };
    if (DICT[w]) return { base: w, form: '' };
    if (IRREGULAR[w]) return { base: IRREGULAR[w], form: '不规则变形' };

    var cands = [];
    if (/ies$/.test(w)) cands.push([w.slice(0, -3) + 'y', '复数 / 第三人称单数']);
    if (/es$/.test(w)) cands.push([w.slice(0, -2), '复数 / 第三人称单数']);
    if (/s$/.test(w) && !/ss$/.test(w)) cands.push([w.slice(0, -1), '复数 / 第三人称单数']);
    if (/ied$/.test(w)) cands.push([w.slice(0, -3) + 'y', '过去式 / 过去分词']);
    if (/ed$/.test(w)) {
      cands.push([w.slice(0, -2), '过去式 / 过去分词']);
      cands.push([w.slice(0, -1), '过去式 / 过去分词']);
    }
    if (/ing$/.test(w)) {
      cands.push([w.slice(0, -3), '现在分词']);
      cands.push([w.slice(0, -3) + 'e', '现在分词']);
    }
    if (/er$/.test(w)) cands.push([w.slice(0, -2), '比较级 / 名词']);
    if (/est$/.test(w)) cands.push([w.slice(0, -3), '最高级']);

    for (var i = 0; i < cands.length; i++) {
      if (cands[i][0].length >= 2 && DICT[cands[i][0]]) {
        return { base: cands[i][0], form: cands[i][1] };
      }
    }
    // 双写辅音：running → runn → run / stopped → stopp → stop
    for (var j = 0; j < cands.length; j++) {
      var c = cands[j][0];
      if (c.length >= 3 && c[c.length - 1] === c[c.length - 2] && DICT[c.slice(0, -1)]) {
        return { base: c.slice(0, -1), form: cands[j][1] };
      }
    }
    return { base: w, form: '' };
  }

  /* ============ 查询 ============ */

  function ipaOf(entry, accent) {
    if (!entry) return '';
    if (accent === 'us') return entry.us;
    if (accent === 'uk') return entry.uk;
    return entry.same ? entry.uk : entry.uk + '  /  ' + entry.us;
  }

  /**
   * 查一个词。
   * @returns {ok, code, message} | {ok:true, word, base, form, found, source, uk, us, same, pos, mean, syl, nSyl, stress, letters, suggest}
   */
  function lookup(raw) {
    var w = normalize(raw);
    if (!w) return { ok: false, code: 'EMPTY', message: '先输入一个单词' };
    if (w.length > MAX_WORD) {
      return { ok: false, code: 'TOO_LONG', message: '超过 ' + MAX_WORD + ' 个字母，先拆开再查' };
    }
    if (!/^[a-z][a-z'-]*$/.test(w)) return { ok: false, code: 'NOT_WORD', message: '「' + w + '」不是英文单词' };

    var base = w;
    var form = '';
    var found = false;
    var src = DICT[w];

    if (!src) {
      var lem = lemmatize(w);
      if (lem.base !== w && DICT[lem.base]) {
        base = lem.base;
        form = lem.form;
        src = DICT[base];
      }
    }
    if (src) found = true;

    var uk, us, pos, mean, source;
    if (found) {
      uk = src.uk; us = src.us; pos = src.pos; mean = src.mean; source = 'dict';
    } else {
      var est = g2p(w);
      uk = est; us = est; pos = '—';
      mean = '词库暂未收录';
      source = 'rule';
    }

    var st = stressOf(uk);
    var syl = syllables(uk);

    return {
      ok: true,
      word: w,
      base: base,
      form: form,
      found: found,
      source: source,
      uk: uk, us: us,
      same: uk === us,
      pos: pos,
      mean: mean,
      letters: w.length,
      syl: syl,
      nSyl: syl.length,
      stress: st,
      suggest: found ? [] : suggest(w, 4)
    };
  }

  function batch(raw, max) {
    var p = parseInput(raw, max);
    if (!p.ok) {
      // TOO_MANY 时仍把前 N 个查出来，只是带一个提示
      if (p.code === 'TOO_MANY') {
        var list = p.words.map(lookup).filter(function (e) { return e.ok; });
        return { ok: true, list: list, warning: p.message, truncated: true };
      }
      return { ok: false, code: p.code, message: p.message, list: [] };
    }
    var out = [];
    for (var i = 0; i < p.words.length; i++) {
      var e = lookup(p.words[i]);
      if (e.ok) out.push(e);
    }
    var warn = '';
    if (p.dropped.dup) warn = '去掉 ' + p.dropped.dup + ' 个重复的';
    return { ok: true, list: out, warning: warn, dropped: p.dropped };
  }

  /* ============ 拼写建议 ============ */

  function editDistance(a, b) {
    a = String(a || ''); b = String(b || '');
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = [];
    for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      var cur = [i];
      for (var k = 1; k <= b.length; k++) {
        var cost = a[i - 1] === b[k - 1] ? 0 : 1;
        cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + cost);
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /** 按编辑距离找最像的词库词，距离超过一半就不返回，免得瞎猜。 */
  function suggest(word, n) {
    var w = normalize(word);
    if (!w) return [];
    var lim = Math.max(2, Math.floor(w.length / 2));
    var hits = [];
    for (var i = 0; i < WORDS.length; i++) {
      var d = editDistance(w, WORDS[i]);
      if (d <= lim) hits.push({ word: WORDS[i], dist: d });
    }
    hits.sort(function (a, b) { return a.dist - b.dist || a.word.localeCompare(b.word); });
    return hits.slice(0, n || 4).map(function (x) { return x.word; });
  }

  /* ============ 展示 ============ */

  /** 音节串：`ˈen · vi · ron · ment`，重读音节前面带 ˈ */
  function sylText(entry, accent) {
    var ipa = accent === 'us' ? entry.us : entry.uk;
    var syl = syllables(ipa);
    if (!syl.length) return '';
    var idx = stressOf(ipa).index;
    return syl.map(function (s, i) {
      return (i + 1 === idx ? 'ˈ' : '') + s;
    }).join(' · ');
  }

  function shareText(entry) {
    if (!entry || !entry.word) return '';
    var lines = [];
    if (entry.same) {
      lines.push(entry.word + '  ' + entry.uk);
    } else {
      lines.push(entry.word + '  英 ' + entry.uk + '  美 ' + entry.us);
    }
    lines.push(entry.pos + ' ' + entry.mean);
    lines.push(entry.nSyl + ' 个音节，重音在第 ' + entry.stress.index + ' 个');
    return lines.join('\n');
  }

  function limitOf(unlocked, max) {
    return unlocked ? (max || HIST_MAX) : HIST_FREE;
  }

  function historyAdd(list, item, max) {
    var cap = max || HIST_FREE;
    if (cap < 1) cap = HIST_FREE;
    var out = [item].concat(list || []);
    // 同一个词只留最新一条，避免记录被重复查询刷满
    var seen = {}, res = [];
    for (var i = 0; i < out.length; i++) {
      var k = (out[i] && out[i].word) || '';
      if (!k || seen[k]) continue;
      seen[k] = true;
      res.push(out[i]);
    }
    return res.slice(0, cap);
  }

  function removeAt(list, i) {
    if (!list || i < 0 || i >= list.length) return (list || []).slice();
    var out = list.slice();
    out.splice(i, 1);
    return out;
  }

  function sampleText(key) {
    for (var i = 0; i < SAMPLES.length; i++) {
      if (SAMPLES[i].key === key) return SAMPLES[i].words.join('\n');
    }
    return '';
  }

  return {
    DICT: DICT,
    WORDS: WORDS,
    ACCENTS: ACCENTS,
    SAMPLES: SAMPLES,
    MAX_WORD: MAX_WORD,
    MAX_BATCH: MAX_BATCH,
    FREE_BATCH: FREE_BATCH,
    HIST_FREE: HIST_FREE,
    HIST_MAX: HIST_MAX,
    normalize: normalize,
    parseInput: parseInput,
    lemmatize: lemmatize,
    lookup: lookup,
    batch: batch,
    ipaOf: ipaOf,
    syllables: syllables,
    stressOf: stressOf,
    g2p: g2p,
    editDistance: editDistance,
    suggest: suggest,
    sylText: sylText,
    shareText: shareText,
    limitOf: limitOf,
    historyAdd: historyAdd,
    removeAt: removeAt,
    sampleText: sampleText
  };
});
