// ============================================================
// 超人类层类型定义 — GWE v6.0 超人类层
// ============================================================

// ============================================================
// 多版本生成器
// ============================================================

/** 版本策略 */
export type VersionStrategy =
  | 'conservative'  // 保守型：稳健、安全、不出错
  | 'bold'          // 大胆型：冒险、突破、高冲击力
  | 'emotional'     // 情感型：注重情感渲染和共鸣
  | 'action'        // 动作型：快节奏、高密度战斗
  | 'literary'      // 文学型：重视文笔和修辞
  | 'experimental'  // 实验型：尝试新手法和结构

/** 版本生成请求 */
export interface VersionRequest {
  /** 章节内容或大纲 */
  content: string
  /** 目标策略 */
  strategy: VersionStrategy
  /** 章节上下文 */
  context: string
  /** 约束条件 */
  constraints?: string[]
}

/** 生成版本 */
export interface GeneratedVersion {
  id: string
  /** 策略 */
  strategy: VersionStrategy
  /** 生成的内容 */
  content: string
  /** 质量评分 */
  qualityScore: number
  /** 与原始内容的差异度 */
  divergence: number
  /** 是否符合策略 */
  strategyAlignment: number
  /** 生成时间 */
  generatedAt: number
}

/** 版本比较结果 */
export interface VersionComparison {
  versions: GeneratedVersion[]
  /** 推荐版本 */
  recommended: string
  /** 各维度对比 */
  dimensions: Record<string, Record<string, number>>
  /** 分析说明 */
  analysis: string
}

/** 多版本生成器配置 */
export interface MultiVersionConfig {
  /** 默认生成版本数 */
  defaultCount: number
  /** 质量门槛 */
  qualityGate: number
  /** 是否自动选择最佳版本 */
  autoSelect: boolean
}

export const DEFAULT_MULTI_VERSION_CONFIG: MultiVersionConfig = {
  defaultCount: 3,
  qualityGate: 0.6,
  autoSelect: false,
}

// ============================================================
// 质量预测器
// ============================================================

/** 质量预测维度 */
export type QualityPredictionDimension =
  | 'readability'     // 可读性
  | 'engagement'      // 吸引力
  | 'retention'       // 留存率
  | 'emotional_peak'  // 情感峰值
  | 'pacing_score'    // 节奏评分
  | 'character_appeal' // 角色魅力
  | 'plot_coherence'  // 情节连贯性
  | 'prose_elegance'  // 文笔优雅度

/** 质量预测输入 */
export interface QualityPredictionInput {
  /** 章节内容 */
  content: string
  /** 章节编号 */
  chapterNumber: number
  /** 目标读者画像 */
  targetAudience?: string
  /** 前序章节质量趋势 */
  previousScores?: number[]
}

/** 质量预测结果 */
export interface QualityPrediction {
  /** 各维度预测 */
  dimensions: Record<QualityPredictionDimension, number>
  /** 综合预测分 */
  overallScore: number
  /** 置信度 */
  confidence: number
  /** 风险预警 */
  risks: QualityRisk[]
  /** 改进建议 */
  suggestions: string[]
}

/** 质量风险 */
export interface QualityRisk {
  dimension: QualityPredictionDimension
  severity: number
  description: string
  mitigation: string
}

/** 质量预测器配置 */
export interface QualityPredictorConfig {
  /** 预警阈值 */
  riskThreshold: number
  /** 历史趋势权重 */
  trendWeight: number
  /** 是否启用章节间对比 */
  enableComparison: boolean
}

export const DEFAULT_QUALITY_PREDICTOR_CONFIG: QualityPredictorConfig = {
  riskThreshold: 0.4,
  trendWeight: 0.3,
  enableComparison: true,
}

// ============================================================
// 写作分析器
// ============================================================

/** 写作分析维度 */
export type AnalyticsDimension =
  | 'vocabulary_diversity'  // 词汇多样性
  | 'sentence_complexity'   // 句子复杂度
  | 'paragraph_rhythm'      // 段落节奏
  | 'dialogue_ratio'        // 对话占比
  | 'description_ratio'     // 描写占比
  | 'action_ratio'          // 动作占比
  | 'emotion_frequency'     // 情感词频
  | 'sensory_distribution'  // 感官分布
  | 'technique_usage'       // 技法使用
  | 'pacing_curve'          // 节奏曲线

/** 写作分析请求 */
export interface AnalyticsRequest {
  /** 章节内容 */
  content: string
  /** 章节编号 */
  chapterNumber: number
  /** 全书统计（用于对比） */
  bookStats?: BookStatistics
}

/** 全书统计 */
export interface BookStatistics {
  totalChapters: number
  totalWords: number
  avgWordsPerChapter: number
  dimensionAverages: Record<AnalyticsDimension, number>
  growthTrends: Record<AnalyticsDimension, number[]>
}

/** 章节分析结果 */
export interface ChapterAnalytics {
  chapterNumber: number
  /** 各维度值 */
  dimensions: Record<AnalyticsDimension, number>
  /** 与全书均值的偏差 */
  deviation: Record<AnalyticsDimension, number>
  /** 显著特征 */
  highlights: string[]
  /** 弱点 */
  weaknesses: string[]
  /** 与前一章的变化 */
  changes: Record<AnalyticsDimension, number>
}

/** 全书分析报告 */
export interface BookAnalyticsReport {
  bookId: string
  /** 章数 */
  chapterCount: number
  /** 总字数 */
  totalWords: number
  /** 均值 */
  averages: Record<AnalyticsDimension, number>
  /** 趋势 */
  trends: Record<AnalyticsDimension, 'rising' | 'falling' | 'stable'>
  /** 异常章节 */
  anomalies: { chapter: number; dimension: AnalyticsDimension; value: number; expected: number }[]
  /** 发展建议 */
  recommendations: string[]
}

/** 写作分析器配置 */
export interface WritingAnalyticsConfig {
  /** 是否启用趋势分析 */
  enableTrends: boolean
  /** 异常检测敏感度 */
  anomalySensitivity: number
  /** 是否自动生成报告 */
  autoReport: boolean
}

export const DEFAULT_WRITING_ANALYTICS_CONFIG: WritingAnalyticsConfig = {
  enableTrends: true,
  anomalySensitivity: 2.0,
  autoReport: false,
}