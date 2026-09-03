/**
 * InkWeave 语义级长程一致性校验模块 v5.1（P1.5）
 *
 * 在 P1「规则级事实指纹」之上，补一层「语义记忆」：
 *   - 抓规则级抓不到的问题：角色性格/立场/能力漂移（OOC）、设定逻辑矛盾、
 *     因果断链（上章已发生事件被本章推翻/忽略）、伏笔逻辑漏洞。
 *   - 依赖可插拔的 OpenAI 兼容 LLM（chat/completions）。没配置则静默降级，
 *     返回空数组，绝不阻塞质量门禁（这是增强层，不是规则层）。
 *
 * 设计原则：
 *   - 可插拔：baseURL/model/apiKey 来自 .inkweave.llm.json 或环境变量。
 *   - 降级安全：未配置 / 网络超时 / 解析失败 → 一律返回 []，不抛异常、不阻断。
 *   - 确定性兜底：模型输出必须是 JSON，解析失败（不是语义问题）也安全降级。
 *   - 成本可控：设定/上章/本章均截断，避免长文爆 token。
 *   - 全部 warning 级：语义误判宁可放过，绝不废章。
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ChapterFact } from './extract-entities.js';
import type { Violation } from './checkers.js';

// ============================================================
// 配置：可插拔 LLM（OpenAI 兼容）
// ============================================================
export interface LlmConfig {
  enabled: boolean;
  baseURL: string;
  model: string;
  apiKey: string;
  provider: 'openai-compatible' | 'custom';
}

const CONFIG_FILENAMES = ['.inkweave.llm.json', '.env.inkweave.json'];

/**
 * 解析 LLM 配置。优先级：环境变量 > 项目根 .inkweave.llm.json > 禁用。
 * 任何读取/解析失败都返回 enabled=false（安全降级）。
 */
export function loadLlmConfig(cwd?: string): LlmConfig {
  const base = cwd || process.cwd();
  // 1) 环境变量（最高优先）
  const envKey = process.env.INKWEAVE_LLM_KEY;
  const envBase = process.env.INKWEAVE_LLM_BASE_URL;
  const envModel = process.env.INKWEAVE_LLM_MODEL;
  if (envKey && envBase) {
    return {
      enabled: true,
      baseURL: envBase.replace(/\/$/, ''),
      model: envModel || 'gpt-4o-mini',
      apiKey: envKey,
      provider: 'openai-compatible',
    };
  }
  // 2) 配置文件
  for (const fname of CONFIG_FILENAMES) {
    const fpath = path.join(base, fname);
    if (fs.existsSync(fpath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(fpath, 'utf-8'));
        if (cfg.apiKey && cfg.baseURL) {
          return {
            enabled: true,
            baseURL: String(cfg.baseURL).replace(/\/$/, ''),
            model: cfg.model || 'gpt-4o-mini',
            apiKey: String(cfg.apiKey),
            provider: cfg.provider || 'openai-compatible',
          };
        }
      } catch {
        // 解析失败 → 继续尝试下一个
      }
    }
  }
  // 3) 禁用
  return { enabled: false, baseURL: '', model: '', apiKey: '', provider: 'openai-compatible' };
}

/** 是否已启用语义校验（供调用方快速判断，避免无谓 fetch） */
export function isSemanticEnabled(cwd?: string): boolean {
  return loadLlmConfig(cwd).enabled;
}

// ============================================================
// 类型
// ============================================================
export type SemanticRuleId =
  | 'sem_ooc'                 // 角色性格/立场/能力漂移
  | 'sem_setting_contradiction' // 与已建立设定矛盾
  | 'sem_causal_break'        // 因果断链
  | 'sem_foreshadow_logic';   // 伏笔逻辑漏洞

export interface SemanticFinding {
  ruleId: SemanticRuleId;
  severity: 'warning';
  message: string;
  detail?: string;
}

const RULE_NAME_MAP: Record<SemanticRuleId, string> = {
  sem_ooc: '语义·角色人设漂移(OOC)',
  sem_setting_contradiction: '语义·设定逻辑矛盾',
  sem_causal_break: '语义·因果断链',
  sem_foreshadow_logic: '语义·伏笔逻辑漏洞',
};

// 截断工具
function truncate(s: string, n: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > n ? flat.slice(0, n) + ' …(截断)' : flat;
}

