// ============================================================
// 记忆模块类型定义 — GWE v6.0 记忆进化层
// ============================================================

/** 记忆条目类型 */
export type MemoryType =
  | 'character_pattern'   // 角色模式
  | 'plot_pattern'       // 情节模式
  | 'dialogue_pattern'   // 对话模式
  | 'foreshadow_pattern' // 伏笔模式
  | 'scene_pattern'      // 场景模式
  | 'user_preference'    // 用户偏好
  | 'style_technique'    // 风格技法
  | 'world_rule'         // 世界观规则
  | 'emotional_beat'     // 情感节拍

/** 记忆条目 */
export interface MemoryEntry {
  id: string
  type: MemoryType
  /** 记忆内容摘要 */
  content: string
  /** 完整上下文 */
  fullContext?: string
  /** 嵌入向量（用于语义搜索） */
  embedding?: number[]
  /** 重要性评分 0-1 */
  importance: number
  /** 访问次数 */
  accessCount: number
  /** 创建时间 */
  createdAt: number
  /** 最后访问时间 */
  lastAccessedAt: number
  /** 来源书ID */
  sourceBookId?: string
  /** 来源章节 */
  sourceChapter?: number
  /** 标签 */
  tags: string[]
}

/** 记忆搜索结果 */
export interface MemorySearchResult {
  entry: MemoryEntry
  /** 相似度 0-1 */
  similarity: number
}

/** 记忆配置 */
export interface LongTermMemoryConfig {
  /** 最大记忆条目数 */
  maxEntries: number
  /** 遗忘阈值（重要性低于此值的条目可能被清理） */
  forgetThreshold: number
  /** 记忆巩固间隔（毫秒） */
  consolidateInterval: number
  /** 默认搜索返回数 */
  defaultTopK: number
}

export const DEFAULT_MEMORY_CONFIG: LongTermMemoryConfig = {
  maxEntries: 10000,
  forgetThreshold: 0.1,
  consolidateInterval: 3600000, // 1小时
  defaultTopK: 10,
}

/** 记忆统计 */
export interface MemoryStats {
  totalEntries: number
  byType: Record<MemoryType, number>
  avgImportance: number
  totalAccesses: number
  oldestEntry: number
  newestEntry: number
}