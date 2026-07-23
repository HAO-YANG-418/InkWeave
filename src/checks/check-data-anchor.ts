// ============================================================
// V3.2 泛用化检测：数据锚点检测
// 来源：Storyvein
// ============================================================

import type { RuleViolation, TextStats, MergedVocabulary, Thresholds } from '../types';

export function checkDataAnchor(
  text: string,
  stats: TextStats,
  thresholds: Thresholds,
  _vocabulary: MergedVocabulary,
  violations: RuleViolation[]
): void {
  // 检测数字+单位的组合
  const dataMatches = text.match(/\d+[\.\d]*\s*(度|米|秒|分|时|公斤|斤|步|尺|丈|里|息|息|倍|成|层|个|条|道|缕|股|重)/g);
  const dataCount = dataMatches ? dataMatches.length : 0;

  const density = stats.totalWords > 0 ? dataCount / stats.totalWords * 1000 : 0;

  // 数据锚点过多
  if (density > 5) {
    violations.push({
      ruleId: 'data_anchor',
      ruleName: '数据锚点',
      message: `数据锚点密度过高（${density.toFixed(1)}每千字），建议减少数字+单位的精确描述`,
      severity: 'info',
      suggestion: '将精确数据替换为模糊描述（如"片刻"代替"三秒"）',
    });
  }

  // 数据锚点过少（长文本）
  if (density < 0.5 && stats.totalWords > 2000) {
    violations.push({
      ruleId: 'data_anchor_low',
      ruleName: '数据锚点',
      message: `数据锚点密度过低（${density.toFixed(1)}每千字），长文本缺少具体感`,
      severity: 'info',
      suggestion: '适当加入时间、距离、温度等具体数据增强真实感',
    });
  }
}