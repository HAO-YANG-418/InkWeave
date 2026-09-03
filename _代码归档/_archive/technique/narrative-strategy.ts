// ============================================================
// NarrativeStrategy 叙事策略引擎 — GWE v6.0 技法多样性层
// 根据内容类型和意图，推荐整体叙事策略
// v6.5: 接入knowledge/narrative-strategies，使用知识库的策略执行手册
// v7.0: LLM语义感知 — 读懂故事上下文后推荐策略，而非纯规则打分
// ============================================================

import {
  getPlaybookByKey,
  matchStrategiesByScenario,
  generateStrategyPrompt as generateKnowledgeStrategyPrompt,
  STRATEGY_PLAYBOOKS,
  type StrategyPlaybook,
} from '../knowledge/narrative-strategies'
import type { LLMProvider } from '../types'
import { llmJson, hasLLM, type LLMChatMessage } from '../llm-helper'
import { DEFAULT_LLM_CONFIG } from '../llm-config'

/** 叙事策略类型 */
export type StrategyType =
  | 'info_compression'    // 信息压制
  | 'short_acceleration'  // 短句加速
  | 'sensory_immersion'   // 感官沉浸
  | 'dialogue_driven'     // 对话驱动
  | 'inner_monologue'     // 内心独白
  | 'multi_thread'        // 多线交叉
  | 'flashback'           // 倒叙/插叙
  | 'parallel_montage'    // 平行蒙太奇

/** 策略计划 */
export interface StrategyPlan {
  /** 策略类型 */
  type: StrategyType
  /** 整体结构 */
  structure: {
    opening: string
    development: string
    climax: string
    ending: string
  }
  /** 节奏控制 */
  pacing: {
    sentenceRhythm: string
    paragraphDensity: string
    keyMoments: string[]
  }
  /** 焦点 */
  focus: {
    primary: string
    secondary: string[]
  }
  /** 叙事声音 */
  voice: {
    tone: string
    distance: 'close' | 'medium' | 'distant'
    perspective: string
  }
  /** 转场方式 */
  transitions: string[]
  /** 推荐的技法 */
  recommendedTechniques: string[]
}

/** 策略选择上下文 */
export interface StrategyContext {
  /** 章意图 */
  intent: string
  /** 情绪基调 */
  emotionalTone: string
  /** 情绪强度 0-1 */
  emotionalIntensity: number
  /** 内容类型 */
  contentType?: string
  /** 用户风格标签 */
  styleLabels?: string[]
  /** 前一章策略 */
  previousStrategy?: StrategyType
}

/** 故事上下文（v7.0 LLM感知用） */
export interface StoryContext {
  /** 前3-5章的摘要 */
  recentChapterSummaries: string[]
  /** 当前情绪曲线位置：高潮/缓冲/铺垫/发展 */
  emotionalCurvePosition: 'setup' | 'rising' | 'climax' | 'falling' | 'breather'
  /** 最近连续使用过的策略类型（避免重复） */
  recentStrategies: StrategyType[]
  /** 当前章节在卷中的位置（0-1，0=卷首，1=卷尾） */
  volumePosition: number
  /** 主角当前状态描述 */
  protagonistState?: string
  /** 当前卷的核心冲突 */
  volumeConflict?: string
}

// ============================================================
// 策略定义
// ============================================================

