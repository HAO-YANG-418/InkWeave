// ============================================================
// V3.2 泛用化检测：句群波形分析
// 来源：Storyvein
// ============================================================

import type { RuleViolation, TextStats, MergedVocabulary, Thresholds } from '../types';

export function checkSentenceWaveform(
  text: string,
  stats: TextStats,
  _thresholds: Thresholds,
  _vocabulary: MergedVocabulary,
  violations: RuleViolation[]
): void {
  const sentences = text.split(/[。！？；\n]+/).filter((s) => s.trim().length > 0);
  if (sentences.length < 5) return;

  const lengths = sentences.map((s) => s.replace(/[，、\s]/g, '').length);

  // 计算句长标准差
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  // 句长标准差过低 → 节奏单调
  if (stdDev < 5 && mean > 10) {
    violations.push({
      ruleId: 'sentence_waveform',
      ruleName: '句群波形',
      message: `句长标准差过低（${stdDev.toFixed(1)}），节奏单调，建议长短句交替`,
      severity: 'warning',
      suggestion: '使用短句（≤10字）制造紧张感，长句（30+字）渲染氛围',
    });
  }

  // 连续同长度句数检测
  let sameRun = 1;
  for (let i = 1; i < lengths.length; i++) {
    const diff = Math.abs(lengths[i] - lengths[i - 1]);
    if (diff < 3) {
      sameRun++;
      if (sameRun >= 5) {
        violations.push({
          ruleId: 'sentence_waveform_same',
          ruleName: '句群波形',
          message: `连续${sameRun}句长度相近（${lengths[i - sameRun + 1]}-${lengths[i]}字），建议插入不同长度的句子打破同频`,
          severity: 'info',
          suggestion: '在连续相似长度句子中插入短句或长句打破节奏',
        });
        sameRun = 1;
      }
    } else {
      sameRun = 1;
    }
  }
}