// ============================================================
// 多线程协调器 — GWE v6.0 创意跳跃层
// 核心能力：管理多条叙事线（主线、支线、角色弧、感情线等）
// 让AI像资深作者一样驾驭多线叙事——同时推进而不混乱
// ============================================================

import {
  type NarrativeThread,
  type ThreadType,
  type ThreadStatus,
  type ThreadIntersection,
  type MultiThreadConfig,
} from './types'

// ============================================================
// 默认配置
// ============================================================

const DEFAULT_MULTI_THREAD_CONFIG: MultiThreadConfig = {
  maxActiveThreads: 4,
  threadInterval: 3,
  autoBalance: true,
}

// ============================================================
// 多线程协调器
// ============================================================

export class MultiThreadCoordinator {
  private threads: Map<string, NarrativeThread> = new Map()
  private intersections: ThreadIntersection[] = []
  private config: MultiThreadConfig

  constructor(config?: Partial<MultiThreadConfig>) {
    this.config = { ...DEFAULT_MULTI_THREAD_CONFIG, ...config }
  }

  /**
   * 创建叙事线程
   */
  createThread(params: {
    name: string
    type: ThreadType
    characters: string[]
    startChapter: number
    plannedEndChapter: number
    description: string
    priority?: number
  }): NarrativeThread {
    const id = this.generateThreadId(params.name)
    const thread: NarrativeThread = {
      id,
      name: params.name,
      type: params.type,
      characters: params.characters,
      startChapter: params.startChapter,
      currentChapter: params.startChapter,
      plannedEndChapter: params.plannedEndChapter,
      status: 'active',
      priority: params.priority || 5,
      description: params.description,
      milestones: [],
    }

    this.threads.set(id, thread)
    return thread
  }

  /**
   * 获取线程
   */
  getThread(id: string): NarrativeThread | undefined {
    return this.threads.get(id)
  }

  /**
   * 获取所有线程
   */
  getAllThreads(): NarrativeThread[] {
    return Array.from(this.threads.values())
  }

  /**
   * 获取活跃线程
   */
  getActiveThreads(): NarrativeThread[] {
    return Array.from(this.threads.values()).filter(t => t.status === 'active')
  }

  /**
   * 获取指定章节需要推进的线程
   */
  getThreadsForChapter(chapter: number): NarrativeThread[] {
    return this.getActiveThreads()
      .filter(t => {
        // 线程在当前章节范围内
        if (chapter < t.startChapter || chapter > t.plannedEndChapter) return false
        // 按间隔计算应该推进的线程
        const chaptersSinceStart = chapter - t.startChapter
        return chaptersSinceStart % this.config.threadInterval === 0
      })
      .sort((a, b) => b.priority - a.priority)
  }

  /**
   * 添加里程碑
   */
  addMilestone(threadId: string, chapter: number, description: string): boolean {
    const thread = this.threads.get(threadId)
    if (!thread) return false

    thread.milestones.push({
      chapter,
      description,
      completed: false,
    })
    return true
  }

  /**
   * 标记里程碑完成
   */
  completeMilestone(threadId: string, chapter: number): boolean {
    const thread = this.threads.get(threadId)
    if (!thread) return false

    const milestone = thread.milestones.find(m => m.chapter === chapter && !m.completed)
    if (!milestone) return false

    milestone.completed = true
    return true
  }

  /**
   * 推进线程到指定章节
   */
  advanceThread(threadId: string, chapter: number): boolean {
    const thread = this.threads.get(threadId)
    if (!thread) return false

    thread.currentChapter = chapter

    // 检查是否到达计划结束章节
    if (chapter >= thread.plannedEndChapter) {
      // 检查所有里程碑是否完成
      const allMilestonesDone = thread.milestones.every(m => m.completed)
      if (allMilestonesDone) {
        thread.status = 'resolved'
      }
    }

    return true
  }

  /**
   * 修改线程状态
   */
  setThreadStatus(threadId: string, status: ThreadStatus): boolean {
    const thread = this.threads.get(threadId)
    if (!thread) return false
    thread.status = status
    return true
  }

  /**
   * 添加线程交叉点
   */
  addIntersection(params: {
    threads: string[]
    chapter: number
    type: 'merge' | 'split' | 'clash' | 'reference'
    description: string
  }): ThreadIntersection {
    const intersection: ThreadIntersection = {
      threads: params.threads,
      chapter: params.chapter,
      type: params.type,
      description: params.description,
    }

    this.intersections.push(intersection)
    return intersection
  }

