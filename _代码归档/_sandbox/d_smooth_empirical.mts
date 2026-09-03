// ============================================================
// 选项1 · D-SMOOTH 真实 LLM 实证 sweep
// 用用户提供的凭证在脚本内构造 OpenAICompatibleProvider，
// 跑 checkSemanticSmoothness 于十章，收集每章违规数 + warning/error 拆分 + 样本，
// 验证"检测双轨 LLM 腿（D-SMOOTH）真在真实 LLM 下生效"，
// 并给 maxSmoothnessViolations 默认 3 的标定数据。
//
// 凭证经 env 传入（不落盘）：
//   INKWEAVE_LLM_BASE_URL=https://xxx/v1 INKWEAVE_LLM_MODEL=xxx INKWEAVE_LLM_KEY=sk-xxx \
//   npx tsx _sandbox/d_smooth_empirical.mts 38 47
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { checkSemanticSmoothness } from '../源码/checks/check-semantic-smoothness.ts';
import { OpenAICompatibleProvider } from '../源码/llm-provider.ts';
import { DEFAULT_THRESHOLDS } from '../源码/types.ts';
import type { LLMProvider, RuleViolation } from '../源码/types.ts';

const CHAPTERS_DIR = path.join('项目_裂日', '章节');

function resolveChapterFile(n: number): string | null {
  const files = fs.readdirSync(CHAPTERS_DIR)
    .filter(f => f.startsWith(`第${n}章`) && f.endsWith('.md') && !f.endsWith('.backup'));
  return files.length ? path.join(CHAPTERS_DIR, files[0]) : null;
}

async function main(): Promise<void> {
  const baseURL = process.env.INKWEAVE_LLM_BASE_URL;
  const model = process.env.INKWEAVE_LLM_MODEL;
  const apiKey = process.env.INKWEAVE_LLM_KEY;
  if (!baseURL || !model || !apiKey) {
    console.error('缺少 LLM 凭证：请通过环境变量传入 INKWEAVE_LLM_BASE_URL / INKWEAVE_LLM_MODEL / INKWEAVE_LLM_KEY');
    process.exit(2);
  }
  const llm: LLMProvider = new OpenAICompatibleProvider({ apiKey, baseURL, model, temperature: 0.2, maxTokens: 1500 });

  const start = parseInt(process.argv[2] ?? '38', 10);
  const end = parseInt(process.argv[3] ?? '47', 10);

  const allCounts: number[] = [];
  let totalViolations = 0;
  const sampleLog: string[] = [];

  console.log(`\n=== D-SMOOTH 实证 sweep ${start}-${end}（baseURL=${baseURL} model=${model}）===\n`);

  for (let n = start; n <= end; n++) {
    const fp = resolveChapterFile(n);
    if (!fp) { console.error(`跳过 第${n}章：文件未找到`); continue; }
    const text = fs.readFileSync(fp, 'utf-8');
    const vs: RuleViolation[] = await checkSemanticSmoothness(text, llm, DEFAULT_THRESHOLDS);
    const warn = vs.filter(v => v.severity === 'warning').length;
    const err = vs.filter(v => v.severity === 'error').length;
    allCounts.push(vs.length);
    totalViolations += vs.length;
    console.log(`第${n}章: total=${vs.length} warn=${warn} err=${err}`);
    vs.slice(0, 2).forEach(v => sampleLog.push(`  [第${n}章/${v.severity}] ${v.message}`));
  }

  allCounts.sort((a, b) => a - b);
  const len = allCounts.length;
  const min = len ? allCounts[0] : 0;
  const max = len ? allCounts[len - 1] : 0;
  const median = len ? allCounts[Math.floor(len / 2)] : 0;
  const avg = len ? (totalViolations / len).toFixed(2) : '0';
  const defaultMax = DEFAULT_THRESHOLDS.maxSmoothnessViolations ?? 3;
  const overDefault = allCounts.filter(c => c > defaultMax).length;

  console.log('\n=== D-SMOOTH 实证汇总 ===');
  console.log(`章节数=${len} 总违规=${totalViolations}`);
  console.log(`每章违规数 min=${min} median=${median} max=${max} avg=${avg}`);
  console.log(`默认上限 maxSmoothnessViolations=${defaultMax}`);
  console.log(`超默认上限(${defaultMax})的章节数=${overDefault} / ${len}`);
  console.log('\n--- 样本（前2条/章）---');
  sampleLog.forEach(s => console.log(s));
  console.log('\n结论提示：若 min/median 均 > 0 且非全章爆表，说明 D-SMOOTH 在真实 LLM 下真触发（非空壳、非静默[]）；');
  console.log(`若多数章节违规数落在 <=${defaultMax}，默认上限合理；若频繁超 ${defaultMax}，需上调默认。`);
}

main().catch(e => { console.error(e); process.exit(1); });
