// ============================================================
// 创意跳跃引擎 — GWE v6.0 创意跳跃层
// 核心能力：生成跨域联想、隐喻、反转等创意跳跃
// 让AI从"模仿"跃升到"创造"——在概念之间建立非显而易见的连接
// v6.4: LLM创意生成，基于故事上下文
// ============================================================

import {
  type LeapType,
  type LeapRequest,
  type LeapResult,
  type CreativeLeapConfig,
  DEFAULT_CREATIVE_LEAP_CONFIG,
} from './types'
import type { LLMProvider } from '../types'
import { llmJson, hasLLM } from '../llm-helper'
import {
  LEAP_KNOWLEDGE,
  generateLeapPrompt,
  getLeapKnowledgeByType,
} from '../knowledge/creative-leaps'

// ============================================================
// 创意跳跃模板库 — 从知识库派生
// ============================================================

interface LeapTemplate {
  type: LeapType
  pattern: string
  example: string
}

/** 从知识库生成模板列表 */
const LEAP_TEMPLATES: LeapTemplate[] = LEAP_KNOWLEDGE.map(k => ({
  type: k.type as LeapType,
  pattern: k.directions[0] || k.name,
  example: k.examples[0] || '',
}))

// ============================================================
// 创意跳跃引擎
// ============================================================

export class CreativeLeap {
  private config: CreativeLeapConfig
  private leapHistory: LeapResult[] = []
  private llm: LLMProvider | null

  constructor(config?: Partial<CreativeLeapConfig>, llm?: LLMProvider | null) {
    this.config = { ...DEFAULT_CREATIVE_LEAP_CONFIG, ...config }
    this.llm = llm ?? null
  }

  /**
   * 注入LLM Provider
   */
  setLLM(llm: LLMProvider | null): void {
    this.llm = llm
  }

  /**
   * 生成创意跳跃 — 核心方法
   * 尝试在源概念和目标域之间建立非显而易见的连接
   */
  generate(request: LeapRequest): LeapResult | null {
    if (!this.config.enabledTypes.includes(request.type)) {
      return null
    }

    const template = LEAP_TEMPLATES.find(t => t.type === request.type)
    if (!template) {
      return null
    }

    // 尝试生成多个候选项，选择新颖度最高的
    let bestLeap: LeapResult | null = null

    for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
      const candidate = this.attemptLeap(request, template, attempt)
      const novelty = this.evaluateNovelty(candidate, request)
      const plausibility = this.evaluatePlausibility(candidate, request)
      const impact = this.evaluateImpact(candidate, request.type)

      if (novelty >= this.config.minNovelty && plausibility >= this.config.minPlausibility) {
        const result: LeapResult = {
          leap: candidate,
          type: request.type,
          novelty,
          plausibility,
          impact,
          explanation: this.generateExplanation(request, candidate, template),
        }

        if (!bestLeap || result.novelty > bestLeap.novelty) {
          bestLeap = result
        }
      }
    }

    if (bestLeap) {
      this.leapHistory.push(bestLeap)
    }

