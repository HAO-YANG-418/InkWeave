// ============================================================
// 跑量 · 双树剖面采集脚本（代码方产出）
// 严格分流 CLI 验收树 / 源码生成树，绝不合并成一个数。
// 输出：docs/方案与验收/剖面_<start>-<end>.md + .csv
//
// 用法：
//   npx tsx _sandbox/profiler_dual_tree.mts           # 默认 38-47
//   npx tsx _sandbox/profiler_dual_tree.mts 37 37     # 冒烟测单章
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { checkChapter, Violation } from '../检测工具/checkers.ts';
import { check as runSourceTreeCheckRaw } from '../源码/checker.ts';
import { DEFAULT_THRESHOLDS, DEFAULT_RADAR_WEIGHTS, MergedConfig } from '../源码/types.ts';
import { readProjectConfig } from '../检测工具/project-config.ts';

// —— 复刻 check-chapter.ts 的 R1_MERGED_CONFIG（最小 mergedConfig，不复用 mergeConfig 管道）——
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

const PROJECT = '裂日';
const PROTAGONIST = '林深';
const TARGET_WORDS = 3000;
const CHAPTERS_DIR = path.join('项目_裂日', '章节');
// per-project 排除词（U2）：从 project.json 读取，反映真实 CLI 树行为（否则 凉 不会从 texture_variety 排除）
const EXCLUDED_TEXTURE_WORDS = readProjectConfig().projects['裂日']?.excludedTextureWords;

// 源码树「去 AI 味」相关 ruleId（用于 src_other_ai_flavor 与 u2_numeric_tunable 拆解）
const AI_FLAVOR_SRC = new Set([
  'cliche_reaction', 'simile_density', 'fake_reactions',
  'cliche_phrases', 'fake_hook', 'sensory_balance',
]);
const AI_FLAVOR_NAMED = new Set(['cliche_reaction', 'simile_density', 'fake_reactions']);

// 「凉」误伤语境词表（仙侠/天气/体感/自然）——轻量判定，命中即视为合法使用
const LIANG_CONTEXT = [
  '风', '月', '夜', '露', '寒', '冰', '清', '雪', '霜', '雾', '水', '晨',
  '秋', '冬', '潮', '潭', '涧', '气', '灵', '汗', '背', '微', '沁', '透',
  '浸', '凉意', '习习', '沁凉', '清凉', '微凉', '冰凉', '寒意', '凉风',
  '凉夜', '凉露', '凉气', '凉席', '凉亭', '着凉', '风凉', '夜风', '晨风',
  '山风', '水凉', '石凉', '井凉', '泉凉', '霜寒', '月色', '夜色', '寒气',
];

interface CommonV { ruleId: string; severity: string; }

function runSourceTree(text: string): CommonV[] {
  try {
    const r = runSourceTreeCheckRaw(text, null, R1_MERGED_CONFIG, TARGET_WORDS);
    return (r.violations as CommonV[]);
  } catch {
    return [];
  }
}

function countBy(vs: CommonV[], pred: (v: CommonV) => boolean): number {
  return vs.filter(pred).length;
}

// 「凉」误伤计数：每个「凉」出现处 ±20 字含语境词即计 1
function countLiangFP(text: string): number {
  const matches = [...text.matchAll(/凉/g)];
  let fp = 0;
  for (const m of matches) {
    const start = Math.max(0, m.index! - 20);
    const end = Math.min(text.length, m.index! + 1 + 20);
    const win = text.slice(start, end);
    if (LIANG_CONTEXT.some(w => win.includes(w))) fp++;
  }
  return fp;
}

function resolveChapterFile(n: number): string | null {
  const files = fs.readdirSync(CHAPTERS_DIR)
    .filter(f => f.startsWith(`第${n}章`) && f.endsWith('.md') && !f.endsWith('.backup'));
  return files.length ? path.join(CHAPTERS_DIR, files[0]) : null;
}

interface Row {
  chapter: number;
  word_count: number;
  target_words: number;
  cli_error_total: number;
  cli_warn_total: number;
  cli_sense_density_low: number;
  cli_texture_variety_warn: number;
  cli_paibei_stack_err: number;
  cli_word_count_short: number;
  cli_liang_fp: number;
  src_error_total: number;
  src_warn_total: number;
  src_cliche_reaction: number;
  src_simile_density: number;
  src_fake_reactions: number;
  src_other_ai_flavor: number;
  u2_numeric_tunable: number;
  u2_wordlist_only: number;
}

