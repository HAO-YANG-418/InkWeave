// ============================================================
// StyleLearner 风格学习器 — GWE v6.0 记忆进化层
// 从用户历史写作中提取深层风格指纹
// 比 FeedbackLoop 的指纹更深层：不是"用户删了什么"，而是"用户天然怎么写"
// ============================================================

import type { StyleFingerprint } from './types'

// ============================================================
// 深度风格画像
// ============================================================

/** 句子节奏频谱 */
export interface SentenceRhythmSpectrum {
  /** 按位置分段的句长分布 */
  byPosition: {
    opening: number[]   // 段落开头句的句长
    middle: number[]    // 段落中段句的句长
    ending: number[]    // 段落结尾句的句长
  }
  /** 句长分布直方图 */
  histogram: Map<number, number>
  /** 平均句长 */
  avgLength: number
  /** 句长方差 */
  variance: number
  /** 节奏模式 */
  pattern: RhythmPattern
}

export type RhythmPattern =
  | 'short_burst'     // 短句爆发型
  | 'long_flow'       // 长句流畅型
  | 'mixed_wave'      // 长短交替波浪型
  | 'pyramid'         // 金字塔型（短→中→长）
  | 'inverted_pyramid' // 倒金字塔型（长→中→短）
  | 'balanced'        // 均衡型

/** 段落结构偏好 */
export interface ParagraphStructureProfile {
  /** 平均段落长度 */
  avgLength: number
  /** 段落长度分布 */
  lengthDistribution: { min: number; max: number; median: number; q1: number; q3: number }
  /** 段落首句模式 */
  openingPatterns: Record<string, number>
  /** 段落末句模式 */
  endingPatterns: Record<string, number>
  /** 段落内句数分布 */
  sentencesPerParagraph: number[]
}

/** 转场习惯 */
export interface TransitionProfile {
  /** 常用转场词 */
  frequentTransitions: Array<{ word: string; count: number }>
  /** 转场类型分布 */
  transitionTypes: Record<string, number>
  /** 转场频率（每千字） */
  frequency: number
}

/** 修辞偏好 */
export interface RhetoricProfile {
  /** 比喻使用频率（每千字） */
  metaphorFrequency: number
  /** 常用比喻域 */
  metaphorDomains: Record<string, number>
  /** 排比使用频率 */
  parallelismFrequency: number
  /** 反问使用频率 */
  rhetoricalQuestionFrequency: number
  /** 拟人使用频率 */
  personificationFrequency: number
  /** 夸张使用频率 */
  hyperboleFrequency: number
}

/** 人称与视角偏好 */
export interface PersonProfile {
  /** 第一人称比例 */
  firstPersonRatio: number
  /** 第二人称比例 */
  secondPersonRatio: number
  /** 第三人称比例 */
  thirdPersonRatio: number
  /** 视角切换频率 */
  povSwitchFrequency: number
}

/** 深度风格画像 */
export interface DeepStyleProfile {
  /** 句子节奏 */
  rhythm: SentenceRhythmSpectrum
  /** 段落结构 */
  paragraph: ParagraphStructureProfile
  /** 转场习惯 */
  transition: TransitionProfile
  /** 修辞偏好 */
  rhetoric: RhetoricProfile
  /** 人称偏好 */
  person: PersonProfile
  /** 综合风格标签 */
  styleLabels: StyleLabel[]
  /** 风格稳定性（0-1，越高越稳定） */
  stability: number
  /** 数据来源 */
  metadata: {
    sampleCount: number
    totalWords: number
    analyzedAt: number
  }
}

export type StyleLabel =
  | '冷峻' | '热血' | '细腻' | '简洁' | '华丽' | '幽默'
  | '沉重' | '轻快' | '写实' | '浪漫' | '悬疑' | '史诗'

// ============================================================
// StyleLearner 主类
// ============================================================

export class StyleLearner {
  private profiles: DeepStyleProfile[] = []

