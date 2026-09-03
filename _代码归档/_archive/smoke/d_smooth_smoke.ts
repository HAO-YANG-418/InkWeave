// ============================================================
// ①-C D-SMOOTH 冒烟脚本
// 测试两种情形：
//   A. 无 LLM（llm=null）→ checkSemanticSmoothness 静默返 []
//   B. 有 LLM（mock）且超阈值（>3 条违规）→ 超出部分报 error
// 另测纯函数 assignSmoothnessSeverities 的 severity 分配（不依赖 LLM）
// 运行：npx tsx 检测工具/d_smooth_smoke.ts
// ============================================================

import { checkSemanticSmoothness, assignSmoothnessSeverities } from '../源码/checks/check-semantic-smoothness';
import type { LLMProvider } from '../源码/types';

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log(`  ✅ ${msg}`); }
  else { fail++; console.log(`  ❌ ${msg}`); }
}

async function main() {
  console.log('--- A. 无 LLM 降级 ---');
  const noLlm = await checkSemanticSmoothness('这是一段测试文字，读者会觉得顺。', null);
  assert(Array.isArray(noLlm) && noLlm.length === 0, 'llm=null → 返回空数组 []');

  console.log('--- B. 纯函数 severity 分配（不依赖 LLM） ---');
  const raw = Array.from({ length: 5 }, (_, i) => ({ message: `不顺${i}`, suggestion: `改${i}` }));
  const assigned = assignSmoothnessSeverities(raw, 3);
  assert(assigned.length === 5, '返回 5 条');
  assert(assigned.filter(v => v.severity === 'warning').length === 3, '前 3 条为 warning');
  assert(assigned.filter(v => v.severity === 'error').length === 2, '超出 3 条的 2 条为 error');
  assert(assigned.every(v => v.ruleId === 'semantic_smoothness'), 'ruleId 正确');
  assert(assigned.every(v => v.ruleName === '语义顺滑度'), 'ruleName 正确');

  console.log('--- C. 有 LLM（mock）超阈值 → 报 error ---');
  // mock LLMProvider：chat 直接返回构造的 5 条违规 JSON
  const mockLlm: LLMProvider = {
    name: 'smoke-test', // 注意：hasLLM 排除 name==='mock'，故测试用 'smoke-test' 模拟真实可用 LLM
    chat: async () => ({
      content: JSON.stringify({
        violations: Array.from({ length: 5 }, (_, i) => ({
          quote: `拗口句${i}`,
          issue: `句式${i}不顺`,
          suggestion: `改成${i}`,
        })),
      }),
    }),
    stream: async () => {},
  };
  const withLlm = await checkSemanticSmoothness('这是一段会被判不顺的测试文字。'.repeat(50), mockLlm);
  assert(withLlm.length === 5, 'mock LLM 返回 5 条违规');
  assert(withLlm.filter(v => v.severity === 'error').length === 2, '超出上限的 2 条报 error');
  assert(withLlm.filter(v => v.severity === 'warning').length === 3, '未超的 3 条为 warning');

  console.log('--- D. 有 LLM 但未超标（≤3）→ 全 warning，无 error ---');
  const mockLlmLow: LLMProvider = {
    name: 'smoke-test',
    chat: async () => ({
      content: JSON.stringify({
        violations: Array.from({ length: 2 }, (_, i) => ({
          quote: `轻微不顺${i}`,
          issue: `小问题${i}`,
          suggestion: `微调${i}`,
        })),
      }),
    }),
    stream: async () => {},
  };
  const lowLlm = await checkSemanticSmoothness('短文本。', mockLlmLow);
  assert(lowLlm.length === 2, '返回 2 条');
  assert(lowLlm.every(v => v.severity === 'warning'), '≤3 条全为 warning（不阻断生成）');

  console.log(`\n=== 冒烟结果：${pass} 通过 / ${fail} 失败 ===`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error('冒烟异常：', e); process.exit(1); });
