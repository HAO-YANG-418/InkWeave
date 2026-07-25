// ============================================================
// 创意跳跃模块类型定义 — GWE v6.0 创意跳跃层
// ============================================================

/** 创意跳跃类型 */
export type LeapType =
  | 'metaphor'       // 隐喻
  | 'analogy'        // 类比
  | 'twist'          // 反转
  | 'synesthesia'     // 通感
  | 'juxtaposition'  // 并置
  | 'abstraction'    // 抽象化
  | 'concretization' // 具象化
  | 'defamiliarization' // 陌生化

/** 创意跳跃请求 */
export interface LeapRequest {
  /** 跳跃类型 */
  type: LeapType
  /** 源概念 */
  source: string
  /** 目标域 */
  targetDomain: string
  /** 上下文 */
  context: string
  /** 约束条件 */
  constraints?: string[]
}

/** 创意跳跃结果 */
export interface LeapResult {
  /** 生成的创意跳跃 */
  leap: string
  /** 跳跃类型 */
  type: LeapType
  /** 新颖度评分 0-1 */
  novelty: number
  /** 合理性评分 0-1 */
  plausibility: number
  /** 冲击力评分 0-1 */
  impact: number
  /** 解释 */
  explanation: string
}

/** 创意跳跃引擎配置 */
export interface CreativeLeapConfig {
  /** 最小新颖度门槛 */
  minNovelty: number
  /** 最小合理性门槛 */
  minPlausibility: number
  /** 最大跳跃次数 */
  maxAttempts: number
  /** 启用的跳跃类型 */
  enabledTypes: LeapType[]
}

export const DEFAULT_CREATIVE_LEAP_CONFIG: CreativeLeapConfig = {
  minNovelty: 0.4,
  minPlausibility: 0.5,
  maxAttempts: 5,
  enabledTypes: ['metaphor', 'analogy', 'twist', 'synesthesia', 'juxtaposition', 'abstraction', 'concretization', 'defamiliarization'],
}

// ============================================================
// 知识图谱
// ============================================================

/** 知识节点 */
export interface KnowledgeNode {
  id: string
  /** 名称 */
  name: string
  /** 类型 */
  type: KnowledgeNodeType
  /** 属性 */
  attributes: Record<string, string>
  /** 关联节点 */
  connections: string[]
  /** 创建时间 */
  createdAt: number
  /** 最后访问时间 */
  lastAccessedAt: number
  /** 访问频次 */
  accessCount: number
}

export type KnowledgeNodeType =
  | 'character'
  | 'location'
  | 'event'
  | 'item'
  | 'concept'
  | 'relationship'
  | 'faction'
  | 'rule'

/** 知识图谱配置 */
export interface KnowledgeGraphConfig {
  /** 最大节点数 */
  maxNodes: number
  /** 是否启用自动清理 */
  autoPrune: boolean
  /** 最小访问频次（低于此值可被清理） */
  minAccessCount: number
}

// ============================================================
// 多线程协调器
// ============================================================

/** 叙事线程 */
export interface NarrativeThread {
  id: string
  /** 线程名称 */
  name: string
  /** 线程类型 */
  type: ThreadType
  /** 涉及角色 */
  characters: string[]
  /** 起始章节 */
  startChapter: number
  /** 当前章节 */
  currentChapter: number
  /** 计划结束章节 */
  plannedEndChapter: number
  /** 状态 */
  status: ThreadStatus
  /** 优先级 */
  priority: number
  /** 描述 */
  description: string
  /** 里程碑 */
  milestones: ThreadMilestone[]
}

export type ThreadType =
  | 'main_plot'
  | 'subplot'
  | 'character_arc'
  | 'romance'
  | 'mystery'
  | 'conflict'
  | 'world_building'

export type ThreadStatus = 'active' | 'dormant' | 'resolved' | 'abandoned'

/** 线程里程碑 */
export interface ThreadMilestone {
  chapter: number
  description: string
  completed: boolean
}

/** 线程交叉点 */
export interface ThreadIntersection {
  /** 涉及的线程 */
  threads: string[]
  /** 交叉章节 */
  chapter: number
  /** 交叉类型 */
  type: 'merge' | 'split' | 'clash' | 'reference'
  /** 描述 */
  description: string
}

/** 多线程协调器配置 */
export interface MultiThreadConfig {
  /** 最大活跃线程数 */
  maxActiveThreads: number
  /** 线程间隔（章节数） */
  threadInterval: number
  /** 是否自动平衡优先级 */
  autoBalance: boolean
}