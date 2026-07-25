// ============================================================
// 意图引擎 — GWE v6.0 基础智能层
// 核心能力：理解"这一章要做什么"，根据故事状态主动推荐意图
// 这是引擎从"工具"到"思考者"的第一步
// ============================================================

import {
  type IntentType,
  type IntentResult,
  type IntentDetection,
  type EmotionalTone,
  type EmotionType,
  type NarrativeStrategy,
  type PacingSuggestion,
  type ChapterContext,
  type IntentEngineConfig,
  DEFAULT_INTENT_CONFIG,
} from './types'

// ============================================================
// 意图 → 策略映射表（人类写作经验的结构化）
// ============================================================

const INTENT_STRATEGIES: Record<IntentType, NarrativeStrategy[]> = {
  advance_plot: [
    {
      name: '因果链推进',
      description: '用"因为A所以B但C"的因果链驱动剧情，每个事件都产生后果',
      bestFor: ['advance_plot'],
      tactics: ['每段结尾制造微小悬念', '事件之间必须有因果而非并列', '控制信息量：每次只揭示一层'],
    },
    {
      name: '目标驱动',
      description: '角色有明确目标，读者跟随角色视角一步步接近目标',
      bestFor: ['advance_plot'],
      tactics: ['明确角色当前目标', '设置障碍和代价', '用"差一点就成功"制造张力'],
    },
  ],
  reveal_secret: [
    {
      name: '三阶段揭示',
      description: '分三次逐步揭示秘密：暗示→部分揭露→完全揭露',
      bestFor: ['reveal_secret'],
      tactics: ['第一阶段：用细节暗示，让细心的读者察觉', '第二阶段：揭示部分真相，引发更多疑问', '第三阶段：完全揭露，但保留更高层次的谜团'],
    },
    {
      name: '反转式揭示',
      description: '先建立读者预期，再推翻，制造认知冲击',
      bestFor: ['reveal_secret'],
      tactics: ['前半段强化读者现有认知', '在关键节点抛出相反证据', '给出合理解释，让反转可信'],
    },
  ],
  build_relationship: [
    {
      name: '冲突→理解→羁绊',
      description: '通过冲突建立关系，通过理解深化关系',
      bestFor: ['build_relationship'],
      tactics: ['用具体事件而非对话直接表达关系变化', '展示而非告知：用行动证明关系', '小细节比大场面更有说服力'],
    },
  ],
  create_conflict: [
    {
      name: '利益冲突法',
      description: '两个角色的目标互斥，必须有人让步',
      bestFor: ['create_conflict'],
      tactics: ['明确双方各自的合理动机', '不要让任何一方完全正确或完全错误', '冲突升级要有层次：言语→行动→决裂'],
    },
  ],
  show_growth: [
    {
      name: '代价成长法',
      description: '成长必须付出代价，代价越大成长越可信',
      bestFor: ['show_growth'],
      tactics: ['设定明确的成长前状态', '通过失败/失去触发成长', '成长后立即用新能力解决旧难题'],
    },
  ],
  build_atmosphere: [
    {
      name: '五感沉浸',
      description: '通过五感细节让读者身临其境',
      bestFor: ['build_atmosphere'],
      tactics: ['开场用感官锚点定位', '情绪基调决定感官选择', '用环境变化暗示情绪变化'],
    },
  ],
  plant_foreshadow: [
    {
      name: '不经意埋设法',
      description: '伏笔藏在看似无关的细节中，避免刻意',
      bestFor: ['plant_foreshadow'],
      tactics: ['用日常场景隐藏伏笔', '让伏笔在当下有表面功能', '每个伏笔标注回收计划'],
    },
  ],
  resolve_foreshadow: [
    {
      name: '延迟满足法',
      description: '回收伏笔时先制造困惑，再给出解释',
      bestFor: ['resolve_foreshadow'],
      tactics: ['先展示结果（异常现象）', '再揭示原因（伏笔回收）', '回收后立即产生新的影响'],
    },
  ],
  transition: [
    {
      name: '锚点衔接',
      description: '用具体可感知的锚点（时间/空间/感官）衔接场景',
      bestFor: ['transition'],
      tactics: ['用时间锚点明确过渡', '场景切换必须有明确的视觉或听觉线索', '过渡段不宜超过200字'],
    },
  ],
  climax: [
    {
      name: '压力递增法',
      description: '危机层层加码，直到最后一刻才释放',
      bestFor: ['climax'],
      tactics: ['短句加速节奏', '减少描写，增加行动和对话', '每次"差一点成功"都让压力更大', '高潮释放后给读者喘息空间'],
    },
  ],
  emotional_impact: [
    {
      name: '共鸣放大法',
      description: '通过细节积累情绪，在关键时刻引爆',
      bestFor: ['emotional_impact'],
      tactics: ['情绪需要铺垫，不能突然爆发', '用具体细节代替抽象形容词', '情绪爆发后给读者消化时间'],
    },
  ],
  world_building: [
    {
      name: '体验式展开',
      description: '通过角色体验展示世界观，而非角色旁白解说',
      bestFor: ['world_building'],
      tactics: ['每次只展示世界观的一个侧面', '用角色的困惑和发现驱动展开', '避免"百科全书式"的直接说明'],
    },
  ],
  character_intro: [
    {
      name: '印象锚定法',
      description: '用3个具体细节（外貌/动作/语言）锚定角色印象',
      bestFor: ['character_intro'],
      tactics: ['第一个动作定义角色性格', '对话风格独特且一致', '不一次性交代所有信息'],
    },
  ],
  raise_stakes: [
    {
      name: '赌注升级法',
      description: '让失败代价从"损失"升级到"毁灭"',
      bestFor: ['raise_stakes'],
      tactics: ['明确当前赌注', '用具体后果替代抽象威胁', '赌注升级要有触发事件'],
    },
  ],
  breather: [
    {
      name: '温度调节法',
      description: '在高强度后提供情感调节，但保持叙事推进',
      bestFor: ['breather'],
      tactics: ['用日常互动展示角色另一面', '在轻松中埋下下一轮冲突的种子', '缓冲章节不超过全书的10%'],
    },
  ],
}

