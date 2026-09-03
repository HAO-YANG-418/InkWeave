// ============================================================
// 技法模块 — 统一导出
// ============================================================

export { TechniqueLibrary } from './library'
export { NarrativeStrategy } from './narrative-strategy'
export type { StrategyType, StrategyPlan, StrategyContext } from './narrative-strategy'
export { ReaderModel } from './reader-model'
export type {
  ReaderState,
  ReadingSimulation,
  SegmentState,
  DropRiskPoint,
} from './reader-model'
export type {
  Technique,
  TechniqueCategory,
  TechniqueRecommendContext,
  TechniqueRecommendation,
} from './types'