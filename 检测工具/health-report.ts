/**
 * ③ 阶段一：双树体检导出器（InkWeave v2 KB 阈值标定）
 * 把已写章节过「生成时树 + CLI 树」，导出每章数值矩阵 health-matrix.json。
 *
 * 复用：
 *   - 本地复刻 check-chapter.ts 的双树桥接（R1_MERGED_CONFIG + 源码/checker.ts 的 check）
 *     不 import check-chapter.ts 本身——该文件末尾 main() 会在 import 时执行，会触发 CLI 误跑。
 *   - checkChapter（检测工具/checkers.ts，CLI 树，Violation 类型也来自此）
 *   - computeTextStats（源码/checks/text-stats.ts，数值维度）
 *   - await checkSemanticSmoothness（源码/checks/check-semantic-smoothness.ts，①-C D-SMOOTH）
 *
 * 输出：health-matrix.json（每章归一化 violationCounts + 数值维度 + 平滑维度 + 双树总数）
 *
 * 使用约定（反向闭环基线保护，方案方 2026-08-26 提醒）：
 *   默认 --out 会**直接覆盖** health-matrix.json（这是 verify-regression 的基线快照）。
 *   若非刻意更新基线，务必用 --out 指定临时文件，避免误覆盖导致 delta 失真。例：
 *   npx tsx health-report.ts <chaptersDir> --out 检测工具/_tmp_matrix.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { check as runSourceTreeCheckRaw } from '../源码/checker.js';
import {
  DEFAULT_RADAR_WEIGHTS,
  type MergedConfig, type RuleViolation, type LLMProvider,
} from '../源码/types.js';
import { loadKbDefaultThresholds } from '../源码/kb-thresholds.js';
import { checkChapter, type Violation } from './checkers.js';
import { computeTextStats } from '../源码/checks/text-stats.js';
import { checkSemanticSmoothness } from '../源码/checks/check-semantic-smoothness.js';
import { OpenAICompatibleProvider } from '../源码/llm-provider.js';
import { loadLlmConfig } from './semantic-check.js';

// 双树桥接（复刻 check-chapter.ts 的 R1_MERGED_CONFIG，disabledChecks 空=不跳过任何检测器）
const R1_MERGED_CONFIG: MergedConfig = {
  thresholds: loadKbDefaultThresholds(),
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

function runSourceTreeCheck(text: string, targetWords?: number): Violation[] {
  try {
    const result = runSourceTreeCheckRaw(text, null, R1_MERGED_CONFIG, targetWords);
    return (result as unknown as { violations: Violation[] }).violations;
  } catch {
    return [];
  }
}

// ruleId 归一映射：双树同名/同义 -> 统一类别，避免阶段二重复计数
const RULE_ID_MAP: Record<string, string> = {
  comma_chain: 'comma_chain',
  comma_chain_dialogue: 'comma_chain',
  comma_chain_long: 'comma_chain',
  forbidden_char: 'forbidden_char',
  forbidden_char_dash: 'forbidden_char',
  character_voice: 'character_voice',
  action_rollcall: 'action_rollcall',
  exclamation_quota: 'exclamation_quota',
  not_shi_pattern: 'not_shi_pattern',
  sense_density_low: 'sense_density',
  sense_density_balance: 'sense_density',
  sense_tactile_below_visual: 'sense_density',
  data_anchor: 'data_anchor',
  data_anchor_low: 'data_anchor',
  data_anchor_high: 'data_anchor',
  sentence_waveform: 'sentence_waveform',
  sentence_waveform_same: 'sentence_waveform',
};

function normalizeRuleId(ruleId: string): string {
  return RULE_ID_MAP[ruleId] ?? ruleId;
}

interface SeverityCount { error: number; warning: number; info: number; }

function countBySeverity(violations: Array<{ severity: string }>): SeverityCount {
  const c: SeverityCount = { error: 0, warning: 0, info: 0 };
  for (const v of violations) {
    if (v.severity === 'error') c.error++;
    else if (v.severity === 'warning') c.warning++;
    else if (v.severity === 'info') c.info++;
  }
  return c;
}

function mergeViolationCounts(
  acc: Record<string, SeverityCount>,
  violations: Violation[],
): void {
  for (const v of violations) {
    const key = normalizeRuleId(v.ruleId);
    if (!acc[key]) acc[key] = { error: 0, warning: 0, info: 0 };
    if (v.severity === 'error') acc[key].error++;
    else if (v.severity === 'warning') acc[key].warning++;
    else if (v.severity === 'info') acc[key].info++;
  }
}

interface ChapterHealth {
  chapter: string;
  wordCount: number;
  dialogueRatio: number;
  sensoryMentions: Record<string, number>;
  anchorCount: number;
  fillerCount: number;
  violationCounts: Record<string, SeverityCount>;
  smoothness: SeverityCount;
  sourceTreeTotal: number;
  cliTreeTotal: number;
}

async function buildLlm(): Promise<LLMProvider | null> {
  const cfg = loadLlmConfig(process.cwd());
  if (!cfg.enabled) return null;
  return new OpenAICompatibleProvider({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, model: cfg.model });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let dir: string | undefined;
  let targetWords = 3000;
  let outPath = '检测工具/health-matrix.json';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' && i + 1 < args.length) { targetWords = parseInt(args[i + 1], 10); i++; }
    else if (args[i] === '--out' && i + 1 < args.length) { outPath = args[i + 1]; i++; }
    else if (!dir) { dir = args[i]; }
  }
  if (!dir) {
    console.error('usage: npx tsx health-report.ts <chaptersDir> [--target 3000] [--out health-matrix.json]');
    process.exit(1);
  }
  if (!fs.existsSync(dir)) { console.error('dir not found: ' + dir); process.exit(1); }

  const llm = await buildLlm();
  console.log('[stage-1] LLM smoothness: ' + (llm ? 'enabled(real call)' : 'disabled(smoothness empty, not a bug)'));

  const files = fs.readdirSync(dir)
    .filter(f => /^第.*章.*\.md$/.test(f) && !f.includes('指纹') && !f.includes('_archive'))
    .sort();

  if (files.length === 0) {
    console.error('no chapter .md found in ' + dir);
    process.exit(1);
  }

  const matrix: ChapterHealth[] = [];
  for (const f of files) {
    const fp = path.join(dir, f);
    const text = fs.readFileSync(fp, 'utf-8');
    const name = f.replace(/\.md$/, '');

    const sourceViolations = runSourceTreeCheck(text, targetWords);
    let cliViolations: Violation[] = [];
    try {
      const r = checkChapter(text, targetWords);
      cliViolations = r.violations;
    } catch (e) {
      console.warn('  warn: ' + name + ' CLI tree failed, skipped: ' + (e as Error).message);
    }
    const ts = computeTextStats(text);

    let smoothness: RuleViolation[] = [];
    try {
      smoothness = await checkSemanticSmoothness(text, llm);
    } catch (e) {
      console.warn('  warn: ' + name + ' D-SMOOTH failed, smoothness empty: ' + (e as Error).message);
      smoothness = [];
    }

    const violationCounts: Record<string, SeverityCount> = {};
    mergeViolationCounts(violationCounts, sourceViolations);
    mergeViolationCounts(violationCounts, cliViolations);

    matrix.push({
      chapter: name,
      wordCount: ts.totalWords,
      dialogueRatio: +ts.dialogueRatio.toFixed(3),
      sensoryMentions: ts.sensoryMentions,
      anchorCount: ts.anchorCount,
      fillerCount: ts.fillerCount,
      violationCounts,
      smoothness: countBySeverity(smoothness),
      sourceTreeTotal: sourceViolations.length,
      cliTreeTotal: cliViolations.length,
    });
    console.log('  ok ' + name + ' words=' + ts.totalWords + ' srcViol=' + sourceViolations.length + ' cliViol=' + cliViolations.length + ' smooth=' + smoothness.length);
  }

  fs.writeFileSync(outPath, JSON.stringify(matrix, null, 2), 'utf-8');
  console.log('\nhealth-matrix exported: ' + outPath + ' (' + matrix.length + ' chapters)');
}

main().catch(e => { console.error(e); process.exit(1); });