// ============================================================
// 意图 → 情绪映射
// ============================================================

const INTENT_EMOTION_MAP: Record<IntentType, { primary: EmotionType; secondary: EmotionType[]; intensity: number; valence: number }> = {
  advance_plot:     { primary: 'curiosity',   secondary: ['tension', 'hope'],       intensity: 0.6, valence: 0.2 },
  reveal_secret:    { primary: 'awe',         secondary: ['curiosity', 'suspense'], intensity: 0.8, valence: 0.0 },
  build_relationship: { primary: 'warmth',    secondary: ['hope', 'satisfaction'],  intensity: 0.5, valence: 0.6 },
  create_conflict:  { primary: 'tension',     secondary: ['anger', 'fear'],         intensity: 0.7, valence: -0.4 },
  show_growth:      { primary: 'satisfaction',secondary: ['hope', 'awe'],           intensity: 0.6, valence: 0.7 },
  build_atmosphere: { primary: 'awe',         secondary: ['curiosity', 'neutral'],  intensity: 0.4, valence: 0.1 },
  plant_foreshadow: { primary: 'curiosity',   secondary: ['suspense', 'neutral'],   intensity: 0.3, valence: 0.0 },
  resolve_foreshadow:{ primary: 'satisfaction',secondary: ['awe', 'curiosity'],     intensity: 0.7, valence: 0.5 },
  transition:       { primary: 'neutral',     secondary: ['curiosity'],             intensity: 0.3, valence: 0.0 },
  climax:           { primary: 'tension',     secondary: ['fear', 'despair', 'hope'], intensity: 0.95, valence: -0.3 },
  emotional_impact: { primary: 'sadness',     secondary: ['awe', 'warmth'],         intensity: 0.9, valence: -0.5 },
  world_building:   { primary: 'awe',         secondary: ['curiosity', 'neutral'],  intensity: 0.5, valence: 0.3 },
  character_intro:  { primary: 'curiosity',   secondary: ['neutral', 'hope'],       intensity: 0.4, valence: 0.2 },
  raise_stakes:     { primary: 'fear',        secondary: ['tension', 'despair'],    intensity: 0.8, valence: -0.6 },
  breather:         { primary: 'warmth',      secondary: ['satisfaction', 'hope'],  intensity: 0.3, valence: 0.5 },
}

// ============================================================
// 意图 → 节奏映射
// ============================================================

