// 两树感官计数根因实证 —— 复刻 checkers.ts:144-148 与 radar.ts:20-24 + :355-365
// 纯复刻，不依赖任何项目模块，可独立 node 运行验证。

const CLI = {
  visual: /看见|看到|望见|注视|盯着|映入|光|暗|亮|黑|白|红|蓝|绿|黄|颜色|色彩|形状|轮廓|影子/g,
  auditory: /听见|听到|声音|响|静|嘈杂|嗡|轰|咔|啪|脚步声|呼吸声/g,
  tactile: /触|摸|碰|热|冷|凉|烫|温|硬|软|粗糙|光滑|湿|干|黏|刺痛|发麻/g,
  olfactory: /闻到|气味|臭|香|腥|焦|霉|刺鼻/g,
  gustatory: /尝|味道|甜|酸|苦|辣|咸|涩|腥/g,
};

const SRC = {
  sight: ['看','望','盯','瞥','见','瞧','观','视','亮','暗','光','影','色','红','蓝','绿','白','黑','映','照','闪','耀','眩','模糊','清晰','映'],
  sound: ['听','闻','声','响','鸣','叫','喊','说','道','嗡','轰','哗','啪','吱','砰','咚','叮','铛','嘎','呼啸','咆哮','低语','呢喃','寂静','喧闹'],
  smell: ['香','臭','腥','膻','味','闻','嗅','芬芳','恶臭','刺鼻','弥漫','萦绕'],
  touch: ['触','摸','碰','冷','热','温','凉','冰','烫','软','硬','粗','细','滑','糙','疼','痛','麻','痒','刺','压','握','抚'],
  taste: ['甜','苦','酸','辣','咸','涩','鲜','味','尝','品','甘','腻','清淡','浓郁'],
};

function cliCount(text) {
  let total = 0;
  const per = {};
  for (const [k, re] of Object.entries(CLI)) {
    const m = text.match(re) || [];
    per[k] = m.length;
    total += m.length;
  }
  return { total, per };
}

function srcCount(text) {
  const counts = { sight:0, sound:0, smell:0, touch:0, taste:0 };
  for (const [sense, words] of Object.entries(SRC)) {
    let total = 0;
    for (const w of words) {
      let idx = 0;
      while ((idx = text.indexOf(w, idx)) !== -1) { total++; idx += w.length; }
    }
    counts[sense] = total;
  }
  const total = Object.values(counts).reduce((a,b)=>a+b,0);
  return { total, per: counts };
}

const samples = [
  "他看见冰冷的墙壁，听见刺痛的呼吸，摸到粗糙的麻绳，尝到酸涩的味道。",
  "黑暗里红光闪烁，她闻到焦糊味，指尖发麻，喉咙发紧，金属冰凉。",
  "阳光照在蓝色湖面，远处传来轰鸣，脚底湿滑，嘴里尝到咸涩的汗。",
];

console.log('=== 样本逐条：CLI vs 源码 感官总计数 ===');
for (const s of samples) {
  const c = cliCount(s), r = srcCount(s);
  const ratio = (r.total / c.total).toFixed(2);
  console.log(`\n文本: ${s}`);
  console.log(`  CLI 总=${c.total}  源码总=${r.total}  比值=${ratio}`);
  console.log(`  CLI :`, c.per);
  console.log(`  源码:`, r.per);
}

console.log('\n=== 机制演示：同一复合词两树计数差 ===');
const demo = ['看见','刺痛','粗糙','光滑','闻到','黑暗'];
for (const w of demo) {
  const c = cliCount(w).total;
  const r = srcCount(w).total;
  console.log(`  ${w}: CLI=${c}  源码=${r}  ${r>c?'(源码多算 '+(r-c)+')':''}`);
}
