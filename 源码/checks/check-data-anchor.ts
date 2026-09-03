// ============================================================
// V3.2 泛用化检测：数据锚点检测
// 来源：Storyvein
//
// 2026-09-03 口径统一（双树矛盾修复）：
//   原实现只匹配「阿拉伯数字+单位」，漏掉中文数字（"三秒""两步"），
//   导致同一章在源树算出 0.0/千字（报"过低"）、在 CLI 树算出 9.1/千字（报"过高"），
//   同一指标两树结论相反，严重误导判断。
//   现与 CLI 树 `检测工具/checkers.ts` checkDataAnchor 完全对齐：
//     ① 阿拉伯数字+单位 ② 中文数字+单位 双通道
//     ③ ruleId 统一为 data_anchor_high / data_anchor_low
// ============================================================

import type { RuleViolation, TextStats, MergedVocabulary, Thresholds } from '../types';

/** 阿拉伯数字+单位（与 CLI 树一致） */
const ARABIC_UNIT_RE = /\d+[\.\d]*\s*(度|米|秒|分|时|公斤|斤|步|尺|丈|里|息|倍|成|层|个|条|道|缕|股|重)/g;

/** 中文数字+单位（与 CLI 树一致） */
const CN_NUM_UNIT_RE = /(一|二|三|四|五|六|七|八|九|十|零|两|几|半|百|千|万){1,3}\s*(度|米|秒|分|时|公斤|斤|步|尺|丈|里|息|倍|成|层|个|条|道|缕|股|重|厘米|毫米|赫兹|圈)/g;

export function checkDataAnchor(
  text: string,
  stats: TextStats,
  thresholds: Thresholds,
  _vocabulary: MergedVocabulary,
  violations: RuleViolation[]
): void {
  // 检测数字+单位的组合（阿拉伯数字 + 中文数字 双通道）
  const arabicMatches = text.match(ARABIC_UNIT_RE);
  const arabicCount = arabicMatches ? arabicMatches.length : 0;

  const cnMatches = text.match(CN_NUM_UNIT_RE);
  const cnCount = cnMatches ? cnMatches.length : 0;

  const dataCount = arabicCount + cnCount;
  const density = stats.totalWords > 0 ? dataCount / stats.totalWords * 1000 : 0;

  // 数据锚点过多（阈值与 CLI 树一致，默认 5/千字）
  if (density > (thresholds.dataAnchorDensityMax ?? 5)) {
    violations.push({
      ruleId: 'data_anchor_high',
      ruleName: '数据锚点',
      message: `数据锚点密度过高（${density.toFixed(1)}/千字），建议减少数字+单位的精确描述`,
      severity: 'info',
      suggestion: '将精确数据替换为模糊描述（如"片刻"代替"三秒"）',
    });
  }

  // 数据锚点过少（长文本，阈值与 CLI 树一致，默认 0.5/千字）
  if (density < (thresholds.dataAnchorDensityMin ?? 0.5) && stats.totalWords > 2000) {
    violations.push({
      ruleId: 'data_anchor_low',
      ruleName: '数据锚点',
      message: `数据锚点密度过低（${density.toFixed(1)}/千字），长文本缺少具体感`,
      severity: 'info',
      suggestion: '适当加入时间、距离、温度等具体数据增强真实感',
    });
  }
}