interface IntentPacing {
  sentenceRhythm: PacingSuggestion['sentenceRhythm']
  paragraphDensity: PacingSuggestion['paragraphDensity']
  infoDensity: PacingSuggestion['infoDensity']
  dialogueRatio: number
  descriptionRatio: number
  actionRatio: number
}

const INTENT_PACING_MAP: Record<IntentType, IntentPacing> = {
  advance_plot:      { sentenceRhythm: 'mixed',  paragraphDensity: 'medium',  infoDensity: 'balanced', dialogueRatio: 0.3, descriptionRatio: 0.2, actionRatio: 0.5 },
  reveal_secret:     { sentenceRhythm: 'medium', paragraphDensity: 'medium',  infoDensity: 'high',     dialogueRatio: 0.4, descriptionRatio: 0.2, actionRatio: 0.4 },
  build_relationship:{ sentenceRhythm: 'medium', paragraphDensity: 'medium',  infoDensity: 'balanced', dialogueRatio: 0.5, descriptionRatio: 0.2, actionRatio: 0.3 },
  create_conflict:   { sentenceRhythm: 'short',  paragraphDensity: 'dense',   infoDensity: 'high',     dialogueRatio: 0.4, descriptionRatio: 0.1, actionRatio: 0.5 },
  show_growth:       { sentenceRhythm: 'mixed',  paragraphDensity: 'medium',  infoDensity: 'balanced', dialogueRatio: 0.2, descriptionRatio: 0.3, actionRatio: 0.5 },
  build_atmosphere:  { sentenceRhythm: 'long',   paragraphDensity: 'sparse',  infoDensity: 'low',      dialogueRatio: 0.1, descriptionRatio: 0.7, actionRatio: 0.2 },
  plant_foreshadow:  { sentenceRhythm: 'medium', paragraphDensity: 'medium',  infoDensity: 'balanced', dialogueRatio: 0.3, descriptionRatio: 0.3, actionRatio: 0.4 },
  resolve_foreshadow:{ sentenceRhythm: 'mixed',  paragraphDensity: 'medium',  infoDensity: 'high',     dialogueRatio: 0.3, descriptionRatio: 0.2, actionRatio: 0.5 },
  transition:        { sentenceRhythm: 'medium', paragraphDensity: 'sparse',  infoDensity: 'low',      dialogueRatio: 0.2, descriptionRatio: 0.4, actionRatio: 0.4 },
  climax:            { sentenceRhythm: 'short',  paragraphDensity: 'dense',   infoDensity: 'high',     dialogueRatio: 0.2, descriptionRatio: 0.1, actionRatio: 0.7 },
  emotional_impact:  { sentenceRhythm: 'mixed',  paragraphDensity: 'medium',  infoDensity: 'balanced', dialogueRatio: 0.2, descriptionRatio: 0.5, actionRatio: 0.3 },
  world_building:    { sentenceRhythm: 'long',   paragraphDensity: 'sparse',  infoDensity: 'high',     dialogueRatio: 0.2, descriptionRatio: 0.6, actionRatio: 0.2 },
  character_intro:   { sentenceRhythm: 'medium', paragraphDensity: 'medium',  infoDensity: 'balanced', dialogueRatio: 0.3, descriptionRatio: 0.4, actionRatio: 0.3 },
  raise_stakes:      { sentenceRhythm: 'short',  paragraphDensity: 'dense',   infoDensity: 'high',     dialogueRatio: 0.3, descriptionRatio: 0.1, actionRatio: 0.6 },
  breather:          { sentenceRhythm: 'medium', paragraphDensity: 'sparse',  infoDensity: 'low',      dialogueRatio: 0.5, descriptionRatio: 0.3, actionRatio: 0.2 },
}

// ============================================================
// 意图识别关键词（基于大纲/上下文的启发式检测）
// ============================================================