const STRATEGY_DEFINITIONS: Record<StrategyType, {
  name: string
  description: string
  bestFor: string[]
  structure: StrategyPlan['structure']
  pacing: StrategyPlan['pacing']
  voice: StrategyPlan['voice']
  transitionPatterns: string[]
}> = {
  info_compression: {
    name: '信息压制',
    description: '每段都释放新信息，让读者不敢跳过任何一段。适合悬疑和揭示场景',
    bestFor: ['reveal_secret', 'plant_foreshadow', 'resolve_foreshadow'],
    structure: {
      opening: '用一个疑问或异常现象开场',
      development: '层层递进释放信息，每段都带来新发现',
      climax: '关键信息在最高点释放',
      ending: '留下新的疑问，暗示还有更深层的秘密',
    },
    pacing: {
      sentenceRhythm: 'medium',
      paragraphDensity: 'dense',
      keyMoments: ['信息释放点', '误导点', '反转点'],
    },
    voice: {
      tone: '冷峻、克制',
      distance: 'medium',
      perspective: '跟随主角视角，让读者和主角一起发现',
    },
    transitionPatterns: ['时间跳跃', '信息关联过渡'],
  },
  short_acceleration: {
    name: '短句加速',
    description: '用短句和密集动作制造紧迫感，适合战斗和高潮场景',
    bestFor: ['climax', 'create_conflict', 'raise_stakes'],
    structure: {
      opening: '直接进入动作，不需要铺垫',
      development: '动作→反应→新动作，节奏紧凑',
      climax: '压力达到顶点，释放',
      ending: '动作结束后的余波和代价',
    },
    pacing: {
      sentenceRhythm: 'short',
      paragraphDensity: 'dense',
      keyMoments: ['第一击', '转折点', '致命一击', '余波'],
    },
    voice: {
      tone: '紧迫、凌厉',
      distance: 'close',
      perspective: '紧贴动作视角，减少内心独白',
    },
    transitionPatterns: ['动作衔接', '感官切换'],
  },
  sensory_immersion: {
    name: '感官沉浸',
    description: '用丰富的感官描写建立沉浸感，适合氛围营造和世界观展开',
    bestFor: ['build_atmosphere', 'world_building'],
    structure: {
      opening: '用一个感官锚点定位场景',
      development: '视觉→听觉→触觉→嗅觉，层层展开',
      climax: '感官体验的极致或转折',
      ending: '环境变化暗示情绪或剧情变化',
    },
    pacing: {
      sentenceRhythm: 'long',
      paragraphDensity: 'sparse',
      keyMoments: ['感官锚点', '细节展开', '环境变化'],
    },
    voice: {
      tone: '细腻、沉浸',
      distance: 'close',
      perspective: '以感官体验为中心',
    },
    transitionPatterns: ['感官关联', '空间移动'],
  },
  dialogue_driven: {
    name: '对话驱动',
    description: '用对话推进剧情和揭示角色，适合关系构建和冲突场景',
    bestFor: ['build_relationship', 'create_conflict', 'reveal_secret'],
    structure: {
      opening: '用一句有冲击力的对话开场',
      development: '对话→动作→反应→对话，循环推进',
      climax: '对话中的关键揭示或冲突爆发',
      ending: '对话后的沉默或行动',
    },
    pacing: {
      sentenceRhythm: 'mixed',
      paragraphDensity: 'medium',
      keyMoments: ['开场对话', '冲突升级', '关键揭示', '沉默时刻'],
    },
    voice: {
      tone: '有节奏、有层次',
      distance: 'medium',
      perspective: '聚焦对话双方，交替深入',
    },
    transitionPatterns: ['对话关联', '动作过渡'],
  },
  inner_monologue: {
    name: '内心独白',
    description: '深入角色内心，展示思考过程和情感变化，适合成长和情感场景',
    bestFor: ['show_growth', 'emotional_impact'],
    structure: {
      opening: '用一个触发内心活动的具体事件',
      development: '回忆→反思→领悟，螺旋上升',
      climax: '内心的突破或决断',
      ending: '新的认知状态，暗示行动变化',
    },
    pacing: {
      sentenceRhythm: 'mixed',
      paragraphDensity: 'medium',
      keyMoments: ['触发事件', '回忆节点', '领悟时刻', '决断时刻'],
    },
    voice: {
      tone: '内省、感性',
      distance: 'close',
      perspective: '完全沉浸在角色内心',
    },
    transitionPatterns: ['联想跳跃', '情感过渡'],
  },
  multi_thread: {
    name: '多线交叉',
    description: '交替展示多条故事线，在交汇点形成冲击',
    bestFor: ['advance_plot', 'raise_stakes'],
    structure: {
      opening: '从一条线切入，暗示其他线的存在',
      development: '交替推进各线，每线推进后都有进展',
      climax: '多线交汇，产生连锁反应',
      ending: '各线暂时分离，但关联已建立',
    },
    pacing: {
      sentenceRhythm: 'mixed',
      paragraphDensity: 'medium',
      keyMoments: ['线1进展', '切换到线2', '线间呼应', '交汇点'],
    },
    voice: {
      tone: '全景、有节奏',
      distance: 'medium',
      perspective: '多视角切换，但主线清晰',
    },
    transitionPatterns: ['视角切换', '时间同步', '意象关联'],
  },
  flashback: {
    name: '倒叙/插叙',
    description: '打破线性时间，用过去揭示现在，增加叙事层次',
    bestFor: ['reveal_secret', 'emotional_impact', 'show_growth'],
    structure: {
      opening: '从现在切入，引出回忆的触发点',
      development: '进入回忆，展示关键事件',
      climax: '回忆中的关键揭示',
      ending: '回到现在，角色已经改变',
    },
    pacing: {
      sentenceRhythm: 'mixed',
      paragraphDensity: 'medium',
      keyMoments: ['触发点', '回忆切入', '关键揭示', '回到现在'],
    },
    voice: {
      tone: '反思、感伤',
      distance: 'close',
      perspective: '过去和现在交替，以现在为锚点',
    },
    transitionPatterns: ['时间跳跃', '意象关联', '感官触发'],
  },
  parallel_montage: {
    name: '平行蒙太奇',
    description: '同时展示两个或多个场景，通过对比产生冲击力',
    bestFor: ['climax', 'raise_stakes', 'emotional_impact'],
    structure: {
      opening: '建立两个场景的关联',
      development: '交替展示两个场景，制造对比或呼应',
      climax: '两个场景在关键点形成共振',
      ending: '一个场景的结果影响另一个',
    },
    pacing: {
      sentenceRhythm: 'short',
      paragraphDensity: 'dense',
      keyMoments: ['场景A', '场景B', '对比点', '共振点'],
    },
    voice: {
      tone: '对比鲜明',
      distance: 'medium',
      perspective: '双视角，切换迅速',
    },
    transitionPatterns: ['意象关联', '时间同步', '动作呼应'],
  },
}

