// ============================================================
// 反思评判标准 — 12维度写作质量知识库
// 这是写作引擎的核心知识：定义"什么样的网文章节算好/算差"
// 规则引擎和LLM都读取这份知识来工作
// ============================================================

import type { QualityDimension } from '../reflection/types';

// === 知识结构定义 ===

/** 单个差模式的定义 */
export interface BadPattern {
  /** 模式名称 */
  name: string;
  /** 严重程度 0-1（1=最严重） */
  severity: number;
  /** 模式描述：什么样的文本属于这个模式 */
  description: string;
  /** 检测信号：具体的词/句式/结构特征 */
  signals: string[];
  /** 改进建议 */
  suggestion: string;
}

/** 单个维度的完整评判标准 */
export interface DimensionCriterion {
  /** 维度key */
  key: QualityDimension;
  /** 中文名 */
  name: string;
  /** 权重（在总分中占比） */
  weight: number;
  /** 这个维度评的是什么 */
  whatItMeasures: string;
  /** 好的标志：具体什么样算好 */
  goodSignals: string[];
  /** 差的模式列表 */
  badPatterns: BadPattern[];
  /** 评分指南（0.8+优秀 / 0.6-0.8合格 / 0.6以下需改进） */
  scoringGuide: string;
  /** S级写法 vs C级写法对比片段 */
  comparisonExamples?: {
    sLevel: string;
    cLevel: string;
    explanation: string;
  };
}

// === 12维度评判标准 ===

