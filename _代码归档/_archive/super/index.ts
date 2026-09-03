// ============================================================
// 超人类层 — 统一导出
// ============================================================

export { MultiVersionGenerator } from './multi-version-generator'

export { QualityPredictor } from './quality-predictor'

export { WritingAnalytics } from './writing-analytics'

export type {
  VersionStrategy,
  VersionRequest,
  GeneratedVersion,
  VersionComparison,
  MultiVersionConfig,
  QualityPredictionDimension,
  QualityPredictionInput,
  QualityPrediction,
  QualityRisk,
  QualityPredictorConfig,
  AnalyticsDimension,
  AnalyticsRequest,
  ChapterAnalytics,
  BookAnalyticsReport,
  BookStatistics,
  WritingAnalyticsConfig,
} from './types'

export {
  DEFAULT_MULTI_VERSION_CONFIG,
  DEFAULT_QUALITY_PREDICTOR_CONFIG,
  DEFAULT_WRITING_ANALYTICS_CONFIG,
} from './types'