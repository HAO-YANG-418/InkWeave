// ============================================================
// 多版本生成器 — GWE v6.0 超人类层
// 核心能力：同时生成多个风格/策略的版本，自动比较并推荐最佳版本
// 让AI在同一输入下展现多种可能性——超越单一路径的局限
// ============================================================

import {
  type VersionStrategy,
  type VersionRequest,
  type GeneratedVersion,
  type VersionComparison,
  type MultiVersionConfig,
  DEFAULT_MULTI_VERSION_CONFIG,
} from './types'

// ============================================================
// 策略定义
// ============================================================

interface StrategyDefinition {
  strategy: VersionStrategy
  label: string
  description: string
  /** 策略特征向量 */
  features: {
    sentenceLength: number   // 句子长度偏好 (0短~1长)
    detailLevel: number      // 细节密度 (0稀疏~1密集)
    emotionalIntensity: number // 情感强度 (0克制~1强烈)
    actionDensity: number    // 动作密度
    descriptionRatio: number // 描写占比
    dialogueRatio: number    // 对话占比
    vocabularyLevel: number  // 词汇复杂度
    pacing: number           // 节奏 (0慢~1快)
  }
}

const STRATEGY_DEFINITIONS: StrategyDefinition[] = [
  {
    strategy: 'conservative',
    label: '保守型',
    description: '稳健、安全、不出错，适合过渡章节',
    features: { sentenceLength: 0.5, detailLevel: 0.6, emotionalIntensity: 0.4, actionDensity: 0.3, descriptionRatio: 0.5, dialogueRatio: 0.3, vocabularyLevel: 0.5, pacing: 0.4 },
  },
  {
    strategy: 'bold',
    label: '大胆型',
    description: '冒险、突破、高冲击力，适合高潮章节',
    features: { sentenceLength: 0.3, detailLevel: 0.8, emotionalIntensity: 0.9, actionDensity: 0.8, descriptionRatio: 0.3, dialogueRatio: 0.2, vocabularyLevel: 0.7, pacing: 0.9 },
  },
  {
    strategy: 'emotional',
    label: '情感型',
    description: '注重情感渲染和共鸣，适合情感爆点',
    features: { sentenceLength: 0.6, detailLevel: 0.7, emotionalIntensity: 0.95, actionDensity: 0.1, descriptionRatio: 0.4, dialogueRatio: 0.4, vocabularyLevel: 0.6, pacing: 0.3 },
  },
  {
    strategy: 'action',
    label: '动作型',
    description: '快节奏、高密度战斗，适合战斗场景',
    features: { sentenceLength: 0.2, detailLevel: 0.5, emotionalIntensity: 0.6, actionDensity: 0.95, descriptionRatio: 0.2, dialogueRatio: 0.1, vocabularyLevel: 0.4, pacing: 0.95 },
  },
  {
    strategy: 'literary',
    label: '文学型',
    description: '重视文笔和修辞，适合氛围营造',
    features: { sentenceLength: 0.7, detailLevel: 0.9, emotionalIntensity: 0.5, actionDensity: 0.1, descriptionRatio: 0.7, dialogueRatio: 0.2, vocabularyLevel: 0.9, pacing: 0.2 },
  },
  {
    strategy: 'experimental',
    label: '实验型',
    description: '尝试新手法和结构，适合创新探索',
    features: { sentenceLength: 0.5, detailLevel: 0.5, emotionalIntensity: 0.5, actionDensity: 0.5, descriptionRatio: 0.5, dialogueRatio: 0.5, vocabularyLevel: 0.8, pacing: 0.5 },
  },
]

// ============================================================
// 多版本生成器
// ============================================================

export class MultiVersionGenerator {
  private config: MultiVersionConfig
  private versionHistory: GeneratedVersion[] = []

  constructor(config?: Partial<MultiVersionConfig>) {
    this.config = { ...DEFAULT_MULTI_VERSION_CONFIG, ...config }
  }

  /**
   * 生成多个版本
   * 注意：实际的AI生成由外部调用方完成，本方法返回策略指导
   */
  generateStrategies(content: string, context: string, count?: number): VersionRequest[] {
    const actualCount = count || this.config.defaultCount
    const strategies = this.selectStrategies(actualCount)

    return strategies.map(strategy => ({
      content,
      strategy,
      context,
      constraints: this.generateConstraints(strategy),
    }))
  }

