// ============================================================
// 自我反思引擎 — GWE v6.0 基础智能层
// 核心能力：写完内容后自我评估，发现质量问题，自动重写改进
// 这是"思考闭环"的关键：产出 → 评估 → 反思 → 改进 → 再产出
// v6.4: 接入LLM语义分析，12维度真实评估
// v12.3: 去除评分偷懒引导，添加S/C级对比示例，均匀度检测降级
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
import { REFLECTION_CRITERIA, CLICHE_BLACKLIST, getCriterionByKey } from '../knowledge/reflection-criteria'

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
// v12.9: 维度拆分 — 结构性指标用规则引擎，语义性指标用LLM
// ============================================================

/** 规则引擎负责的结构性维度（关键词/统计匹配足够准确） */
const STRUCTURAL_DIMS = new Set<QualityDimension>([
  'pacing', 'information_density', 'sensory_richness', 'prose_quality', 'continuity',
])

/** LLM负责的语义维度（需要理解内容含义） */
const SEMANTIC_DIMS = new Set<QualityDimension>([
  'intent_alignment', 'opening_strength', 'ending_hook', 'emotional_impact',
  'character_voice', 'dialogue_quality', 'originality',
])

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
   * v12.9: LLM语义评估 + 规则引擎混合模式
   * 规则引擎负责5个结构性维度（节奏/信息密度/感官/文字/连续性）
   * LLM负责7个语义维度（意图/开头/钩子/情感/角色声音/对话/原创性）
   * LLM失败时自动降级，全部使用规则引擎
   */
  async reflectAsync(input: ReflectionInput, round = 0): Promise<ReflectionResult> {
    // 始终先跑规则引擎，获得完整12维基准线
    const ruleResult = this.reflect(input, round)

    if (!hasLLM(this.llm)) {
      return ruleResult
    }

    // 尝试LLM语义评估
    const llmResult = await this.evaluateSemanticWithLLM(input)
    if (!llmResult) {
      return ruleResult
    }

    // 混合模式：LLM覆盖语义维度，规则引擎保留结构性维度
    const dimensionScores = { ...ruleResult.dimensionScores }
    for (const d of llmResult.dimensions) {
      const dim = d.dimension as QualityDimension
      if (SEMANTIC_DIMS.has(dim)) {
        dimensionScores[dim] = d.score
      }
    }

    // 构建concerns：LLM语义维度 + 规则引擎结构维度
    const llmConcerns: QualityConcern[] = llmResult.dimensions.map(d => ({
      dimension: d.dimension as QualityDimension,
      severity: 1 - d.score,
      description: d.issue || '无具体问题',
      suggestion: d.suggestion || '保持',
      location: d.location,
    }))
    const structConcerns = ruleResult.concerns.filter(c => STRUCTURAL_DIMS.has(c.dimension))
    const allConcerns = [...llmConcerns, ...structConcerns]

    const overallScore = this.calculateOverallScore(dimensionScores)
    const passed = overallScore >= this.config.qualityGate
    const significantConcerns = allConcerns.filter(c => c.severity > 0.3).sort((a, b) => b.severity - a.severity)
    const highlights = llmResult.highlights?.length > 0 ? llmResult.highlights : ruleResult.highlights

    const result: ReflectionResult = {
      overallScore,
      passed,
      dimensionScores,
      concerns: significantConcerns,
      highlights,
      summary: this.buildSummary(overallScore, passed, allConcerns),
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
  // v12.9: LLM语义评估 — 仅评估7个语义维度
  // 提示词不再给关键词列表，而是让LLM以读者视角做判断
  // ============================================================

  /**
   * v12.9: 语义评估提示词 — 去关键词化，以读者感受为核心
   */
  private static SEMANTIC_SYSTEM_PROMPT = `你是资深网文编辑。请以读者视角，逐维度评估以下章节的质量。不要用关键词匹配，而是真正理解内容后给出判断。

【7个评估维度】

1. 意图对齐 (intent_alignment)
   - 本章标注了意图类型。读完后，你觉得它的核心意图实现了吗？
   - 该推进剧情的，剧情真的推进了吗？该高潮的，情绪真的爆了吗？
   - 有没有大段内容与核心意图无关？

2. 开头力度 (opening_strength)
   - 前3句话有没有抓住你？你读完第一段后想继续读吗？
   - 开头是直接切入冲突/悬念/异常，还是在铺垫背景/日常流程？
   - 有没有"醒来→吃饭→出门"式的流水账开头？

3. 结尾钩子 (ending_hook)
   - 读完最后一段，你是否产生"必须翻下一章"的冲动？
   - 结尾制造了悬念/危机/反转/抉择中的哪一种？
   - 还是平淡收尾（事情办完→感慨→结束）？

4. 情感冲击 (emotional_impact)
   - 读这章时你的情绪有没有起伏变化？
   - 有没有让你屏住呼吸、心跳加速、或眼眶发热的时刻？
   - 情绪是"展现"出来的（通过行为/细节），还是"告知"的（"他很愤怒"）？

5. 角色声音 (character_voice)
   - 不同角色说话你能分清谁是谁吗？
   - 角色的用词、句式、语气是否符合其身份和性格？
   - 还是所有人说话一个味道？

6. 对话质量 (dialogue_quality)
   - 对话是在推进剧情/展现性格/制造张力，还是在说废话/堆设定？
   - 有没有潜台词（角色嘴上说的和心里想的不一样）？
   - 对话引导词是否多样（不只是"说""道"）？

7. 原创性 (originality)
   - 有没有读到让你觉得"又是这套"的套路化表达或情节？
   - 情节发展有没有意料之外但合理的地方？
   - 描写方式有没有个人特色，还是通用模板？

【评分规则】
- 0.85-0.95: 优秀，这个维度做得很出色，让人印象深刻
- 0.70-0.84: 合格，基本达标但还有提升空间
- 0.50-0.69: 有问题，存在明显不足，影响阅读体验
- 0.30-0.49: 严重问题，需要重写
- 分数必须差异化，禁止所有维度分数相同或接近。好的地方大胆给高分，差的地方大胆给低分。
- issue必须写具体问题，引用原文中的具体句子或段落，禁止写"良好""合格""尚可"等空洞评价。

【输出格式】
只输出纯JSON，以 { 开头，以 } 结尾。`

  private async evaluateSemanticWithLLM(input: ReflectionInput): Promise<{
    dimensions: Array<{ dimension: QualityDimension; score: number; issue: string; suggestion: string; location?: string }>
    highlights: string[]
    overallComment: string
  } | null> {
    const prevContent = input.previousContent
      ? `\n【前一章结尾（用于连续性判断）】\n${input.previousContent.slice(-300)}`
      : ''

    const userPrompt = `【章节信息】
标题：${input.chapterTitle}
章节号：${input.chapterNumber}
本章意图：${input.intent.summary}
主要意图类型：${input.intent.primary.type}（置信度${Math.round(input.intent.primary.confidence * 100)}%）
情绪基调：${input.intent.emotionalTone.primary}（强度${Math.round(input.intent.emotionalTone.intensity * 100)}%）
${prevContent}

【章节内容】
${input.content.slice(0, 3000)}

请以读者视角评估上述7个维度，返回JSON：
{"dimensions":[{"dimension":"维度key","score":0.80,"issue":"具体问题（引用原文）","suggestion":"改进建议","location":"相关位置"}],"highlights":["亮点"],"overallComment":"总评（1-2句话）"}`

    const result = await llmJson<{
      dimensions: Array<{ dimension: string; score: number; issue: string; suggestion: string; location?: string }>
      highlights: string[]
      overallComment: string
    }>(this.llm, [
      { role: 'system', content: SelfReflection.SEMANTIC_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.3, maxTokens: 4096 })

    if (!result || !result.dimensions) return null

    // 验证并过滤维度（只保留语义维度）
    const validDimensions = result.dimensions
      .filter(d => SEMANTIC_DIMS.has(d.dimension as QualityDimension))
      .map(d => ({
        dimension: d.dimension as QualityDimension,
        score: Math.max(0.3, Math.min(0.95, d.score)), // 限制在合理范围
        issue: d.issue || '无具体问题',
        suggestion: d.suggestion || '保持',
        location: d.location,
      }))

    if (validDimensions.length === 0) return null

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
    let severity = 0
    const issues: string[] = []
    const suggestions: string[] = []

    // === 1. 情绪词密度 vs 意图 ===
    const emotionCount = (content.match(/泪|痛|心|颤抖|拥抱|怒|恐惧|绝望|希望|喜悦|悲伤|震撼|温暖|冷|笑|哭|沉默|叹息/g) || []).length

    if (intentEmotion.intensity > 0.7 && emotionCount < 5) {
      severity += 0.4
      issues.push(`意图要求高情绪强度（${Math.round(intentEmotion.intensity * 100)}%），但内容情绪标记不足`)
      suggestions.push('增加情绪描写：身体反应、内心独白、环境映衬')
    } else if (intentEmotion.intensity < 0.4 && emotionCount > 15) {
      severity += 0.25
      issues.push('意图要求低情绪强度，但内容情绪标记过多，可能显得用力过猛')
      suggestions.push('减少情绪词的直接使用，用含蓄的方式表达情绪')
    }

    // === 2. 情绪层次检测 ===
    // 情绪不应是单一的，应有起伏
    const positiveEmotions = (content.match(/喜|乐|笑|愉快|高兴|兴奋|期待|温暖|感动|欣慰|安心|释然|轻松/g) || []).length
    const negativeEmotions = (content.match(/悲|怒|恐|惧|痛|苦|忧|愁|恨|厌|憎|恶|绝望|沮丧|失落|沉重|压抑/g) || []).length

    if (content.length > 500) {
      // 情绪过于单一
      if (positiveEmotions > 10 && negativeEmotions === 0) {
        severity += 0.15
        issues.push('情绪过于单一（纯正向），缺少情感层次和对比')
        suggestions.push('在正向情绪中埋入隐忧，制造情感张力')
      } else if (negativeEmotions > 10 && positiveEmotions === 0) {
        severity += 0.15
        issues.push('情绪过于单一（纯负向），持续压抑可能让读者疲劳')
        suggestions.push('在负向情绪中插入一丝希望或温暖，制造情感起伏')
      }
    }

    // === 3. 情绪表达方式多样性 ===
    // 身体反应 / 内心独白 / 环境映衬 / 对话表达
    const bodyReactions = (content.match(/颤抖|发冷|发热|心跳|呼吸|手心|后背|额头|瞳孔|脸色|嘴唇|手指|膝盖|腿|胃|胸口|喉咙/g) || []).length
    const innerMonologue = (content.match(/心想|暗想|默念|心道|心中|心里|内心|心底|灵魂深处|脑海/g) || []).length
    const envMirror = (content.match(/风|雨|雪|雷|云|雾|天|夜|月|星|光|暗|影|冷|热|寒|暖|阴|晴/g) || []).length
    const dialogueExpression = (content.match(/[「」"'].*?(?:泪|痛|怒|笑|哭|叹|哼|冷笑|怒吼|咆哮|低语|喃喃|哽咽|嘶吼|颤抖)[^「」"']*?[「」"']/g) || []).length

    const expressionTypes = [bodyReactions, innerMonologue, envMirror, dialogueExpression]
      .filter(c => c > 0).length

    if (emotionCount > 8 && expressionTypes < 2) {
      severity += 0.15
      issues.push('情绪表达方式单一，仅依赖一种表达渠道')
      suggestions.push('多样化情绪表达：身体反应 + 内心独白 + 环境映衬 + 对话表达')
    }

    // === 4. 情绪节奏 ===
    // 检查情绪是否有"起→伏→起"的节奏，而非平铺
    const paragraphs = content.split(/\n\n|\n(?=[^ ])/).filter(p => p.trim())
    if (paragraphs.length > 5) {
      const emotionInParagraphs = paragraphs.map(p => {
        const pos = (p.match(/喜|乐|笑|愉快|高兴|兴奋|期待|温暖|感动|欣慰|安心|释然|轻松/g) || []).length
        const neg = (p.match(/悲|怒|恐|惧|痛|苦|忧|愁|恨|厌|憎|恶|绝望|沮丧|失落|沉重|压抑/g) || []).length
        return pos - neg // 正值=偏正向，负值=偏负向
      })
      // 检查情绪变化次数
      let emotionChanges = 0
      for (let i = 1; i < emotionInParagraphs.length; i++) {
        if (Math.sign(emotionInParagraphs[i]) !== Math.sign(emotionInParagraphs[i - 1])
          && emotionInParagraphs[i] !== 0 && emotionInParagraphs[i - 1] !== 0) {
          emotionChanges++
        }
      }
      if (emotionChanges === 0 && emotionCount > 5) {
        severity += 0.1
        issues.push('情绪缺少起伏变化，整章情绪平铺')
        suggestions.push('制造情绪波动：在关键节点制造情绪转折，让读者情绪跟着起伏')
      }
    }

    return {
      dimension: 'emotional_impact',
      severity: Math.min(severity, 1),
      description: issues.length > 0 ? issues.join('；') : '情绪表达与意图匹配',
      suggestion: suggestions.length > 0 ? suggestions.join('；') : '保持当前情绪表达',
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
      issues.push(`对话引导词单一（仅${Array.from(uniqueTags).join('、')}），缺乏变化`)
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
    let severity = 0
    const issues: string[] = []
    const suggestions: string[] = []

    const sentences = content.split(/[。！？]/).filter(s => s.trim())
    const wordsPerSentence = content.length / Math.max(sentences.length, 1)

    // === 1. 基础信息密度 vs 意图 ===
    if (suggestedPacing.infoDensity === 'high' && wordsPerSentence < 20) {
      severity += 0.25
      issues.push(`建议高信息密度，实际平均句长${Math.round(wordsPerSentence)}字，信息量不足`)
      suggestions.push('增加每句的信息承载量：加入更多具体细节、因果链、或世界观信息')
    } else if (suggestedPacing.infoDensity === 'low' && wordsPerSentence > 50) {
      severity += 0.2
      issues.push(`建议低信息密度，实际平均句长${Math.round(wordsPerSentence)}字，可能信息过载`)
      suggestions.push('拆分长句，给读者消化信息的时间')
    }

    // === 2. 新信息引入率（专属名词/新概念密度） ===
    const namedEntities = content.match(/[\u4e00-\u9fa5]{2,4}(?:殿|阁|楼|城|村|镇|山|岭|谷|原|野|林|海|河|湖|洞|室|厅|院|坊|街|巷|道|路|塔|庙|寺|观|宫|府|宅|店|铺|场|台|崖|壁|渊|潭|峰|顶|剑|刀|枪|斧|锤|鞭|弓|弩|盾|甲|袍|铠|丹|药|术|法|诀|阵|符|印|兽|虫|鸟|鱼|龙|凤|虎|狼|蛇|猿|象)/g) || []
    const newConceptPatterns = content.match(/所谓|名为|称之为|称作|唤作|一种|某种|一种名为|一种被称为|被称作|谓之/g) || []
    const entityDensity = namedEntities.length / (content.length / 500) // 每500字的新实体数
    const conceptDensity = newConceptPatterns.length / (content.length / 500)

    if (entityDensity > 8 && conceptDensity > 3) {
      severity += 0.2
      issues.push(`新概念/实体引入过快（每500字${entityDensity.toFixed(1)}个实体），读者可能信息过载`)
      suggestions.push('放缓新概念引入节奏，先让读者消化已有设定再引入新元素')
    }

    // === 3. 描述vs行动比例 ===
    const actionVerbs = (content.match(/攻击|爆发|冲向|斩|轰|碎|破|杀|全力|赌上|闪|躲|挡|格|踢|踹|砸|劈|刺|削|砍|挥|舞|跃|跳|跑|冲|退|进|转|翻|滚|爬|站|坐|蹲|跪|躺/g) || []).length
    const descriptionMarkers = (content.match(/的|地|得|着|了|过|在|是|有|像|如|似|般|仿佛|宛如|恍若/g) || []).length
    const totalLen = content.length
    const actionRatio = actionVerbs / (totalLen / 100)
    const descRatio = descriptionMarkers / (totalLen / 100)

    // 极端情况检测
    if (actionRatio > 15 && descRatio < 5) {
      severity += 0.15
      issues.push('动作密度过高，描写/说明不足，可能变成"打斗流水账"')
      suggestions.push('在动作间隙加入环境描写、心理活动、或战术思考')
    } else if (descRatio > 15 && actionRatio < 3) {
      severity += 0.15
      issues.push('描写/说明比例过高，行动推进不足，节奏可能拖沓')
      suggestions.push('增加具体事件/行动来推进情节，减少静态描写')
    }

    // === 4. 段落空信息检测 ===
    const paragraphs = content.split(/\n\n|\n(?=[^ ])/).filter(p => p.trim())
    const emptyParagraphs = paragraphs.filter(p => {
      const trimmed = p.trim()
      // 纯描述性段落没有新事件、新信息、新人物
      const hasAction = /攻击|爆发|冲向|斩|轰|碎|破|杀|说|道|问|答|喊|叫|发现|看到|感觉|知道|明白|想到|决定|开始|突然|忽然|竟然|原来/.test(trimmed)
      const hasNewInfo = /新的|另外|此外|还有|没想到|才知|才明白|原来|其实|真相|秘密/.test(trimmed)
      return !hasAction && !hasNewInfo && trimmed.length > 100
    })
    if (emptyParagraphs.length > paragraphs.length * 0.3 && paragraphs.length > 5) {
      severity += 0.15
      issues.push(`约${Math.round(emptyParagraphs.length / paragraphs.length * 100)}%的段落缺乏事件推进或新信息`)
      suggestions.push('确保每个段落都有推进作用：要么推进情节，要么揭示信息，要么塑造角色')
    }

    return {
      dimension: 'information_density',
      severity: Math.min(severity, 1),
      description: issues.length > 0 ? issues.join('；') : '信息密度与意图匹配',
      suggestion: suggestions.length > 0 ? suggestions.join('；') : '保持当前信息密度',
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
    const issues: string[] = []
    const suggestions: string[] = []

    if (dialogueCount === 0) {
      return {
        dimension: 'dialogue_quality',
        severity: 0,
        description: '本章无对话内容',
        suggestion: '',
      }
    }

    // === 1. 对话引导词多样性 ===
    const dialogueTags = content.match(/说|道|问|答|喊|叫|吼|骂|笑|冷|淡|轻|沉|缓|急|怒|惊|喜|叹|喃喃|低声|高声|冷冷/g) || []
    const tagVariety = new Set(dialogueTags).size
    if (tagVariety < 3 && dialogueCount > 5) {
      severity += 0.25
      issues.push(`对话引导词单一（仅${tagVariety}种），缺乏变化`)
      suggestions.push('丰富对话引导词，用动作和神态替代"说"')
    }

    // === 2. 对话-叙述比例 ===
    const dialogueText = dialogueMatches.join('')
    const dialogueRatio = dialogueText.length / Math.max(content.length, 1)
    if (dialogueRatio > 0.6) {
      severity += 0.2
      issues.push(`对话占比过高（${Math.round(dialogueRatio * 100)}%），叙述/描写/动作被挤压`)
      suggestions.push('在对话中穿插动作描写、环境描写、心理活动，避免"对话流水账"')
    } else if (dialogueRatio < 0.05 && dialogueCount > 0) {
      severity += 0.1
      issues.push('对话占比过低，人物互动可能不足')
    }

    // === 3. 对话功能性检查 ===
    const dialogueContents = dialogueMatches.map(d => d.replace(/[「」"']/g, ''))
    // 纯应答/确认型对话比例
    const fillerDialogues = dialogueContents.filter(d => {
      const text = d.trim()
      return text.length <= 3 && /^[嗯哦啊是好的行对吧可以没问题]{1,4}$/.test(text)
    })
    if (fillerDialogues.length > dialogueCount * 0.3 && dialogueCount > 4) {
      severity += 0.2
      issues.push(`${Math.round(fillerDialogues.length / dialogueCount * 100)}%的对话为纯应答（"嗯""好的"等），缺乏信息量和推进作用`)
      suggestions.push('减少无意义应答，让每句对话都有推进作用（推进情节/揭示信息/塑造角色/建立关系）')
    }

    // === 4. 对话长度多样性 ===
    const dialogueLengths = dialogueContents.map(d => d.length)
    const avgDialogueLen = dialogueLengths.reduce((s, l) => s + l, 0) / dialogueLengths.length
    const dVar = dialogueLengths.reduce((s, l) => s + (l - avgDialogueLen) ** 2, 0) / dialogueLengths.length
    const dStdDev = Math.sqrt(dVar)
    if (dialogueCount > 5 && dStdDev < avgDialogueLen * 0.3 && avgDialogueLen > 5) {
      severity += 0.15
      issues.push('对话长度过于均匀，不同角色说话长度接近，缺少个性')
      suggestions.push('不同角色应有不同的说话节奏：急性子短句，沉稳者长句，智者引经据典')
    }

    // === 5. 潜台词检测 ===
    const subtextCount = (content.match(/嘴上.{1,10}心里|嘴上.{1,10}却|虽然.{1,10}但.{1,10}眼神|说.{1,10}但.{1,10}心想|话虽.{1,10}可|嘴上不说|没说.{1,10}但|没说话.{1,10}却/g) || []).length
    const totalDialogueLines = dialogueCount
    if (totalDialogueLines > 8 && subtextCount === 0) {
      // 对话多但没有潜台词，可能过于直白
      severity += 0.1
      issues.push('对话缺少潜台词，角色表达过于直白')
      suggestions.push('让角色"嘴上说一套，心里想一套"，增加对话层次感')
    }

    return {
      dimension: 'dialogue_quality',
      severity: Math.min(severity, 1),
      description: issues.length > 0 ? issues.join('；') : '对话质量良好',
      suggestion: suggestions.length > 0 ? suggestions.join('；') : '保持当前对话质量',
    }
  }

  private checkProseQuality(input: ReflectionInput): QualityConcern {
    const content = input.content
    let severity = 0
    const issues: string[] = []
    const suggestions: string[] = []

    // === 1. 高频重复词检测 ===
    const words = content.replace(/[，。！？、：""「」『』\n]/g, ' ').split(/\s+/).filter(w => w.length >= 2)
    const wordFreq: Record<string, number> = {}
    for (const w of words) {
      wordFreq[w] = (wordFreq[w] || 0) + 1
    }
    const repeatedWords = Object.entries(wordFreq)
      .filter(([, count]) => count > 8)
      .map(([word]) => word)

    if (repeatedWords.length > 5) {
      severity += 0.25
      issues.push(`高频重复词较多：${repeatedWords.slice(0, 5).join('、')}等`)
      suggestions.push(`考虑替换高频词：${repeatedWords.slice(0, 3).join('、')}`)
    } else if (repeatedWords.length > 2) {
      severity += 0.1
      issues.push(`存在少量重复词：${repeatedWords.slice(0, 3).join('、')}`)
    }

    // === 2. 句子长度多样性 ===
    const sentences = content.split(/[。！？]/).filter(s => s.trim())
    const sentLengths = sentences.map(s => s.length)
    const avgLen = sentLengths.reduce((s, l) => s + l, 0) / Math.max(sentLengths.length, 1)
    const variance = sentLengths.reduce((s, l) => s + (l - avgLen) ** 2, 0) / Math.max(sentLengths.length, 1)
    const stdDev = Math.sqrt(variance)

    // 句子长度标准差过小 → 句式单调
    if (sentLengths.length > 10 && stdDev < avgLen * 0.4) {
      severity += 0.2
      issues.push('句子长度过于均匀，缺少长短变化，节奏单调')
      suggestions.push('交替使用短句（加速/强调）和长句（展开/沉浸），制造节奏变化')
    }

    // 连续短句（≤8字）过多 → 碎片化
    const shortSentStreak = this.findLongestStreak(sentLengths, l => l <= 8)
    if (shortSentStreak >= 6) {
      severity += 0.15
      issues.push(`连续${shortSentStreak}个短句（≤8字），碎片化严重，可读性下降`)
      suggestions.push('在连续短句中穿插一个中长句，打破碎片化节奏')
    }

    // 连续长句（≥40字）过多 → 阅读疲劳
    const longSentStreak = this.findLongestStreak(sentLengths, l => l >= 40)
    if (longSentStreak >= 4) {
      severity += 0.15
      issues.push(`连续${longSentStreak}个长句（≥40字），容易造成阅读疲劳`)
      suggestions.push('在连续长句中穿插短句，给读者"呼吸"空间')
    }

    // === 3. 句式结构多样性 ===
    const sentenceStarts = sentences.map(s => s.trim().slice(0, 2))
    const startFreq: Record<string, number> = {}
    for (const start of sentenceStarts) {
      startFreq[start] = (startFreq[start] || 0) + 1
    }
    const dominantStart = Object.entries(startFreq).sort((a, b) => b[1] - a[1])[0]
    if (dominantStart && dominantStart[1] > sentences.length * 0.3 && sentences.length > 10) {
      severity += 0.2
      issues.push(`句子开头过于单一，"${dominantStart[0]}"开头占比${Math.round(dominantStart[1] / sentences.length * 100)}%`)
      suggestions.push('变换句子开头方式：用时间、地点、动作、感官等不同元素开头')
    }

    // === 4. 形容词/副词密度 ===
    const adjCount = (content.match(/的/g) || []).length
    const advCount = (content.match(/地/g) || []).length
    const adjDensity = adjCount / (content.length / 100) // 每百字
    const advDensity = advCount / (content.length / 100)

    if (adjDensity > 8) {
      severity += 0.15
      issues.push(`形容词密度过高（每百字${adjDensity.toFixed(1)}个"的"），描写可能过于堆砌`)
      suggestions.push('减少形容词修饰，用动作和细节替代直接形容')
    }
    if (advDensity > 4) {
      severity += 0.1
      issues.push(`副词密度过高（每百字${advDensity.toFixed(1)}个"地"），动作描写可能过于依赖副词修饰`)
      suggestions.push('用更精准的动词替代"副词+动词"结构')
    }

    // === 5. 段落节奏 ===
    const paragraphs = content.split(/\n\n|\n(?=[^ ])/).filter(p => p.trim())
    const paraLengths = paragraphs.map(p => p.length)
    if (paraLengths.length > 3) {
      const avgParaLen = paraLengths.reduce((s, l) => s + l, 0) / paraLengths.length
      const paraVariance = paraLengths.reduce((s, l) => s + (l - avgParaLen) ** 2, 0) / paraLengths.length
      const paraStdDev = Math.sqrt(paraVariance)
      if (paraStdDev < avgParaLen * 0.3 && avgParaLen > 100) {
        severity += 0.1
        issues.push('段落长度均匀，缺少节奏变化')
        suggestions.push('偶尔使用极短段落（1-2句话）制造冲击力')
      }
    }

    return {
      dimension: 'prose_quality',
      severity: Math.min(severity, 1),
      description: issues.length > 0 ? issues.join('；') : '文字质量良好',
      suggestion: suggestions.length > 0 ? suggestions.slice(0, 3).join('；') : '保持当前文字质量',
    }
  }

  /** 辅助：找到连续满足条件的最长序列长度 */
  private findLongestStreak<T>(arr: T[], predicate: (item: T) => boolean): number {
    let maxStreak = 0
    let currentStreak = 0
    for (const item of arr) {
      if (predicate(item)) {
        currentStreak++
        maxStreak = Math.max(maxStreak, currentStreak)
      } else {
        currentStreak = 0
      }
    }
    return maxStreak
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

    const prevEnd = input.previousContent.slice(-300)
    const currStart = input.content.slice(0, 300)
    const content = input.content
    let severity = 0
    const issues: string[] = []
    const suggestions: string[] = []

    // === 1. 场景/地点连续性 ===
    const hasTransition = /第.*天|.*后|.*前|与此同时|画面一转|镜头切换|场景转换|转场|片刻之?后|须臾|转眼|不久|须臾之间|时光流转|光阴/.test(currStart)
    const locationPattern = /在([\u4e00-\u9fa5]{2,8}(?:殿|阁|楼|城|村|镇|山|岭|谷|原|野|林|海|河|湖|洞|室|厅|院|坊|街|巷|道|路|塔|庙|寺|观|宫|府|宅|店|铺|场|台|崖|壁|渊|潭|峰|顶))/g
    const prevLocations = Array.from(prevEnd.matchAll(locationPattern)).map(m => m[1])
    const currLocations = Array.from(currStart.matchAll(locationPattern)).map(m => m[1])
    const prevUnique = Array.from(new Set(prevLocations))
    const currUnique = Array.from(new Set(currLocations))

    if (prevUnique.length > 0 && currUnique.length > 0) {
      const overlap = prevUnique.filter(l => currUnique.includes(l))
      if (overlap.length === 0 && !hasTransition) {
        severity += 0.35
        issues.push(`场景从"${prevUnique.join('、')}"跳转到"${currUnique.join('、')}"，缺少过渡说明`)
        suggestions.push('在场景切换处加入时间/空间过渡描述')
      }
    }

    // === 2. 人物连续性 ===
    const namePattern = /[\u4e00-\u9fa5]{2,4}(?:道|说|问|答|喊|叫|吼|骂|笑|冷|淡|轻|沉|缓|急|怒|惊|喜|叹|喃喃|低声|高声|冷冷|心想|暗想|默念|心道)/g
    const prevNames = Array.from(new Set(Array.from(prevEnd.matchAll(namePattern)).map(m => {
      const full = m[0]
      return full.replace(/[道说问答喊叫吼骂笑冷淡轻沉缓急怒惊喜叹喃喃低声高声冷冷心想暗想默念心道]/g, '')
    }).filter(n => n.length >= 2)))
    const currNames = Array.from(new Set(Array.from(currStart.matchAll(namePattern)).map(m => {
      const full = m[0]
      return full.replace(/[道说问答喊叫吼骂笑冷淡轻沉缓急怒惊喜叹喃喃低声高声冷冷心想暗想默念心道]/g, '')
    }).filter(n => n.length >= 2)))

    if (prevNames.length >= 2 && currNames.length >= 1) {
      const continuityNames = prevNames.filter(n => currNames.includes(n))
      if (continuityNames.length === 0) {
        severity += 0.25
        issues.push(`上章出场人物（${prevNames.slice(0, 3).join('、')}）在本章开头均未出现`)
        suggestions.push('确保至少一个上章出场角色在本章开头出现，或明确说明去向')
      }
    }

    // === 3. 时间线连续性 ===
    const timeJumps = currStart.match(/第[一二三四五六七八九十\d]+[天日月年]|[一二三四五六七八九十\d]+[天日月年][前后]|数[天日月年]|半月|一月|数月|多年|许久|很久|不久|片刻|须臾/) || []
    const prevTimeIndicators = prevEnd.match(/第[一二三四五六七八九十\d]+[天日月年]|[一二三四五六七八九十\d]+[天日月年][前后]/) || []
    if (timeJumps.length > 0 && prevTimeIndicators.length === 0) {
      // 有时间跳跃但前文没有时间锚点，可能造成读者困惑
      // 这本身不是大问题但需要关注
      const hasTimeContext = /天[已已经]|距[离]|自[从]|从[那]|上[一]次|之[前]|之[后]/.test(currStart)
      if (!hasTimeContext) {
        severity += 0.15
        issues.push(`时间跳跃"${timeJumps[0]}"缺少与上章的时间参照`)
        suggestions.push('用"自上次……已过X天"等句式建立时间参照')
      }
    }

    // === 4. 状态连续性（受伤/能力/物品） ===
    const prevInjury = prevEnd.match(/受[伤了]|伤势|伤口|流血|骨折|内伤|重创|昏迷|虚弱|力竭|消耗|灵气?耗|体力不|法力不/)
    const currRecovered = currStart.match(/恢复|痊愈|愈合|完好|恢复如初|精神抖擞|精力充沛|满状态|完好无损|气血充盈/)
    if (prevInjury && currRecovered && !hasTransition) {
      severity += 0.2
      issues.push('上章结尾有受伤/消耗状态，本章开头直接恢复，缺少恢复过程说明')
      suggestions.push('加入恢复过程的简短描述，或说明时间流逝/丹药治疗')
    }

    // === 5. 情绪连续性 ===
    const prevEmotion = prevEnd.match(/怒|悲|恐|绝望|崩溃|狂喜|震惊|愤怒|悲伤|恐惧|绝望|痛哭|颤抖|沉默|低落|消沉|颓然|瘫坐|跪倒/)
    const currEmotion = currStart.match(/平静|淡定|从容|微笑|轻松|愉快|兴奋|期待|冷静|镇定|淡然|若无其事|谈笑|闲聊/)
    if (prevEmotion && currEmotion && !hasTransition) {
      severity += 0.15
      issues.push('上章结尾情绪与本章开头情绪反差过大，缺少情绪过渡')
      suggestions.push('加入情绪转换的过渡描写，或通过时间跳跃说明')
    }

    return {
      dimension: 'continuity',
      severity: Math.min(severity, 1),
      description: issues.length > 0 ? issues.join('；') : '连续性良好',
      suggestion: suggestions.length > 0 ? suggestions.join('；') : '保持当前连续性',
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