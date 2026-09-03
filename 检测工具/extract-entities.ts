/**
 * InkWeave 事实指纹抽取模块 v5.0（P1 · 长程叙事一致性）
 *
 * 纯规则、确定性抽取——不依赖 LLM，避免长文成本高/不稳。
 *
 * 输入：本章正文 + 项目设定（角色档案.md / 世界观设定.md）
 * 输出：ChapterFact（事实指纹），供下一章跨章事实校验 + pre-analysis 注入
 *
 * 设计原则：
 *   - 宁缺毋滥：抓不到就返回空，绝不编造（避免误杀真实写作）。
 *   - 角色名/设定词从「项目设定档案」抽取，比从正文猜确定性强得多。
 *   - 时间锚/伏笔从正文规则抓，warning 级，仅作提醒。
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ChapterFact {
  chapterName: string;
  /** 本章出场角色（来自设定档案的已知角色，出现在正文中的） */
  characters: { name: string; present: boolean; stateHints: string[] }[];
  /** 时间锚：本章明确的时间信号 */
  timeAnchors: string[];
  /** 专有名词/设定词候选（来自设定档案 + 正文大写异常词） */
  properNouns: string[];
  /** 未回收伏笔候选（铁则十假钩子句型 + 秘密/未知句式） */
  pendingForeshadow: string[];
  /** 数值锚（正文中的具体数字+单位，用于跨章数值一致性） */
  numericAnchors: { raw: string; value: number; unit?: string }[];
  /** P2 角色声音指纹：每个出场角色的口头禅/语气词（跨章稳定即"独一声"） */
  voicePrints?: { name: string; tics: string[] }[];
}

// —— 设定档案解析：抓角色名 ——
function extractCharacterNamesFromProfile(profileText: string): string[] {
  const names = new Set<string>();
  // 匹配「主角：林深」「配角1：周野」「班主任·陈老师」等
  const headingRe = /(?:主角|配角\s*\d+|反派|重要角色)\s*[：:]\s*([\u4e00-\u9fff]{1,6})/g;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(profileText)) !== null) {
    names.add(m[1].trim());
  }
  return [...names];
}

// —— 设定档案解析：抓设定专有名词（世界观设定.md 中的特殊名词）——
function extractProperNounsFromProfile(worldText: string): string[] {
  const nouns = new Set<string>();
  // 大写字母开头的西文/拼音专名 + 中文「XX（英文/拼音）」型 + 书名/体系名带引号或特殊符号
  const capsRe = /[A-Z][A-Za-z]{2,}/g;
  let m: RegExpExecArray | null;
  while ((m = capsRe.exec(worldText)) !== null) {
    // 过滤常见英文单词，只取疑似专名（长度>=4 或 含连续大写）
    const w = m[0];
    if (/[A-Z]{2,}/.test(w) || w.length >= 4) nouns.add(w);
  }
  // 中文特殊名词：带「·」或「『』」或全大写拼音
  const cnSpecialRe = /[『「][^『「」』]{2,8}[』」]/g;
  while ((m = cnSpecialRe.exec(worldText)) !== null) {
    nouns.add(m[0].replace(/[『「」』]/g, ''));
  }
  return [...nouns];
}

// —— 正文时间锚 ——
const TIME_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /第\s*([一二三四五六七八九十\d]+)\s*日/g, label: '第N日' },
  { re: /凌晨\s*\d*\s*点?/g, label: '凌晨' },
  { re: /清晨|拂晓|天刚亮|天亮/g, label: '清晨' },
  { re: /上午|早上|正午|中午/g, label: '上午' },
  { re: /下午|傍晚|黄昏|日落/g, label: '下午' },
  { re: /夜晚|夜里|深夜|午夜|半夜|入夜/g, label: '夜晚' },
  { re: /(\d+)\s*点\s*(\d+)?\s*分?/g, label: '时刻' },
  { re: /过了\s*\d+\s*(小时|天|分钟|刻)/g, label: '时长' },
];

// —— 正文数值锚（数字+单位，过滤纯序号）——
const NUMERIC_RE = /(\d{2,})(%|个|名|岁|年|月|天|日|小时|分钟|米|厘米|公里|度|人|次|层|级|章|页|行)/g;

// —— 伏笔候选：铁则十已禁假钩子 + 秘密/未知句式 ——
const FORESHADOW_PATTERNS: RegExp[] = [
  /他还(不知道|没(有)?(说|告诉|意识到|明白))/g,
  /没人(告诉|知道|告诉过)他/g,
  /(这个|那)秘密/g,
  /(藏|瞒)着(什么|一个?秘密|没?告诉)/g,
  /(真相|实情)是/g,
  /(其实|原来).{0,12}(不是|是.{0,8}的)/g,
];

