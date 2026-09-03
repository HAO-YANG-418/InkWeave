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
import type { LLMProvider, ChatMessage, RuleViolation } from '../types'
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
import { loadPrevFingerprint, fingerprintToTabooText } from './fingerprint-inject'

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
  intent_alignment: {
    label: '意图对齐',
    target: '重新调整内容焦点，使章节内容与用户指定的意图类型严格匹配',
    instructions: [
      `- 识别当前内容中偏离意图的段落（如意图是"展示成长"但内容变成了"战斗场面"），将其重写`,
      `- 意图类型匹配规则：`,
      `  · world_building → 以环境/规则/历史描写为主，主角作为观察者而非行动者`,
      `  · character_intro → 以新角色登场+特征展示为主，通过行动和对话展现性格`,
      `  · create_conflict → 以冲突事件为核心，明确对立双方、冲突原因和升级路径`,
      `  · advance_plot → 以信息推进和事件链条为主，每段都推动剧情向前`,
      `  · show_growth → 以角色能力/认知变化为核心，展示突破过程和代价`,
      `  · build_relationship → 以角色互动和关系变化为主，对话和情感交流占主导`,
      `  · raise_stakes → 以威胁升级和压力增加为主，让读者感到紧迫感`,
      `  · reveal_secret → 以信息释放为核心，层层揭示，制造认知颠覆`,
      `  · climax → 以高强度冲突为核心，动作密集、节奏紧凑、情感爆发`,
      `  · emotional_impact → 以情感体验为核心，余波、反思、代价、新方向`,
      `- 保持整体情节不变，只调整内容焦点和描写重心`,
      `- 确保调整后的内容依然流畅自然，不因意图调整而破坏叙事节奏`,
    ],
  },
  opening_strength: {
    label: '开头力度',
    target: '开头必须用具体可感知的瞬间抓住读者，禁止用叙事总结句',
    instructions: [
      `- 定位开头前200字，检查是否满足以下任一要求：`,
      `  · 身体感官：具体的声音/气味/触感/视觉画面（如"剑尖刺入石壁的摩擦声尖锐刺耳"）`,
      `  · 场景物件：一个具体物品的特写（如"桌上的茶已经凉了，杯沿结了一圈暗红色的茶垢"）`,
      `  · 对话片段：一句有冲击力的对话（如"'你师父没告诉过你，剑骨是会吃人的吗？'"）`,
      `  · 时空坐标：具体的时间地点定位（如"青云宗外门演武场，卯时三刻，天还没亮透"）`,
      `  · 内心独白：角色内心的具体念头（如"如果赵无极说的是真的，那师父的失踪就不是意外"）`,
      `  · 角色动作：一个正在进行的动作（如"林渊推开门，手还在抖"）`,
      `- 禁止开头用叙事总结句（如"膜回来了""三个人往下走""这一战打了很久"）`,
      `- 如果当前开头是叙事总结，选择上述任一方式重新开头，但保持后续内容不变`,
    ],
  },
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
      `- ⚠️ 对话内容本身不要修改，只修改旁白和描写中的套路化表达`,
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
  sensory_richness: {
    label: '感官丰富',
    target: '增加感官描写密度，每300字至少切换一次感官类型，禁止连续视觉描写超过3段',
    instructions: [
      `- 扫描全文找出连续3段以上只用视觉描写的段落，插入其他感官描写`,
      `- 为关键场景（战斗/转折/高潮）添加至少3种不同感官：`,
      `  · 听觉：声音大小、质感、远近、沉默 → 比如：剑尖刺入石壁的摩擦声尖锐刺耳`,
      `  · 触觉：温度、疼痛、压力 → 比如：冷汗浸透后背，衣衫黏在皮肤上冰冷刺骨`,
      `  · 嗅觉：气味来源、浓淡 → 比如：空气中弥漫着血腥和铁锈味，混着淡淡的松脂香`,
      `  · 味觉：血、汗、空气 → 比如：血腥味涌进喉咙，又咸又腥`,
      `- 删除"一股XX气息"这种万能模板，替换为具体的感官描述`,
      `- 保持情节完全不变，只在原有基础上补充感官细节`,
      `- 不要新增情节，只增加感官维度的信息量`,
      `- ⚠️ 对话内容本身不要修改，只修改旁白和描写中缺少感官细节的地方`,
    ],
  },
}

