// 实证体检：第17-26章 AI 味 / 空洞度 本地自检原型
// 对齐维度：火山引擎8维(lexical_diversity / sentence_length_variance / repetition_ngram / cliche_ratio / punctuation_rhythm / dialogue_ratio / sensory_emotion_density / semantic_smoothness) + 朱雀 burstiness
// perplexity 需语言模型，本原型不计算，标注待 detector。
import fs from 'fs';
import path from 'path';

const dir = 'C:/Users/admin/Desktop/写作引擎产品/InkWeave/项目_裂日/章节/';
const outDir = 'C:/Users/admin/Desktop/写作引擎产品/InkWeave/docs/方案与验收/';
const files = fs.readdirSync(dir);
const nums = [17,18,19,20,21,22,23,24,25,26];

// ---- AI 痕迹词表（来自朱雀/GPTZero/火山引擎调研）----
const TRANSITIONS = ['此外','与此同时','然而','不过','于是','接着','首先','其次','最后','值得一提的是','不难看出','众所周知','换言之','总的来说','事实上','显然','可以说','某种意义上','由此可见','不可否认','客观地说','平心而论','从某种角度','归根结底','毫无疑问','可以预见','值得注意的是','需要指出的是','与其说','不如说','一方面','另一方面','不仅如此','更重要的是','毋庸置疑','显然可见','不难看出'];
const CLICHES = ['不由得一愣','眉头紧锁','深吸一口气','嘴角微微上扬','眼神一凛','心中一紧','下意识地','不由得','不由自主','微微','缓缓','沉声','轻声','冷冷地','仿佛','似乎','像是','某种','难以言喻','说不清','一股','一种','莫名','油然而生','涌上心头','映入眼帘','萦绕','浮现','充斥','弥漫','不知何时','无形的','下意识'];
const SENSORY = ['看','听','闻','摸','尝','触','感','嗅','望','盯','听见','看到','闻到','触摸','冰冷','温热','刺骨','酸涩','甜','苦','辣','咸','红','绿','蓝','白','黑','光芒','阴影','心跳','呼吸','颤抖','刺痛','温暖','寒冷','气味','香味','声响','寂静','喧嚣','目光','指尖','掌心'];

function getFile(n){ return files.find(f => f.startsWith(`第${n}章`) && f.endsWith('.md')); }

