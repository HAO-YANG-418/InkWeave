// ============================================================
// PlotPlanner 情节规划器 — GWE v6.0 完美规划层
// 自动生成大纲和分支，管理多卷多线的情节结构
// v6.5: 接入knowledge/plot-rules，使用知识库的情节结构规则
// ============================================================

import {
  type PlotNode,
  type PlotOutline,
  type VolumeOutline,
  type ChapterOutline,
  type PlotMilestone,
  type PlotNodeType,
} from './types'
import {
  NODE_DEPENDENCIES,
  PACING_RATIOS,
  WATER_CHAPTER_RULES,
  CONSISTENCY_CHECKS,
  OUTLINE_RULES,
  detectWaterChapter as detectWaterChapterRule,
  generateOutlineLLMPrompt,
  generateConsistencyLLMPrompt,
  generateWaterChapterLLMPrompt,
} from '../knowledge/plot-rules'
import type { LLMProvider } from '../types'
import { llmJson, hasLLM } from '../llm-helper'
import { DEFAULT_LLM_CONFIG } from '../llm-config'

/** 情节规划配置 */
export interface PlotPlannerConfig {
  /** 每卷默认章节数 */
  defaultChaptersPerVolume: number
  /** 高潮位置（比例，如 0.8 表示在卷的80%处） */
  climaxPosition: number
  /** 转折点间隔（每N章一个转折） */
  turningPointInterval: number
}

const DEFAULT_CONFIG: PlotPlannerConfig = {
  defaultChaptersPerVolume: 10,
  climaxPosition: 0.8,
  turningPointInterval: 3,
}

// ============================================================
// 节点类型模板
// ============================================================

const NODE_TEMPLATES: Record<PlotNodeType, { importance: number; description: string }> = {
  setup:       { importance: 0.5, description: '铺垫节点：建立场景、角色或规则' },
  turning_point: { importance: 0.7, description: '转折节点：剧情方向改变' },
  climax:      { importance: 1.0, description: '高潮节点：冲突达到顶点' },
  revelation:  { importance: 0.8, description: '揭示节点：关键信息释放' },
  resolution:  { importance: 0.6, description: '解决节点：冲突解决/收束' },
  breather:    { importance: 0.3, description: '缓冲节点：节奏调节' },
  hook:        { importance: 0.6, description: '钩子节点：引发下一阶段' },
}

// ============================================================
// PlotPlanner 主类
// ============================================================

export class PlotPlanner {
  private config: PlotPlannerConfig
  private outlines: Map<string, PlotOutline> = new Map()
  private nodeCounter = 0
  private llm: LLMProvider | null = null