// 从模型回复里尽量抠出 JSON 数组
function extractJsonArray(raw: string): unknown[] | null {
  if (!raw) return null;
  // 去 ```json ``` 围栏
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  // 找第一个 [ 到最后一个 ]
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ============================================================
// 核心：跨章语义校验
// ============================================================
export async function checkCrossChapterSemantic(opts: {
  prevChapterText?: string;
  prevSemanticSummary?: string;
  prevFacts?: ChapterFact | null;
  settingText: string;
  currentChapterText: string;
  cwd?: string;
  timeoutMs?: number;
}): Promise<Violation[]> {
  const cfg = loadLlmConfig(opts.cwd);
  if (!cfg.enabled) return []; // 降级：无配置不校验

  const systemPrompt = [
    '你是严谨的中文长篇小说「叙事一致性审查器」。',
    '任务：审查由上一章延续到本章时，是否出现语义层面的逻辑/人物问题。不评价文笔、不评价风格，只抓叙事硬伤。',
    '你只能输出一个 JSON 数组，每个元素必须含字段：',
    '  ruleId: 以下四选一 ——',
    '    sem_ooc                角色性格/立场/能力在本章出现明显反常（违背上章已建立的稳定人设，且非合理成长/反转且有铺垫）',
    '    sem_setting_contradiction 本章情节与已建立的设定/世界观明显矛盾',
    '    sem_causal_break       上章已发生的关键事件，在本章被逻辑上推翻、忽略或矛盾（因果链断裂）',
    '    sem_foreshadow_logic   上章埋下的伏笔，在本章回收时出现逻辑漏洞（如机关/约定/信息凭空失效）',
    '  message: 一句话中文问题描述，必须点名具体角色/设定/事件',
    '  detail:  可选，约20字内引用原文证据',
    '若没有任何问题，输出空数组 []。禁止输出 JSON 以外的任何文字、禁止解释。',
  ].join('\n');

  const factsBlock = opts.prevFacts
    ? [
        '上章事实指纹（角色出场/时间/数值）：',
        JSON.stringify({
          characters: opts.prevFacts.characters.map(c => ({ name: c.name, present: c.present })),
          timeAnchors: opts.prevFacts.timeAnchors.slice(0, 8),
          numericAnchors: opts.prevFacts.numericAnchors.slice(0, 8),
          properNouns: opts.prevFacts.properNouns.slice(0, 12),
        }, null, 1),
      ].join('\n')
    : '(无)';

  const prevBlock = opts.prevSemanticSummary
    ? `上章语义记忆摘要：\n${truncate(opts.prevSemanticSummary, 1500)}`
    : opts.prevChapterText
      ? `上章全文（无摘要，降级用全文）：\n${truncate(opts.prevChapterText, 1500)}`
      : '(无上章资料)';

  const userPrompt = [
    '=== 设定背景（世界观/角色档案摘要） ===',
    truncate(opts.settingText, 1800),
    '',
    '=== 上章资料（记忆基线） ===',
    prevBlock,
    '',
    '=== 上章事实指纹 ===',
    factsBlock,
    '',
    '=== 本章全文（待审查） ===',
    truncate(opts.currentChapterText, 6000),
    '',
    '请输出 JSON 数组（无问题则 []）。',
  ].join('\n');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 12000);
    const resp = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return []; // 降级
    const data = await resp.json() as any;
    const content: string = data?.choices?.[0]?.message?.content || '';
    const arr = extractJsonArray(content);
    if (!arr) return []; // 解析失败 → 降级
    const findings: Violation[] = [];
    for (const item of arr) {
      const obj = item as { ruleId?: string; message?: unknown; detail?: unknown };
      const ruleId = obj?.ruleId as SemanticRuleId;
      const allowed: SemanticRuleId[] = ['sem_ooc', 'sem_setting_contradiction', 'sem_causal_break', 'sem_foreshadow_logic'];
      if (!ruleId || !allowed.includes(ruleId)) continue;
      const message = typeof obj?.message === 'string' ? obj.message.trim() : '';
      if (!message) continue;
      const detail = typeof obj?.detail === 'string' ? obj.detail.trim() : '';
      findings.push({
        ruleId,
        ruleName: RULE_NAME_MAP[ruleId],
        severity: 'warning',
        message: detail ? `${message}（证据：${detail}）` : message,
        suggestion: '结合上章记忆基线复核该情节/角色是否出现语义漂移，必要时回改。',
      });
    }
    return findings;
  } catch {
    // 网络/超时/任何异常 → 静默降级，绝不阻断门禁
    return [];
  }
}

// ============================================================
// 生成上章语义摘要（记忆雏形）
// ============================================================
export async function generateSemanticSummary(opts: {
  chapterText: string;
  settingText: string;
  cwd?: string;
  timeoutMs?: number;
}): Promise<string> {
  const cfg = loadLlmConfig(opts.cwd);
  if (!cfg.enabled) return ''; // 降级

  const systemPrompt = [
    '你是小说编辑。请为这一章生成一段「语义记忆摘要」（≤150字，纯文本，不要JSON）。',
    '必须包含：①本章关键事件 ②角色状态/立场变化 ③新埋伏笔 ④与设定相关的关键事实',
    '目的：作为下一章一致性校验的「记忆基线」。只输出摘要本身。',
  ].join('\n');

  const userPrompt = [
    '=== 设定背景 ===',
    truncate(opts.settingText, 1200),
    '',
    '=== 本章全文 ===',
    truncate(opts.chapterText, 5000),
  ].join('\n');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 12000);
    const resp = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return '';
    const data = await resp.json() as any;
    const content: string = data?.choices?.[0]?.message?.content || '';
    return content.replace(/\s+/g, ' ').trim().slice(0, 300);
  } catch {
    return '';
  }
}