const INTENT_KEYWORDS: Record<IntentType, string[]> = {
  advance_plot:       ['前往', '出发', '到达', '寻找', '追击', '逃离', '进入', '突破', '推进'],
  reveal_secret:      ['真相', '秘密', '原来', '其实', '发现', '揭开', '揭晓', '答案', '身份'],
  build_relationship: ['对话', '相遇', '重逢', '理解', '信任', '约定', '承诺', '羁绊', '合作'],
  create_conflict:    ['对决', '冲突', '对抗', '背叛', '争执', '挑战', '威胁', '宣战', '拒绝'],
  show_growth:        ['突破', '领悟', '晋升', '觉醒', '修炼', '蜕变', '顿悟', '升级', '突破瓶颈'],
  build_atmosphere:   ['氛围', '环境', '景象', '气息', '压迫', '诡异', '宁静', '荒凉', '宏伟'],
  plant_foreshadow:   ['诡异', '异常', '不对劲', '似乎', '隐约', '莫名', '奇怪', '不对劲'],
  resolve_foreshadow: ['果然', '终于', '原来如此', '难怪', '印证', '浮现', '想起', '回忆'],
  transition:         ['与此同时', '另一方面', '画面一转', '数日后', '镜头切换', '场景转换'],
  climax:             ['决战', '爆发', '全力', '赌上', '拼死', '最后一击', '终极', '绝境', '生死'],
  emotional_impact:   ['泪水', '心痛', '拥抱', '告别', '牺牲', '遗憾', '感动', '哭泣', '颤抖'],
  world_building:     ['传说', '远古', '历史', '法则', '规则', '体系', '世界', '势力', '位面'],
  character_intro:    ['出现', '登场', '走来', '现身', '降临', '露面', '初现', '首秀'],
  raise_stakes:       ['危机', '灾难', '毁灭', '沦陷', '侵蚀', '蔓延', '扩散', '恶化', '倒计时'],
  breather:           ['休息', '日常', '闲谈', '笑', '轻松', '温馨', '休整', '补给', '放松'],
}

// ============================================================
// IntentEngine 主类
// ============================================================

export class IntentEngine {
  private config: IntentEngineConfig

  constructor(config?: Partial<IntentEngineConfig>) {
    this.config = { ...DEFAULT_INTENT_CONFIG, ...config }
  }

  /**
   * 分析章节意图 — 核心方法
   * 根据上下文（大纲、前文、角色状态、伏笔）推理出当前章节应该做什么
   */
  analyze(context: ChapterContext): IntentResult {
    // 1. 如果用户指定了意图，直接使用
    if (context.userIntent) {
      return this.buildResultForIntent(context.userIntent, context)
    }

    // 2. 基于关键词的启发式检测
    const detections = this.detectIntents(context)

    // 3. 基于故事状态的上下文调整
    const adjusted = this.adjustByStoryState(detections, context)

    // 4. 构建完整结果
    const primary = adjusted[0] || { type: 'advance_plot' as IntentType, confidence: 0.5, evidence: ['默认意图'] }
    const secondary = adjusted.slice(1, this.config.maxIntents)

    const emotionalTone = this.buildEmotionalTone(primary.type)
    const suggestedStrategies = INTENT_STRATEGIES[primary.type] || INTENT_STRATEGIES.advance_plot
    const suggestedPacing = this.buildPacingSuggestion(primary.type)

    return {
      intents: adjusted,
      primary,
      secondary,
      emotionalTone,
      suggestedStrategies,
      suggestedPacing,
      summary: this.buildSummary(primary, secondary, context),
    }
  }

  /**
   * 根据用户指定意图构建完整结果
   */
  private buildResultForIntent(intent: IntentType, _context: ChapterContext): IntentResult {
    const detection: IntentDetection = { type: intent, confidence: 1.0, evidence: ['用户指定'] }
    const emotionalTone = this.buildEmotionalTone(intent)
    const suggestedStrategies = INTENT_STRATEGIES[intent] || INTENT_STRATEGIES.advance_plot
    const suggestedPacing = this.buildPacingSuggestion(intent)

    return {
      intents: [detection],
      primary: detection,
      secondary: [],
      emotionalTone,
      suggestedStrategies,
      suggestedPacing,
      summary: `用户指定意图：${this.intentLabel(intent)}。已按此意图配置叙事策略和节奏。`,
    }
  }

