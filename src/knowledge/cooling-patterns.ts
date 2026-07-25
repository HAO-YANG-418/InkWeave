// ============================================================
// 网文套路冷却库 — 防重复模式知识库
// 定义哪些写法/情节/角色模式需要冷却，冷却多久，变体有哪些
// 冷却系统读取这份知识来检测重复套路
// ============================================================

// === 套路模式定义 ===

/** 套路类别 */
export type PatternCategory =
  | 'opening'        // 开篇模式
  | 'battle'         // 战斗描写
  | 'face_slap'      // 装逼打脸
  | 'emotion'        // 情绪陈词
  | 'transition'     // 转折信号
  | 'opponent'       // 对手原型
  | 'effect'         // 效果修饰
  | 'dialogue'       // 对话套路
  | 'psychology'     // 心理描写套路
  | 'environment';   // 环境描写套路

/** 套路冷却配置 */
export interface PatternEntry {
  /** 唯一ID */
  id: string;
  /** 类别 */
  category: PatternCategory;
  /** 套路名称 */
  name: string;
  /** 冷却章节数 */
  cooldown: number;
  /** 触发关键词（含变体） */
  triggers: string[];
  /** 替代写法建议 */
  alternative: string;
  /** 好写法 vs 坏写法对比示例 */
  examples?: {
    bad: string;
    good: string;
  };
}

// === 套路库 ===

