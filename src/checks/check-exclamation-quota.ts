// ============================================================
// V3.2 泛用化检测：感叹号配额检测
// 来源：Storyvein
// ============================================================

import type { RuleViolation, TextStats, MergedVocabulary, Thresholds } from '../types';

export function checkExclamationQuota(
  text: string,
  stats: TextStats,
  _thresholds: Thresholds,
  _vocabulary: MergedVocabulary,
  violations: RuleViolation[]
): void {
  const exclamationCount = (text.match(/！/g) || []).length;
  const density = stats.totalWords > 0 ? exclamationCount / stats.totalWords * 1000 : 0;

  if (exclamationCount > 10) {
    violations.push({
      ruleId: 'exclamation_quota',
      ruleName: '感叹号配额',
      message: `感叹号过多（${exclamationCount}个，${density.toFixed(1)}个/千字），建议控制在5个以内`,
      severity: 'warning',
      suggestion: '用动作描写、环境渲染代替感叹号表达情绪',
    });
  } else if (exclamationCount > 5) {
    violations.push({
      ruleId: 'exclamation_quota',
      ruleName: '感叹号配额',
      message: `感叹号偏多（${exclamationCount}个），建议精简`,
      severity: 'info',
      suggestion: '保留关键情绪爆发的感叹号，其余用句号',
    });
  }
}