export const REFLECTION_CRITERIA: DimensionCriterion[] = [

  // 1. 意图对齐
  {
    key: 'intent_alignment',
    name: '意图对齐',
    weight: 0.20,
    whatItMeasures: '这章要做的事做了没？该推进剧情却在水日常？该高潮却没爆起来？',
    goodSignals: [
      '章节核心事件与意图匹配（推进章有新剧情进展，高潮章有爆发，揭示章有真相揭露）',
      '全章围绕核心意图展开，没有大段无关内容',
      '意图完成度可感知：读者读完能说出"这章讲了什么"',
    ],
    badPatterns: [
      {
        name: '意图跑偏',
        severity: 0.8,
        description: '标注要推进剧情，实际全章在写日常/修炼/聊天，核心剧情没动',
        signals: ['全章无新事件', '核心矛盾未推进', '大量日常描写'],
        suggestion: '砍掉与核心意图无关的段落，集中写一个推进剧情的事件',
      },
      {
        name: '高潮未爆',
        severity: 0.7,
        description: '标注高潮章，但情绪没到，冲突没爆，像流水账一样平淡度过',
        signals: ['冲突双方未直接对抗', '情绪描写平缓', '无转折/爆发点'],
        suggestion: '让冲突正面爆发，用短句加速节奏，制造至少一个转折点',
      },
      {
        name: '揭示空洞',
        severity: 0.6,
        description: '标注揭示真相，但揭示的内容没有冲击力，或揭示方式太直接',
        signals: ['直接说出真相无铺垫', '揭示内容读者早已猜到', '揭示后角色无反应'],
        suggestion: '揭示前制造悬念，揭示时配合角色情绪反应，揭示后引发新的问题',
      },
      {
        name: '水章',
        severity: 0.9,
        description: '全章无新信息、无冲突、无决策、无关系变化，纯粹凑字数',
        signals: ['无新事件', '无冲突', '无决策', '大量回顾总结', '修炼描写无意外'],
        suggestion: '这章可以删掉或合并到前后章。每章至少要有"一个新信息/一个冲突/一个决策"中的一个',
      },
      {
        name: '意图模糊',
        severity: 0.6,
        description: '章节意图不明确，既像推进又像铺垫，什么都想写结果什么都没写好',
        signals: ['一章涉及3+个不同事件', '每个事件都浅尝辄止', '章节重心不断转移'],
        suggestion: '一章只做一件事：要么推进一个事件，要么深入一个角色，要么揭示一个真相',
      },
    ],
    scoringGuide: '0.8+：核心意图完全实现，无跑偏内容。0.6-0.8：意图基本实现但有少量无关内容。0.6以下：意图未实现或严重跑偏。',
    comparisonExamples: {
      cLevel: '本章意图：推进剧情。\n主角醒来，吃了早饭，去修炼室修炼了两个时辰，遇到了师弟聊了几句，回到房间想了想明天的比试，然后睡了。',
      sLevel: '本章意图：推进剧情。\n主角在修炼室被师弟打断——长老召见。到了大殿才发现，不是训话，是让他代替受伤的师兄参加三日后的大比。他还没来得及拒绝，长老就把对手的情报丢在了桌上：凝气九层，擅长水系。',
      explanation: 'C级全是日常流程，核心剧情没有推进。S级每一段都在推进：被打断→召见→新任务→对手信息，一条线拉到底。',
    },
  },

  // 2. 情感冲击力
  {
    key: 'emotional_impact',
    name: '情感冲击力',
    weight: 0.10,
    whatItMeasures: '情绪有没有起伏？还是从头到尾一个调子？读者有没有"心跳时刻"？',
    goodSignals: [
      '全章有明确的情绪曲线（压抑→爆发 / 期待→落空 / 紧张→释放）',
      '至少有一个"心跳时刻"：让读者屏住呼吸或倒吸凉气的瞬间',
      '情绪转换有铺垫，不是突然跳变',
      '读者能感受到角色的情绪，而非被告知"他很愤怒"',
    ],
    badPatterns: [
      {
        name: '情绪平淡',
        severity: 0.7,
        description: '全章情绪一条直线，没有高低起伏，读着没有感觉',
        signals: ['无情绪高潮点', '情绪词使用均匀', '无冲突/危机/转折'],
        suggestion: '制造一个情绪爆发点：可以是一个意外、一次冲突、一个真相揭露',
      },
      {
        name: '告知而非展现',
        severity: 0.6,
        description: '直接写"他很愤怒/悲伤/开心"，而不是通过行为/对话/细节让读者感受到',
        signals: ['"他感到XX"', '"心中涌起XX"', '"一股XX之情油然而生"'],
        suggestion: '删掉情绪标签词，用行为展现：愤怒→握拳/咬牙/摔东西，悲伤→沉默/避开目光',
      },
      {
        name: '情绪断裂',
        severity: 0.5,
        description: '上一段还在紧张战斗，下一段突然开始轻松聊天，情绪转换无过渡',
        signals: ['相邻段落情绪反差大', '无过渡句', '场景切换突兀'],
        suggestion: '情绪转换需要过渡：用一个动作、一句话、或一个环境描写来缓冲',
      },
      {
        name: '过度煽情',
        severity: 0.5,
        description: '强行煽情，大段心理描写堆砌情绪，读者反而无感',
        signals: ['心理描写超过3段连续', '大量排比句渲染情绪', '无实际事件支撑情绪'],
        suggestion: '减少直接心理描写，用一个具体行为或细节来承载情绪',
      },
      {
        name: '情绪标签堆砌',
        severity: 0.5,
        description: '连续使用情绪标签词："愤怒""悲伤""绝望"在同一页出现3次以上',
        signals: ['情绪标签词密度高', '同一段落3+情绪标签', '情绪词无行为支撑'],
        suggestion: '每个情绪标签后面跟一个具体行为：不写"他很愤怒"，写"他把手里的杯子捏碎了"',
      },
    ],
    scoringGuide: '0.8+：有清晰情绪曲线和心跳时刻，情感展现到位。0.6-0.8：有情绪起伏但不够强烈。0.6以下：情绪平淡或处理粗糙。',
    comparisonExamples: {
      cLevel: '他很愤怒。心中涌起一股无名之火。他想起了师父的死，更加悲伤了。愤怒和悲伤交织在一起，让他心如刀绞。他握紧双拳，暗暗发誓要报仇。',
      sLevel: '他盯着桌上那把断剑。剑柄上还残留着师父手心的茧痕。他伸手去碰，指尖刚触到剑身，猛地缩回来——像被烫到了。他把断剑推到桌角，走出了房间。门在身后关上的那一刻，走廊里有人听到一声极轻的、像是从牙缝里挤出来的声音。',
      explanation: 'C级全是情绪标签词堆砌，"愤怒""悲伤""心如刀绞"都在告知。S级全程没有出现一个情绪词，但读者能感受到压抑的愤怒和悲伤——不碰断剑（不敢面对）、推到桌角（无法直视）、关门后才出声（强忍）。用行为承载情绪，比直说有力十倍。',
    },
  },

  // 3. 节奏控制
  {
    key: 'pacing',
    name: '节奏控制',
    weight: 0.08,
    whatItMeasures: '该快的地方快了吗（战斗/冲突）？该慢的地方慢了吗（情感/氛围）？',
    goodSignals: [
      '战斗/冲突/追逐场景用短句，节奏紧凑',
      '情感/氛围/回忆场景用长句，节奏舒缓',
      '段落长短交替，避免连续大段或连续碎段',
      '信息释放有节奏：关键信息放在段落首尾，不埋在大段中间',
    ],
    badPatterns: [
      {
        name: '战斗拖沓',
        severity: 0.7,
        description: '战斗场景用了长句和大段描写，节奏慢得像散步',
        signals: ['战斗中长句多于短句', '战斗段落超过5行', '战斗中插入大段心理/回忆'],
        suggestion: '战斗用短句（5-12字），一段不超过3句，砍掉心理描写，只写动作和结果',
      },
      {
        name: '情感仓促',
        severity: 0.5,
        description: '本该慢下来的情感场景，三两句就带过了',
        signals: ['情感场景段落极短', '无环境/感官描写', '情绪转换太快'],
        suggestion: '情感场景放慢节奏，加入环境烘托和感官细节，让情绪有发酵空间',
      },
      {
        name: '节奏单一',
        severity: 0.4,
        description: '全章句式长短一致，段落大小均匀，读起来催眠',
        signals: ['句长方差小', '段落长度均匀', '无节奏变化点'],
        suggestion: '在关键处用短句制造停顿，在铺陈处用长句拉展开，让节奏有起伏',
      },
      {
        name: '信息倾倒',
        severity: 0.6,
        description: '大段设定/背景/说明一口气倒出来，读者消化不了',
        signals: ['连续3段以上纯说明', '无角色视角的设定介绍', '大段修炼体系讲解'],
        suggestion: '把设定拆散到多个场景中，通过角色对话/行为/冲突自然展示，不要直接说明',
      },
    ],
    scoringGuide: '0.8+：节奏快慢得当，信息释放有层次。0.6-0.8：基本合理但局部可优化。0.6以下：节奏混乱或单一。',
  },

  // 4. 角色声音一致性
  {
    key: 'character_voice',
    name: '角色声音一致性',
    weight: 0.08,
    whatItMeasures: '角色说话像他自己吗？有没有所有人说话一个味？',
    goodSignals: [
      '不同角色的用词习惯、句式长短、语气态度有区分',
      '角色对话符合其身份/性格/教育背景',
      '同一角色的说话方式跨章节一致',
      '对话能体现角色关系（上下级/敌友/亲疏）',
    ],
    badPatterns: [
      {
        name: '声音同质化',
        severity: 0.7,
        description: '所有角色说话方式一样，分不清谁在说',
        signals: ['不同角色对话句式相似', '用词习惯无差异', '语气态度一致'],
        suggestion: '给每个角色设计语言特征：粗人说短句用俗语，文人说长句用雅词，老人爱说教',
      },
      {
        name: '人设崩塌',
        severity: 0.8,
        description: '角色的行为/说话与之前建立的设定矛盾',
        signals: ['冷静角色突然暴怒无铺垫', '胆小角色突然勇敢无原因', '聪明角色做蠢事'],
        suggestion: '角色行为变化需要有原因：通过事件/压力/成长来驱动，不能凭空变',
      },
      {
        name: '万能应答',
        severity: 0.5,
        description: '角色对话都是"嗯""好的""我知道了"这类无信息回应',
        signals: ['大量简短应答', '对话不推进剧情', '对话不展现性格'],
        suggestion: '每句对话要么推进剧情、要么展现性格、要么制造张力，砍掉无意义应答',
      },
    ],
    scoringGuide: '0.8+：角色声音鲜明区分，人设一致。0.6-0.8：基本可区分但偶有雷同。0.6以下：角色同质化或人设崩塌。',
  },

  // 5. 开头力度
  {
    key: 'opening_strength',
    name: '开头力度',
    weight: 0.12,
    whatItMeasures: '前3段有没有抓住读者？还是在铺背景/写醒来/赶路？',
    goodSignals: [
      '从冲突/异常/悬念/动作直接开场',
      '前3段内出现能引发好奇心的信息',
      '开头场景具体可感（有时间/地点/感官细节）',
      '开头与上一章结尾有衔接（但不重复）',
    ],
    badPatterns: [
      {
        name: '背景铺陈型',
        severity: 0.7,
        description: '开头大段介绍世界观/历史/修炼体系/地理环境',
        signals: ['前3段为纯说明', '无角色出场', '无冲突/动作'],
        suggestion: '砍掉背景介绍，从角色正在经历的事件开场，背景信息后续融入',
      },
      {
        name: '日常流水型',
        severity: 0.6,
        description: '主角醒来/吃饭/赶路/修炼，无冲突无异常',
        signals: ['"清晨""天刚亮"', '起床/洗漱/吃饭描写', '赶路/修炼无意外'],
        suggestion: '从当天发生的第一个异常/冲突写起，跳过日常流程',
      },
      {
        name: '假钩子型',
        severity: 0.8,
        description: '作者跳出来剧透："他不知道，一场危机正在逼近"',
        signals: ['"他不知道"', '"殊不知"', '"他尚未意识到"', '"一场XX正在酝酿"'],
        suggestion: '删掉剧透句，让危机自然发生，读者和角色一起发现才有张力',
      },
      {
        name: '总结回顾型',
        severity: 0.6,
        description: '开头回顾上一章发生了什么',
        signals: ['"经过昨天的XX"', '"回想起之前的"', '大段回顾前情'],
        suggestion: '用一个与前章相关的细节/动作开场，不要回顾总结',
      },
    ],
    scoringGuide: '0.8+：开头直接切入，有悬念/冲突/异常，抓人。0.6-0.8：开头尚可但不够有力。0.6以下：开头拖沓或套路化。',
    comparisonExamples: {
      cLevel: '清晨，阳光透过窗帘洒进房间。李明睁开眼睛，深吸一口气，新的一天开始了。他洗漱完毕，吃过早饭，便前往修炼室。今天他要继续突破凝气第六层。',
      sLevel: '剑架是空的。李明站在修炼室门口，看着那个空了一夜的剑架，后背一阵发凉。昨晚他把师父的断剑放在那里——他记得很清楚，因为放的时候手抖了三次。但现在剑架上只有一层薄灰，连放剑的痕迹都没了。',
      explanation: 'C级是最典型的网文开头：清晨醒来→洗漱吃饭→去修炼。全是日常流程，零信息量。S级第一句就是异常（剑架空了），第二段给出细节（手抖了三次说明剑很重要），第三段强化悬念（连放剑的痕迹都没了）。读者会问：剑去哪了？谁拿的？为什么？——这就是钩子。',
    },
  },

  // 6. 结尾钩子
  {
    key: 'ending_hook',
    name: '结尾钩子',
    weight: 0.12,
    whatItMeasures: '结尾有没有让读者想看下一章？还是平淡收尾？',
    goodSignals: [
      '结尾制造了悬念/危机/反转/抉择，让读者想知道接下来会怎样',
      '钩子与本章内容有因果关联，不是硬加的',
      '结尾干脆利落，不拖泥带水',
      '钩子强度与章节类型匹配（高潮章钩子更强）',
    ],
    badPatterns: [
      {
        name: '平淡收尾',
        severity: 0.7,
        description: '事情办完了，大家各回各家，没有任何悬念',
        signals: ['"于是这一天就这样过去了"', '无悬念/危机/期待', '情绪平缓收尾'],
        suggestion: '在结尾抛出一个新问题/危机/线索，让读者带着疑问进入下一章',
      },
      {
        name: '说教收尾',
        severity: 0.6,
        description: '结尾大段感慨/感悟/说教，破坏节奏',
        signals: ['结尾段为角色感悟', '大段心理独白', '主题升华式收尾'],
        suggestion: '把感悟融入行为，用一个动作或一句对话收尾，留白比说教更有力',
      },
      {
        name: '硬断',
        severity: 0.5,
        description: '话没说完/动作没做完直接断章，像被掐断一样',
        signals: ['句子未完成', '动作进行中断章', '无任何收束'],
        suggestion: '断章要在悬念最浓处，但要有一定收束感，不是硬切',
      },
      {
        name: '假悬念',
        severity: 0.6,
        description: '结尾制造了悬念，但下一章开头就轻松化解，欺骗读者',
        signals: ['结尾危机感强但下章秒解', '反复使用"生死未卜"式结尾'],
        suggestion: '钩子要兑现：结尾制造的危机，下一章要有真实后果，不能秒解',
      },
    ],
    scoringGuide: '0.8+：结尾有强钩子，让读者迫切想看下一章。0.6-0.8：有钩子但力度不够。0.6以下：平淡收尾或处理粗糙。',
    comparisonExamples: {
      cLevel: '比试结束了，李明赢得了胜利。他回到房间，心中感慨万千。这一天让他明白了很多道理。他躺在床上，渐渐入睡。明天又是新的一天。',
      sLevel: '李明赢了。他走下擂台的时候，对手忽然开口："你以为赢了就结束了？"李明回头。对手的嘴角扯出一个诡异的弧度，像是笑，又像是某种警告。"你师父的剑——是谁给你的？"李明的脚步钉在了原地。',
      explanation: 'C级是最差的结尾：事情办完→感慨→睡觉→明天又是新的一天。零悬念，读者可以随时弃书。S级先给出胜利的满足感（赢了），然后立刻用对手的一句话翻转（"你以为结束了？"），最后抛出一个指向核心秘密的问题（师父的剑从哪来的）。读者必须翻到下一章。',
    },
  },

  // 7. 信息密度
  {
    key: 'information_density',
    name: '信息密度',
    weight: 0.07,
    whatItMeasures: '这章给了读者多少新信息？有没有大段废话？',
    goodSignals: [
      '每段都推进了剧情/展现了角色/提供了新信息',
      '没有连续3段以上的纯描写/纯心理/纯说明',
      '信息释放有层次：先给关键信息，再补充细节',
      '读者读完能说出2-3个本章获得的新信息',
    ],
    badPatterns: [
      {
        name: '信息稀薄',
        severity: 0.7,
        description: '全章3000字但实际推进的剧情只有一句话能概括',
        signals: ['大量重复描写', '同一情绪反复渲染', '无新事件/新信息'],
        suggestion: '压缩篇幅，把一章的内容精简到信息密度合适的长度',
      },
      {
        name: '废话填充',
        severity: 0.6,
        description: '为了凑字数，大量无意义对话/描写/心理活动',
        signals: ['无信息对话', '重复已知信息', '无目的场景描写'],
        suggestion: '每段问自己：删掉这段读者会少知道什么？如果答案是"nothing"，删掉',
      },
      {
        name: '信息过载',
        severity: 0.5,
        description: '一章塞了太多新设定/新角色/新事件，读者消化不了',
        signals: ['一章引入3+新角色', '大段设定说明', '多个事件并行无主次'],
        suggestion: '一章聚焦1-2个核心信息，其余拆到后续章节',
      },
    ],
    scoringGuide: '0.8+：信息密度适中，每段都有价值。0.6-0.8：基本合理但局部有水分。0.6以下：信息稀薄或过载。',
  },

  // 8. 感官丰富度
  {
    key: 'sensory_richness',
    name: '感官丰富度',
    weight: 0.04,
    whatItMeasures: '五感描写有没有？是不是全是视觉？描写是服务叙事还是在堆词？',
    goodSignals: [
      '关键场景有2种以上感官描写（视觉+听觉最常见）',
      '感官描写服务于情绪/氛围，不是为描写而描写',
      '感官细节有选择性：只写能传递信息的细节',
      '不同场景的感官侧重不同（战斗重触觉听觉，日常重视觉嗅觉）',
    ],
    badPatterns: [
      {
        name: '纯视觉',
        severity: 0.4,
        description: '全章只有视觉描写，没有声音/触感/气味/温度',
        signals: ['无听觉词', '无触觉词', '无嗅觉词'],
        suggestion: '在关键场景加入声音/触感：战斗的金属碰撞声，密室的潮湿气味',
      },
      {
        name: '感官堆砌',
        severity: 0.5,
        description: '为了"丰富"而堆砌感官描写，与剧情/情绪无关',
        signals: ['连续大段感官描写', '感官细节不影响剧情', '描写后无角色反应'],
        suggestion: '感官描写要服务叙事：用一个感官细节传递情绪/暗示危险/建立氛围',
      },
      {
        name: '感官缺失',
        severity: 0.6,
        description: '全章几乎无环境/感官描写，像剧本一样只有对话和动作',
        signals: ['无环境描写', '无感官词', '场景感弱'],
        suggestion: '在场景转换时加入1-2句环境描写，建立空间感',
      },
    ],
    scoringGuide: '0.8+：感官描写恰当，服务叙事。0.6-0.8：有感官但不够精准。0.6以下：感官缺失或堆砌。',
  },

  // 9. 对话质量
  {
    key: 'dialogue_quality',
    name: '对话质量',
    weight: 0.07,
    whatItMeasures: '对话是在推进剧情还是在说废话？有没有信息倾倒？',
    goodSignals: [
      '每段对话都推进剧情/展现性格/制造张力/提供信息之一',
      '对话有潜台词：角色说的和想的不一样',
      '对话节奏有变化：有快有慢，有长有短',
      '对话中能看出角色关系和权力动态',
    ],
    badPatterns: [
      {
        name: '信息倾倒',
        severity: 0.7,
        description: '角色通过对话大段解释设定/背景/计划，像在念说明书',
        signals: ['单段对话超过5行', '角色解释设定', '对话内容是作者想告诉读者的信息'],
        suggestion: '把设定拆散到多个场景，通过角色行为/冲突展示，对话只说角色会说的话',
      },
      {
        name: '无意义对话',
        severity: 0.5,
        description: '对话不推进剧情，不展现性格，纯粹凑字数',
        signals: ['寒暄/客套话', '重复已知信息', '"嗯""哦""这样啊"'],
        suggestion: '砍掉所有不推进剧情/不展现性格/不制造张力的对话',
      },
      {
        name: '对话标签累赘',
        severity: 0.3,
        description: '每句对话都加"他愤怒地说""她温柔地回答"这类标签',
        signals: ['每句对话后有情感副词', '"XX地说/道/喊"频繁出现'],
        suggestion: '对话内容本身应能传达情绪，省掉情感副词，只在必要时加标签',
      },
      {
        name: '所有人一个腔调',
        severity: 0.6,
        description: '不同角色说话方式完全一样',
        signals: ['对话句式雷同', '用词习惯无差异', '无法通过对话猜出说话者'],
        suggestion: '给每个角色独特的语言特征：用词/句式/口头禅/语气',
      },
    ],
    scoringGuide: '0.8+：对话精炼有力，每句有价值。0.6-0.8：基本可读但有水分。0.6以下：对话冗余或同质化。',
  },

  // 10. 文字质量
  {
    key: 'prose_quality',
    name: '文字质量',
    weight: 0.05,
    whatItMeasures: '文字基本功：用词是否准确？句式是否多样？有没有语病？',
    goodSignals: [
      '用词精准，动词选择有力（"劈"而非"砍"，"刺"而非"捅"）',
      '句式多样：长短交替，不全是陈述句',
      '无明显语病/错别字/标点错误',
      '修辞恰当：比喻新鲜不老套，排比有节奏感',
    ],
    badPatterns: [
      {
        name: '词汇贫乏',
        severity: 0.4,
        description: '反复使用同一个词，特别是形容词和动词',
        signals: ['同一词一章出现5+次', '"强大""恐怖""惊人"反复出现'],
        suggestion: '用同义词替换，或直接删掉修饰词让动作本身传递力量',
      },
      {
        name: '句式单一',
        severity: 0.4,
        description: '全章都是"主语+谓语+宾语"的结构，读起来单调',
        signals: ['句式结构雷同', '无倒装/省略/反问', '段落节奏均匀'],
        suggestion: '变化句式：用短句制造紧张，用倒装制造强调，用反问制造互动感',
      },
      {
        name: '修辞老套',
        severity: 0.5,
        description: '比喻/形容都是用烂了的："如闪电般""快如疾风""重如泰山"',
        signals: ['"如XX般"频繁', '常见成语堆砌', '比喻无新意'],
        suggestion: '要么用新鲜的比喻（与世界观相关），要么直接用动作展现，不用比喻',
      },
      {
        name: '过度修饰',
        severity: 0.4,
        description: '每个名词前都堆形容词，每个动词后都跟副词',
        signals: ['形容词/副词密度高', '名词前2+修饰词', '动词后2+副词'],
        suggestion: '砍掉一半修饰词，用强动词代替"副词+弱动词"（"冲"代替"快速跑"）',
      },
    ],
    scoringGuide: '0.8+：文字干净有力，用词精准。0.6-0.8：基本通顺但不够精炼。0.6以下：文字粗糙或过度修饰。',
  },

  // 11. 连续性
  {
    key: 'continuity',
    name: '连续性',
    weight: 0.05,
    whatItMeasures: '与前文的衔接是否自然？有没有设定矛盾？伏笔有没有管理？',
    goodSignals: [
      '本章事件与前文有因果关联，不是凭空发生',
      '角色状态/能力/位置与前文一致',
      '世界观设定无矛盾',
      '前文埋的伏笔在合理时机回收，不遗忘也不突兀',
    ],
    badPatterns: [
      {
        name: '设定矛盾',
        severity: 0.9,
        description: '本章内容与前文建立的设定冲突',
        signals: ['角色能力忽高忽低', '地理位置错误', '时间线矛盾', '已死角色复活'],
        suggestion: '检查前文设定，修正矛盾内容。如果是故意设计，需要给出解释',
      },
      {
        name: '伏笔遗忘',
        severity: 0.6,
        description: '前文埋的伏笔迟迟不回收，读者已经忘了',
        signals: ['活跃伏笔超过10个', '伏笔埋设超过20章未回收', '新章无伏笔回收'],
        suggestion: '在接下来的章节中回收1-2个旧伏笔，不要只埋不收',
      },
      {
        name: '场景断裂',
        severity: 0.5,
        description: '与上一章结尾的衔接不自然，场景跳转突兀',
        signals: ['无过渡直接换场景', '上一章结尾的悬念本章不回应', '时间跳跃无说明'],
        suggestion: '本章开头回应上章结尾的悬念/危机，用过渡句连接场景',
      },
      {
        name: '角色失踪',
        severity: 0.5,
        description: '重要角色突然消失，多个章节不出现也不交代去向',
        signals: ['前文角色不再出现', '无交代去向', '新角色替代旧角色功能'],
        suggestion: '即使是暂时不出场的角色，也要用一句话交代其去向/状态',
      },
    ],
    scoringGuide: '0.8+：衔接自然，设定一致，伏笔管理良好。0.6-0.8：基本连贯但有小瑕疵。0.6以下：有明显矛盾或断裂。',
  },

  // 12. 原创性/套路化
  {
    key: 'originality',
    name: '原创性/套路化',
    weight: 0.04,
    whatItMeasures: '有没有陈词滥调？情节/描写/对话是否模式化？',
    goodSignals: [
      '情节发展有意外但合理，不完全是读者能猜到的',
      '描写方式有个人特色，不是通用模板',
      '角色反应出人意料但符合性格',
      '对常见桥段有新处理方式',
    ],
    badPatterns: [
      {
        name: '套路化描写',
        severity: 0.6,
        description: '使用了网文高频套路词和描写模式',
        signals: [
          '嘴角勾起一抹弧度/冷笑',
          '眼中闪过一丝寒芒/精光/杀意',
          '倒吸一口凉气/冷气',
          '全场寂静/鸦雀无声',
          '恐怖如斯/不可思议',
          '宛如蛟龙/猛虎下山',
          '不由地/忍不住/竟然',
          '这一刻，他/她...',
          '一股恐怖的气息',
          '脸色大变/骤变',
        ],
        suggestion: '用具体的、与角色/场景相关的描写替代套路词。写"他笑了"不如写他笑的具体方式',
      },
      {
        name: '情节套路',
        severity: 0.7,
        description: '情节发展完全可预测，使用了网文经典模板',
        signals: [
          '装逼打脸模板：被看不起→展示实力→全场震惊',
          '拍卖会模板：低价起拍→疯狂竞价→主角截胡',
          '比赛模板：分组抽签→遇到强敌→险胜/爆发',
          '奇遇模板：危险绝境→意外发现→获得宝物',
        ],
        suggestion: '在套路中加入变数：打脸后引发更大麻烦，奇遇有代价，比赛输了但有收获',
      },
      {
        name: '万能修饰词',
        severity: 0.4,
        description: '过度使用"恐怖的""惊人的""可怕的""不可思议的"等空泛修饰',
        signals: ['"恐怖的XX"', '"惊人的XX"', '"可怕的XX"', '"不可思议的XX"', '"毁灭性的XX"'],
        suggestion: '用具体的数字/对比/效果来代替空泛修饰："一拳将地面砸出三米深坑"比"恐怖的一拳"有力',
      },
      {
        name: '转折套路',
        severity: 0.5,
        description: '每次转折都用同样的信号词',
        signals: ['"然而"', '"就在这时"', '"他不知道的是"', '"殊不知"', '"意外的是"'],
        suggestion: '减少转折信号词，用事件本身的因果来制造转折，让读者自己发现',
      },
    ],
    scoringGuide: '0.8+：有原创性，无套路词。0.6-0.8：偶有套路但整体可接受。0.6以下：大量套路词和模式化情节。',
  },
];

