// ============================================================
// EmotionalArcPlanner 情感弧线规划器 — GWE v6.0 完美规划层
// 规划读者的情感体验曲线，设计情感节奏，确保每章有情感价值
// ============================================================

import type { EmotionalArc } from './types'

/** 情感弧线类型 */
export type ArcType =
  | 'rising'      // 上升弧：希望→高潮
  | 'falling'     // 下降弧：高潮→绝望
  | 'wave'        // 波动弧：反复起伏
  | 'burst'       // 爆发弧：突然爆发
  | 'healing'     // 治愈弧：悲伤→温暖

/** 情感锚点 */
export interface EmotionalAnchor {
  chapter: number
  emotion: string
  intensity: number
  trigger: string
}

/** 弧线配置 */
export interface ArcConfig {
  type: ArcType
  /** 弧线中的情感锚点 */
  anchors: EmotionalAnchor[]
  /** 情感变化节奏 */
  transition: 'gradual' | 'sharp' | 'contrast'
}

/** 弧线模板 */
export interface ArcTemplate {
  name: string
  type: ArcType
  description: string
  emotions: string[]
  bestFor: string[]
}

// ============================================================
// 内置弧线模板
// ============================================================

const ARC_TEMPLATES: ArcTemplate[] = [
  {
    name: '希望→绝望→反击',
    type: 'wave',
    description: '从希望出发，经历绝望，最后反击。经典三幕波动',
    emotions: ['hope', 'despair', 'anger', 'satisfaction'],
    bestFor: ['climax', 'create_conflict'],
  },
  {
    name: '日常→危机→爆发',
    type: 'rising',
    description: '从日常开始，逐步升温到危机，最后爆发',
    emotions: ['neutral', 'tension', 'fear', 'excitement'],
    bestFor: ['advance_plot', 'raise_stakes'],
  },
  {
    name: '绝境→挣扎→逆转',
    type: 'burst',
    description: '绝境中爆发，突然逆转局势',
    emotions: ['despair', 'tension', 'hope', 'satisfaction'],
    bestFor: ['climax', 'show_growth'],
  },
  {
    name: '悲伤→回忆→温暖',
    type: 'healing',
    description: '从悲伤中走出，通过回忆找到温暖',
    emotions: ['sadness', 'warmth', 'satisfaction'],
    bestFor: ['emotional_impact', 'show_growth'],
  },
  {
    name: '好奇→发现→震撼',
    type: 'rising',
    description: '从好奇开始，逐步发现，最后震撼',
    emotions: ['curiosity', 'tension', 'awe'],
    bestFor: ['reveal_secret', 'world_building'],
  },
  {
    name: '轻松→紧张→爆发→余韵',
    type: 'wave',
    description: '完整的四阶段情感弧线',
    emotions: ['warmth', 'tension', 'excitement', 'satisfaction'],
    bestFor: ['climax'],
  },
]

// ============================================================
// EmotionalArcPlanner 主类
// ============================================================

export class EmotionalArcPlanner {
  private arcs: EmotionalArc[] = []

  /**
   * 设计一段情感弧线
   */
  designArc(
    intent: string,
    chapters: number[],
    options?: {
      template?: string
      customEmotions?: string[]
    },
  ): EmotionalArc[] {
    // 选择模板
    const template = options?.template
      ? ARC_TEMPLATES.find(t => t.name === options.template)
      : this.selectTemplate(intent)

    const emotions = options?.customEmotions || template?.emotions || ['neutral', 'curiosity', 'hope']

    this.arcs = chapters.map((chapter, i) => {
      const progress = chapters.length > 1 ? i / (chapters.length - 1) : 0.5
      const emotionIdx = Math.min(
        Math.floor(progress * (emotions.length - 1)),
        emotions.length - 1,
      )

      return {
        chapterNumber: chapter,
        anchor: this.getAnchorForEmotion(emotions[emotionIdx]),
        targetEmotion: emotions[emotionIdx],
        intensity: 0.3 + progress * 0.7,
        fromEmotion: i > 0 ? emotions[Math.max(0, emotionIdx - 1)] : undefined,
        transition: i > 0 ? this.getTransitionType(emotions, emotionIdx) : 'gradual',
      }
    })

    return this.arcs
  }

