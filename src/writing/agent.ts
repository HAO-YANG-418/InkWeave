// ============================================================
// WritingAgent — GWE v13.0 写作智能体
// 封装 WritingOrchestrator，提供多章节写作会话管理
// 核心能力：会话管理 → 意图分析 → 编排生成 → 质量追踪 → 连续写作
// ============================================================

import { WritingOrchestrator } from './orchestrator'
import type {
  WriteChapterRequest,
  WriteChapterResult,
  OrchestratorConfig,
} from './orchestrator'
import type { IntentType } from '../intent/types'
import type { QualityDimension } from '../reflection/types'
import type { LLMProvider } from '../types'
import type { WritingContext } from './types'
import { createEmptyContext } from './context-builder'
import { logWarn } from '../logger'

// ============================================================
// 类型定义
// ============================================================

/** 写作智能体配置 */
export interface WritingAgentConfig {
  /** 编排器配置 */
  orchestrator: Partial<OrchestratorConfig>
  /** 每章目标字数 */
  defaultTargetWords: number
  /** 是否自动记录每章反馈 */
  autoRecordFeedback: boolean
  /** 是否在每章后自动更新反模式追踪 */
  autoAnalyzePatterns: boolean
  /** 连续写作时是否自动推进冷却系统 */
  autoAdvanceCooling: boolean
}

const DEFAULT_AGENT_CONFIG: WritingAgentConfig = {
  orchestrator: {},
  defaultTargetWords: 3000,
  autoRecordFeedback: true,
  autoAnalyzePatterns: true,
  autoAdvanceCooling: true,
}

/** 写作会话中的章节记录 */
export interface SessionChapter {
  /** 章节编号 */
  number: number
  /** 章节标题 */
  title: string
  /** 章节内容 */
  content: string
  /** 意图类型 */
  intent: string
  /** 质量评分 */
  qualityScore: number
  /** 是否通过质量门 */
  passed: boolean
  /** 重写次数 */
  rewriteRounds: number
  /** 字数 */
  wordCount: number
  /** 各维度评分 */
  dimensionScores: Record<string, number>
  /** 生成耗时（ms） */
  generationTimeMs: number
  /** 写作建议 */
  suggestions: string[]
}

/** 写作会话 */
export interface WritingSession {
  /** 会话ID */
  id: string
  /** 书名 */
  bookTitle: string
  /** 已完成的章节 */
  chapters: SessionChapter[]
  /** 写作上下文 */
  context: WritingContext
  /** 开始时间 */
  startedAt: number
  /** 最后更新时间 */
  lastUpdatedAt: number
  /** 总字数 */
  totalWordCount: number
  /** 平均质量分 */
  averageQualityScore: number
  /** 质量趋势（最近5章平均分变化） */
  qualityTrend: number[]
  /** 意图分布 */
  intentDistribution: Record<string, number>
  /** 累计重写次数 */
  totalRewriteRounds: number
  /** 会话统计 */
  stats: {
    totalChapters: number
    totalWords: number
    totalTimeMs: number
    averageTimePerChapter: number
    passRate: number
  }
}

/** 智能体写作结果 */
export interface AgentWriteResult {
  /** 写作结果 */
  chapterResult: WriteChapterResult
  /** 更新后的会话 */
  session: WritingSession
}

// ============================================================
// WritingAgent 主类
// ============================================================

export class WritingAgent {
  private config: WritingAgentConfig
  private orchestrator: WritingOrchestrator
  private session: WritingSession | null = null
  private llm: LLMProvider | null = null

