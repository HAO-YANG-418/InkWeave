// ============================================================
// 质量预测器 — GWE v6.0 超人类层
// 核心能力：在AI生成内容之前预测质量，提前规避风险
// 让AI拥有"预判力"——在写之前就知道可能会出什么问题
// ============================================================

import {
  type QualityPredictionDimension,
  type QualityPredictionInput,
  type QualityPrediction,
  type QualityRisk,
  type QualityPredictorConfig,
  DEFAULT_QUALITY_PREDICTOR_CONFIG,
} from './types'

// ============================================================
// 质量预测器
// ============================================================

export class QualityPredictor {
  private config: QualityPredictorConfig
  private predictionHistory: QualityPrediction[] = []

  constructor(config?: Partial<QualityPredictorConfig>) {
    this.config = { ...DEFAULT_QUALITY_PREDICTOR_CONFIG, ...config }
  }

  /**
   * 预测质量 — 核心方法
   * 在内容生成前/后预测各维度质量
   */
  predict(input: QualityPredictionInput): QualityPrediction {
    const dimensions = this.predictAllDimensions(input)
    const overallScore = this.calculateOverallScore(dimensions)
    const confidence = this.calculateConfidence(input)
    const risks = this.detectRisks(dimensions)
    const suggestions = this.generateSuggestions(risks, dimensions)

    const prediction: QualityPrediction = {
      dimensions,
      overallScore,
      confidence,
      risks,
      suggestions,
    }

    this.predictionHistory.push(prediction)
    return prediction
  }

  /**
   * 批量预测（多章节）
   */
  predictBatch(inputs: QualityPredictionInput[]): QualityPrediction[] {
    return inputs.map(input => this.predict(input))
  }

  /**
   * 获取趋势
   */
  getTrend(): { scores: number[]; trend: 'improving' | 'declining' | 'stable'; confidence: number } {
    const scores = this.predictionHistory.map(p => p.overallScore)
    if (scores.length < 2) {
      return { scores, trend: 'stable', confidence: 0 }
    }

    // 线性回归趋势
    const n = scores.length
    const xMean = (n - 1) / 2
    const yMean = scores.reduce((a, b) => a + b, 0) / n

    let numerator = 0
    let denominator = 0
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (scores[i] - yMean)
      denominator += (i - xMean) ** 2
    }

    const slope = denominator > 0 ? numerator / denominator : 0
    const rSquared = denominator > 0 ? (numerator ** 2) / (denominator * scores.reduce((sum, s) => sum + (s - yMean) ** 2, 0)) : 0

    const trend = slope > 0.005 ? 'improving' : slope < -0.005 ? 'declining' : 'stable'

