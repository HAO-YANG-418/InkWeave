// ============================================================
// GWE v13.0 - LLM 配置模块
// 从 .env 读取 API Key，自动检测并创建 LLM Provider
// ============================================================

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  OpenAICompatibleProvider,
  MockProvider,
  type OpenAICompatibleConfig,
} from './llm-provider'
import type { LLMProvider } from './types'
import { DEFAULT_LLM_CONFIG } from './llm-config'

// ============================================================
// .env 解析（不依赖 dotenv 包，直接解析）
// ============================================================

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {}

  // 尝试从项目根目录加载 .env
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)
  const envPath = resolve(__dirname, '..', '.env')

  try {
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      // 跳过空行和注释
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let value = trimmed.slice(eqIdx + 1).trim()
      // 去掉引号
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      env[key] = value
    }
  } catch {
    // .env 文件不存在，使用空配置
  }

  return env
}

// 加载一次，缓存结果
let _env: Record<string, string> | null = null
function getEnv(): Record<string, string> {
  if (!_env) {
    const fromFile = loadEnv()
    // process.env 的值可能是 undefined，需要过滤
    const fromProcess: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) fromProcess[key] = value
    }
    _env = { ...fromFile, ...fromProcess }
  }
  return _env
}

// ============================================================
// LLM Provider 配置
// ============================================================

export interface LLMConfig {
  provider: 'deepseek' | 'openai' | 'ark' | 'custom' | 'mock'
  apiKey: string
  baseURL: string
  model: string
  temperature: number
  maxTokens: number
  timeoutMs: number
}

const PROVIDER_CONFIGS: Record<string, Omit<LLMConfig, 'apiKey' | 'provider'>> = {
  DEEPSEEK: {
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    temperature: DEFAULT_LLM_CONFIG.writing.temperature,
    maxTokens: DEFAULT_LLM_CONFIG.writing.maxTokens,
    timeoutMs: DEFAULT_LLM_CONFIG.writing.timeoutMs,
  },
  ARK: {
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-1-5-pro-32k-250115',
    temperature: DEFAULT_LLM_CONFIG.writing.temperature,
    maxTokens: DEFAULT_LLM_CONFIG.writing.maxTokens,
    timeoutMs: DEFAULT_LLM_CONFIG.writing.timeoutMs,
  },
  OPENAI: {
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    temperature: DEFAULT_LLM_CONFIG.writing.temperature,
    maxTokens: DEFAULT_LLM_CONFIG.writing.maxTokens,
    timeoutMs: DEFAULT_LLM_CONFIG.writing.timeoutMs,
  },
}

/**
 * 自动检测 .env 中的配置，创建对应的 LLM Provider
 * 检测顺序: DEEPSEEK > ARK > OPENAI > CUSTOM > Mock
 */
export function createLLMProvider(): LLMProvider {
  const env = getEnv()

  // 检测 DeepSeek
  if (env.DEEPSEEK_API_KEY) {
    const cfg = PROVIDER_CONFIGS.DEEPSEEK
    return new OpenAICompatibleProvider({
      apiKey: env.DEEPSEEK_API_KEY,
      baseURL: env.DEEPSEEK_BASE_URL || cfg.baseURL,
      model: env.DEEPSEEK_MODEL || cfg.model,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      timeoutMs: cfg.timeoutMs,
    })
  }

  // 检测 Ark（豆包）
  if (env.ARK_API_KEY) {
    const cfg = PROVIDER_CONFIGS.ARK
    return new OpenAICompatibleProvider({
      apiKey: env.ARK_API_KEY,
      baseURL: env.ARK_BASE_URL || cfg.baseURL,
      model: env.ARK_MODEL || cfg.model,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      timeoutMs: cfg.timeoutMs,
    })
  }

  // 检测 OpenAI
  if (env.OPENAI_API_KEY) {
    const cfg = PROVIDER_CONFIGS.OPENAI
    return new OpenAICompatibleProvider({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL || cfg.baseURL,
      model: env.OPENAI_MODEL || cfg.model,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      timeoutMs: cfg.timeoutMs,
    })
  }

  // 检测自定义
  if (env.CUSTOM_API_KEY && env.CUSTOM_BASE_URL && env.CUSTOM_MODEL) {
    return new OpenAICompatibleProvider({
      apiKey: env.CUSTOM_API_KEY,
      baseURL: env.CUSTOM_BASE_URL,
      model: env.CUSTOM_MODEL,
      temperature: 0.7,
      maxTokens: 4096,
      timeoutMs: 180000,
    })
  }

  // 无 API Key，使用 Mock
  return new MockProvider()
}

/**
 * 获取当前 LLM 配置信息（用于显示）
 */
export function getLLMConfig(): LLMConfig {
  const env = getEnv()

  if (env.DEEPSEEK_API_KEY) {
    const cfg = PROVIDER_CONFIGS.DEEPSEEK
    return {
      provider: 'deepseek',
      apiKey: env.DEEPSEEK_API_KEY.slice(0, 8) + '...',
      baseURL: env.DEEPSEEK_BASE_URL || cfg.baseURL,
      model: env.DEEPSEEK_MODEL || cfg.model,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      timeoutMs: cfg.timeoutMs,
    }
  }

  if (env.ARK_API_KEY) {
    const cfg = PROVIDER_CONFIGS.ARK
    return {
      provider: 'ark',
      apiKey: env.ARK_API_KEY.slice(0, 8) + '...',
      baseURL: env.ARK_BASE_URL || cfg.baseURL,
      model: env.ARK_MODEL || cfg.model,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      timeoutMs: cfg.timeoutMs,
    }
  }

  if (env.OPENAI_API_KEY) {
    const cfg = PROVIDER_CONFIGS.OPENAI
    return {
      provider: 'openai',
      apiKey: env.OPENAI_API_KEY.slice(0, 8) + '...',
      baseURL: env.OPENAI_BASE_URL || cfg.baseURL,
      model: env.OPENAI_MODEL || cfg.model,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      timeoutMs: cfg.timeoutMs,
    }
  }

  return {
    provider: 'mock',
    apiKey: '',
    baseURL: '',
    model: 'mock',
    temperature: 0.7,
    maxTokens: 4096,
    timeoutMs: 180000,
  }
}