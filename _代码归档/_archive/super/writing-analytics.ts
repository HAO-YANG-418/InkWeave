// ============================================================
// 写作分析器 — GWE v6.0 超人类层
// 核心能力：对全书进行多维度统计分析，发现规律和异常
// 让AI像一个专业编辑一样宏观洞察作品——不仅看一章，而是看全局
// ============================================================

import {
  type AnalyticsDimension,
  type AnalyticsRequest,
  type ChapterAnalytics,
  type BookAnalyticsReport,
  type BookStatistics,
  type WritingAnalyticsConfig,
  DEFAULT_WRITING_ANALYTICS_CONFIG,
} from './types'

// ============================================================
// 写作分析器
// ============================================================

export class WritingAnalytics {
  private config: WritingAnalyticsConfig
  private chapterAnalytics: Map<number, ChapterAnalytics> = new Map()
  private bookStats: BookStatistics | null = null

  constructor(config?: Partial<WritingAnalyticsConfig>) {
    this.config = { ...DEFAULT_WRITING_ANALYTICS_CONFIG, ...config }
  }

  /**
   * 分析单章 — 核心方法
   */
  analyzeChapter(request: AnalyticsRequest): ChapterAnalytics {
    const { content, chapterNumber, bookStats } = request

    const dimensions = this.calculateAllDimensions(content)
    const deviation = this.calculateDeviation(dimensions, bookStats)
    const highlights = this.findHighlights(dimensions, deviation)
    const weaknesses = this.findWeaknesses(dimensions, deviation)
    const changes = this.calculateChanges(dimensions, chapterNumber)

    const analytics: ChapterAnalytics = {
      chapterNumber,
      dimensions,
      deviation,
      highlights,
      weaknesses,
      changes,
    }

    this.chapterAnalytics.set(chapterNumber, analytics)
    return analytics
  }

  /**
   * 批量分析
   */
  analyzeBatch(chapters: AnalyticsRequest[]): ChapterAnalytics[] {
    return chapters.map(ch => this.analyzeChapter(ch))
  }

  /**
   * 生成全书分析报告
   */
  generateBookReport(bookId: string): BookAnalyticsReport {
    const chapters = Array.from(this.chapterAnalytics.values())
      .sort((a, b) => a.chapterNumber - b.chapterNumber)

    if (chapters.length === 0) {
      return {
        bookId,
        chapterCount: 0,
        totalWords: 0,
        averages: {} as Record<AnalyticsDimension, number>,
        trends: {} as Record<AnalyticsDimension, 'rising' | 'falling' | 'stable'>,
        anomalies: [],
        recommendations: [],
      }
    }

    // 计算均值
    const averages = this.calculateAverages(chapters)

    // 计算趋势
    const trends = this.calculateTrends(chapters)

    // 检测异常
    const anomalies = this.detectAnomalies(chapters, averages)

    // 生成建议
    const recommendations = this.generateRecommendations(averages, trends, anomalies)

    const report: BookAnalyticsReport = {
      bookId,
      chapterCount: chapters.length,
      totalWords: chapters.reduce((sum, _ch) => sum, 0),
      averages,
      trends,
      anomalies,
      recommendations,
    }

    return report
  }

  /**
   * 获取章节分析
   */
  getChapterAnalytics(chapterNumber: number): ChapterAnalytics | undefined {
    return this.chapterAnalytics.get(chapterNumber)
  }

  /**
   * 获取所有章节分析
   */
  getAllChapterAnalytics(): ChapterAnalytics[] {
    return Array.from(this.chapterAnalytics.values())
      .sort((a, b) => a.chapterNumber - b.chapterNumber)
  }

  /**
   * 更新全书统计
   */
  updateBookStats(stats: BookStatistics): void {
    this.bookStats = stats
  }

