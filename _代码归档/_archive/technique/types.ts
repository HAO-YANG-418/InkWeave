// ============================================================
// 技法库类型定义 — GWE v6.0 技法多样性层
// ============================================================

/** 技法分类 */
export type TechniqueCategory =
  | 'opening'      // 开头技法
  | 'dialogue'     // 对话技法
  | 'description'  // 描写技法
  | 'suspense'     // 悬念技法
  | 'emotion'      // 情感技法
  | 'transition'   // 转场技法
  | 'climax'       // 高潮技法
  | 'ending'       // 结尾技法
  | 'foreshadow'   // 伏笔技法
  | 'pacing'       // 节奏技法

/** 技法条目 */
export interface Technique {
  id: string
  name: string
  category: TechniqueCategory
  /** 技法描述 */
  description: string
  /** 适用场景 */
  bestFor: string[]
  /** 执行步骤 */
  steps: string[]
  /** 示例 */
  example?: string
  /** 注意事项 */
  cautions: string[]
  /** 难度 1-5 */
  difficulty: number
  /** 冲击力 1-5 */
  impact: number
  /** 标签 */
  tags: string[]
}

/** 技法推荐上下文 */
export interface TechniqueRecommendContext {
  /** 章意图 */
  intent?: string
  /** 内容类型 */
  contentType?: string
  /** 当前章节的情绪基调 */
  emotionalTone?: string
  /** 已使用的技法ID（用于冷却） */
  recentlyUsed?: string[]
  /** 用户风格标签 */
  styleLabels?: string[]
  /** 最大推荐数 */
  maxRecommendations?: number
}

/** 技法推荐结果 */
export interface TechniqueRecommendation {
  technique: Technique
  /** 适用性评分 0-1 */
  score: number
  /** 推荐理由 */
  reason: string
}