    return { scores, trend, confidence: Math.min(1, rSquared) }
  }

  /**
   * 获取历史预测
   */
  getHistory(): QualityPrediction[] {
    return [...this.predictionHistory]
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private predictAllDimensions(input: QualityPredictionInput): Record<QualityPredictionDimension, number> {
    const content = input.content
    const prevAvg = input.previousScores
      ? input.previousScores.reduce((a, b) => a + b, 0) / input.previousScores.length
      : 0.5

    const predictions: Partial<Record<QualityPredictionDimension, number>> = {
      readability: this.predictReadability(content),
      engagement: this.predictEngagement(content),
      retention: this.predictRetention(content),
      emotional_peak: this.predictEmotionalPeak(content),
      pacing_score: this.predictPacing(content),
      character_appeal: this.predictCharacterAppeal(content),
      plot_coherence: this.predictPlotCoherence(content),
      prose_elegance: this.predictProseElegance(content),
    }

    // 结合历史趋势
    if (this.config.trendWeight > 0 && input.previousScores && input.previousScores.length > 0) {
      for (const dim of Object.keys(predictions) as QualityPredictionDimension[]) {
        predictions[dim] = predictions[dim]! * (1 - this.config.trendWeight) + prevAvg * this.config.trendWeight
      }
    }

    return predictions as Record<QualityPredictionDimension, number>
  }

  private predictReadability(content: string): number {
    const sentences = content.split(/[。！？\n]/).filter(s => s.trim())
    if (sentences.length === 0) return 0.5

    const avgLen = sentences.reduce((s, c) => s + c.length, 0) / sentences.length
    // 理想句子长度 15-40 字
    const idealMin = 15
    const idealMax = 40

    if (avgLen >= idealMin && avgLen <= idealMax) return 0.85
    if (avgLen < idealMin) return 0.5 + (avgLen / idealMin) * 0.35
    return Math.max(0.3, 1 - (avgLen - idealMax) / 60)
  }

  private predictEngagement(content: string): number {
    let score = 0.5

    // 检查钩子密度
    const hooks = /突然|竟然|居然|没想到|原来|难道|到底|究竟|为何|为什么/g
    const hookCount = (content.match(hooks) || []).length
    const paragraphs = content.split(/\n\n/).filter(p => p.trim())
    const hookDensity = paragraphs.length > 0 ? hookCount / paragraphs.length : 0
    score += Math.min(0.3, hookDensity * 0.15)

    // 检查对话互动
    const dialogueMarkers = (content.match(/[""「」『』"']/g) || []).length
    score += Math.min(0.2, dialogueMarkers / 100)

    return Math.min(1, score)
  }

  private predictRetention(content: string): number {
    let score = 0.5

    // 结尾钩子检查
    const paragraphs = content.split(/\n\n/).filter(p => p.trim())
    if (paragraphs.length > 0) {
      const lastPara = paragraphs[paragraphs.length - 1]
      const hasHook = /悬念|疑问|未解|等待|即将|将要|下一步|接下来|之后|后面|前方|远方|深处|黑暗中|未知/.test(lastPara)
      if (hasHook) score += 0.2

      // 检查结尾是否有 cliffhanger
      const hasCliffhanger = /突然|猛地|骤然|就在这时|话还没说完|还没等|没来得及|刚要|正要/.test(lastPara)
      if (hasCliffhanger) score += 0.15
    }

    // 检查信息缺口（让读者想知道更多）
    const infoGaps = /隐约|模糊|不完全|似乎|好像|仿佛|某种|某个|不知|不明|未解/.test(content)
    if (infoGaps) score += 0.15

    return Math.min(1, score)
  }

  private predictEmotionalPeak(content: string): number {
    const emotions = /泪|痛|心|颤抖|拥抱|愤怒|悲伤|喜悦|恐惧|绝望|希望|感动|激动|温暖|冰冷|孤独|幸福|牺牲|拯救|守护|信念|决心|誓言/g
    const emotionCount = (content.match(emotions) || []).length
    const sentences = content.split(/[。！？\n]/).filter(s => s.trim())
    const density = sentences.length > 0 ? emotionCount / sentences.length : 0

    // 0.3 以上为高情感密度
    return Math.min(1, density * 2)
  }

  private predictPacing(content: string): number {
    const sentences = content.split(/[。！？\n]/).filter(s => s.trim())
    if (sentences.length === 0) return 0.5

    const avgLen = sentences.reduce((s, c) => s + c.length, 0) / sentences.length
    const shortSentenceRatio = sentences.filter(s => s.length < 15).length / sentences.length

    // 短句比例高 = 快节奏
    return Math.min(1, shortSentenceRatio * 1.5 + (1 - avgLen / 60) * 0.5)
  }

  private predictCharacterAppeal(content: string): number {
    let score = 0.5

    // 检查角色主动性
    const activeVerbs = /决定|选择|行动|出发|冲|攻击|守护|拯救|挑战|对抗|拒绝|坚持|相信/g
    const activeCount = (content.match(activeVerbs) || []).length
    score += Math.min(0.2, activeCount / 50)

    // 检查角色独特性
    const uniqueTraits = /独|特殊|唯一|不同|例外|前所未有|惊人|恐怖|可怕|强大|弱小|奇怪|异常/g
    const traitCount = (content.match(uniqueTraits) || []).length
    score += Math.min(0.15, traitCount / 30)

    // 检查角色成长
    const growth = /突破|提升|改变|成长|领悟|觉醒|蜕变|进化|超越|不再是|终于|学会/g
    const growthCount = (content.match(growth) || []).length
    score += Math.min(0.15, growthCount / 20)

    return Math.min(1, score)
  }

  private predictPlotCoherence(content: string): number {
    let score = 0.7 // 基础分较高，因为大部分内容自然是连贯的

    // 检查因果关系标记
    const causality = /因为|所以|因此|于是|导致|结果|造成|引发|触发|引起|从而/g
    const causalityCount = (content.match(causality) || []).length
    score += Math.min(0.15, causalityCount / 30)

    // 检查时间逻辑
    const timeLogic = /先|然后|接着|之后|随后|紧接着|与此同时|同时|之前|之后|此后|从此/g
    const timeCount = (content.match(timeLogic) || []).length
    score += Math.min(0.15, timeCount / 30)

    return Math.min(1, score)
  }

  private predictProseElegance(content: string): number {
    let score = 0.5

    // 检查修辞手法
    const rhetoric = /如|似|若|仿佛|好像|宛如|宛若|犹如|如同|好比|像|一般|般|一样|如同/g
    const rhetoricCount = (content.match(rhetoric) || []).length
    score += Math.min(0.2, rhetoricCount / 40)

    // 检查感官描写
    const sensory = /看|听|闻|触|感觉|痛|冷|热|声|光|味|气|颜色|声音|气味|温度|触感/g
    const sensoryCount = (content.match(sensory) || []).length
    score += Math.min(0.15, sensoryCount / 30)

    // 检查词汇多样性
    const uniqueChars = new Set(content.split('')).size
    score += Math.min(0.15, uniqueChars / 500)

    return Math.min(1, score)
  }

  /**
   * 计算综合评分
   */
  private calculateOverallScore(dimensions: Record<QualityPredictionDimension, number>): number {
    const weights: Record<QualityPredictionDimension, number> = {
      readability: 0.10,
      engagement: 0.20,
      retention: 0.15,
      emotional_peak: 0.15,
      pacing_score: 0.10,
      character_appeal: 0.10,
      plot_coherence: 0.10,
      prose_elegance: 0.10,
    }

    let total = 0
    let weightSum = 0
    for (const [dim, weight] of Object.entries(weights)) {
      total += (dimensions[dim as QualityPredictionDimension] || 0) * weight
      weightSum += weight
    }

    return weightSum > 0 ? total / weightSum : 0.5
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(input: QualityPredictionInput): number {
    let confidence = 0.6

    // 内容越长，置信度越高
    if (input.content.length > 500) confidence += 0.1
    if (input.content.length > 2000) confidence += 0.1

    // 有历史趋势，置信度更高
    if (input.previousScores && input.previousScores.length > 3) confidence += 0.1
    if (input.previousScores && input.previousScores.length > 10) confidence += 0.1

    return Math.min(1, confidence)
  }

  /**
   * 检测风险
   */
  private detectRisks(dimensions: Record<QualityPredictionDimension, number>): QualityRisk[] {
    const risks: QualityRisk[] = []

    const riskDefinitions: Array<{ dimension: QualityPredictionDimension; threshold: number; description: string; mitigation: string }> = [
      {
        dimension: 'readability',
        threshold: this.config.riskThreshold,
        description: '可读性偏低，句子可能过长或过短，影响阅读流畅度',
        mitigation: '调整句子长度至15-40字区间，增加段落分隔',
      },
      {
        dimension: 'engagement',
        threshold: this.config.riskThreshold,
        description: '吸引力不足，缺乏钩子和悬念，读者可能失去兴趣',
        mitigation: '增加悬念元素、对话互动和情节转折',
      },
      {
        dimension: 'retention',
        threshold: this.config.riskThreshold,
        description: '留存率预测偏低，章节结尾缺乏追读钩子',
        mitigation: '在章节结尾设置悬念、未解之谜或即将到来的危机',
      },
      {
        dimension: 'emotional_peak',
        threshold: this.config.riskThreshold,
        description: '情感冲击力不足，缺少情感高潮和共鸣点',
        mitigation: '增加情感关键时刻、角色内心独白和情感渲染',
      },
      {
        dimension: 'pacing_score',
        threshold: this.config.riskThreshold,
        description: '节奏评分偏低，可能过于拖沓或过于急促',
        mitigation: '根据场景需求调整节奏：高潮加速、过渡放缓',
      },
      {
        dimension: 'character_appeal',
        threshold: this.config.riskThreshold,
        description: '角色魅力不足，缺少主动性和成长弧线',
        mitigation: '强化角色的主动性决策、独特特质和成长历程',
      },
      {
        dimension: 'plot_coherence',
        threshold: this.config.riskThreshold,
        description: '情节连贯性不足，因果关系和时间逻辑可能断裂',
        mitigation: '检查因果链条，确保每个事件都有前因后果',
      },
      {
        dimension: 'prose_elegance',
        threshold: this.config.riskThreshold,
        description: '文笔优雅度不足，缺少修辞和感官描写',
        mitigation: '增加比喻、通感等修辞手法，丰富感官描写',
      },
    ]

    for (const def of riskDefinitions) {
      if (dimensions[def.dimension] < def.threshold) {
        risks.push({
          dimension: def.dimension,
          severity: 1 - dimensions[def.dimension],
          description: def.description,
          mitigation: def.mitigation,
        })
      }
    }

    return risks.sort((a, b) => b.severity - a.severity)
  }

  /**
   * 生成改进建议
   */
  private generateSuggestions(
    risks: QualityRisk[],
    dimensions: Record<QualityPredictionDimension, number>,
  ): string[] {
    const suggestions: string[] = []

    // 从风险中提取建议
    for (const risk of risks.slice(0, 3)) {
      suggestions.push(risk.mitigation)
    }

    // 找出最弱维度
    const weakest = Object.entries(dimensions)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 2)

    for (const [dim, score] of weakest) {
      if (score < 0.5) {
        const dimLabels: Record<string, string> = {
          readability: '可读性',
          engagement: '吸引力',
          retention: '留存率',
          emotional_peak: '情感冲击',
          pacing_score: '节奏',
          character_appeal: '角色魅力',
          plot_coherence: '情节连贯',
          prose_elegance: '文笔',
        }
        suggestions.push(`重点提升「${dimLabels[dim] || dim}」（当前${(score * 100).toFixed(0)}分）`)
      }
    }

    return suggestions
  }
}