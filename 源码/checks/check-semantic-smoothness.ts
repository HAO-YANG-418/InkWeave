// ============================================================
// ①-C D-SMOOTH — 语义顺滑层（单章顺滑度 / perplexity 增强检测）
// 来源：v2 执行清单 ①-C；2026-08-24 落地
//
// 职责边界（与 检测工具/semantic-check.ts 正交）：
//   - semantic-check.ts = 跨章长程一致性（OOC / 因果断链 / 伏笔漏洞），CLI 离线验收侧
//   - 本检测器          = 单章内句式顺滑度 / 困惑度，生成时树，挂 reflection async 路径进自纠闭环
//
// 降级安全：无 LLM 配置 → 静默返 []（不阻断生成，与 semantic-check 同定位）
// 挂接点：reflection/engine.ts 的 reflectAsync（async 路径），经既有 hasCheckerError 逻辑逼生成自纠
// 不进入同步 check() / runChecker 链路，对 R3 已复验状态零回归
// ============================================================

import { llmJson, hasLLM } from '../llm-helper';
import type { RuleViolation, Thresholds, LLMProvider } from '../types';

const RULE_ID = 'semantic_smoothness';
const RULE_NAME = '语义顺滑度';
const DEFAULT_MAX_SMOOTHNESS = 3; // 默认上限，对齐方案 B 的 notShiErrorMin 口径
const CONTENT_TRUNCATION = 6000;  // 与 reflection 的 contentTruncation 同量级，避免超长上下文

interface SmoothnessRawViolation {
  quote: string;      // 不顺的原文片段
  issue: string;      // 为什么不顺（拗口 / 句式重复 / 逻辑跳跃…）
  suggestion: string; // 改进建议
}

const SMOOTHNESS_SYSTEM_PROMPT = `你是资深网文编辑，专门挑"读着不顺"的毛病。读者在读网文时追求流畅，以下情况会打断阅读节奏：
1. 句式拗口、绕弯、主语频繁跳转，读两遍才懂
2. 连续多句结构雷同（如反复"XX说""XX想""XX看"），产生重复疲劳
3. 长句堆砌无断点，一口气喘不过来
4. 词语搭配生硬、翻译腔、或 AI 常用空洞衔接（"然而""事实上""值得注意的是"）
5. 段落内部逻辑跳跃，前句和后句接不上

请逐条标出读着不顺的片段。只挑真正影响阅读的，不要吹毛求疵。
【输出格式】只输出纯JSON，以 { 开头，以 } 结尾：
{"violations":[{"quote":"不顺的原文片段","issue":"为什么不顺","suggestion":"怎么改"}]}`;

/**
 * 纯函数：把 LLM 返回的违规按阈值分配 severity（可单测，不依赖 LLM）。
 * 策略：前 maxAllowed 条为 warning（提示不阻断），超出部分报 error（逼生成自纠）。
 * 对齐方案 B 的 notShiErrorMin 口径——"超出上限才硬 ban，未超仅 warning"。
 */
export function assignSmoothnessSeverities(
  violations: Array<{ message: string; suggestion?: string }>,
  maxAllowed: number,
): RuleViolation[] {
  return violations.map((v, i) => ({
    ruleId: RULE_ID,
    ruleName: RULE_NAME,
    message: v.message,
    severity: i < maxAllowed ? 'warning' : 'error',
    suggestion: v.suggestion,
  }));
}

/**
 * 主入口（async）：单章顺滑度 LLM 增强检测。
 * @param text 章节正文
 * @param llm LLM 提供者；null/undefined 时静默降级返 []
 * @param thresholds 可选阈值（读 maxSmoothnessViolations），缺省用 DEFAULT_MAX_SMOOTHNESS
 */
export async function checkSemanticSmoothness(
  text: string,
  llm: LLMProvider | null | undefined,
  thresholds?: Thresholds,
): Promise<RuleViolation[]> {
  // 降级：无 LLM → 静默返空（不阻断生成）
  if (!hasLLM(llm)) return [];
  if (!text || text.trim().length === 0) return [];

  const maxAllowed = thresholds?.maxSmoothnessViolations ?? DEFAULT_MAX_SMOOTHNESS;

  const result = await llmJson<{ violations: SmoothnessRawViolation[] }>(
    llm,
    [
      { role: 'system', content: SMOOTHNESS_SYSTEM_PROMPT },
      { role: 'user', content: `【章节内容】\n${text.slice(0, CONTENT_TRUNCATION)}` },
    ],
    { temperature: 0.2, maxTokens: 1500 },
  );

  if (!result || !result.violations || result.violations.length === 0) return [];

  const raw = result.violations.map(v => ({
    message: `句式不顺：${v.issue}${v.quote ? `（"${v.quote}"）` : ''}`,
    suggestion: v.suggestion,
  }));

  return assignSmoothnessSeverities(raw, maxAllowed);
}
