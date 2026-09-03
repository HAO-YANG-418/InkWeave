import * as fs from 'fs';
import { computeTextStats } from '../检测工具/checkers.ts';

const DIALOGUE_RE = /[""「」『』【】《》][^""「」『』【】《》]{1,}[""「」『』【】《》]/g;
const stripDialogue = (t: string) => t.replace(DIALOGUE_RE, '');

const dir = '项目_裂日/章节';
const files = fs.readdirSync(dir)
  .filter(f => /^第\d+章.*\.md$/.test(f) && !f.endsWith('.backup'))
  .sort((a, b) => parseInt(a.match(/第(\d+)章/)![1], 10) - parseInt(b.match(/第(\d+)章/)![1], 10));

interface R { n: number; wFull: number; wNarr: number; aFull: number; aNarr: number; aPerKFull: number; aPerKNarr: number; narrPct: number; }
const rows: R[] = [];

for (const f of files) {
  const n = parseInt(f.match(/第(\d+)章/)![1], 10);
  const t = fs.readFileSync(dir + '/' + f, 'utf-8');
  const tn = stripDialogue(t);
  const sf = computeTextStats(t);
  const sn = computeTextStats(tn);
  const wF = sf.totalWords, wN = sn.totalWords;
  rows.push({
    n, wFull: wF, wNarr: wN,
    aFull: sf.anchorCount, aNarr: sn.anchorCount,
    aPerKFull: wF > 0 ? +(1000 * sf.anchorCount / wF).toFixed(1) : 0,
    aPerKNarr: wN > 0 ? +(1000 * sn.anchorCount / wN).toFixed(1) : 0,
    narrPct: wF > 0 ? +(100 * wN / wF).toFixed(1) : 0,
  });
}

const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) * p)]; };
const aF = rows.map(r => r.aPerKFull), aN = rows.map(r => r.aPerKNarr);

console.log('章数: ' + rows.length);
console.log('');
console.log('章 | 全文字数 | 叙述字数 | 叙述% | 锚点(全文) | 锚点/千字(全文) | 锚点/千字(叙述)');
for (const r of rows) console.log(r.n + ' | ' + r.wFull + ' | ' + r.wNarr + ' | ' + r.narrPct + '% | ' + r.aFull + ' | ' + r.aPerKFull + ' | ' + r.aPerKNarr);

console.log('');
console.log('=== 锚点/千字 分布 ===');
console.log('全文口径: min ' + Math.min(...aF) + '  P10 ' + pct(aF, .1) + '  P25 ' + pct(aF, .25) + '  中位 ' + pct(aF, .5) + '  P75 ' + pct(aF, .75) + '  max ' + Math.max(...aF));
console.log('叙述口径: min ' + Math.min(...aN) + '  P10 ' + pct(aN, .1) + '  P25 ' + pct(aN, .25) + '  中位 ' + pct(aN, .5) + '  P75 ' + pct(aN, .75) + '  max ' + Math.max(...aN));
console.log('');
console.log('🔴 阈值 Y=12 是否可能成立？');
console.log('   全文口径 aPerK < 12 的章数: ' + aF.filter(x => x < 12).length);
console.log('   叙述口径 aPerK < 12 的章数: ' + aN.filter(x => x < 12).length);
console.log('   → 锚点/千字 全样本最小值 = ' + Math.min(...aN) + '（叙述口径）');
console.log('   → 结论: aPerK<12 ' + (Math.min(...aN) > 12 ? '永不成立 → && 永假 → 密度分支死代码 ✅ 代码方判断正确' : '可能成立'));
console.log('');
console.log('=== 对照：若改单条件 sPerK（叙述口径 P10=23.3）===');
for (const X of [20, 22, 23, 25]) {
  console.log('   sPerK<' + X + ' → 命中 ' + aN.filter(x => x < X).length + ' 章（此处用 aPerK 代算，仅示意）');
}
