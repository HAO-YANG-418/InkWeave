// ============================================================
// V3.2 泛用化检测："不是X是Y"句式检测
// 来源：Storyvein
//
// 2026-09-03 双树口径统一（误报修复）：
//   原实现缺 CLI 树的「白名单」，把「不是+动词/人称/指示词」的**合法否定**误判成"不是X是Y"套路。
//   实测：ch2 的「不是在走，是……」被源树报为 AI 味（CLI 树有白名单 → 正确放行），冤枉扣 4 分。
//   现与 CLI 树 `检测工具/checkers.ts` checkNotShiPattern 对齐：
//     ① 补白名单（不是+来/去/走/说/看/做/想/要/能/会/在/有/他/她/我/你/它/那/这/人…）
//     ② 匹配距离上限对齐 CLI 树（25 / 20 / 20，原为 20 / 15 / 20）
//   阈值口径不变（方案 B：≥3 处 error，1–2 处 warning）。
//   注：CLI 树另有「跨段/孤句」模式，源树未移植 —— 属漏检（不冤枉作者），由 CLI 树在验收时补齐。
// ============================================================

import type { RuleViolation, TextStats, MergedVocabulary, Thresholds } from '../types';

/** 白名单：不是+动词/人称/指示词 → 合法否定，非"不是X是Y"公式（与 CLI 树一致） */
const WHITELIST_RE = /不是(来|去|走|说|看|做|想|要|能|会|在|有|他|她|我|你|它|那|这|人|林|周|陈|赵)/;

/** 与 CLI 树 checkNotShiPattern.patternInline 对齐（距离上限 25 / 20） */
const PATTERN_INLINE_RE = /不是[^。！？\n]{1,25}而是|不是[^。！？\n]{1,20}，[^。！？\n]{0,5}是|并不是[^。！？\n]{1,20}而是/gi;

export function checkNotShiPattern(
  text: string,
  _stats: TextStats,
  thresholds: Thresholds,
  _vocabulary: MergedVocabulary,
  violations: RuleViolation[]
): void {
  const rawMatches = text.match(PATTERN_INLINE_RE) ?? [];

  // 过滤白名单：合法否定不计入 AI 味
  const matches = rawMatches.filter(m => !WHITELIST_RE.test(m));

  if (matches.length > 0) {
    // 方案 B（与检测工具/checkers.ts 对齐）：≤2处宽容(warning)，≥3处才 error。
    // 1–2处为感官/认知辨识破格放行；仅卡≥3处排比式堆砌的真 AI 味。
    // notShiErrorMin 可配，默认3（DEFAULT_THRESHOLDS 未定义该键，走 ?? 3 兜底）。
    const errorMin = thresholds.notShiErrorMin ?? 3;
    const severity: RuleViolation['severity'] =
      matches.length >= errorMin ? 'error' : matches.length >= 1 ? 'warning' : 'info';
    violations.push({
      ruleId: 'not_shi_pattern',
      ruleName: '不是X是Y',
      message: `检测到${matches.length}处"不是X是Y"句式：${matches.slice(0, 3).join('、')}`,
      severity,
      suggestion: '直接写Y的具体表现，不用"不是X是Y"绕弯子',
    });
  }
}
