// ============================================================
// 学习桥接器 — GWE v6.1
// 核心能力：连接 FeedbackLoop / PreferenceTracker / StyleLearner
// 到 WritingEngine，实现"越用越像你"的持续进化
//
// 关键闭环：
//   用户编辑 → FeedbackLoop 记录 → PreferenceTracker 更新
//   → StyleLearner 提取规律 → WritingEngine 下次避开
// ============================================================

import { FeedbackLoop } from '../learning/feedback-loop'
import type { StyleFingerprint } from '../learning/types'
import { PreferenceTracker } from '../learning/preference-tracker'
import { StyleLearner } from '../learning/style-learner'
import type { DeepStyleProfile } from '../learning/style-learner'
import type { ReflectionInput, ReflectionResult } from '../reflection/types'

// ============================================================
// 桥接配置
// ============================================================

export interface LearningBridgeConfig {
  /** 是否启用自动学习 */
  enabled: boolean
  /** 最小反馈数后才启用预测 */
  minFeedbackForPrediction: number
  /** 偏好追踪采样间隔（每N次操作采样一次） */
  sampleInterval: number
  /** 风格画像更新间隔（每N章更新一次） */
  styleUpdateInterval: number
}

export const DEFAULT_LEARNING_BRIDGE_CONFIG: LearningBridgeConfig = {
  enabled: true,
  minFeedbackForPrediction: 5,
  sampleInterval: 3,
  styleUpdateInterval: 5,
}

// ============================================================
// 学习桥接器
// ============================================================

export class LearningBridge {
  private feedbackLoop: FeedbackLoop
  private preferenceTracker: PreferenceTracker
  private styleLearner: StyleLearner
  private config: LearningBridgeConfig

  private operationCount = 0
  private chapterCount = 0
  private lastStyleProfile: DeepStyleProfile | null = null
  private reflectionHistory: Array<{ chapter: number; score: number; concerns: string[] }> = []

  constructor(
    feedbackLoop: FeedbackLoop,
    preferenceTracker: PreferenceTracker,
    styleLearner: StyleLearner,
    config?: Partial<LearningBridgeConfig>,
  ) {
    this.feedbackLoop = feedbackLoop
    this.preferenceTracker = preferenceTracker
    this.styleLearner = styleLearner
    this.config = { ...DEFAULT_LEARNING_BRIDGE_CONFIG, ...config }
  }

  // ============================================================
  // 用户编辑反馈 — 核心入口
  // ============================================================

  /**
   * 记录用户编辑操作
   * 每次用户删除/修改/重写时调用
   */
  recordEdit(params: {
    original: string
    modified: string
    chapterNumber: number
    note?: string
    position?: number
  }): void {
    if (!this.config.enabled) return

    this.operationCount++

    // 1. 记录到 FeedbackLoop
    this.feedbackLoop.recordEdit(
      params.original,
      params.modified,
      params.chapterNumber,
      params.note,
      params.position,
    )

    // 2. 定期采样到 PreferenceTracker
    if (this.operationCount % this.config.sampleInterval === 0) {
      this.samplePreference(params.modified, params.chapterNumber)
    }
  }

  /**
   * 记录用户明确接受
   */
  recordAccept(chapterNumber: number, content: string): void {
    if (!this.config.enabled) return
    this.feedbackLoop.recordAccept(chapterNumber, content)
  }

  /**
   * 记录用户明确拒绝
   */
  recordReject(chapterNumber: number, content: string, reason?: string): void {
    if (!this.config.enabled) return
    this.feedbackLoop.recordReject(chapterNumber, content, reason)
  }

  /**
   * 记录反思结果
   */
  recordReflection(_input: ReflectionInput, result: ReflectionResult): void {
    this.reflectionHistory.push({
      chapter: _input.chapterNumber || 0,
      score: result.overallScore,
      concerns: result.concerns.map(c => c.description),
    })

    if (this.reflectionHistory.length > 20) {
      this.reflectionHistory = this.reflectionHistory.slice(-20)
    }
  }

  // ============================================================
  // 写作前预测 — 给引擎用的接口
  // ============================================================

  /**
   * 获取写作前警告
   * 在 WritingEngine 构建 prompt 前调用
   */
  getPreWriteWarnings(): string[] {
    const warnings: string[] = []

    if (!this.config.enabled) return warnings
    if (this.operationCount < this.config.minFeedbackForPrediction) return warnings

    // 1. 偏好追踪趋势
    const profile = this.feedbackLoop.getProfile()
    if (profile) {
      const trend = this.preferenceTracker.getTrend('sentenceLength', 10)
      if (trend.direction !== 'stable') {
        warnings.push(`趋势预警：句子长度${trend.direction === 'falling' ? '持续缩短' : '持续增长'}（${trend.description}）`)
      }
    }

    // 2. 突变警告
    const alerts = this.preferenceTracker.getAlerts(3)
    for (const alert of alerts) {
      const changeLabel = alert.changePercent > 0 ? '上升' : '下降'
      warnings.push(`偏好突变：${alert.dimension} ${changeLabel}${Math.abs(alert.changePercent).toFixed(0)}%（${alert.severity}）`)
    }

    // 3. 反思趋势
    if (this.reflectionHistory.length >= 3) {
      const recent = this.reflectionHistory.slice(-3)
      const avgScore = recent.reduce((s, r) => s + r.score, 0) / recent.length
      if (avgScore < 0.5) {
        const topConcern = recent[recent.length - 1].concerns[0] || '未知'
        warnings.push(`最近3章质量评分偏低（${(avgScore * 100).toFixed(0)}%），建议检查：${topConcern}`)
      }
    }

    return warnings
  }

