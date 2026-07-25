// ============================================================
// 叙事策略执行手册 — 8种策略的详细写作指导
// 叙事策略模块读取这份知识来推荐和执行策略
// ============================================================

// === 策略执行手册 ===

export interface StrategyPlaybook {
  /** 策略key */
  key: string;
  /** 中文名 */
  name: string;
  /** 适用场景（网文具体场景，不是抽象意图） */
  bestScenarios: string[];
  /** 不适用场景 */
  worstScenarios: string[];
  /** 执行要点 */
  executionGuide: {
    /** 开头怎么写 */
    opening: string;
    /** 发展段怎么写 */
    development: string;
    /** 高潮段怎么写 */
    climax: string;
    /** 结尾怎么写 */
    ending: string;
  };
  /** 节奏参数 */
  pacing: {
    /** 句式 */
    sentenceLength: 'short' | 'medium' | 'long' | 'mixed';
    /** 段落密度 */
    paragraphDensity: 'sparse' | 'medium' | 'dense';
    /** 对话比例 */
    dialogueRatio: number;
    /** 描写比例 */
    descriptionRatio: number;
  };
  /** 典型错误 */
  commonMistakes: string[];
  /** 搭配技法 */
  compatibleTechniques: string[];
  /** 经典网文场景示例 */
  sceneExamples?: string[];
  /** 读者体验：用了这个策略，读者应该有什么感觉 */
  readerExperience?: string;
}

// === 8种策略的执行手册 ===

