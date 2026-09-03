import * as fs from 'fs';
import { check } from '../源码/checker.ts';
import { DEFAULT_THRESHOLDS, DEFAULT_RADAR_WEIGHTS, MergedConfig } from '../源码/types.ts';
import { computeTextStats } from '../检测工具/checkers.ts';

const R1: MergedConfig = {
  thresholds: DEFAULT_THRESHOLDS,
  radarWeights: DEFAULT_RADAR_WEIGHTS,
  vocabulary: {
    bodyParts: new Set(), sensoryVerbs: new Set(), environmentSignals: new Set(),
    actionVerbs: new Set(), fillerPatterns: new Set(), dialogueTags: new Set(), worldTerms: new Set(),
  },
  systemPrompts: [], constraints: [], examples: [],
  extraRules: [], disabledChecks: new Set<string>(), enabledChecks: new Set<string>(),
};

const dir = '项目_裂日/章节';
const files = fs.readdirSync(dir)
  .filter(f => /^第\d+章.*\.md$/.test(f) && !f.endsWith('.backup'))
  .sort((a, b) => parseInt(a.match(/第(\d+)章/)![1], 10) - parseInt(b.match(/第(\d+)章/)![1], 10));

interface R { n: number; w: number; srcSensory: number; srcPerK: number; cliSensory: number; cliPerK: number; ratio: number; }
const rows: R[] = [];

for (const f of files) {
  const n = parseInt(f.match(/第(\d+)章/)![1], 10);
  const t = fs.readFileSync(dir + '/' + f, 'utf-8');
  // 源码树口径
  const r = check(t, null, R1, 3000);
  const sm = (r.stats as any).sensoryMentions;
  const srcSensory = (sm.sight || 0) + (sm.sound || 0) + (sm.smell || 0) + (sm.touch || 0) + (sm.taste || 0);
  const w = r.stats.totalWords;
  // CLI 口径
  const cs = computeTextStats(t);
  const cm = cs.sensoryMentions as any;
  const cliSensory = (cm.visual || 0) + (cm.auditory || 0) + (cm.tactile || 0) + (cm.olfactory || 0) + (cm.gustatory || 0);
  rows.push({
    n, w, srcSensory,
    srcPerK: w > 0 ? +(1000 * srcSensory / w).toFixed(1) : 0,
    cliSensory,
    cliPerK: cs.totalWords > 0 ? +(1000 * cliSensory / cs.totalWords).toFixed(1) : 0,
    ratio: cliSensory > 0 ? +(srcSensory / cliSensory).toFixed(2) : 0,
  });
}

const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) * p)]; };
const sK = rows.map(r => r.srcPerK), cK = rows.map(r => r.cliPerK), rt = rows.map(r => r.ratio);

console.log('章数: ' + rows.length);
console.log('');
console.log('章 | 字数 | 源码五感 | 源码/千字 | CLI五感 | CLI/千字 | 源码÷CLI');
for (const r of rows) console.log(r.n + ' | ' + r.w + ' | ' + r.srcSensory + ' | ' + r.srcPerK + ' | ' + r.cliSensory + ' | ' + r.cliPerK + ' | ' + r.ratio);

console.log('');
console.log('=== 分布对比 ===');
console.log('源码树 五感/千字: min ' + Math.min(...sK) + '  P10 ' + pct(sK, .1) + '  P25 ' + pct(sK, .25) + '  中位 ' + pct(sK, .5) + '  P75 ' + pct(sK, .75) + '  max ' + Math.max(...sK));
console.log('CLI树  五感/千字: min ' + Math.min(...cK) + '  P10 ' + pct(cK, .1) + '  P25 ' + pct(cK, .25) + '  中位 ' + pct(cK, .5) + '  P75 ' + pct(cK, .75) + '  max ' + Math.max(...cK));
console.log('');
console.log('源码÷CLI 倍数:    min ' + Math.min(...rt) + '  P25 ' + pct(rt, .25) + '  中位 ' + pct(rt, .5) + '  P75 ' + pct(rt, .75) + '  max ' + Math.max(...rt));
console.log('倍数中位数 = ' + pct(rt, .5));

console.log('');
console.log('=== 阈值换算（把 CLI 口径的 25 换算到源码树口径）===');
const med = pct(rt, .5);
console.log('CLI sPerK<25  →  源码树等价阈值 ≈ 25 × ' + med + ' = ' + (25 * med).toFixed(1));
console.log('');
console.log('=== 若源码树沿用 sPerK<25，有多少章会被判"空心" ===');
for (const X of [25, 30, 40, 45, 50]) {
  const hit = rows.filter(r => r.srcPerK < X);
  console.log('阈值 ' + X + ' → 命中 ' + hit.length + ' 章' + (hit.length ? '：' + hit.map(r => 'ch' + r.n).join(',') : ''));
}
