// ============================================================
// V3.2 泛用化检测：逗号链检测
// 来源：Storyvein
// ============================================================

import type { RuleViolation, TextStats, MergedVocabulary, Thresholds } from '../types';

export function checkCommaChain(
  text: string,
  stats: TextStats,
  _thresholds: Thresholds,
  _vocabulary: MergedVocabulary,
  violations: RuleViolation[]
): void {
  if (stats.sentenceCount < 5) return;

  // 计算逗号/句号比
  const commaCount = (text.match(/，/g) || []).length;
  const periodCount = (text.match(/。/g) || []).length;
  const ratio = periodCount > 0 ? commaCount / periodCount : commaCount;

  // 逗号/句号比过高 → 一逗到底
  if (ratio > 3.2) {
    violations.push({
      ruleId: 'comma_chain',
      ruleName: '逗号链',
      message: `逗号/句号比过高（${ratio.toFixed(1)}:1），存在"一逗到底"倾向`,
      severity: 'warning',
      suggestion: '在换拍、换判断、换压力处用句号断开，控制逗号/句号比在3.2以下',
    });
  }

  // 超长逗号链检测
  const sentences = text.split(/[。！？；\n]+/);
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const commas = (s.match(/，/g) || []).length;
    if (commas >= 8) {
      violations.push({
        ruleId: 'comma_chain_long',
        ruleName: '逗号链',
        message: `第${i + 1}句含${commas}个逗号，建议拆分`,
        severity: 'info',
        suggestion: '长句超过70字或含8个以上逗号时，在换拍处拆分为两句',
      });
    }
  }
}