function profileChapter(n: number): Row | null {
  const fp = resolveChapterFile(n);
  if (!fp) return null;
  const text = fs.readFileSync(fp, 'utf-8');

  // —— CLI 验收树 ——
  const cli = checkChapter(text, TARGET_WORDS, PROTAGONIST, EXCLUDED_TEXTURE_WORDS);
  const cliVs = cli.violations as CommonV[];
  const cliSenseLow = countBy(cliVs, v => v.ruleId === 'sense_density_low');
  const cliTexture = countBy(cliVs, v => v.ruleId === 'texture_variety');
  const cliStack = countBy(cliVs, v => v.ruleId.startsWith('style_stacking') && v.severity === 'error');
  const cliWordShort = countBy(cliVs, v => v.ruleId === 'word_count_short');

  // —— 源码生成树 ——
  const srcVs = runSourceTree(text);
  const srcCliche = countBy(srcVs, v => v.ruleId === 'cliche_reaction');
  const srcSimile = countBy(srcVs, v => v.ruleId === 'simile_density');
  const srcFake = countBy(srcVs, v => v.ruleId === 'fake_reactions');
  const srcOther = countBy(srcVs, v => AI_FLAVOR_SRC.has(v.ruleId) && !AI_FLAVOR_NAMED.has(v.ruleId));

  const liangFp = countLiangFP(text);

  return {
    chapter: n,
    word_count: cli.stats.totalWords,
    target_words: TARGET_WORDS,
    cli_error_total: countBy(cliVs, v => v.severity === 'error'),
    cli_warn_total: countBy(cliVs, v => v.severity === 'warning'),
    cli_sense_density_low: cliSenseLow,
    cli_texture_variety_warn: cliTexture,
    cli_paibei_stack_err: cliStack,
    cli_word_count_short: cliWordShort,
    cli_liang_fp: liangFp,
    src_error_total: countBy(srcVs, v => v.severity === 'error'),
    src_warn_total: countBy(srcVs, v => v.severity === 'warning'),
    src_cliche_reaction: srcCliche,
    src_simile_density: srcSimile,
    src_fake_reactions: srcFake,
    src_other_ai_flavor: srcOther,
    u2_numeric_tunable: srcCliche + srcSimile + srcFake + srcOther,
    u2_wordlist_only: liangFp,
  };
}

// ===================== 主流程 =====================
const start = parseInt(process.argv[2] ?? '38', 10);
const end = parseInt(process.argv[3] ?? '47', 10);

const rows: Row[] = [];
const missing: number[] = [];
for (let n = start; n <= end; n++) {
  const r = profileChapter(n);
  if (r) rows.push(r);
  else missing.push(n);
}

// —— CSV ——
const cols: (keyof Row)[] = [
  'chapter', 'word_count', 'target_words',
  'cli_error_total', 'cli_warn_total', 'cli_sense_density_low', 'cli_texture_variety_warn',
  'cli_paibei_stack_err', 'cli_word_count_short', 'cli_liang_fp',
  'src_error_total', 'src_warn_total', 'src_cliche_reaction', 'src_simile_density',
  'src_fake_reactions', 'src_other_ai_flavor', 'u2_numeric_tunable', 'u2_wordlist_only',
];
const csvHeader = cols.join(',');
const csvLines = rows.map(r => cols.map(c => r[c]).join(','));
const csv = [csvHeader, ...csvLines].join('\n');

// —— Markdown ——
const mdHeader = '| ' + cols.join(' | ') + ' |';
const mdSep = '| ' + cols.map(() => '---').join(' | ') + ' |';
const mdRows = rows.map(r => '| ' + cols.map(c => r[c]).join(' | ') + ' |');
const md = [
  `# 跑量 · 双树剖面（第 ${start}–${end} 章）`,
  '',
  `> 生成时间：${new Date().toISOString()}`,
  `> CLI 树：checkChapter（Y 降噪所在）；源码树：源码/checker.ts（R1_MERGED_CONFIG，去 AI 味自检）`,
  `> 两树严格分流，绝不合并。cli_liang_fp = 「凉」±20字含仙侠/天气/体感词计 1（轻量误伤估计）。`,
  '',
  '## 剖面表',
  '',
  mdHeader,
  mdSep,
  ...mdRows,
  '',
  '## 汇总',
  '',
  `- 采集章数：${rows.length}（${start}–${end}）`,
  missing.length ? `- ⚠️ 缺失章（未生成/不在盘）：${missing.join(', ')}` : '- 全章均在盘 ✅',
  `- CLI 树 error 合计：${rows.reduce((a, r) => a + r.cli_error_total, 0)}`,
  `- 源码树 error 合计（= inkweave check 显示的 error）：${rows.reduce((a, r) => a + r.src_error_total, 0)}`,
  `- u2_numeric_tunable 合计：${rows.reduce((a, r) => a + r.u2_numeric_tunable, 0)}`,
  `- u2_wordlist_only 合计（凉 FP）：${rows.reduce((a, r) => a + r.u2_wordlist_only, 0)}`,
  '',
  '## U2 解冻判据（数据到位后由方案方填）',
  '- 若 u2_numeric_tunable 某 ruleId 系统性偏高且稳定 → 填 KB threshold_overrides（仅源码树生效）。',
  '- 若 u2_wordlist_only（cli_liang_fp）持续 > 0 → 坐实「凉」走节点排除词表机制，数值阈值无解。',
  '- 若 cli_error_total > 0 → 先查是否新引入的真实质量 error，不归 Y 降噪。',
].join('\n');

const outMd = path.join('docs', '方案与验收', `剖面_${start}-${end}.md`);
const outCsv = path.join('docs', '方案与验收', `剖面_${start}-${end}.csv`);
fs.mkdirSync(path.dirname(outMd), { recursive: true });
fs.writeFileSync(outMd, md, 'utf-8');
fs.writeFileSync(outCsv, csv, 'utf-8');

console.log(md);
console.log(`\n✅ 已写出：${outMd}\n✅ 已写出：${outCsv}`);
