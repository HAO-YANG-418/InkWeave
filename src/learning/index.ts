// ============================================================
// 反馈学习模块 — 统一导出
// ============================================================

export { FeedbackLoop } from './feedback-loop'
export type {
  FeedbackEvent,
  FeedbackEventType,
  ChangeType,
  LearnedPattern,
  PatternType,
  StyleFingerprint,
  PreferenceProfile,
  FeedbackLoopConfig,
  LearningSuggestion,
} from './types'
export { DEFAULT_FEEDBACK_CONFIG } from './types'

// v6.0 新增：风格学习器
export { StyleLearner } from './style-learner'
export type {
  DeepStyleProfile,
  SentenceRhythmSpectrum,
  ParagraphStructureProfile,
  TransitionProfile,
  RhetoricProfile,
  PersonProfile,
  RhythmPattern,
  StyleLabel,
} from './style-learner'

// v6.0 新增：偏好追踪器
export { PreferenceTracker } from './preference-tracker'
export type {
  PreferenceTrackerConfig,
  PreferenceSnapshot,
  TrendDirection,
  TrendResult,
  TrendAlert,
} from './preference-tracker'
export { DEFAULT_TRACKER_CONFIG } from './preference-tracker'