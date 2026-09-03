// ============================================================
// TechniqueLibrary 技法库 — GWE v6.0 技法多样性层
// 结构化的写作技法知识库，按场景分类，主动推荐而非被动检测
// ============================================================

import {
  type Technique,
  type TechniqueCategory,
  type TechniqueRecommendContext,
  type TechniqueRecommendation,
} from './types'

// ============================================================
// 内置技法库
// ============================================================

const BUILTIN_TECHNIQUES: Technique[] = [
  // ── 开头技法 ──
  {
    id: 'opening_sensory_anchor',
    name: '感官锚点开头',
    category: 'opening',
    description: '用具体的声音、触感、气味、视觉细节作为开篇锚点，让读者立即进入场景',
    bestFor: ['build_atmosphere', 'transition', 'emotional_impact'],
    steps: ['选择一个感官（听觉/触觉优先）', '用具体细节而非抽象形容词', '将感官与角色状态关联'],
    example: '冷。不是温度，是那种从骨头缝里渗出来的寒意。',
    cautions: ['避免用"他感到""他听到"等过滤词', '一个感官锚点就够了，不要堆砌'],
    difficulty: 2,
    impact: 4,
    tags: ['感官', '沉浸', '锚点'],
  },
  {
    id: 'opening_action',
    name: '动作开头',
    category: 'opening',
    description: '用一个正在进行的动作作为开篇，制造即刻的动感',
    bestFor: ['advance_plot', 'create_conflict', 'climax'],
    steps: ['选择一个有张力的动作', '用正在进行时态（动词）', '动作中暗示角色状态'],
    example: '他的手按在剑柄上，指节已经发白。',
    cautions: ['动作要有目的性，不能为动而动', '配合内心状态更有层次'],
    difficulty: 2,
    impact: 4,
    tags: ['动作', '动感', '张力'],
  },
  {
    id: 'opening_dialogue',
    name: '对话开头',
    category: 'opening',
    description: '用一句有冲击力的对话开场，直接抛出冲突或悬念',
    bestFor: ['create_conflict', 'build_relationship', 'reveal_secret'],
    steps: ['对话要短而有力', '第一句话必须包含冲突或信息', '紧随其后给出场景定位'],
    example: '"你骗我。"她退后一步，声音在发抖。',
    cautions: ['避免漫长的对话开场', '对话后必须赶紧定位场景'],
    difficulty: 3,
    impact: 5,
    tags: ['对话', '冲击', '悬念'],
  },
  {
    id: 'opening_in_medias',
    name: '中途切入',
    category: 'opening',
    description: '从事件中间切入，省略铺垫，让读者自己补全前因',
    bestFor: ['advance_plot', 'climax', 'raise_stakes'],
    steps: ['选择一个有张力的中间时刻', '通过角色反应暗示前因', '不给全貌，让读者好奇'],
    example: '剑已经架在脖子上了。他想不起来自己是怎么落到这一步的。',
    cautions: ['不能太跳跃，读者需要足够线索', '后续必须补全关键信息'],
    difficulty: 3,
    impact: 5,
    tags: ['悬念', '张力', '高效'],
  },

  // ── 对话技法 ──
  {
    id: 'dialogue_subtext',
    name: '潜台词对话',
    category: 'dialogue',
    description: '角色说的不是字面意思，用潜台词传递真实意图',
    bestFor: ['build_relationship', 'create_conflict', 'reveal_secret'],
    steps: ['确定角色真实意图', '设计表面话语（与真实意图相反/偏离）', '用动作和神态暗示真实意图'],
    example: '"没事。"她笑了笑，手指却把袖口绞得发皱。',
    cautions: ['潜台词不能太隐晦，读者需要能懂', '不同角色的潜台词风格要不同'],
    difficulty: 4,
    impact: 5,
    tags: ['对话', '深度', '角色'],
  },
  {
    id: 'dialogue_collision',
    name: '五步碰撞对话',
    category: 'dialogue',
    description: '对话不是轮流说话，而是意图的碰撞。每句话都应该改变对话的走向',
    bestFor: ['create_conflict', 'reveal_secret', 'emotional_impact'],
    steps: ['A说（提要求/质疑）', 'B回应（回避/对抗）', 'A加压', 'B被迫暴露', '对话进入新阶段'],
    example: 'A:"你那天去了哪里？" B:"不关你的事。" A:"守卫说看到了你。" B:"……守卫看错了。" A:"他们有三个人。"',
    cautions: ['每个回合都要推进', '避免"一方问一方答"的审讯式对话'],
    difficulty: 3,
    impact: 5,
    tags: ['对话', '冲突', '节奏'],
  },
  {
    id: 'dialogue_action_beats',
    name: '动作节拍穿插',
    category: 'dialogue',
    description: '在对话中穿插动作，让对话有画面感和节奏变化',
    bestFor: ['build_relationship', 'create_conflict'],
    steps: ['每2-3句对话插入一个动作', '动作要反映角色情绪', '动作与对话形成对比或呼应'],
    cautions: ['动作不能打断对话节奏', '避免"说+道"的单调引导'],
    difficulty: 2,
    impact: 3,
    tags: ['对话', '画面', '节奏'],
  },

  // ── 描写技法 ──
  {
    id: 'desc_show_dont_tell',
    name: '展示而非告知',
    category: 'description',
    description: '用具体细节展示角色状态，而非直接说明',
    bestFor: ['emotional_impact', 'show_growth', 'build_atmosphere'],
    steps: ['确定要传达的信息', '找到能体现这个信息的具体细节', '用细节替代形容词'],
    example: '他很愤怒 → 他把茶杯捏碎了，碎片扎进掌心，他好像没感觉到。',
    cautions: ['不是所有信息都需要展示', '关键信息要展示，次要信息可以告知'],
    difficulty: 3,
    impact: 5,
    tags: ['描写', '细节', '沉浸'],
  },
  {
    id: 'desc_five_senses',
    name: '五感分层描写',
    category: 'description',
    description: '按视觉→听觉→触觉→嗅觉→味觉的层次展开描写，建立沉浸感',
    bestFor: ['build_atmosphere', 'world_building', 'emotional_impact'],
    steps: ['先定视觉（空间定位）', '加入听觉（环境声音）', '融入触觉（温度/质感）', '点缀嗅觉/味觉'],
    cautions: ['不要五感全用，选2-3个最有效的', '感官描写要服务于情绪'],
    difficulty: 2,
    impact: 4,
    tags: ['描写', '感官', '沉浸'],
  },

  // ── 悬念技法 ──
  {
    id: 'suspense_info_gap',
    name: '信息差悬念',
    category: 'suspense',
    description: '让读者知道角色不知道的信息，制造紧张感',
    bestFor: ['raise_stakes', 'plant_foreshadow', 'create_conflict'],
    steps: ['先让读者知道一个危险或秘密', '让角色在不知情的情况下行动', '制造"快发现"的紧张时刻'],
    cautions: ['信息差不能太久，读者会疲劳', '信息差要有合理的解释'],
    difficulty: 3,
    impact: 5,
    tags: ['悬念', '张力', '读者'],
  },
  {
    id: 'suspense_question_hook',
    name: '疑问钩子',
    category: 'suspense',
    description: '在段落或章节结尾抛出一个未解答的问题，让读者继续阅读',
    bestFor: ['ending_hook', 'plant_foreshadow'],
    steps: ['提出一个具体的、读者关心的问题', '不回答，转移到下一段/章', '在后续给出答案'],
    cautions: ['问题不能太抽象', '不能一直不回答，要在合理时间内回收'],
    difficulty: 2,
    impact: 4,
    tags: ['悬念', '钩子', '追读'],
  },

  // ── 情感技法 ──
  {
    id: 'emotion_physicalize',
    name: '情感具象化',
    category: 'emotion',
    description: '将抽象情感转化为具体的身体反应和环境映射',
    bestFor: ['emotional_impact', 'show_growth'],
    steps: ['选择1-2个身体反应（心跳/呼吸/肌肉）', '用环境映射情绪', '控制节奏：铺垫→爆发→余韵'],
    cautions: ['避免陈词滥调（心跳加速/手心冒汗）', '不同角色的情绪表达要不同'],
    difficulty: 3,
    impact: 5,
    tags: ['情感', '身体', '共鸣'],
  },
  {
    id: 'emotion_contrast',
    name: '情感对比',
    category: 'emotion',
    description: '利用情感对比增强冲击力：乐极生悲、绝处逢生、希望破灭',
    bestFor: ['emotional_impact', 'climax'],
    steps: ['先建立一种情感基调', '让读者沉浸其中', '在关键时刻翻转情感'],
    cautions: ['翻转要有铺垫，不能突兀', '情感对比不能滥用'],
    difficulty: 4,
    impact: 5,
    tags: ['情感', '对比', '冲击'],
  },

  // ── 转场技法 ──
  {
    id: 'transition_match_cut',
    name: '匹配剪辑',
    category: 'transition',
    description: '用相似的意象或动作连接两个场景，实现无缝转场',
    bestFor: ['transition'],
    steps: ['找到两个场景的相似元素', '在前一个场景结尾引入', '在后一个场景开头呼应'],
    example: 'A场景结尾：他的剑断了。B场景开头：断裂的树枝在风中摇晃。',
    cautions: ['相似元素要自然，不能强行', '两个场景的关联需要读者能感知'],
    difficulty: 3,
    impact: 4,
    tags: ['转场', '流畅', '呼应'],
  },
  {
    id: 'transition_time_jump',
    name: '时间跳跃',
    category: 'transition',
    description: '用明确的时间标记进行跳跃，干净利落不拖沓',
    bestFor: ['transition'],
    steps: ['用具体的时间标记（三天后/太阳升起时）', '省略不重要的事件', '在新时间点用一个锚点定位'],
    cautions: ['时间跳跃不能跳过关键事件', '跳得太频繁会让读者失去连续感'],
    difficulty: 1,
    impact: 2,
    tags: ['转场', '时间', '效率'],
  },

  // ── 高潮技法 ──
  {
    id: 'climax_escalation',
    name: '压力递增',
    category: 'climax',
    description: '危机层层加码，每次"差一点成功"都让压力更大，直到最后一刻释放',
    bestFor: ['climax', 'raise_stakes'],
    steps: ['设定初始压力', '每段增加压力（3-5次递增）', '在最高点时释放', '释放后给角色和读者喘息空间'],
    cautions: ['压力递增要有节奏，不能一味堆叠', '释放不能太快（虎头蛇尾）'],
    difficulty: 4,
    impact: 5,
    tags: ['高潮', '节奏', '张力'],
  },
  {
    id: 'climax_cost_victory',
    name: '代价胜利',
    category: 'climax',
    description: '胜利不是免费的，角色必须付出代价，代价越大胜利越甜',
    bestFor: ['climax', 'show_growth'],
    steps: ['明确胜利的代价', '代价要有具体性（失去/受伤/牺牲）', '代价引出后续剧情'],
    cautions: ['代价不能太轻（读者会觉得不值）', '代价不能太重（角色会失去动力）'],
    difficulty: 3,
    impact: 5,
    tags: ['高潮', '代价', '成长'],
  },

  // ── 结尾技法 ──
  {
    id: 'ending_cliffhanger',
    name: '悬念结尾',
    category: 'ending',
    description: '在关键时刻切断，让读者迫不及待想看下一章',
    bestFor: ['ending_hook'],
    steps: ['在悬念最高点切断', '留下一个明确的问题', '下一章尽早回答'],
    cautions: ['不能每章都用，会疲劳', '切断点要自然，不能生硬'],
    difficulty: 2,
    impact: 5,
    tags: ['结尾', '悬念', '追读'],
  },
  {
    id: 'ending_emotional_beat',
    name: '情绪收束',
    category: 'ending',
    description: '用情绪收束章节，给读者一个情感上的落脚点',
    bestFor: ['ending_hook', 'emotional_impact'],
    steps: ['回顾本章的情感高点', '用一个安静的时刻收束', '暗示下一章的方向'],
    cautions: ['情绪收束不能太突兀', '要留有余韵，不要完全封闭'],
    difficulty: 3,
    impact: 4,
    tags: ['结尾', '情绪', '余韵'],
  },

  // ── 伏笔技法 ──
  {
    id: 'foreshadow_casual',
    name: '不经意埋设',
    category: 'foreshadow',
    description: '伏笔藏在看似无关的日常细节中，避免刻意感',
    bestFor: ['plant_foreshadow'],
    steps: ['在正常的叙事中插入伏笔', '让伏笔在当下有表面功能', '不要用"奇怪""诡异"等词强调'],
    cautions: ['伏笔要有回收计划', '不能为了伏笔破坏当前叙事的流畅性'],
    difficulty: 3,
    impact: 4,
    tags: ['伏笔', '隐藏', '回收'],
  },
  {
    id: 'foreshadow_three_stage',
    name: '三阶段揭示',
    category: 'foreshadow',
    description: '分三次揭示一个秘密：暗示→部分揭露→完全揭露',
    bestFor: ['reveal_secret', 'resolve_foreshadow'],
    steps: ['第一阶段：用细节暗示（让细心的读者察觉）', '第二阶段：揭示部分真相（引发更多疑问）', '第三阶段：完全揭露（但保留更高层次的谜团）'],
    cautions: ['三个阶段间隔要合理', '每次揭示都要带来新的信息'],
    difficulty: 4,
    impact: 5,
    tags: ['伏笔', '揭示', '层次'],
  },

  // ── 节奏技法 ──
  {
    id: 'pacing_sentence_control',
    name: '句长节奏控制',
    category: 'pacing',
    description: '通过句子长度控制阅读节奏：短句加速，长句放慢',
    bestFor: ['pacing'],
    steps: ['确定当前段落需要什么节奏', '加速：用短句（10-20字），减少修饰', '放慢：用长句（30-50字），增加描写'],
    cautions: ['节奏变化要有过渡', '不能整段都是短句或长句'],
    difficulty: 2,
    impact: 4,
    tags: ['节奏', '句子', '控制'],
  },
  {
    id: 'pacing_breather',
    name: '缓冲调节',
    category: 'pacing',
    description: '在高强度情节后插入缓冲，让读者和角色都喘口气',
    bestFor: ['breather', 'pacing'],
    steps: ['在高强度后插入1-2段缓冲', '用日常互动或环境描写', '在缓冲中埋下下一轮冲突的种子'],
    cautions: ['缓冲不能太久（不超过全书10%）', '缓冲中要有信息量，不能是纯水文'],
    difficulty: 2,
    impact: 3,
    tags: ['节奏', '缓冲', '调节'],
  },
]