  /**
   * 从文本语料中提取深度风格画像
   * @param texts 用户的写作样本（多段文本）
   * @param fingerprint 已有的浅层指纹（来自 FeedbackLoop）
   */
  analyzeCorpus(texts: string[], fingerprint?: StyleFingerprint): DeepStyleProfile {
    const allText = texts.join('\n')
    const totalWords = allText.length

    const rhythm = this.analyzeSentenceRhythm(texts)
    const paragraph = this.analyzeParagraphStructure(texts)
    const transition = this.analyzeTransitions(allText, totalWords)
    const rhetoric = this.analyzeRhetoric(allText, totalWords)
    const person = this.analyzePerson(allText)
    const styleLabels = this.classifyStyle(rhythm, paragraph, rhetoric, fingerprint)
    const stability = this.calculateStability(texts)

    const profile: DeepStyleProfile = {
      rhythm,
      paragraph,
      transition,
      rhetoric,
      person,
      styleLabels,
      stability,
      metadata: {
        sampleCount: texts.length,
        totalWords,
        analyzedAt: Date.now(),
      },
    }

    this.profiles.push(profile)
    return profile
  }

  /**
   * 比较两个风格画像的相似度
   */
  compareStyle(a: DeepStyleProfile, b: DeepStyleProfile): number {
    let score = 0
    let count = 0

    // 句长相似度
    const lenRatio = Math.min(a.rhythm.avgLength, b.rhythm.avgLength) /
      Math.max(a.rhythm.avgLength, b.rhythm.avgLength)
    score += lenRatio
    count++

    // 节奏模式匹配
    if (a.rhythm.pattern === b.rhythm.pattern) {
      score += 1
    }
    count++

    // 段落长度相似度
    const paraRatio = Math.min(a.paragraph.avgLength, b.paragraph.avgLength) /
      Math.max(a.paragraph.avgLength, b.paragraph.avgLength)
    score += paraRatio
    count++

    // 风格标签重叠
    const overlap = a.styleLabels.filter(l => b.styleLabels.includes(l)).length
    const total = Math.max(a.styleLabels.length, b.styleLabels.length, 1)
    score += overlap / total
    count++

    return score / count
  }

  /**
   * 获取最新的风格画像
   */
  getLatestProfile(): DeepStyleProfile | null {
    return this.profiles.length > 0 ? this.profiles[this.profiles.length - 1] : null
  }

  /**
   * 获取风格演变历史
   */
  getEvolution(): DeepStyleProfile[] {
    return [...this.profiles]
  }

  /**
   * 生成风格注入提示词
   */
  generateStylePrompt(profile: DeepStyleProfile): string {
    const lines: string[] = ['【用户写作风格】']

    lines.push(`节奏模式：${this.rhythmLabel(profile.rhythm.pattern)}（平均句长 ${Math.round(profile.rhythm.avgLength)} 字）`)
    lines.push(`段落风格：平均段落 ${Math.round(profile.paragraph.avgLength)} 字`)
    lines.push(`风格标签：${profile.styleLabels.join('、')}`)

    if (profile.paragraph.openingPatterns && Object.keys(profile.paragraph.openingPatterns).length > 0) {
      const topOpenings = Object.entries(profile.paragraph.openingPatterns)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([p]) => p)
      lines.push(`偏好开头：${topOpenings.join('、')}`)
    }

    if (profile.transition.frequentTransitions.length > 0) {
      const topTrans = profile.transition.frequentTransitions
        .slice(0, 3)
        .map(t => t.word)
      lines.push(`常用转场：${topTrans.join('、')}`)
    }

    lines.push(`修辞密度：比喻${(profile.rhetoric.metaphorFrequency * 1000).toFixed(1)}/千字 · 排比${(profile.rhetoric.parallelismFrequency * 1000).toFixed(1)}/千字`)

