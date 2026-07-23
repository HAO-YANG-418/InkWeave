// ============================================================
// V3.2 泛用化检测：角色台词差异化检测
// 来源：Storyvein
// ============================================================

import type { RuleViolation, TextStats, MergedVocabulary, Thresholds } from '../types';

export function checkCharacterVoice(
  _text: string,
  stats: TextStats,
  _thresholds: Thresholds,
  vocabulary: MergedVocabulary,
  violations: RuleViolation[]
): void {
  if (stats.dialogueRatio < 0.05) return; // 对话太少，跳过

  const dialogueTags = vocabulary.dialogueTags || new Set<string>();
  const tagCount = dialogueTags.size;

  if (tagCount < 3 && stats.dialogueRatio > 0.15) {
    violations.push({
      ruleId: 'character_voice',
      ruleName: '角色台词差异化',
      message: `对话占比${(stats.dialogueRatio * 100).toFixed(0)}%，但对话标签种类不足（${tagCount}种），建议增加角色台词差异化`,
      severity: 'warning',
      suggestion: '为不同角色设计独特的说话方式、惯用语和语气词',
    });
  }
}