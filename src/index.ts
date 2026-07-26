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

// LLM 配置（自动检测 .env）
export { createLLMProvider, getLLMConfig } from './config';
export type { LLMConfig } from './config';

// KB加载器（浏览器版）
export { loadKBFromJSON, loadAllKB, createEngineWithKB } from './kb-loader';
export type { LoadResult } from './kb-loader';

// 检测功能
export { check, initCheckerRegistry } from './checker';
export { detectAnchors, calculateAnchorDensity, calculateMaxAnchorGap } from './anchor-detector';
export type { AnchorDetectionResult } from './anchor-detector';
export { detectFillers, calculateFillerDensity } from './filler-words';
export type { FillerDetectionResult } from './filler-words';
export { calculateRadar, calculateScore, calculateWeightedScore, countSensoryMentions } from './radar';
export type { RadarInput } from './radar';

// V3.2 检测模块化
export {
  registerCheck,
  registerChecks,
  runAllChecks,
  getRegisteredChecks,
  getCheckCount,
  getCheckStats,
  computeTextStats,
  applyViolationPenalty,
  groupViolations,
  getViolationSummary,
} from './checks';

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

// 全书上下文与跨章检测
export { BookContext, detectOpeningPattern, detectEndingPattern, extractSettingRules, extractForeshadowing } from './book-context';
export type { ChapterSnapshot, OpeningPattern, EndingPattern, CharacterState, SettingRule, Foreshadow, BookIssue } from './book-context';
export { checkBook, checkChapterFiles, splitChapters, extractChapterSnapshot } from './book-checker';
export type { BookCheckResult } from './book-checker';

// v12.0: 写作模块（WritingOrchestrator + WritingAgent + GWEWritingEngine）
export {
  WritingOrchestrator,
  WritingAgent,
  createWritingEngine,
  buildWritingMessages,
  createEmptyContext,
  updateContextAfterChapter,
  getCurrentChapter,
  getPreviousChapter,
  getRecentChapters,
  getActiveForeshadows,
  getRelevantCharacters,
  getRelevantSettings,
  getPrefixContext,
  createLearningBridge,
} from './writing';
export type {
  WriteChapterRequest,
  WriteChapterResult,
  OrchestratorConfig,
  WritingAgentConfig,
  WritingSession,
  SessionChapter,
  AgentWriteResult,
  GWEWritingEngine,
  AntiPatternAnalysisResult,
  AntiPatternStatus,
  ChapterFeedback,
  ContextBuildOptions,
  LearningBridge,
  WritingContext as WritingModuleContext,
  ChatMessage as WritingChatMessage,
  CapabilityId,
  WritingPreset,
  Chapter as WritingChapter,
  Character as WritingCharacter,
  Setting as WritingSetting,
  ChapterEndingState,
  Foreshadow as WritingForeshadow,
  StyleConfig as WritingStyleConfig,
  WritingRule,
} from './writing';