// ============================================================
// NarrativeStrategy 主类
// ============================================================

export class NarrativeStrategy {
  private lastStrategy?: StrategyType
  private llm: LLMProvider | null = null

  /** 注入LLM Provider，启用语义策略推荐 */
  setLLM(provider: LLMProvider | null): void {
    this.llm = provider
  }

  /**
   * v7.0: LLM 语义策略推荐
   * 把故事上下文 + 8种策略手册发给 LLM，让它读懂剧情后推荐最合适的策略
   * 能理解"刚打完大战需要缓冲"这种规则引擎无法判断的上下文
   *
   * @returns 推荐结果；LLM不可用时返回 null
   */
  async selectStrategyAsync(
    context: StrategyContext,
    storyContext?: StoryContext,
  ): Promise<{
    recommended: StrategyType
    reason: string
    alternatives: StrategyType[]
    warnings: string[]
  } | null> {
    if (!hasLLM(this.llm)) return null

    const playbookList = STRATEGY_PLAYBOOKS.map(p =>
      `【${p.name}】(key: ${p.key})
  适用场景：${p.bestScenarios.join('、')}
  不适用场景：${p.worstScenarios.join('、')}
  常见错误：${p.commonMistakes.slice(0, 2).join('；')}`
    ).join('\n\n')

    const storyInfo = storyContext ? `
故事上下文：
- 前几章摘要：${storyContext.recentChapterSummaries.map((s, i) => `第${i + 1}章：${s}`).join('\n  ')}
- 当前情绪曲线位置：${storyContext.emotionalCurvePosition}
- 最近使用的策略：${storyContext.recentStrategies.join('→') || '无'}
- 当前章节在卷中位置：${(storyContext.volumePosition * 100).toFixed(0)}%
${storyContext.protagonistState ? `- 主角当前状态：${storyContext.protagonistState}` : ''}
${storyContext.volumeConflict ? `- 本卷核心冲突：${storyContext.volumeConflict}` : ''}
` : ''

    const messages: LLMChatMessage[] = [
      {
        role: 'system',
        content: `你是资深网文叙事策略顾问。根据当前章节的意图、情绪和故事上下文，推荐最合适的叙事策略。

可选策略（8种）：
${playbookList}

${storyInfo}

当前章节信息：
- 章节意图：${context.intent}
- 情绪基调：${context.emotionalTone}
- 情绪强度：${context.emotionalIntensity}
- 内容类型：${context.contentType || '未指定'}
- 前一章策略：${context.previousStrategy || '无'}

请综合考虑以下因素：
1. 刚发生的事是否需要缓冲（大战后需要内心独白/感官沉浸，而非继续短句加速）
2. 情绪曲线位置是否需要调整（连续高潮后需要降温）
3. 是否连续使用了相同策略（避免重复）
4. 策略是否与当前场景匹配（战斗用短句加速，情感用内心独白）

请返回JSON：
{
  "recommended": "策略key",
  "reason": "推荐理由（2-3句话，具体说明为什么这个策略适合当前情况）",
  "alternatives": ["备选策略key1", "备选策略key2"],
  "warnings": ["需要注意的常见错误"]
}`,
      },
      {
        role: 'user',
        content: `请为以上章节推荐最佳叙事策略。`,
      },
    ]

    const result = await llmJson<{
      recommended: string
      reason: string
      alternatives: string[]
      warnings: string[]
    }>(this.llm, messages, { temperature: DEFAULT_LLM_CONFIG.technique.temperature, maxTokens: DEFAULT_LLM_CONFIG.technique.maxTokens, timeoutMs: DEFAULT_LLM_CONFIG.technique.timeoutMs })

    if (!result || !result.recommended) return null

    // 验证返回的策略key是否有效
    const validKeys = Object.keys(STRATEGY_DEFINITIONS) as string[]
    if (!validKeys.includes(result.recommended)) return null

    return {
      recommended: result.recommended as StrategyType,
      reason: result.reason,
      alternatives: (result.alternatives || []).filter(a => validKeys.includes(a)) as StrategyType[],
      warnings: result.warnings || [],
    }
  }

