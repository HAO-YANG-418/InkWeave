// ============================================================
// 反馈学习引擎 — GWE v6.0 基础智能层
// 核心能力：从用户每次修改中学习，建立风格指纹，自动应用偏好
// 这是"超越人类记忆"的起点：引擎不会忘记任何一次用户偏好
// ============================================================

import {
  type FeedbackEvent,
  type ChangeType,
  type LearnedPattern,
  type PatternType,
  type StyleFingerprint,
  type PreferenceProfile,
  type FeedbackLoopConfig,
  type LearningSuggestion,
  DEFAULT_FEEDBACK_CONFIG,
} from './types'

// ============================================================
// 反馈学习引擎
// ============================================================

export class FeedbackLoop {
  private config: FeedbackLoopConfig
  private events: FeedbackEvent[] = []
  private profile: PreferenceProfile | null = null
  private eventCounter = 0

  constructor(config?: Partial<FeedbackLoopConfig>) {
    this.config = { ...DEFAULT_FEEDBACK_CONFIG, ...config }
  }

  /**
   * 记录反馈事件
   */
  record(event: Omit<FeedbackEvent, 'id' | 'timestamp'>): FeedbackEvent {
    const fullEvent: FeedbackEvent = {
      ...event,
      id: `fe_${++this.eventCounter}_${Date.now()}`,
      timestamp: Date.now(),
    }

    this.events.push(fullEvent)

    // 限制事件数量
    if (this.events.length > this.config.maxEvents) {
      this.events = this.events.slice(-this.config.maxEvents)
    }

    // 积累足够事件后触发学习
    if (this.events.length >= this.config.minEventsForLearning) {
      this.learn()
    }

    return fullEvent
  }

  /**
   * 记录用户编辑
   * 最常用的反馈入口
   */
  recordEdit(
    originalContent: string,
    modifiedContent: string,
    chapterNumber: number,
    note?: string,
    location?: number,
  ): FeedbackEvent {
    const changeType = this.detectChangeType(originalContent, modifiedContent)

    return this.record({
      type: 'edit',
      chapterNumber,
      originalContent,
      modifiedContent,
      location,
      note,
      changeType,
    })
  }

  /**
   * 记录用户接受（无修改）
   */
  recordAccept(chapterNumber: number, content: string): FeedbackEvent {
    return this.record({
      type: 'accept',
      chapterNumber,
      originalContent: content,
    })
  }

  /**
   * 记录用户拒绝
   */
  recordReject(chapterNumber: number, content: string, reason?: string): FeedbackEvent {
    return this.record({
      type: 'reject',
      chapterNumber,
      originalContent: content,
      note: reason,
    })
  }

  /**
   * 记录用户偏好表达
   */
  recordPreference(chapterNumber: number, preference: string): FeedbackEvent {
    return this.record({
      type: 'preference',
      chapterNumber,
      note: preference,
    })
  }

  /**
   * 触发学习 — 从积累的反馈中提取模式和偏好
   */
  learn(): PreferenceProfile {
    const patterns = this.extractPatterns()
    const fingerprint = this.extractFingerprint()
    const acceptCount = this.events.filter(e => e.type === 'accept').length
    const rejectCount = this.events.filter(e => e.type === 'reject').length
    const total = this.events.length

    this.profile = {
      fingerprint,
      learnedPatterns: patterns,
      preferenceStrengths: this.calculatePreferenceStrengths(patterns),
      totalEvents: total,
      acceptRate: total > 0 ? acceptCount / (acceptCount + rejectCount || 1) : 0,
      createdAt: this.profile?.createdAt || Date.now(),
      lastUpdated: Date.now(),
    }

    return this.profile
  }