  /**
   * 评估生成版本
   */
  evaluateVersion(version: GeneratedVersion, request: VersionRequest): GeneratedVersion {
    const strategyDef = STRATEGY_DEFINITIONS.find(s => s.strategy === version.strategy)
    if (!strategyDef) return version

    // 评估策略对齐度
    const strategyAlignment = this.calculateStrategyAlignment(version.content, strategyDef)

    // 评估质量
    const qualityScore = this.calculateQualityScore(version.content, request)

    // 评估差异度
    const divergence = this.calculateDivergence(version.content, request.content)

    return {
      ...version,
      qualityScore,
      strategyAlignment,
      divergence,
    }
  }

  /**
   * 比较版本并推荐
   */
  compareVersions(versions: GeneratedVersion[]): VersionComparison {
    if (versions.length === 0) {
      return { versions: [], recommended: '', dimensions: {}, analysis: '无版本可供比较' }
    }

    // 计算各维度得分
    const dimensions = this.buildComparisonDimensions(versions)

    // 综合评分排序
    const ranked = [...versions].sort((a, b) => {
      const scoreA = a.qualityScore * 0.5 + a.strategyAlignment * 0.3 + (1 - a.divergence) * 0.2
      const scoreB = b.qualityScore * 0.5 + b.strategyAlignment * 0.3 + (1 - b.divergence) * 0.2
      return scoreB - scoreA
    })

    // 生成分析
    const analysis = this.generateComparisonAnalysis(ranked)

    return {
      versions: ranked,
      recommended: ranked[0].id,
      dimensions,
      analysis,
    }
  }

  /**
   * 获取策略提示词
   */
  getStrategyPrompt(strategy: VersionStrategy): string {
    const def = STRATEGY_DEFINITIONS.find(s => s.strategy === strategy)
    if (!def) return ''

    return `【${def.label}】${def.description}\n` +
      `特征要求：句子长度${def.features.sentenceLength < 0.4 ? '偏短' : def.features.sentenceLength > 0.6 ? '偏长' : '适中'}，` +
      `细节密度${def.features.detailLevel < 0.4 ? '稀疏' : def.features.detailLevel > 0.6 ? '密集' : '适中'}，` +
      `情感强度${def.features.emotionalIntensity < 0.4 ? '克制' : def.features.emotionalIntensity > 0.6 ? '强烈' : '适中'}，` +
      `节奏${def.features.pacing < 0.4 ? '舒缓' : def.features.pacing > 0.6 ? '快速' : '适中'}`
  }

