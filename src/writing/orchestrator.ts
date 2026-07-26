// ============================================================
// WritingOrchestrator — GWE v13.0 写作编排器
// 串联四大智能回路：冷却 → 记忆 → 规划 → 反思
// 核心能力：端到端的"输入意图 → 生成 → 评估 → 重写 → 输出"完整写作循环
// ============================================================

import { IntentEngine } from '../intent/engine'
import type { IntentResult, ChapterContext, IntentType } from '../intent/types'
import { CoolingSystem, MemoryCoolingStorage } from '../cooling/cooling-system'
import type { SmartDetectionResult, CoolingRecommendation } from '../cooling/cooling-system'
import { SelfReflection } from '../reflection/engine'
import type { ReflectionResult, ReflectionConfig, QualityConcern, QualityDimension } from '../reflection/types'
import { LongTermMemory } from '../memory/long-term-memory'
import type { MemorySearchResult, MemoryEntry } from '../memory/types'
import { PacingCurve } from '../planning/pacing-curve'
import type { LLMProvider, ChatMessage } from '../types'
import type { WritingContext } from './types'
import {
  buildWritingMessages,
  getCurrentChapter,
  getPreviousChapter,
  createEmptyContext,
} from './context-builder'
import type { GWEWritingEngine } from './engine'
import { createWritingEngine } from './engine'
import { logWarn } from '../logger'

// ============================================================
// 内容后处理：清理LLM输出的markdown噪音
// ============================================================

/**
 * 清理LLM生成的正文中的markdown格式噪音
 * - 去掉markdown标题（# ## ### 开头行）
 * - 去掉代码块标记（```）
 * - 去掉加粗/斜体标记（** __ * _）
 * - 去掉水平线（--- ***）
 */