  /**
   * 获取学习建议 — 用于注入到提示词中
   */
  getSuggestions(): LearningSuggestion[] {
    if (!this.profile || this.profile.learnedPatterns.length === 0) {
      return []
    }

    const suggestions: LearningSuggestion[] = []

    for (const pattern of this.profile.learnedPatterns) {
      if (pattern.confidence < this.config.minPatternConfidence) continue

      switch (pattern.type) {
        case 'sentence_length':
          if (pattern.rules[0]?.includes('短')) {
            suggestions.push({
              type: 'style',
              description: '用户偏好短句',
              confidence: pattern.confidence,
              action: '控制句子长度在20-40字，避免长句堆砌',
            })
          } else if (pattern.rules[0]?.includes('长')) {
            suggestions.push({
              type: 'style',
              description: '用户偏好长句',
              confidence: pattern.confidence,
              action: '使用长句进行描写，保持句子流畅',
            })
          }
          break

        case 'opening_style':
          suggestions.push({
            type: 'opening',
            description: `用户偏好开头风格：${pattern.description}`,
            confidence: pattern.confidence,
            action: pattern.rules.join('；'),
          })
          break

        case 'ending_style':
          suggestions.push({
            type: 'ending',
            description: `用户偏好结尾风格：${pattern.description}`,
            confidence: pattern.confidence,
            action: pattern.rules.join('；'),
          })
          break

        case 'forbidden_pattern':
          suggestions.push({
            type: 'forbidden',
            description: `用户禁止的模式：${pattern.description}`,
            confidence: pattern.confidence,
            action: `避免使用：${pattern.rules.join('、')}`,
          })
          break

        case 'preferred_pattern':
          suggestions.push({
            type: 'style',
            description: `用户偏好的模式：${pattern.description}`,
            confidence: pattern.confidence,
            action: `尽量使用：${pattern.rules.join('、')}`,
          })
          break

        case 'dialogue_style':
          suggestions.push({
            type: 'dialogue',
            description: `用户偏好对话风格：${pattern.description}`,
            confidence: pattern.confidence,
            action: pattern.rules.join('；'),
          })
          break

        case 'pacing_preference':
          suggestions.push({
            type: 'pacing',
            description: `用户偏好节奏：${pattern.description}`,
            confidence: pattern.confidence,
            action: pattern.rules.join('；'),
          })
          break
      }
    }

    return suggestions
  }

  /**
   * 生成学习驱动的提示词注入
   */
  generatePromptInjection(): string {
    const suggestions = this.getSuggestions()
    if (suggestions.length === 0) return ''

    const lines: string[] = ['【学习到的用户偏好】']
    for (const s of suggestions) {
      lines.push(`- ${s.action}`)
    }

    return lines.join('\n')
  }

  /**
   * 获取当前偏好画像
   */
  getProfile(): PreferenceProfile | null {
    return this.profile
  }

  /**
   * 获取反馈历史
   */
  getHistory(limit = 50): FeedbackEvent[] {
    return this.events.slice(-limit)
  }