  /**
   * v7.0: 带降级的异步策略选择
   * LLM可用时走语义推荐，不可用时降级到规则打分
   */
  async selectStrategyWithFallback(
    context: StrategyContext,
    storyContext?: StoryContext,
  ): Promise<StrategyPlan & {
    reason?: string
    warnings?: string[]
    source: 'llm' | 'rule'
  }> {
    // 先尝试 LLM
    if (hasLLM(this.llm)) {
      const llmResult = await this.selectStrategyAsync(context, storyContext)
      if (llmResult) {
        const selected = llmResult.recommended
        this.lastStrategy = selected
        const def = STRATEGY_DEFINITIONS[selected]

        return {
          type: selected,
          structure: def.structure,
          pacing: def.pacing,
          focus: {
            primary: context.intent,
            secondary: context.styleLabels || [],
          },
          voice: def.voice,
          transitions: def.transitionPatterns,
          recommendedTechniques: this.recommendTechniquesForStrategy(selected),
          reason: llmResult.reason,
          warnings: llmResult.warnings,
          source: 'llm',
        }
      }
    }

    // 降级到规则打分
    const ruleResult = this.selectStrategy(context)
    return { ...ruleResult, source: 'rule' }
  }

  /**
   * 选择最佳叙事策略
   * v6.5: 结合知识库的worstScenarios进行排除，bestScenarios进行加分
   */
  selectStrategy(context: StrategyContext): StrategyPlan {
    const candidates: Array<{ type: StrategyType; score: number }> = []

    for (const [type, def] of Object.entries(STRATEGY_DEFINITIONS)) {
      let score = 0

      // 意图匹配
      if (def.bestFor.includes(context.intent)) {
        score += 0.5
      }

      // 知识库：bestScenarios加分
      const playbook = getPlaybookByKey(type)
      if (playbook) {
        for (const scenario of playbook.bestScenarios) {
          const keywords = scenario.match(/[\u4e00-\u9fa5]{2,}/g) || []
          if (keywords.some(kw => context.intent.includes(kw) || (context.contentType || '').includes(kw))) {
            score += 0.15
            break
          }
        }

        // 知识库：worstScenarios惩罚
        for (const scenario of playbook.worstScenarios) {
          const keywords = scenario.match(/[\u4e00-\u9fa5]{2,}/g) || []
          if (keywords.some(kw => context.intent.includes(kw) || (context.contentType || '').includes(kw))) {
            score -= 0.3
            break
          }
        }
      }

      // 情绪强度匹配
      if (context.emotionalIntensity > 0.7 && ['short_acceleration', 'dialogue_driven'].includes(type)) {
        score += 0.2
      }
      if (context.emotionalIntensity < 0.4 && ['sensory_immersion', 'inner_monologue'].includes(type)) {
        score += 0.2
      }

      // 避免连续使用同一策略
      if (context.previousStrategy === type || this.lastStrategy === type) {
        score *= 0.5
      }

      if (score > 0) {
        candidates.push({ type: type as StrategyType, score })
      }
    }

    // 按分数排序
    candidates.sort((a, b) => b.score - a.score)

    // 如果没有候选，使用默认
    const selected = candidates.length > 0 ? candidates[0].type : 'info_compression'
    this.lastStrategy = selected

    const def = STRATEGY_DEFINITIONS[selected]

    return {
      type: selected,
      structure: def.structure,
      pacing: def.pacing,
      focus: {
        primary: context.intent,
        secondary: context.styleLabels || [],
      },
      voice: def.voice,
      transitions: def.transitionPatterns,
      recommendedTechniques: this.recommendTechniquesForStrategy(selected),
    }
  }

