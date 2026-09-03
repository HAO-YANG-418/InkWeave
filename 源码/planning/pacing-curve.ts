// ============================================================
// PacingCurve 节奏曲线规划器 — GWE v6.0 完美规划层
// 规划全书张弛节奏，量化节奏强度，生成全书节奏曲线
// ============================================================

/** 节奏指标 */
export interface RhythmMetrics {
  chapterNumber: number
  intensity: number    // 强度 0-1
  density: number      // 密度 0-1
  tempo: number        // 速度 0-1
  relief: number       // 缓冲 0-1
}

/** 节奏模式 */
export type RhythmPattern =
  | 'rising'      // 上升型：强度持续上升
  | 'wave'        // 波浪型：有起有伏
  | 'staircase'   // 阶梯型：稳步上升，间歇缓冲
  | 'burst'       // 爆发型：突然高强度
  | 'three_act'   // 三幕式：铺垫→冲突→高潮

/** 节奏配置 */
export interface PacingConfig {
  /** 目标节奏模式 */
  targetPattern: RhythmPattern
  /** 连续高强度上限（超过此值建议缓冲） */
  maxConsecutiveHighIntensity: number
  /** 高强度阈值 */
  highIntensityThreshold: number
  /** 缓冲最低比例 */
  minBreatherRatio: number
}

const DEFAULT_PACING_CONFIG: PacingConfig = {
  targetPattern: 'wave',
  maxConsecutiveHighIntensity: 3,
  highIntensityThreshold: 0.7,
  minBreatherRatio: 0.1,
}

// ============================================================
// 预设节奏模板
// ============================================================

const RHYTHM_TEMPLATES: Record<string, RhythmPattern> = {
  '爽文节奏': 'staircase',
  '悬疑节奏': 'rising',
  '文艺节奏': 'wave',
  '热血节奏': 'burst',
  '史诗节奏': 'three_act',
}

// ============================================================
// PacingCurve 主类
// ============================================================

export class PacingCurve {
  private config: PacingConfig
  private metrics: RhythmMetrics[] = []

  constructor(config?: Partial<PacingConfig>) {
    this.config = { ...DEFAULT_PACING_CONFIG, ...config }
  }

  /**
   * 分析已有章节的节奏
   */
  analyzeRhythm(chapters: Array<{ number: number; content: string }>): RhythmMetrics[] {
    this.metrics = chapters.map(ch => {
      const content = ch.content
      const words = content.length

      // 强度：动作词 + 冲突词密度
      const actionCount = (content.match(/攻击|防御|爆发|冲向|挥|斩|碎|破|杀|全力|赌上|拼死|绝境|生死|决战/g) || []).length
      const intensity = Math.min(1, actionCount / Math.max(words / 100, 1) * 0.5)

      // 密度：信息量
      const infoCount = (content.match(/发现|原来|其实|真相|秘密|揭开|揭晓|突破|晋升|觉醒|顿悟/g) || []).length
      const density = Math.min(1, infoCount / Math.max(words / 100, 1) * 0.4)

      // 速度：短句比例
      const sentences = content.split(/[。！？]/).filter(s => s.trim())
      const shortSentences = sentences.filter(s => s.length < 20).length
      const tempo = sentences.length > 0 ? shortSentences / sentences.length : 0.5

      // 缓冲：日常/描写比例
      const descCount = (content.match(/看|见|望|观|听|闻|触|感|光|暗|色|影|形/g) || []).length
      const relief = Math.min(1, descCount / Math.max(words / 100, 1) * 0.3)

      return {
        chapterNumber: ch.number,
        intensity,
        density,
        tempo,
        relief,
      }
    })

    return this.metrics
  }

