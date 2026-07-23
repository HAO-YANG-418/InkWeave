// ============================================================
// 检测器注册表 (Checker Registry) — V3.2
// 职责：统一管理所有检测项，支持按优先级调度、开关控制、批量运行
// 来源：Storyvein（另一个账号修改的引擎）
// ============================================================

import type { RuleViolation, TextStats, MergedVocabulary, Thresholds } from '../types';

// === 检测项条目 ===
export interface CheckEntry {
  id: string;
  name: string;
  fn: CheckFn;
  priority: 'core' | 'quality' | 'release' | 'migrated';
}

// === 检测函数签名 ===
export type CheckFn = (params: CheckParams) => RuleViolation[];

export interface CheckParams {
  text: string;
  stats: TextStats;
  thresholds: Thresholds;
  vocabulary: MergedVocabulary;
  violations: RuleViolation[];
}

// === 全局注册表 ===
const registry: Map<string, CheckEntry> = new Map();
const priorityOrder: Record<string, number> = {
  core: 0,
  quality: 1,
  release: 2,
  migrated: 3,
};

export function registerCheck(entry: CheckEntry): void {
  if (registry.has(entry.id)) {
    console.warn(`[CheckerRegistry] 检测项 "${entry.id}" 已注册，将覆盖`);
  }
  registry.set(entry.id, entry);
}

export function registerChecks(entries: CheckEntry[]): void {
  for (const entry of entries) {
    registerCheck(entry);
  }
}

// === 包装函数：将旧版检测函数适配为注册表兼容格式 ===
export function wrapCheck(
  id: string,
  fn: (...args: any[]) => void,
  paramNames: string[],
): CheckFn {
  return (params: CheckParams) => {
    const violations: RuleViolation[] = [];
    const args: any[] = paramNames.map((name) => (params as any)[name]);
    // 最后一个参数总是 violations 数组
    args[args.length - 1] = violations;
    fn(...args);
    return violations;
  };
}

// === 运行所有检测项 ===
export function runAllChecks(
  text: string,
  stats: TextStats,
  thresholds: Thresholds,
  vocabulary: MergedVocabulary,
  disabledChecks: Set<string>,
): RuleViolation[] {
  const allViolations: RuleViolation[] = [];
  const entries = Array.from(registry.values())
    .filter((e) => !disabledChecks.has(e.id))
    .sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));

  for (const entry of entries) {
    try {
      const violations = entry.fn({ text, stats, thresholds, vocabulary, violations: [] });
      allViolations.push(...violations);
    } catch (err) {
      console.warn(`[CheckerRegistry] 检测项 "${entry.id}" 执行失败:`, err);
    }
  }

  return allViolations;
}

// === 查询 ===
export function getRegisteredChecks(): CheckEntry[] {
  return Array.from(registry.values());
}

export function getCheckCount(): number {
  return registry.size;
}

export function getCheckStats(): Record<string, number> {
  const stats: Record<string, number> = { core: 0, quality: 0, release: 0, migrated: 0 };
  for (const entry of registry.values()) {
    stats[entry.priority] = (stats[entry.priority] || 0) + 1;
  }
  return stats;
}