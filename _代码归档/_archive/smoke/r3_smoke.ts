import { SelfReflection } from './源码/reflection/engine.ts'

// 无限宽容的 intent 代理：任意属性/调用都返回安全默认值，避免维度评估因 mock 不全而崩
const safe: any = new Proxy(function () {} as any, {
  get(_t, prop) {
    if (prop === Symbol.toPrimitive) return (hint: string) => (hint === 'string' ? '' : 0)
    if (prop === 'valueOf') return () => 0
    if (prop === 'toString') return () => ''
    if (prop === 'primary') return safe
    if (prop === 'secondary') return []
    if (prop === 'suggestedStrategies') return []
    if (prop === 'type') return ''   // 触发 checkIntentAlignment 的未知意图早返回
    if (prop === 'length') return 0
    if (prop === 'then') return undefined
    return safe
  },
  apply() { return safe },
  construct() { return safe },
})

const violations = [{
  ruleId: 'not_shi_pattern',
  ruleName: '不是X是Y',
  message: '检测到「不是X是Y」堆砌',
  severity: 'error' as const,
  suggestion: '改为具体描写',
}]

const input: any = {
  content: '林夜不是 warrior，他是 shadow。风不是 cold，是 biting。',
  intent: safe,
  chapterNumber: 1,
  chapterTitle: '测试章',
  previousContent: '',
}

const r = new SelfReflection({ qualityGate: 0.1 }, null)  // 低门槛，隔离 checker 注入效果

// 1) reflect 层
const res = r.reflect(input, 0, violations)
console.log('[reflect] passed =', res.passed)
console.log('[reflect] has rule_check =', res.concerns.some(c => c.dimension === 'rule_check'))
console.log('[reflect] rewriteInstructions =', (res.rewriteInstructions || '').slice(0, 90))

// 2) reflectAsync 层（无 LLM，走 ruleResult 直达）
const resA = await r.reflectAsync(input, 0, violations)
console.log('[reflectAsync] passed =', resA.passed)
console.log('[reflectAsync] has rule_check =', resA.concerns.some(c => c.dimension === 'rule_check'))

// 3) 无违规 → passed 应为 true（score 通常 > 0.1）
const resOk = r.reflect(input, 0, [])
console.log('[no-violation] passed =', resOk.passed)

const ok = res.passed === false
  && res.concerns.some(c => c.dimension === 'rule_check')
  && resA.passed === false
  && resA.concerns.some(c => c.dimension === 'rule_check')
  && resOk.passed === true

console.log(ok ? 'R3 SMOKE: PASS ✅' : 'R3 SMOKE: FAIL ❌')
process.exit(ok ? 0 : 1)
