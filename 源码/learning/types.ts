// ============================================================
// 反馈学习模块类型定义 — GWE v6.0 基础智能层
// 让引擎从用户修改中学习，持续进化
// ============================================================

/** 反馈事件类型 */
export type FeedbackEventType =
  | 'edit'           // 用户编辑了内容
  | 'rewrite'        // 用户触发了重写
  | 'accept'         // 用户接受了生成内容（无修改）
  | 'reject'         // 用户拒绝了生成内容
  | 'manual_override' // 用户手动覆盖了某段
  | 'preference'     // 用户表达了偏好（如"太长了"）
  | 'rating'         // 用户给出了评分

/** 单次反馈事件 */
export interface FeedbackEvent {
  id: string
  type: FeedbackEventType
  timestamp: number
  chapterNumber: number
  /** 原始内容（修改前） */
  originalContent?: string
  /** 修改后内容 */
  modifiedContent?: string
  /** 修改位置（段落索引） */
  location?: number
  /** 用户备注/原因 */
  note?: string
  /** 改动类型 */
  changeType?: ChangeType
  /** 元数据 */
  metadata?: Record<string, unknown>
}

/** 改动类型 */
export type ChangeType =
  | 'shorten'        // 缩短
  | 'expand'         // 扩展
  | 'rephrase'       // 改写
  | 'delete'         // 删除
  | 'add'            // 新增
  | 'reorder'        // 调整顺序
  | 'style_change'   // 风格调整
  | 'fix_continuity' // 修复连续性
  | 'fix_character'  // 修复角色一致性
  | 'fix_pacing'     // 修复节奏
  | 'fix_tone'       // 修复语气

/** 学习到的模式 */
export interface LearnedPattern {
  /** 模式ID */
  id: string
  /** 模式类型 */
  type: PatternType
  /** 模式描述 */
  description: string
  /** 置信度 0-1 */
  confidence: number
  /** 支持证据数 */
  evidenceCount: number
  /** 最后更新时间 */
  lastUpdated: number
  /** 具体规则 */
  rules: string[]
}

export type PatternType =
  | 'sentence_length'    // 句子长度偏好
  | 'opening_style'      // 开头风格偏好
  | 'ending_style'       // 结尾风格偏好
  | 'dialogue_style'     // 对话风格偏好
  | 'description_style'  // 描写风格偏好
  | 'pacing_preference'  // 节奏偏好
  | 'emotion_expression' // 情绪表达偏好
  | 'forbidden_pattern'  // 禁止的模式
  | 'preferred_pattern'  // 偏好的模式
  | 'tone_preference'    // 语气偏好

/** 风格指纹 */
export interface StyleFingerprint {
  /** 平均句子长度 */
  avgSentenceLength: number
  /** 句子长度方差 */
  sentenceLengthVariance: number
  /** 对话比例 */
  dialogueRatio: number
  /** 描写比例 */
  descriptionRatio: number
  /** 行动比例 */
  actionRatio: number
  /** 段落平均长度 */
  avgParagraphLength: number
  /** 常用修辞 */
  commonRhetoric: string[]
  /** 禁止模式列表 */
  forbiddenPatterns: string[]
  /** 偏好模式列表 */
  preferredPatterns: string[]
  /** 最后更新时间 */
  lastUpdated: number
  /** 数据来源的样本数 */
  sampleCount: number
}

/** 偏好画像 */
export interface PreferenceProfile {
  /** 风格指纹 */
  fingerprint: StyleFingerprint
  /** 已学习的模式 */
  learnedPatterns: LearnedPattern[]
  /** 偏好强度映射 */
  preferenceStrengths: Record<string, number>
  /** 总反馈事件数 */
  totalEvents: number
  /** 接受率 */
  acceptRate: number
  /** 创建时间 */
  createdAt: number
  /** 最后更新时间 */
  lastUpdated: number
}

/** 反馈学习配置 */
export interface FeedbackLoopConfig {
  /** 最小事件数才触发学习 */
  minEventsForLearning: number
  /** 模式识别的最小置信度 */
  minPatternConfidence: number
  /** 模式识别的最小证据数 */
  minEvidenceCount: number
  /** 是否自动应用学习结果 */
  autoApply: boolean
  /** 最大存储事件数 */
  maxEvents: number
}

export const DEFAULT_FEEDBACK_CONFIG: FeedbackLoopConfig = {
  minEventsForLearning: 5,
  minPatternConfidence: 0.6,
  minEvidenceCount: 3,
  autoApply: true,
  maxEvents: 1000,
}

/** 学习建议 */
export interface LearningSuggestion {
  /** 建议类型 */
  type: 'style' | 'pacing' | 'opening' | 'ending' | 'dialogue' | 'forbidden'
  /** 建议描述 */
  description: string
  /** 置信度 */
  confidence: number
  /** 具体执行建议 */
  action: string
}