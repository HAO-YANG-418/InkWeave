// ============================================================
// V3.2 泛用化检测："不是X是Y"句式检测
// 来源：Storyvein
// ============================================================

import type { RuleViolation, TextStats, MergedVocabulary, Thresholds } from '../types';

export function checkNotShiPattern(
  text: string,
  _stats: TextStats,
  _thresholds: Thresholds,
  _vocabulary: MergedVocabulary,
  violations: RuleViolation[]
): void {
  // 检测"不是...而是..."、"不是...是..."等句式
  const pattern = /不是.{1,20}而是|不是.{1,15}，.{0,5}是|并不是.{1,20}而是/gi;
  const matches = text.match(pattern);

  if (matches && matches.length > 0) {
    violations.push({
      ruleId: 'not_shi_pattern',
      ruleName: '不是X是Y',
      message: `检测到${matches.length}处"不是X是Y"句式：${matches.slice(0, 3).join('、')}`,
      severity: matches.length > 2 ? 'warning' : 'info',
      suggestion: '直接写Y的具体表现，不用"不是X是Y"绕弯子',
    });
  }
}