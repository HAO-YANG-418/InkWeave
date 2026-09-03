// ============================================================
// 规划模块类型定义 — GWE v6.0 完美规划层
// ============================================================

/** 情节节点 */
export interface PlotNode {
  id: string
  /** 事件描述 */
  event: string
  /** 章节编号 */
  chapter: number
  /** 类型 */
  type: PlotNodeType
  /** 选择点（如果是分支节点） */
  choices?: PlotChoice[]
  /** 前置节点 */
  prerequisites: string[]
  /** 后续节点 */
  consequences: string[]
  /** 完成状态 */
  completed: boolean
  /** 重要性 0-1 */
  importance: number
}

export type PlotNodeType =
  | 'setup'       // 铺垫
  | 'turning_point' // 转折
  | 'climax'      // 高潮
  | 'revelation'  // 揭示
  | 'resolution'  // 解决
  | 'breather'    // 缓冲
  | 'hook'        // 钩子

/** 情节选择 */
export interface PlotChoice {
  id: string
  description: string
  consequences: string[]
  probability: number
}

/** 情节大纲 */
export interface PlotOutline {
  bookId: string
  volumes: VolumeOutline[]
  nodes: PlotNode[]
  milestones: PlotMilestone[]
}

/** 卷大纲 */
export interface VolumeOutline {
  volumeNumber: number
  title: string
  chapters: ChapterOutline[]
  arc: string
}

/** 章大纲 */
export interface ChapterOutline {
  chapterNumber: number
  title: string
  summary: string
  intent: string
  keyEvents: string[]
  characters: string[]
  foreshadows: string[]
}

/** 情节里程碑 */
export interface PlotMilestone {
  id: string
  name: string
  chapter: number
  type: 'setup' | 'midpoint' | 'climax' | 'resolution'
  completed: boolean
}

/** 节奏目标曲线 */
export interface PacingTarget {
  chapterNumber: number
  intensity: number
  density: number
  tempo: number
  relief: number
}

/** 信息释放计划 */
export interface InfoReleasePlan {
  secretId: string
  secretName: string
  /** 埋设章节 */
  plantedAt: number
  /** 三阶段释放 */
  stages: {
    hint: ReleaseStage
    partial: ReleaseStage
    full: ReleaseStage
  }
  /** 是否已过期 */
  overdue: boolean
}

export interface ReleaseStage {
  chapter: number
  content: string
  triggered: boolean
}

/** 情感弧线设计 */
export interface EmotionalArc {
  chapterNumber: number
  /** 情感锚点 */
  anchor: string
  /** 目标情感 */
  targetEmotion: string
  /** 情感强度 0-1 */
  intensity: number
  /** 前一个情感 */
  fromEmotion?: string
  /** 情感变化方式 */
  transition: 'gradual' | 'sharp' | 'contrast'
}