function analyze(n){
  const fn = getFile(n);
  const raw = fs.readFileSync(path.join(dir, fn), 'utf-8');
  // 去 markdown 噪声：行首 #、> 引用、``` 代码块
  const body = raw.split('\n').filter(l => !/^\s*#/.test(l) && !/^\s*>/.test(l)).join('\n');
  const chars = [...body.replace(/\s/g, '')];
  const total = chars.length;
  // 分句
  const sentences = body.split(/[。！？!?；;…\n]+/).map(s => s.trim()).filter(s => s.length > 0);
  const sentLens = sentences.map(s => [...s.replace(/\s/g,'')].length).filter(l => l > 0);
  const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
  const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x-m)**2))); };
  const slMean = mean(sentLens), slStd = std(sentLens);
  // 词汇多样性（字级 + 2gram 级近似）
  const uniqChars = new Set(chars).size;
  const lexDiv = uniqChars / total;
  const grams2 = {};
  for(let i=0;i<chars.length-1;i++){ const g=chars[i]+chars[i+1]; grams2[g]=(grams2[g]||0)+1; }
  const uniq2 = Object.keys(grams2).length;
  const lexDiv2 = uniq2 / (total-1 || 1);
  // 连接词频率 /千字
  const transCount = TRANSITIONS.reduce((c,t)=> c + (body.split(t).length-1), 0);
  const transPerK = transCount / total * 1000;
  // 模板句 /千字
  const clicheCount = CLICHES.reduce((c,t)=> c + (body.split(t).length-1), 0);
  const clichePerK = clicheCount / total * 1000;
  // 3-gram 重复率
  const g3 = {}; let repChars = 0;
  for(let i=0;i<chars.length-2;i++){ const g=chars[i]+chars[i+1]+chars[i+2]; g3[g]=(g3[g]||0)+1; }
  for(const k in g3){ if(g3[k]>=2) repChars += (g3[k]-1)*3; }
  const repRate = repChars / total;
  // 标点节奏 CV
  const puncPos = [];
  for(let i=0;i<body.length;i++){ if('，。！？、；：“”‘’…—,.!?;:'.includes(body[i])) puncPos.push(i); }
  const gaps = [];
  for(let i=1;i<puncPos.length;i++) gaps.push(puncPos[i]-puncPos[i-1]);
  const prCV = gaps.length>1 ? std(gaps)/mean(gaps) : 0;
  // 对白比例
  const dialogueMatches = body.match(/"[^"]*"|'[^']*'|"[^"]*"|'[^']*'/g) || [];
  const dialogueChars = dialogueMatches.join('').replace(/\s/g,'').length;
  const dialogueRatio = dialogueChars / total;
  // 感官/情绪密度 /千字
  const sensCount = SENSORY.reduce((c,t)=> c + (body.split(t).length-1), 0);
  const sensPerK = sensCount / total * 1000;
  // notX 模式
  const notX = (body.match(/不是.{0,12}?(而是|是)/g) || []).length;
  // 破折号
  const dash = (body.match(/—/g) || []).length;
  // 排比：连续≥3句同前缀2字
  let parallel = 0;
  for(let i=2;i<sentences.length;i++){
    const a=[...sentences[i-2].replace(/\s/g,'')].slice(0,2).join('');
    const b=[...sentences[i-1].replace(/\s/g,'')].slice(0,2).join('');
    const c=[...sentences[i].replace(/\s/g,'')].slice(0,2).join('');
    if(a&&a===b&&b===c) parallel++;
  }
  // ---- 启发式 AI 味风险分 (0-100) ----
  // 各维度映射到 0-1 风险，加权求和
  const rBurst = Math.max(0, Math.min(1, (8 - slStd) / 8));        // 句长方差越低越 AI (<8 趋 AI)
  const rTrans = Math.max(0, Math.min(1, transPerK / 8));          // >8/千字 高风险
  const rCliche = Math.max(0, Math.min(1, clichePerK / 12));       // >12/千字 高风险
  const rRep = Math.max(0, Math.min(1, repRate / 0.15));           // 3gram重复>15% 高风险
  const rLex = Math.max(0, Math.min(1, (0.5 - lexDiv) / 0.5));      // 字多样<0.5 风险
  const risk = Math.round((rBurst*0.25 + rTrans*0.2 + rCliche*0.2 + rRep*0.2 + rLex*0.15) * 100);
  return { n, fn, total, sentCount: sentLens.length, slMean: +slMean.toFixed(1), slStd: +slStd.toFixed(2),
    lexDiv: +lexDiv.toFixed(3), lexDiv2: +lexDiv2.toFixed(3), transPerK: +transPerK.toFixed(2),
    clichePerK: +clichePerK.toFixed(2), repRate: +(repRate*100).toFixed(1), prCV: +prCV.toFixed(2),
    dialogueRatio: +(dialogueRatio*100).toFixed(1), sensPerK: +sensPerK.toFixed(1), notX, dash, parallel, risk };
}

const rows = nums.map(analyze);