  /**
   * 获取统计信息
   */
  getStats(): { totalVersions: number; byStrategy: Record<string, number>; avgQuality: number } {
    const totalVersions = this.versionHistory.length
    const byStrategy: Record<string, number> = {}
    const avgQuality = totalVersions > 0
      ? this.versionHistory.reduce((sum, v) => sum + v.qualityScore, 0) / totalVersions
      : 0

    for (const v of this.versionHistory) {
      byStrategy[v.strategy] = (byStrategy[v.strategy] || 0) + 1
    }

    return { totalVersions, byStrategy, avgQuality }
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 选择策略组合
   */
  private selectStrategies(count: number): VersionStrategy[] {
    const all = STRATEGY_DEFINITIONS.map(s => s.strategy)

    // 如果需要生成所有策略
    if (count >= all.length) return [...all]

    // 选择多样化的策略组合
    const selected: VersionStrategy[] = []
    const remaining = [...all]

    // 优先选择极端策略（大胆、情感、动作）+ 保守
    const priorities: VersionStrategy[] = ['bold', 'emotional', 'action', 'conservative']
    for (const p of priorities) {
      if (selected.length >= count) break
      const idx = remaining.indexOf(p)
      if (idx >= 0) {
        selected.push(p)
        remaining.splice(idx, 1)
      }
    }

    // 补充剩余
    while (selected.length < count && remaining.length > 0) {
      const idx = Math.floor(Math.random() * remaining.length)
      selected.push(remaining.splice(idx, 1)[0])
    }

    return selected
  }

  /**
   * 生成策略约束
   */
  private generateConstraints(strategy: VersionStrategy): string[] {
    const def = STRATEGY_DEFINITIONS.find(s => s.strategy === strategy)
    if (!def) return []

    const constraints: string[] = []

    if (def.features.sentenceLength < 0.4) constraints.push('短句为主，每句不超过20字')
    if (def.features.sentenceLength > 0.6) constraints.push('允许长句，每段至少一个复合句')
    if (def.features.emotionalIntensity > 0.8) constraints.push('强化情感描写，每个场景至少一个情感锚点')
    if (def.features.actionDensity > 0.8) constraints.push('动作描写密集，每段应包含行动')
    if (def.features.pacing > 0.8) constraints.push('快速推进，减少过渡段落')

    return constraints
  }

  /**
   * 计算策略对齐度
   */
  private calculateStrategyAlignment(content: string, strategy: StrategyDefinition): number {
    const f = strategy.features

    // 基于文本特征计算对齐度
    const sentences = content.split(/[。！？\n]/).filter(s => s.trim())
    const avgSentenceLen = sentences.length > 0
      ? sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length
      : 0

    // 句子长度对齐
    const sentenceLenScore = 1 - Math.abs(
      (avgSentenceLen / 50) - f.sentenceLength
    )

    // 情感词密度
    const emotionWords = this.countEmotionWords(content) / Math.max(1, sentences.length)
    const emotionScore = 1 - Math.abs(emotionWords - f.emotionalIntensity * 0.3)

    // 动作词密度
    const actionWords = this.countActionWords(content) / Math.max(1, sentences.length)
    const actionScore = 1 - Math.abs(actionWords - f.actionDensity * 0.3)

    return (sentenceLenScore * 0.4 + emotionScore * 0.3 + actionScore * 0.3)
  }

  /**
   * 计算质量评分
   */
  private calculateQualityScore(content: string, _request: VersionRequest): number {
    const sentences = content.split(/[。！？\n]/).filter(s => s.trim())
    if (sentences.length === 0) return 0

    let score = 0.6 // 基础分

    // 长度适中加分
    const totalLen = content.length
    if (totalLen > 500 && totalLen < 5000) score += 0.1
    if (totalLen > 1000 && totalLen < 3000) score += 0.1

    // 段落多样化加分
    const paragraphLengths = content.split(/\n\n/).map(p => p.length)
    if (paragraphLengths.length > 3) {
      const avg = paragraphLengths.reduce((a, b) => a + b, 0) / paragraphLengths.length
      const variance = paragraphLengths.reduce((sum, l) => sum + (l - avg) ** 2, 0) / paragraphLengths.length
      if (variance > 100) score += 0.1
    }

    return Math.min(1, score)
  }

  /**
   * 计算与原始内容的差异度
   */
  private calculateDivergence(newContent: string, originalContent: string): number {
    if (!originalContent) return 1

    const wordsA = new Set(newContent.split(''))
    const wordsB = new Set(originalContent.split(''))
    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)))
    const union = new Set([...wordsA, ...wordsB])

    return 1 - (intersection.size / union.size)
  }

  /**
   * 构建比较维度
   */
  private buildComparisonDimensions(versions: GeneratedVersion[]): Record<string, Record<string, number>> {
    const dimensions: Record<string, Record<string, number>> = {}

    for (const v of versions) {
      dimensions[v.id] = {
        '质量评分': v.qualityScore,
        '策略对齐': v.strategyAlignment,
        '创新度': 1 - v.divergence,
        '综合推荐': v.qualityScore * 0.5 + v.strategyAlignment * 0.3 + (1 - v.divergence) * 0.2,
      }
    }

    return dimensions
  }

  /**
   * 生成比较分析
   */
  private generateComparisonAnalysis(ranked: GeneratedVersion[]): string {
    if (ranked.length === 0) return ''

    const best = ranked[0]
    const bestLabel = STRATEGY_DEFINITIONS.find(s => s.strategy === best.strategy)?.label || best.strategy

    let analysis = `推荐使用「${bestLabel}」版本（${best.id}）：`
    analysis += `质量评分 ${(best.qualityScore * 100).toFixed(0)}%, `
    analysis += `策略对齐度 ${(best.strategyAlignment * 100).toFixed(0)}%, `
    analysis += `创新度 ${((1 - best.divergence) * 100).toFixed(0)}%。`

    if (ranked.length > 1) {
      const second = ranked[1]
      const secondLabel = STRATEGY_DEFINITIONS.find(s => s.strategy === second.strategy)?.label || second.strategy
      analysis += `备选方案：「${secondLabel}」版本。`
    }

    return analysis
  }

  private countEmotionWords(content: string): number {
    const emotions = /泪|痛|心|颤抖|拥抱|愤怒|悲伤|喜悦|恐惧|绝望|希望|感动|激动|温暖|冰冷|孤独|幸福/g
    return (content.match(emotions) || []).length
  }

  private countActionWords(content: string): number {
    const actions = /攻击|爆发|冲向|斩|轰|碎|杀|全力|跳|跑|飞|击|刺|劈|砍|跃|闪|退|进|转|翻|冲/g
    return (content.match(actions) || []).length
  }
}