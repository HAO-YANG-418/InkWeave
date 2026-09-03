import { check } from './源码/checker';
import { mergeConfig } from './源码/config-merger';
import { SelfReflection } from './源码/reflection/engine';
import type { RuleViolation } from './源码/types';

// 宽容 intent 代理：所有 input.intent.* 访问安全返回默认值，避免逐个补字段
const safeIntent: any = new Proxy(function () {} as any, {
  get(_t, prop) {
    if (prop === 'primary') return safeIntent;
    if (prop === 'secondary') return [];
    if (prop === 'suggestedStrategies') return [];
    if (prop === 'type') return '';
    if (prop === 'length') return 0;
    if (prop === 'then') return undefined;
    if (prop === Symbol.toPrimitive) return () => 0;
    if (prop === 'valueOf') return () => 0;
    if (prop === 'toString') return () => '';
    return safeIntent;
  },
  apply() { return safeIntent; },
  construct() { return safeIntent; },
});

const cfg = mergeConfig({ selections: {}, loadedOptions: new Map() });

// 构造含多种 AI 味的文本
const text = [
  '苏明站在一座巍峨壮丽的山门前，宛如仙境般的云雾缭绕，金碧辉煌的殿宇气势磅礴，美不胜收的壁画让人目不暇接，古色古香的廊柱巧夺天工。',
  '他嘴角露出一丝冷笑，眼中闪过一丝寒光，心中暗暗发誓要复仇。',
  '那东西像一块铁，仿佛一尊石像，如同一只受伤的兽，静静趴在地上喘气。',
  '月光下他总觉得哪里不对，事情越来越不对劲，仿佛有什么东西在暗处窥视着他。',
].join('\n');

const result = check(text, null, cfg);
const errors = result.violations.filter((v) => v.severity === 'error');
const warnings = result.violations.filter((v) => v.severity === 'warning');

console.log('=== checker.ts check() 输出 ===');
console.log('total violations:', result.violations.length);
console.log('error ruleIds :', errors.map((v) => v.ruleId));
console.log('warning ruleIds:', warnings.map((v) => v.ruleId));

// ①-B 第一批+第二批升 error 是否生效
const expectError = ['cliche_reaction', 'fake_reactions', 'simile_density', 'cliché_phrases'];
const gotError = errors.map((v) => v.ruleId);
const b1ok = expectError.every((r) => gotError.includes(r));
console.log('[①-B error 生效]', b1ok ? 'PASS ✅' : 'FAIL ❌', gotError);

// 第三批 fake_hook 应 warning（不升 error）
const fakeHook = result.violations.find((v) => v.ruleId === 'fake_hook');
const b3ok = !!fakeHook && fakeHook.severity === 'warning';
console.log('[fake_hook=warning]', b3ok ? 'PASS ✅' : 'FAIL ❌', fakeHook ? fakeHook.severity : 'none');

// R3 链路：把 error 级 violations 传给 reflect，验证 passed=false 且含 rule_check concern
const reflect = new SelfReflection(null as any, null as any);
const rr = reflect.reflect(
  { content: text, intent: safeIntent, chapterNumber: 1, chapterTitle: 't', previousContent: '' },
  0,
  errors as RuleViolation[]
);
const hasRuleCheck = rr.concerns.some((c) => c.dimension === 'rule_check');
console.log('=== reflect 收到 checker errors (R3 链路) ===');
console.log('[reflect passed]', rr.passed, rr.passed === false ? 'PASS ✅(逼自纠)' : 'FAIL ❌');
console.log('[reflect has rule_check]', hasRuleCheck ? 'PASS ✅' : 'FAIL ❌');
console.log('[rewriteInstructions 含检测期违规]', /检测期违规/.test(rr.rewriteInstructions || '') ? 'PASS ✅' : 'FAIL ❌');

const allOk = b1ok && b3ok && rr.passed === false && hasRuleCheck;
console.log(allOk ? '\n①-B SMOKE: PASS ✅' : '\n①-B SMOKE: FAIL ❌');
