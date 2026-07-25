// ============================================================
// 意图引擎类型定义 — GWE v6.0 基础智能层
// 让引擎理解"这一章要做什么"，而非仅仅执行指令
// ============================================================

/** 章节叙事意图类型 */
export type IntentType =
  | 'advance_plot'       // 推进剧情主线
  | 'reveal_secret'      // 揭示秘密/真相
  | 'build_relationship' // 建立/深化人物关系
  | 'create_conflict'    // 制造冲突/矛盾
  | 'show_growth'        // 展示角色成长/突破
  | 'build_atmosphere'   // 营造氛围/情绪基调
  | 'plant_foreshadow'   // 埋设伏笔
  | 'resolve_foreshadow' // 回收伏笔
  | 'transition'         // 过渡衔接
  | 'climax'             // 高潮爆发
  | 'emotional_impact'   // 情感冲击
  | 'world_building'     // 世界观展开
  | 'character_intro'    // 角色引入/亮相
  | 'raise_stakes'       // 提升危机/赌注
  | 'breather'           // 节奏缓冲/日常

/** 单个意图的检测结果 */
export interface IntentDetection {
  type: IntentType
  /** 置信度 0-1 */
  confidence: number
  /** 检测依据（为什么判断为这个意图） */
  evidence: string[]
}

/** 意图分析结果 */
export interface IntentResult {
  /** 检测到的意图列表（按置信度降序） */
  intents: IntentDetection[]
  /** 主导意图（置信度最高的） */
  primary: IntentDetection
  /** 辅助意图 */
  secondary: IntentDetection[]
  /** 章节整体情绪基调 */
  emotionalTone: EmotionalTone
  /** 建议的叙事策略 */
  suggestedStrategies: NarrativeStrategy[]
  /** 建议的节奏 */
  suggestedPacing: PacingSuggestion
  /** 分析摘要 */
  summary: string
}

/** 情绪基调 */
export interface EmotionalTone {
  primary: EmotionType
  secondary: EmotionType[]
  intensity: number        // 0-1 情绪强度
  valence: number          // -1到1 正负向
}

export type EmotionType =
  | 'tension'    // 紧张
  | 'hope'       // 希望
  | 'despair'    // 绝望
  | 'curiosity'  // 好奇
  | 'satisfaction' // 满足
  | 'fear'       // 恐惧
  | 'anger'      // 愤怒
  | 'sadness'    // 悲伤
  | 'joy'        // 喜悦
  | 'awe'        // 震撼
  | 'suspense'   // 悬念
  | 'warmth'     // 温暖
  | 'neutral'    // 中性

/** 叙事策略 */
export interface NarrativeStrategy {
  name: string
  description: string
  /** 适用场景 */
  bestFor: IntentType[]
  /** 具体执行建议 */
  tactics: string[]
}

/** 节奏建议 */
export interface PacingSuggestion {
  /** 句子节奏：short/medium/long/mixed */
  sentenceRhythm: 'short' | 'medium' | 'long' | 'mixed'
  /** 段落密度：sparse/medium/dense */
  paragraphDensity: 'sparse' | 'medium' | 'dense'
  /** 信息密度：low/balanced/high */
  infoDensity: 'low' | 'balanced' | 'high'
  /** 对话比例 0-1 */
  dialogueRatio: number
  /** 描写比例 0-1 */
  descriptionRatio: number
  /** 行动比例 0-1 */
  actionRatio: number
  /** 节奏说明 */
  rationale: string
}

/** 意图引擎配置 */
export interface IntentEngineConfig {
  /** 意图检测的最小置信度阈值 */
  minConfidence: number
  /** 最多保留的意图数 */
  maxIntents: number
  /** 是否启用上下文感知（分析前后章节） */
  contextAware: boolean
}

export const DEFAULT_INTENT_CONFIG: IntentEngineConfig = {
  minConfidence: 0.3,
  maxIntents: 5,
  contextAware: true,
}

/** 章节上下文（用于意图分析） */
export interface ChapterContext {
  chapterNumber: number
  title: string
  /** 前一章摘要 */
  previousSummary?: string
  /** 当前章节概要 */
  currentOutline?: string
  /** 当前章节内容（可选，用于精确分析） */
  content?: string
  /** 活跃的伏笔列表 */
  activeForeshadows?: string[]
  /** 当前角色状态 */
  characterStates?: Record<string, string>
  /** 用户指定的意图（如果有） */
  userIntent?: IntentType
}