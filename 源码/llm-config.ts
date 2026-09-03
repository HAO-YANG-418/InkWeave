// ============================================================
// GWE v13.3 — 集中式 LLM 参数配置
// 所有模块的 LLM 调用参数统一从此处获取默认值
// 各模块可通过 Partial 覆盖特定参数
// ============================================================

/** LLM 调用参数 */
export interface LLMCallParams {
  temperature: number
  maxTokens: number
  timeoutMs: number
}

/** 按用途分类的 LLM 参数预设 */
export interface LLMConfigPresets {
  /** 写作生成（主流程） */
  writing: LLMCallParams
  /** 反思语义评估 */
  reflection: LLMCallParams & { contentTruncation: number; prevContentTruncation: number }
  /** 冷却套路检测 */
  cooling: LLMCallParams
  /** 冷却情节模板检测 */
  coolingTemplate: LLMCallParams
  /** 记忆摘要生成 */
  memorySummary: LLMCallParams
  /** 记忆语义压缩 */
  memoryCompress: LLMCallParams
  /** 创意跃迁 */
  creativeLeap: LLMCallParams
  /** 创意评分 */
  creativeScore: LLMCallParams
  /** 规划生成 */
  planning: LLMCallParams
  /** 规划评估 */
  planningEval: LLMCallParams
  /** 大纲校验 */
  outlineCheck: LLMCallParams
  /** 技法策略 */
  technique: LLMCallParams
  /** 意图分析 */
  intent: LLMCallParams
  /** 通用 JSON 提取 */
  jsonExtract: LLMCallParams & { retryCount: number }
  /** 通用文本生成 */
  textGen: LLMCallParams
}

/**
 * 默认 LLM 配置预设
 * 所有参数集中管理，修改一处即可全局生效
 */
export const DEFAULT_LLM_CONFIG: LLMConfigPresets = {
  writing: {
    temperature: 0.7,
    maxTokens: 16384,
    timeoutMs: 180000,
  },
  reflection: {
    temperature: 0.3,
    maxTokens: 8192,
    timeoutMs: 180000,
    contentTruncation: 3000,
    prevContentTruncation: 300,
  },
  cooling: {
    temperature: 0.2,
    maxTokens: 2048,
    timeoutMs: 15000,
  },
  coolingTemplate: {
    temperature: 0.2,
    maxTokens: 2048,
    timeoutMs: 15000,
  },
  memorySummary: {
    temperature: 0.1,
    maxTokens: 256,
    timeoutMs: 15000,
  },
  memoryCompress: {
    temperature: 0.1,
    maxTokens: 512,
    timeoutMs: 15000,
  },
  creativeLeap: {
    temperature: 0.9,
    maxTokens: 512,
    timeoutMs: 15000,
  },
  creativeScore: {
    temperature: 0.9,
    maxTokens: 1024,
    timeoutMs: 15000,
  },
  planning: {
    temperature: 0.4,
    maxTokens: 4096,
    timeoutMs: 30000,
  },
  planningEval: {
    temperature: 0.2,
    maxTokens: 2048,
    timeoutMs: 15000,
  },
  outlineCheck: {
    temperature: 0.2,
    maxTokens: 2048,
    timeoutMs: 15000,
  },
  technique: {
    temperature: 0.3,
    maxTokens: 1024,
    timeoutMs: 15000,
  },
  intent: {
    temperature: 0.7,
    maxTokens: 4096,
    timeoutMs: 180000,
  },
  jsonExtract: {
    temperature: 0.3,
    maxTokens: 2048,
    timeoutMs: 30000,
    retryCount: 3,
  },
  textGen: {
    temperature: 0.7,
    maxTokens: 2048,
    timeoutMs: 30000,
  },
}

/**
 * 合并用户自定义配置与预设
 */
export function mergeLLMConfig<T extends Record<string, unknown>>(
  preset: T,
  overrides?: Partial<T>,
): T {
  if (!overrides) return preset
  return { ...preset, ...overrides }
}