// === 套路词黑名单（从originality维度提取，供规则引擎快速检测） ===

export interface ClicheEntry {
  /** 套路词 */
  pattern: string;
  /** 类别 */
  category: 'expression' | 'emotion' | 'action' | 'transition' | 'modifier';
  /** 替代建议 */
  alternative: string;
}

export const CLICHE_BLACKLIST: ClicheEntry[] = [
  // 表情类
  { pattern: '嘴角勾起', category: 'expression', alternative: '写具体的微表情：嘴角抽搐/紧抿/微张' },
  { pattern: '嘴角微扬', category: 'expression', alternative: '描写笑的具体方式：龇牙/咧嘴/嘴角歪向一侧' },
  { pattern: '眼中闪过', category: 'expression', alternative: '写眼神变化的具象：瞳孔收缩/目光锐利/眯起眼' },
  { pattern: '目光一凝', category: 'expression', alternative: '写注意到的具体反应：转头/停步/手按上武器' },
  { pattern: '面色一变', category: 'expression', alternative: '写脸色变化的原因和具体表现' },
  { pattern: '脸色大变', category: 'expression', alternative: '写具体的面部反应：血色褪尽/青筋暴起/嘴唇发白' },
  { pattern: '脸色骤变', category: 'expression', alternative: '同上' },
  { pattern: '面无表情', category: 'expression', alternative: '用行为展现冷静：无波动地继续/机械地重复动作' },
  { pattern: '似笑非笑', category: 'expression', alternative: '描写具体的表情细节' },
  { pattern: '皮笑肉不笑', category: 'expression', alternative: '同上' },
  // 反应类
  { pattern: '倒吸一口凉气', category: 'emotion', alternative: '写具体的生理反应：后背发凉/汗毛竖起/手心出汗' },
  { pattern: '倒吸一口冷气', category: 'emotion', alternative: '同上' },
  { pattern: '全场寂静', category: 'emotion', alternative: '写寂静的具体表现：无人说话/杯盏停住/呼吸声可闻' },
  { pattern: '鸦雀无声', category: 'emotion', alternative: '同上' },
  { pattern: '全场哗然', category: 'emotion', alternative: '写具体的嘈杂：议论声炸开/椅子被推开/有人站了起来' },
  { pattern: '众人哗然', category: 'emotion', alternative: '同上' },
  { pattern: '不由得', category: 'emotion', alternative: '直接写动作，省掉"不由得"' },
  { pattern: '不由自主', category: 'emotion', alternative: '同上' },
  { pattern: '忍不住', category: 'emotion', alternative: '同上' },
  { pattern: '竟然', category: 'emotion', alternative: '减少使用频率，用事件本身制造意外感' },
  // 动作类
  { pattern: '气势暴涨', category: 'action', alternative: '写气势变化的具体表现：空气震动/地面龟裂/衣袍猎猎' },
  { pattern: '气势大盛', category: 'action', alternative: '同上' },
  { pattern: '一拳轰出', category: 'action', alternative: '写拳头的轨迹/力量/风声/击中效果' },
  { pattern: '倒飞出去', category: 'action', alternative: '写飞出去的具体过程：脚离地/撞碎什么/滚了几圈' },
  { pattern: '化为残影', category: 'action', alternative: '写速度的具象：只看到模糊的线条/风先到人后到' },
  { pattern: '身形一闪', category: 'action', alternative: '同上' },
  // 转折类
  { pattern: '然而', category: 'transition', alternative: '用事件因果转折，不用"然而"' },
  { pattern: '就在这时', category: 'transition', alternative: '直接写发生的事，让事件本身制造转折' },
  { pattern: '就在此时', category: 'transition', alternative: '同上' },
  { pattern: '他不知道的是', category: 'transition', alternative: '删掉，让读者和角色一起发现' },
  { pattern: '殊不知', category: 'transition', alternative: '同上' },
  { pattern: '他尚未意识到', category: 'transition', alternative: '同上' },
  { pattern: '一场XX正在酝酿', category: 'transition', alternative: '删掉，让危机自然发生' },
  // 修饰类
  { pattern: '恐怖如斯', category: 'modifier', alternative: '用具体的效果描写代替' },
  { pattern: '不可思议', category: 'modifier', alternative: '用具体数字/对比展现' },
  { pattern: '恐怖的', category: 'modifier', alternative: '用具体效果代替空泛修饰' },
  { pattern: '惊人的', category: 'modifier', alternative: '同上' },
  { pattern: '可怕的', category: 'modifier', alternative: '同上' },
  { pattern: '毁灭性的', category: 'modifier', alternative: '同上' },
  { pattern: '宛如蛟龙', category: 'modifier', alternative: '用与世界观相关的比喻' },
  { pattern: '猛虎下山', category: 'modifier', alternative: '同上' },
  { pattern: '这一刻', category: 'modifier', alternative: '减少使用，用场景本身标记重要时刻' },
];