  /**
   * 验证弧线
   * 检查是否有"死区"（连续多章无情感波动）
   */
  validateArc(arcs: EmotionalArc[]): string[] {
    const issues: string[] = []

    if (arcs.length < 2) return issues

    // 检查死区
    let consecutiveSameEmotion = 1
    for (let i = 1; i < arcs.length; i++) {
      if (arcs[i].targetEmotion === arcs[i - 1].targetEmotion && arcs[i].intensity < 0.5) {
        consecutiveSameEmotion++
        if (consecutiveSameEmotion >= 3) {
          issues.push(`第${arcs[i - 2].chapterNumber}-${arcs[i].chapterNumber}章情感死区：连续${consecutiveSameEmotion}章无显著情感波动`)
        }
      } else {
        consecutiveSameEmotion = 1
      }
    }

    // 检查情感对比使用
    for (let i = 1; i < arcs.length; i++) {
      if (arcs[i].transition === 'contrast') {
        // 情感对比是好的，但检查是否太频繁
        const contrastCount = arcs.slice(0, i + 1).filter(a => a.transition === 'contrast').length
        if (contrastCount > arcs.length * 0.3) {
          issues.push(`情感对比使用过频（${contrastCount}/${arcs.length}），可能降低冲击力`)
          break
        }
      }
    }

    // 检查是否有情感高潮
    const maxIntensity = Math.max(...arcs.map(a => a.intensity))
    if (maxIntensity < 0.7) {
      issues.push('弧线缺少情感高潮（最高强度 < 70%）')
    }

    return issues
  }

  /**
   * 建议调整
   */
  suggestAdjustment(arcs: EmotionalArc[]): EmotionalArc[] {
    const issues = this.validateArc(arcs)
    if (issues.length === 0) return arcs

    const adjusted = arcs.map(a => ({ ...a }))

    // 修复死区：在死区中段插入情感波动
    for (let i = 1; i < adjusted.length - 1; i++) {
      if (
        adjusted[i].targetEmotion === adjusted[i - 1].targetEmotion &&
        adjusted[i].targetEmotion === adjusted[i + 1].targetEmotion &&
        adjusted[i].intensity < 0.5
      ) {
        adjusted[i].targetEmotion = 'curiosity'
        adjusted[i].intensity = 0.5
        adjusted[i].transition = 'sharp'
      }
    }

    return adjusted
  }

  /**
   * 获取所有弧线模板
   */
  getTemplates(): ArcTemplate[] {
    return ARC_TEMPLATES
  }

  /**
   * 获取当前弧线数据
   */
  getArcData(): EmotionalArc[] {
    return [...this.arcs]
  }

  /**
   * 生成情感弧线提示词
   */
  generateArcPrompt(arcs: EmotionalArc[]): string {
    const lines: string[] = ['【情感弧线设计】']

    for (const arc of arcs) {
      const transitionLabel = arc.transition === 'gradual' ? '渐变' : arc.transition === 'sharp' ? '突变' : '对比'
      const fromStr = arc.fromEmotion ? `从${arc.fromEmotion} ` : ''
      lines.push(`  第${arc.chapterNumber}章：${fromStr}→ ${arc.targetEmotion}（${transitionLabel}，强度${Math.round(arc.intensity * 100)}%）`)
    }

    return lines.join('\n')
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private selectTemplate(intent: string): ArcTemplate | undefined {
    return ARC_TEMPLATES.find(t => t.bestFor.includes(intent))
  }

  private getAnchorForEmotion(emotion: string): string {
    const anchors: Record<string, string> = {
      hope: '希望的火种',
      despair: '绝望的深渊',
      anger: '愤怒的爆发',
      satisfaction: '满足的余韵',
      tension: '紧绷的弦',
      fear: '恐惧的阴影',
      curiosity: '好奇的种子',
      excitement: '兴奋的顶点',
      sadness: '悲伤的尽头',
      warmth: '温暖的光芒',
      awe: '震撼的瞬间',
      neutral: '平静的水面',
    }
    return anchors[emotion] || emotion
  }

  private getTransitionType(emotions: string[], currentIdx: number): 'gradual' | 'sharp' | 'contrast' {
    if (currentIdx === 0) return 'gradual'

    const prev = emotions[currentIdx - 1]
    const curr = emotions[currentIdx]

    // 情感对比对（如 hope→despair, despair→hope）
    const contrastPairs: Array<[string, string]> = [
      ['hope', 'despair'], ['despair', 'hope'],
      ['satisfaction', 'fear'], ['fear', 'satisfaction'],
      ['warmth', 'anger'], ['anger', 'warmth'],
    ]

    if (contrastPairs.some(([a, b]) => prev === a && curr === b)) {
      return 'contrast'
    }

    if (prev !== curr) return 'sharp'
    return 'gradual'
  }
}