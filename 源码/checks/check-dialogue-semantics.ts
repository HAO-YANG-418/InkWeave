// ============================================================
// ② LLM 语义层 — 对话碰撞 + 主角私心（生成时 async 自纠增强）
// 来源：v2 执行清单 ②；2026-08-27 落地（决策 ② 预留接口补实）
//
// ⚠️ 实验接口 / 已冻结（2026-08-28 标记）：
//   - live LLM 路径在本环境无 provider，**从未实跑验证**（仅降级 null→[] 确定性路径验过）。
//   - 主角名经 protagonistName 参数注入（缺省回退 '林深'），CLI/生成侧均接 project/kb 配置，支持多作。
//   - 仅 warning 级，不拦门禁，净收益≈0，双树概念重复（与 CLI 树 checkProtagonistStakes 同概念两套机制）。
//   - 当前勿当"已交付能力"吹；等真有 LLM 环境回归验证后再评估去留。代码保留、行为不变。
// ⚠️ @deprecated 等价：统计"检测双轨生效 / 去 AI 味"时**请勿计入**本层——它未实跑、净收益≈0、双树概念重复。
//
// 职责边界：正则层（源码/checker.ts dialogue_conflict + 检测工具/checkers.ts protagonist_stakes）
//           是门禁权威源；本文件是 async 语义增强，仅在生成时 reflection 路径运行，
//           不进入同步 check() 门禁，对 R3 已复验状态零回归。
// 降级安全：无 LLM 配置 → 静默返 []（不阻断生成）。
// 互补定位：正则层看不到无引号/无动词的上下文对话，本层用 LLM 补全该盲区。
// ============================================================

import { llmJson, hasLLM } from '../llm-helper';
import type { RuleViolation, Thresholds, LLMProvider } from '../types';

const DIALOGUE_RULE_ID = 'dialogue_collision_llm';
const STAKES_RULE_ID = 'protagonist_stakes_llm';
const PROTAGONIST_NAME = '林深';
const CONTENT_TRUNCATION = 6000;

const SEMANTIC_SYSTEM_PROMPT = `你是资深网文编辑，专门判断章节的对话质量与主角动机质量。请基于【章节内容】回答：

1. 对话碰撞（collision）：章节里是否存在角色之间的真实分歧、反对、质疑、冲突或立场对立？注意：对话可能不是用引号写的，可能是「角色名＋动作/心理」后直接说话，或是内心独白穿插。只要角色之间有观点/意图/行动的相互抵触就算碰撞。若章节根本不存在角色对话，或存在对话但全是顺承/汇报/附和（无反对、无质疑、无冲突），则 collision=false。
2. 主角私心（stakes）：主角「{{PROTAGONIST}}」是否表达了属于他个人的、利己的动机或情感牵挂（如为某人赌、怕失去、愧疚、未竟执念）？仅转述指令或执行安排算没有私心。若章节里主角根本未出场，则 hasStakes 置 false 即可。

【输出格式】只输出纯JSON，以 { 开头，以 } 结尾，不要任何多余文字：
{"hasDialogue":true,"collision":true,"collisionEvidence":"","hasStakes":true,"stakesEvidence":""}`;

/**
 * 主入口（async）：单章对话碰撞 + 主角私心 LLM 增强检测。
 * @param text 章节正文
 * @param llm LLM 提供者；null/undefined 时静默降级返 []
 * @param thresholds 可选阈值（读 dialogueConflictMinCount），缺省用 4
 */
// @deprecated 冻结实验接口（2026-08-28）：未实跑、净收益≈0、双树概念重复。勿纳入"双轨生效"统计。
export async function checkDialogueSemantics(
  text: string,
  llm: LLMProvider | null | undefined,
  thresholds?: Thresholds,
  protagonistName?: string,
): Promise<RuleViolation[]> {
  // 降级：无 LLM → 静默返空（不阻断生成）
  if (!hasLLM(llm)) return [];
  if (!text || text.trim().length === 0) return [];

  const name = protagonistName ?? PROTAGONIST_NAME;
  const minCount = thresholds?.dialogueConflictMinCount ?? 4;

  const result = await llmJson<{
    hasDialogue: boolean;
    collision: boolean;
    collisionEvidence: string;
    hasStakes: boolean;
    stakesEvidence: string;
  }>(
    llm,
    [
      { role: 'system', content: SEMANTIC_SYSTEM_PROMPT.replace('{{PROTAGONIST}}', name) },
      { role: 'user', content: `【章节内容】\n${text.slice(0, CONTENT_TRUNCATION)}` },
    ],
    { temperature: 0.2, maxTokens: 800 },
  );

  if (!result) return [];

  const violations: RuleViolation[] = [];

  // 仅当存在对话且缺乏碰撞时报告（独白/无对话章节跳过，对齐正则层 minCount 口径）
  if (result.hasDialogue && !result.collision) {
    violations.push({
      ruleId: DIALOGUE_RULE_ID,
      ruleName: '对话缺乏碰撞（语义层）',
      message: `检测到对话但缺乏角色间真实碰撞/反对/质疑（LLM 语义层）${result.collisionEvidence ? `（"${result.collisionEvidence}"）` : ''}`,
      severity: 'warning',
      suggestion: '让角色说出判断后，下一个人先反对/质疑；至少一人做出错误判断或用动作打断。',
    });
  }

  if (!result.hasStakes) {
    violations.push({
      ruleId: STAKES_RULE_ID,
      ruleName: '主角工具人（语义层）',
      message: `主角「${name}」未表达个人化利己动机（LLM 语义层）${result.stakesEvidence ? `（"${result.stakesEvidence}"）` : ''}`,
      severity: 'warning',
      suggestion: '给主角一个只属于他个人的赌注：具体人名、怕失去什么、为个人而非为任务做的抉择。',
    });
  }

  return violations;
}
