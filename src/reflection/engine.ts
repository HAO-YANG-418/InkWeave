// ============================================================
// 自我反思引擎 — GWE v6.0 基础智能层
// 核心能力：写完内容后自我评估，发现质量问题，自动重写改进
// 这是"思考闭环"的关键：产出 → 评估 → 反思 → 改进 → 再产出
// v6.4: 接入LLM语义分析，12维度真实评估
// ============================================================

import {
  type ReflectionConfig,
  type ReflectionResult,
  type ReflectionInput,
  type ReflectionRecord,
  type QualityConcern,
  type QualityDimension,
  DEFAULT_REFLECTION_CONFIG,
} from './types'
import type { LLMProvider } from '../types'
import { llmJson, hasLLM } from '../llm-helper'
import { REFLECTION_CRITERIA, CLICHE_BLACKLIST, generateReflectionPrompt, getCriterionByKey } from '../knowledge/reflection-criteria'

// ============================================================
// 质量维度权重 — 从知识库读取
// ============================================================

const DIMENSION_WEIGHTS: Record<QualityDimension, number> = Object.fromEntries(
  REFLECTION_CRITERIA.map(c => [c.key, c.weight])
) as Record<QualityDimension, number>

const ALL_DIMENSIONS: QualityDimension[] = [
  'intent_alignment', 'opening_strength', 'ending_hook', 'emotional_impact',
  'pacing', 'character_voice', 'information_density', 'sensory_richness',
  'dialogue_quality', 'prose_quality', 'continuity', 'originality',
]

// ============================================================
// 自我反思引擎
// ============================================================

export class SelfReflection {
  private config: ReflectionConfig
  private history: ReflectionRecord[] = []
  private llm: LLMProvider | null

  constructor(config?: Partial<ReflectionConfig>, llm?: LLMProvider | null) {
    this.config = { ...DEFAULT_REFLECTION_CONFIG, ...config }
    this.llm = llm ?? null
  }

  /**
   * 注入LLM Provider（用于延迟初始化）
   */
  setLLM(llm: LLMProvider | null): void {
    this.llm = llm
  }

  /**
   * 反思评估 — 核心方法
   * 对生成内容进行多维度评估，决定是否通过质量门槛
   */
  reflect(input: ReflectionInput, round = 0): ReflectionResult {
    const concerns = this.evaluateAllDimensions(input)
    const dimensionScores = this.calculateDimensionScores(concerns)
    const overallScore = this.calculateOverallScore(dimensionScores)
    const highlights = this.extractHighlights(input, concerns)

    const passed = overallScore >= this.config.qualityGate

    const result: ReflectionResult = {
      overallScore,
      passed,
      dimensionScores,
      concerns: concerns.filter(c => c.severity > 0.3).sort((a, b) => b.severity - a.severity),
      highlights,
      summary: this.buildSummary(overallScore, passed, concerns),
      round,
    }

    // 如果未通过，生成重写建议
    if (!passed) {
      result.rewriteInstructions = this.generateRewriteInstructions(concerns, input)
    }

    return result
  }

  /**
   * 自动重写循环
   * 反复评估和重写，直到通过质量门槛或达到最大次数
   * 
   * @param input 原始输入
   * @param rewriteFn 重写函数：接收重写指令，返回新内容
   * @returns 最终反思结果和重写历史
   */
  async autoRefine(
    input: ReflectionInput,
    rewriteFn: (instructions: string, content: string) => Promise<string>,
  ): Promise<{ finalResult: ReflectionResult; history: ReflectionResult[]; finalContent: string }> {
    const history: ReflectionResult[] = []
    let currentContent = input.content
    let currentResult = this.reflect(input, 0)
    history.push(currentResult)

    for (let round = 1; round <= this.config.maxAutoRewrite; round++) {
      if (currentResult.passed) break

      // 检查改进幅度
      if (round > 1) {
        const improvement = currentResult.overallScore - history[round - 2].overallScore
        if (improvement < this.config.minImprovement) {
          currentResult = {
            ...currentResult,
            summary: `重写改进不显著（+${(improvement * 100).toFixed(1)}%），停止重写。`,
          }
          break
        }
      }

      // 执行重写
      const instructions = currentResult.rewriteInstructions || '整体提升质量'
      currentContent = await rewriteFn(instructions, currentContent)

      // 重新评估
      currentResult = this.reflect({ ...input, content: currentContent }, round)
      currentResult.improvement = round > 0
        ? currentResult.overallScore - history[round - 1].overallScore
        : undefined
      history.push(currentResult)
    }

    // 记录反思历史
    this.recordReflection(input, history)

    return {
      finalResult: currentResult,
      history,
      finalContent: currentContent,
    }
  }

  /**
   * 单次质量门控
   * 简单判断：内容是否达标
   */
  qualityGate(input: ReflectionInput): { passed: boolean; score: number; topConcerns: QualityConcern[] } {
    const result = this.reflect(input, 0)
    return {
      passed: result.passed,
      score: result.overallScore,
      topConcerns: result.concerns.slice(0, 3),
    }
  }