// ============================================================
// TechniqueLibrary 主类
// ============================================================

// ============================================================
// 意图 → bestFor 语义映射
// 自然语言意图（LLM 会输出的）→ 技法 bestFor 枚举值
// ============================================================
const INTENT_TO_BEST_FOR: Record<string, string[]> = {
  'create_suspense': ['plant_foreshadow', 'ending_hook', 'raise_stakes'],
  'create_conflict': ['create_conflict', 'advance_plot'],
  'build_atmosphere': ['build_atmosphere'],
  'reveal_secret': ['reveal_secret'],
  'emotional_impact': ['emotional_impact'],
  'show_growth': ['show_growth'],
  'build_relationship': ['build_relationship'],
  'climax': ['climax'],
  'transition': ['transition'],
  'world_building': ['world_building'],
  'pacing': ['pacing'],
  'breather': ['breather'],
  'ending_hook': ['ending_hook'],
  'plant_foreshadow': ['plant_foreshadow'],
  'resolve_foreshadow': ['resolve_foreshadow'],
  'raise_stakes': ['raise_stakes'],
}

// 情绪 → 技法标签语义映射
const EMOTION_TO_TAGS: Record<string, string[]> = {
  '紧张': ['悬念', '张力', '冲突'],
  '悲伤': ['情感', '共鸣', '余韵'],
  '热血': ['动作', '动感', '冲击'],
  '恐惧': ['悬念', '张力', '沉浸'],
  '温馨': ['情感', '日常', '共鸣'],
  '压抑': ['深度', '层次', '角色'],
  '兴奋': ['动作', '冲击', '节奏'],
  '冷静': ['沉浸', '控制', '细节'],
  '神秘': ['悬念', '隐藏', '伏笔'],
}

