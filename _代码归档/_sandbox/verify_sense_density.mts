// #3 回归聚焦校验：源码树 sense_density_low 在 0.045 下实际触发哪些章
// 双源核对：DEFAULT_THRESHOLDS(types.ts:229, profiler/R1 路径) vs loadKbDefaultThresholds()(default.json:13, 真实引擎路径)
import * as fs from 'fs';
import * as path from 'path';
import { check as runSourceTreeCheck } from '../源码/checker.ts';
import { DEFAULT_THRESHOLDS, DEFAULT_RADAR_WEIGHTS, MergedConfig } from '../源码/types.ts';
import { loadKbDefaultThresholds } from '../源码/kb-thresholds.ts';
import { checkChapter } from '../检测工具/checkers.ts';

const TARGET_WORDS = 3000;
const CHAPTERS_DIR = path.join('项目_裂日', '章节');

const R1: MergedConfig = {
  thresholds: DEFAULT_THRESHOLDS,
  radarWeights: DEFAULT_RADAR_WEIGHTS,
  vocabulary: { bodyParts: new Set(), sensoryVerbs: new Set(), environmentSignals: new Set(), actionVerbs: new Set(), fillerPatterns: new Set(), dialogueTags: new Set(), worldTerms: new Set() },
  systemPrompts: [], constraints: [], examples: [], extraRules: [], disabledChecks: new Set(), enabledChecks: new Set(),
};

function resolveChapter(n: number): string | null {
  const files = fs.readdirSync(CHAPTERS_DIR).filter(f => f.startsWith(`第${n}章`) && f.endsWith('.md') && !f.includes('.fingerprint'));
  return files.length ? path.join(CHAPTERS_DIR, files[0]) : null;
}

const kb = loadKbDefaultThresholds();
console.log(`DEFAULT_THRESHOLDS.senseDensityMin (profiler/R1 路径) = ${DEFAULT_THRESHOLDS.senseDensityMin}`);
console.log(`KB default.json senseDensityMin   (真实引擎路径) = ${kb.senseDensityMin}`);
console.log(`两源一致? ${DEFAULT_THRESHOLDS.senseDensityMin === kb.senseDensityMin ? 'YES' : 'NO <<< 不一致!'}
`);

const rows: string[] = [];
let flaggedSrc = 0, flaggedCli = 0;
for (let n = 1; n <= 47; n++) {
  const fp = resolveChapter(n);
  if (!fp) continue;
  const text = fs.readFileSync(fp, 'utf8');
  const r = runSourceTreeCheck(text, null, R1, TARGET_WORDS);
  const srcLow = r.violations.filter(v => v.ruleId === 'sense_density_low').length;
  // CLI 树硬编码 0.02，不在 #3 范围，仅观察、不改
  const cliLow = checkChapter(text, TARGET_WORDS).violations.filter(v => v.ruleId === 'sense_density_low').length;
  const totalSensory = Object.values(r.stats.sensoryMentions).reduce((a: number, b: number) => a + b, 0);
  const ratio = r.stats.totalWords > 0 ? totalSensory / r.stats.totalWords : 0;
  if (srcLow > 0) flaggedSrc++;
  if (cliLow > 0) flaggedCli++;
  if (srcLow > 0) rows.push(`ch${n}\tratio=${(ratio * 100).toFixed(2)}%\twords=${r.stats.totalWords}\tsrcLow=${srcLow}`);
}
console.log(`源码树 sense_density_low 触发章数 = ${flaggedSrc} / 47`);
console.log(`CLI 树 sense_density_low 触发章数 = ${flaggedCli} / 47 (硬编码 0.02，未动)`);
console.log(`\n触发尾章清单 (源码树, ratio<4.5%):`);
console.log(rows.join('\n'));