  /**
   * LLM驱动的语义反思（异步）
   * 使用LLM进行12维度的深度语义评估，结果比规则引擎更精准
   * 无LLM时自动降级到规则引擎的reflect()
   */
  async reflectAsync(input: ReflectionInput, round = 0): Promise<ReflectionResult> {
    if (!hasLLM(this.llm)) {
      return this.reflect(input, round)
    }

    const llmResult = await this.evaluateWithLLM(input)
    if (!llmResult) {
      return this.reflect(input, round)
    }

    // 将LLM结果转换为QualityConcern数组
    const concerns: QualityConcern[] = llmResult.dimensions.map(d => ({
      dimension: d.dimension,
      severity: 1 - d.score, // LLM给的是0-1分，转成severity
      description: d.issue,
      suggestion: d.suggestion,
      location: d.location,
    }))

    const dimensionScores = {} as Record<QualityDimension, number>
    for (const d of llmResult.dimensions) {
      dimensionScores[d.dimension] = d.score
    }
    // 确保所有维度都有分数
    for (const dim of ALL_DIMENSIONS) {
      if (dimensionScores[dim] === undefined) {
        dimensionScores[dim] = 0.7 // LLM未返回的维度给默认分
      }
    }

    const overallScore = this.calculateOverallScore(dimensionScores)
    const passed = overallScore >= this.config.qualityGate
    const significantConcerns = concerns.filter(c => c.severity > 0.3).sort((a, b) => b.severity - a.severity)
    const highlights = llmResult.highlights || this.extractHighlights(input, concerns)

    const result: ReflectionResult = {
      overallScore,
      passed,
      dimensionScores,
      concerns: significantConcerns,
      highlights,
      summary: this.buildSummary(overallScore, passed, concerns),
      round,
    }

    if (!passed) {
      result.rewriteInstructions = this.generateRewriteInstructions(significantConcerns, input)
    }

    return result
  }

  /**
   * LLM驱动的自动重写循环
   */
  async autoRefineAsync(
    input: ReflectionInput,
    rewriteFn: (instructions: string, content: string) => Promise<string>,
  ): Promise<{ finalResult: ReflectionResult; history: ReflectionResult[]; finalContent: string }> {
    const history: ReflectionResult[] = []
    let currentContent = input.content
    let currentResult = await this.reflectAsync(input, 0)
    history.push(currentResult)

    for (let round = 1; round <= this.config.maxAutoRewrite; round++) {
      if (currentResult.passed) break

      if (round > 1) {
        const improvement = currentResult.overallScore - history[round - 2].overallScore
        if (improvement < this.config.minImprovement) {
          currentResult = {
            ...currentResult,
            summary: `重写改进不显著（+${(improvement * 100).toFixed(1)}%），停止重写。`,
          }
          break
        }
      }

      const instructions = currentResult.rewriteInstructions || '整体提升质量'
      currentContent = await rewriteFn(instructions, currentContent)
      currentResult = await this.reflectAsync({ ...input, content: currentContent }, round)
      currentResult.improvement = round > 0
        ? currentResult.overallScore - history[round - 1].overallScore
        : undefined
      history.push(currentResult)
    }

    this.recordReflection(input, history)

    return {
      finalResult: currentResult,
      history,
      finalContent: currentContent,
    }
  }

  // ============================================================
  // LLM评估实现
  // ============================================================

  private async evaluateWithLLM(input: ReflectionInput): Promise<{
    dimensions: Array<{ dimension: QualityDimension; score: number; issue: string; suggestion: string; location?: string }>
    highlights: string[]
    overallComment: string
  } | null> {
    const prevContent = input.previousContent
      ? `\n【前一章结尾】\n${input.previousContent.slice(-300)}`
      : ''

    const systemPrompt = generateReflectionPrompt() + `

对每个维度给出：
- score: 0-1的分数（0.8以上为优秀，0.6-0.8为合格，0.6以下需改进）
- issue: 具体问题描述（如果score>=0.7，写"良好"即可）
- suggestion: 具体改进建议（如果score>=0.7，写"保持"即可）
- location: 问题所在位置（开头/中段/结尾/全章，可留空）

同时给出：
- highlights: 本章2-3个亮点（写得好的地方）
- overallComment: 一句话总评

必须严格返回JSON，不要有其他文字。`

    const userPrompt = `【章节信息】
标题：${input.chapterTitle}
章节号：${input.chapterNumber}
本章意图：${input.intent.summary}
主要意图类型：${input.intent.primary.type}（置信度${Math.round(input.intent.primary.confidence * 100)}%）
情绪基调：${input.intent.emotionalTone.primary}（强度${Math.round(input.intent.emotionalTone.intensity * 100)}%）
推荐节奏：句长${input.intent.suggestedPacing.sentenceRhythm}，段落${input.intent.suggestedPacing.paragraphDensity}，信息密度${input.intent.suggestedPacing.infoDensity}
推荐策略：${input.intent.suggestedStrategies.map(s => s.name).join('、')}
${prevContent}

【章节内容】
${input.content.slice(0, 3000)}

请返回JSON格式：
{
  "dimensions": [
    {"dimension": "维度名", "score": 0.85, "issue": "具体问题或良好", "suggestion": "建议", "location": "位置"}
  ],
  "highlights": ["亮点1", "亮点2"],
  "overallComment": "总评"
}`

    const result = await llmJson<{
      dimensions: Array<{ dimension: string; score: number; issue: string; suggestion: string; location?: string }>
      highlights: string[]
      overallComment: string
    }>(this.llm, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.2, maxTokens: 2048 })