// === 工具函数 ===

/** 获取所有维度key */
export function getAllDimensionKeys(): QualityDimension[] {
  return REFLECTION_CRITERIA.map(c => c.key);
}

/** 按key获取维度标准 */
export function getCriterionByKey(key: QualityDimension): DimensionCriterion | undefined {
  return REFLECTION_CRITERIA.find(c => c.key === key);
}

/** 获取所有套路词（用于快速检测） */
export function getAllCliches(): string[] {
  return CLICHE_BLACKLIST.map(c => c.pattern);
}

/** 按类别获取套路词 */
export function getClichesByCategory(category: ClicheEntry['category']): ClicheEntry[] {
  return CLICHE_BLACKLIST.filter(c => c.category === category);
}

/** 生成维度评分prompt（供LLM使用） */
export function generateReflectionPrompt(): string {
  const dimensions = REFLECTION_CRITERIA.map(c => {
    const badPatternsText = c.badPatterns
      .map(b => `  - ${b.name}（严重度${b.severity}）：${b.description}\n    信号：${b.signals.join('、')}\n    建议：${b.suggestion}`)
      .join('\n');
    return `【${c.name}】权重${(c.weight * 100).toFixed(0)}%
评什么：${c.whatItMeasures}
好的标志：${c.goodSignals.join('；')}
差的模式：
${badPatternsText}
评分标准：${c.scoringGuide}`;
  }).join('\n\n');

  return `你是网文写作质量评审专家。请按以下12个维度评估章节质量，每个维度给出0-1的分数和具体问题。

${dimensions}

请以JSON格式输出评估结果。`;
}

/** 维度中文名映射 */
export const DIMENSION_LABELS: Record<QualityDimension, string> = Object.fromEntries(
  REFLECTION_CRITERIA.map(c => [c.key, c.name])
) as Record<QualityDimension, string>;