function cleanMarkdownNoise(content: string): string {
  let cleaned = content

  // 去掉markdown标题行（# 开头，但保留正文中以#开头的对话）
  cleaned = cleaned.replace(/^#{1,6}\s+.+$/gm, '')

  // 去掉代码块标记
  cleaned = cleaned.replace(/^```[\s\S]*?```$/gm, '')
  cleaned = cleaned.replace(/^```\w*$/gm, '')

  // 去掉水平线
  cleaned = cleaned.replace(/^[-*_]{3,}\s*$/gm, '')

  // 去掉加粗标记（保留内容）
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1')

  // 去掉多余空行（连续3个以上空行压缩为2个）
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n')

  // 去掉首尾空白
  cleaned = cleaned.trim()

  return cleaned
}

// ============================================================
// v12.12: 维度专项重写策略表
// 每个维度有独立的修复策略，LLM只聚焦一个维度做精准修改
// ============================================================

interface DimensionRewriteStrategy {
  label: string
  /** 修改目标：一句话描述LLM具体要改什么 */
  target: string
  /** 逐条修复指令 */
  instructions: string[]
}

const DIMENSION_REWRITE_STRATEGIES: Partial<Record<QualityDimension, DimensionRewriteStrategy>> = {
  emotional_impact: {
    label: '情感冲击',
    target: '情绪必须通过具体行为/身体反应/环境投射来展现，禁止用情绪标签词告知',
    instructions: [
      `- 定位所有"告知情绪"的句子（如"他感到愤怒""心中涌起悲伤""一股绝望袭来"），将其改写为"展现情绪"`,
      `- 展现方式：`,
      `  · 身体反应：握拳/发抖/呼吸急促/瞳孔放大/脸色变化/心跳加速`,
      `  · 行为变化：摔东西/沉默/语速变化/动作幅度变化/回避眼神`,
      `  · 环境投射：主角的情绪影响他对环境的感知（愤怒时觉得周围很吵，悲伤时觉得世界灰暗）`,
      `- 至少制造一个"心跳时刻"——让读者屏住呼吸的瞬间（意外发现/关键抉择/关系转折）`,
      `- 高潮场景用短句加速、感官爆发、动作升格来强化情绪`,
    ],
  },
  dialogue_quality: {
    label: '对话质量',
    target: '每句对话必须推进剧情或展现性格或制造张力，砍掉无意义对话',
    instructions: [
      `- 砍掉所有纯功能应答（"嗯""哦""好的""知道了"），除非后面紧跟有信息量的内容`,
      `- 砍掉所有寒暄/客套话（"吃了没""天气不错"等无意义对话）`,
      `- 找到任何超过3句的连续设定解释，拆散为动作+对话交替，或改为场景展示`,
      `- 为重要对话添加"潜台词"层：角色嘴上说的和心里想的不一致`,
      `- 对话引导词多样化：用"冷哼""打断""沉吟""头也不抬"等替代"说""道""问"`,
      `- 重要对话中穿插沉默/停顿/打断，避免一问一答的审讯感`,
    ],
  },
  originality: {
    label: '原创性',
    target: '替换所有套路化描写为具体的、有个人特色的表达',
    instructions: [
      `- 扫描并替换以下高频套路词为具体描写：`,
      `  · "嘴角勾起一抹弧度/冷笑" → 写嘴部具体动作（抿嘴/龇牙/嘴角抽搐/咬紧牙关）`,
      `  · "眼中闪过一丝寒芒/精光/杀意" → 写眼神变化的具体方式（瞳孔收缩/眯眼/目光锁定/眼神暗了暗）`,
      `  · "倒吸一口凉气/冷气" → 写呼吸变化的具体表现（气息一滞/喉咙发紧/忘了呼吸）`,
      `  · "脸色大变/骤变/一变" → 写脸色变化的具体过程（从红润到苍白/血色褪尽/脸涨得通红）`,
      `  · "这一刻，他/她……" → 删掉"这一刻"，直接写动作`,
      `- 删除所有万能修饰词（"恐怖的气势""惊人的力量""毁灭性的攻击"），改用具体数字和对比`,
      `- 删除所有转折信号词（"然而""就在这时""他不知道的是"），让事件本身的因果制造转折`,
      `- 至少创造一处读者"没想到"的描写——一个新鲜的比喻、一个意外的细节、一个反直觉的观察`,
    ],
  },
  character_voice: {
    label: '角色声音',
    target: '每个角色的对话必须能从语气/用词/句式上区分开来',
    instructions: [
      `- 逐一检查每个角色的对话，确保不看名字也能分辨谁在说话`,
      `- 用以下维度区分角色声音：`,
      `  · 句式长短：有人只用短句（5-10字），有人爱用长句（20+字）`,
      `  · 用词偏好：有人用俗语/粗话，有人用书面语/敬语，有人用专业术语`,
      `  · 语气态度：有人咄咄逼人，有人温吞委婉，有人阴阳怪气`,
      `  · 口头禅：每个角色至少有一个标志性表达方式`,
      `- 禁止所有角色使用相同的"……"表示沉默/犹豫`,
      `- 禁止所有角色使用相同的"哼""呵""啧"等语气词`,
      `- 对话引导词多样化：用"冷哼""低笑""打断""接过话头""沉吟片刻""头也不抬"等代替"说""道"`,
    ],
  },
}

// ============================================================
// 类型定义
// ============================================================

/** 写作请求 */
export interface WriteChapterRequest {
  /** 章节编号 */
  chapterNumber: number
  /** 章节标题 */
  title: string
  /** 用户指定的意图（可选，不指定则由引擎自动推断） */
  userIntent?: IntentType
  /** 章节大纲/概要（可选） */
  outline?: string
  /** 用户额外指令（可选） */
  userInstruction?: string
  /** 目标字数（可选，默认3000） */
  targetWords?: number
  /** 写作上下文 */
  context: WritingContext
}

/** 写作结果 */
export interface WriteChapterResult {
  /** 是否成功（通过质量门槛） */
  success: boolean
  /** 最终内容 */
  content: string
  /** 意图分析结果 */
  intent: IntentResult
  /** 反思评估结果 */
  reflection: ReflectionResult
  /** 反思历史（所有轮次） */
  reflectionHistory: ReflectionResult[]
  /** 冷却检测结果 */
  coolingResult: SmartDetectionResult | null
  /** 记忆检索结果 */
  memoryResults: MemorySearchResult[]
  /** 总字数 */
  wordCount: number
  /** 重写次数 */
  rewriteRounds: number
  /** 总体质量评分 0-1 */
  qualityScore: number
  /** 写作建议（给用户的提示） */
  suggestions: string[]
  /** 耗时统计（ms） */
  timing: {
    intentMs: number
    coolingMs: number
    memoryMs: number
    generationMs: number
    reflectionMs: number
    totalMs: number
  }
}

/** 编排器配置 */
export interface OrchestratorConfig {
  /** 反思配置 */
  reflection: Partial<ReflectionConfig>
  /** 是否启用冷却检测 */
  enableCooling: boolean
  /** 是否启用记忆检索 */
  enableMemory: boolean
  /** 是否启用自动重写 */
  enableAutoRewrite: boolean
  /** 最大重写次数 */
  maxRewriteRounds: number
  /** 目标字数 */
  defaultTargetWords: number
  /** 生成温度 */
  temperature: number
}

const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  reflection: {
    qualityGate: 0.7,
    maxAutoRewrite: 3,
    minImprovement: 0.05,
    autoRewrite: true,
  },
  enableCooling: true,
  enableMemory: true,
  enableAutoRewrite: true,
  maxRewriteRounds: 3,
  defaultTargetWords: 3000,
  temperature: 0.7,
}

// ============================================================
// WritingOrchestrator 主类
// ============================================================

export class WritingOrchestrator {
  private config: OrchestratorConfig
  private intentEngine: IntentEngine
  private coolingSystem: CoolingSystem
  private reflection: SelfReflection
  private memory: LongTermMemory
  private pacingCurve: PacingCurve
  private writingEngine: GWEWritingEngine
  private llm: LLMProvider | null = null

  constructor(config?: Partial<OrchestratorConfig>, llm?: LLMProvider | null, engine?: GWEWritingEngine) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config }
    this.intentEngine = new IntentEngine()
    this.coolingSystem = new CoolingSystem(new MemoryCoolingStorage())
    this.reflection = new SelfReflection(this.config.reflection, llm ?? null)
    this.memory = new LongTermMemory()
    this.pacingCurve = new PacingCurve()
    this.writingEngine = engine ?? createWritingEngine() as unknown as GWEWritingEngine
    this.llm = llm ?? null
  }

  /**
   * 异步创建 WritingOrchestrator 实例
   * v12.0: 使用异步工厂避免 KB 加载时的 OOM
   */
  static async create(config?: Partial<OrchestratorConfig>, llm?: LLMProvider | null): Promise<WritingOrchestrator> {
    const engine = await createWritingEngine()
    return new WritingOrchestrator(config, llm, engine)
  }

  /** 设置 LLM Provider */
  setLLM(llm: LLMProvider): void {
    this.llm = llm
    this.reflection.setLLM(llm)
    this.writingEngine.setLLMProvider(llm)
  }

  /** 获取写作引擎实例 */
  getWritingEngine(): GWEWritingEngine {
    return this.writingEngine
  }

  // ============================================================
  // 核心方法：写一章
  // ============================================================

  /**
   * 写一章 — 完整的智能写作循环
   *
   * 流程：
   * 1. 意图分析：理解这一章要做什么
   * 2. 冷却检测：检查是否有套路重复
   * 3. 记忆检索：查找相关历史经验
   * 4. 上下文构建：组装所有信息给LLM
   * 5. LLM生成：调用AI生成内容
   * 6. 反思评估：12维度质量评估
   * 7. 自动重写：未通过质量门则重写
   * 8. 记忆更新：存储本次写作经验
   */
  async writeChapter(request: WriteChapterRequest): Promise<WriteChapterResult> {
    const timing = { intentMs: 0, coolingMs: 0, memoryMs: 0, generationMs: 0, reflectionMs: 0, totalMs: 0 }
    const startTime = Date.now()
    const suggestions: string[] = []

    if (!this.llm) {
      throw new Error('[Orchestrator] 未设置 LLM Provider，请先调用 setLLM()')
    }

    // 同步写作引擎上下文
    this.syncContext(request.context)

    // ========== 步骤1: 意图分析 ==========
    const intentStart = Date.now()
    const intent = this.intentEngine.analyze({
      chapterNumber: request.chapterNumber,
      title: request.title,
      currentOutline: request.outline,
      userIntent: request.userIntent,
      previousSummary: this.getPreviousSummary(request.context),
      activeForeshadows: this.getActiveForeshadowKeywords(request.context),
      characterStates: this.getCharacterStates(request.context),
    })
    timing.intentMs = Date.now() - intentStart

    // ========== 步骤2: 冷却检测（并行） ==========
    const coolingStart = Date.now()
    let coolingResult: SmartDetectionResult | null = null
    if (this.config.enableCooling) {
      try {
        // 使用最近章节内容做冷却检测
        const recentContent = this.getRecentContent(request.context, 3)
        if (recentContent) {
          coolingResult = await this.coolingSystem.detectAllSmart(recentContent)
          for (const rec of coolingResult.recommendations) {
            if (rec.severity === 'high') {
              suggestions.push(`[禁止] ${rec.message} → ${rec.suggestion}`)
            } else if (rec.severity === 'medium') {
              suggestions.push(`[注意] ${rec.message} → ${rec.suggestion}`)
            }
          }
        }
      } catch (e) {
        logWarn('Orchestrator', '冷却检测失败，跳过', e)
      }
    }
    timing.coolingMs = Date.now() - coolingStart

    // ========== 步骤3: 记忆检索（并行） ==========
    const memoryStart = Date.now()
    let memoryResults: MemorySearchResult[] = []
    if (this.config.enableMemory) {
      try {
        // 用意图信息搜索相关记忆
        const searchQuery = `${intent.primary.type} ${request.title} ${request.outline || ''}`
        memoryResults = this.memory.search(searchQuery, 5)
      } catch (e) {
        logWarn('Orchestrator', '记忆检索失败，跳过', e)
      }
    }
    timing.memoryMs = Date.now() - memoryStart

    // ========== 步骤4: 上下文构建 ==========
    const messages = this.buildOrchestratedMessages(request, intent, coolingResult, memoryResults)

    // ========== 步骤5-7: 生成 → 反思 → 重写循环 ==========
    const generationStart = Date.now()
    const { content, reflection, reflectionHistory, rewriteRounds } =
      await this.generateWithReflection(messages, intent, request)
    timing.generationMs = Date.now() - generationStart

    // ========== 步骤8: 记忆更新 ==========
    const reflectionStart = Date.now()
    if (this.config.enableMemory && content) {
      try {
        await this.memory.storeAsync({
          type: 'plot_pattern',
          content: content.slice(0, 500),
          tags: [intent.primary.type, `chapter_${request.chapterNumber}`],
          importance: reflection.overallScore,
          sourceChapter: request.chapterNumber,
          fullContext: `${request.title} | 意图:${intent.primary.type} | 质量:${Math.round(reflection.overallScore * 100)}% | 重写:${rewriteRounds}次`,
          createdAt: Date.now(),
        })
      } catch (e) {
        logWarn('Orchestrator', '记忆存储失败', e)
      }
    }
    timing.reflectionMs = Date.now() - reflectionStart

    timing.totalMs = Date.now() - startTime

    return {
      success: reflection.passed,
      content,
      intent,
      reflection,
      reflectionHistory,
      coolingResult,
      memoryResults,
      wordCount: content.length,
      rewriteRounds,
      qualityScore: reflection.overallScore,
      suggestions,
      timing,
    }
  }

  // ============================================================
  // 生成 → 反思 → 重写循环
  // ============================================================

  /**
   * v12.12: 反射驱动定向重写
   * 核心思路：不让LLM在生成时同时处理9个维度，而是生成后由反射识别弱维度，逐个定向修复
   * 流程：生成 → 反射 → 钩子重写(如需要) → 弱维度定向修复(最多2个维度各1轮) → 最终反射
   */
  private async generateWithReflection(
    messages: ChatMessage[],
    intent: IntentResult,
    request: WriteChapterRequest,
  ): Promise<{
    content: string
    reflection: ReflectionResult
    reflectionHistory: ReflectionResult[]
    rewriteRounds: number
  }> {
    const reflectionHistory: ReflectionResult[] = []

    // 第一轮：生成
    let content = await this.callLLM(messages, request.targetWords || this.config.defaultTargetWords)
    let currentReflection = await this.reflection.reflectAsync({
      content,
      intent,
      chapterNumber: request.chapterNumber,
      chapterTitle: request.title,
      previousContent: this.getPreviousContent(request.context),
    })
    reflectionHistory.push(currentReflection)

    let rewriteRounds = 0

    if (!this.config.enableAutoRewrite) {
      return { content, reflection: currentReflection, reflectionHistory, rewriteRounds }
    }

    // 钩子专项重写（保持 v12.8 逻辑）
    const hookConcern = this.findHookWeakness(currentReflection)
    if (hookConcern) {
      const hookMessages = this.buildHookRewriteMessages(messages, content, intent, hookConcern)
      content = await this.callLLM(hookMessages, request.targetWords || this.config.defaultTargetWords)
      currentReflection = await this.reflection.reflectAsync({
        content,
        intent,
        chapterNumber: request.chapterNumber,
        chapterTitle: request.title,
        previousContent: this.getPreviousContent(request.context),
      })
      currentReflection.improvement = currentReflection.overallScore - reflectionHistory[0].overallScore
      reflectionHistory.push(currentReflection)
      rewriteRounds = 1
    }

    // v12.12: 弱维度定向修复 — 识别2个最弱语义维度，逐个精准重写
    const weakDims = this.findWeakestDimensions(currentReflection, 2)
    for (const dim of weakDims) {
      if (rewriteRounds >= this.config.maxRewriteRounds) break

      const dimConcern = currentReflection.concerns.find(c => c.dimension === dim)
      if (!dimConcern || dimConcern.severity < 0.1) continue

      const dimMessages = this.buildDimensionRewriteMessages(
        messages, content, dim, dimConcern, intent,
      )
      if (!dimMessages) continue

      content = await this.callLLM(dimMessages, request.targetWords || this.config.defaultTargetWords)
      currentReflection = await this.reflection.reflectAsync({
        content,
        intent,
        chapterNumber: request.chapterNumber,
        chapterTitle: request.title,
        previousContent: this.getPreviousContent(request.context),
      })
      currentReflection.improvement = currentReflection.overallScore - reflectionHistory[0].overallScore
      reflectionHistory.push(currentReflection)
      rewriteRounds++
    }

    // 如果仍不达标，最后一轮整体重写（兜底）
    if (!currentReflection.passed && rewriteRounds < this.config.maxRewriteRounds) {
      const rewriteInstructions = currentReflection.rewriteInstructions || '整体提升质量'
      const rewriteMessages = this.buildRewriteMessages(
        messages, content, rewriteInstructions, currentReflection,
      )
      content = await this.callLLM(rewriteMessages, request.targetWords || this.config.defaultTargetWords)
      currentReflection = await this.reflection.reflectAsync({
        content,
        intent,
        chapterNumber: request.chapterNumber,
        chapterTitle: request.title,
        previousContent: this.getPreviousContent(request.context),
      })
      currentReflection.improvement = currentReflection.overallScore - reflectionHistory[0].overallScore
      reflectionHistory.push(currentReflection)
      rewriteRounds++
    }

    return { content, reflection: currentReflection, reflectionHistory, rewriteRounds }
  }

  /**
   * v12.12: 找出最弱的N个语义维度（排除钩子，因其已有专项重写）
   * 只选语义维度（LLM评估的7维），结构维度由规则引擎保证
   * v12.13: 阈值从0.85降至0.80，确保原创性等低分维度也被捕获
   */
  private findWeakestDimensions(reflection: ReflectionResult, count: number): QualityDimension[] {
    const semanticDims: QualityDimension[] = [
      'intent_alignment', 'opening_strength', 'emotional_impact',
      'character_voice', 'dialogue_quality', 'originality',
    ]
    // 排除：ending_hook（已有专项重写）

    const scored = semanticDims
      .map(dim => ({ dim, score: reflection.dimensionScores[dim] ?? 0 }))
      .filter(d => d.score < 0.80) // v12.17: 回调至0.80，避免过度重写破坏感官/钩子
      .sort((a, b) => a.score - b.score) // 最低分排前面

    return scored.slice(0, count).map(d => d.dim)
  }

  /**
   * v12.12: 构建维度专项重写消息
   * 每个维度有独立的修复策略，只修改该维度相关的段落
   * v12.13: 强制保留结尾钩子段落，防止维度重写破坏钩子
   */
  private buildDimensionRewriteMessages(
    originalMessages: ChatMessage[],
    lastContent: string,
    dim: QualityDimension,
    concern: QualityConcern,
    intent: IntentResult,
  ): ChatMessage[] | null {
    const strategy = DIMENSION_REWRITE_STRATEGIES[dim]
    if (!strategy) return null

    const messages = [...originalMessages]

    // v12.13: 提取结尾段落（最后200字），强制保留
    const endingExcerpt = lastContent.length > 200
      ? lastContent.slice(-200)
      : lastContent

    const dimUserMsg: ChatMessage = {
      role: 'user',
      content: [
        `【${strategy.label}专项修复 — 保持前文95%内容不变】`,
        `问题：${concern.description}`,
        '',
        `【修复策略】`,
        ...strategy.instructions,
        '',
        `【强制要求】`,
        `1. 保持前文的结构、情节、信息量完全不变，只修改与${strategy.label}相关的段落。`,
        `2. ${strategy.target}`,
        `3. 不要新增或删除情节，不要改变角色关系和事件走向。`,
        `4. 修改后字数应保持与原章节接近。`,
        `5. ⚠️ 绝对不要修改章节结尾！以下结尾段落必须原封不动保留：`,
        `「${endingExcerpt}」`,
        `   结尾段落一个字都不能改，把它完整地放在修改后章节的最后。`,
        '',
        `【完整内容 — 请定向修改】`,
        lastContent,
      ].join('\n'),
    }

    if (messages.length >= 2) {
      messages[messages.length - 1] = dimUserMsg
    } else {
      messages.push(dimUserMsg)
    }

    return messages
  }

  /**
   * v12.7: 检测钩子是否为最弱维度且低于阈值
   * 阈值从0.70→0.78，severity门槛0.15→0.05
   * 兜底：钩子是绝对最低维度时直接触发
   */
  private findHookWeakness(reflection: ReflectionResult): QualityConcern | null {
    const hookScore = reflection.dimensionScores['ending_hook']
    if (hookScore === undefined || hookScore >= 0.78) return null

    // 检查 ending_hook 是否是绝对最低的维度
    const allDims = Object.entries(reflection.dimensionScores)
      .sort(([, a], [, b]) => a - b)
    const isAbsoluteLowest = allDims.length > 0 && allDims[0][0] === 'ending_hook'
    const bottom3 = allDims.slice(0, 3).map(([d]) => d)

    // 钩子是最低维度 → 直接触发（兜底）
    if (isAbsoluteLowest) {
      const hookConcern = reflection.concerns.find(c => c.dimension === 'ending_hook')
      if (hookConcern) return hookConcern
      // 即使没有 concern，也构造一个
      return {
        dimension: 'ending_hook',
        severity: 1 - hookScore,
        description: '结尾钩子力度不足，未能制造悬念/危机/反转/抉择',
        suggestion: '用冲击性画面、惊人对话、或未完成的动作收尾，让读者产生"必须翻下一章"的冲动',
      }
    }

    // 钩子在 bottom3 中，且有足够严重的 concern
    if (bottom3.includes('ending_hook')) {
      const hookConcern = reflection.concerns.find(c => c.dimension === 'ending_hook')
      if (hookConcern && hookConcern.severity >= 0.05) return hookConcern
    }

    return null
  }

  /**
   * v12.7: 构建钩子专项重写消息 — 改写最后500-800字
   * 扩大改写范围，给LLM足够空间构造强钩子
   */
  private buildHookRewriteMessages(
    originalMessages: ChatMessage[],
    lastContent: string,
    intent: IntentResult,
    hookConcern: QualityConcern,
  ): ChatMessage[] {
    const messages = [...originalMessages]
    const hooks = this.intentEngine.getEndingHookGuidance(intent.primary.type)

    const hookGuidance = hooks.length > 0
      ? `策略：${hooks[0].name}\n指导：${hooks[0].guidance}\n参考示例："${hooks[0].example}"\n禁止：${hooks[0].avoid}`
      : '用动作、对话、或新发现作为结尾，制造悬念或情绪冲击。'

    const hookUserMsg: ChatMessage = {
      role: 'user',
      content: [
        `【钩子强化 — 仅修改最后500-800字】`,
        `问题：章末钩子力度不足 — ${hookConcern.description}`,
        `建议：${hookConcern.suggestion}`,
        ``,
        `【钩子策略（必须遵守）】`,
        hookGuidance,
        ``,
        `【强制要求】`,
        `1. 保持前文95%的内容完全不变，只修改最后500-800字。`,
        `2. 必须在结尾制造至少一项：悬念（未解之谜）、危机（新威胁出现）、反转（认知颠覆）、或抉择（两难处境）。`,
        `3. 结尾必须是具体的动作/对话/新发现，不能是叙事总结、内心独白、或环境描写收尾。`,
        `4. 章末最后一句必须让读者产生"必须翻下一章"的冲动——用冲击性画面、惊人对话、或未完成的动作。`,
        `5. 禁止使用"他不知道的是……""一切才刚刚开始""新的篇章即将展开"等万能模板句式。`,
        ``,
        `【完整内容 — 请修改结尾】`,
        lastContent,
      ].join('\n'),
    }

    if (messages.length >= 2) {
      messages[messages.length - 1] = hookUserMsg
    } else {
      messages.push(hookUserMsg)
    }

    return messages
  }

  // ============================================================
  // 上下文构建
  // ============================================================

  /** 构建编排后的完整消息 */
  private buildOrchestratedMessages(
    request: WriteChapterRequest,
    intent: IntentResult,
    coolingResult: SmartDetectionResult | null,
    memoryResults: MemorySearchResult[],
  ): ChatMessage[] {
    // 使用写作引擎的标准消息构建
    const messages = buildWritingMessages(request.context, {
      capability: 'continue',
      maxChars: 8000,
      params: {
        userInstruction: this.buildFullInstruction(request, intent, coolingResult, memoryResults),
      },
    })

    // 在系统消息中注入意图引导
    if (messages.length > 0 && messages[0].role === 'system') {
      messages[0] = {
        ...messages[0],
        content: messages[0].content + '\n\n' + this.buildIntentGuidance(intent, coolingResult, memoryResults),
      }
    }

    return messages
  }

  /** 构建完整用户指令 */
  private buildFullInstruction(
    request: WriteChapterRequest,
    intent: IntentResult,
    coolingResult: SmartDetectionResult | null,
    memoryResults: MemorySearchResult[],
  ): string {
    const parts: string[] = []

    // 用户指令
    if (request.userInstruction) {
      parts.push(`用户指令：${request.userInstruction}`)
    }

    // 大纲
    if (request.outline) {
      parts.push(`章节大纲：${request.outline}`)
    }

    // 目标字数
    const targetWords = request.targetWords || this.config.defaultTargetWords
    parts.push(`目标字数：约${targetWords}字`)

    // 意图引导
    parts.push(`本章意图：${this.intentEngine.intentLabel(intent.primary.type)}`)
    parts.push(`情绪基调：${intent.emotionalTone.primary}（强度 ${Math.round(intent.emotionalTone.intensity * 100)}%）`)
    parts.push(`节奏要求：${intent.suggestedPacing.rationale}`)
    parts.push(`对话/描写/行动比例：${Math.round(intent.suggestedPacing.dialogueRatio * 100)}%/${Math.round(intent.suggestedPacing.descriptionRatio * 100)}%/${Math.round(intent.suggestedPacing.actionRatio * 100)}%`)

    // v12.8: 章末钩子提醒（轮换）
    const hooks = this.intentEngine.getEndingHookGuidance(intent.primary.type, request.chapterNumber)
    if (hooks.length > 0) {
      parts.push(`章末钩子：${hooks[0].guidance}`)
    }

    return parts.join('\n')
  }

  /** 构建意图引导（注入到系统提示词） */
  private buildIntentGuidance(
    intent: IntentResult,
    coolingResult: SmartDetectionResult | null,
    memoryResults: MemorySearchResult[],
    chapterNumber?: number,
  ): string {
    const sections: string[] = []

    // 一、意图驱动的完整写作策略（含开头/叙事结构/章末钩子）
    sections.push(this.intentEngine.generatePromptStrategy(intent, chapterNumber))

    // 二、冷却约束 — 转化为可执行的策略调整
    if (coolingResult && coolingResult.recommendations.length > 0) {
      const highSev = coolingResult.recommendations.filter(r => r.severity === 'high')
      const medSev = coolingResult.recommendations.filter(r => r.severity === 'medium')

      if (highSev.length > 0 || medSev.length > 0) {
        sections.push('')
        sections.push('## 冷却约束（必须遵守 — 以下套路已被锁定）')

        // 高严重度：强制禁止，提供替代方案
        for (const rec of highSev) {
          sections.push(`- 禁止：${rec.message}`)
          sections.push(`  → 替代方案：${rec.suggestion}`)
        }

        // 中严重度：提醒注意，建议变化
        for (const rec of medSev.slice(0, 3)) {
          sections.push(`- 注意：${rec.message}`)
          sections.push(`  → 建议：${rec.suggestion}`)
        }

        sections.push('- 请基于以上约束调整叙事策略，不可使用被锁定的套路/模板')
      }

      // v12.6: 反套路创作策略 — 基于冷却检测的正向引导
      if (coolingResult && coolingResult.patterns.length > 0) {
        const availablePatterns = coolingResult.patterns.filter(p => p.cooldownUntil <= 0 || p.count === 0)
        const lockedPatterns = coolingResult.patterns.filter(p => p.cooldownUntil > 0)

        if (lockedPatterns.length > 0) {
          sections.push('')
          sections.push('## 反套路创作策略（提升原创性）')
          sections.push('- 以下套路已被前文使用，本章必须采用不同的创作方向：')
          for (const p of lockedPatterns.slice(0, 3)) {
            sections.push(`  · 已用套路：${p.pattern.name}（${p.pattern.category}）→ 替换为：${p.alternative}`)
          }
          sections.push('- 原创性要求：')
          sections.push('  · 不要把"实力提升"写成简单的境界突破，用代价/代价/副作用来反向刻画')
          sections.push('  · 不要把"冲突"写成简单的正邪对立，让双方都有合理动机')
          sections.push('  · 不要把"揭示"写成角色直接说出口，用环境、动作、细节来暗示')
          sections.push('  · 每章至少有一个读者"没想到"的转折或细节')
        }
      }
    }

    // 三、历史经验参考（可选）
    if (memoryResults.length > 0) {
      const relevantMemories = memoryResults
        .filter(m => m.entry.importance >= 0.5)
        .slice(0, 3)

      if (relevantMemories.length > 0) {
        sections.push('')
        sections.push('## 历史经验参考')
        for (const mem of relevantMemories) {
          const tagStr = mem.entry.tags?.join('、') || ''
          sections.push(`- [${tagStr}] ${mem.entry.content.slice(0, 120)}`)
        }
      }
    }

    return sections.join('\n')
  }

  /** 构建重写消息 */
  private buildRewriteMessages(
    originalMessages: ChatMessage[],
    lastContent: string,
    rewriteInstructions: string,
    reflection: ReflectionResult,
  ): ChatMessage[] {
    const messages = [...originalMessages]

    // 替换最后的用户消息为改写指令
    const rewriteUserMsg: ChatMessage = {
      role: 'user',
      content: [
        `【改写指令】`,
        `上一版质量评分：${Math.round(reflection.overallScore * 100)}分（未达标，需要≥${Math.round((this.config.reflection.qualityGate || 0.7) * 100)}分）`,
        `主要问题：`,
        ...reflection.concerns.slice(0, 5).map(c =>
          `  - [${c.dimension}] ${c.description}（严重度${Math.round(c.severity * 100)}%）`
        ),
        ``,
        `改写要求：${rewriteInstructions}`,
        ``,
        `上一版内容（请在此基础上改写）：`,
        lastContent.slice(0, 2000),
      ].join('\n'),
    }

    // 保留系统消息，替换用户消息
    if (messages.length >= 2) {
      messages[messages.length - 1] = rewriteUserMsg
    } else {
      messages.push(rewriteUserMsg)
    }

    return messages
  }

  // ============================================================
  // LLM 调用
  // ============================================================

  private async callLLM(messages: ChatMessage[], targetWords: number): Promise<string> {
    if (!this.llm) throw new Error('[Orchestrator] LLM Provider 未设置')

    // 在用户消息中追加字数要求
    const enhancedMessages = messages.map(m => {
      if (m.role === 'user') {
        return {
          ...m,
          content: m.content + `\n\n请生成约${targetWords}字的完整章节内容。`,
        }
      }
      return m
    })

    const result = await this.llm.chat({
      messages: enhancedMessages,
      temperature: this.config.temperature,
      maxTokens: Math.max(targetWords * 2, 4096),
    })

    // v12.2: 清理markdown噪音
    const cleaned = cleanMarkdownNoise(result.content || '')
    return cleaned
  }

  // ============================================================
  // 上下文辅助方法
  // ============================================================

  private syncContext(context: WritingContext): void {
    // 同步写作引擎的上下文
    const engine = this.writingEngine
    engine.setBook(context.book)
    for (const ch of context.characters) engine.addCharacter(ch)
    for (const s of context.settings) engine.addSetting(s)
    for (const ch of context.chapters) engine.addChapter(ch)
    for (const fs of context.foreshadows) engine.addForeshadow(fs)

    if (context.currentChapterId) {
      engine.setCursor(context.currentChapterId, context.cursorPosition || 0)
    }
  }

  private getPreviousSummary(context: WritingContext): string | undefined {
    const prev = getPreviousChapter(context)
    return prev?.summary || prev?.content?.slice(-200)
  }

  private getPreviousContent(context: WritingContext): string | undefined {
    const prev = getPreviousChapter(context)
    return prev?.content?.slice(-500)
  }

  private getActiveForeshadowKeywords(context: WritingContext): string[] {
    return context.foreshadows
      ?.filter(f => f.status !== 'resolved')
      .map(f => f.keyword) || []
  }

  private getCharacterStates(context: WritingContext): Record<string, string> {
    const states: Record<string, string> = {}
    for (const ch of context.characters) {
      if (ch.attributes?.state) {
        states[ch.name] = ch.attributes.state as string
      }
    }
    return states
  }

  private getRecentContent(context: WritingContext, count: number): string {
    return context.chapters
      .filter(c => c.content)
      .sort((a, b) => b.number - a.number)
      .slice(0, count)
      .map(c => c.content)
      .join('\n')
  }
}