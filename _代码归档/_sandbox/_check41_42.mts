import * as fs from 'fs';
import * as path from 'path';
import { checkTextureVariety } from '../检测工具/checkers.ts';

const DIR = path.join('项目_裂日', '章节');
const DIALOGUE_RE = /[""「」『』【】《》][^""「」『』【】《》]{1,}[""「」『』【】《》]/g;
const strip = (t: string) => t.replace(DIALOGUE_RE, '');

const count = (t: string, re: RegExp) => (t.match(re) || []).length;
const cjk = (t: string) => count(t, /[\u4e00-\u9fff]/g);

for (const n of [41, 42, 43]) {
  const f = fs.readdirSync(DIR).find(x => x.startsWith(`第${n}章`) && x.endsWith('.md') && !x.endsWith('.backup'))!;
  const text = fs.readFileSync(path.join(DIR, f), 'utf-8');
  const narr = strip(text);

  const qFull = count(text, /[""「」『』【】《》]/g);
  const qNarr = count(narr, /[""「」『』【】《》]/g);
  const tvFull = checkTextureVariety(text);
  const tvNarr = checkTextureVariety(narr);

  console.log('\n=== ch' + n + ' (' + f + ') ===');
  console.log('引号字符数：全文 ' + qFull + ' → 剥对话后 ' + qNarr + '  (剥离率 ' + ((1 - qNarr / Math.max(qFull, 1)) * 100).toFixed(0) + '%)');
  console.log('字数：全文 ' + cjk(text) + ' → 叙述 ' + cjk(narr));
  console.log('凉：全文 ' + count(text, /凉/g) + ' → 叙述 ' + count(narr, /凉/g));
  console.log('疼：全文 ' + count(text, /疼/g) + ' → 叙述 ' + count(narr, /疼/g));
  console.log('texture_variety 违规：全文 ' + tvFull.length + ' 条 → 叙述 ' + tvNarr.length + ' 条');
  for (const v of tvFull) console.log('   全文触发：' + v.message.slice(0, 70));
  for (const v of tvNarr) console.log('   叙述触发：' + v.message.slice(0, 70));
}
