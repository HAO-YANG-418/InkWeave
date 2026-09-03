// ============================================================
// PreferenceTracker 偏好趋势追踪 — GWE v6.0 记忆进化层
// 追踪用户偏好随时间的变化趋势
// 用户3个月前喜欢长句，现在喜欢短句——这个变化本身就是重要信息
// ============================================================

import type { StyleFingerprint, FeedbackEvent } from './types'

// ============================================================
// 类型定义
// ============================================================

/** 偏好快照（时间点上的偏好状态） */
export interface PreferenceSnapshot {
  timestamp: number
  /** 句子长度偏好 */
  sentenceLength: { avg: number; trend: 'rising' | 'falling' | 'stable' }
  /** 对话比例 */
  dialogueRatio: number
  /** 描写比例 */
  descriptionRatio: number
  /** 行动比例 */
  actionRatio: number
  /** 接受率 */
  acceptRate: number
  /** 编辑率 */
  editRate: number
  /** 拒绝率 */
  rejectRate: number
  /** 当时的禁止模式 */
  forbiddenPatterns: string[]
  /** 当时的偏好模式 */
  preferredPatterns: string[]
}

/** 趋势方向 */
export type TrendDirection = 'rising' | 'falling' | 'stable' | 'volatile'

/** 趋势分析结果 */
export interface TrendResult {
  dimension: string
  direction: TrendDirection
  /** 变化率（每30天） */
  changeRate: number
  /** 置信度 */
  confidence: number
  /** 当前值 */
  currentValue: number
  /** 趋势描述 */
  description: string
}

/** 突变告警 */
export interface TrendAlert {
  dimension: string
  severity: 'info' | 'warning' | 'critical'
  description: string
  beforeValue: number
  afterValue: number
  changePercent: number
  detectedAt: number
}

/** 偏好追踪配置 */
export interface PreferenceTrackerConfig {
  /** 快照最小间隔（毫秒） */
  snapshotInterval: number
  /** 突变检测阈值（变化超过此比例视为突变） */
  mutationThreshold: number
  /** 趋势分析窗口（天） */
  trendWindows: number[]
  /** 最大快照数 */
  maxSnapshots: number
}

export const DEFAULT_TRACKER_CONFIG: PreferenceTrackerConfig = {
  snapshotInterval: 86400000, // 24小时
  mutationThreshold: 0.3,     // 30%变化视为突变
  trendWindows: [7, 30, 90],  // 7天/30天/90天
  maxSnapshots: 500,
}

// ============================================================
// PreferenceTracker 主类
// ============================================================

export class PreferenceTracker {
  private config: PreferenceTrackerConfig
  private snapshots: PreferenceSnapshot[] = []
  private alerts: TrendAlert[] = []
  private lastSnapshot = 0

  constructor(config?: Partial<PreferenceTrackerConfig>) {
    this.config = { ...DEFAULT_TRACKER_CONFIG, ...config }
  }

  /**
   * 记录偏好快照
   */
  track(fingerprint: StyleFingerprint, events?: FeedbackEvent[]): PreferenceSnapshot {
    const now = Date.now()

    // 检查是否需要新快照
    if (this.snapshots.length > 0 && now - this.lastSnapshot < this.config.snapshotInterval) {
      return this.snapshots[this.snapshots.length - 1]
    }

    const acceptCount = (events || []).filter(e => e.type === 'accept').length
    const editCount = (events || []).filter(e => e.type === 'edit').length
    const rejectCount = (events || []).filter(e => e.type === 'reject').length
    const total = acceptCount + editCount + rejectCount || 1

    const snapshot: PreferenceSnapshot = {
      timestamp: now,
      sentenceLength: {
        avg: fingerprint.avgSentenceLength,
        trend: this.detectSentenceTrend(fingerprint.avgSentenceLength),
      },
      dialogueRatio: fingerprint.dialogueRatio,
      descriptionRatio: fingerprint.descriptionRatio,
      actionRatio: fingerprint.actionRatio,
      acceptRate: acceptCount / total,
      editRate: editCount / total,
      rejectRate: rejectCount / total,
      forbiddenPatterns: fingerprint.forbiddenPatterns,
      preferredPatterns: fingerprint.preferredPatterns,
    }

    this.snapshots.push(snapshot)
    this.lastSnapshot = now

    // 限制快照数量
    if (this.snapshots.length > this.config.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.config.maxSnapshots)
    }

