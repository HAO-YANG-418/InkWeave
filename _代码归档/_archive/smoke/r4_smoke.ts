import { check } from './源码/checker';
import { mergeConfig } from './源码/config-merger';
import { SelfReflection } from './源码/reflection/engine';
import type { RuleViolation } from './源码/types';

// 宽容 intent 代理（复用 b1_smoke 的写法，避免逐个补 intent 字段）
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

// 短文本（约 200 中文字，远低于 2700 容差线）
const shortText = [
  '苏明站在一座巍峨壮丽的山门前，云雾缭绕，殿宇气势磅礴。',
  '他嘴角露出一丝冷笑，眼中闪过一丝寒光。',
  '那东西像一块铁，仿佛一尊石像，静静趴在地上。',
  '月光下他总觉得哪里不对，事情越来越不对劲。',
].join('\n');

// 长文本（≥2700 中文字，重复一个 19 字句 150 次 ≈ 2850 字）
const longText = Array(150).fill('测试文字内容用于验证字数门禁是否正常工作。').join('');

// --- 用例1：短文本 + targetWords=3000 → 应报 word_count_short(error) ---
const rShort = check(shortText, null, cfg, 3000);
const shortErr = rShort.violations.filter((v) => v.severity === 'error');
const hasShortErr = rShort.violations.some((v) => v.ruleId === 'word_count_short' && v.severity === 'error');
console.log('=== 用例1：短文本(约' + (shortText.match(/[一-鿿]/g) || []).length + '字) targetWords=3000 ===');
console.log('error ruleIds :', shortErr.map((v) => v.ruleId));
console.log('[word_count_short=error]', hasShortErr ? 'PASS ✅' : 'FAIL ❌');

// --- 用例2：短文本不设 targetWords → 应回退 2700 默认，仍报 error ---
const rDefault = check(shortText, null, cfg);
const hasDefaultErr = rDefault.violations.some((v) => v.ruleId === 'word_count_short' && v.severity === 'error');
console.log('=== 用例2：短文本 不设 targetWords（回退2700）===');
console.log('[word_count_short=error(回退)]', hasDefaultErr ? 'PASS ✅' : 'FAIL ❌');

// --- 用例3：长文本 + targetWords=3000 → 不应报 word_count_short ---
const rLong = check(longText, null, cfg, 3000);
const hasLongShort = rLong.violations.some((v) => v.ruleId === 'word_count_short');
console.log('=== 用例3：长文本(约' + (longText.match(/[一-鿿]/g) || []).length + '字) targetWords=3000 ===');
console.log('[word_count_short 不应出现]', !hasLongShort ? 'PASS ✅' : 'FAIL ❌');

// --- 用例4：R3 链路接通 —— 短文本 error 喂 reflect → passed=false + rule_check ---
const reflect = new SelfReflection(null as any, null as any);
const rr = reflect.reflect(
  { content: shortText, intent: safeIntent, chapterNumber: 1, chapterTitle: 't', previousContent: '' },
  0,
  shortErr as RuleViolation[]
);
const hasRuleCheck = rr.concerns.some((c) => c.dimension === 'rule_check');
console.log('=== 用例4：R3 链路（短文本 error → reflect）===');
console.log('[reflect passed]', rr.passed, rr.passed === false ? 'PASS ✅(逼自纠)' : 'FAIL ❌');
console.log('[reflect has rule_check]', hasRuleCheck ? 'PASS ✅' : 'FAIL ❌');
console.log('[rewriteInstructions 含检测期违规]', /检测期违规/.test(rr.rewriteInstructions || '') ? 'PASS ✅' : 'FAIL ❌');

const allOk = hasShortErr && hasDefaultErr && !hasLongShort && rr.passed === false && hasRuleCheck;
console.log(allOk ? '\nR4 SMOKE: PASS ✅' : '\nR4 SMOKE: FAIL ❌');
