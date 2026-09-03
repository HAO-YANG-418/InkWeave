// ============================================================
// 完美规划层 — 统一导出
// ============================================================

export { PlotPlanner } from './plot-planner'
export type { PlotPlannerConfig } from './plot-planner'

export { PacingCurve } from './pacing-curve'
export type { RhythmMetrics, RhythmPattern, PacingConfig } from './pacing-curve'

export { InfoReleaseScheduler } from './info-release-scheduler'
export type { InfoReleaseConfig } from './info-release-scheduler'

export { EmotionalArcPlanner } from './emotional-arc-planner'
export type { ArcType, EmotionalAnchor, ArcConfig, ArcTemplate } from './emotional-arc-planner'

export type {
  PlotNode,
  PlotNodeType,
  PlotChoice,
  PlotOutline,
  VolumeOutline,
  ChapterOutline,
  PlotMilestone,
  PacingTarget,
  InfoReleasePlan,
  ReleaseStage,
  EmotionalArc,
} from './types'