    return lines.join('\n')
  }

  // ============================================================
  // 私有方法：分析维度
  // ============================================================

  /**
   * 句子节奏分析
   */
  private analyzeSentenceRhythm(texts: string[]): SentenceRhythmSpectrum {
    const allSentences: number[] = []
    const openingLens: number[] = []
    const middleLens: number[] = []
    const endingLens: number[] = []

    for (const text of texts) {
      const paragraphs = text.split(/\n\n|\n(?=[^ ])/).filter(p => p.trim())
      for (const para of paragraphs) {
        const sentences = para.split(/[。！？]/).filter(s => s.trim())
        if (sentences.length === 0) continue

        for (let i = 0; i < sentences.length; i++) {
          const len = sentences[i].length
          allSentences.push(len)

          if (sentences.length === 1) {
            openingLens.push(len)
          } else if (i === 0) {
            openingLens.push(len)
          } else if (i === sentences.length - 1) {
            endingLens.push(len)
          } else {
            middleLens.push(len)
          }
        }
      }
    }

    const avgLength = allSentences.length > 0
      ? allSentences.reduce((s, l) => s + l, 0) / allSentences.length
      : 30

    const mean = avgLength
    const variance = allSentences.length > 0
      ? allSentences.reduce((s, l) => s + (l - mean) ** 2, 0) / allSentences.length
      : 100

    // 构建直方图
    const histogram = new Map<number, number>()
    for (const len of allSentences) {
      const bucket = Math.floor(len / 10) * 10
      histogram.set(bucket, (histogram.get(bucket) || 0) + 1)
    }

    // 判断节奏模式
    const pattern = this.classifyRhythm(avgLength, variance, openingLens, endingLens)

    return {
      byPosition: { opening: openingLens, middle: middleLens, ending: endingLens },
      histogram,
      avgLength,
      variance,
      pattern,
    }
  }

  private classifyRhythm(
    avgLen: number,
    variance: number,
    openingLens: number[],
    endingLens: number[],
  ): RhythmPattern {
    const avgOpening = openingLens.length > 0
      ? openingLens.reduce((s, l) => s + l, 0) / openingLens.length
      : avgLen
    const avgEnding = endingLens.length > 0
      ? endingLens.reduce((s, l) => s + l, 0) / endingLens.length
      : avgLen

    if (avgLen < 25 && variance < 200) return 'short_burst'
    if (avgLen > 45 && variance < 300) return 'long_flow'
    if (variance > 400) return 'mixed_wave'
    if (avgOpening < avgLen * 0.7 && avgEnding > avgLen * 1.3) return 'pyramid'
    if (avgOpening > avgLen * 1.3 && avgEnding < avgLen * 0.7) return 'inverted_pyramid'
    return 'balanced'
  }

  /**
   * 段落结构分析
   */
  private analyzeParagraphStructure(texts: string[]): ParagraphStructureProfile {
    const allParaLengths: number[] = []
    const sentencesPerPara: number[] = []
    const openingCounts: Record<string, number> = {}
    const endingCounts: Record<string, number> = {}

    for (const text of texts) {
      const paragraphs = text.split(/\n\n|\n(?=[^ ])/).filter(p => p.trim())
      for (const para of paragraphs) {
        allParaLengths.push(para.length)
        const sentences = para.split(/[。！？]/).filter(s => s.trim())
        sentencesPerPara.push(sentences.length)

        if (sentences.length > 0) {
          const firstWord = sentences[0].slice(0, 3)
          openingCounts[firstWord] = (openingCounts[firstWord] || 0) + 1

          const lastWord = sentences[sentences.length - 1].slice(-3)
          endingCounts[lastWord] = (endingCounts[lastWord] || 0) + 1
        }
      }
    }

    const sorted = allParaLengths.sort((a, b) => a - b)

    return {
      avgLength: allParaLengths.length > 0
        ? allParaLengths.reduce((s, l) => s + l, 0) / allParaLengths.length
        : 150,
      lengthDistribution: {
        min: sorted[0] || 0,
        max: sorted[sorted.length - 1] || 0,
        median: sorted[Math.floor(sorted.length / 2)] || 0,
        q1: sorted[Math.floor(sorted.length * 0.25)] || 0,
        q3: sorted[Math.floor(sorted.length * 0.75)] || 0,
      },
      openingPatterns: openingCounts,
      endingPatterns: endingCounts,
      sentencesPerParagraph: sentencesPerPara,
    }
  }

  /**
   * 转场习惯分析
   */
  private analyzeTransitions(text: string, totalWords: number): TransitionProfile {
    const transitionWords = [
      '与此同时', '另一方面', '画面一转', '数日后', '不久', '转眼', '很快',
      '此刻', '此时', '与此同时', '镜头切换', '场景转换', '另一边',
      '之后', '随后', '接着', '然后', '紧跟着', '片刻后', '须臾',
      '话音刚落', '话音未落', '正说着', '与此同时',
    ]

    const found: Array<{ word: string; count: number }> = []
    const typeCounts: Record<string, number> = {
      '时间跳转': 0,
      '空间切换': 0,
      '视角切换': 0,
      '对话转场': 0,
    }

    for (const tw of transitionWords) {
      const regex = new RegExp(tw, 'g')
      const matches = text.match(regex)
      if (matches && matches.length > 0) {
        found.push({ word: tw, count: matches.length })

        if (['数日后', '不久', '转眼', '很快', '之后', '随后', '片刻后', '须臾'].includes(tw)) {
          typeCounts['时间跳转'] += matches.length
        } else if (['另一边', '镜头切换', '场景转换', '画面一转'].includes(tw)) {
          typeCounts['空间切换'] += matches.length
        } else if (['与此同时', '另一方面'].includes(tw)) {
          typeCounts['视角切换'] += matches.length
        } else if (['话音刚落', '话音未落', '正说着'].includes(tw)) {
          typeCounts['对话转场'] += matches.length
        }
      }
    }

    found.sort((a, b) => b.count - a.count)

    return {
      frequentTransitions: found.slice(0, 10),
      transitionTypes: typeCounts,
      frequency: totalWords > 0 ? found.reduce((s, t) => s + t.count, 0) / (totalWords / 1000) : 0,
    }
  }

  /**
   * 修辞偏好分析
   */
  private analyzeRhetoric(text: string, totalWords: number): RhetoricProfile {
    const thousandWords = Math.max(totalWords / 1000, 1)

    const metaphorCount = (text.match(/像.{1,15}(?:一样|般|似的)|如.{1,15}(?:一般|般)|仿佛.{1,15}(?:一般|般)/g) || []).length
    const parallelismCount = (text.match(/(.{5,20})[，,]\1|(?:.{5,20})[，,](?:.{5,20})[，,](?:.{5,20})/g) || []).length
    const rhetoricalQCount = (text.match(/难道.{1,20}[？?]/g) || []).length
    const personificationCount = (text.match(/(?:风|光|月|日|山|水|花|草|树|石|云|星)(?:在|仿佛|似乎|好像|如同).{1,20}/g) || []).length
    const hyperboleCount = (text.match(/(?:万|千|亿|无尽|无穷|无边|无限|至极|绝顶|盖世|毁天灭地|天翻地覆)/g) || []).length

    // 比喻域分析
    const domains: Record<string, number> = {
      '自然': (text.match(/像.{1,10}(?:山|水|风|雨|雷|电|云|雾|星|月|日|光|暗|火|冰|海|河|湖|雪|霜)/g) || []).length,
      '动物': (text.match(/像.{1,10}(?:虎|狼|蛇|鹰|龙|凤|兽|虫|鱼|鸟|豹|狮|狐|鹤)/g) || []).length,
      '机械': (text.match(/像.{1,10}(?:机器|齿轮|钟表|引擎|刀刃|剑|刀|枪|炮|箭|锁|链|网)/g) || []).length,
      '植物': (text.match(/像.{1,10}(?:树|花|草|叶|藤|竹|木|根|枝|芽|莲|梅|兰|菊)/g) || []).length,
    }

    return {
      metaphorFrequency: metaphorCount / thousandWords,
      metaphorDomains: domains,
      parallelismFrequency: parallelismCount / thousandWords,
      rhetoricalQuestionFrequency: rhetoricalQCount / thousandWords,
      personificationFrequency: personificationCount / thousandWords,
      hyperboleFrequency: hyperboleCount / thousandWords,
    }
  }

  /**
   * 人称偏好分析
   */
  private analyzePerson(text: string): PersonProfile {
    const totalChars = text.length
    const firstPersonCount = (text.match(/我/g) || []).length
    const secondPersonCount = (text.match(/你/g) || []).length
    const thirdPersonCount = (text.match(/他|她|它/g) || []).length
    const totalPerson = firstPersonCount + secondPersonCount + thirdPersonCount || 1

    const povSwitchCount = (text.match(/视角|镜头|画面.{1,5}切换|与此同时.{1,20}另一边/g) || []).length

    return {
      firstPersonRatio: firstPersonCount / totalPerson,
      secondPersonRatio: secondPersonCount / totalPerson,
      thirdPersonRatio: thirdPersonCount / totalPerson,
      povSwitchFrequency: totalChars > 0 ? povSwitchCount / (totalChars / 1000) : 0,
    }
  }

  /**
   * 风格标签分类
   */
  private classifyStyle(
    rhythm: SentenceRhythmSpectrum,
    paragraph: ParagraphStructureProfile,
    rhetoric: RhetoricProfile,
    fingerprint?: StyleFingerprint,
  ): StyleLabel[] {
    const labels: StyleLabel[] = []

    // 节奏 → 标签
    if (rhythm.pattern === 'short_burst') labels.push('简洁', '热血')
    if (rhythm.pattern === 'long_flow') labels.push('华丽', '史诗')
    if (rhythm.avgLength < 25) labels.push('简洁')
    if (rhythm.avgLength > 45) labels.push('细腻')

    // 修辞 → 标签
    if (rhetoric.metaphorFrequency > 5) labels.push('华丽')
    if (rhetoric.hyperboleFrequency > 3) labels.push('热血', '史诗')
    if (rhetoric.personificationFrequency > 2) labels.push('浪漫', '细腻')

    // 段落 → 标签
    if (paragraph.avgLength > 300) labels.push('细腻', '写实')
    if (paragraph.avgLength < 80) labels.push('简洁', '轻快')

    // 指纹补充
    if (fingerprint) {
      if (fingerprint.dialogueRatio > 0.5) labels.push('轻快')
      if (fingerprint.descriptionRatio > 0.5) labels.push('细腻', '写实')
      if (fingerprint.actionRatio > 0.5) labels.push('热血')
    }

    // 去重
    return [...new Set(labels)]
  }

  /**
   * 计算风格稳定性
   */
  private calculateStability(texts: string[]): number {
    if (texts.length < 2) return 0.8

    const sentenceLengths: number[][] = []
    for (const text of texts) {
      const sentences = text.split(/[。！？]/).filter(s => s.trim())
      sentenceLengths.push(sentences.map(s => s.length))
    }

    // 比较各段平均句长的变异系数
    const avgs = sentenceLengths.map(sl =>
      sl.length > 0 ? sl.reduce((s, l) => s + l, 0) / sl.length : 0
    ).filter(a => a > 0)

    if (avgs.length < 2) return 0.8

    const mean = avgs.reduce((s, a) => s + a, 0) / avgs.length
    const std = Math.sqrt(avgs.reduce((s, a) => s + (a - mean) ** 2, 0) / avgs.length)
    const cv = mean > 0 ? std / mean : 0

    return Math.max(0, 1 - cv)
  }

  // ============================================================
  // 工具方法
  // ============================================================

  rhythmLabel(pattern: RhythmPattern): string {
    const labels: Record<RhythmPattern, string> = {
      short_burst: '短句爆发',
      long_flow: '长句流畅',
      mixed_wave: '长短交替',
      pyramid: '金字塔渐进',
      inverted_pyramid: '倒金字塔',
      balanced: '均衡',
    }
    return labels[pattern] || pattern
  }
}