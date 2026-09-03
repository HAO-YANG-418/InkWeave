// ============================================================
// LLM 辅助工具 — 给引擎各模块提供统一的JSON调用能力
// 所有模块通过这个工具调用LLM，返回结构化JSON
// 无LLM时自动降级到规则引擎
// v13.0: 字符串感知JSON提取 + 多候选尝试，处理LLM的各种非标准输出
// ============================================================

import type { LLMProvider } from './types';
import { logWarn } from './logger';
import { DEFAULT_LLM_CONFIG } from './llm-config';

export interface LLMChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * v13.0: 字符串感知的括号配对 — 提取 outermost JSON 块
 * 处理字符串内的 { } 和转义字符，不误判
 */
function extractBraces(text: string, startFrom: number): { json: string; endIdx: number } | null {
  const openChar = text[startFrom];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startFrom; i < text.length; i++) {
    const ch = text[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return { json: text.slice(startFrom, i + 1), endIdx: i };
      }
    }
  }
  return null;
}

/**
 * 从LLM响应中提取JSON字符串
 * v13.0: 字符串感知括号匹配 + 多候选尝试 + 去除前导文本
 * 处理各种markdown噪音、LLM的"解释性前缀"、代码块
 */
function extractJSON(text: string): string | null {
  // 策略1: 提取 ```json ... ``` 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const inner = codeBlockMatch[1].trim();
    // 对代码块内容也做候选提取
    const candidates = findAllCandidates(inner);
    for (const c of candidates) {
      try { JSON.parse(c); return c; } catch { /* 继续 */ }
    }
    // 如果代码块内所有候选都解析失败，返回第一个看起来像JSON的
    if (candidates.length > 0) return candidates[0];
  }

  // 策略2: 去掉markdown标题行
  let cleaned = text.replace(/^#{1,6}\s+.*$/gm, '').trim();

  // 策略3: 找到所有可能的JSON块候选，尝试解析，返回第一个成功的
  const candidates = findAllCandidates(cleaned);
  for (const c of candidates) {
    try { JSON.parse(c); return c; }
    catch { /* 继续 */ }
  }

  // 策略4: 如果都解析失败，返回第一个看起来最像JSON的候选（最长的那个）
  if (candidates.length > 0) {
    return candidates.reduce((a, b) => a.length >= b.length ? a : b);
  }

  return null;
}

/**
 * 找到文本中所有可能的顶层JSON块
 * 策略：扫描每个 { 和 [，提取配对的完整块
 */
function findAllCandidates(text: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{' || text[i] === '[') {
      const result = extractBraces(text, i);
      if (result && !seen.has(result.json)) {
        seen.add(result.json);
        // 只保留"合理大小"的候选（至少20字符，最多50000字符）
        if (result.json.length >= 20 && result.json.length <= 50000) {
          candidates.push(result.json);
        }
        i = result.endIdx; // 跳过已处理的块，避免重复
      }
    }
  }

  // 按长度降序排列（最大的JSON块最有可能是目标）
  return candidates.sort((a, b) => b.length - a.length);
}

/**
 * 调用LLM并解析JSON响应
 * 自动重试2次，失败返回null
 * v12.2: 增强JSON提取，处理markdown标题、混合文本等噪音
 */
export async function llmJson<T>(
  llm: LLMProvider | null | undefined,
  messages: LLMChatMessage[],
  options?: { temperature?: number; maxTokens?: number; timeoutMs?: number }
): Promise<T | null> {
  if (!llm) return null;

  const temperature = options?.temperature ?? DEFAULT_LLM_CONFIG.jsonExtract.temperature;
  const maxTokens = options?.maxTokens ?? DEFAULT_LLM_CONFIG.jsonExtract.maxTokens;
  const retryCount = DEFAULT_LLM_CONFIG.jsonExtract.retryCount;

  for (let attempt = 0; attempt < retryCount; attempt++) {
    try {
      const result = await llm.chat({
        messages,
        temperature,
        maxTokens,
      });

      const text = result.content.trim();
      const jsonStr = extractJSON(text);

      if (!jsonStr) {
        if (attempt < 2) {
          logWarn('LLM', `JSON提取失败（无有效JSON结构），正在重试（第${attempt + 1}次） | 响应前100字: ${text.slice(0, 100).replace(/\n/g, '↵')}`);
          continue;
        }
        logWarn('LLM', `JSON提取失败，响应中无有效JSON结构 | 响应前200字: ${text.slice(0, 200).replace(/\n/g, '↵')}`);
        return null;
      }

      try {
        return JSON.parse(jsonStr) as T;
      } catch (parseErr) {
        if (attempt < 2) {
          logWarn('LLM', `JSON解析失败: ${(parseErr as Error).message.slice(0, 60)}，正在重试（第${attempt + 1}次）`);
          continue;
        }
        logWarn('LLM', `JSON解析失败，已重试2次: ${(parseErr as Error).message.slice(0, 80)}`);
        return null;
      }
    } catch (callErr) {
      if (attempt < 2) {
        logWarn('LLM', `LLM调用失败: ${(callErr as Error).message.slice(0, 60)}，正在重试（第${attempt + 1}次）`);
        continue;
      }
      logWarn('LLM', `LLM调用失败，已重试2次: ${(callErr as Error).message.slice(0, 80)}`);
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
      temperature: options?.temperature ?? DEFAULT_LLM_CONFIG.textGen.temperature,
      maxTokens: options?.maxTokens ?? DEFAULT_LLM_CONFIG.textGen.maxTokens,
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