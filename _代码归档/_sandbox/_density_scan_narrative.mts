// ============================================================
// 叙述口径密度扫描（代码方产出，供方案方标定用）
// 背景：p.type === 'narrative' 在代码中不存在（TextStats 只有 paragraphCount）。
// 可行机制：复用 checker.ts:354 的 dialogueRegex，在统计前把引号内对话整段剥离（text-level mask）。
// 输出：全 47 章「全文口径」vs「叙述口径」密度分布 + 跑量十章明细 + 2100-2700 区间明细
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { checkChapter } from '../检测工具/checkers.ts';
import { check as srcCheck } from '../源码/checker.ts';
import { DEFAULT_THRESHOLDS, DEFAULT_RADAR_WEIGHTS, MergedConfig } from '../源码/types.ts';

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

// 复用源码树 checker.ts:354 的对话口径（与 TextStats.dialogueRatio 一致）
const DIALOGUE_RE = /[""「」『』【】《》][^""「」『』【】《》]{1,}[""「」『』【】《》]/g;
function stripDialogue(text: string): string {
  return text.replace(DIALOGUE_RE, '');
}

const CHAPTERS_DIR = path.join('项目_裂日', '章节');
const CLI_SENSE = ['visual', 'auditory', 'tactile', 'olfactory', 'gustatory'];
const SRC_SENSE = ['sight', 'sound', 'smell', 'touch', 'taste'];

interface Row {
  ch: number;
  wordsFull: number;
  wordsNarr: number;
  narrRatio: number;        // 叙述字数占比
  cliSFull: number; cliANarr: number;
  cliSF: number; cliAF: number;     // CLI 全文：五感/锚点
  cliSN: number; cliAN: number;     // CLI 叙述：五感/锚点
  srcSF: number; srcAF: number;     // 源码 全文
  srcSN: number; srcAN: number;     // 源码 叙述
  cliSPerK_F: number; cliSPerK_N: number;
  cliAPerK_F: number; cliAPerK_N: number;
  srcSPerK_F: number; srcSPerK_N: number;
  srcAPerK_F: number; srcAPerK_N: number;
}

function sumSensory(sm: Record<string, number>, keys: string[]): number {
  return keys.reduce((a, k) => a + (sm[k] || 0), 0);
}

function pct(a: number, b: number): number { return b > 0 ? (1000 * a) / b : 0; }

function resolve(n: number): string | null {
  const f = fs.readdirSync(CHAPTERS_DIR).filter(x => x.startsWith(`第${n}章`) && x.endsWith('.md') && !x.endsWith('.backup'));
  return f.length ? path.join(CHAPTERS_DIR, f[0]) : null;
}

const rows: Row[] = [];
for (let n = 1; n <= 47; n++) {
  const fp = resolve(n);
  if (!fp) continue;
  const text = fs.readFileSync(fp, 'utf-8');
  const narr = stripDialogue(text);

  const cliF = checkChapter(text, 3000, '林深').stats;
  const cliN = checkChapter(narr, 3000, '林深').stats;
  const srcF = srcCheck(text, null, R1_MERGED_CONFIG, 3000).stats;
  const srcN = srcCheck(narr, null, R1_MERGED_CONFIG, 3000).stats;

  const wF = cliF.totalWords, wN = cliN.totalWords;
  rows.push({
    ch: n,
    wordsFull: wF,
    wordsNarr: wN,
    narrRatio: wF > 0 ? wN / wF : 0,
    cliSFull: 0, cliANarr: 0,
    cliSF: sumSensory(cliF.sensoryMentions, CLI_SENSE), cliAF: cliF.anchorCount,
    cliSN: sumSensory(cliN.sensoryMentions, CLI_SENSE), cliAN: cliN.anchorCount,
    srcSF: sumSensory(srcF.sensoryMentions, SRC_SENSE), srcAF: srcF.anchorCount,
    srcSN: sumSensory(srcN.sensoryMentions, SRC_SENSE), srcAN: srcN.anchorCount,
    cliSPerK_F: pct(sumSensory(cliF.sensoryMentions, CLI_SENSE), wF),
    cliSPerK_N: pct(sumSensory(cliN.sensoryMentions, CLI_SENSE), wN),
    cliAPerK_F: pct(cliF.anchorCount, wF),
    cliAPerK_N: pct(cliN.anchorCount, wN),
    srcSPerK_F: pct(sumSensory(srcF.sensoryMentions, SRC_SENSE), wF),
    srcSPerK_N: pct(sumSensory(srcN.sensoryMentions, SRC_SENSE), wN),
    srcAPerK_F: pct(srcF.anchorCount, wF),
    srcAPerK_N: pct(srcN.anchorCount, wN),
  });
}