// ============================================================
// v15.0: 模型自纠 pass（收口分布级 AI 味）
// 规则治标管不住分布级问题（主语重复/句号碎切/质感均匀腔/连续对话过长），
// 模型重写才治本。以下纯函数与检测器门禁解耦，可零 LLM 单测。
// ============================================================

// —— 模型自纠核心（纯函数，唯一真源）——
import {
  SELF_CORRECTION_INSTRUCTIONS,
  isAiFeelViolation,
  buildSelfCorrectionPrompt,
  evaluateSelfCorrection,
} from './self-correction-core'

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
  /** 项目根目录（可选）：用于定位 章节/*.fingerprint.json 实现反向闭环。由 CLI 入口透传，生成侧不推导。 */
  projectPath?: string
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
  /** v15.0: 是否启用模型自纠 pass（收口分布级 AI 味，复用检测器门禁做 accept/reject） */
  enableSelfCorrection: boolean
  /** 目标字数 */
  defaultTargetWords: number
  /** 生成温度 */
  temperature: number
  /** v13.2: maxTokens = targetWords * maxTokensRatio，默认 3（推理模型需更大） */
  maxTokensRatio: number
  /** v13.2: maxTokens 最小值 */
  minMaxTokens: number
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
  enableSelfCorrection: true,
  defaultTargetWords: 3000,
  temperature: 0.7,
  maxTokensRatio: 3,
  minMaxTokens: 8192,
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

    // ② 反向闭环：上章指纹 → 生成时禁忌（注入 user message 动态区，走 buildWritingMessages 真实通道）
    // 始终重置：有上章指纹则注入禁忌，无则清空，杜绝跨章污染（agent 批量写复用同一 engine 实例）
    try {
      const prevFp = request.projectPath
        ? loadPrevFingerprint(request.projectPath, request.chapterNumber)
        : null
      const taboo = prevFp ? fingerprintToTabooText(prevFp, request.chapterNumber) : ''
      this.writingEngine.setPrevChapterTaboo(taboo)
    } catch (e) {
      logWarn('Orchestrator', '②反向闭环指纹注入失败，跳过（不影响生成）', e)
      this.writingEngine.setPrevChapterTaboo('')
    }

    const { content, reflection, reflectionHistory, rewriteRounds, selfCorrected } =
      await this.generateWithReflection(messages, intent, request)
    if (selfCorrected) {
      suggestions.push('[自纠] 已跑模型自纠 pass 收口分布级 AI 味（主语重复/句号碎切/质感均匀腔/连续对话过长）')
    }
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
    selfCorrected: boolean
  }> {
    const reflectionHistory: ReflectionResult[] = []
    const targetWords = request.targetWords || this.config.defaultTargetWords

    // 第一轮：生成
    let content = await this.callLLM(messages, targetWords)

    // v14.1: 字数检查 — 初始生成严重不足时，尝试扩展
    if (content.length < targetWords * 0.5) {
      logWarn('Orchestrator', `初始生成字数严重不足(${content.length}字 < ${Math.round(targetWords * 0.5)}字)，尝试扩展`)
      const expanded = await this.expandShortContent(content, messages, targetWords)
      if (expanded.length > content.length) {
        content = expanded
      }
    }

    let currentReflection = await this.reflection.reflectAsync({
      content,
      intent,
      chapterNumber: request.chapterNumber,
      chapterTitle: request.title,
      previousContent: this.getPreviousContent(request.context),
    }, 0, this.runChecker(content, targetWords))
    reflectionHistory.push(currentReflection)

    let rewriteRounds = 0
    let selfCorrected = false

    if (!this.config.enableAutoRewrite) {
      return { content, reflection: currentReflection, reflectionHistory, rewriteRounds, selfCorrected: false }
    }

    // 钩子专项重写（v13.6: 增加独立校验 → 不通过则回退）
    const hookConcern = this.findHookWeakness(currentReflection, intent.primary.type)
    if (hookConcern) {
      const preHookContent = content
      const preHookScore = currentReflection.dimensionScores['ending_hook'] ?? 0
      const hookMessages = this.buildHookRewriteMessages(messages, preHookContent, intent, hookConcern)
      const hookRewritten = await this.callLLM(hookMessages, targetWords)
      const hookReflection = await this.reflection.reflectAsync({
        content: hookRewritten,
        intent,
        chapterNumber: request.chapterNumber,
        chapterTitle: request.title,
        previousContent: this.getPreviousContent(request.context),
      }, 0, this.runChecker(hookRewritten, targetWords))
      const postHookScore = hookReflection.dimensionScores['ending_hook'] ?? 0

      // v14.1: 钩子重写字数保护
      if (hookRewritten.length < targetWords * 0.5) {
        content = preHookContent
        currentReflection = currentReflection
      } else if (postHookScore < preHookScore - 0.05) {
        // v13.6: 钩子校验 — 如果钩子分数退化超过5%，回退到重写前版本
        content = preHookContent
        currentReflection = currentReflection
        // 不推入 reflectionHistory（重写被回退，不算一轮）
      } else {
        content = hookRewritten
        currentReflection = hookReflection
        currentReflection.improvement = currentReflection.overallScore - reflectionHistory[0].overallScore
        reflectionHistory.push(currentReflection)
        rewriteRounds = 1
      }
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

      const preDimContent = content
      const dimRewritten = await this.callLLM(dimMessages, targetWords)

      // v14.1: 维度重写字数保护 — 重写后字数不足目标50%，回退
      if (dimRewritten.length < targetWords * 0.5) {
        logWarn('Orchestrator', `维度重写字数异常(${dimRewritten.length}字 < ${Math.round(targetWords * 0.5)}字)，回退`)
        content = preDimContent
        continue
      }

      content = dimRewritten
      currentReflection = await this.reflection.reflectAsync({
        content,
        intent,
        chapterNumber: request.chapterNumber,
        chapterTitle: request.title,
        previousContent: this.getPreviousContent(request.context),
      }, 0, this.runChecker(dimRewritten, targetWords))
      currentReflection.improvement = currentReflection.overallScore - reflectionHistory[0].overallScore
      reflectionHistory.push(currentReflection)
      rewriteRounds++
    }

    // 如果仍不达标，最后一轮整体重写（兜底）
    // v13.7: 加字数保护 — 重写后字数不足目标50%则回退
    const currentCheckerErr = this.runChecker(content, targetWords).some(v => v.severity === 'error')
    if ((!currentReflection.passed || currentCheckerErr) && rewriteRounds < this.config.maxRewriteRounds) {
      const rewriteInstructions = currentReflection.rewriteInstructions || '整体提升质量'
      const rewriteMessages = this.buildRewriteMessages(
        messages, content, rewriteInstructions, currentReflection,
      )
      const preRewriteContent = content
      content = await this.callLLM(rewriteMessages, targetWords)

      // v13.7: 字数保护 — 重写后字数不足目标50%，回退到重写前版本
      if (content.length < targetWords * 0.5) {
        logWarn('Orchestrator', `整体重写字数异常(${content.length}字 < ${Math.round(targetWords * 0.5)}字)，回退`)
        content = preRewriteContent
      } else {
        currentReflection = await this.reflection.reflectAsync({
          content,
          intent,
          chapterNumber: request.chapterNumber,
          chapterTitle: request.title,
          previousContent: this.getPreviousContent(request.context),
        }, 0, this.runChecker(content, targetWords))
        currentReflection.improvement = currentReflection.overallScore - reflectionHistory[0].overallScore
        reflectionHistory.push(currentReflection)
        rewriteRounds++
      }
    }

    // ========== v15.0: 模型自纠 pass ==========
    // 收口分布级 AI 味（规则治标管不住）；复用 runChecker 门禁做 accept/reject，绝不倒退
    if (this.config.enableSelfCorrection) {
      const scApplied = await this.runSelfCorrection(messages, content, targetWords)
      if (scApplied) {
        content = scApplied
        currentReflection = await this.reflection.reflectAsync({
          content,
          intent,
          chapterNumber: request.chapterNumber,
          chapterTitle: request.title,
          previousContent: this.getPreviousContent(request.context),
        }, 0, this.runChecker(content, targetWords))
        currentReflection.improvement = currentReflection.overallScore - reflectionHistory[0].overallScore
        reflectionHistory.push(currentReflection)
        rewriteRounds++
        selfCorrected = true
      }
    }

    return { content, reflection: currentReflection, reflectionHistory, rewriteRounds, selfCorrected }
  }

  /**
   * R3 接线：在生成循环每轮调检测器，返回 error 级违规（供 reflection 注入 + gate 触发兜底重写）
   */
  private runChecker(content: string, targetWords?: number): RuleViolation[] {
    try {
      const r = this.writingEngine.checkContent(content, targetWords)
      return (r && r.violations) || []
    } catch {
      return []
    }
  }

  /**
   * v15.0: 模型自纠 pass — 收口分布级 AI 味
   * 复用 runChecker 门禁做 accept/reject：引入新 error / AI 味警告增多 / 字数崩 → 驳回保留原稿。
   * 仅当存在 error 或 AI 味警告时才调 LLM，干净稿直接跳过（省成本、避免无意义改写）。
   */
  private async runSelfCorrection(
    originalMessages: ChatMessage[],
    lastContent: string,
    targetWords: number,
  ): Promise<string | null> {
    const before = this.runChecker(lastContent, targetWords)
    const needsFix = before.some((v) => v.severity === 'error' || isAiFeelViolation(v))
    if (!needsFix) return null

    const messages = this.buildSelfCorrectionMessages(originalMessages, lastContent, before)
    if (!messages) return null

    const corrected = await this.callLLM(messages, targetWords)
    if (corrected.length < targetWords * 0.5) {
      logWarn('Orchestrator', '模型自纠：字数额外不足50%，驳回')
      return null
    }

    const after = this.runChecker(corrected, targetWords)
    if (!evaluateSelfCorrection(before, after, lastContent.length, corrected.length, targetWords)) {
      logWarn('Orchestrator', '模型自纠：被门禁驳回（error增多/AI味警告增多/字数崩），保留原稿')
      return null
    }
    return corrected
  }

  /** 构建模型自纠 LLM 消息（复用 buildSelfCorrectionPrompt 纯函数） */
  private buildSelfCorrectionMessages(
    originalMessages: ChatMessage[],
    lastContent: string,
    violations: RuleViolation[],
  ): ChatMessage[] | null {
    const messages = [...originalMessages]
    const selfUserMsg: ChatMessage = {
      role: 'user',
      content: buildSelfCorrectionPrompt(lastContent, violations),
    }
    if (messages.length >= 2) {
      messages[messages.length - 1] = selfUserMsg
    } else {
      messages.push(selfUserMsg)
    }
    return messages
  }

  /**
   * v12.12: 找出最弱的N个语义维度（排除钩子，因其已有专项重写）
   * 只选语义维度（LLM评估的6维，排除ending_hook），结构维度由规则引擎保证
   * v12.13: 阈值从0.85降至0.80，确保原创性等低分维度也被捕获
   */
  private findWeakestDimensions(reflection: ReflectionResult, count: number): QualityDimension[] {
    // v13.4: 7个语义维度（加入 sensory_richness），阈值升至0.82以覆盖更多弱维度
    const semanticDims: QualityDimension[] = [
      'intent_alignment', 'opening_strength', 'emotional_impact',
      'character_voice', 'dialogue_quality', 'originality', 'sensory_richness',
    ]
    // 排除：ending_hook（已有专项重写）

    const scored = semanticDims
      .map(dim => ({ dim, score: reflection.dimensionScores[dim] ?? 0 }))
      .filter(d => d.score < 0.80) // v13.7: 0.82→0.80，减少重写触发，避免原创性退化
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
    let strategy = DIMENSION_REWRITE_STRATEGIES[dim]
    if (!strategy) return null

    // v13.5: reveal_secret意图的对话重写策略 — 允许解释但必须生动
    if (dim === 'dialogue_quality' && intent.primary.type === 'reveal_secret') {
      strategy = {
        label: '对话质量',
        target: '保留所有解释性对话但让它们更生动、更有张力',
        instructions: [
          `- ⚠️ 不要删除任何解释设定的对话！reveal_secret章节的设定解释是核心内容，删了就没了`,
          `- 逐句检查长段解释对话，做以下改造：`,
          `  · 3句以上连续解释 → 插入动作打断（角色说话时走动/握拳/移开视线等）`,
          `  · 单向解释 → 改为问答交锋（听者质疑/打断/追问，制造信息博弈感）`,
          `  · 平淡陈述 → 加入情感反应（震惊/怀疑/恐惧/愤怒），让信息释放有情绪冲击`,
          `  · 堆砌信息 → 分层揭示（先说表层，角色反应后再说深层），制造认知颠覆节奏`,
          `- 对话引导词多样化：用"压低声音""一字一顿""深吸一口气""盯着对方的眼睛"等替代"说""道"`,
          `- 在关键信息揭示处插入沉默/停顿，让读者有时间消化`,
          `- 禁止：把解释改成旁白叙述（失去对话的互动感），禁止：一刀切删掉解释对话`,
        ],
      }
    }

    // v13.8: 困难意图的原创性专属策略 — 比通用策略更具体
    if (dim === 'originality' && intent.primary.type === 'show_growth') {
      strategy = {
        label: '原创性',
        target: '替换所有修炼模板化表达，用独特的身体代价和认知变化来展现成长',
        instructions: [
          `- 扫描并删除所有修炼模板：`,
          `  · "盘膝坐下""内视丹田""突破境界""瓶颈松动" → 用具体的身体动作替代`,
          `  · "剑骨在震""体内嗡的一声""修为暴涨" → 用独特的身体反应（骨头错位/血液逆流/视觉扭曲）`,
          `  · "吸收灵气""运转功法" → 用被动感知替代（主角不是在修炼，而是被迫感知到某种力量）`,
          `- 成长必须有代价：不是"痛并突破"，而是"付出了什么"。代价必须是具体的、不可逆的：`,
          `  · 身体代价：留下一道永久伤痕/失去某种感官/寿命缩短`,
          `  · 认知代价：发现一个残酷真相/被迫接受一个无法改变的事实`,
          `  · 关系代价：成长过程中失去或误解了某个重要的人`,
          `- 禁止"他感觉修为提升了一大截"这类结果告知，改为展现具体变化：`,
          `  · 能看见之前看不见的东西（"墙上的裂纹在他眼中像一条条河流"）`,
          `  · 能做到之前做不到的事（"他抬手，指尖还没碰到茶杯，杯壁已经裂了"）`,
          `- 至少创造一处读者"没想到"的成长方式——不是功法突破，而是对世界的理解发生了改变`,
          `- ⚠️ 对话内容本身不要修改，只修改旁白和描写中的模板化表达`,
        ],
      }
    }

    if (dim === 'originality' && intent.primary.type === 'create_conflict') {
      strategy = {
        label: '原创性',
        target: '替换所有反派模板化表达，让冲突双方都有合理的动机和独特的表达方式',
        instructions: [
          `- 扫描并删除所有反派模板：`,
          `  · "冷笑一声""眼中闪过一丝寒芒""嘴角勾起一抹弧度" → 用具体动作（手指敲桌面/偏头不看对方/用指甲划桌面）`,
          `  · "阴冷的声音""低沉的声音" → 用声音的物理特征（声音像砂纸擦过木板/说话时气声很重/每个字都像从齿缝里挤出来）`,
          `  · "从怀中掏出一枚令牌/一封密信" → 用具体的、场景相关的道具`,
          `- 反派不是道具：给对手一个读者能理解的动机（不一定要认同，但必须理解）`,
          `- 冲突升级必须有层次，不是"见面就动手"：`,
          `  · 对方先试探（不是直接威胁，是暗示/旁敲侧击）`,
          `  · 主角回应（不是硬刚，是迂回/利用规则/借力打力）`,
          `  · 冲突不可逆点（双方都回不了头的那一刻——具体是什么动作/什么话）`,
          `- 禁止用"恐怖的气势""惊人的力量""毁灭性的攻击"等万能修饰词`,
          `- ⚠️ 对话内容本身不要修改，只修改旁白和描写中的模板化表达`,
        ],
      }
    }

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
   * v13.8: 困难意图阈值0.75（更早触发），普通意图0.82
   */
  private findHookWeakness(reflection: ReflectionResult, intentType?: string): QualityConcern | null {
    // v13.8: 困难意图（show_growth, create_conflict）使用更低的阈值
    const isHardIntent = intentType === 'show_growth' || intentType === 'create_conflict'
    const threshold = isHardIntent ? 0.75 : 0.82

    const hookScore = reflection.dimensionScores['ending_hook']
    if (hookScore === undefined || hookScore >= threshold) return null

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

    // v14.3: 意图引导注入user message（而非system prompt），保持system prompt静态以利用缓存
    const intentGuidance = this.buildIntentGuidance(intent, coolingResult, memoryResults)
    if (intentGuidance && messages.length >= 2 && messages[messages.length - 1].role === 'user') {
      messages[messages.length - 1] = {
        ...messages[messages.length - 1],
        content: intentGuidance + '\n\n' + messages[messages.length - 1].content,
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

    // v14.3: 核心写作金句移至 generatePromptStrategy（buildIntentGuidance），此处不再重复
    // 困难意图专属反套路约束
    const hardIntentAntiClichés = this.getHardIntentAntiClichés(intent.primary.type)
    if (hardIntentAntiClichés.length > 0) {
      parts.push(`【反套路约束 — 必须严格遵守】`)
      for (const cliché of hardIntentAntiClichés) {
        parts.push(cliché)
      }
    }

    return parts.join('\n')
  }

  /**
   * v13.8: 困难意图专属反套路约束
   * show_growth 和 create_conflict 是LLM模型最难处理的意图类型
   * 在源头注入反套路提示，比事后重写修复更有效
   */
  private getHardIntentAntiClichés(intentType: string): string[] {
    switch (intentType) {
      // ========== 已覆盖 ==========
      case 'show_growth':
        return [
          `- 禁止使用"盘膝坐下""内视丹田""突破境界""瓶颈松动"等修炼模板`,
          `- 禁止让成长过程变成"吸收能量→身体发热→修为提升"的线性流程`,
          `- 成长必须有代价：疼痛/记忆/代价/副作用，三者至少选一`,
          `- 成长过程必须用具体动作和感官细节展现，不能是"他感觉修为提升了"这类告知`,
          `- 禁止"剑骨在震""体内嗡的一声"等万能模板，用独特的身体反应`,
          `- 成长不止是修为提升，也可以是认知变化（发现一个秘密/理解一个真相/做出一个抉择）`,
        ]
      case 'create_conflict':
        return [
          `- 禁止将冲突写成简单的"正邪对立"或"恃强凌弱"，双方必须有各自的合理动机`,
          `- 禁止"冷笑一声""眼中闪过一丝寒芒""嘴角勾起一抹弧度"等反派模板`,
          `- 冲突升级必须有层次感：言语试探→行为挑衅→底线触碰→全面爆发`,
          `- 反派不是道具，要有自己的利益诉求和底线，让读者理解（但不一定认同）其立场`,
          `- 禁止"他从怀中掏出一枚令牌/一封密信"等万能道具，冲突源必须具体且独特`,
        ]
      // ========== v14.1 新增 ==========
      case 'world_building':
        return [
          `- 禁止"古老的传说""千百年来""无人知晓""神秘的力量"等万能世界观模板`,
          `- 世界观必须通过角色体验和具体场景展现，不能是旁白直接告知或教科书式介绍`,
          `- 禁止"在XX大陆上，有XX个XX"这种分类式世界观说明`,
          `- 每次只展示世界观的一个切面，通过角色的有限视角去感知（而非上帝视角俯瞰）`,
        ]
      case 'character_intro':
        return [
          `- 禁止"一袭白衣/黑衣""眉宇间透着一股XX""不怒自威""深不可测"等角色外貌模板`,
          `- 角色登场必须通过具体行动或对话展现性格，外貌描写不超过3句`,
          `- 每个新角色必须有一个独特的身体特征或行为习惯（非外貌形容词），如：指甲缝里的泥/说话前先抿嘴/走路时右脚微跛`,
          `- 禁止用"他给人的感觉是……""他身上有一种……的气质"等抽象概括`,
        ]
      case 'advance_plot':
        return [
          `- 禁止"他不知道的是""就在这时""突然""然而就在此时"等转折信号词，让事件本身的因果制造转折`,
          `- 剧情推进必须有因果链，不能靠巧合推动（如"恰好遇到""刚好听到"）`,
          `- 每段信息必须有双重作用：推进剧情 + 揭示角色性格或世界规则`,
          `- 禁止用"与此同时，在XX地方……"做场景切换，用角色感知或物件关联来转场`,
        ]
      case 'build_relationship':
        return [
          `- 禁止"心中涌起一股暖流""目光交汇""心跳加速""四目相对"等情感模板`,
          `- 关系变化必须通过具体行动和对话展现，不能是内心独白直接告知`,
          `- 禁止"从这一刻起，他/她对XX的看法彻底改变了"这种关系转折宣告`,
          `- 关系必须有张力：信任与怀疑并存、亲近与距离交替，不能是单向的"好感增加"`,
        ]
      case 'raise_stakes':
        return [
          `- 禁止"前所未有的危机""毁灭性的力量""一场更大的阴谋正在酝酿"等万能危机模板`,
          `- 危机升级必须有具体代价和具体威胁——谁、什么、什么时候、输了会怎样`,
          `- 赌注必须让读者感到"输不起"——不是抽象的世界毁灭，而是具体的人、物、信念`,
          `- 禁止用"如果失败，后果不堪设想"这种模糊威胁，必须写出具体后果`,
        ]
      case 'reveal_secret':
        return [
          `- 禁止"真相是……""原来……""其实……""他一直以为……但实际上……"等直接揭示句式`,
          `- 秘密揭示必须有层次：先给线索→角色反应/误判→再给更深层信息→认知颠覆`,
          `- 禁止一次性倒出所有信息，每层揭示后必须有角色消化和情感反应`,
          `- 揭示方式必须多样化：通过物件/对话/场景/感官触发，不能全靠"某人说出真相"`,
        ]
      case 'climax':
        return [
          `- 禁止"最强一击""气势攀升到顶点""天地变色""日月无光""空间都为之扭曲"等高潮模板`,
          `- 高潮必须有节奏变化：加速→爆发→停顿→收束，不能是持续的感官轰炸`,
          `- 高潮必须有不可逆的后果——战斗中至少有一个永久性改变（伤势/关系/认知/环境）`,
          `- 禁止"他/她终于使出了那一招"这种蓄力宣告，让招式在行动中自然展现`,
        ]
      case 'emotional_impact':
        return [
          `- 禁止"泪流满面""心中涌起""无法抑制的""一股XX涌上心头"等情感告知模板`,
          `- 情感必须通过身体反应和环境投射展现：握拳/发抖/呼吸变化/环境感知扭曲`,
          `- 禁止用"他感到XX"句式，改为具体行为：他感到悲伤 → 他把脸埋在掌心，肩膀微微发抖`,
          `- 情感冲击必须有"余波"——不是哭完就结束，而是情绪如何影响后续行动和判断`,
        ]
      default:
        return []
    }
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

    // v13.7: 检测是否为重写消息（维度重写/钩子重写/整体重写）
    // 重写消息已包含完整内容和修改指令，不应追加字数要求
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    const isRewriteMsg = lastUserMsg?.content?.includes('【完整内容 — 请') ||
      lastUserMsg?.content?.includes('【钩子强化') ||
      lastUserMsg?.content?.includes('【整体重写') ||
      lastUserMsg?.content?.includes('【内容扩展')

    // 在用户消息中追加字数要求（仅生成场景，重写/扩展场景跳过）
    const enhancedMessages = messages.map(m => {
      if (m.role === 'user' && !isRewriteMsg) {
        return {
          ...m,
          content: m.content + `\n\n请生成约${targetWords}字的完整章节内容。`,
        }
      }
      return m
    })

    // v14.1: 网络重试 — 最多2次重试，指数退避
    const maxRetries = 2
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.llm.chat({
          messages: enhancedMessages,
          temperature: this.config.temperature,
          maxTokens: Math.max(targetWords * this.config.maxTokensRatio, this.config.minMaxTokens),
        })

        const cleaned = cleanMarkdownNoise(result.content || '')
        return cleaned
      } catch (err) {
        lastError = err as Error
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000 // 1s, 2s
          logWarn('Orchestrator', `LLM调用失败(尝试${attempt + 1}/${maxRetries + 1})，${delay}ms后重试: ${lastError.message}`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError || new Error('[Orchestrator] LLM调用失败，已达最大重试次数')
  }

  /**
   * v14.1: 字数扩展 — 当初始生成严重不足时，让LLM继续写
   * 保持已有内容不变，追加后续内容
   */
  private async expandShortContent(
    content: string,
    messages: ChatMessage[],
    targetWords: number,
  ): Promise<string> {
    const currentWords = content.length
    const expandWords = targetWords - currentWords

    const expandMsg: ChatMessage = {
      role: 'user',
      content: [
        `【内容扩展 — 当前仅${currentWords}字，远不足目标的${targetWords}字】`,
        `请你继续以上内容往下写，追加约${expandWords}字。`,
        `保持风格一致，情节连贯，不要重复已有内容，不要另起炉灶。`,
        ``,
        `【已有内容 — 请从末尾继续写】`,
        content,
      ].join('\n'),
    }

    const expandMessages = [...messages]
    if (expandMessages.length >= 2) {
      expandMessages[expandMessages.length - 1] = expandMsg
    } else {
      expandMessages.push(expandMsg)
    }

    const expanded = await this.callLLM(expandMessages, expandWords)
    return expanded
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