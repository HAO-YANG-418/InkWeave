// ============================================================
// InfoReleaseScheduler 信息释放调度器 — GWE v6.0 完美规划层
// 规划秘密的揭示时机，管理信息释放的节奏和层次
// ============================================================

import type { InfoReleasePlan } from './types'

/** 信息释放配置 */
export interface InfoReleaseConfig {
  /** 暗示→部分揭露的默认间隔（章节数） */
  hintToPartialInterval: number
  /** 部分揭露→完全揭露的默认间隔 */
  partialToFullInterval: number
  /** 过期提醒阈值（章节数） */
  overdueThreshold: number
}

const DEFAULT_CONFIG: InfoReleaseConfig = {
  hintToPartialInterval: 7,
  partialToFullInterval: 16,
  overdueThreshold: 30,
}

// ============================================================
// InfoReleaseScheduler 主类
// ============================================================

export class InfoReleaseScheduler {
  private config: InfoReleaseConfig
  private plans: Map<string, InfoReleasePlan> = new Map()

  constructor(config?: Partial<InfoReleaseConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 安排一个秘密的揭示计划
   */
  scheduleReveal(
    secretId: string,
    secretName: string,
    plantedAtChapter: number,
    options?: {
      hintInterval?: number
      partialInterval?: number
      fullInterval?: number
    },
  ): InfoReleasePlan {
    const hintChapter = plantedAtChapter + (options?.hintInterval || this.config.hintToPartialInterval)
    const partialChapter = hintChapter + (options?.partialInterval || this.config.hintToPartialInterval)
    const fullChapter = partialChapter + (options?.fullInterval || this.config.partialToFullInterval)

    const plan: InfoReleasePlan = {
      secretId,
      secretName,
      plantedAt: plantedAtChapter,
      stages: {
        hint: { chapter: hintChapter, content: '', triggered: false },
        partial: { chapter: partialChapter, content: '', triggered: false },
        full: { chapter: fullChapter, content: '', triggered: false },
      },
      overdue: false,
    }

    this.plans.set(secretId, plan)
    return plan
  }

  /**
   * 获取揭示计划
   */
  getRevealPlan(secretId: string): InfoReleasePlan | undefined {
    return this.plans.get(secretId)
  }

  /**
   * 获取所有揭示计划
   */
  getAllPlans(): InfoReleasePlan[] {
    return [...this.plans.values()]
  }

  /**
   * 标记某个阶段已触发
   */
  triggerStage(secretId: string, stage: 'hint' | 'partial' | 'full', content: string): boolean {
    const plan = this.plans.get(secretId)
    if (!plan) return false

    plan.stages[stage].triggered = true
    plan.stages[stage].content = content
    return true
  }

  /**
   * 检查过期的伏笔
   * 如果某个秘密埋了太久没回收，发出提醒
   */
  checkOverdue(currentChapter: number): InfoReleasePlan[] {
    const overdue: InfoReleasePlan[] = []

    for (const plan of this.plans.values()) {
      const chaptersSincePlanted = currentChapter - plan.plantedAt

      if (chaptersSincePlanted > this.config.overdueThreshold && !plan.stages.full.triggered) {
        plan.overdue = true
        overdue.push(plan)
      }

      // 检查各阶段是否超时
      if (!plan.stages.hint.triggered && currentChapter > plan.stages.hint.chapter + 5) {
        plan.overdue = true
        if (!overdue.includes(plan)) overdue.push(plan)
      }

      if (plan.stages.hint.triggered && !plan.stages.partial.triggered && currentChapter > plan.stages.partial.chapter + 10) {
        plan.overdue = true
        if (!overdue.includes(plan)) overdue.push(plan)
      }
    }

    return overdue
  }

  /**
   * 获取下一章应该揭示的信息
   */
  getRevealsForChapter(chapter: number): InfoReleasePlan[] {
    return [...this.plans.values()].filter(plan => {
      return (
        (plan.stages.hint.chapter === chapter && !plan.stages.hint.triggered) ||
        (plan.stages.partial.chapter === chapter && !plan.stages.partial.triggered) ||
        (plan.stages.full.chapter === chapter && !plan.stages.full.triggered)
      )
    })
  }

  /**
   * 获取当前活跃的伏笔数
   */
  getActiveForeshadowCount(): number {
    return [...this.plans.values()].filter(p => !p.stages.full.triggered).length
  }

  /**
   * 获取信息密度建议
   * 避免单章信息过载
   */
  suggestInfoDensity(chapter: number, maxRevealsPerChapter = 2): {
    revealsThisChapter: InfoReleasePlan[]
    shouldDefer: InfoReleasePlan[]
  } {
    const reveals = this.getRevealsForChapter(chapter)

    if (reveals.length <= maxRevealsPerChapter) {
      return { revealsThisChapter: reveals, shouldDefer: [] }
    }

    // 按阶段优先级排序：full > partial > hint
    const priority = { full: 3, partial: 2, hint: 1 }
    reveals.sort((a, b) => {
      const getStage = (p: InfoReleasePlan) => {
        if (p.stages.full.chapter === chapter && !p.stages.full.triggered) return 'full'
        if (p.stages.partial.chapter === chapter && !p.stages.partial.triggered) return 'partial'
        return 'hint'
      }
      return (priority[getStage(b)] || 0) - (priority[getStage(a)] || 0)
    })

    return {
      revealsThisChapter: reveals.slice(0, maxRevealsPerChapter),
      shouldDefer: reveals.slice(maxRevealsPerChapter),
    }
  }

  /**
   * 生成信息释放报告
   */
  generateReport(currentChapter: number): string {
    const lines: string[] = ['【信息释放报告】']

    const allPlans = this.getAllPlans()
    const active = allPlans.filter(p => !p.stages.full.triggered)
    const resolved = allPlans.filter(p => p.stages.full.triggered)
    const overdue = this.checkOverdue(currentChapter)

    lines.push(`总伏笔：${allPlans.length} | 已回收：${resolved.length} | 活跃：${active.length}`)
    lines.push(`回收率：${allPlans.length > 0 ? (resolved.length / allPlans.length * 100).toFixed(0) : 0}%`)

    if (overdue.length > 0) {
      lines.push(`\n⚠ 过期提醒：${overdue.length}个伏笔待回收`)
      for (const p of overdue.slice(0, 3)) {
        lines.push(`  - "${p.secretName}" 埋于第${p.plantedAt}章（已过${currentChapter - p.plantedAt}章）`)
      }
    }

    const nextReveals = this.getRevealsForChapter(currentChapter + 1)
    if (nextReveals.length > 0) {
      lines.push(`\n下一章建议揭示：${nextReveals.map(p => p.secretName).join('、')}`)
    }

    return lines.join('\n')
  }
}