  /**
   * 获取反馈统计
   */
  getStats(): {
    totalEvents: number
    acceptRate: number
    editRate: number
    rejectRate: number
    topChangeTypes: Array<{ type: ChangeType; count: number }>
    patternCount: number
  } {
    const total = this.events.length
    const acceptCount = this.events.filter(e => e.type === 'accept').length
    const editCount = this.events.filter(e => e.type === 'edit').length
    const rejectCount = this.events.filter(e => e.type === 'reject').length

    // 统计改动类型
    const changeTypeCounts: Record<string, number> = {}
    for (const e of this.events) {
      if (e.changeType) {
        changeTypeCounts[e.changeType] = (changeTypeCounts[e.changeType] || 0) + 1
      }
    }
    const topChangeTypes = Object.entries(changeTypeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type: type as ChangeType, count }))

    return {
      totalEvents: total,
      acceptRate: total > 0 ? acceptCount / total : 0,
      editRate: total > 0 ? editCount / total : 0,
      rejectRate: total > 0 ? rejectCount / total : 0,
      topChangeTypes,
      patternCount: this.profile?.learnedPatterns.length || 0,
    }
  }

  /**
   * 重置学习状态
   */
  reset(): void {
    this.events = []
    this.profile = null
    this.eventCounter = 0
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 检测改动类型
   */
  private detectChangeType(original: string, modified: string): ChangeType {
    if (!original || !modified) return 'rephrase'

    const origLen = original.length
    const modLen = modified.length
    const ratio = modLen / Math.max(origLen, 1)

    if (ratio < 0.5) return 'shorten'
    if (ratio > 1.8) return 'expand'
    if (origLen === modLen && original !== modified) return 'rephrase'

    return 'style_change'
  }

  /**
   * 从编辑事件中提取模式
   */
  private extractPatterns(): LearnedPattern[] {
    const patterns: LearnedPattern[] = []
    const edits = this.events.filter(e => e.type === 'edit' && e.originalContent && e.modifiedContent)

    if (edits.length < this.config.minEvidenceCount) return patterns

    // 模式1：句子长度偏好
    const sentenceLengthPattern = this.extractSentenceLengthPattern(edits)
    if (sentenceLengthPattern) patterns.push(sentenceLengthPattern)

    // 模式2：禁止模式
    const forbiddenPatterns = this.extractForbiddenPatterns(edits)
    patterns.push(...forbiddenPatterns)

    // 模式3：偏好模式
    const preferredPatterns = this.extractPreferredPatterns(edits)
    patterns.push(...preferredPatterns)

    // 模式4：开头风格偏好
    const openingPattern = this.extractOpeningStylePattern(edits)
    if (openingPattern) patterns.push(openingPattern)

    // 模式5：结尾风格偏好
    const endingPattern = this.extractEndingStylePattern(edits)
    if (endingPattern) patterns.push(endingPattern)

    return patterns
  }

  private extractSentenceLengthPattern(
    edits: FeedbackEvent[],
  ): LearnedPattern | null {
    let shortenCount = 0
    let expandCount = 0

    for (const e of edits) {
      if (e.changeType === 'shorten') shortenCount++
      if (e.changeType === 'expand') expandCount++
    }

    const total = shortenCount + expandCount
    if (total < this.config.minEvidenceCount) return null

    const shortRatio = shortenCount / total

    if (shortRatio > 0.7) {
      return {
        id: 'sentence_length_short',
        type: 'sentence_length',
        description: '用户倾向于缩短句子',
        confidence: shortRatio,
        evidenceCount: shortenCount,
        lastUpdated: Date.now(),
        rules: ['句子长度控制在20-40字', '避免超过60字的长句', '将长句拆分为短句组合'],
      }
    }

    if (shortRatio < 0.3) {
      return {
        id: 'sentence_length_long',
        type: 'sentence_length',
        description: '用户倾向于扩展内容',
        confidence: 1 - shortRatio,
        evidenceCount: expandCount,
        lastUpdated: Date.now(),
        rules: ['适当增加描写细节', '句子可以稍长但需流畅', '保持信息密度'],
      }
    }

    return null
  }

  private extractForbiddenPatterns(edits: FeedbackEvent[]): LearnedPattern[] {
    const deletedPatterns: string[] = []

    for (const e of edits) {
      if (!e.originalContent || !e.modifiedContent) continue
      if (e.changeType !== 'delete' && e.changeType !== 'rephrase') continue

      // 找到被删除的内容
      const orig = e.originalContent
      const mod = e.modifiedContent

      // 简化：检测被删除的常见套路
      if (orig.includes('嘴角') && !mod.includes('嘴角')) {
        deletedPatterns.push('嘴角上扬/弧度')
      }
      if (orig.includes('眼中闪过') && !mod.includes('眼中闪过')) {
        deletedPatterns.push('眼中闪过XX光芒')
      }
      if (orig.includes('倒吸') && !mod.includes('倒吸')) {
        deletedPatterns.push('倒吸一口凉气')
      }
      if (orig.includes('瞳孔') && !mod.includes('瞳孔')) {
        deletedPatterns.push('瞳孔XX')
      }
      if (orig.includes('他不知道') && !mod.includes('他不知道')) {
        deletedPatterns.push('"他不知道"预告式假钩子')
      }
      if (orig.includes('不是') && orig.includes('而是') && (!mod.includes('不是') || !mod.includes('而是'))) {
        deletedPatterns.push('"不是X而是Y"句式')
      }
    }

    if (deletedPatterns.length < this.config.minEvidenceCount) return []

    const freq: Record<string, number> = {}
    for (const p of deletedPatterns) {
      freq[p] = (freq[p] || 0) + 1
    }

    return Object.entries(freq)
      .filter(([, count]) => count >= this.config.minEvidenceCount)
      .map(([pattern, count]) => ({
        id: `forbidden_${pattern.slice(0, 10)}`,
        type: 'forbidden_pattern' as PatternType,
        description: `用户频繁删除"${pattern}"`,
        confidence: Math.min(count / this.config.minEvidenceCount, 1),
        evidenceCount: count,
        lastUpdated: Date.now(),
        rules: [pattern],
      }))
  }

  private extractPreferredPatterns(edits: FeedbackEvent[]): LearnedPattern[] {
    const addedPatterns: string[] = []

    for (const e of edits) {
      if (!e.originalContent || !e.modifiedContent) continue
      if (e.changeType !== 'add' && e.changeType !== 'expand') continue

      const mod = e.modifiedContent
      const orig = e.originalContent

      // 检测新增的内容模式
      const newContent = mod.replace(orig, '')
      if (newContent.length < 10) continue

      if (newContent.includes('声音') || newContent.includes('听到') || newContent.includes('响')) {
        addedPatterns.push('增加听觉描写')
      }
      if (newContent.includes('触') || newContent.includes('冷') || newContent.includes('热') || newContent.includes('痛')) {
        addedPatterns.push('增加触觉描写')
      }
      if (newContent.includes('闻') || newContent.includes('气味') || newContent.includes('香') || newContent.includes('腥')) {
        addedPatterns.push('增加嗅觉描写')
      }
    }

    if (addedPatterns.length < this.config.minEvidenceCount) return []

    const freq: Record<string, number> = {}
    for (const p of addedPatterns) {
      freq[p] = (freq[p] || 0) + 1
    }

    return Object.entries(freq)
      .filter(([, count]) => count >= this.config.minEvidenceCount)
      .map(([pattern, count]) => ({
        id: `preferred_${pattern.slice(0, 10)}`,
        type: 'preferred_pattern' as PatternType,
        description: pattern,
        confidence: Math.min(count / this.config.minEvidenceCount, 1),
        evidenceCount: count,
        lastUpdated: Date.now(),
        rules: [pattern],
      }))
  }

  private extractOpeningStylePattern(edits: FeedbackEvent[]): LearnedPattern | null {
    const openingEdits: string[] = []

    for (const e of edits) {
      if (!e.originalContent || !e.modifiedContent) continue

      // 检查开头是否被修改
      const origStart = e.originalContent.slice(0, 50)
      const modStart = e.modifiedContent.slice(0, 50)

      if (origStart !== modStart) {
        // 用户修改了开头
        if (modStart.match(/[声光音气味冷暖痛]/)) {
          openingEdits.push('感官锚点开头')
        } else if (modStart.match(/^[""「『]/)) {
          openingEdits.push('对话开头')
        } else if (modStart.match(/^(他|她|它|他们|我|你)/)) {
          openingEdits.push('动作开头')
        }
      }
    }

    if (openingEdits.length < this.config.minEvidenceCount) return null

    const freq: Record<string, number> = {}
    for (const p of openingEdits) {
      freq[p] = (freq[p] || 0) + 1
    }

    const top = Object.entries(freq).sort(([, a], [, b]) => b - a)[0]
    if (!top || top[1] < this.config.minEvidenceCount) return null

    return {
      id: `opening_${top[0].slice(0, 10)}`,
      type: 'opening_style',
      description: `用户偏好"${top[0]}"作为章节开头`,
      confidence: top[1] / openingEdits.length,
      evidenceCount: top[1],
      lastUpdated: Date.now(),
      rules: [`章节开头优先使用${top[0]}`, '避免使用叙事总结句作为开头'],
    }
  }

  private extractEndingStylePattern(edits: FeedbackEvent[]): LearnedPattern | null {
    const endingEdits: string[] = []

    for (const e of edits) {
      if (!e.originalContent || !e.modifiedContent) continue

      const origEnd = e.originalContent.slice(-100)
      const modEnd = e.modifiedContent.slice(-100)

      if (origEnd !== modEnd) {
        if (modEnd.includes('？')) {
          endingEdits.push('悬念结尾')
        } else if (modEnd.includes('突然') || modEnd.includes('忽然') || modEnd.includes('却发现')) {
          endingEdits.push('转折结尾')
        } else if (modEnd.includes('沉默') || modEnd.includes('叹息') || modEnd.includes('目光')) {
          endingEdits.push('情绪结尾')
        }
      }
    }

    if (endingEdits.length < this.config.minEvidenceCount) return null

    const freq: Record<string, number> = {}
    for (const p of endingEdits) {
      freq[p] = (freq[p] || 0) + 1
    }

    const top = Object.entries(freq).sort(([, a], [, b]) => b - a)[0]
    if (!top || top[1] < this.config.minEvidenceCount) return null

    return {
      id: `ending_${top[0].slice(0, 10)}`,
      type: 'ending_style',
      description: `用户偏好"${top[0]}"作为章节结尾`,
      confidence: top[1] / endingEdits.length,
      evidenceCount: top[1],
      lastUpdated: Date.now(),
      rules: [`章节结尾优先使用${top[0]}`, '避免平淡的叙事总结结尾'],
    }
  }

  /**
   * 提取风格指纹
   */
  private extractFingerprint(): StyleFingerprint {
    const acceptedContent = this.events
      .filter(e => e.type === 'accept' && e.originalContent)
      .map(e => e.originalContent!)
      .join('\n')

    const editedContent = this.events
      .filter(e => e.type === 'edit' && e.modifiedContent)
      .map(e => e.modifiedContent!)
      .join('\n')

    const allContent = acceptedContent + editedContent

    if (!allContent.trim()) {
      return this.getDefaultFingerprint()
    }

    const sentences = allContent.split(/[。！？]/).filter(s => s.trim())
    const avgLen = sentences.reduce((s, sent) => s + sent.length, 0) / Math.max(sentences.length, 1)

    const lengths = sentences.map(s => s.length)
    const mean = lengths.reduce((s, l) => s + l, 0) / lengths.length
    const variance = lengths.reduce((s, l) => s + (l - mean) ** 2, 0) / lengths.length

    const dialogueCount = (allContent.match(/[「」"']/g) || []).length / 2
    const totalSentences = sentences.length
    const dialogueRatio = totalSentences > 0 ? dialogueCount / totalSentences : 0.3

    const descriptionCount = (allContent.match(/看|见|望|观|听|闻|触|感|光|暗|色|影|形/g) || []).length
    const descriptionRatio = totalSentences > 0 ? descriptionCount / totalSentences : 0.3

    const actionCount = (allContent.match(/走|跑|跳|冲|击|打|斩|挥|踢|抓|推|拉|抱|握|举/g) || []).length
    const actionRatio = totalSentences > 0 ? actionCount / totalSentences : 0.4

    return {
      avgSentenceLength: avgLen,
      sentenceLengthVariance: variance,
      dialogueRatio,
      descriptionRatio,
      actionRatio,
      avgParagraphLength: 0, // 需要段落分割，简化处理
      commonRhetoric: [],
      forbiddenPatterns: this.profile?.fingerprint.forbiddenPatterns || [],
      preferredPatterns: this.profile?.fingerprint.preferredPatterns || [],
      lastUpdated: Date.now(),
      sampleCount: this.events.length,
    }
  }

  private getDefaultFingerprint(): StyleFingerprint {
    return {
      avgSentenceLength: 30,
      sentenceLengthVariance: 100,
      dialogueRatio: 0.3,
      descriptionRatio: 0.3,
      actionRatio: 0.4,
      avgParagraphLength: 150,
      commonRhetoric: [],
      forbiddenPatterns: [],
      preferredPatterns: [],
      lastUpdated: Date.now(),
      sampleCount: 0,
    }
  }

  /**
   * 计算偏好强度
   */
  private calculatePreferenceStrengths(patterns: LearnedPattern[]): Record<string, number> {
    const strengths: Record<string, number> = {}

    for (const pattern of patterns) {
      strengths[pattern.type] = pattern.confidence
    }

    return strengths
  }
}