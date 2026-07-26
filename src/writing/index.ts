// ============================================================
// GWE Writing Module — 统一导出
// ============================================================

// 写作引擎
export { createWritingEngine } from './engine'
export type {
  GWEWritingEngine,
  AntiPatternAnalysisResult,
  AntiPatternStatus,
  ChapterFeedback,
} from './engine'

// 上下文构建器
export {
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
} from './context-builder'
export type { ContextBuildOptions } from './context-builder'

// 学习桥接
export { createLearningBridge } from './learning-bridge'
export type { LearningBridge } from './learning-bridge'

// 写作编排器 (v12.0)
export { WritingOrchestrator } from './orchestrator'
export type {
  WriteChapterRequest,
  WriteChapterResult,
  OrchestratorConfig,
} from './orchestrator'

// 写作智能体 (v12.0)
export { WritingAgent } from './agent'
export type {
  WritingAgentConfig,
  WritingSession,
  SessionChapter,
  AgentWriteResult,
} from './agent'

// 类型
export type {
  WritingContext,
  ChatMessage,
  CapabilityId,
  WritingPreset,
  Chapter,
  Character,
  Setting,
  ChapterEndingState,
  StyleConfig,
  Foreshadow,
  Book,
  Volume,
  Subplot,
  WritingRule,
  CapabilityParams,
} from './types'