export const COOLING_PATTERNS: PatternEntry[] = [

  // ===== 开篇模式（冷却5章） =====
  {
    id: 'open_glint_eye',
    category: 'opening',
    name: '眼中精光一闪式开篇',
    cooldown: 5,
    triggers: ['眼中精光一闪', '眼中闪过一丝精光', '双目精光一闪', '眸中精光闪烁'],
    alternative: '用一个具体行为开场：推门/握拳/起身/看向某处',
  },
  {
    id: 'open_deep_breath',
    category: 'opening',
    name: '深吸一口气式开篇',
    cooldown: 5,
    triggers: ['深吸一口气', '长长地吐出一口浊气', '缓缓吐出一口气'],
    alternative: '从环境/声音/动作开场，不用呼吸描写',
  },
  {
    id: 'open_at_this_moment',
    category: 'opening',
    name: '此刻的XX式开篇',
    cooldown: 5,
    triggers: ['此刻的', '此时的', '眼下的'],
    alternative: '直接写角色在做什么，不用"此刻"标记',
  },
  {
    id: 'open_words_fall',
    category: 'opening',
    name: '话音刚落式开篇',
    cooldown: 4,
    triggers: ['话音刚落', '话音未落', '话音落下'],
    alternative: '直接写下一个动作/反应，不用"话音刚落"过渡',
  },
  {
    id: 'open_morning',
    category: 'opening',
    name: '清晨醒来式开篇',
    cooldown: 6,
    triggers: ['清晨', '天刚亮', '翌日清晨', '次日一早', '阳光透过'],
    alternative: '跳过日常流程，从当天第一个事件/异常写起',
  },

  // ===== 战斗描写（冷却3章） =====
  {
    id: 'battle_punch_out',
    category: 'battle',
    name: '一拳轰出',
    cooldown: 3,
    triggers: ['一拳轰出', '一拳砸出', '一拳打出', '一拳挥出'],
    alternative: '写拳头的轨迹/力量/风声/击中效果，不用"一拳XX出"',
  },
  {
    id: 'battle_aura_surge',
    category: 'battle',
    name: '气势暴涨',
    cooldown: 3,
    triggers: ['气势暴涨', '气势大盛', '气势陡然攀升', '气息暴涨'],
    alternative: '写气势变化的具体表现：空气震动/地面龟裂/衣袍猎猎',
  },
  {
    id: 'battle_face_change',
    category: 'battle',
    name: '脸色大变',
    cooldown: 3,
    triggers: ['脸色大变', '脸色骤变', '面色大变', '面色骤变', '脸色一变'],
    alternative: '写具体的面部反应：血色褪尽/青筋暴起/嘴唇发白',
  },
  {
    id: 'battle_fly_back',
    category: 'battle',
    name: '倒飞出去',
    cooldown: 3,
    triggers: ['倒飞出去', '倒飞而出', '暴退数步', '腾腾腾后退'],
    alternative: '写飞出去的具体过程：脚离地/撞碎什么/滚了几圈',
  },
  {
    id: 'battle_boom',
    category: 'battle',
    name: '轰的一声',
    cooldown: 2,
    triggers: ['轰的一声', '轰然巨响', '一声巨响', '轰隆一声'],
    alternative: '写声音的具象：地面震裂声/空气爆鸣声/骨骼碎裂声',
  },
  {
    id: 'battle_afterimage',
    category: 'battle',
    name: '化为残影',
    cooldown: 3,
    triggers: ['化为残影', '化作残影', '身形一闪', '残影掠过'],
    alternative: '写速度的具象：只看到模糊的线条/风先到人后到',
  },

  // ===== 装逼打脸（冷却5章） =====
  {
    id: 'face_silence',
    category: 'face_slap',
    name: '全场寂静',
    cooldown: 5,
    triggers: ['全场寂静', '鸦雀无声', '全场死寂', '一片寂静'],
    alternative: '写寂静的具体表现：无人说话/杯盏停住/呼吸声可闻',
  },
  {
    id: 'face_gasp',
    category: 'face_slap',
    name: '倒吸凉气',
    cooldown: 5,
    triggers: ['倒吸一口凉气', '倒吸一口冷气', '纷纷倒吸凉气'],
    alternative: '写具体的生理反应：后背发凉/汗毛竖起/手心出汗',
  },
  {
    id: 'face_you_dare',
    category: 'face_slap',
    name: '你也配',
    cooldown: 5,
    triggers: ['你也配', '你也敢', '你也配和我', '区区'],
    alternative: '用行为展现轻蔑：不回头/继续做自己的事/随手指向',
  },
  {
    id: 'face_anyone_else',
    category: 'face_slap',
    name: '还有谁',
    cooldown: 5,
    triggers: ['还有谁', '谁还敢', '谁来战我'],
    alternative: '用气场/行为展现压制力，不用台词喊出来',
  },
  {
    id: 'face_seek_death',
    category: 'face_slap',
    name: '不知死活',
    cooldown: 4,
    triggers: ['不知死活', '找死', '自寻死路', '螳臂当车'],
    alternative: '写对手的具体反应：冷笑/出手/不屑一顾',
  },

  // ===== 情绪陈词（冷却3章） =====
  {
    id: 'emo_heart_knife',
    category: 'emotion',
    name: '心如刀绞',
    cooldown: 3,
    triggers: ['心如刀绞', '心如刀割', '万箭穿心'],
    alternative: '写痛苦的具象：捂住胸口/蜷缩/呼吸困难',
  },
  {
    id: 'emo_anger_burn',
    category: 'emotion',
    name: '怒火中烧',
    cooldown: 3,
    triggers: ['怒火中烧', '怒不可遏', '怒火升腾', '怒意翻涌'],
    alternative: '写愤怒的具象：握拳到指节发白/咬牙/太阳穴跳动',
  },
  {
    id: 'emo_mixed_feelings',
    category: 'emotion',
    name: '五味杂陈',
    cooldown: 3,
    triggers: ['五味杂陈', '百感交集', '心潮澎湃', '感慨万千'],
    alternative: '写一个具体行为来展现复杂情绪：沉默良久/苦笑/摇头',
  },
  {
    id: 'emo_cold_heart',
    category: 'emotion',
    name: '心寒',
    cooldown: 3,
    triggers: ['心寒', '如坠冰窟', '寒意涌上心头'],
    alternative: '写生理反应：后背发凉/手指发抖/声音发颤',
  },

  // ===== 转折信号（冷却2章） =====
  {
    id: 'trans_however',
    category: 'transition',
    name: '然而',
    cooldown: 2,
    triggers: ['然而', '但是', '可是'],
    alternative: '用事件因果转折，不用转折词',
  },
  {
    id: 'trans_just_then',
    category: 'transition',
    name: '就在这时',
    cooldown: 2,
    triggers: ['就在这时', '就在此时', '正在这时', '话音未落'],
    alternative: '直接写发生的事，让事件本身制造转折',
  },
  {
    id: 'trans_unknown',
    category: 'transition',
    name: '他不知道的是',
    cooldown: 3,
    triggers: ['他不知道的是', '殊不知', '他尚未意识到', '他不知道，一场'],
    alternative: '删掉，让读者和角色一起发现',
  },
  {
    id: 'trans_surprisingly',
    category: 'transition',
    name: '意外的是',
    cooldown: 2,
    triggers: ['意外的是', '出乎意料', '出人意料'],
    alternative: '直接写意外发生的事，不用"意外的是"预告',
  },

  // ===== 对手原型（冷却8章） =====
  {
    id: 'opp_arrogant_young',
    category: 'opponent',
    name: '嚣张富二代/少爷',
    cooldown: 8,
    triggers: ['少爷', '公子', '纨绔', '你知不知道我是谁'],
    alternative: '设计不同类型的对手：阴险型/隐忍型/疯癫型/理想型',
  },
  {
    id: 'opp_sinister_elder',
    category: 'opponent',
    name: '阴险长老/前辈',
    cooldown: 8,
    triggers: ['长老', '前辈', '老夫', '不知好歹的小辈'],
    alternative: '设计不同年龄/身份的对手：同龄天才/神秘强者/体制对手',
  },
  {
    id: 'opp_arrogant_genius',
    category: 'opponent',
    name: '傲慢天才',
    cooldown: 8,
    triggers: ['天才', '第一', '百年难遇', '你不过是'],
    alternative: '设计有实力但不同性格的对手：沉默型/狂热型/理性型',
  },
  {
    id: 'opp_hypocrite',
    category: 'opponent',
    name: '伪善君子',
    cooldown: 8,
    triggers: ['道貌岸然', '伪君子', '表面仁义', '满口仁义'],
    alternative: '设计动机更复杂的对手：被迫型/信念型/利益型',
  },
  {
    id: 'opp_jealous_peer',
    category: 'opponent',
    name: '嫉妒同门',
    cooldown: 8,
    triggers: ['嫉妒', '凭什么', '不甘心', '同样是'],
    alternative: '设计有不同动机的同辈对手：竞争型/误解型/立场对立型',
  },

  // ===== 效果修饰（冷却3章） =====
  {
    id: 'eff_terrifying',
    category: 'effect',
    name: '恐怖的',
    cooldown: 3,
    triggers: ['恐怖的', '恐怖如斯', '恐怖至极'],
    alternative: '用具体效果代替：地面裂开三尺/空气扭曲/百米内无声',
  },
  {
    id: 'eff_amazing',
    category: 'effect',
    name: '惊人的',
    cooldown: 3,
    triggers: ['惊人的', '惊人至极', '令人震惊'],
    alternative: '用具体数字/对比展现',
  },
  {
    id: 'eff_terrible',
    category: 'effect',
    name: '可怕的',
    cooldown: 3,
    triggers: ['可怕的', '可怖的', '骇人的'],
    alternative: '用具体效果代替空泛修饰',
  },
  {
    id: 'eff_incredible',
    category: 'effect',
    name: '不可思议',
    cooldown: 3,
    triggers: ['不可思议', '匪夷所思', '难以置信'],
    alternative: '用具体数字/对比展现',
  },
  {
    id: 'eff_destructive',
    category: 'effect',
    name: '毁灭性的',
    cooldown: 3,
    triggers: ['毁灭性的', '毁天灭地', '天崩地裂'],
    alternative: '写破坏的具体表现：地面塌陷/建筑碎裂/烟尘冲天',
  },

  // ===== 对话套路（冷却4章） =====
  {
    id: 'dialog_you_dont_understand',
    category: 'dialogue',
    name: '你根本不懂式对话',
    cooldown: 4,
    triggers: ['你根本不懂', '你不明白', '你永远不会理解', '你什么都不知道', '你不懂'],
    alternative: '用行为展示不理解：摇头/转身/沉默，替代台词喊出来',
    examples: {
      bad: '"你根本不懂我的感受！"她哭着喊道。',
      good: '她看着他，嘴唇动了动，最终什么都没说，转身推开门走了出去。',
    },
  },
  {
    id: 'dialog_sneer_question',
    category: 'dialogue',
    name: '冷笑反问式对话',
    cooldown: 4,
    triggers: ['冷笑一声', '冷笑道', '嗤笑', '冷哼一声', '你当我是傻子'],
    alternative: '用微表情/动作传达轻蔑：眼角微抬/手指敲桌面/视线偏移',
    examples: {
      bad: '"你当我是三岁小孩？"他冷笑一声道。',
      good: '他没接话，只是拿起茶杯吹了吹热气，目光从对方身上滑过去，像看一件无关紧要的摆设。',
    },
  },
  {
    id: 'dialog_sworn_vow',
    category: 'dialogue',
    name: '发誓赌咒式对话',
    cooldown: 5,
    triggers: ['我发誓', '我对天发誓', '若违此誓', '天打雷劈', '我以性命担保'],
    alternative: '用行为/决策展现决心，不用口头发誓',
    examples: {
      bad: '"我发誓一定会救你出来！"他对天发誓道。',
      good: '他没说话，把仅剩的水壶塞进她手里，转身朝洞口走去。',
    },
  },
  {
    id: 'dialog_mock_repeat',
    category: 'dialogue',
    name: '嘲讽重复式对话',
    cooldown: 4,
    triggers: ['就凭你', '就你', '你也想', '区区一个', '不过是个'],
    alternative: '写对手的漫不经心：继续做自己的事/不看对方/随手一挥',
    examples: {
      bad: '"就凭你？也想挑战我？"他嗤笑道。',
      good: '他甚至没有停下擦剑的动作，只是偏了偏头，像在确认刚才有没有听到什么声音。',
    },
  },
  {
    id: 'dialog_info_dump',
    category: 'dialogue',
    name: '设定灌输式对话',
    cooldown: 5,
    triggers: ['你知道吗', '让我告诉你', '其实事情是这样的', '说起来', '你有所不知'],
    alternative: '通过角色争论/质疑/误解来自然带出设定，不用一人说教',
    examples: {
      bad: '"让我告诉你，这个世界有三块大陆，每块大陆有五个帝国……"老人滔滔不绝。',
      good: '"北境的事你不懂。"老周摆摆手。"我去年在霜铁关待过三个月。"他反驳。老周这才看了他一眼。',
    },
  },

  // ===== 心理描写套路（冷却3章） =====
  {
    id: 'psy_clench_fist_resolve',
    category: 'psychology',
    name: '握拳暗誓式心理',
    cooldown: 3,
    triggers: ['暗暗发誓', '握紧双拳', '心中暗想', '在心里对自己说', '默默下定决心'],
    alternative: '写决心后的第一个行动，用行动代替心理独白',
    examples: {
      bad: '他握紧双拳，暗暗发誓，总有一天要让所有人刮目相看。',
      good: '他回到桌前，把那本被撕掉一半的功法重新铺平，一笔一划地抄了起来。',
    },
  },
  {
    id: 'psy_mind_racing',
    category: 'psychology',
    name: '脑中闪过式心理',
    cooldown: 3,
    triggers: ['脑海中闪过', '脑中浮现', '脑海中掠过', '心中一动', '灵光一闪'],
    alternative: '直接写角色做了什么决策/动作，不写思考过程',
    examples: {
      bad: '脑海中闪过一个念头，他猛地抬头。',
      good: '他猛地抬头——那扇门，昨天明明是锁着的。',
    },
  },
  {
    id: 'psy_complex_emotion',
    category: 'psychology',
    name: '复杂情绪标签式心理',
    cooldown: 3,
    triggers: ['说不清的感觉', '复杂的眼神', '难以言喻', '无法形容的', '百般滋味'],
    alternative: '写一个具体的微表情或动作来暗示复杂情绪',
    examples: {
      bad: '他的眼神变得复杂，那种感觉难以言喻。',
      good: '他张了张嘴，又闭上，手指无意识地摩挲着杯沿。',
    },
  },
  {
    id: 'psy_sudden_realization',
    category: 'psychology',
    name: '恍然大悟式心理',
    cooldown: 3,
    triggers: ['恍然大悟', '猛然醒悟', '顿时明白', '原来如此', '一语惊醒梦中人'],
    alternative: '写领悟后的行为变化，不用"恍然大悟"标签',
    examples: {
      bad: '他恍然大悟，原来师父说的那句话是这个意思！',
      good: '他猛地停下脚步。师父的那句话——"壁不渡人，人自渡"。他一直在等壁来选他，可壁从来不选人。',
    },
  },
  {
    id: 'psy_inner_struggle',
    category: 'psychology',
    name: '天人交战式心理',
    cooldown: 3,
    triggers: ['天人交战', '心中挣扎', '两个声音在脑海', '理智告诉他', '但情感'],
    alternative: '写角色在犹豫中的无意识行为：来回踱步/反复拿放东西',
    examples: {
      bad: '理智告诉他应该离开，但情感让他无法迈步，心中天人交战。',
      good: '他的脚已经转向门外，手却还搭在门框上。三秒。五秒。他收回手，坐了回去。',
    },
  },

  // ===== 环境描写套路（冷却4章） =====
  {
    id: 'env_dead_silence',
    category: 'environment',
    name: '死寂式环境',
    cooldown: 4,
    triggers: ['死一般的寂静', '死一般的沉寂', '空气仿佛凝固', '空气仿佛冻结', '时间仿佛静止'],
    alternative: '写具体的安静：能听到自己的心跳/远处的虫鸣/风穿过缝隙的声音',
    examples: {
      bad: '空气仿佛凝固了，死一般的寂静笼罩着所有人。',
      good: '安静得能听到房梁上木头开裂的细微声响，外面不知名的虫子叫了两声，又停了。',
    },
  },
  {
    id: 'env_heavy_atmosphere',
    category: 'environment',
    name: '压抑氛围式环境',
    cooldown: 4,
    triggers: ['压抑', '令人窒息', '喘不过气', '沉闷得', '压抑到了极点'],
    alternative: '写具体的环境细节传达压迫感：低矮的天花板/昏暗的灯光/狭窄的通道',
    examples: {
      bad: '气氛压抑到了极点，所有人都喘不过气来。',
      good: '头顶的岩层又矮了一截，他不得不弯腰前行。火把的光只照得到三步以内，再往前就是看不到底的黑。',
    },
  },
  {
    id: 'env_wind_howl',
    category: 'environment',
    name: '寒风呼啸式环境',
    cooldown: 3,
    triggers: ['寒风呼啸', '冷风刺骨', '寒风凛冽', '冷风如刀', '风雪交加'],
    alternative: '写风对具体事物的影响：衣角翻飞/沙石打脸/火把摇灭',
    examples: {
      bad: '寒风呼啸，冷风刺骨，仿佛要将人冻僵。',
      good: '风把沙子甩在脸上，他不得不眯着眼。每走一步，靴底都被冻得发硬，踩上去咯吱作响。',
    },
  },
  {
    id: 'env_moon_scenery',
    category: 'environment',
    name: '月色如水式环境',
    cooldown: 4,
    triggers: ['月色如水', '月光倾泻', '银色的月光', '月华如练', '清冷的月光'],
    alternative: '写月光照在具体物体上的效果：地上投下的影子/水面反射的光斑',
    examples: {
      bad: '月色如水，倾泻在大地上，一切显得那么宁静。',
      good: '月光从窗棂的缝隙挤进来，在地上画了一道白线，刚好照到他枕边的那把短刀。',
    },
  },
  {
    id: 'env_grand_scale',
    category: 'environment',
    name: '宏大叙事式环境',
    cooldown: 4,
    triggers: ['一眼望不到头', '无边无际', '广袤无垠', '绵延不绝', '一望无际'],
    alternative: '用具体参照物展现空间尺度：走到中间花了半天/抬头看不到顶',
    examples: {
      bad: '眼前的地下空间无边无际，令人震撼。',
      good: '他朝对面喊了一声，回音过了三秒才传回来。以声音的速度算，这个洞窟至少有五百米宽。',
    },
  },
];