export const STRATEGY_PLAYBOOKS: StrategyPlaybook[] = [

  {
    key: 'info_compression',
    name: '信息压制',
    bestScenarios: [
      '揭示重大真相前的铺垫',
      '角色进入未知环境/面对未知存在',
      '营造恐惧/压迫/神秘氛围',
      '强者登场前的气场铺垫',
    ],
    worstScenarios: ['快节奏战斗', '轻松日常', '搞笑场景'],
    executionGuide: {
      opening: '从一个正常场景开始，逐渐加入不对劲的细节——声音消失、温度降低、光线变化',
      development: '角色注意到异常但无法理解全貌，读者获得的信息略多于角色，制造"读者替角色着急"的感觉',
      climax: '异常达到顶点，角色被迫面对，但真相只揭露一部分——给读者比角色多一点点信息',
      ending: '角色暂时脱困或获得部分信息，但更大的疑问浮出水面',
    },
    pacing: {
      sentenceLength: 'medium',
      paragraphDensity: 'dense',
      dialogueRatio: 0.2,
      descriptionRatio: 0.5,
    },
    commonMistakes: [
      '一开始就把氛围拉满，没有递进过程',
      '角色反应过度，打破压迫感',
      '信息给的太多太快，失去神秘感',
      '只描写环境不推进剧情，变成纯氛围文',
    ],
    compatibleTechniques: ['感官沉浸', '多线交叉'],
    sceneExamples: [
      '《吞噬星空》罗峰第一次进入遗迹：先是正常探索→发现不对劲（声音消失）→感受到巨大存在→只看到冰山一角',
      '《完美世界》石昊进入禁区：环境逐渐变化→同伴消失→发现远古痕迹→意识到自己面对的是什么',
    ],
    readerExperience: '读者应该感到一种"有什么不对劲"的不安感，随着信息一点点释放，不安感逐渐升级为恐惧或好奇。关键是让读者比角色多知道一点点，但又不知道全部。',
  },

  {
    key: 'short_acceleration',
    name: '短句加速',
    bestScenarios: [
      '战斗高潮',
      '追逐/逃亡',
      '突发危机',
      '紧张对峙',
      '连续动作场面',
    ],
    worstScenarios: ['情感回忆', '世界观展示', '日常对话', '环境描写'],
    executionGuide: {
      opening: '直接从动作开始，不要铺垫。第一个动作就是冲突的开始',
      development: '动作连续不断，一个接一个。段落极短（1-3句），句子控制在5-12字。大量使用动词，砍掉形容词',
      climax: '节奏最快的地方，可以用单字/单词成段。感官只保留视觉和听觉，砍掉心理活动',
      ending: '一个动作的停顿——不是结束，是更大的危机即将到来',
    },
    pacing: {
      sentenceLength: 'short',
      paragraphDensity: 'sparse',
      dialogueRatio: 0.15,
      descriptionRatio: 0.2,
    },
    commonMistakes: [
      '打着打着突然插入大段回忆/心理活动',
      '战斗中停下来解释招式原理/能力设定',
      '短句写了两段就回到长描写，节奏断裂',
      '每个动作都加修饰词，拖慢节奏',
      '战斗过程太长，读者疲劳',
    ],
    compatibleTechniques: ['感官聚焦', '断点叙事'],
  },

  {
    key: 'sensory_immersion',
    name: '感官沉浸',
    bestScenarios: [
      '角色进入新环境/新世界',
      '情感爆发前的铺垫',
      '修炼/冥想/感悟场景',
      '重要地点首次登场',
    ],
    worstScenarios: ['快速战斗', '紧急逃亡', '信息密集对话'],
    executionGuide: {
      opening: '从角色的第一个感官体验开始——不是看到什么，而是感受到什么',
      development: '逐步展开多种感官（视觉→听觉→触觉→嗅觉），每种感官服务于情绪/氛围建立',
      climax: '感官体验达到高峰，角色获得某种领悟或发现关键信息',
      ending: '感官收束到一个具体细节上，作为本章的"锚点"',
    },
    pacing: {
      sentenceLength: 'long',
      paragraphDensity: 'dense',
      dialogueRatio: 0.1,
      descriptionRatio: 0.6,
    },
    commonMistakes: [
      '五感全写但没有重点，变成感官清单',
      '感官描写与剧情/情绪无关，为描写而描写',
      '描写太长拖慢节奏，读者跳读',
      '只写视觉忽略其他感官',
    ],
    compatibleTechniques: ['信息压制', '内心独白'],
  },

  {
    key: 'dialogue_driven',
    name: '对话驱动',
    bestScenarios: [
      '角色关系建立/深化',
      '信息交换/计划讨论',
      '矛盾冲突但不涉及武力',
      '揭示角色性格/动机',
      '谈判/对峙',
    ],
    worstScenarios: ['纯战斗场面', '独处修炼', '环境探索'],
    executionGuide: {
      opening: '从一个有信息量的对话开始，不是寒暄，直接切入核心话题',
      development: '对话有来有往，每方都有自己的目的。通过对话展现角色立场/性格/关系',
      climax: '对话中的冲突达到顶点——可能是一次揭露、一次拒绝、一次威胁',
      ending: '对话以一个意味深长的回应或沉默结束，留下余味',
    },
    pacing: {
      sentenceLength: 'mixed',
      paragraphDensity: 'medium',
      dialogueRatio: 0.6,
      descriptionRatio: 0.15,
    },
    commonMistakes: [
      '对话变成信息倾倒，角色像在念说明书',
      '所有角色说话一个味，分不清谁在说',
      '对话不推进剧情，纯粹凑字数',
      '每句话都加"他愤怒地说""她温柔地回答"',
      '对话太长不插入动作/表情描写，变成剧本',
    ],
    compatibleTechniques: ['多线交叉', '内心独白'],
  },

  {
    key: 'inner_monologue',
    name: '内心独白',
    bestScenarios: [
      '角色面临重大抉择',
      '角色经历重大事件后的心理消化',
      '揭示角色真实想法（与外表不同）',
      '角色成长/转变的节点',
    ],
    worstScenarios: ['战斗进行中', '快节奏剧情', '多人场景'],
    executionGuide: {
      opening: '从一个具体的外部刺激开始（一句话/一个画面/一个动作），引发角色内心反应',
      development: '内心思考逐步深入，从表层反应到深层原因。展现角色的矛盾、挣扎、推理过程',
      climax: '角色做出决定或获得领悟——但这个领悟可能是有偏差的（为后续埋伏笔）',
      ending: '角色基于内心思考做出一个外部行动，把内心变化转化为剧情推进',
    },
    pacing: {
      sentenceLength: 'long',
      paragraphDensity: 'medium',
      dialogueRatio: 0.05,
      descriptionRatio: 0.3,
    },
    commonMistakes: [
      '大段心理描写没有外部事件锚定，变成意识流',
      '角色想的和做的不一致但没有解释原因',
      '内心独白超过全章40%，读者失去耐心',
      '角色在内心想的东西读者已经知道，没有新信息',
      '内心独白不推进剧情，只是重复情绪',
    ],
    compatibleTechniques: ['感官沉浸', '对话驱动'],
  },

  {
    key: 'multi_thread',
    name: '多线交叉',
    bestScenarios: [
      '多角色同时行动',
      '多条情节线需要同步推进',
      '制造"信息差"张力（读者知道角色不知道）',
      '大事件涉及多方势力',
    ],
    worstScenarios: ['单角色独处章节', '需要深度聚焦的情感场景', '短章节'],
    executionGuide: {
      opening: '从一条线开始，快速切换到另一条线。让读者意识到多件事在同时发生',
      development: '线索交替推进，每次切换都留下悬念。切换频率逐渐加快',
      climax: '多条线在同一时间点汇聚——不同角色面对同一事件的不同反应',
      ending: '线索暂时收束但未完全解决，为下一章的多线展开留口',
    },
    pacing: {
      sentenceLength: 'mixed',
      paragraphDensity: 'medium',
      dialogueRatio: 0.3,
      descriptionRatio: 0.25,
    },
    commonMistakes: [
      '切换太频繁，读者跟不上',
      '某条线太久不回来，读者忘了',
      '多线之间没有关联，像在看多本不同的书',
      '切换点没有悬念，读者没有"还想看那条线"的冲动',
      '所有线的节奏一样，没有区分',
    ],
    compatibleTechniques: ['信息压制', '短句加速'],
  },

  {
    key: 'flashback',
    name: '倒叙切入',
    bestScenarios: [
      '本章高潮需要前史支撑才有力',
      '揭示角色过去的关键经历',
      '解释当前事件的根源',
      '制造"原来如此"的顿悟感',
    ],
    worstScenarios: ['每章都用', '倒叙内容与当前剧情无关', '倒叙太长喧宾夺主'],
    executionGuide: {
      opening: '从当前时间线的一个悬念/异常开始，角色被某个触发点拉回记忆',
      development: '进入回忆，但回忆中有选择地只写与当前相关的部分。回忆的节奏可以比现在慢',
      climax: '回忆中的关键信息揭露，读者理解了当前事件的真正原因',
      ending: '回到现在，角色因为回忆而改变了对当前局势的理解/态度/行动',
    },
    pacing: {
      sentenceLength: 'mixed',
      paragraphDensity: 'medium',
      dialogueRatio: 0.25,
      descriptionRatio: 0.3,
    },
    commonMistakes: [
      '倒叙太长，读者忘了当前剧情',
      '倒叙内容读者已经知道，没有新信息',
      '倒叙和现在的切换没有明确标记，读者混乱',
      '倒叙是为了凑字数，不是为了推进剧情',
      '每章都倒叙，变成回忆录',
    ],
    compatibleTechniques: ['内心独白', '信息压制'],
  },

  {
    key: 'parallel_montage',
    name: '平行蒙太奇',
    bestScenarios: [
      '两个场景同时发生且有对比意义',
      '展现同一事件的不同视角',
      '制造"这边在做X，那边在做Y"的张力',
      '高潮前的多线汇聚准备',
    ],
    worstScenarios: ['独处章节', '需要深度心理描写的场景', '短章节'],
    executionGuide: {
      opening: '第一个场景的1-2段，然后切换到第二个场景的1-2段。让读者看到两条线在并行',
      development: '交替推进两个场景，每次切换段落越来越短，节奏越来越快',
      climax: '两个场景在某个点交汇——可能是一个电话、一个信号、一个事件同时影响两边',
      ending: '交汇后的结果，通常是一个意外——两个场景的碰撞产生了谁都没想到的后果',
    },
    pacing: {
      sentenceLength: 'mixed',
      paragraphDensity: 'sparse',
      dialogueRatio: 0.3,
      descriptionRatio: 0.2,
    },
    commonMistakes: [
      '两个场景没有关联，纯粹交替',
      '一个场景太无聊，读者想跳过',
      '切换节奏不变，没有加速感',
      '交汇点太刻意，读者能猜到',
    ],
    compatibleTechniques: ['短句加速', '多线交叉'],
  },
];

// === 工具函数 ===

/** 按key获取策略手册 */
export function getPlaybookByKey(key: string): StrategyPlaybook | undefined {
  return STRATEGY_PLAYBOOKS.find(p => p.key === key);
}

/** 按场景匹配策略 */
export function matchStrategiesByScenario(scenario: string): StrategyPlaybook[] {
  return STRATEGY_PLAYBOOKS.filter(p =>
    p.bestScenarios.some(s => scenario.includes(s) || s.includes(scenario))
  );
}

/** 生成策略推荐prompt（供LLM使用） */
export function generateStrategyPrompt(): string {
  const strategies = STRATEGY_PLAYBOOKS.map(s => {
    return `【${s.name}】
适用：${s.bestScenarios.join('、')}
不适用：${s.worstScenarios.join('、')}
执行：开头${s.executionGuide.opening}；发展${s.executionGuide.development}；高潮${s.executionGuide.climax}；结尾${s.executionGuide.ending}
常见错误：${s.commonMistakes.join('；')}`;
  }).join('\n\n');

  return `你是网文叙事策略专家。根据当前章节的场景，推荐最合适的叙事策略。

${strategies}

请根据章节内容推荐1-2个策略，并说明推荐理由。`;
}
