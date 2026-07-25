// ============================================================
// LLM 辅助工具 — 给引擎各模块提供统一的JSON调用能力
// 所有模块通过这个工具调用LLM，返回结构化JSON
// 无LLM时自动降级到规则引擎
// ============================================================

import type { LLMProvider } from './types';
import { logWarn } from './logger';

export interface LLMChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 调用LLM并解析JSON响应
 * 自动重试1次，失败返回null
 */
export async function llmJson<T>(
  llm: LLMProvider | null | undefined,
  messages: LLMChatMessage[],
  options?: { temperature?: number; maxTokens?: number; timeoutMs?: number }
): Promise<T | null> {
  if (!llm) return null;

  const temperature = options?.temperature ?? 0.3;
  const maxTokens = options?.maxTokens ?? 2048;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await llm.chat({
        messages,
        temperature,
        maxTokens,
      });

      const text = result.content.trim();
      // 尝试提取JSON（处理markdown代码块包裹的情况）
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : text;

      return JSON.parse(jsonStr) as T;
    } catch {
      // 重试一次
      if (attempt === 0) {
        logWarn('LLM', `JSON解析失败，正在重试（第${attempt + 1}次）`);
        continue;
      }
      logWarn('LLM', 'JSON解析失败，已重试，返回null');
      return null;
    }
  }

  return null;
}

/**
 * 调用LLM返回纯文本
 */
export async function llmText(
  llm: LLMProvider | null | undefined,
  messages: LLMChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<string | null> {
  if (!llm) return null;

  try {
    const result = await llm.chat({
      messages,
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens ?? 2048,
    });
    return result.content.trim();
  } catch {
    logWarn('LLM', '纯文本调用失败，返回null');
    return null;
  }
}

/**
 * 判断LLM是否可用
 */
export function hasLLM(llm: LLMProvider | null | undefined): boolean {
  return llm != null && llm.name !== 'mock';
}