  /**
   * 基于关键词检测意图
   */
  private detectIntents(context: ChapterContext): IntentDetection[] {
    const detections: IntentDetection[] = []
    const searchText = [
      context.title,
      context.currentOutline || '',
      context.previousSummary || '',
      context.content || '',
    ].join(' ')

    if (!searchText.trim()) {
      return [{ type: 'advance_plot', confidence: 0.3, evidence: ['无足够上下文，使用默认意图'] }]
    }

    for (const [type, keywords] of Object.entries(INTENT_KEYWORDS)) {
      const matches: string[] = []
      for (const kw of keywords) {
        if (searchText.includes(kw)) {
          matches.push(kw)
        }
      }
      if (matches.length > 0) {
        const confidence = Math.min(0.3 + matches.length * 0.15, 0.9)
        detections.push({
          type: type as IntentType,
          confidence,
          evidence: [`关键词匹配: ${matches.join(', ')}`],
        })
      }
    }

    // 按置信度降序
    detections.sort((a, b) => b.confidence - a.confidence)

    // 如果没有检测到任何意图，给默认
    if (detections.length === 0) {
      detections.push({ type: 'advance_plot', confidence: 0.3, evidence: ['无明确意图信号，默认推进剧情'] })
    }

    return detections.slice(0, this.config.maxIntents)
  }

  /**
   * 基于故事状态调整意图优先级
   * 这是"思考"的核心：不只检测，还要判断故事需要什么
   */
  private adjustByStoryState(detections: IntentDetection[], context: ChapterContext): IntentDetection[] {
    const adjusted = [...detections]

    // 规则1：如果有活跃伏笔且数量>=3，提升 resolve_foreshadow 优先级
    if (context.activeForeshadows && context.activeForeshadows.length >= 3) {
      const resolveIdx = adjusted.findIndex(d => d.type === 'resolve_foreshadow')
      if (resolveIdx > 0) {
        adjusted[resolveIdx].confidence += 0.3
        adjusted[resolveIdx].evidence.push('活跃伏笔过多，建议回收')
      } else {
        adjusted.push({
          type: 'resolve_foreshadow',
          confidence: 0.5,
          evidence: [`有${context.activeForeshadows.length}个活跃伏笔待回收`],
        })
      }
    }

    // 规则2：如果前一章是高潮，降低当前章高潮概率，提升过渡/缓冲
    if (context.previousSummary?.includes('决战') || context.previousSummary?.includes('爆发')) {
      const climaxIdx = adjusted.findIndex(d => d.type === 'climax')
      if (climaxIdx >= 0) {
        adjusted[climaxIdx].confidence *= 0.3
        adjusted[climaxIdx].evidence.push('前一章已是高潮，当前不适合连续高潮')
      }
      adjusted.push({
        type: 'breather',
        confidence: 0.6,
        evidence: ['高潮后需要缓冲章节'],
      })
    }

    // 规则3：如果当前章节编号在整卷末尾（如第9/10章），提升高潮概率
    // （这里简化处理，实际需要Volume信息）
    if (context.chapterNumber % 10 === 0 || context.chapterNumber % 10 === 9) {
      const climaxIdx = adjusted.findIndex(d => d.type === 'climax')
      if (climaxIdx >= 0) {
        adjusted[climaxIdx].confidence += 0.2
        adjusted[climaxIdx].evidence.push('接近卷末，适合高潮')
      }
    }

    // 规则4：如果角色状态中有"重伤/濒死"等关键词，提升 emotional_impact
    if (context.characterStates) {
      const states = Object.values(context.characterStates).join(' ')
      if (states.includes('重伤') || states.includes('濒死') || states.includes('牺牲')) {
        adjusted.push({
          type: 'emotional_impact',
          confidence: 0.7,
          evidence: ['角色处于极端状态，适合情感冲击'],
        })
      }
    }

    // 重新排序
    adjusted.sort((a, b) => b.confidence - a.confidence)
    return adjusted.slice(0, this.config.maxIntents)
  }

  /**
   * 构建情绪基调
   */
  private buildEmotionalTone(intent: IntentType): EmotionalTone {
    const mapped = INTENT_EMOTION_MAP[intent] || INTENT_EMOTION_MAP.advance_plot
    return {
      primary: mapped.primary,
      secondary: mapped.secondary,
      intensity: mapped.intensity,
      valence: mapped.valence,
    }
  }

  /**
   * 构建节奏建议
   */
  private buildPacingSuggestion(intent: IntentType): PacingSuggestion {
    const mapped = INTENT_PACING_MAP[intent] || INTENT_PACING_MAP.advance_plot
    return {
      sentenceRhythm: mapped.sentenceRhythm,
      paragraphDensity: mapped.paragraphDensity,
      infoDensity: mapped.infoDensity,
      dialogueRatio: mapped.dialogueRatio,
      descriptionRatio: mapped.descriptionRatio,
      actionRatio: mapped.actionRatio,
      rationale: this.pacingRationale(intent),
    }
  }