// === 情节套路模板（用于检测整段情节是否走老路） ===

export interface PlotTemplate {
  /** 模板ID */
  id: string;
  /** 模板名称 */
  name: string;
  /** 冷却章节数 */
  cooldown: number;
  /** 模板步骤 */
  steps: string[];
  /** 检测信号 */
  signals: string[];
  /** 变数建议 */
  variation: string;
}

export const PLOT_TEMPLATES: PlotTemplate[] = [
  {
    id: 'plot_face_slap',
    name: '装逼打脸模板',
    cooldown: 10,
    steps: ['被看不起/嘲讽', '隐忍或被动应对', '展示真正实力', '全场震惊/后悔'],
    signals: ['嘲讽', '看不起', '废物', '展示实力', '震惊', '后悔'],
    variation: '打脸后引发更大麻烦；对方有后台；主角赢了但付出代价；旁观者不震惊反而警惕',
  },
  {
    id: 'plot_auction',
    name: '拍卖会模板',
    cooldown: 12,
    steps: ['进入拍卖场', '低价起拍', '有人竞价抬高', '主角截胡', '得罪竞拍者'],
    signals: ['拍卖', '竞价', '截胡', '志在必得'],
    variation: '主角拍到的东西有问题；拍卖行有阴谋；主角买不起想要的东西；竞拍者是盟友',
  },
  {
    id: 'plot_tournament',
    name: '比赛/比武模板',
    cooldown: 12,
    steps: ['分组抽签', '遇到强敌', '苦战/险胜', '爆发/突破', '晋级'],
    signals: ['抽签', '对手', '苦战', '险胜', '突破', '晋级'],
    variation: '主角输了但有收获；比赛被打断；对手放水有目的；主角弃权',
  },
  {
    id: 'plot_fortune',
    name: '奇遇/宝物模板',
    cooldown: 10,
    steps: ['陷入危险绝境', '意外发现入口/遗迹', '获得宝物/传承', '实力大增'],
    signals: ['绝境', '意外', '遗迹', '传承', '宝物', '突破'],
    variation: '宝物有代价/诅咒；传承不完整；获得的不是力量而是信息；有人捷足先登',
  },
  {
    id: 'plot_rescue',
    name: '英雄救美/救援模板',
    cooldown: 8,
    steps: ['遇到危难中的人', '出手相救', '被救者感恩/产生好感', '建立关系'],
    signals: ['危险', '相救', '感谢', '好感'],
    variation: '救的人是敌人卧底；救援失败但获得线索；被救者更强；救援引来更大麻烦',
  },
];

