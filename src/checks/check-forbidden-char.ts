// ============================================================
// V3.2 泛用化检测：禁用字检测
// 来源：Storyvein
// ============================================================

import type { RuleViolation, TextStats, MergedVocabulary, Thresholds } from '../types';

// 通用禁用字列表（非矿工专属）
const FORBIDDEN_CHARS = [
  '——',   // 破折号（中文网文不需要）
  '…',    // 省略号在叙事中过度使用
  '～',   // 波浪号
  '※',   // 米字号
  '★',   // 星号
  '☆',
  '◆',   // 菱形
  '◇',
  '○',   // 圆圈
  '●',
];

export function checkForbiddenChar(
  text: string,
  _stats: TextStats,
  _thresholds: Thresholds,
  _vocabulary: MergedVocabulary,
  violations: RuleViolation[]
): void {
  for (const char of FORBIDDEN_CHARS) {
    const count = (text.match(new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (count > 0) {
      const charName = char === '——' ? '破折号' : char === '…' ? '省略号' : `"${char}"`;
      violations.push({
        ruleId: 'forbidden_char',
        ruleName: '禁用字',
        message: `检测到${count}个${charName}，建议替换为逗号或句号`,
        severity: count > 5 ? 'warning' : 'info',
        suggestion: '中文网文不需要破折号，用逗号做认知翻转',
      });
    }
  }
}