    if (!result || !result.dimensions) return null

    // 验证并过滤维度
    const validDims = new Set(ALL_DIMENSIONS)
    const validDimensions = result.dimensions
      .filter(d => validDims.has(d.dimension as QualityDimension))
      .map(d => ({
        dimension: d.dimension as QualityDimension,
        score: Math.max(0, Math.min(1, d.score)),
        issue: d.issue || '良好',
        suggestion: d.suggestion || '保持',
        location: d.location,
      }))

    return {
      dimensions: validDimensions,
      highlights: result.highlights?.slice(0, 5) || [],
      overallComment: result.overallComment || '',
    }
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 评估所有质量维度
   */
  private evaluateAllDimensions(input: ReflectionInput): QualityConcern[] {
    const concerns: QualityConcern[] = []

    concerns.push(this.checkIntentAlignment(input))
    concerns.push(this.checkOpeningStrength(input))
    concerns.push(this.checkEndingHook(input))
    concerns.push(this.checkEmotionalImpact(input))
    concerns.push(this.checkPacing(input))
    concerns.push(this.checkCharacterVoice(input))
    concerns.push(this.checkInformationDensity(input))
    concerns.push(this.checkSensoryRichness(input))
    concerns.push(this.checkDialogueQuality(input))
    concerns.push(this.checkProseQuality(input))
    concerns.push(this.checkContinuity(input))
    concerns.push(this.checkOriginality(input))

    return concerns
  }