// === 工具函数 ===

/** 按类别获取套路 */
export function getPatternsByCategory(category: PatternCategory): PatternEntry[] {
  return COOLING_PATTERNS.filter(p => p.category === category);
}

/** 获取所有触发词 */
export function getAllTriggers(): string[] {
  return COOLING_PATTERNS.flatMap(p => p.triggers);
}

/** 按ID获取套路 */
export function getPatternById(id: string): PatternEntry | undefined {
  return COOLING_PATTERNS.find(p => p.id === id);
}

/** 获取类别默认冷却章数 */
export function getCategoryCooldown(category: PatternCategory): number {
  const defaults: Record<PatternCategory, number> = {
    opening: 5,
    battle: 3,
    face_slap: 5,
    emotion: 3,
    transition: 2,
    opponent: 8,
    effect: 3,
    dialogue: 4,
    psychology: 3,
    environment: 4,
  };
  return defaults[category];
}

/** 获取类别中文名 */
export function getCategoryLabel(category: PatternCategory): string {
  const labels: Record<PatternCategory, string> = {
    opening: '开篇模式',
    battle: '战斗描写',
    face_slap: '装逼打脸',
    emotion: '情绪陈词',
    transition: '转折信号',
    opponent: '对手原型',
    effect: '效果修饰',
    dialogue: '对话套路',
    psychology: '心理描写套路',
    environment: '环境描写套路',
  };
  return labels[category];
}

/** 检测文本中命中的套路模式 */
export function detectPatterns(text: string): Array<{ pattern: PatternEntry; count: number; matchedTriggers: string[] }> {
  const results: Array<{ pattern: PatternEntry; count: number; matchedTriggers: string[] }> = [];
  for (const pattern of COOLING_PATTERNS) {
    const matched: string[] = [];
    let count = 0;
    for (const trigger of pattern.triggers) {
      const idx = text.indexOf(trigger);
      if (idx >= 0) {
        matched.push(trigger);
        // 统计出现次数
        let pos = idx;
        while (pos >= 0) {
          count++;
          pos = text.indexOf(trigger, pos + trigger.length);
        }
      }
    }
    if (matched.length > 0) {
      results.push({ pattern, count, matchedTriggers: matched });
    }
  }
  return results;
}