    return bestLeap
  }

  /**
   * 批量生成多种创意跳跃
   */
  generateMultiple(source: string, context: string, count = 3): LeapResult[] {
    const results: LeapResult[] = []
    const availableTypes = this.config.enabledTypes.slice()

    // 随机选择不同类型的跳跃
    for (let i = 0; i < count && availableTypes.length > 0; i++) {
      const idx = Math.floor(Math.random() * availableTypes.length)
      const type = availableTypes.splice(idx, 1)[0]

      const result = this.generate({
        type,
        source,
        targetDomain: this.inferTargetDomain(source, type),
        context,
      })

      if (result) {
        results.push(result)
      }
    }

    return results.sort((a, b) => b.novelty - a.novelty)
  }

  /**
   * LLM驱动的创意跳跃（异步）
   * 基于故事上下文生成真正有创意的写作灵感
   * 无LLM时降级到模板生成
   */
  async generateAsync(request: LeapRequest): Promise<LeapResult | null> {
    if (!hasLLM(this.llm)) {
      return this.generate(request)
    }

    const result = await this.generateLeapWithLLM(request)
    if (!result) {
      return this.generate(request)
    }

    this.leapHistory.push(result)
    return result
  }

  /**
   * LLM驱动的批量创意跳跃（异步）
   * 一次生成多个不同方向的创意，每个方向都是真正基于上下文的
   */
  async generateMultipleAsync(
    source: string,
    context: string,
    count = 3,
    types?: LeapType[],
    storyContext?: import('./types').StoryContext
  ): Promise<LeapResult[]> {
    if (!hasLLM(this.llm)) {
      return this.generateMultiple(source, context, count)
    }

    const useTypes = types || this.config.enabledTypes.slice(0, count)
    const results = await this.generateMultipleLeapsWithLLM(source, context, useTypes.slice(0, count), storyContext)

    if (results.length === 0) {
      return this.generateMultiple(source, context, count)
    }

    for (const r of results) {
      this.leapHistory.push(r)
    }

    return results.sort((a, b) => b.impact - a.impact)
  }

  /**
   * 获取历史跳跃记录
   */
  getHistory(): LeapResult[] {
    return [...this.leapHistory]
  }

  /**
   * 获取统计信息
   */
  getStats(): { totalLeaps: number; avgNovelty: number; avgPlausibility: number; byType: Record<string, number> } {
    const totalLeaps = this.leapHistory.length
    const avgNovelty = totalLeaps > 0
      ? this.leapHistory.reduce((sum, l) => sum + l.novelty, 0) / totalLeaps
      : 0
    const avgPlausibility = totalLeaps > 0
      ? this.leapHistory.reduce((sum, l) => sum + l.plausibility, 0) / totalLeaps
      : 0

    const byType: Record<string, number> = {}
    for (const leap of this.leapHistory) {
      byType[leap.type] = (byType[leap.type] || 0) + 1
    }

    return { totalLeaps, avgNovelty, avgPlausibility, byType }
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 尝试一次创意跳跃
   */
  private attemptLeap(request: LeapRequest, _template: LeapTemplate, attempt: number): string {
    const variation = this.getVariationFactor(attempt)

    switch (request.type) {
      case 'metaphor':
        return this.generateMetaphor(request.source, request.targetDomain, variation)
      case 'analogy':
        return this.generateAnalogy(request.source, request.targetDomain, variation)
      case 'twist':
        return this.generateTwist(request.source, request.context, variation)
      case 'synesthesia':
        return this.generateSynesthesia(request.source, request.targetDomain, variation)
      case 'juxtaposition':
        return this.generateJuxtaposition(request.source, request.targetDomain, variation)
      case 'abstraction':
        return this.generateAbstraction(request.source, request.targetDomain, variation)
      case 'concretization':
        return this.generateConcretization(request.source, request.targetDomain, variation)
      case 'defamiliarization':
        return this.generateDefamiliarization(request.source, variation)
      default:
        return `[${request.type}] ${request.source} → ${request.targetDomain}`
    }
  }

  private generateMetaphor(source: string, target: string, variation: number): string {
    const qualities = ['本质', '结构', '节奏', '力量', '流动', '光芒', '阴影', '温度']
    const q = qualities[Math.floor(variation * qualities.length) % qualities.length]
    return `将「${source}」比作「${target}」——两者共享${q}上的相似性，在无形处建立有形的连接`
  }

  private generateAnalogy(source: string, target: string, variation: number): string {
    const properties = ['层级结构', '变化规律', '因果关系', '能量流动', '平衡机制']
    const p = properties[Math.floor(variation * properties.length) % properties.length]
    return `「${source}」与「${target}」在${p}上存在深层同构——${source}的运作逻辑可以映射到${target}`
  }

  private generateTwist(source: string, _context: string, variation: number): string {
    const twists = [
      `表面上看是${source}，实际是陷阱——真正的意图隐藏在反向操作中`,
      `读者预期${source}，但真正发生的是完全相反的事情——颠覆所有预设`,
      `${source}并非真相，而是精心设计的假象——当假象被揭穿，真相比假象更震撼`,
      `看似失败的${source}，恰恰是成功的关键——以退为进，以败为胜`,
    ]
    return twists[Math.floor(variation * twists.length) % twists.length]
  }

  private generateSynesthesia(source: string, target: string, variation: number): string {
    const pairs = [
      `用${source}感受${target}——${source}的质感在${target}的维度上展开`,
      `${source}的节奏转化为${target}的色彩——感官的边界在融合中消解`,
      `听${source}的声音，看${target}的颜色——通感让世界多了一层维度`,
    ]
    return pairs[Math.floor(variation * pairs.length) % pairs.length]
  }

  private generateJuxtaposition(source: string, target: string, variation: number): string {
    const contrasts = ['大小', '明暗', '冷暖', '动静', '强弱', '虚实', '新旧', '生死']
    const c = contrasts[Math.floor(variation * contrasts.length) % contrasts.length]
    return `将「${source}」与「${target}」并置——${c}对比制造张力，让两者各自的意义在对比中放大`
  }

  private generateAbstraction(source: string, target: string, variation: number): string {
    const patterns = ['涌现规律', '自组织原则', '反馈循环', '临界点', '分形结构']
    const p = patterns[Math.floor(variation * patterns.length) % patterns.length]
    return `从「${source}」中提取${p}——将其抽象后应用于「${target}」，生成全新的认知框架`
  }

  private generateConcretization(source: string, target: string, variation: number): string {
    const mappings = ['化身', '具象', '投影', '凝结', '赋形', '实体化']
    const m = mappings[Math.floor(variation * mappings.length) % mappings.length]
    return `将「${source}」${m}为「${target}」——抽象概念获得可感知的形体，让读者看得见摸得着`
  }

  private generateDefamiliarization(source: string, variation: number): string {
    const perspectives = [
      `重新审视「${source}」——仿佛第一次看见，剥离所有习以为常的标签`,
      `以异乡人的眼睛看「${source}」——熟悉的事物变得陌生，陌生中藏着真相`,
      `用显微镜观察「${source}」——放大日常中被忽略的细节，细节里是另一个世界`,
    ]
    return perspectives[Math.floor(variation * perspectives.length) % perspectives.length]
  }

  /**
   * 获取变化因子
   */
  private getVariationFactor(attempt: number): number {
    // 使用简单的伪随机变化
    return (attempt * 0.37 + 0.13) % 1
  }

  /**
   * 评估新颖度
   */
  private evaluateNovelty(candidate: string, _request: LeapRequest): number {
    // 检查与历史跳跃的相似度，越不相似越新颖
    let baseNovelty = 0.7

    for (const historic of this.leapHistory) {
      const similarity = this.textSimilarity(candidate, historic.leap)
      if (similarity > 0.5) {
        baseNovelty -= 0.15
      }
    }

    return Math.max(0.1, Math.min(1, baseNovelty))
  }

  /**
   * 评估合理性
   */
  private evaluatePlausibility(candidate: string, _request: LeapRequest): number {
    // 基于文本长度和结构评估合理性
    // 太短可能缺乏细节，太长可能过度解释
    const len = candidate.length
    if (len < 20) return 0.3
    if (len > 200) return 0.5
    return 0.6 + (len - 20) / 200 * 0.4
  }

  /**
   * 评估冲击力
   */
  private evaluateImpact(candidate: string, type: LeapType): number {
    // 不同跳跃类型有不同的基础冲击力
    const baseImpact: Record<LeapType, number> = {
      twist: 0.9,
      defamiliarization: 0.85,
      synesthesia: 0.8,
      metaphor: 0.7,
      juxtaposition: 0.75,
      analogy: 0.6,
      abstraction: 0.65,
      concretization: 0.65,
    }

    const base = baseImpact[type] || 0.5
    const lenBonus = Math.min(candidate.length / 100, 0.2)
    return Math.min(1, base + lenBonus)
  }

  /**
   * 生成解释
   */
  private generateExplanation(
    request: LeapRequest,
    _candidate: string,
    template: LeapTemplate,
  ): string {
    return `基于${template.type}模板，从「${request.source}」出发，在「${request.targetDomain}」域中寻找创意连接点。` +
      `参考模式：${template.pattern}。示例：${template.example}`
  }

  /**
   * 推断目标域
   */
  private inferTargetDomain(_source: string, type: LeapType): string {
    const domainMap: Record<LeapType, string[]> = {
      metaphor: ['自然', '战争', '建筑', '音乐', '河流', '火焰', '星空'],
      analogy: ['商业', '生态', '物理', '博弈', '进化', '网络'],
      twist: ['伏笔', '角色关系', '世界规则', '力量体系'],
      synesthesia: ['视觉', '听觉', '触觉', '嗅觉', '味觉'],
      juxtaposition: ['贫富', '强弱', '生死', '虚实', '古今'],
      abstraction: ['系统论', '信息论', '博弈论', '进化论', '复杂科学'],
      concretization: ['物体', '生物', '建筑', '自然现象', '机械'],
      defamiliarization: ['日常', '身体', '时间', '空间', '语言'],
    }

    const domains = domainMap[type] || ['通用']
    return domains[Math.floor(Math.random() * domains.length)]
  }

  /**
   * 简单文本相似度
   */
  private textSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.split(''))
    const wordsB = new Set(b.split(''))
    const intersection = new Set(Array.from(wordsA).filter(x => wordsB.has(x)))
    const union = new Set([...Array.from(wordsA), ...Array.from(wordsB)])
    return intersection.size / union.size
  }

  // ============================================================
  // LLM创意生成
  // ============================================================

  /** 从知识库派生的类型标签 */
  private TYPE_LABELS: Record<LeapType, { name: string; desc: string }> = Object.fromEntries(
    LEAP_KNOWLEDGE.map(k => [k.type, {
      name: k.name,
      desc: k.triggers[0] || k.name,
    }])
  ) as Record<LeapType, { name: string; desc: string }>

  /**
   * 检查跳跃类型是否适合当前场景
   * 基于知识库的triggers和avoidWhen判断
   */
  isLeapAppropriate(type: LeapType, context: string): { appropriate: boolean; reason: string } {
    const knowledge = getLeapKnowledgeByType(type)
    if (!knowledge) return { appropriate: true, reason: '无知识库数据，默认允许' }

    // 检查avoidWhen
    for (const avoid of knowledge.avoidWhen) {
      const keywords = avoid.match(/[\u4e00-\u9fa5]{2,}/g) || []
      if (keywords.some(kw => context.includes(kw))) {
        return { appropriate: false, reason: `不适用：${avoid}` }
      }
    }

    // 检查triggers是否匹配
    for (const trigger of knowledge.triggers) {
      const keywords = trigger.match(/[\u4e00-\u9fa5]{2,}/g) || []
      if (keywords.some(kw => context.includes(kw))) {
        return { appropriate: true, reason: `匹配触发：${trigger}` }
      }
    }

    return { appropriate: true, reason: '无明确触发但也不在避免列表中' }
  }

  private async generateLeapWithLLM(request: LeapRequest): Promise<LeapResult | null> {
    const typeInfo = this.TYPE_LABELS[request.type]
    if (!typeInfo) return null

    // 从知识库获取该类型的详细知识
    const knowledge = getLeapKnowledgeByType(request.type)
    const knowledgePrompt = generateLeapPrompt()

    const constraintsText = knowledge
      ? `\n\n约束条件：\n${knowledge.constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n生成方向：\n${knowledge.directions.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n参考示例：\n${knowledge.examples.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n评分标准：\n- 新颖度：${knowledge.scoring.novelty}\n- 相关性：${knowledge.scoring.relevance}\n- 冲击力：${knowledge.scoring.impact}`
      : ''

    // v11.0: 构建结构化故事上下文
    const storyContextBlock = this.buildStoryContextBlock(request)

    const systemPrompt = `${knowledgePrompt}

当前需要生成的是【${typeInfo.name}】类型的创意跳跃。
${constraintsText}

要求：
1. leap文本必须是具体的、可直接用于写作的灵感，不是空泛的理论
2. 要紧密结合故事上下文，不能脱离内容泛泛而谈
3. 要有"跳跃感"——不是显而易见的联想，而是需要绕个弯才能想到的连接
4. 语言要精炼，2-4句话说清楚
5. explanation简要说明为什么这个跳跃有效，连接了什么
6. 评分要诚实：参考知识库的评分标准，真正好的给高分，一般的给中等分

返回JSON格式：
{
  "leap": "创意思路文本",
  "explanation": "为什么这个跳跃有效",
  "novelty": 0.85,
  "plausibility": 0.8,
  "impact": 0.9
}`

    const userPrompt = `源概念：「${request.source}」
目标域：${request.targetDomain || '故事上下文本身'}

${storyContextBlock}

请生成一个${typeInfo.name}类型的创意跳跃。`

    const result = await llmJson<{
      leap: string
      explanation: string
      novelty: number
      plausibility: number
      impact: number
    }>(this.llm, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.9, maxTokens: 512 })

    if (!result || !result.leap) return null

    return {
      type: request.type,
      leap: result.leap,
      explanation: result.explanation || '',
      novelty: Math.max(0.1, Math.min(1, result.novelty || 0.7)),
      plausibility: Math.max(0.1, Math.min(1, result.plausibility || 0.7)),
      impact: Math.max(0.1, Math.min(1, result.impact || 0.7)),
    }
  }

  /**
   * v11.0: 从结构化故事上下文构建prompt块
   * 如果提供了storyContext，生成精确的上下文描述；否则降级为纯文本
   */
  private buildStoryContextBlock(request: LeapRequest): string {
    const sc = request.storyContext
    if (!sc) {
      // 降级：使用纯文本上下文
      return `故事上下文（最近内容）：
${(request.context || '').slice(0, 1500)}`
    }

    const lines: string[] = ['【结构化故事上下文】']

    // 章节意图 + 情绪基调
    lines.push(`\n📖 本章意图：${sc.chapterIntent}`)
    lines.push(`🎭 情绪基调：${sc.emotionalTone}`)

    // 角色
    if (sc.characters.length > 0) {
      lines.push(`\n👤 出场角色：`)
      for (const ch of sc.characters.slice(0, 6)) {
        const roleLabel = { protagonist: '主角', supporting: '配角', antagonist: '对手', minor: '龙套' }[ch.role]
        lines.push(`  - ${ch.name}（${roleLabel}）：${ch.currentState} | 目标：${ch.currentGoal}`)
      }
    }

    // 活跃情节线程
    if (sc.activeThreads.length > 0) {
      lines.push(`\n🧵 活跃情节线程：`)
      for (const t of sc.activeThreads.slice(0, 4)) {
        lines.push(`  - ${t.name}：${t.description}`)
      }
    }

    // 近期事件
    if (sc.recentEvents.length > 0) {
      lines.push(`\n📅 近期关键事件：`)
      for (const e of sc.recentEvents.slice(0, 5)) {
        lines.push(`  - ${e}`)
      }
    }

    // 未回收伏笔
    if (sc.unresolvedForeshadowing.length > 0) {
      lines.push(`\n🔮 未回收伏笔：`)
      for (const fs of sc.unresolvedForeshadowing.slice(0, 5)) {
        const importanceLabel = fs.importance >= 3 ? '🔥重要' : fs.importance >= 2 ? '⚠️中等' : '💡轻微'
        lines.push(`  - [${importanceLabel}] ${fs.keyword}：${fs.description}（第${fs.plantedIn}章埋设）`)
      }
    }

    // 世界规则
    if (sc.worldRules.length > 0) {
      lines.push(`\n🌍 世界设定规则：`)
      for (const r of sc.worldRules.slice(0, 5)) {
        lines.push(`  - ${r}`)
      }
    }

    // 当前章节摘要
    if (sc.currentChapterSummary) {
      lines.push(`\n📝 当前章节摘要：${sc.currentChapterSummary}`)
    }

    return lines.join('\n')
  }

  private async generateMultipleLeapsWithLLM(
    source: string,
    context: string,
    types: LeapType[],
    storyContext?: import('./types').StoryContext
  ): Promise<LeapResult[]> {
    const typeDescs = types.map(t => {
      const info = this.TYPE_LABELS[t]
      const knowledge = getLeapKnowledgeByType(t)
      const constraints = knowledge ? `\n  约束：${knowledge.constraints.join('；')}` : ''
      const directions = knowledge ? `\n  方向：${knowledge.directions.join('；')}` : ''
      return `- ${t}（${info?.name || t}）：${info?.desc || ''}${constraints}${directions}`
    }).join('\n')

    const knowledgePrompt = generateLeapPrompt()

    // v11.0: 构建结构化/纯文本上下文
    const contextBlock = storyContext
      ? this.buildStoryContextBlock({ storyContext, context, source, targetDomain: '', type: types[0] } as LeapRequest)
      : `故事上下文：\n${context.slice(0, 1500)}`

    const systemPrompt = `${knowledgePrompt}

本次需要同时生成以下类型的创意跳跃：
${typeDescs}

要求：
1. 每个跳跃都必须紧密结合故事上下文
2. 要有跳跃感——非显而易见的连接
3. 语言精炼，每个leap 2-4句话
4. 评分要诚实：参考知识库的评分标准，真正好的给高分，一般的给中等分
5. 确保不同类型之间不要重复思路
6. 遵守每种类型的约束条件

返回JSON格式：
{
  "leaps": [
    {
      "type": "metaphor",
      "leap": "创意思路",
      "explanation": "为什么有效",
      "novelty": 0.85,
      "plausibility": 0.8,
      "impact": 0.9
    }
  ]
}`

    const userPrompt = `源概念：「${source}」

${contextBlock}

请为以上每种类型各生成一个创意跳跃。`

    const result = await llmJson<{
      leaps: Array<{
        type: string
        leap: string
        explanation: string
        novelty: number
        plausibility: number
        impact: number
      }>
    }>(this.llm, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.9, maxTokens: 1024 })

    if (!result || !result.leaps || !Array.isArray(result.leaps)) return []

    const validTypes = new Set(Object.keys(this.TYPE_LABELS))
    return result.leaps
      .filter(l => validTypes.has(l.type) && l.leap)
      .map(l => ({
        type: l.type as LeapType,
        leap: l.leap,
        explanation: l.explanation || '',
        novelty: Math.max(0.1, Math.min(1, l.novelty || 0.7)),
        plausibility: Math.max(0.1, Math.min(1, l.plausibility || 0.7)),
        impact: Math.max(0.1, Math.min(1, l.impact || 0.7)),
      }))
  }
}