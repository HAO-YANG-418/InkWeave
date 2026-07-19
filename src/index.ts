// ============================================================
// GWE (Generic Web-novel Engine) 通用网文引擎 - 统一出口
// ============================================================

// 核心类型
export type {
  NodeCategory,
  NodeDefinition,
  NodeId,
  OptionId,
  NodeOptionKB,
  Thresholds,
  RadarWeights,
  Preset,
  CustomRule,
  EngineConfig,
  UserOverrides,
  WritingContext,
  BookMeta,
  Character as GWECharacter,
  CharacterRelationship,
  Setting as GWESetting,
  Volume as GWEVolume,
  Chapter as GWEChapter,
  Subplot as GWESubplot,
  TextSelection,
  CheckResult,
  RadarScores,
  RuleViolation,
  TextStats,
  ChatRole,
  ChatMessage,
  LLMRequest,
  LLMUsage,
  StreamCallbacks,
  LLMProvider,
  EngineEventType,
  EngineEvent,
  EngineEventListener,
  ValidationResult,
  ConflictInfo,
  DependencyInfo,
  MergedConfig,
  MergedVocabulary,
} from './types';

export {
  DEFAULT_THRESHOLDS,
  DEFAULT_RADAR_WEIGHTS,
} from './types';

// 引擎主类
export { GWEEngine } from './gwe-engine';
export type { TaskType, NodeCatalog } from './gwe-engine';

// LLM Provider
export {
  OpenAICompatibleProvider,
  MockProvider,
  PRESET_PROVIDERS,
  createProvider,
} from './llm-provider';
export type { OpenAICompatibleConfig, PresetProvider } from './llm-provider';

// KB加载器（浏览器版）
export { loadKBFromJSON, loadAllKB, createEngineWithKB } from './kb-loader';
export type { LoadResult } from './kb-loader';

// 检测功能
export { check } from './checker';
export { detectAnchors, calculateAnchorDensity, calculateMaxAnchorGap } from './anchor-detector';
export type { AnchorDetectionResult } from './anchor-detector';
export { detectFillers, calculateFillerDensity } from './filler-words';
export type { FillerDetectionResult } from './filler-words';
export { calculateRadar, calculateScore, calculateWeightedScore, countSensoryMentions } from './radar';
export type { RadarInput } from './radar';

// 验证
export { validate, formatValidationResult, canSelectOption } from './validator';

// 配置合并
export { mergeConfig, cloneMergedConfig } from './config-merger';
export type { MergeOptions } from './config-merger';

// 提示词构建
export { buildSystemPrompt, buildUserMessage } from './prompt-builder';
export type { WriteTask, BuildPromptOptions, BuildUserMessageOptions } from './prompt-builder';

// 节点注册表
export * from './node-registry';
