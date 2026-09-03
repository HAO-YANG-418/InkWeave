// ============================================================
// 冷却模块 — 统一导出
// ============================================================

export { CoolingSystem, MemoryCoolingStorage } from './cooling-system';
export type { CoolingStorage, CoolingRecord, CoolingConfig } from './cooling-system';

export { fillParams, renderTemplate, cleanupPlaceholders } from './param-filler';

export { ConstraintStack } from './constraint-stack';
export type {
  RealmConstraints,
  RealmConstraint,
  AttributeConstraints,
  VolumeConstraints,
  VolumeQuotaConfig,
  QualityConstraints,
  ConstraintStackConfig,
} from './constraint-stack';

export type {
  GeneratedElement,
  ConstraintWritingContext,
  ConstraintValidationResult,
  LayerCheckDetail,
  ConstraintCheckResult,
  ViolationDetail,
  AbilityTemplate,
  OpponentTemplate,
} from './types';

// === 生成器 ===
export {
  CharacterGenerator,
  ConflictGenerator,
  DialogueGenerator,
  SceneGenerator,
} from './generators';
export type {
  VocabProvider,
  VocabData,
  NamingRules,
  DialogueTurn,
} from './generators';

// === 创意发散 ===
export { CreativeDivergeManager } from './creative-diverge';
export type { DivergeResult } from './creative-diverge';

// === 持久化 ===
export { LocalStorageCoolingStorage } from './local-storage-storage';