export class TechniqueLibrary {
  private techniques: Map<string, Technique> = new Map()

  constructor() {
    // 加载内置技法
    for (const t of BUILTIN_TECHNIQUES) {
      this.techniques.set(t.id, t)
    }
  }

  /**
   * 多维推荐技法
   */
  recommend(context: TechniqueRecommendContext): TechniqueRecommendation[] {
    const results: TechniqueRecommendation[] = []

    for (const technique of this.techniques.values()) {
      let score = 0.5 // 基础分
      const reasons: string[] = []

      // 意图匹配（含语义映射）
      if (context.intent) {
        // 先直接匹配
        if (technique.bestFor.includes(context.intent)) {
          score += 0.3
          reasons.push(`适合${context.intent}意图`)
        } else {
          // 再通过语义映射匹配
          const mapped = INTENT_TO_BEST_FOR[context.intent]
          if (mapped) {
            const overlap = mapped.filter(m => technique.bestFor.includes(m))
            if (overlap.length > 0) {
              score += 0.25
              reasons.push(`匹配意图：${overlap[0]}`)
            }
          }
        }
      }

      // 内容类型匹配
      if (context.contentType && technique.tags.some(t => t.includes(context.contentType!))) {
        score += 0.2
      }

      // 情绪基调匹配（含语义映射）
      if (context.emotionalTone) {
        const mappedTags = EMOTION_TO_TAGS[context.emotionalTone]
        if (mappedTags) {
          const overlap = technique.tags.filter(t =>
            mappedTags.some(mt => t.includes(mt))
          ).length
          if (overlap > 0) {
            score += 0.15 * overlap
          }
        } else {
          // 直接标签匹配
          if (technique.tags.some(t => t.includes(context.emotionalTone!))) {
            score += 0.15
          }
        }
      }

      // 风格匹配
      if (context.styleLabels && context.styleLabels.length > 0) {
        const overlap = technique.tags.filter(t =>
          context.styleLabels!.some(s => s.includes(t))
        ).length
        if (overlap > 0) {
          score += 0.1 * overlap
        }
      }

      // 冷却惩罚
      if (context.recentlyUsed?.includes(technique.id)) {
        score *= 0.3
        reasons.push('最近使用过')
      }

      if (score > 0.3) {
        results.push({
          technique,
          score,
          reason: reasons.join('；') || '通用推荐',
        })
      }
    }

    // 排序
    results.sort((a, b) => b.score - a.score)

    const max = context.maxRecommendations || 5
    return results.slice(0, max)
  }