// ---- 分位数 ----
function q(vals: number[], p: number): number {
  const s = [...vals].sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[i];
}
function dist(vals: number[]) {
  return { min: q(vals, 0), p10: q(vals, 10), med: q(vals, 50), p90: q(vals, 90), max: q(vals, 100) };
}
function f(x: number) { return x.toFixed(1); }
function show(name: string, vals: number[]) {
  const d = dist(vals);
  console.log(`| ${name} | ${f(d.min)} | ${f(d.p10)} | ${f(d.med)} | ${f(d.p90)} | ${f(d.max)} |`);
}

const pick = (k: keyof Row) => rows.map(r => r[k] as number);

console.log('# 叙述口径密度扫描（全 ' + rows.length + ' 章）\n');
console.log('> 机制：复用 checker.ts:354 dialogueRegex 剥离引号内对话后重算（text-level mask，非 per-paragraph type）。');
console.log('> 注：该 regex 含 【】《》，若正文用其标注书名/系统提示会被一并剥离，属现成口径的已知偏差。\n');

console.log('## 一、两种口径密度分布（每千字）\n');
console.log('| 口径 | min | P10 | 中位 | P90 | max |');
console.log('|---|---|---|---|---|---|');
show('CLI 五感/千字（全文）', pick('cliSPerK_F'));
show('CLI 五感/千字（**叙述**）', pick('cliSPerK_N'));
show('CLI 锚点/千字（全文）', pick('cliAPerK_F'));
show('CLI 锚点/千字（**叙述**）', pick('cliAPerK_N'));
show('源码 五感/千字（全文）', pick('srcSPerK_F'));
show('源码 五感/千字（**叙述**）', pick('srcSPerK_N'));
show('源码 锚点/千字（全文）', pick('srcAPerK_F'));
show('源码 锚点/千字（**叙述**）', pick('srcAPerK_N'));

console.log('\n## 二、叙述字数占比\n');
show('叙述占比 %', rows.map(r => r.narrRatio * 100));

console.log('\n## 三、跑量十章（38–47）明细\n');
console.log('| 章 | 全文字数 | 叙述字数 | 叙述占比 | CLI五感/千(全文) | CLI五感/千(叙述) | 源码五感/千(全文) | 源码五感/千(叙述) |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of rows.filter(r => r.ch >= 38 && r.ch <= 47)) {
  console.log(`| ${r.ch} | ${r.wordsFull} | ${r.wordsNarr} | ${f(r.narrRatio * 100)}% | ${f(r.cliSPerK_F)} | ${f(r.cliSPerK_N)} | ${f(r.srcSPerK_F)} | ${f(r.srcSPerK_N)} |`);
}

console.log('\n## 四、重点章对照（ch41 对话密集 / ch42 texture 误伤章）\n');
console.log('| 章 | 全文字数 | 叙述占比 | CLI五感/千(全文→叙述) | 源码五感/千(全文→叙述) |');
console.log('|---|---|---|---|---|');
for (const r of rows.filter(r => [41, 42, 43, 44].includes(r.ch))) {
  console.log(`| ${r.ch} | ${r.wordsFull} | ${f(r.narrRatio * 100)}% | ${f(r.cliSPerK_F)} → **${f(r.cliSPerK_N)}** | ${f(r.srcSPerK_F)} → **${f(r.srcSPerK_N)}** |`);
}

console.log('\n## 五、密度豁免区（2100–2700 字）章节的叙述口径密度\n');
console.log('> 这是源码树 R4「0.7–0.9 密度豁免」分支真正作用的群体。\n');
console.log('| 章 | 全文字数 | CLI五感/千(叙述) | 源码五感/千(叙述) | CLI锚点/千(叙述) | 源码锚点/千(叙述) |');
console.log('|---|---|---|---|---|---|');
const band = rows.filter(r => r.wordsFull >= 2100 && r.wordsFull < 2700);
for (const r of band) {
  console.log(`| ${r.ch} | ${r.wordsFull} | ${f(r.cliSPerK_N)} | ${f(r.srcSPerK_N)} | ${f(r.cliAPerK_N)} | ${f(r.srcAPerK_N)} |`);
}
console.log(`\n区间章数：${band.length}`);

console.log('\n## 六、候选阈值命中模拟（叙述口径，CLI 五感/千字 < X && CLI 锚点/千字 < Y）\n');
console.log('| X | Y | 全文口径命中 | 叙述口径命中 |');
console.log('|---|---|---|---|');
for (const [X, Y] of [[15, 8], [20, 10], [25, 12], [30, 15], [35, 18], [40, 20]]) {
  const full = rows.filter(r => r.cliSPerK_F < X && r.cliAPerK_F < Y);
  const narr = rows.filter(r => r.cliSPerK_N < X && r.cliAPerK_N < Y);
  console.log(`| ${X} | ${Y} | ${full.length} 章 | ${narr.length} 章 |`);
}
