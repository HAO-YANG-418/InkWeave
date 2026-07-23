// ============================================================
// 检测模块 — 统一导出
// 来源：Storyvein（另一个账号修改的引擎）
// ============================================================

// 注册表
export { registerCheck, registerChecks, runAllChecks, getRegisteredChecks, getCheckCount, getCheckStats, wrapCheck } from './checker-registry';
export type { CheckEntry, CheckFn, CheckParams } from './checker-registry';

// 辅助函数
export { computeTextStats } from './text-stats';
export { applyViolationPenalty, groupViolations, getViolationSummary } from './violation-penalty';

// V3.2 泛用化检测模块
export { checkCharacterVoice } from './check-character-voice';
export { checkActionRollcall } from './check-action-rollcall';
export { checkSenseDensity } from './check-sense-density';
export { checkSentenceWaveform } from './check-sentence-waveform';
export { checkDataAnchor } from './check-data-anchor';
export { checkExclamationQuota } from './check-exclamation-quota';
export { checkForbiddenChar } from './check-forbidden-char';
export { checkNotShiPattern } from './check-not-shi-pattern';
export { checkCommaChain } from './check-comma-chain';