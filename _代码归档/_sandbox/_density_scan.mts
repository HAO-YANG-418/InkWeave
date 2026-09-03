import * as fs from 'fs';
import { computeTextStats } from '../检测工具/checkers.ts';

const dir = '项目_裂日/章节';
const files = fs.readdirSync(dir)
  .filter(f => /^第\d+章.*\.md$/.test(f) && !f.endsWith('.backup'))
  .sort((a, b) => parseInt(a.match(/第(\d+)章/)![1], 10) - parseInt(b.match(/第(\d+)章/)![1], 10));

interface R { n: number; words: number; sensory: number; anchor: number; sPerK: number; aPerK: number; }
const rows: R[] = [];

for (const f of files) {
  const n = parseInt(f.match(/第(\d+)章/)![1], 10);
  const t = fs.readFileSync(dir + '/' + f, 'utf-8');
  const s = computeTextStats(t);
  const sm = s.sensoryMentions as any;
  const sensory = (sm.visual || 0) + (sm.auditory || 0) + (sm.tactile || 0) + (sm.olfactory || 0) + (sm.gustatory || 0);
  rows.push({
    n, words: s.totalWords, sensory, anchor: s.anchorCount,
    sPerK: s.totalWords > 0 ? +(1000 * sensory / s.totalWords).toFixed(1) : 0,
    aPerK: s.totalWords > 0 ? +(1000 * s.anchorCount / s.totalWords).toFixed(1) : 0,
  });
}

const pct = (arr: number[], p: number) => {
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.floor((a.length - 1) * p)];
};
const sK = rows.map(r => r.sPerK);
const aK = rows.map(r => r.aPerK);
const w = rows.map(r => r.words);

console.log('章数:', rows.length);
console.log('');
console.log('章 | 字数 | 五感 | 锚点 | 五感/千字 | 锚点/千字');
for (const r of rows) console.log(r.n + ' | ' + r.words + ' | ' + r.sensory + ' | ' + r.anchor + ' | ' + r.sPerK + ' | ' + r.aPerK);

console.log('');
console.log('=== 分布 ===');
console.log('字数:      min ' + Math.min(...w) + '  P10 ' + pct(w, .1) + '  P25 ' + pct(w, .25) + '  中位 ' + pct(w, .5) + '  P75 ' + pct(w, .75) + '  max ' + Math.max(...w));
console.log('五感/千字: min ' + Math.min(...sK) + '  P10 ' + pct(sK, .1) + '  P25 ' + pct(sK, .25) + '  中位 ' + pct(sK, .5) + '  P75 ' + pct(sK, .75) + '  max ' + Math.max(...sK));
console.log('锚点/千字: min ' + Math.min(...aK) + '  P10 ' + pct(aK, .1) + '  P25 ' + pct(aK, .25) + '  中位 ' + pct(aK, .5) + '  P75 ' + pct(aK, .75) + '  max ' + Math.max(...aK));

console.log('');
console.log('=== 现行规则（绝对值 sensory<3 && anchor<3）命中 ===');
console.log('被判 hollow 的章数: ' + rows.filter(r => r.sensory < 3 && r.anchor < 3).length + ' / ' + rows.length);

console.log('');
console.log('=== 低于 2700 字（ratio<0.9）的章 ===');
for (const r of rows.filter(r => r.words < 2700)) {
  console.log('ch' + r.n + ': ' + r.words + '字 (' + (100 * r.words / 3000).toFixed(0) + '%)  五感/千字=' + r.sPerK + '  锚点/千字=' + r.aPerK);
}

console.log('');
console.log('=== 候选阈值模拟（hollow = 五感/千字 < X && 锚点/千字 < Y）===');
for (const [X, Y] of [[15, 8], [20, 10], [25, 12], [30, 15]]) {
  const hit = rows.filter(r => r.sPerK < X && r.aPerK < Y);
  console.log('X=' + X + ' Y=' + Y + ' → 命中 ' + hit.length + ' 章' + (hit.length ? '：' + hit.map(r => 'ch' + r.n).join(',') : ''));
}