  /**
   * 获取全书统计
   */
  getBookStats(): BookStatistics | null {
    return this.bookStats
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private calculateAllDimensions(content: string): Record<AnalyticsDimension, number> {
    return {
      vocabulary_diversity: this.calcVocabDiversity(content),
      sentence_complexity: this.calcSentenceComplexity(content),
      paragraph_rhythm: this.calcParagraphRhythm(content),
      dialogue_ratio: this.calcDialogueRatio(content),
      description_ratio: this.calcDescriptionRatio(content),
      action_ratio: this.calcActionRatio(content),
      emotion_frequency: this.calcEmotionFrequency(content),
      sensory_distribution: this.calcSensoryDistribution(content),
      technique_usage: this.calcTechniqueUsage(content),
      pacing_curve: this.calcPacingCurve(content),
    }
  }

  private calcVocabDiversity(content: string): number {
    if (!content || content.length === 0) return 0
    const chars = content.split('')
    const uniqueChars = new Set(chars)
    const ttr = uniqueChars.size / chars.length // Type-Token Ratio
    return Math.min(1, ttr * 5) // 缩放
  }

  private calcSentenceComplexity(content: string): number {
    const sentences = content.split(/[。！？\n]/).filter(s => s.trim())
    if (sentences.length === 0) return 0.5

    const avgLen = sentences.reduce((s, c) => s + c.length, 0) / sentences.length
    const stdDev = Math.sqrt(
      sentences.reduce((sum, s) => sum + (s.length - avgLen) ** 2, 0) / sentences.length
    )

    // 复杂度 = 平均长度 + 标准差
    return Math.min(1, (avgLen / 60) * 0.5 + (stdDev / 30) * 0.5)
  }

  private calcParagraphRhythm(content: string): number {
    const paragraphs = content.split(/\n\n/).filter(p => p.trim())
    if (paragraphs.length < 2) return 0.5

    const lengths = paragraphs.map(p => p.length)
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length
    const variance = lengths.reduce((sum, l) => sum + (l - avg) ** 2, 0) / lengths.length

    // 适中的方差 = 好节奏，过大或过小都不好
    const idealVariance = 1000
    return Math.min(1, 1 - Math.abs(variance - idealVariance) / idealVariance)
  }

  private calcDialogueRatio(content: string): number {
    const dialogueMarkers = (content.match(/[""「」『』"']/g) || []).length
    const totalChars = content.length
    return Math.min(1, dialogueMarkers / Math.max(1, totalChars / 20))
  }

  private calcDescriptionRatio(content: string): number {
    const descriptionWords = /景色|风光|建筑|环境|天空|大地|山脉|河流|树木|花草|云雾|日月|星辰|光芒|阴影|温度|气味|颜色|形状|大小|远近|高低/g
    const descCount = (content.match(descriptionWords) || []).length
    const sentences = content.split(/[。！？\n]/).filter(s => s.trim())
    return Math.min(1, descCount / Math.max(1, sentences.length * 0.3))
  }

  private calcActionRatio(content: string): number {
    const actionWords = /攻击|爆发|冲向|斩|轰|碎|杀|全力|跳|跑|飞|击|刺|劈|砍|跃|闪|退|进|转|翻|冲|抓|握|推|拉|踢|打|挥|舞|射|放|收|挡|防|躲|避/g
    const actionCount = (content.match(actionWords) || []).length
    const sentences = content.split(/[。！？\n]/).filter(s => s.trim())
    return Math.min(1, actionCount / Math.max(1, sentences.length * 0.3))
  }

  private calcEmotionFrequency(content: string): number {
    const emotions = /泪|痛|心|颤抖|拥抱|愤怒|悲伤|喜悦|恐惧|绝望|希望|感动|激动|温暖|冰冷|孤独|幸福|恨|爱|怒|哀|乐|怕|惊|忧|思|念/g
    const emotionCount = (content.match(emotions) || []).length
    const sentences = content.split(/[。！？\n]/).filter(s => s.trim())
    return Math.min(1, emotionCount / Math.max(1, sentences.length * 0.5))
  }

  private calcSensoryDistribution(content: string): number {
    const senses: Record<string, RegExp> = {
      visual: /看|见|光|暗|明|色|彩|红|蓝|绿|白|黑|黄|紫|青|形状|大小|远近|高低/g,
      auditory: /听|声|响|音|噪|静|鸣|吼|叫|喊|唱|说|话|语|低语|耳语|轰鸣/g,
      tactile: /触|摸|碰|冷|热|温|凉|硬|软|粗|滑|刺|痛|痒|麻|湿|干/g,
      olfactory: /闻|嗅|香|臭|气|味|芬芳|腐臭|腥|甜|苦|酸|辣/g,
    }

    let coveredSenses = 0
    for (const pattern of Object.values(senses)) {
      if (pattern.test(content)) coveredSenses++
    }

    return coveredSenses / 4
  }

  private calcTechniqueUsage(content: string): number {
    // 检查多种技法的使用
    const techniques: Record<string, RegExp> = {
      metaphor: /如|似|若|仿佛|好像|宛如|宛若|犹如|如同|好比/g,
      personification: /仿佛.*在|好像.*在|像.*一样.*在/g,
      repetition: /(\b\w{2,4}\b).*\1.*\1/g,
      contrast: /但|却|然而|可是|不过|反而|相反|对比|比较/g,
      foreshadow: /暗示|预示|预兆|征兆|迹象|伏笔|铺垫|埋下/g,
    }

    let usedCount = 0
    for (const pattern of Object.values(techniques)) {
      if (pattern.test(content)) usedCount++
    }

    return usedCount / Object.keys(techniques).length
  }

  private calcPacingCurve(content: string): number {
    const sentences = content.split(/[。！？\n]/).filter(s => s.trim())
    if (sentences.length < 5) return 0.5

    const lengths = sentences.map(s => s.length)

    // 检查节奏变化——好的节奏应该有快有慢
    let changes = 0
    for (let i = 1; i < lengths.length; i++) {
      if (Math.abs(lengths[i] - lengths[i - 1]) > 10) {
        changes++
      }
    }

    const changeRate = changes / (lengths.length - 1)
    return Math.min(1, changeRate * 2)
  }

  /**
   * 计算与全书均值的偏差
   */
  private calculateDeviation(
    dimensions: Record<AnalyticsDimension, number>,
    bookStats?: BookStatistics,
  ): Record<AnalyticsDimension, number> {
    const deviation: Partial<Record<AnalyticsDimension, number>> = {}

    for (const [dim, value] of Object.entries(dimensions)) {
      const avg = bookStats?.dimensionAverages?.[dim as AnalyticsDimension]
      if (avg !== undefined) {
        deviation[dim as AnalyticsDimension] = value - avg
      } else {
        deviation[dim as AnalyticsDimension] = 0
      }
    }

    return deviation as Record<AnalyticsDimension, number>
  }

  /**
   * 找出显著特征
   */
  private findHighlights(
    dimensions: Record<AnalyticsDimension, number>,
    _deviation: Record<AnalyticsDimension, number>,
  ): string[] {
    const highlights: string[] = []
    const thresholds: Record<AnalyticsDimension, number> = {
      vocabulary_diversity: 0.7,
      sentence_complexity: 0.7,
      paragraph_rhythm: 0.7,
      dialogue_ratio: 0.6,
      description_ratio: 0.6,
      action_ratio: 0.6,
      emotion_frequency: 0.6,
      sensory_distribution: 0.6,
      technique_usage: 0.6,
      pacing_curve: 0.7,
    }

    const labels: Record<AnalyticsDimension, string> = {
      vocabulary_diversity: '词汇多样性',
      sentence_complexity: '句子复杂度',
      paragraph_rhythm: '段落节奏',
      dialogue_ratio: '对话占比',
      description_ratio: '描写占比',
      action_ratio: '动作占比',
      emotion_frequency: '情感频率',
      sensory_distribution: '感官分布',
      technique_usage: '技法使用',
      pacing_curve: '节奏曲线',
    }

    for (const [dim, value] of Object.entries(dimensions)) {
      const threshold = thresholds[dim as AnalyticsDimension] || 0.7
      if (value > threshold) {
        highlights.push(`${labels[dim as AnalyticsDimension]}优秀（${(value * 100).toFixed(0)}%）`)
      }
    }

    return highlights
  }

  /**
   * 找出弱点
   */
  private findWeaknesses(
    dimensions: Record<AnalyticsDimension, number>,
    _deviation: Record<AnalyticsDimension, number>,
  ): string[] {
    const weaknesses: string[] = []
    const thresholds: Record<AnalyticsDimension, number> = {
      vocabulary_diversity: 0.3,
      sentence_complexity: 0.2,
      paragraph_rhythm: 0.3,
      dialogue_ratio: 0.1,
      description_ratio: 0.1,
      action_ratio: 0.1,
      emotion_frequency: 0.1,
      sensory_distribution: 0.2,
      technique_usage: 0.2,
      pacing_curve: 0.2,
    }

    const labels: Record<AnalyticsDimension, string> = {
      vocabulary_diversity: '词汇多样性',
      sentence_complexity: '句子复杂度',
      paragraph_rhythm: '段落节奏',
      dialogue_ratio: '对话占比',
      description_ratio: '描写占比',
      action_ratio: '动作占比',
      emotion_frequency: '情感频率',
      sensory_distribution: '感官分布',
      technique_usage: '技法使用',
      pacing_curve: '节奏曲线',
    }

    const suggestions: Record<AnalyticsDimension, string> = {
      vocabulary_diversity: '丰富词汇库，避免重复用词',
      sentence_complexity: '增加句型变化，长短句交替',
      paragraph_rhythm: '调整段落长度，制造呼吸感',
      dialogue_ratio: '增加对话互动，展现角色性格',
      description_ratio: '增加环境描写，营造氛围',
      action_ratio: '增加动作描写，推动情节',
      emotion_frequency: '增加情感描写，增强共鸣',
      sensory_distribution: '丰富感官描写，增强沉浸感',
      technique_usage: '多使用修辞手法，提升文笔',
      pacing_curve: '调整节奏变化，避免单调',
    }

    for (const [dim, value] of Object.entries(dimensions)) {
      const threshold = thresholds[dim as AnalyticsDimension] || 0.3
      if (value < threshold) {
        weaknesses.push(`${labels[dim as AnalyticsDimension]}偏低（${(value * 100).toFixed(0)}%）——${suggestions[dim as AnalyticsDimension]}`)
      }
    }

    return weaknesses
  }

  /**
   * 计算与前一章的变化
   */
  private calculateChanges(
    dimensions: Record<AnalyticsDimension, number>,
    chapterNumber: number,
  ): Record<AnalyticsDimension, number> {
    const prev = this.chapterAnalytics.get(chapterNumber - 1)
    const changes: Partial<Record<AnalyticsDimension, number>> = {}

    for (const dim of Object.keys(dimensions) as AnalyticsDimension[]) {
      if (prev) {
        changes[dim] = dimensions[dim] - prev.dimensions[dim]
      } else {
        changes[dim] = 0
      }
    }

    return changes as Record<AnalyticsDimension, number>
  }

  /**
   * 计算均值
   */
  private calculateAverages(chapters: ChapterAnalytics[]): Record<AnalyticsDimension, number> {
    const averages: Partial<Record<AnalyticsDimension, number>> = {}
    const allDims: AnalyticsDimension[] = [
      'vocabulary_diversity', 'sentence_complexity', 'paragraph_rhythm',
      'dialogue_ratio', 'description_ratio', 'action_ratio',
      'emotion_frequency', 'sensory_distribution', 'technique_usage', 'pacing_curve',
    ]

    for (const dim of allDims) {
      averages[dim] = chapters.reduce((sum, ch) => sum + ch.dimensions[dim], 0) / chapters.length
    }

    return averages as Record<AnalyticsDimension, number>
  }

  /**
   * 计算趋势
   */
  private calculateTrends(chapters: ChapterAnalytics[]): Record<AnalyticsDimension, 'rising' | 'falling' | 'stable'> {
    const trends: Partial<Record<AnalyticsDimension, 'rising' | 'falling' | 'stable'>> = {}
    const allDims: AnalyticsDimension[] = [
      'vocabulary_diversity', 'sentence_complexity', 'paragraph_rhythm',
      'dialogue_ratio', 'description_ratio', 'action_ratio',
      'emotion_frequency', 'sensory_distribution', 'technique_usage', 'pacing_curve',
    ]
    const n = chapters.length

    for (const dim of allDims) {
      if (n < 2) {
        trends[dim] = 'stable'
        continue
      }

      const values = chapters.map(ch => ch.dimensions[dim])
      const firstHalf = values.slice(0, Math.floor(n / 2))
      const secondHalf = values.slice(Math.floor(n / 2))
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length

      const diff = secondAvg - firstAvg
      if (diff > 0.03) trends[dim] = 'rising'
      else if (diff < -0.03) trends[dim] = 'falling'
      else trends[dim] = 'stable'
    }

    return trends as Record<AnalyticsDimension, 'rising' | 'falling' | 'stable'>
  }

  /**
   * 检测异常
   */
  private detectAnomalies(
    chapters: ChapterAnalytics[],
    averages: Record<AnalyticsDimension, number>,
  ): { chapter: number; dimension: AnalyticsDimension; value: number; expected: number }[] {
    const anomalies: { chapter: number; dimension: AnalyticsDimension; value: number; expected: number }[] = []
    const allDims: AnalyticsDimension[] = [
      'vocabulary_diversity', 'sentence_complexity', 'paragraph_rhythm',
      'dialogue_ratio', 'description_ratio', 'action_ratio',
      'emotion_frequency', 'sensory_distribution', 'technique_usage', 'pacing_curve',
    ]

    for (const ch of chapters) {
      for (const dim of allDims) {
        const avg = averages[dim]
        const stdDev = this.calculateStdDev(chapters.map(c => c.dimensions[dim]), avg)
        const zScore = stdDev > 0 ? (ch.dimensions[dim] - avg) / stdDev : 0

        if (Math.abs(zScore) > this.config.anomalySensitivity) {
          anomalies.push({
            chapter: ch.chapterNumber,
            dimension: dim,
            value: ch.dimensions[dim],
            expected: avg,
          })
        }
      }
    }

    return anomalies
  }

  /**
   * 计算标准差
   */
  private calculateStdDev(values: number[], mean: number): number {
    if (values.length === 0) return 0
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
    return Math.sqrt(variance)
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    averages: Record<AnalyticsDimension, number>,
    trends: Record<AnalyticsDimension, 'rising' | 'falling' | 'stable'>,
    anomalies: { chapter: number; dimension: AnalyticsDimension; value: number; expected: number }[],
  ): string[] {
    const recommendations: string[] = []

    // 检查下降趋势
    for (const [dim, trend] of Object.entries(trends)) {
      if (trend === 'falling') {
        const dimLabels: Record<string, string> = {
          vocabulary_diversity: '词汇多样性',
          sentence_complexity: '句子复杂度',
          paragraph_rhythm: '段落节奏',
          dialogue_ratio: '对话占比',
          description_ratio: '描写占比',
          action_ratio: '动作占比',
          emotion_frequency: '情感频率',
          sensory_distribution: '感官分布',
          technique_usage: '技法使用',
          pacing_curve: '节奏曲线',
        }
        recommendations.push(`「${dimLabels[dim] || dim}」呈下降趋势，建议关注并调整`)
      }
    }

    // 检查异常章节
    if (anomalies.length > 0) {
      const topAnomalies = anomalies.slice(0, 3)
      for (const a of topAnomalies) {
        const direction = a.value > a.expected ? '偏高' : '偏低'
        recommendations.push(`第${a.chapter}章${a.dimension}异常${direction}（${(a.value * 100).toFixed(0)}% vs 均值${(a.expected * 100).toFixed(0)}%）`)
      }
    }

    // 检查低分维度
    const lowDims = Object.entries(averages)
      .filter(([_, v]) => v < 0.3)
      .map(([d]) => d)

    if (lowDims.length > 0) {
      recommendations.push(`以下维度整体偏低，建议作为长期提升目标：${lowDims.join('、')}`)
    }

    return recommendations
  }
}