  private checkIntentAlignment(input: ReflectionInput): QualityConcern {
    const intent = input.intent.primary.type
    const content = input.content
    const strategies = input.intent.suggestedStrategies

    // 检查内容是否体现了意图对应的特征
    const checks: { pass: boolean; message: string }[] = []

    if (intent === 'climax') {
      const hasShortSentences = (content.match(/[。！？]{1}/g) || []).length > 20
      const hasAction = /攻击|爆发|冲向|斩|轰|碎|破|杀|全力|赌上/.test(content)
      checks.push({ pass: hasShortSentences, message: '高潮场景缺少短句加速' })
      checks.push({ pass: hasAction, message: '高潮场景缺少行动描写' })
    } else if (intent === 'emotional_impact') {
      const hasEmotion = /泪|痛|心|颤抖|拥抱|告别|牺牲|感动/.test(content)
      const hasDetail = (content.match(/[，。]/g) || []).length > 30
      checks.push({ pass: hasEmotion, message: '情感冲击场景缺少情感标记' })
      checks.push({ pass: hasDetail, message: '情感冲击场景描写过于简略' })
    } else if (intent === 'reveal_secret') {
      const hasReveal = /原来|其实|真相|秘密|揭开|发现|终于|难怪/.test(content)
      checks.push({ pass: hasReveal, message: '秘密揭示场景缺少揭示性语言' })
    } else if (intent === 'build_relationship') {
      const hasDialogue = (content.match(/[""「」『』"']/g) || []).length >= 4
      const hasInteraction = /说|问|答|笑|看|点头|摇头|伸手|靠近/.test(content)
      checks.push({ pass: hasDialogue, message: '关系构建场景对话不足' })
      checks.push({ pass: hasInteraction, message: '关系构建缺少互动细节' })
    }

    const failedChecks = checks.filter(c => !c.pass)
    const severity = failedChecks.length / Math.max(checks.length, 1)

    return {
      dimension: 'intent_alignment',
      severity,
      description: failedChecks.length > 0
        ? `内容与意图「${intent}」不完全对齐：${failedChecks.map(c => c.message).join('；')}`
        : '内容与意图对齐良好',
      suggestion: failedChecks.length > 0
        ? `强化${strategies.map(s => s.name).join('、')}策略的执行`
        : '保持当前对齐度',
    }
  }

  private checkOpeningStrength(input: ReflectionInput): QualityConcern {
    const content = input.content
    const firstSentence = content.split(/[。！？\n]/)[0]?.trim() || ''

    let severity = 0
    const issues: string[] = []
    let suggestion = ''

    // 检查开头长度（太短或太长）
    if (firstSentence.length < 5) {
      severity += 0.3
      issues.push('开头过短，缺少锚点')
    } else if (firstSentence.length > 80) {
      severity += 0.2
      issues.push('开头句子过长，可能失去节奏')
    }

    // 检查是否有感官锚点
    const hasSensory = /看|听|闻|触|感觉|痛|冷|热|声|光|味|气/.test(firstSentence)
    if (!hasSensory) {
      severity += 0.2
      issues.push('开头缺少感官锚点')
      suggestion = '用具体的感官体验（声音、触感、视觉）作为开头锚点'
    }

    // 检查是否有叙事总结句
    const isSummary = /^(他|她|它|他们|这|那|这时|然后|于是|接着|之后|转眼|很快|不久|数日|此刻|此时)/.test(firstSentence)
    if (isSummary) {
      severity += 0.3
      issues.push('开头是叙事总结句，而非具体感知时刻')
      suggestion = '用身体感知、场景物件、对话片段、或具体动作作为开头'
    }

    // 检查是否有预告式假钩子
    const hasFakeHook = /他不知道|她不知道|他不知道的是|没人知道|谁也想不到|后来才|殊不知/.test(firstSentence)
    if (hasFakeHook) {
      severity += 0.4
      issues.push('开头使用了预告式假钩子')
      suggestion = '用具体事件制造悬念，而非"他不知道……"式预告'
    }

    return {
      dimension: 'opening_strength',
      severity: Math.min(severity, 1),
      description: issues.length > 0 ? issues.join('；') : '开头力度良好',
      suggestion: suggestion || '保持当前开头风格',
      location: `开头：${firstSentence.slice(0, 40)}...`,
    }
  }

  private checkEndingHook(input: ReflectionInput): QualityConcern {
    const content = input.content
    const paragraphs = content.split(/\n\n|\n(?=[^ ])/).filter(p => p.trim())
    const lastParagraph = paragraphs[paragraphs.length - 1]?.trim() || ''
    const lastSentence = lastParagraph.split(/[。！？]/).filter(s => s.trim()).pop()?.trim() || ''

    let severity = 0
    const issues: string[] = []
    let suggestion = ''

    // 检查结尾是否有钩子
    const hasHook = /？|突然|忽然|却发现|竟然|原来|难道|莫非|不好|糟糕|危险|诡异|奇怪|异样|不对劲/.test(lastParagraph)
    if (!hasHook) {
      severity += 0.3
      issues.push('结尾缺少钩子')
      suggestion = '在结尾加入新信息、悬念、或情绪转折'
    }

    // 检查是否用"不是X是Y"模式结尾
    const hasNotShi = /不是.{1,10}而是|不是.{1,10}是/.test(lastParagraph)
    if (hasNotShi) {
      severity += 0.2
      issues.push('结尾使用了"不是X是Y"模式')
    }

    // 检查结尾是否过于平淡
    const isFlat = /^(他|她|于是|然后|接着|之后|就这样|说完|做完)/.test(lastSentence)
    if (isFlat) {
      severity += 0.2
      issues.push('结尾平淡，缺少冲击力')
      suggestion = '用动作、对话、或新发现作为结尾，而非叙事总结'
    }

    return {
      dimension: 'ending_hook',
      severity: Math.min(severity, 1),
      description: issues.length > 0 ? issues.join('；') : '结尾钩子力度良好',
      suggestion: suggestion || '保持当前结尾风格',
      location: `结尾：${lastSentence.slice(0, 40)}...`,
    }
  }

  private checkEmotionalImpact(input: ReflectionInput): QualityConcern {
    const content = input.content
    const intentEmotion = input.intent.emotionalTone

    // 检查情绪词密度
    const emotionCount = (content.match(/泪|痛|心|颤抖|拥抱|怒|恐惧|绝望|希望|喜悦|悲伤|震撼|温暖|冷|笑|哭|沉默|叹息/g) || []).length

    let severity = 0
    let description = ''

    if (intentEmotion.intensity > 0.7 && emotionCount < 5) {
      severity = 0.5
      description = `意图要求高情绪强度（${Math.round(intentEmotion.intensity * 100)}%），但内容情绪标记不足`
    } else if (intentEmotion.intensity < 0.4 && emotionCount > 15) {
      severity = 0.3
      description = '意图要求低情绪强度，但内容情绪标记过多，可能显得用力过猛'
    } else {
      description = '情绪强度与意图匹配'
    }

    return {
      dimension: 'emotional_impact',
      severity,
      description,
      suggestion: severity > 0.3 ? '调整情绪描写的密度和强度，使其与章节意图匹配' : '保持当前情绪表达',
    }
  }

  private checkPacing(input: ReflectionInput): QualityConcern {
    const content = input.content
    const suggestedPacing = input.intent.suggestedPacing

    const sentences = content.split(/[。！？]/).filter(s => s.trim())
    const avgSentenceLen = sentences.reduce((sum, s) => sum + s.length, 0) / Math.max(sentences.length, 1)
    const paragraphs = content.split(/\n\n|\n(?=[^ ])/).filter(p => p.trim())
    const avgParagraphLen = paragraphs.reduce((sum, p) => sum + p.length, 0) / Math.max(paragraphs.length, 1)

    let severity = 0
    const issues: string[] = []

    // 检查句子节奏
    if (suggestedPacing.sentenceRhythm === 'short' && avgSentenceLen > 40) {
      severity += 0.3
      issues.push(`建议短句节奏，实际平均句长${Math.round(avgSentenceLen)}字`)
    } else if (suggestedPacing.sentenceRhythm === 'long' && avgSentenceLen < 15) {
      severity += 0.2
      issues.push(`建议长句节奏，实际平均句长${Math.round(avgSentenceLen)}字`)
    }

    // 检查段落密度
    if (suggestedPacing.paragraphDensity === 'dense' && avgParagraphLen < 80) {
      severity += 0.2
      issues.push('建议密集段落，实际段落偏短')
    } else if (suggestedPacing.paragraphDensity === 'sparse' && avgParagraphLen > 300) {
      severity += 0.2
      issues.push('建议稀疏段落，实际段落偏长')
    }

    return {
      dimension: 'pacing',
      severity: Math.min(severity, 1),
      description: issues.length > 0 ? issues.join('；') : '节奏控制良好',
      suggestion: '调整句长和段落长度以匹配意图推荐的节奏',
    }
  }

  private checkCharacterVoice(input: ReflectionInput): QualityConcern {
    const content = input.content
    // 提取对话内容（中文引号和常见引号）
    const dialogueMatches = content.match(/[「」""''「」『』"].*?[「」""''「」『』"]/g) || []
    const criterion = getCriterionByKey('character_voice')

    if (dialogueMatches.length < 2) {
      // 对话太少，不评估声音一致性
      return {
        dimension: 'character_voice',
        severity: 0.05,
        description: '对话数量不足，无法评估角色声音区分度',
        suggestion: criterion?.goodSignals[0] || '给每个角色设计独特的语言特征',
      }
    }

    const issues: string[] = []
    let severity = 0

    // 检测1：万能应答 — 大量无意义短回应
    const fillerResponses = dialogueMatches.filter(d => {
      const text = d.replace(/[「」""''「」『』"\s]/g, '')
      return text.length <= 3 && /^[嗯哦啊是好的行对吧？]{1,3}$/.test(text)
    })
    if (fillerResponses.length > dialogueMatches.length * 0.4 && dialogueMatches.length > 4) {
      severity += 0.5
      issues.push('对话中大量"嗯""好的""是"等万能应答，缺乏信息量')
    }

    // 检测2：声音同质化 — 对话句式和长度过于相似
    const dialogueTexts = dialogueMatches.map(d => d.replace(/[「」""''「」『』"\s]/g, ''))
    const lengths = dialogueTexts.map(t => t.length)
    const avgLen = lengths.reduce((s, l) => s + l, 0) / lengths.length
    const variance = lengths.reduce((s, l) => s + (l - avgLen) ** 2, 0) / lengths.length
    const stdDev = Math.sqrt(variance)

    // 如果对话数量>3但长度方差极小，说明所有角色说话长度差不多
    if (dialogueMatches.length > 3 && stdDev < avgLen * 0.3 && avgLen > 5) {
      severity += 0.4
      issues.push('不同角色对话长度过于接近，声音同质化')
    }

    // 检测3：对话引导词同质 — 全用"说""道"
    const tags = content.match(/(?:他|她|它|他们|这人|那人)?[^。！？\n]{0,4}(说|道|问|答|喊|叫|吼|骂|笑|冷|淡|轻|沉|缓|急|怒|惊|喜|叹|喃喃|低声|高声|冷冷)/g) || []
    const tagWords = tags.map(t => t.match(/(说|道|问|答|喊|叫|吼|骂|笑|冷|淡|轻|沉|缓|急|怒|惊|喜|叹|喃喃|低声|高声|冷冷)/)?.[0] || '')
    const uniqueTags = new Set(tagWords)
    if (dialogueMatches.length > 5 && uniqueTags.size < 3) {
      severity += 0.3
      issues.push(`对话引导词单一（仅${[...uniqueTags].join('、')}），缺乏变化`)
    }

    // 检测4：情感副词堆砌 — "愤怒地说""温柔地回答"
    const emotionAdverbTags = content.match(/[愤怒悲喜惊恐慌冷漠温柔平静激动焦急][^。！？\n]{0,3}地(说|道|问|答|喊|叫)/g) || []
    if (emotionAdverbTags.length > dialogueMatches.length * 0.3 && dialogueMatches.length > 3) {
      severity += 0.3
      issues.push('对话标签过度使用情感副词（"愤怒地说"等），应通过对话内容本身传达情绪')
    }

    return {
      dimension: 'character_voice',
      severity: Math.min(severity, 1),
      description: issues.length > 0 ? issues.join('；') : '角色声音区分度良好',
      suggestion: issues.length > 0
        ? '给每个角色设计独特的语言特征：用词习惯、句式长短、口头禅、语气态度'
        : '保持当前角色声音区分度',
    }
  }

  private checkInformationDensity(input: ReflectionInput): QualityConcern {
    const content = input.content
    const suggestedPacing = input.intent.suggestedPacing

    // 简化：用句子数/总字数估算信息密度
    const sentences = content.split(/[。！？]/).filter(s => s.trim())
    const wordsPerSentence = content.length / Math.max(sentences.length, 1)

    let severity = 0
    let description = ''

    if (suggestedPacing.infoDensity === 'high' && wordsPerSentence < 20) {
      severity = 0.3
      description = '建议高信息密度，但句子偏短，可能信息量不足'
    } else if (suggestedPacing.infoDensity === 'low' && wordsPerSentence > 50) {
      severity = 0.3
      description = '建议低信息密度，但句子偏长，可能信息过载'
    } else {
      description = '信息密度与意图匹配'
    }

    return {
      dimension: 'information_density',
      severity,
      description,
      suggestion: severity > 0.2 ? '调整句子的信息承载量' : '保持当前信息密度',
    }
  }

  private checkSensoryRichness(input: ReflectionInput): QualityConcern {
    const content = input.content

    const visual = (content.match(/看|见|望|观|视|光|暗|亮|色|影|形|红|蓝|黑|白|金|绿|银|灰|紫/g) || []).length
    const auditory = (content.match(/听|声|响|音|叫|喊|吼|鸣|啸|嗡|轰|静|默|沉寂/g) || []).length
    const tactile = (content.match(/触|碰|摸|感|冷|热|暖|凉|烫|痛|麻|痒|软|硬|粗糙|光滑|湿|干/g) || []).length
    const olfactory = (content.match(/闻|嗅|香|臭|腥|甜|酸|苦|辣|气味|味道/g) || []).length

    const totalSensory = visual + auditory + tactile + olfactory
    const contentLen = content.length
    const sensoryDensity = totalSensory / (contentLen / 100) // 每百字感官词数

    let severity = 0
    let description = ''

    if (sensoryDensity < 2) {
      severity = 0.5
      description = '感官描写密度过低，内容可能缺乏沉浸感'
    } else if (sensoryDensity < 4) {
      severity = 0.2
      description = '感官描写密度适中，可以考虑增加非视觉感官'
    } else {
      description = '感官丰富度良好'
    }

    const missingSenses: string[] = []
    if (auditory === 0) missingSenses.push('听觉')
    if (tactile === 0) missingSenses.push('触觉')
    if (olfactory === 0) missingSenses.push('嗅觉')

    return {
      dimension: 'sensory_richness',
      severity,
      description: missingSenses.length > 0
        ? `${description}（缺少${missingSenses.join('、')}描写）`
        : description,
      suggestion: missingSenses.length > 0
        ? `增加${missingSenses.join('、')}描写，丰富感官层次`
        : '保持当前感官丰富度',
    }
  }

  private checkDialogueQuality(input: ReflectionInput): QualityConcern {
    const content = input.content
    const dialogueMatches = content.match(/[「」"'].*?[「」"']/g) || []
    const dialogueCount = dialogueMatches.length

    let severity = 0
    let description = ''

    if (dialogueCount === 0) {
      // 不是所有场景都需要对话
      description = '本章无对话内容'
    } else {
      // 检查对话是否有"说"之外的引导词
      const dialogueTags = content.match(/说|道|问|答|喊|叫|吼|骂|笑|冷|淡|轻|沉|缓|急|怒|惊|喜|叹|喃喃|低声|高声|冷冷/g) || []
      const tagVariety = new Set(dialogueTags).size

      if (tagVariety < 3 && dialogueCount > 5) {
        severity = 0.3
        description = '对话引导词单一，缺乏变化'
      } else {
        description = '对话质量良好'
      }
    }

    return {
      dimension: 'dialogue_quality',
      severity,
      description,
      suggestion: severity > 0.2 ? '丰富对话引导词，用动作和神态替代"说"' : '保持当前对话质量',
    }
  }

  private checkProseQuality(input: ReflectionInput): QualityConcern {
    const content = input.content

    // 检查重复词
    const words = content.replace(/[，。！？、：""「」『』\n]/g, ' ').split(/\s+/).filter(w => w.length >= 2)
    const wordFreq: Record<string, number> = {}
    for (const w of words) {
      wordFreq[w] = (wordFreq[w] || 0) + 1
    }
    const repeatedWords = Object.entries(wordFreq)
      .filter(([, count]) => count > 8)
      .map(([word]) => word)

    let severity = 0
    let description = '文字质量良好'

    if (repeatedWords.length > 5) {
      severity = 0.3
      description = `高频重复词较多：${repeatedWords.slice(0, 5).join('、')}等`
    } else if (repeatedWords.length > 2) {
      severity = 0.15
      description = `存在少量重复词：${repeatedWords.slice(0, 3).join('、')}`
    }

    return {
      dimension: 'prose_quality',
      severity,
      description,
      suggestion: repeatedWords.length > 2 ? `考虑替换高频词：${repeatedWords.slice(0, 3).join('、')}` : '保持当前文字质量',
    }
  }

  private checkContinuity(input: ReflectionInput): QualityConcern {
    if (!input.previousContent) {
      return {
        dimension: 'continuity',
        severity: 0,
        description: '无前文对比，跳过连续性检查',
        suggestion: '',
      }
    }

    // 简化：检查是否有明显的衔接断裂
    const prevEnd = input.previousContent.slice(-200)
    const currStart = input.content.slice(0, 200)

    // 检查时间/空间跳跃是否有说明
    const hasTransition = /第.*天|.*后|.*前|与此同时|画面一转|镜头切换|场景转换|转场/.test(currStart)
    const prevLocation = prevEnd.match(/在([\u4e00-\u9fa5]{2,6}[殿阁楼城村镇山岭谷原野林海河湖洞])/)?.[1]
    const currLocation = currStart.match(/在([\u4e00-\u9fa5]{2,6}[殿阁楼城村镇山岭谷原野林海河湖洞])/)?.[1]

    let severity = 0
    let description = '连续性良好'

    if (prevLocation && currLocation && prevLocation !== currLocation && !hasTransition) {
      severity = 0.4
      description = `场景从"${prevLocation}"跳转到"${currLocation}"，缺少过渡说明`
    }

    return {
      dimension: 'continuity',
      severity,
      description,
      suggestion: severity > 0.3 ? '在场景切换处加入明确的过渡描述' : '保持当前连续性',
    }
  }

  private checkOriginality(input: ReflectionInput): QualityConcern {
    const content = input.content

    // 使用知识库的套路词黑名单检测
    const matches: Array<{ word: string; alternative: string }> = []
    for (const cliche of CLICHE_BLACKLIST) {
      if (content.includes(cliche.pattern)) {
        matches.push({ word: cliche.pattern, alternative: cliche.alternative })
      }
    }

    // 同时保留正则检测（捕获变体形式）
    const regexCliches = [
      /嘴角.{1,5}弧度/,
      /眼中.{1,5}闪过.{1,5}光芒/,
      /深吸.{1,5}口气/,
      /心中.{1,5}一.{1,5}[震动沉惊颤凛]/,
      /瞳孔.{1,5}缩/,
      /倒吸.{1,5}凉气/,
      /后背.{1,5}冷汗/,
      /脸色.{1,5}[白青沉变]/,
      /目光.{1,5}[凛凝锐寒]/,
      /一股.{1,5}[强恐庞可]怕/,
      /冷笑.{1,5}声/,
      /淡淡.{1,5}[地道说]/,
      /嘴角.{1,5}[扬勾]/,
    ]
    for (const regex of regexCliches) {
      const found = content.match(regex)
      if (found && !matches.some(m => m.word === found[0])) {
        matches.push({ word: found[0], alternative: '用具体的、与角色/场景相关的描写替代' })
      }
    }

    const severity = Math.min(matches.length * 0.08, 0.8)

    return {
      dimension: 'originality',
      severity,
      description: matches.length > 0
        ? `检测到${matches.length}处套路化表达：${matches.slice(0, 5).map(m => m.word).join('、')}等`
        : '未检测到明显套路化表达',
      suggestion: matches.length > 0
        ? '用具体的、独特的描写替代套路化表达'
        : '保持当前原创性',
    }
  }

  /**
   * 计算各维度评分
   */
  private calculateDimensionScores(concerns: QualityConcern[]): Record<QualityDimension, number> {
    const scores = {} as Record<QualityDimension, number>
    for (const concern of concerns) {
      scores[concern.dimension] = 1 - concern.severity
    }
    return scores
  }

  /**
   * 计算加权总分
   */
  private calculateOverallScore(dimensionScores: Record<QualityDimension, number>): number {
    let totalWeight = 0
    let weightedSum = 0

    for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
      const score = dimensionScores[dim as QualityDimension] ?? 0.5
      weightedSum += score * weight
      totalWeight += weight
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0.5
  }

  /**
   * 提取内容亮点
   */
  private extractHighlights(input: ReflectionInput, _concerns: QualityConcern[]): string[] {
    const highlights: string[] = []
    const content = input.content

    // 检查是否有精彩的比喻
    const metaphors = content.match(/像.{2,15}(?:一样|般|似的)/g)
    if (metaphors && metaphors.length >= 2) {
      highlights.push(`使用了${metaphors.length}处比喻，丰富了表达`)
    }

    // 检查是否有独特的动作描写
    const uniqueActions = content.match(/[^，。！？\n]{10,30}(?:猛然|骤然|蓦然|陡然|霍然|倏然|霎时|瞬间)[^，。！？\n]{10,30}/g)
    if (uniqueActions && uniqueActions.length >= 1) {
      highlights.push('包含生动的动作描写')
    }

    // 检查对话是否有潜台词（"说"了但表达的不是字面意思）
    const subtextHints = content.match(/嘴上.{1,15}心里|嘴上.{1,15}却|虽然.{1,15}但.{1,10}眼神/g)
    if (subtextHints && subtextHints.length >= 1) {
      highlights.push('对话有潜台词，角色表达有层次')
    }

    if (highlights.length === 0) {
      highlights.push('内容结构完整，无明显问题')
    }

    return highlights
  }

  /**
   * 生成重写指令
   */
  private generateRewriteInstructions(concerns: QualityConcern[], input: ReflectionInput): string {
    const topConcerns = concerns
      .filter(c => c.severity > 0.3)
      .sort((a, b) => b.severity - a.severity)
      .slice(0, 5)

    const lines: string[] = [
      `【重写指令】章节「${input.chapterTitle}」未通过质量门槛，请针对以下问题重写：`,
    ]

    for (const concern of topConcerns) {
      lines.push(`\n[${this.dimensionLabel(concern.dimension)}] 严重度: ${Math.round(concern.severity * 100)}%`)
      lines.push(`  问题: ${concern.description}`)
      if (concern.suggestion) {
        lines.push(`  建议: ${concern.suggestion}`)
      }
    }

    lines.push(`\n【重写要求】保留原有优点，仅修改上述问题部分。不要完全重写。`)
    lines.push(`【意图提醒】本章意图: ${input.intent.summary}`)

    return lines.join('\n')
  }

  /**
   * 构建反思摘要
   */
  private buildSummary(score: number, passed: boolean, concerns: QualityConcern[]): string {
    const grade = score >= 0.9 ? 'S' : score >= 0.8 ? 'A' : score >= 0.7 ? 'B' : score >= 0.6 ? 'C' : 'D'
    const status = passed ? '✅ 通过' : '❌ 未通过'
    const topIssue = concerns.filter(c => c.severity > 0.3).sort((a, b) => b.severity - a.severity)[0]

    let summary = `质量评级: ${grade} (${Math.round(score * 100)}分) ${status}`
    if (topIssue) {
      summary += ` | 首要问题: ${this.dimensionLabel(topIssue.dimension)}`
    }

    return summary
  }

  /**
   * 记录反思历史
   */
  private recordReflection(input: ReflectionInput, history: ReflectionResult[]): void {
    const first = history[0]
    const last = history[history.length - 1]

    const record: ReflectionRecord = {
      timestamp: Date.now(),
      chapterNumber: input.chapterNumber,
      intent: input.intent.primary.type,
      originalScore: first.overallScore,
      finalScore: last.overallScore,
      rounds: history.length,
      keyConcerns: first.concerns.filter(c => c.severity > 0.5),
      lessons: [
        `原始评分: ${Math.round(first.overallScore * 100)} → 最终评分: ${Math.round(last.overallScore * 100)}`,
        `共${history.length}轮反思`,
        ...first.concerns.filter(c => c.severity > 0.5).map(c => `关键问题: ${this.dimensionLabel(c.dimension)} - ${c.description}`),
      ],
    }

    this.history.push(record)
  }

  dimensionLabel(dim: QualityDimension): string {
    const labels: Record<QualityDimension, string> = {
      intent_alignment: '意图对齐',
      emotional_impact: '情感冲击',
      pacing: '节奏控制',
      character_voice: '角色声音',
      opening_strength: '开头力度',
      ending_hook: '结尾钩子',
      information_density: '信息密度',
      sensory_richness: '感官丰富度',
      dialogue_quality: '对话质量',
      prose_quality: '文字质量',
      continuity: '连续性',
      originality: '原创性',
    }
    return labels[dim] || dim
  }

  /**
   * 获取反思历史
   */
  getHistory(): ReflectionRecord[] {
    return [...this.history]
  }

  /**
   * 获取反思统计
   */
  getStats(): { totalReflections: number; averageScore: number; averageRounds: number; improvementRate: number } {
    if (this.history.length === 0) {
      return { totalReflections: 0, averageScore: 0, averageRounds: 0, improvementRate: 0 }
    }

    const avgScore = this.history.reduce((s, r) => s + r.finalScore, 0) / this.history.length
    const avgRounds = this.history.reduce((s, r) => s + r.rounds, 0) / this.history.length
    const improved = this.history.filter(r => r.finalScore > r.originalScore).length
    const improvementRate = improved / this.history.length

    return {
      totalReflections: this.history.length,
      averageScore: avgScore,
      averageRounds: avgRounds,
      improvementRate,
    }
  }
}