  /**
   * 获取风格注入提示词
   */
  getStyleInjection(): string {
    if (!this.config.enabled || !this.lastStyleProfile) return ''

    const profile = this.lastStyleProfile
    const parts: string[] = []

    if (profile.rhythm) {
      const sr = profile.rhythm
      if (sr.avgLength < 20) parts.push('偏好短句节奏')
      else if (sr.avgLength > 40) parts.push('偏好长句铺陈')
      if (sr.variance > 15) parts.push('句子长度变化丰富')
    }

    if (profile.paragraph) {
      const ps = profile.paragraph
      if (ps.avgLength < 100) parts.push('段落短小精悍')
      else if (ps.avgLength > 200) parts.push('段落丰厚充实')
    }

    if (profile.rhetoric) {
      const r = profile.rhetoric
      if (r.metaphorFrequency > 0.3) parts.push('善用比喻')
      if (r.personificationFrequency > 0.3) parts.push('善用拟人')
    }

    if (parts.length === 0) return ''
    return `【学习到的风格偏好】${parts.join('；')}。请保持这些风格特征。`
  }

  /**
   * 获取学习状态摘要
   */
  getLearningSummary(): {
    totalFeedback: number
    trendReport: string
    styleProfile: string | null
    reflectionAvg: number
  } {
    return {
      totalFeedback: this.operationCount,
      trendReport: this.preferenceTracker.generateTrendReport(),
      styleProfile: this.lastStyleProfile
        ? `句子: ${this.lastStyleProfile.rhythm.avgLength.toFixed(0)}字/句, ` +
          `段落: ${this.lastStyleProfile.paragraph.avgLength.toFixed(0)}字/段`
        : null,
      reflectionAvg: this.reflectionHistory.length > 0
        ? this.reflectionHistory.reduce((s, r) => s + r.score, 0) / this.reflectionHistory.length
        : 0,
    }
  }

  // ============================================================
  // 定期维护
  // ============================================================

  /**
   * 更新风格画像（每 N 章调用一次）
   */
  updateStyleProfile(chapters: Array<{ number: number; content: string }>): void {
    this.chapterCount++

    if (this.chapterCount % this.config.styleUpdateInterval === 0 && chapters.length > 0) {
      const texts = chapters.map(c => c.content)
      this.lastStyleProfile = this.styleLearner.analyzeCorpus(texts)
    }
  }

  /**
   * 强制触发学习
   */
  forceLearn(): void {
    this.feedbackLoop.learn()
  }

  /**
   * 重置桥接器
   */
  reset(): void {
    this.operationCount = 0
    this.chapterCount = 0
    this.lastStyleProfile = null
    this.reflectionHistory = []
    this.feedbackLoop.reset()
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private samplePreference(content: string, _chapterNumber: number): void {
    const profile = this.feedbackLoop.getProfile()
    const fingerprint = profile?.fingerprint || this.buildSimpleFingerprint(content)

    this.preferenceTracker.track(fingerprint)
  }

  private buildSimpleFingerprint(content: string): StyleFingerprint {
    const sentences = content.split(/[。！？\n]/).filter(s => s.trim())
    const avgSentenceLen = sentences.length > 0
      ? sentences.reduce((s, c) => s + c.length, 0) / sentences.length
      : 20

    const paragraphs = content.split(/\n\n/).filter(p => p.trim())
    const avgParagraphLen = paragraphs.length > 0
      ? paragraphs.reduce((s, p) => s + p.length, 0) / paragraphs.length
      : 150

    return {
      avgSentenceLength: avgSentenceLen,
      sentenceLengthVariance: avgSentenceLen * 0.3,
      dialogueRatio: 0.2,
      descriptionRatio: 0.3,
      actionRatio: 0.3,
      avgParagraphLength: avgParagraphLen,
      commonRhetoric: [],
      forbiddenPatterns: [],
      preferredPatterns: [],
      lastUpdated: Date.now(),
      sampleCount: 1,
    }
  }
}

// ============================================================
// 工厂函数
// ============================================================

export function createLearningBridge(config?: Partial<LearningBridgeConfig>): LearningBridge {
  return new LearningBridge(
    new FeedbackLoop(),
    new PreferenceTracker(),
    new StyleLearner(),
    config,
  )
}