// ---- 生成报告 ----
let md = '# InkWeave 实证体检 · 第17–26章 AI 味/空洞度基线（2026-08-22）\n\n';
md += '> 目的：用现有测验章节拿「治理前基线」，验证调研出的 AI 味特征是否在实战文本中真实存在；同时为检测侧新检测器（ai_flavored_pattern / emptiness_density）提供本地原型依据。\n';
md += '> 方法：本地规则化自检，对齐火山引擎 8 维 + 朱雀 burstiness。**perplexity 需语言模型，本原型不计算，待 detector 落地**。\n\n';
md += '## 维度说明（来自调研）\n';
md += '- **slStd（句长方差/burstiness）**：人类写作长短交错，AI 均匀。本原型 <8 趋 AI。\n';
md += '- **lexDiv / lexDiv2（词汇多样性）**：unique 字/2gram 占比，AI 偏低。\n';
md += '- **transPerK（连接词密度/千字）**：此外/然而/值得注意的是… AI 高频。\n';
md += '- **clichePerK（模板句密度/千字）**：眉头紧锁/深吸一口气/嘴角微微上扬… AI 安全表达。\n';
md += '- **repRate（3-gram 重复率%）**：短语复读，AI 重权重维度。\n';
md += '- **prCV（标点节奏变异）**：AI 标点分布过匀。\n';
md += '- **dialogueRatio（对白比例%）**：5–65% 自然，极端异常。\n';
md += '- **sensPerK（感官/情绪密度/千字）**：过低像说明书，过高刻意堆。\n';
md += '- **risk（AI 味风险分 0-100）**：上述加权启发式，越高越 AI 倾向。\n\n';
md += '## 逐章数据\n\n';
md += '| 章 | 字数 | 句数 | 句长方差 | 字多样 | 2gram多样 | 连接词/千 | 模板句/千 | 3gram重复% | 标点CV | 对白% | 感官/千 | notX | 破折号 | 排比 | risk |\n';
md += '|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|\n';
for(const r of rows){
  md += `| ${r.n} | ${r.total} | ${r.sentCount} | ${r.slStd} | ${r.lexDiv} | ${r.lexDiv2} | ${r.transPerK} | ${r.clichePerK} | ${r.repRate} | ${r.prCV} | ${r.dialogueRatio} | ${r.sensPerK} | ${r.notX} | ${r.dash} | ${r.parallel} | **${r.risk}** |\n`;
}
md += '\n## 汇总与判读\n';
const avg = k => (rows.reduce((s,r)=>s+r[k],0)/rows.length);
md += `- 平均字数：${Math.round(avg('total'))}（D4 门禁 2700；低于者为 ch${rows.filter(r=>r.total<2700).map(r=>r.n).join('/')}）\n`;
md += `- 平均句长方差 slStd：${avg('slStd').toFixed(2)}（人类参考 3.5±2.5；越低越 AI 倾向）\n`;
md += `- 平均连接词密度：${avg('transPerK').toFixed(2)}/千字（AI 倾向 >8）\n`;
md += `- 平均模板句密度：${avg('clichePerK').toFixed(2)}/千字（AI 倾向 >12）\n`;
md += `- 平均 3-gram 重复率：${avg('repRate').toFixed(1)}%（AI 倾向 >15%）\n`;
md += `- 平均 AI 味风险分：**${Math.round(avg('risk'))}**\n`;
const high = rows.filter(r=>r.risk>=50).map(r=>`ch${r.n}(${r.risk})`);
md += `- 高 AI 味风险章（risk≥50）：${high.length? high.join('、') : '无'}\n`;
md += '\n## 与「写空」缺陷的关联\n';
md += '- 字数<2700 的章（ch18/19/20/21/23/24/25）同时观察其 slStd / 感官密度：若句长方差低且感官密度低，说明「写空」= 概括式叙述多、缺乏具体细节铺陈，印证生成侧需「内容密度」铁则。\n';
md += '- 本基线将作为生成铁则改写（2.1）与检测侧新规则（2.2）落地后的**对比基准**。\n';
md += '\n## 限制\n';
md += '- perplexity 本原型未算（需语言模型）；朱雀在线工具未实跑（需登录/API，且中文检测准确率低于英文），故「AI 味」以可计算维度近似，非权威判定。\n';
md += '- 阈值（8/12/15% 等）为启发式初值，供 detector 落地参考，需经标注校准。\n';

fs.writeFileSync(path.join(outDir, 'InkWeave_实证体检_十章AI味基线_2026-08-22.md'), md, 'utf-8');
console.log('DONE. risk list:', rows.map(r=>`ch${r.n}:${r.risk}`).join(' '));
console.log('avg risk:', Math.round(avg('risk')), 'avg slStd:', avg('slStd').toFixed(2), 'avg trans/k:', avg('transPerK').toFixed(2), 'avg cliche/k:', avg('clichePerK').toFixed(2), 'avg rep%:', avg('repRate').toFixed(1));