  /**
   * 建议下一章的节奏
   */
  suggestNextPacing(nextChapter: number): RhythmMetrics {
    if (this.metrics.length === 0) {
      return { chapterNumber: nextChapter, intensity: 0.5, density: 0.5, tempo: 0.5, relief: 0.3 }
    }

    const recent = this.metrics.slice(-this.config.maxConsecutiveHighIntensity)

    // 检测连续高强度
    const consecutiveHigh = recent.filter(m => m.intensity > this.config.highIntensityThreshold).length

    if (consecutiveHigh >= this.config.maxConsecutiveHighIntensity) {
      // 需要缓冲
      return {
        chapterNumber: nextChapter,
        intensity: 0.3,
        density: 0.3,
        tempo: 0.4,
        relief: 0.7,
      }
    }

    // 正常波动
    const lastMetric = this.metrics[this.metrics.length - 1]
    const wave = Math.sin(this.metrics.length * 0.5) * 0.2

    return {
      chapterNumber: nextChapter,
      intensity: Math.max(0, Math.min(1, lastMetric.intensity + wave)),
      density: Math.max(0, Math.min(1, lastMetric.density + wave)),
      tempo: Math.max(0, Math.min(1, lastMetric.tempo + wave * 0.5)),
      relief: Math.max(0, Math.min(1, 0.3 + wave * 0.3)),
    }
  }

  /**
   * 获取节奏曲线数据
   */
  getCurve(_volumeNumber?: number): RhythmMetrics[] {
    return [...this.metrics]
  }

  /**
   * 获取节奏模板
   */
  getRhythmTemplate(label: string): RhythmPattern | undefined {
    return RHYTHM_TEMPLATES[label]
  }

  /**
   * 获取所有模板标签
   */
  getTemplateLabels(): string[] {
    return Object.keys(RHYTHM_TEMPLATES)
  }

  /**
   * 检测节奏问题
   */
  detectIssues(): string[] {
    const issues: string[] = []

    if (this.metrics.length < 3) return issues

    // 连续高强度检测
    let consecutiveHigh = 0
    for (const m of this.metrics) {
      if (m.intensity > this.config.highIntensityThreshold) {
        consecutiveHigh++
        if (consecutiveHigh > this.config.maxConsecutiveHighIntensity) {
          issues.push(`第${m.chapterNumber}章：连续${consecutiveHigh}章高强度，建议插入缓冲`)
        }
      } else {
        consecutiveHigh = 0
      }
    }

    // 缓冲比例检测
    const breatherCount = this.metrics.filter(m => m.relief > 0.6).length
    const ratio = breatherCount / this.metrics.length
    if (ratio < this.config.minBreatherRatio) {
      issues.push(`缓冲章节比例过低（${(ratio * 100).toFixed(1)}%），建议至少${(this.config.minBreatherRatio * 100).toFixed(0)}%`)
    }

    return issues
  }

  /**
   * 生成节奏建议文本
   */
  generatePacingAdvice(): string {
    const lines: string[] = ['【节奏分析】']

    if (this.metrics.length === 0) {
      lines.push('暂无章节数据')
      return lines.join('\n')
    }

    const avgIntensity = this.metrics.reduce((s, m) => s + m.intensity, 0) / this.metrics.length
    const avgTempo = this.metrics.reduce((s, m) => s + m.tempo, 0) / this.metrics.length

    lines.push(`平均强度：${(avgIntensity * 100).toFixed(0)}%`)
    lines.push(`平均速度：${(avgTempo * 100).toFixed(0)}%`)

    const issues = this.detectIssues()
    if (issues.length > 0) {
      lines.push(`\n⚠ 节奏问题：`)
      for (const issue of issues) {
        lines.push(`  - ${issue}`)
      }
    } else {
      lines.push(`✓ 节奏控制良好`)
    }

    const next = this.suggestNextPacing(this.metrics.length + 1)
    lines.push(`\n下一章建议：强度${(next.intensity * 100).toFixed(0)}% · 速度${(next.tempo * 100).toFixed(0)}% · 缓冲${(next.relief * 100).toFixed(0)}%`)

    return lines.join('\n')
  }
}