  /**
   * 获取策略定义
   */
  getStrategyDefinition(type: StrategyType) {
    return STRATEGY_DEFINITIONS[type]
  }

  /**
   * 获取所有策略类型
   */
  getAllStrategyTypes(): StrategyType[] {
    return Object.keys(STRATEGY_DEFINITIONS) as StrategyType[]
  }

  /**
   * 生成策略提示词
   */
  generateStrategyPrompt(plan: StrategyPlan): string {
    const lines: string[] = ['【叙事策略】']
    const def = STRATEGY_DEFINITIONS[plan.type]

    lines.push(`策略：${def.name} — ${def.description}`)
    lines.push(`结构：${plan.structure.opening} → ${plan.structure.development} → ${plan.structure.climax} → ${plan.structure.ending}`)
    lines.push(`节奏：${plan.pacing.sentenceRhythm}句 · ${plan.pacing.paragraphDensity}段落`)
    lines.push(`声音：${plan.voice.tone} · ${plan.voice.perspective}`)
    if (plan.recommendedTechniques.length > 0) {
      lines.push(`推荐技法：${plan.recommendedTechniques.slice(0, 5).join('、')}`)
    }

    return lines.join('\n')
  }

  /**
   * 为策略推荐技法
   * v6.5: 使用知识库的compatibleTechniques
   */
  recommendTechniquesForStrategy(type: StrategyType): string[] {
    // 知识库的compatibleTechniques
    const playbook = getPlaybookByKey(type)
    if (playbook && playbook.compatibleTechniques.length > 0) {
      return playbook.compatibleTechniques
    }

    // 降级到原有逻辑
    const techniqueMap: Record<StrategyType, string[]> = {
      info_compression: ['suspense_info_gap', 'suspense_question_hook', 'foreshadow_casual'],
      short_acceleration: ['climax_escalation', 'pacing_sentence_control', 'opening_in_medias'],
      sensory_immersion: ['desc_five_senses', 'desc_show_dont_tell', 'opening_sensory_anchor'],
      dialogue_driven: ['dialogue_collision', 'dialogue_subtext', 'dialogue_action_beats'],
      inner_monologue: ['emotion_physicalize', 'desc_show_dont_tell'],
      multi_thread: ['transition_match_cut', 'suspense_info_gap'],
      flashback: ['emotion_contrast', 'foreshadow_three_stage'],
      parallel_montage: ['climax_escalation', 'emotion_contrast'],
    }
    return techniqueMap[type] || []
  }

  // ============================================================
  // 知识库驱动的新方法（v6.5）
  // ============================================================

  /**
   * 获取策略的常见错误
   * 从知识库读取，提醒写作者避免
   */
  getStrategyMistakes(type: StrategyType): string[] {
    const playbook = getPlaybookByKey(type)
    return playbook?.commonMistakes || []
  }

  /**
   * 获取策略的完整执行手册
   * 包含开篇/发展/高潮/结尾的执行指南
   */
  getStrategyPlaybook(type: StrategyType): StrategyPlaybook | null {
    return getPlaybookByKey(type) ?? null
  }

  /**
   * 根据场景匹配最佳策略
   * 使用知识库的matchStrategiesByScenario
   */
  matchByScenario(scenario: string): StrategyPlaybook[] {
    return matchStrategiesByScenario(scenario)
  }

  /**
   * 生成策略执行提示词（知识库增强版）
   * 结合知识库的执行手册和原有策略定义
   */
  generateEnhancedPrompt(type: StrategyType): string {
    const playbook = getPlaybookByKey(type)
    const def = this.getStrategyDefinition(type)

    // 优先使用知识库的完整提示词
    const knowledgePrompt = generateKnowledgeStrategyPrompt()

    // 叠加原有的节奏和声音指南
    const rhythmGuide = def ? `
【节奏指南】
- 句式节奏：${def.pacing.sentenceRhythm}
- 段落密度：${def.pacing.paragraphDensity}
- 关键时刻：${def.pacing.keyMoments.join('、')}

【声音指南】
- 语气：${def.voice.tone}
- 叙事距离：${def.voice.distance}
- 视角：${def.voice.perspective}` : ''

    // 叠加常见错误提醒
    const mistakesGuide = playbook && playbook.commonMistakes.length > 0
      ? `\n\n【常见错误】\n${playbook.commonMistakes.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
      : ''

    return knowledgePrompt + rhythmGuide + mistakesGuide
  }
}