// ============================================================
// V3.2 泛用化检测：逗号链检测
// 来源：Storyvein
// ============================================================

import type { RuleViolation, TextStats, MergedVocabulary, Thresholds } from '../types';

export function checkCommaChain(
  text: string,
  stats: TextStats,
  thresholds: Thresholds,
  _vocabulary: MergedVocabulary,
  violations: RuleViolation[]
): void {
  if (stats.sentenceCount < 5) return;

  // 计算逗号/句号比
  const commaCount = (text.match(/，/g) || []).length;
  const periodCount = (text.match(/。/g) || []).length;
  const ratio = periodCount > 0 ? commaCount / periodCount : commaCount;

  // 逗号/句号比过高 → 一逗到底
  if (ratio > (thresholds.commaChainRatioWarn ?? 5.0)) {
    violations.push({
      ruleId: 'comma_chain',
      ruleName: '逗号链',
      message: `逗号/句号比过高（${ratio.toFixed(1)}:1），存在"一逗到底"倾向`,
      severity: 'warning',
      suggestion: '只在换拍/换镜头处断开；读着顺就保留逗号连写，不因数字硬拆句',
    });
  }

  // 超长逗号链检测
  const sentences = text.split(/[。！？；\n]+/);
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const commas = (s.match(/，/g) || []).length;
    if (commas >= (thresholds.commaChainLongMax ?? 12)) {
      violations.push({
        ruleId: 'comma_chain_long',
        ruleName: '逗号链',
        message: `第${i + 1}句含${commas}个逗号，读着顺则保留，仅跨拍无换气点时拆分`,
        severity: 'info',
        suggestion: '长句只在跨拍且无换气点处拆分；读着顺就保留，不为压低逗号数剁碎句子',
      });
    }
  }
}