  constructor(config?: Partial<WritingAgentConfig>, llm?: LLMProvider | null, orchestrator?: WritingOrchestrator) {
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config }
    this.orchestrator = orchestrator ?? new WritingOrchestrator(this.config.orchestrator, llm ?? null)
    this.llm = llm ?? null
  }

  /**
   * 异步创建 WritingAgent 实例
   * v12.0: 使用异步工厂避免 KB 加载时的 OOM
   */
  static async create(config?: Partial<WritingAgentConfig>, llm?: LLMProvider | null): Promise<WritingAgent> {
    const orch = await WritingOrchestrator.create(config?.orchestrator, llm ?? null)
    return new WritingAgent(config, llm, orch)
  }

  /** 设置 LLM Provider */
  setLLM(llm: LLMProvider): void {
    this.llm = llm
    this.orchestrator.setLLM(llm)
  }

  /** 获取编排器 */
  getOrchestrator(): WritingOrchestrator {
    return this.orchestrator
  }

  // ============================================================
  // 会话管理
  // ============================================================

  /**
   * 创建新写作会话
   */
  createSession(bookTitle: string, genre: string = '玄幻'): WritingSession {
    this.session = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      bookTitle,
      chapters: [],
      context: createEmptyContext({ title: bookTitle, genre }),
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      totalWordCount: 0,
      averageQualityScore: 0,
      qualityTrend: [],
      intentDistribution: {},
      totalRewriteRounds: 0,
      stats: {
        totalChapters: 0,
        totalWords: 0,
        totalTimeMs: 0,
        averageTimePerChapter: 0,
        passRate: 0,
      },
    }
    return this.session
  }

  /** 获取当前会话 */
  getSession(): WritingSession | null {
    return this.session
  }

  /** 从已有上下文恢复会话 */
  resumeSession(context: WritingContext): WritingSession {
    this.session = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      bookTitle: context.book.title || '未命名',
      chapters: context.chapters
        .filter(c => c.content)
        .map(c => ({
          number: c.number,
          title: c.title,
          content: c.content,
          intent: 'unknown',
          qualityScore: 0,
          passed: true,
          rewriteRounds: 0,
          wordCount: c.wordCount || c.content.length,
          dimensionScores: {},
          generationTimeMs: 0,
          suggestions: [],
        })),
      context,
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      totalWordCount: context.chapters.reduce((sum, c) => sum + (c.wordCount || c.content.length), 0),
      averageQualityScore: 0,
      qualityTrend: [],
      intentDistribution: {},
      totalRewriteRounds: 0,
      stats: {
        totalChapters: context.chapters.filter(c => c.content).length,
        totalWords: context.chapters.reduce((sum, c) => sum + (c.wordCount || c.content.length), 0),
        totalTimeMs: 0,
        averageTimePerChapter: 0,
        passRate: 1,
      },
    }
    return this.session
  }

  // ============================================================
  // 核心方法：写一章
  // ============================================================

  /**
   * 写一章 — 完整的智能写作流程
   */
  async writeChapter(
    chapterNumber: number,
    title: string,
    options?: {
      userIntent?: IntentType
      outline?: string
      userInstruction?: string
      targetWords?: number
    },
  ): Promise<AgentWriteResult> {
    if (!this.llm) {
      throw new Error('[Agent] 未设置 LLM Provider，请先调用 setLLM()')
    }

    if (!this.session) {
      throw new Error('[Agent] 未创建写作会话，请先调用 createSession()')
    }

    const request: WriteChapterRequest = {
      chapterNumber,
      title,
      userIntent: options?.userIntent,
      outline: options?.outline,
      userInstruction: options?.userInstruction,
      targetWords: options?.targetWords || this.config.defaultTargetWords,
      context: this.session.context,
    }

    const result = await this.orchestrator.writeChapter(request)

    // 将会话上下文与编排器同步
    this.session.context = this.orchestrator.getWritingEngine().getContext()

    // 记录章节
    this.recordChapter(chapterNumber, title, result)

    // 自动分析反模式
    if (this.config.autoAnalyzePatterns && result.content) {
      this.analyzePatternsAfterWrite(chapterNumber, result.content)
    }

    return {
      chapterResult: result,
      session: this.session,
    }
  }

  /**
   * 连续写多章
   */
  async writeChapters(
    chapters: Array<{
      number: number
      title: string
      intent?: IntentType
      outline?: string
      instruction?: string
      targetWords?: number
    }>,
  ): Promise<AgentWriteResult[]> {
    const results: AgentWriteResult[] = []

    for (const ch of chapters) {
      const result = await this.writeChapter(ch.number, ch.title, {
        userIntent: ch.intent,
        outline: ch.outline,
        userInstruction: ch.instruction,
        targetWords: ch.targetWords,
      })
      results.push(result)
    }

    return results
  }

  // ============================================================
  // 会话统计
  // ============================================================

  /** 获取质量报告 */
  getQualityReport(): {
    overall: number
    dimensions: Record<string, number>
    trend: number[]
    weakAreas: Array<{ dimension: string; score: number }>
    strongAreas: Array<{ dimension: string; score: number }>
    recommendations: string[]
  } {
    if (!this.session || this.session.chapters.length === 0) {
      return {
        overall: 0,
        dimensions: {},
        trend: [],
        weakAreas: [],
        strongAreas: [],
        recommendations: ['暂无足够数据，请先写几章'],
      }
    }

    const chapters = this.session.chapters
    const recentChapters = chapters.slice(-5)

    // 各维度平均分
    const dimensionTotals: Record<string, number> = {}
    const dimensionCounts: Record<string, number> = {}
    for (const ch of recentChapters) {
      for (const [dim, score] of Object.entries(ch.dimensionScores)) {
        dimensionTotals[dim] = (dimensionTotals[dim] || 0) + score
        dimensionCounts[dim] = (dimensionCounts[dim] || 0) + 1
      }
    }

    const dimensionAverages: Record<string, number> = {}
    for (const dim of Object.keys(dimensionTotals)) {
      dimensionAverages[dim] = dimensionTotals[dim] / dimensionCounts[dim]
    }

    // 弱项和强项
    const sorted = Object.entries(dimensionAverages).sort((a, b) => a[1] - b[1])
    const weakAreas = sorted.slice(0, 3).map(([d, s]) => ({ dimension: d, score: Math.round(s * 100) / 100 }))
    const strongAreas = sorted.slice(-3).reverse().map(([d, s]) => ({ dimension: d, score: Math.round(s * 100) / 100 }))

    // 建议
    const recommendations: string[] = []
    for (const wa of weakAreas) {
      if (wa.score < 0.6) {
        recommendations.push(`「${wa.dimension}」维度得分较低（${wa.score}），建议重点改进`)
      }
    }

    return {
      overall: this.session.averageQualityScore,
      dimensions: dimensionAverages,
      trend: this.session.qualityTrend,
      weakAreas,
      strongAreas,
      recommendations,
    }
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /** 记录章节到会话 */
  private recordChapter(
    chapterNumber: number,
    title: string,
    result: WriteChapterResult,
  ): void {
    if (!this.session) return

    const sessionChapter: SessionChapter = {
      number: chapterNumber,
      title,
      content: result.content,
      intent: result.intent.primary.type,
      qualityScore: result.qualityScore,
      passed: result.success,
      rewriteRounds: result.rewriteRounds,
      wordCount: result.wordCount,
      dimensionScores: Object.fromEntries(
        Object.entries(result.reflection.dimensionScores).map(([k, v]) => [k, Math.round(v * 100) / 100])
      ),
      generationTimeMs: result.timing.totalMs,
      suggestions: result.suggestions,
    }

    // 更新或添加章节
    const existingIdx = this.session.chapters.findIndex(c => c.number === chapterNumber)
    if (existingIdx >= 0) {
      this.session.chapters[existingIdx] = sessionChapter
    } else {
      this.session.chapters.push(sessionChapter)
    }
    this.session.chapters.sort((a, b) => a.number - b.number)

    // 更新统计
    this.session.lastUpdatedAt = Date.now()
    this.session.totalWordCount = this.session.chapters.reduce((s, c) => s + c.wordCount, 0)
    this.session.totalRewriteRounds = this.session.chapters.reduce((s, c) => s + c.rewriteRounds, 0)

    const passedChapters = this.session.chapters.filter(c => c.passed)
    this.session.averageQualityScore = this.session.chapters.length > 0
      ? Math.round(this.session.chapters.reduce((s, c) => s + c.qualityScore, 0) / this.session.chapters.length * 100) / 100
      : 0

    // 质量趋势（最近5章）
    this.session.qualityTrend = this.session.chapters.slice(-5).map(c => c.qualityScore)

    // 意图分布
    this.session.intentDistribution = {}
    for (const ch of this.session.chapters) {
      this.session.intentDistribution[ch.intent] = (this.session.intentDistribution[ch.intent] || 0) + 1
    }

    // 会话统计
    const totalTime = this.session.chapters.reduce((s, c) => s + c.generationTimeMs, 0)
    this.session.stats = {
      totalChapters: this.session.chapters.length,
      totalWords: this.session.totalWordCount,
      totalTimeMs: totalTime,
      averageTimePerChapter: this.session.chapters.length > 0
        ? Math.round(totalTime / this.session.chapters.length)
        : 0,
      passRate: this.session.chapters.length > 0
        ? Math.round(passedChapters.length / this.session.chapters.length * 100) / 100
        : 0,
    }
  }

  /** 写后自动分析反模式 */
  private async analyzePatternsAfterWrite(chapterNumber: number, content: string): Promise<void> {
    if (!this.session) return
    try {
      const chapterId = `ch_${chapterNumber}`
      const engine = this.orchestrator.getWritingEngine()
      engine.addChapter({
        id: chapterId,
        title: `第${chapterNumber}章`,
        number: chapterNumber,
        content,
        wordCount: content.length,
        status: 'done',
      })
      await engine.analyzeChapterAntiPattern(chapterId, this.llm)
    } catch (e) {
      logWarn('Agent', '反模式分析失败', e)
    }
  }
}