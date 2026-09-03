// ============================================================
// ReaderModel 读者心理模拟器 — GWE v6.0 技法多样性层
// 模拟读者在每一段的心理反应——这里会好奇、这里会紧张、这里会疲劳
// 用读者视角评估内容，而非作者视角
// ============================================================

/** 读者心理状态 */
export type ReaderState =
  | 'curious'    // 好奇
  | 'tense'      // 紧张
  | 'satisfied'  // 满足
  | 'fatigued'   // 疲劳
  | 'confused'   // 困惑
  | 'excited'    // 兴奋
  | 'bored'      // 无聊
  | 'moved'      // 感动

/** 阅读模拟结果 */
export interface ReadingSimulation {
  /** 每段的心理状态变化 */
  segmentStates: SegmentState[]
  /** 整体情绪曲线 */
  emotionCurve: Array<{ position: number; state: ReaderState; intensity: number }>
  /** 弃书风险点 */
  dropRiskPoints: DropRiskPoint[]
  /** 翻页动机曲线 */
  pageTurnMotivation: Array<{ position: number; motivation: number }>
  /** 整体评分 */
  overallScore: {
    engagement: number      // 参与度 0-1
    readability: number     // 可读性 0-1
    emotionalImpact: number // 情感冲击 0-1
    retention: number       // 留存率 0-1
  }
}

/** 段落状态 */
export interface SegmentState {
  /** 段落位置（百分比） */
  position: number
  /** 读者心理状态 */
  state: ReaderState
  /** 状态强度 0-1 */
  intensity: number
  /** 状态变化原因 */
  trigger: string
}

/** 弃书风险点 */
export interface DropRiskPoint {
  /** 位置（百分比） */
  position: number
  /** 风险等级 0-1 */
  risk: number
  /** 原因 */
  reason: string
  /** 段落内容片段 */
  snippet: string
}

// ============================================================
// ReaderModel 主类
// ============================================================

export class ReaderModel {
  /** 疲劳阈值：连续这么多段高密度内容后读者会疲劳 */
  private fatigueThreshold = 3
  /** 无聊阈值：连续这么多段无进展后读者会无聊 */
  private boredomThreshold = 2

  /**
   * 模拟阅读体验
   */
  simulateReading(content: string): ReadingSimulation {
    const paragraphs = content.split(/\n\n|\n(?=[^ ])/).filter(p => p.trim())
    const segmentStates: SegmentState[] = []
    const dropRiskPoints: DropRiskPoint[] = []
    const pageTurnMotivation: Array<{ position: number; motivation: number }> = []
    const emotionCurve: Array<{ position: number; state: ReaderState; intensity: number }> = []

    let currentState: ReaderState = 'curious'
    let intensity = 0.5
    let consecutiveHighDensity = 0
    let consecutiveNoProgress = 0
    let totalEngagement = 0
    let totalReadability = 0

    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i]
      const position = paragraphs.length > 1 ? i / (paragraphs.length - 1) : 0.5

      // 分析本段
      const analysis = this.analyzeParagraph(para, currentState, paragraphs.length)

      // 更新状态
      currentState = analysis.newState
      intensity = analysis.intensity

      // 追踪密度和进展
      if (analysis.isHighDensity) {
        consecutiveHighDensity++
      } else {
        consecutiveHighDensity = 0
      }

      if (analysis.isNoProgress) {
        consecutiveNoProgress++
      } else {
        consecutiveNoProgress = 0
      }

      // 记录
      segmentStates.push({
        position,
        state: currentState,
        intensity,
        trigger: analysis.trigger,
      })

      emotionCurve.push({ position, state: currentState, intensity })

      // 计算翻页动机
      const motivation = this.calculatePageTurnMotivation(
        currentState, intensity, consecutiveHighDensity, consecutiveNoProgress,
      )
      pageTurnMotivation.push({ position, motivation })

      // 检测弃书风险
      const dropRisk = this.assessDropRisk(
        consecutiveHighDensity, consecutiveNoProgress, motivation, para, position,
      )
      if (dropRisk) {
        dropRiskPoints.push(dropRisk)
      }

