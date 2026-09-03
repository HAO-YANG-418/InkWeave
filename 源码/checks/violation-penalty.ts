// ============================================================
// 违规扣分函数 — V3.2
// 从 checker.ts 中提取出的纯违规扣分逻辑
// 来源：Storyvein
// ============================================================

import type { RuleViolation } from '../types';

/**
 * 根据违规项扣分
 * error: -5分, warning: -2分, info: -0.5分
 */
export function applyViolationPenalty(baseScore: number, violations: RuleViolation[]): number {
  let penalty = 0;
  for (const v of violations) {
    switch (v.severity) {
      case 'error':
        penalty += 5;
        break;
      case 'warning':
        penalty += 2;
        break;
      case 'info':
        penalty += 0.5;
        break;
    }
  }
  return Math.max(0, baseScore - penalty);
}

/**
 * 按严重程度分组统计违规项
 */
export function groupViolations(violations: RuleViolation[]): Record<string, number> {
  const groups: Record<string, number> = { error: 0, warning: 0, info: 0 };
  for (const v of violations) {
    groups[v.severity] = (groups[v.severity] || 0) + 1;
  }
  return groups;
}

/**
 * 获取违规摘要
 */
export function getViolationSummary(violations: RuleViolation[]): string {
  const errs = violations.filter((v) => v.severity === 'error');
  const warns = violations.filter((v) => v.severity === 'warning');
  if (errs.length > 0) return `${errs.length} 个错误，${warns.length} 个警告`;
  if (warns.length > 0) return `${warns.length} 个警告`;
  return '无违规';
}