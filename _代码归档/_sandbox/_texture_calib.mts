import * as fs from 'fs';
import { computeTextStats, ParagraphType } from '../检测工具/checkers.ts';

const TW = ['凉', '冷', '麻', '颤', '涩', '糙', '黏', '刺', '烫', '冰', '寒', '酸', '痒', '疼', '痛', '灼', '腻', '钝', '木', '僵', '酥'];

interface D {
  n: number; words: number; narrWords: number;
  freq: Record<string, number>; sentences: number;
  w1: string; w2: string; top: number; rest: number;
}

function build(text: string, narr: string, n: number): D {
  const sentences = narr.split(/[。！？；\n]+/).filter(s => s.trim().length > 0);
  const per = sentences.map(s => TW.filter(w => s.includes(w)));
  const freq: Record<string, number> = {};
  for (const arr of per) for (const w of arr) freq[w] = (freq[w] || 0) + 1;
  // 条件①：连续2句同词 且 全章>=4
  let w1 = '';
  outer: for (let i = 0; i < per.length - 1; i++) {
    for (const w of per[i]) if (per[i + 1].includes(w) && freq[w] >= 4) { w1 = w; break outer; }
  }
  const entries = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  let w2 = '', top = 0, rest = 0;
  if (entries.length >= 1) { top = entries[0][1]; rest = entries.slice(1).reduce((s, e) => s + e[1], 0); }
  if (entries.length >= 2 && top >= 6 && top > rest) w2 = entries[0][0];
  else if (entries.length === 1 && top >= 6) w2 = entries[0][0];
  return { n, words: (text.match(/[\u4e00-\u9fff]/g) || []).length, narrWords: (narr.match(/[\u4e00-\u9fff]/g) || []).length, freq, sentences: sentences.length, w1, w2, top, rest };
}

const dir = '项目_裂日/章节';
const files = fs.readdirSync(dir)
  .filter(f => /^第\d+章.*\.md$/.test(f) && !f.endsWith('.backup'))
  .sort((a, b) => parseInt(a.match(/第(\d+)章/)![1], 10) - parseInt(b.match(/第(\d+)章/)![1], 10));

const rows: D[] = [];
for (const f of files) {
  const n = parseInt(f.match(/第(\d+)章/)![1], 10);
  const t = fs.readFileSync(dir + '/' + f, 'utf-8');
  const st = computeTextStats(t);
  const narr = (st.paragraphs as { type: ParagraphType; text: string }[]).filter(p => p.type === 'narrative').map(p => p.text).join('\n');
  rows.push(build(t, narr, n));
}

console.log('=== A. 叙述口径逐章明细（仅列 top>=3 的章）===');
console.log('章 | 叙述字数 | 叙述句数 | TOP词(句数) | 其余和 | 条件① | 条件②');
for (const r of rows) {
  const e = Object.entries(r.freq).sort((a, b) => b[1] - a[1]);
  if (!e.length || e[0][1] < 3) continue;
  console.log(r.n + ' | ' + r.narrWords + ' | ' + r.sentences + ' | ' + e[0][0] + '(' + e[0][1] + ') | ' + r.rest +
    ' | ' + (r.w1 ? '①' + r.w1 : '—') + ' | ' + (r.w2 ? '②' + r.w2 : '—'));
}

console.log('');
console.log('=== B. 触发词排名（叙述口径，作为 TOP 词出现的次数）===');
const rank: Record<string, number> = {};
for (const r of rows) {
  const e = Object.entries(r.freq).sort((a, b) => b[1] - a[1]);
  if (e.length) rank[e[0][0]] = (rank[e[0][0]] || 0) + 1;
}
console.log(Object.entries(rank).sort((a, b) => b[1] - a[1]).map(([w, c]) => w + ':' + c + '章').join('  '));

console.log('');
console.log('=== C. 阈值敏感性（叙述口径）===');
// 条件①: freq阈值 F；条件②: top阈值 T
for (const [F, T] of [[4, 6], [5, 6], [6, 6], [4, 8], [5, 8], [6, 8], [5, 10], [6, 10]]) {
  let c1 = 0, c2 = 0, both = 0;
  for (const r of rows) {
    const sentences = r.sentences; // 仅用于显示
    let h1 = false, h2 = false;
    // 重算条件①
    const txt = ''; // 需要原文，改用存储的 freq 不够——用 rows 里的 w1 依赖 F=4，故此处重放
    h1 = r.w1 !== '' && Object.entries(r.freq).some(([w, c]) => c >= F && r.w1 === w);
    h2 = r.top >= T && r.top > r.rest;
    if (h1) c1++; if (h2) c2++; if (h1 || h2) both++;
  }
  console.log('F=' + F + ' T=' + T + ' → 条件①命中 ' + c1 + ' / 条件②命中 ' + c2 + ' / 合并触发 ' + both + ' 章');
}

console.log('');
console.log('=== D. 「凉」专项：把凉从词表排除后的命中变化（T=6,F=4）===');
let withLiang = 0, withoutLiang = 0;
for (const r of rows) {
  const e = Object.entries(r.freq).sort((a, b) => b[1] - a[1]);
  if (r.w1 || r.w2) withLiang++;
  const f2 = { ...r.freq }; delete f2['凉'];
  const e2 = Object.entries(f2).sort((a, b) => b[1] - a[1]);
  let hit = false;
  if (r.w1 && r.w1 !== '凉') hit = true;
  if (e2.length >= 2 && e2[0][1] >= 6 && e2[0][1] > e2.slice(1).reduce((s, x) => s + x[1], 0)) hit = true;
  else if (e2.length === 1 && e2[0][1] >= 6) hit = true;
  if (hit) withoutLiang++;
}
console.log('含凉: ' + withLiang + ' 章  →  排除凉: ' + withoutLiang + ' 章 （净 ' + (withoutLiang - withLiang) + '）');
console.log('→ 即 ' + withLiang + ' 章触发中有 ' + (withLiang - withoutLiang) + ' 章是「凉」单独造成的');