  private pacingRationale(intent: IntentType): string {
    const rationales: Record<IntentType, string> = {
      advance_plot: '剧情推进需要均衡节奏，行动为主，对话为辅',
      reveal_secret: '秘密揭示需要中等节奏，信息密度高，留给读者消化空间',
      build_relationship: '关系构建以对话为主，节奏舒缓但有张力',
      create_conflict: '冲突场景用短句加速，密集段落制造压迫感',
      show_growth: '成长展示需要动静结合，描写内心变化+行动验证',
      build_atmosphere: '氛围营造用长句和丰富描写，放慢节奏让读者沉浸',
      plant_foreshadow: '伏笔埋设需自然融入叙事，节奏均衡不突兀',
      resolve_foreshadow: '伏笔回收节奏先慢后快，揭示时加速',
      transition: '过渡段落精简，快速完成场景切换',
      climax: '高潮用短句和密集行动，最大化冲击力',
      emotional_impact: '情感冲击需要描写细节，节奏放缓让情绪发酵',
      world_building: '世界观展开用长句描写，信息密度高但节奏舒缓',
      character_intro: '角色引入用具体细节锚定印象，节奏适中',
      raise_stakes: '危机升级用短句加速，制造紧迫感',
      breather: '缓冲章节节奏舒缓，对话为主，减轻读者压力',
    }
    return rationales[intent] || rationales.advance_plot
  }

  /**
   * 构建分析摘要
   */
  private buildSummary(
    primary: IntentDetection,
    secondary: IntentDetection[],
    context: ChapterContext,
  ): string {
    const parts: string[] = []
    parts.push(`第${context.chapterNumber}章「${context.title}」`)
    parts.push(`主导意图：${this.intentLabel(primary.type)}（置信度 ${Math.round(primary.confidence * 100)}%）`)

    if (secondary.length > 0) {
      const secLabels = secondary.map(s => this.intentLabel(s.type)).join('、')
      parts.push(`辅助意图：${secLabels}`)
    }

    const strategies = INTENT_STRATEGIES[primary.type]
    if (strategies && strategies.length > 0) {
      parts.push(`推荐策略：${strategies[0].name}`)
    }

    return parts.join(' | ')
  }

  /**
   * 意图类型中文标签
   */
  intentLabel(type: IntentType): string {
    const labels: Record<IntentType, string> = {
      advance_plot: '推进剧情',
      reveal_secret: '揭示秘密',
      build_relationship: '建立关系',
      create_conflict: '制造冲突',
      show_growth: '展示成长',
      build_atmosphere: '营造氛围',
      plant_foreshadow: '埋设伏笔',
      resolve_foreshadow: '回收伏笔',
      transition: '过渡衔接',
      climax: '高潮爆发',
      emotional_impact: '情感冲击',
      world_building: '世界观展开',
      character_intro: '角色引入',
      raise_stakes: '提升赌注',
      breather: '节奏缓冲',
    }
    return labels[type] || type
  }

  /**
   * 生成意图驱动的提示词策略
   * 用于注入到 AI 提示词中
   */
  generatePromptStrategy(result: IntentResult): string {
    const lines: string[] = []
    lines.push(`【章节意图】${this.intentLabel(result.primary.type)}`)
    lines.push(`【情绪基调】${result.emotionalTone.primary}（强度: ${Math.round(result.emotionalTone.intensity * 100)}%）`)
    lines.push(`【节奏要求】${result.suggestedPacing.rationale}`)
    lines.push(`【核心策略】${result.suggestedStrategies.map(s => s.name).join(' + ')}`)

    if (result.suggestedStrategies.length > 0) {
      lines.push('【执行要点】')
      for (const s of result.suggestedStrategies) {
        for (const t of s.tactics) {
          lines.push(`  - ${t}`)
        }
      }
    }

    return lines.join('\n')
  }

  /**
   * 获取所有可用的意图类型
   */
  getAllIntentTypes(): IntentType[] {
    return Object.keys(INTENT_STRATEGIES) as IntentType[]
  }

  /**
   * 获取指定意图的所有策略
   */
  getStrategiesFor(intent: IntentType): NarrativeStrategy[] {
    return INTENT_STRATEGIES[intent] || []
  }
}