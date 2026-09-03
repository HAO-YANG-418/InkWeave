// R1 方案B 真实链路冒烟：模拟 CLI 调用 源码/checker.ts check()，验证生成时树产出
// ①-B 已升 error 的去 AI 味项 + R4 字数门禁，且能与 CLI 树合并（同一 Violation 结构）。
import { check } from './源码/checker.js';
import { DEFAULT_THRESHOLDS, DEFAULT_RADAR_WEIGHTS, MergedConfig } from './源码/types.js';

const R1_MERGED_CONFIG: MergedConfig = {
  thresholds: DEFAULT_THRESHOLDS,
  radarWeights: DEFAULT_RADAR_WEIGHTS,
  vocabulary: {
    bodyParts: new Set(), sensoryVerbs: new Set(), environmentSignals: new Set(),
    actionVerbs: new Set(), fillerPatterns: new Set(), dialogueTags: new Set(), worldTerms: new Set(),
  },
  systemPrompts: [], constraints: [], examples: [],
  extraRules: [],
  disabledChecks: new Set<string>(),
  enabledChecks: new Set<string>(),
};

// 复用 b1_smoke 验证过的文本结构（含 5 个陈词 + 标签化假动作 + 比喻过密 + 假钩子）+ 字数严重不足
const aiText = [
  '苏明站在一座巍峨壮丽的山门前，宛如仙境般的云雾缭绕，金碧辉煌的殿宇气势磅礴，美不胜收的壁画让人目不暇接，古色古香的廊柱巧夺天工。',
  '他嘴角露出一丝冷笑，眼中闪过一丝寒光，心中暗暗发誓要复仇。',
  '那东西像一块铁，仿佛一尊石像，如同一只受伤的兽，静静趴在地上喘气。',
  '月光下他总觉得哪里不对，事情越来越不对劲，仿佛有什么东西在暗处窥视着他。',
].join('\n');

function run(text: string, targetWords?: number) {
  const r = check(text, null, R1_MERGED_CONFIG, targetWords);
  return r.violations;
}

let pass = true;
function check_(name: string, cond: boolean) {
  console.log(`${cond ? '✅' : '❌'} ${name}`);
  if (!cond) pass = false;
}

// 用例1：AI 味短文本 + targetWords=3000 → 应有 ①-B error + R4 word_count_short
const v1 = run(aiText, 3000);
const err1 = v1.filter(v => v.severity === 'error');
const ruleIds1 = err1.map(v => v.ruleId);
console.log('[用例1] error ruleIds =', JSON.stringify(ruleIds1));
check_('[R1 ①-B] cliche_reaction error 出现', ruleIds1.includes('cliche_reaction'));
check_('[R1 ①-B] fake_reactions error 出现', ruleIds1.includes('fake_reactions'));
check_('[R1 ①-B] simile_density error 出现', ruleIds1.includes('simile_density'));
check_('[R1 ①-B] cliché_phrases error 出现', ruleIds1.includes('cliché_phrases'));
check_('[R1 ④] word_count_short error 出现（短文本）', ruleIds1.includes('word_count_short'));

// 用例2：同文本不设 targetWords → 回退 2700 仍 word_count_short
const v2 = run(aiText);
check_('[R1 ④回退] 不设 targetWords 仍 word_count_short', v2.filter(v => v.ruleId === 'word_count_short').length > 0);

// 用例3：长文本（>=3000字）+ targetWords=3000 → 无 word_count_short，但有 ①-B error（AI 味仍在）
const longText = aiText.repeat(20);
const v3 = run(longText, 3000);
check_('[R1 ④] 长文本无 word_count_short', v3.filter(v => v.ruleId === 'word_count_short').length === 0);
check_('[R1 ①-B] 长文本仍含 cliche_reaction error', v3.filter(v => v.ruleId === 'cliche_reaction').length > 0);

// 用例4：disabledChecks 为空 → 所有检测器未被跳过（①-B 确实生效，证明空 Set 正确）
check_('[R1 空 disabledChecks] 检测器未被跳过（cliche_reaction 存在）', v1.filter(v => v.ruleId === 'cliche_reaction').length > 0);

// 用例5：fake_hook 应为 warning（第三批，非 error）
check_('[R1 ①-B 第三批] fake_hook 为 warning 非 error', v1.filter(v => v.ruleId === 'fake_hook' && v.severity === 'warning').length > 0);

console.log(pass ? '\nR1 SMOKE: PASS ✅' : '\nR1 SMOKE: FAIL ❌');
process.exit(pass ? 0 : 1);