  /**
   * 获取指定章节的交叉点
   */
  getIntersectionsForChapter(chapter: number): ThreadIntersection[] {
    return this.intersections.filter(i => i.chapter === chapter)
  }

  /**
   * 自动平衡线程优先级
   * 确保长时间未推进的线程获得更高的优先级
   */
  autoBalance(chapter: number): void {
    if (!this.config.autoBalance) return

    for (const thread of this.threads.values()) {
      if (thread.status !== 'active') continue

      const chaptersBehind = chapter - thread.currentChapter
      // 每落后一章增加0.5优先级
      const boost = Math.max(0, chaptersBehind - this.config.threadInterval) * 0.5
      thread.priority = Math.min(10, thread.priority + boost)
    }
  }

  /**
   * 生成章节的线程提示词
   */
  generateChapterThreadPrompt(chapter: number): string {
    const threadsForChapter = this.getThreadsForChapter(chapter)
    const intersections = this.getIntersectionsForChapter(chapter)

    if (threadsForChapter.length === 0 && intersections.length === 0) return ''

    const parts: string[] = []

    if (threadsForChapter.length > 0) {
      parts.push(`【本章需要推进的叙事线程】`)
      for (const thread of threadsForChapter) {
        const pendingMilestones = thread.milestones
          .filter(m => m.chapter <= chapter && !m.completed)
        const milestoneText = pendingMilestones.length > 0
          ? `\n    待完成里程碑: ${pendingMilestones.map(m => m.description).join('、')}`
          : ''

        parts.push(
          `  · ${thread.name}（${thread.type}）` +
          ` - 进度: ${thread.currentChapter}/${thread.plannedEndChapter}章` +
          ` - 优先级: ${thread.priority}/10` +
          milestoneText
        )
      }
    }

    if (intersections.length > 0) {
      parts.push(`\n【本章的线程交叉点】`)
      for (const inter of intersections) {
        const threadNames = inter.threads
          .map(id => this.threads.get(id)?.name || id)
          .join(' × ')
        parts.push(`  · ${threadNames} → ${inter.type}: ${inter.description}`)
      }
    }

    return parts.join('\n')
  }

  /**
   * 获取线程健康度报告
   */
  getHealthReport(): { healthy: boolean; warnings: string[] } {
    const warnings: string[] = []

    // 检查活跃线程数
    const activeCount = this.getActiveThreads().length
    if (activeCount > this.config.maxActiveThreads) {
      warnings.push(`活跃线程数(${activeCount})超过最大限制(${this.config.maxActiveThreads})，建议合并非关键线程`)
    }

    // 检查落后线程
    for (const thread of this.threads.values()) {
      if (thread.status !== 'active') continue
      const behind = thread.plannedEndChapter - thread.currentChapter
      if (behind > thread.plannedEndChapter * 0.3) {
        warnings.push(`线程「${thread.name}」进度落后(${behind}章)，建议加速推进`)
      }
    }

    // 检查未完成里程碑
    for (const thread of this.threads.values()) {
      const pending = thread.milestones.filter(m => !m.completed && m.chapter < thread.currentChapter)
      if (pending.length > 0) {
        warnings.push(`线程「${thread.name}」有${pending.length}个过期未完成的里程碑`)
      }
    }

    // 检查孤立线程（无交叉点）
    const threadedIds = new Set<string>()
    for (const inter of this.intersections) {
      for (const id of inter.threads) {
        threadedIds.add(id)
      }
    }
    for (const thread of this.threads.values()) {
      if (thread.type === 'main_plot' || thread.type === 'world_building') continue
      if (!threadedIds.has(thread.id) && thread.status === 'active') {
        warnings.push(`线程「${thread.name}」没有任何交叉点，可能与其他线脱节`)
      }
    }

    return {
      healthy: warnings.length === 0,
      warnings,
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalThreads: number
    activeThreads: number
    resolvedThreads: number
    totalIntersections: number
    threadTypes: Record<string, number>
  } {
    const totalThreads = this.threads.size
    const activeThreads = this.getActiveThreads().length
    const resolvedThreads = Array.from(this.threads.values()).filter(t => t.status === 'resolved').length
    const totalIntersections = this.intersections.length
    const threadTypes: Record<string, number> = {}

    for (const thread of this.threads.values()) {
      threadTypes[thread.type] = (threadTypes[thread.type] || 0) + 1
    }

    return { totalThreads, activeThreads, resolvedThreads, totalIntersections, threadTypes }
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private generateThreadId(name: string): string {
    const base = name.replace(/[^a-zA-Z\u4e00-\u9fa5]/g, '_')
    const timestamp = Date.now().toString(36)
    return `thread_${base}_${timestamp}`
  }
}