      // 累计评分
      totalEngagement += motivation
      totalReadability += analysis.readability
    }

    const n = Math.max(paragraphs.length, 1)
    const avgEngagement = totalEngagement / n
    const avgReadability = totalReadability / n
    const maxEmotion = Math.max(...segmentStates.map(s => s.intensity), 0.5)
    const dropRiskRatio = n > 0 ? 1 - dropRiskPoints.length / (n * 0.3) : 0.8

    return {
      segmentStates,
      emotionCurve,
      dropRiskPoints,
      pageTurnMotivation,
      overallScore: {
        engagement: avgEngagement,
        readability: avgReadability,
        emotionalImpact: maxEmotion * 0.7 + avgEngagement * 0.3,
        retention: Math.max(0, dropRiskRatio * avgEngagement),
      },
    }
  }

  /**
   * 预测弃书位置
   */
  predictDropPoint(simulation: ReadingSimulation): number | null {
    if (simulation.dropRiskPoints.length === 0) return null

    // 找到风险最高的点
    const highest = simulation.dropRiskPoints.sort((a, b) => b.risk - a.risk)[0]
    return highest.risk > 0.6 ? highest.position : null
  }

  /**
   * 生成阅读体验报告
   */
  generateReport(simulation: ReadingSimulation): string {
    const lines: string[] = ['【阅读体验分析】']

    const { overallScore } = simulation
    lines.push(`参与度：${this.scoreGrade(overallScore.engagement)} (${Math.round(overallScore.engagement * 100)}%)`)
    lines.push(`可读性：${this.scoreGrade(overallScore.readability)} (${Math.round(overallScore.readability * 100)}%)`)
    lines.push(`情感冲击：${this.scoreGrade(overallScore.emotionalImpact)} (${Math.round(overallScore.emotionalImpact * 100)}%)`)
    lines.push(`预估留存：${this.scoreGrade(overallScore.retention)} (${Math.round(overallScore.retention * 100)}%)`)

    if (simulation.dropRiskPoints.length > 0) {
      lines.push(`\n⚠ 弃书风险点：${simulation.dropRiskPoints.length}处`)
      for (const point of simulation.dropRiskPoints.slice(0, 3)) {
        lines.push(`  - 位置${Math.round(point.position * 100)}%：${point.reason}`)
      }
    }

    return lines.join('\n')
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private analyzeParagraph(
    para: string,
    _currentState: ReaderState,
    _totalParagraphs: number,
  ): {
    newState: ReaderState
    intensity: number
    isHighDensity: boolean
    isNoProgress: boolean
    trigger: string
    readability: number
  } {
    const paraLen = para.length
    const sentences = para.split(/[。！？]/).filter(s => s.trim())
    const avgSentLen = sentences.length > 0 ? paraLen / sentences.length : 0

    // 检测信息密度
    const infoWords = (para.match(/发现|原来|其实|真相|秘密|诡异|异常|突破|晋升|觉醒|获得|学会|领悟|揭开|终于|竟然|难道/g) || []).length
    const actionWords = (para.match(/攻击|防御|闪避|冲向|挥|斩|刺|踢|跳|跑|飞|碎|破|爆|轰/g) || []).length
    const emotionWords = (para.match(/泪|痛|心|颤抖|怒|恐惧|绝望|希望|喜悦|悲伤|笑|哭|沉默|叹息/g) || []).length
    const descriptionWords = (para.match(/看|见|望|观|听|闻|触|感|光|暗|色|影|形|声|音|气|味/g) || []).length

    const isHighDensity = infoWords >= 3 || (actionWords >= 4 && avgSentLen < 30)
    const isNoProgress = descriptionWords >= 5 && infoWords === 0 && actionWords === 0 && emotionWords === 0

    // 判断状态
    let newState: ReaderState = 'curious'
    let intensity = 0.5
    let trigger = ''

    if (actionWords >= 4) {
      newState = 'excited'
      intensity = Math.min(1, 0.5 + actionWords * 0.1)
      trigger = '动作场景'
    } else if (emotionWords >= 3) {
      newState = 'moved'
      intensity = Math.min(1, 0.5 + emotionWords * 0.15)
      trigger = '情感表达'
    } else if (infoWords >= 3) {
      newState = 'curious'
      intensity = Math.min(1, 0.6 + infoWords * 0.1)
      trigger = '信息揭示'
    } else if (isNoProgress) {
      newState = 'bored'
      intensity = 0.3
      trigger = '缺乏进展'
    } else if (avgSentLen > 60) {
      newState = 'fatigued'
      intensity = 0.4
      trigger = '高密度长句'
    } else {
      newState = 'curious'
      intensity = 0.45
      trigger = '正常叙事'
    }

    // 可读性评分
    const readability = avgSentLen < 30 ? 0.9 : avgSentLen < 50 ? 0.7 : avgSentLen < 70 ? 0.5 : 0.3

    return {
      newState,
      intensity,
      isHighDensity,
      isNoProgress,
      trigger,
      readability,
    }
  }

  private calculatePageTurnMotivation(
    state: ReaderState,
    intensity: number,
    consecutiveHighDensity: number,
    consecutiveNoProgress: number,
  ): number {
    let motivation = 0.5

    // 状态影响
    switch (state) {
      case 'excited': motivation = 0.9 * intensity; break
      case 'curious': motivation = 0.7 * intensity; break
      case 'tense': motivation = 0.8 * intensity; break
      case 'moved': motivation = 0.6 * intensity; break
      case 'satisfied': motivation = 0.5 * intensity; break
      case 'fatigued': motivation = 0.3 * intensity; break
      case 'bored': motivation = 0.2 * intensity; break
      case 'confused': motivation = 0.4 * intensity; break
    }

    // 疲劳惩罚
    if (consecutiveHighDensity > this.fatigueThreshold) {
      motivation *= 0.8 - (consecutiveHighDensity - this.fatigueThreshold) * 0.15
    }
    if (consecutiveNoProgress > this.boredomThreshold) {
      motivation *= 0.6 - (consecutiveNoProgress - this.boredomThreshold) * 0.2
    }

    return Math.max(0, Math.min(1, motivation))
  }

  private assessDropRisk(
    consecutiveHighDensity: number,
    consecutiveNoProgress: number,
    motivation: number,
    para: string,
    position: number,
  ): DropRiskPoint | null {
    let risk = 0
    let reason = ''

    if (consecutiveHighDensity > 5) {
      risk = 0.7
      reason = '连续高密度内容，读者疲劳'
    } else if (consecutiveNoProgress > 4) {
      risk = 0.8
      reason = '连续无进展段落，读者可能失去兴趣'
    } else if (motivation < 0.15) {
      risk = 0.6
      reason = '翻页动机极低'
    }

    if (risk === 0) return null

    return {
      position,
      risk,
      reason,
      snippet: para.slice(0, 60) + '...',
    }
  }

  private scoreGrade(score: number): string {
    if (score >= 0.9) return 'S'
    if (score >= 0.8) return 'A'
    if (score >= 0.7) return 'B'
    if (score >= 0.6) return 'C'
    return 'D'
  }
}