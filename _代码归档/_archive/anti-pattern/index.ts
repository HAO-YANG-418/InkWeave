// ============================================================
// 反模式引擎统一导出 — v10.0
// 章类型追踪 + 冲突多样性检测 + 模板组合器
// ============================================================

// 章类型追踪器
export { ChapterTypeTracker } from './chapter-type-tracker';
export type {
  ChapterTypeRecord,
  ChapterTypeTrackResult,
  ChapterTypeWarning,
} from './chapter-type-tracker';

// 冲突多样性检测器
export { ConflictDiversityCheck } from './conflict-diversity-check';
export type {
  ConflictRecord,
  ConflictDiversityResult,
  ConflictWarning,
} from './conflict-diversity-check';

// 模板组合器
export { TemplateComposer } from './template-composer';
export type {
  TemplateComposerResult,
  ComboRecommendation,
} from './template-composer';

// 知识库
export {
  CHAPTER_TYPES,
  DEFAULT_CHAPTER_TYPE_CONFIG,
  getChapterTypeDef,
  getChapterTypeName,
  getRecommendedNext,
  getMinInterval,
  generateChapterTypePrompt,
} from './knowledge/chapter-types';
export type { ChapterFunctionType, ChapterTypeDef } from './knowledge/chapter-types';

export {
  CONFLICT_TYPES,
  DEFAULT_CONFLICT_CONFIG,
  getConflictTypeDef,
  getConflictTypeName,
  getResolutionName,
  generateConflictAnalysisPrompt,
} from './knowledge/conflict-types';
export type { ConflictType, ConflictResolution, ConflictTypeDef } from './knowledge/conflict-types';

export {
  TEMPLATE_COMBOS,
  getComboById,
  getComboName,
  generateDynamicComboPrompt,
} from './knowledge/template-combos';
export type { TemplateCombo } from './knowledge/template-combos';
