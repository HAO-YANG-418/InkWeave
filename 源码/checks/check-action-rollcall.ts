// ============================================================
// V3.2 泛用化检测：动作点名册（检测动作重复）
// 来源：Storyvein
// ============================================================

import type { RuleViolation, TextStats, MergedVocabulary, Thresholds } from '../types';

export function checkActionRollcall(
  text: string,
  _stats: TextStats,
  thresholds: Thresholds,
  vocabulary: MergedVocabulary,
  violations: RuleViolation[]
): void {
  const actionVerbs = vocabulary.actionVerbs || new Set<string>();
  if (actionVerbs.size === 0) return;

  const actionCounts: Record<string, number> = {};
  for (const verb of actionVerbs) {
    const regex = new RegExp(verb, 'g');
    const matches = text.match(regex);
    if (matches) actionCounts[verb] = matches.length;
  }

  const repeated: string[] = [];
  for (const [verb, count] of Object.entries(actionCounts)) {
    if (count >= (thresholds.actionRollcallRepeatMax ?? 5)) repeated.push(`${verb}(${count}次)`);
  }

  if (repeated.length > 0) {
    violations.push({
      ruleId: 'action_rollcall',
      ruleName: '动作点名册',
      message: `以下动作词重复过多：${repeated.join('、')}`,
      severity: 'warning',
      suggestion: '分散使用同义动作词，避免重复点名',
    });
  }
}