    // 检测突变
    this.detectMutation(snapshot)

    return snapshot
  }

  /**
   * 获取趋势
   */
  getTrend(dimension: keyof PreferenceSnapshot, windowDays: number): TrendResult {
    const now = Date.now()
    const windowStart = now - windowDays * 24 * 3600 * 1000
    const windowSnapshots = this.snapshots.filter(s => s.timestamp >= windowStart)

    if (windowSnapshots.length < 2) {
      return {
        dimension: dimension as string,
        direction: 'stable',
        changeRate: 0,
        confidence: 0,
        currentValue: 0,
        description: '数据不足，无法分析趋势',
      }
    }

    const values = windowSnapshots.map(s => {
      const val = s[dimension]
      if (typeof val === 'number') return val
      if (typeof val === 'object' && val !== null && 'avg' in val) {
        return (val as { avg: number }).avg
      }
      return 0
    })

    const first = values[0]
    const last = values[values.length - 1]
    const changeRate = first > 0 ? (last - first) / first / (windowDays / 30) : 0

    let direction: TrendDirection = 'stable'
    if (Math.abs(changeRate) > 0.15) {
      direction = changeRate > 0 ? 'rising' : 'falling'
    } else if (this.calculateVolatility(values) > 0.3) {
      direction = 'volatile'
    }

    return {
      dimension: dimension as string,
      direction,
      changeRate,
      confidence: Math.min(windowSnapshots.length / 10, 1),
      currentValue: last,
      description: this.buildTrendDescription(dimension as string, direction, changeRate),
    }
  }

  /**
   * 获取所有维度的趋势
   */
  getAllTrends(windowDays = 30): TrendResult[] {
    const dimensions: Array<keyof PreferenceSnapshot> = [
      'dialogueRatio', 'descriptionRatio', 'actionRatio', 'acceptRate', 'editRate', 'rejectRate',
    ]
    return dimensions.map(d => this.getTrend(d, windowDays))
  }

  /**
   * 预测下一个值
   */
  predictNext(dimension: 'dialogueRatio' | 'descriptionRatio' | 'actionRatio' | 'acceptRate'): {
    predicted: number
    confidence: number
    range: [number, number]
  } {
    const values = this.snapshots.map(s => s[dimension] as number)
    if (values.length < 3) {
      return { predicted: values[values.length - 1] || 0, confidence: 0, range: [0, 1] }
    }

    // 简单线性回归
    const n = values.length
    const indices = values.map((_, i) => i)
    const meanX = (n - 1) / 2
    const meanY = values.reduce((s, v) => s + v, 0) / n

    let num = 0, den = 0
    for (let i = 0; i < n; i++) {
      num += (indices[i] - meanX) * (values[i] - meanY)
      den += (indices[i] - meanX) ** 2
    }
    const slope = den > 0 ? num / den : 0
    const intercept = meanY - slope * meanX

    const predicted = Math.max(0, Math.min(1, intercept + slope * n))
    const residuals = values.map((v, i) => v - (intercept + slope * i))
    const std = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n)

    return {
      predicted,
      confidence: Math.min(n / 30, 1),
      range: [Math.max(0, predicted - std * 2), Math.min(1, predicted + std * 2)],
    }
  }

  /**
   * 获取突变告警
   */
  getAlerts(limit = 10): TrendAlert[] {
    return this.alerts.slice(-limit)
  }

  /**
   * 获取最新快照
   */
  getLatestSnapshot(): PreferenceSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null
  }

  /**
   * 获取快照历史
   */
  getHistory(limit = 100): PreferenceSnapshot[] {
    return this.snapshots.slice(-limit)
  }

  /**
   * 生成趋势报告
   */
  generateTrendReport(): string {
    if (this.snapshots.length < 2) {
      return '数据不足，无法生成趋势报告。至少需要2个快照。'
    }

    const lines: string[] = ['【偏好趋势报告】']
    const trends = this.getAllTrends(30)

    for (const t of trends) {
      const icon = t.direction === 'rising' ? '↑' : t.direction === 'falling' ? '↓' : '→'
      lines.push(`${icon} ${this.dimensionLabel(t.dimension)}: ${t.description}`)
    }

    if (this.alerts.length > 0) {
      lines.push('\n【突变告警】')
      for (const alert of this.alerts.slice(-3)) {
        lines.push(`⚠ ${alert.description}`)
      }
    }

    return lines.join('\n')
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private detectSentenceTrend(currentAvg: number): 'rising' | 'falling' | 'stable' {
    if (this.snapshots.length < 2) return 'stable'
    const prev = this.snapshots[this.snapshots.length - 1].sentenceLength.avg
    const change = (currentAvg - prev) / Math.max(prev, 1)
    if (change > 0.1) return 'rising'
    if (change < -0.1) return 'falling'
    return 'stable'
  }

  private detectMutation(snapshot: PreferenceSnapshot): void {
    if (this.snapshots.length < 3) return

    const prev = this.snapshots[this.snapshots.length - 2]
    const dimensions: Array<{ key: keyof PreferenceSnapshot; label: string }> = [
      { key: 'dialogueRatio', label: '对话比例' },
      { key: 'descriptionRatio', label: '描写比例' },
      { key: 'actionRatio', label: '行动比例' },
      { key: 'acceptRate', label: '接受率' },
    ]

    for (const { key, label } of dimensions) {
      const before = prev[key] as number
      const after = snapshot[key] as number
      if (before === 0) continue

      const change = Math.abs(after - before) / before
      if (change > this.config.mutationThreshold) {
        this.alerts.push({
          dimension: label,
          severity: change > 0.5 ? 'critical' : 'warning',
          description: `${label}从${(before * 100).toFixed(0)}%变为${(after * 100).toFixed(0)}%（变化${(change * 100).toFixed(0)}%）`,
          beforeValue: before,
          afterValue: after,
          changePercent: change,
          detectedAt: Date.now(),
        })
      }
    }
  }

  private calculateVolatility(values: number[]): number {
    if (values.length < 2) return 0
    const changes = []
    for (let i = 1; i < values.length; i++) {
      changes.push(Math.abs(values[i] - values[i - 1]) / Math.max(values[i - 1], 0.01))
    }
    return changes.reduce((s, c) => s + c, 0) / changes.length
  }

  private buildTrendDescription(dimension: string, direction: TrendDirection, changeRate: number): string {
    const label = this.dimensionLabel(dimension)
    const absChange = Math.abs(changeRate * 100).toFixed(1)

    switch (direction) {
      case 'rising': return `${label}呈上升趋势（+${absChange}%/月）`
      case 'falling': return `${label}呈下降趋势（-${absChange}%/月）`
      case 'volatile': return `${label}波动较大，趋势不稳定`
      default: return `${label}保持稳定`
    }
  }

  private dimensionLabel(dim: string): string {
    const labels: Record<string, string> = {
      dialogueRatio: '对话比例',
      descriptionRatio: '描写比例',
      actionRatio: '行动比例',
      acceptRate: '接受率',
      editRate: '编辑率',
      rejectRate: '拒绝率',
      sentenceLength: '句子长度',
    }
    return labels[dim] || dim
  }
}