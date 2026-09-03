import * as fs from 'fs';
import { computeTextStats, ParagraphType } from '../检测工具/checkers.ts';

const TEXTURE_WORDS = ['凉', '冷', '麻', '颤', '涩', '糙', '黏', '刺', '烫', '冰', '寒', '酸', '痒', '疼', '痛', '灼', '腻', '钝', '木', '僵', '酥'];

// 复用 CLI 树现成口径：stats.paragraphs 的 type 分类（与 checkCommaChain:289 同一写法）
function narrativeOnly(stats: any): string {
  return (stats.paragraphs as { type: ParagraphType; text: string }[])
    .filter(p => p.type === 'narrative')
    .map(p => p.text)
    .join('\n');
}

interface Hit { trig: boolean; word: string; cond1: boolean; cond2: boolean; top: number; rest: number; }
function evalTexture(text: string): Hit {
  const sentences = text.split(/[。！？；\n]+/).filter(s => s.trim().length > 0);
  const perSentence: string[][] = sentences.map(s => TEXTURE_WORDS.filter(w => s.includes(w)));
  const freq: Record<string, number> = {};
  for (const arr of perSentence) for (const w of arr) freq[w] = (freq[w] || 0) + 1;

  // 条件①：同一词在连续2句出现 且 全章>=4
  let cond1 = '';
  for (let i = 0; i < perSentence.length - 1 && !cond1; i++) {
    for (const w of perSentence[i]) {
      if (perSentence[i + 1].includes(w) && freq[w] >= 4) { cond1 = w; break; }
    }
  }
  // 条件②：某词全章>=6 且 > 其余总和
  const entries = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  let cond2 = '', topN = 0, restN = 0;
  if (entries.length >= 2) {
    const [tw, tc] = entries[0];
    const restSum = entries.slice(1).reduce((s, e) => s + e[1], 0);
    topN = tc; restN = restSum;
    if (tc >= 6 && tc > restSum) cond2 = tw;
  } else if (entries.length === 1) {
    topN = entries[0][1];
    if (topN >= 6) cond2 = entries[0][0];
  }
  const flagged = new Set([cond1, cond2].filter(Boolean));
  let word = '';
  if (flagged.size > 0) {
    word = entries.filter(e => flagged.has(e[0])).sort((a, b) => b[1] - a[1])[0][0];
  }
  return { trig: flagged.size > 0, word, cond1: !!cond1, cond2: !!cond2, top: topN, rest: restN };
}

const dir = '项目_裂日/章节';
const files = fs.readdirSync(dir)
  .filter(f => /^第\d+章.*\.md$/.test(f) && !f.endsWith('.backup'))
  .sort((a, b) => parseInt(a.match(/第(\d+)章/)![1], 10) - parseInt(b.match(/第(\d+)章/)![1], 10));

let fullHits = 0, narrHits = 0;
console.log('章 | 全文触发 | 触发词 | 叙述触发 | 触发词 | (叙述 top/其余)');
for (const f of files) {
  const n = parseInt(f.match(/第(\d+)章/)![1], 10);
  const t = fs.readFileSync(dir + '/' + f, 'utf-8');
  const stats = computeTextStats(t);
  const nf = evalTexture(t);
  const nt = evalTexture(narrativeOnly(stats));
  if (nf.trig) fullHits++;
  if (nt.trig) narrHits++;
  if (nf.trig || nt.trig) {
    console.log(n + ' | ' + (nf.trig ? '✅' : '—') + ' | ' + (nf.word || '-') +
      ' | ' + (nt.trig ? '✅' : '—') + ' | ' + (nt.word || '-') +
      ' | (' + nt.top + '/' + nt.rest + ')');
  }
}
console.log('');
console.log('章数 ' + files.length);
console.log('全文口径触发: ' + fullHits + ' 章');
console.log('叙述口径触发: ' + narrHits + ' 章');
console.log('→ 叙述口径净变化: ' + (narrHits - fullHits >= 0 ? '+' : '') + (narrHits - fullHits) + ' 章');