  /**
   * 按分类获取技法
   */
  getByCategory(category: TechniqueCategory): Technique[] {
    return [...this.techniques.values()]
      .filter(t => t.category === category)
      .sort((a, b) => b.impact - a.impact)
  }

  /**
   * 按标签搜索
   */
  searchByTag(tag: string): Technique[] {
    return [...this.techniques.values()]
      .filter(t => t.tags.some(tg => tg.includes(tag)))
      .sort((a, b) => b.impact - a.impact)
  }

  /**
   * 按ID获取
   */
  getById(id: string): Technique | undefined {
    return this.techniques.get(id)
  }

  /**
   * 获取所有技法
   */
  getAll(): Technique[] {
    return [...this.techniques.values()]
  }

  /**
   * 注册自定义技法
   */
  register(technique: Technique): void {
    this.techniques.set(technique.id, technique)
  }

  /**
   * 获取技法统计
   */
  getStats(): { total: number; byCategory: Record<TechniqueCategory, number> } {
    const byCategory: Record<string, number> = {}
    for (const t of this.techniques.values()) {
      byCategory[t.category] = (byCategory[t.category] || 0) + 1
    }
    return {
      total: this.techniques.size,
      byCategory: byCategory as Record<TechniqueCategory, number>,
    }
  }
}