  constructor(config?: Partial<PlotPlannerConfig>, llm?: LLMProvider | null) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.llm = llm ?? null
  }

  /** 注入LLM Provider（用于延迟初始化） */
  setLLM(llm: LLMProvider | null): void {
    this.llm = llm
  }

  /**
   * 生成大纲
   */
  generateOutline(
    bookId: string,
    totalVolumes: number,
    options?: {
      volumeTitles?: string[]
      volumeArcs?: string[]
      totalChapters?: number
    },
  ): PlotOutline {
    const chaptersPerVolume = options?.totalChapters
      ? Math.ceil(options.totalChapters / totalVolumes)
      : this.config.defaultChaptersPerVolume

    const nodes: PlotNode[] = []
    const volumes: VolumeOutline[] = []
    const milestones: PlotMilestone[] = []
    let chapterCounter = 0

    for (let v = 1; v <= totalVolumes; v++) {
      const volChapters: ChapterOutline[] = []

      for (let c = 1; c <= chaptersPerVolume; c++) {
        chapterCounter++
        const nodeType = this.determineNodeType(c, chaptersPerVolume)
        const node = this.createNode(chapterCounter, nodeType)
        nodes.push(node)

        volChapters.push({
          chapterNumber: chapterCounter,
          title: `第${chapterCounter}章`,
          summary: '',
          intent: nodeType,
          keyEvents: [node.event],
          characters: [],
          foreshadows: [],
        })
      }

      // 卷里程碑
      const volStart = (v - 1) * chaptersPerVolume + 1
      const volEnd = v * chaptersPerVolume
      milestones.push(
        { id: `vol_${v}_start`, name: `第${v}卷开始`, chapter: volStart, type: 'setup', completed: false },
        { id: `vol_${v}_mid`, name: `第${v}卷中点`, chapter: Math.floor((volStart + volEnd) / 2), type: 'midpoint', completed: false },
        { id: `vol_${v}_climax`, name: `第${v}卷高潮`, chapter: Math.floor(volStart + (volEnd - volStart) * this.config.climaxPosition), type: 'climax', completed: false },
        { id: `vol_${v}_end`, name: `第${v}卷收束`, chapter: volEnd, type: 'resolution', completed: false },
      )

      volumes.push({
        volumeNumber: v,
        title: options?.volumeTitles?.[v - 1] || `第${v}卷`,
        chapters: volChapters,
        arc: options?.volumeArcs?.[v - 1] || `${v === 1 ? '开局' : v === totalVolumes ? '终局' : '发展'}`,
      })
    }

    // 链接节点
    for (let i = 0; i < nodes.length - 1; i++) {
      nodes[i].consequences.push(nodes[i + 1].id)
      nodes[i + 1].prerequisites.push(nodes[i].id)
    }

    const outline: PlotOutline = {
      bookId,
      volumes,
      nodes,
      milestones,
    }

    this.outlines.set(bookId, outline)
    return outline
  }

  /**
   * 分支场景
   * 在某个节点创建分支，探索不同选择的结果
   */
  branchScenario(node: PlotNode, choices: string[]): PlotNode[] {
    return choices.map((choice, i) => ({
      id: `${node.id}_branch_${i + 1}`,
      event: choice,
      chapter: node.chapter,
      type: 'turning_point' as PlotNodeType,
      prerequisites: [node.id],
      consequences: [],
      completed: false,
      importance: 0.6,
      choices: [{
        id: `${node.id}_choice_${i + 1}`,
        description: choice,
        consequences: [],
        probability: 1 / choices.length,
      }],
    }))
  }

  /**
   * 获取从起点到里程碑的路径
   */
  getPath(startNodeId: string, milestoneId: string, outline: PlotOutline): PlotNode[] {
    const milestone = outline.milestones.find(m => m.id === milestoneId)
    if (!milestone) return []

    const startNode = outline.nodes.find(n => n.id === startNodeId)
    if (!startNode) return []

    const path: PlotNode[] = [startNode]
    const visited = new Set<string>([startNodeId])

    let current = startNode
    while (current.chapter < milestone.chapter) {
      const next = outline.nodes.find(n =>
        n.chapter > current.chapter && !visited.has(n.id),
      )
      if (!next) break
      path.push(next)
      visited.add(next.id)
      current = next
    }

    return path
  }

  /**
   * 获取大纲
   */
  getOutline(bookId: string): PlotOutline | undefined {
    return this.outlines.get(bookId)
  }

  /**
   * 标记节点完成
   */
  markComplete(bookId: string, nodeId: string): boolean {
    const outline = this.outlines.get(bookId)
    if (!outline) return false

    const node = outline.nodes.find(n => n.id === nodeId)
    if (!node) return false

    node.completed = true
    return true
  }

  /**
   * 获取下一个未完成的节点
   */
  getNextIncomplete(bookId: string): PlotNode | null {
    const outline = this.outlines.get(bookId)
    if (!outline) return null

    return outline.nodes.find(n => !n.completed) || null
  }

  /**
   * 导出大纲文本
   */
  exportOutlineText(bookId: string): string {
    const outline = this.outlines.get(bookId)
    if (!outline) return '无大纲数据'

    const lines: string[] = [`【${bookId} 情节大纲】`]

    for (const vol of outline.volumes) {
      lines.push(`\n第${vol.volumeNumber}卷「${vol.title}」— ${vol.arc}`)
      for (const ch of vol.chapters) {
        const status = outline.nodes.find(n => n.chapter === ch.chapterNumber)?.completed ? '✓' : '○'
        lines.push(`  ${status} 第${ch.chapterNumber}章 [${ch.intent}] ${ch.keyEvents.join(' | ')}`)
      }
    }

    return lines.join('\n')
  }

  /**
   * 检查一致性
   * 返回潜在的情节问题
   */
  checkConsistency(bookId: string): string[] {
    const outline = this.outlines.get(bookId)
    if (!outline) return []

    const issues: string[] = []

    // 检查是否有孤立节点
    for (const node of outline.nodes) {
      if (node.prerequisites.length === 0 && node.chapter > 1 && node.type !== 'setup') {
        issues.push(`第${node.chapter}章节点"${node.event}"缺少前置节点`)
      }
    }

    // 检查高潮是否太密集
    const climaxNodes = outline.nodes.filter(n => n.type === 'climax')
    for (let i = 1; i < climaxNodes.length; i++) {
      if (climaxNodes[i].chapter - climaxNodes[i - 1].chapter < 3) {
        issues.push(`第${climaxNodes[i - 1].chapter}章和第${climaxNodes[i].chapter}章高潮间隔过短`)
      }
    }

    // 检查缓冲是否充足
    const breatherCount = outline.nodes.filter(n => n.type === 'breather').length
    const totalChapters = outline.nodes.length
    if (breatherCount / totalChapters < 0.05) {
      issues.push(`缓冲章节不足（${breatherCount}/${totalChapters}），建议至少占5%`)
    }

    return issues
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private determineNodeType(chapterInVolume: number, totalInVolume: number): PlotNodeType {
    const ratio = chapterInVolume / totalInVolume

    if (ratio < 0.2) return 'setup'
    if (ratio >= this.config.climaxPosition - 0.05 && ratio <= this.config.climaxPosition + 0.05) {
      return 'climax'
    }
    if (ratio > 0.9) return 'resolution'
    if (chapterInVolume % this.config.turningPointInterval === 0) return 'turning_point'
    if (chapterInVolume % 4 === 0) return 'breather'

    return 'setup'
  }

  private createNode(chapter: number, type: PlotNodeType): PlotNode {
    const template = NODE_TEMPLATES[type]
    return {
      id: `node_${++this.nodeCounter}`,
      event: template.description,
      chapter,
      type,
      prerequisites: [],
      consequences: [],
      completed: false,
      importance: template.importance,
    }
  }

  // ============================================================
  // 知识库驱动的方法（v6.5 新增）
  // ============================================================

  /**
   * 检测水文章节
   * 使用知识库的WATER_CHAPTER_RULES进行多维度检测
   *
   * @param content 章节文本内容
   * @param metrics 章节统计指标（新事件数、冲突数等）
   * @returns 检测结果：是否为水文、命中的规则、建议
   */
  detectWaterChapter(content: string, metrics: {
    newEvents: number
    conflicts: number
    decisions: number
    reviewRatio: number
    monologueRatio: number
    dialogueRatio: number
    trainingDescription: boolean
  }): {
    isWaterChapter: boolean
    matchedRules: Array<{ rule: string; severity: string; detail: string }>
    suggestions: string[]
  } {
    const results = detectWaterChapterRule(content, metrics)
    const triggeredResults = results.filter(r => r.triggered)

    const matchedRules = triggeredResults.map(r => ({
      rule: r.rule.check,
      severity: r.rule.severity,
      detail: r.detail,
    }))

    // 生成改进建议
    const suggestions: string[] = []
    for (const r of triggeredResults) {
      suggestions.push(r.rule.suggestion)
    }

    // 判定为水文的条件：有critical级别规则触发，或有2条以上warning规则触发
    const criticalCount = triggeredResults.filter(r => r.rule.severity === 'critical').length
    const warningCount = triggeredResults.filter(r => r.rule.severity === 'warning').length
    const isWaterChapter = criticalCount > 0 || warningCount >= 2

    return {
      isWaterChapter,
      matchedRules,
      suggestions,
    }
  }

  /**
   * 获取卷级节奏配比建议
   * 根据知识库的PACING_RATIOS，指导各类型节点在卷中的分布
   *
   * @param totalChapters 卷的总章节数
   * @returns 各类型节点的建议数量范围
   */
  getPacingGuidance(totalChapters: number): Array<{
    nodeType: string
    label: string
    minCount: number
    maxCount: number
    description: string
  }> {
    return PACING_RATIOS.ratios.map(ratio => ({
      nodeType: ratio.type,
      label: ratio.label,
      minCount: Math.floor(totalChapters * ratio.min),
      maxCount: Math.ceil(totalChapters * ratio.max),
      description: `${ratio.label}节点应占总章节的${(ratio.min * 100).toFixed(0)}%-${(ratio.max * 100).toFixed(0)}%`,
    }))
  }

  /**
   * 获取水文检测规则
   * 供外部展示"什么样的章节会被判定为水文"
   */
  getWaterChapterRules(): typeof WATER_CHAPTER_RULES {
    return WATER_CHAPTER_RULES
  }

  /**
   * 获取大纲生成规则
   * 供外部了解大纲生成的约束条件
   */
  getOutlineRules(): typeof OUTLINE_RULES {
    return OUTLINE_RULES
  }

  /**
   * 获取一致性检查清单
   * 供外部展示"一致性检查包含哪些维度"
   */
  getConsistencyCheckList(): typeof CONSISTENCY_CHECKS {
    return CONSISTENCY_CHECKS
  }

  /**
   * 获取节点依赖关系
   * 供外部了解各节点类型的前后依赖约束
   */
  getNodeDependencies(): typeof NODE_DEPENDENCIES {
    return NODE_DEPENDENCIES
  }

  // ============================================================
  // LLM驱动的方法（v9.0 新增）
  // ============================================================

  /**
   * LLM驱动的大纲生成
   * 根据故事上下文（题材、世界观、角色、已有章节）智能生成大纲
   * 无LLM时降级到规则引擎的 generateOutline
   */
  async generateOutlineAsync(
    bookId: string,
    totalVolumes: number,
    context?: {
      genre?: string
      worldPremise?: string
      characters?: Array<{ name: string; role: string; description: string }>
      existingChapters?: Array<{ number: number; title: string; summary: string }>
      volumeTitles?: string[]
      volumeArcs?: string[]
      totalChapters?: number
    },
  ): Promise<PlotOutline> {
    // 无LLM时降级
    if (!hasLLM(this.llm)) {
      return this.generateOutline(bookId, totalVolumes, {
        volumeTitles: context?.volumeTitles,
        volumeArcs: context?.volumeArcs,
        totalChapters: context?.totalChapters,
      })
    }

    const chaptersPerVolume = context?.totalChapters
      ? Math.ceil(context.totalChapters / totalVolumes)
      : this.config.defaultChaptersPerVolume

    const prompt = generateOutlineLLMPrompt({
      genre: context?.genre || '通用',
      worldPremise: context?.worldPremise || '',
      characters: context?.characters || [],
      existingChapters: context?.existingChapters || [],
      totalVolumes,
      chaptersPerVolume,
      volumeTitles: context?.volumeTitles,
      volumeArcs: context?.volumeArcs,
    })

    interface LLMOutlineNode {
      volume: number
      chapter: number
      type: string
      title: string
      event: string
      keyEvents: string[]
      foreshadows: string[]
    }
    const llmNodes = await llmJson<LLMOutlineNode[]>(this.llm, [
      { role: 'system', content: '你是网文情节规划专家。请根据提供的信息生成大纲节点。返回JSON数组。' },
      { role: 'user', content: prompt },
    ], { temperature: DEFAULT_LLM_CONFIG.planning.temperature, maxTokens: DEFAULT_LLM_CONFIG.planning.maxTokens })

    // LLM返回无效时降级
    if (!llmNodes || !Array.isArray(llmNodes) || llmNodes.length === 0) {
      return this.generateOutline(bookId, totalVolumes, {
        volumeTitles: context?.volumeTitles,
        volumeArcs: context?.volumeArcs,
        totalChapters: context?.totalChapters,
      })
    }

    // 将LLM结果转换为PlotOutline结构
    const nodes: PlotNode[] = []
    const volumes: VolumeOutline[] = []
    const milestones: PlotMilestone[] = []

    for (const ln of llmNodes) {
      const nodeType = this.normalizeNodeType(ln.type)
      const node = this.createNode(ln.chapter, nodeType)
      node.event = ln.event || node.event
      nodes.push(node)
    }

    // 按卷组织章节
    for (let v = 1; v <= totalVolumes; v++) {
      const volChapters: ChapterOutline[] = []
      const volStart = (v - 1) * chaptersPerVolume + 1
      const volEnd = v * chaptersPerVolume

      for (let c = 1; c <= chaptersPerVolume; c++) {
        const chNum = (v - 1) * chaptersPerVolume + c
        const ln = llmNodes.find(n => n.chapter === chNum)
        const node = nodes.find(n => n.chapter === chNum)
        volChapters.push({
          chapterNumber: chNum,
          title: ln?.title || `第${chNum}章`,
          summary: '',
          intent: node?.type || 'setup',
          keyEvents: ln?.keyEvents || [node?.event || ''],
          characters: [],
          foreshadows: ln?.foreshadows || [],
        })
      }

      milestones.push(
        { id: `vol_${v}_start`, name: `第${v}卷开始`, chapter: volStart, type: 'setup', completed: false },
        { id: `vol_${v}_mid`, name: `第${v}卷中点`, chapter: Math.floor((volStart + volEnd) / 2), type: 'midpoint', completed: false },
        { id: `vol_${v}_climax`, name: `第${v}卷高潮`, chapter: Math.floor(volStart + (volEnd - volStart) * this.config.climaxPosition), type: 'climax', completed: false },
        { id: `vol_${v}_end`, name: `第${v}卷收束`, chapter: volEnd, type: 'resolution', completed: false },
      )

      volumes.push({
        volumeNumber: v,
        title: context?.volumeTitles?.[v - 1] || `第${v}卷`,
        chapters: volChapters,
        arc: context?.volumeArcs?.[v - 1] || `${v === 1 ? '开局' : v === totalVolumes ? '终局' : '发展'}`,
      })
    }

    // 链接节点
    for (let i = 0; i < nodes.length - 1; i++) {
      nodes[i].consequences.push(nodes[i + 1].id)
      nodes[i + 1].prerequisites.push(nodes[i].id)
    }

    const outline: PlotOutline = { bookId, volumes, nodes, milestones }
    this.outlines.set(bookId, outline)
    return outline
  }

  /**
   * LLM驱动的一致性检查
   * 用语义理解检测情节矛盾、角色弧线断裂、伏笔遗忘等问题
   * 无LLM时降级到规则引擎的 checkConsistency
   */
  async checkConsistencyAsync(
    bookId: string,
    context?: {
      chapters?: Array<{ number: number; title: string; content: string }>
      characters?: Array<{ name: string; description: string }>
      settings?: Array<{ name: string; description: string }>
    },
  ): Promise<string[]> {
    if (!hasLLM(this.llm)) {
      return this.checkConsistency(bookId)
    }

    const outline = this.outlines.get(bookId)
    if (!outline) return []

    const outlineText = this.exportOutlineText(bookId)
    const chaptersText = context?.chapters
      ? context.chapters.map(c => `第${c.number}章《${c.title}》：${c.content.slice(0, 500)}`).join('\n')
      : ''
    const charsText = context?.characters
      ? context.characters.map(c => `${c.name}：${c.description}`).join('\n')
      : ''
    const settingsText = context?.settings
      ? context.settings.map(s => `${s.name}：${s.description}`).join('\n')
      : ''

    const prompt = generateConsistencyLLMPrompt({
      outlineText,
      chaptersText,
      charactersText: charsText,
      settingsText,
    })

    interface LLMConsistencyResult {
      issues: Array<{ severity: string; description: string; suggestion: string }>
    }
    const result = await llmJson<LLMConsistencyResult>(this.llm, [
      { role: 'system', content: '你是网文情节一致性审查专家。请检查提供的大纲和章节内容，找出所有一致性问题。返回JSON。' },
      { role: 'user', content: prompt },
    ], { temperature: DEFAULT_LLM_CONFIG.planningEval.temperature, maxTokens: DEFAULT_LLM_CONFIG.planningEval.maxTokens })

    if (!result || !result.issues) {
      return this.checkConsistency(bookId)
    }

    // 合并LLM发现的问题和规则引擎发现的问题
    const ruleIssues = this.checkConsistency(bookId)
    const llmIssues = result.issues.map(i =>
      `[${i.severity}] ${i.description}${i.suggestion ? `（建议：${i.suggestion}）` : ''}`
    )

    // 去重（LLM可能发现规则引擎已发现的问题）
    const allIssues = [...ruleIssues]
    for (const issue of llmIssues) {
      if (!allIssues.some(r => r.includes(issue.slice(0, 20)))) {
        allIssues.push(issue)
      }
    }

    return allIssues
  }

  /**
   * LLM驱动的水章检测
   * 用语义理解判断章节是否为水文，而非简单的指标匹配
   * 无LLM时降级到规则引擎的 detectWaterChapter
   */
  async detectWaterChapterAsync(
    content: string,
    metrics: {
      newEvents: number
      conflicts: number
      decisions: number
      reviewRatio: number
      monologueRatio: number
      dialogueRatio: number
      trainingDescription: boolean
    },
    context?: {
      chapterNumber?: number
      chapterTitle?: string
      previousChapterContent?: string
    },
  ): Promise<{
    isWaterChapter: boolean
    matchedRules: Array<{ rule: string; severity: string; detail: string }>
    suggestions: string[]
    llmAnalysis?: string
  }> {
    if (!hasLLM(this.llm)) {
      return this.detectWaterChapter(content, metrics)
    }

    const prompt = generateWaterChapterLLMPrompt({
      content: content.slice(0, 3000),
      chapterNumber: context?.chapterNumber,
      chapterTitle: context?.chapterTitle,
      previousContent: context?.previousChapterContent?.slice(0, 1000),
      metrics,
    })

    interface LLMWaterResult {
      isWaterChapter: boolean
      issues: Array<{ rule: string; severity: string; detail: string }>
      suggestions: string[]
      analysis: string
    }
    const result = await llmJson<LLMWaterResult>(this.llm, [
      { role: 'system', content: '你是网文质量审查专家。请判断提供的章节是否为"水章"，并给出具体分析和改进建议。返回JSON。' },
      { role: 'user', content: prompt },
    ], { temperature: DEFAULT_LLM_CONFIG.outlineCheck.temperature, maxTokens: DEFAULT_LLM_CONFIG.outlineCheck.maxTokens })

    if (!result) {
      return this.detectWaterChapter(content, metrics)
    }

    return {
      isWaterChapter: result.isWaterChapter,
      matchedRules: result.issues || [],
      suggestions: result.suggestions || [],
      llmAnalysis: result.analysis,
    }
  }

  /** 将LLM返回的节点类型字符串规范化 */
  private normalizeNodeType(type: string): PlotNodeType {
    const lower = type.toLowerCase().replace(/\s+/g, '_')
    const map: Record<string, PlotNodeType> = {
      'setup': 'setup',
      'turning_point': 'turning_point',
      'turningpoint': 'turning_point',
      'twist': 'turning_point',
      'climax': 'climax',
      'revelation': 'revelation',
      'resolution': 'resolution',
      'breather': 'breather',
      'hook': 'hook',
      '铺垫': 'setup',
      '转折': 'turning_point',
      '高潮': 'climax',
      '揭示': 'revelation',
      '解决': 'resolution',
      '缓冲': 'breather',
      '钩子': 'hook',
    }
    return map[lower] || map[type] || 'setup'
  }
}