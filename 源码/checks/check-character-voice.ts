// ============================================================
// V3.2 泛用化检测：角色台词差异化检测
// 来源：Storyvein
//
// 2026-09-03 口径标注（双树矛盾修复）：
//   本函数读的是「源树」TextStats.dialogueRatio，与 CLI 树的同名指标是两套独立算法，
//   数值不可比（实测同一章 源树 79% vs CLI 树 1%）。
//   故 message 内显式标注「源树口径」，避免读者把它当成验收报告表格里的对话占比。
// ============================================================

import type { RuleViolation, TextStats, MergedVocabulary, Thresholds } from '../types';

export function checkCharacterVoice(
  _text: string,
  stats: TextStats,
  thresholds: Thresholds,
  vocabulary: MergedVocabulary,
  violations: RuleViolation[]
): void {
  if (stats.dialogueRatio < (thresholds.characterVoiceSkipRatio ?? 0.05)) return; // 对话太少，跳过

  const dialogueTags = vocabulary.dialogueTags || new Set<string>();
  const tagCount = dialogueTags.size;

  if (tagCount < (thresholds.characterVoiceTagMin ?? 3) && stats.dialogueRatio > (thresholds.characterVoiceRatioMax ?? 0.15)) {
    violations.push({
      ruleId: 'character_voice',
      ruleName: '角色台词差异化',
      message: `对话占比${(stats.dialogueRatio * 100).toFixed(0)}%（源树口径，与报告表格的 CLI 树口径不同、不可比），但对话标签种类不足（${tagCount}种），建议增加角色台词差异化`,
      severity: 'warning',
      suggestion: '为不同角色设计独特的说话方式、惯用语和语气词',
    });
  }
}