export function extractChapterFacts(
  text: string,
  opts?: { profileText?: string; worldText?: string; chapterName?: string }
): ChapterFact {
  const profileText = opts?.profileText || '';
  const worldText = opts?.worldText || '';
  const chapterName = opts?.chapterName || '';

  // 1. 角色：设定档案已知角色，出现在正文中才算 present
  // 中文无词边界，角色名来自设定档案、唯一性强，直接用 includes 判断出场（避免边界误判漏报）
  const knownChars = extractCharacterNamesFromProfile(profileText);
  const characters = knownChars.map(name => {
    const present = text.includes(name);
    return { name, present, stateHints: [] as string[] };
  });

  // 2. 时间锚
  const timeAnchors: string[] = [];
  for (const { re } of TIME_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      timeAnchors.push(m[0]);
    }
  }

  // 3. 专有名词：设定档案 + 正文大写专名
  const properNouns = new Set(extractProperNounsFromProfile(worldText));
  const capsInText = new Set<string>();
  const capsRe = /[A-Z][A-Za-z]{2,}/g;
  let cm: RegExpExecArray | null;
  while ((cm = capsRe.exec(text)) !== null) {
    if (/[A-Z]{2,}/.test(cm[0]) || cm[0].length >= 4) capsInText.add(cm[0]);
  }
  for (const c of capsInText) properNouns.add(c);

  // 4. 数值锚
  const numericAnchors: ChapterFact['numericAnchors'] = [];
  NUMERIC_RE.lastIndex = 0;
  let nm: RegExpExecArray | null;
  while ((nm = NUMERIC_RE.exec(text)) !== null) {
    numericAnchors.push({ raw: nm[0], value: parseInt(nm[1], 10), unit: nm[2] });
  }

  // 5. 伏笔候选
  const pendingForeshadow: string[] = [];
  for (const re of FORESHADOW_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      // 取命中处前后 8 字作为上下文片段
      const start = Math.max(0, m.index - 8);
      const end = Math.min(text.length, m.index + m[0].length + 8);
      pendingForeshadow.push(text.slice(start, end).replace(/\s+/g, ''));
    }
  }

  // 6. P2 角色声音指纹：为出场角色抓口头禅（语气词/惯用语），跨章稳定即"独一声"
  // 轻量策略：扫描全章引号内台词，统计常见口头禅命中；若某 present 角色附近有对话则归属其 tic 池。
  const VOICE_TICS = ['啦', '呗', '嘛', '哈', '嗯', '呢', '吧', '呃', '切', '啧', '哟', '哎', '喂', '靠', '操', '才怪', '也就是说', '说白了', '反正'];
  const voicePrints: { name: string; tics: string[] }[] = [];
  const quoteSegments = text.split(/[「"']/).filter((_, i) => i % 2 === 1); // 引号内片段
  const ticsInChapter = new Set<string>();
  for (const seg of quoteSegments) {
    for (const tic of VOICE_TICS) {
      if (seg.includes(tic)) ticsInChapter.add(tic);
    }
  }
  for (const ch of characters.filter(c => c.present)) {
    // 角色附近（名出现位置 ±120 字内）的引号片段，若命中口头禅则归属
    const idx = text.indexOf(ch.name);
    if (idx < 0) { voicePrints.push({ name: ch.name, tics: [] }); continue; }
    const near = text.slice(Math.max(0, idx - 120), Math.min(text.length, idx + 120));
    const nearTics = VOICE_TICS.filter(t => near.includes(t));
    // 若该角色附近无口头禅，但全章有，则不强行归属（避免误戴）；仅记录真实附近命中
    voicePrints.push({ name: ch.name, tics: nearTics });
  }

  return {
    chapterName,
    characters,
    timeAnchors: [...new Set(timeAnchors)],
    properNouns: [...properNouns],
    pendingForeshadow: [...new Set(pendingForeshadow)],
    numericAnchors,
    voicePrints,
  };
}

// —— 加载项目设定档案（供 check-chapter 调用）——
export function loadProjectProfiles(projectPath: string): { profileText: string; worldText: string } {
  const profilePath = path.join(projectPath, '设定', '角色档案.md');
  const worldPath = path.join(projectPath, '设定', '世界观设定.md');
  return {
    profileText: fs.existsSync(profilePath) ? fs.readFileSync(profilePath, 'utf-8') : '',
    worldText: fs.existsSync(worldPath) ? fs.readFileSync(worldPath, 'utf-8') : '',
  };
}
