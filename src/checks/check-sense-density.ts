// ============================================================
// V3.2 泛用化检测：感官密度检测
// 来源：Storyvein
// ============================================================

import type { RuleViolation, TextStats, MergedVocabulary, Thresholds } from '../types';

export function checkSenseDensity(
  _text: string,
  stats: TextStats,
  thresholds: Thresholds,
  _vocabulary: MergedVocabulary,
  violations: RuleViolation[]
): void {
  const sensory = stats.sensoryMentions;
  const totalSensory = Object.values(sensory).reduce((a, b) => a + b, 0);
  const density = stats.totalWords > 0 ? totalSensory / stats.totalWords : 0;

  // 感官密度过低
  if (density < 0.02 && stats.totalWords > 500) {
    violations.push({
      ruleId: 'sense_density_low',
      ruleName: '感官密度',
      message: `感官词密度过低（${(density * 100).toFixed(1)}%），建议增加视觉/听觉/触觉描写`,
      severity: 'warning',
      suggestion: '每200-300字至少出现一次感官触发',
    });
  }

  // 五感分布不均
  const maxSense = Math.max(...Object.values(sensory));
  const minSense = Math.min(...Object.values(sensory).filter(v => v > 0));
  if (maxSense > 0 && minSense > 0 && maxSense / minSense > 5) {
    const dominant = Object.entries(sensory).find(([, v]) => v === maxSense)?.[0] || '';
    violations.push({
      ruleId: 'sense_density_balance',
      ruleName: '感官密度',
      message: `感官分布不均，${dominant}占比过高（${maxSense}次），建议增加其他感官描写`,
      severity: 'info',
      suggestion: '平均分配视觉、听觉、触觉、嗅觉、味觉的描写',
    });
  }
}