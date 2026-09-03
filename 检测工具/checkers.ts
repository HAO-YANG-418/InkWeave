/**
 * InkWeave 共享检测器模块 v4.1
 * 
 * ============================================================
 * 双轨分工说明：
 * 
 * 本文件（检测工具/checkers.ts）是「唯一共享检测逻辑源」。
 * CLI入口（check-chapter.ts / check-all.ts）直接引用本文件。
 * 
 * 源码/checks/ 目录下的独立检测器文件是引擎内部参考实现，
 * 可能在引擎运行时被调用，但检测逻辑以本文件为准。
 * 修改检测规则时：先改本文件 → 再同步源码/checks/（如适用）。
 * ============================================================
 * 
 * 从 check-chapter.ts 和 check-all.ts 抽取的公共检测逻辑。
 * 消除 70% 代码重复，提供统一的检测器注册表。
 * 
 * 18 个检测器分为 3 组，可并行执行：
 *   Group 1（正则密集型）：逗号链、禁用字、套路词、解释腔、标点残损
 *   Group 2（统计密集型）：感官密度、数据锚点、台词差异化、动作点名册、感叹号配额、字数达标
 *   Group 3（结构密集型）：句群波形、短语重复、不是X是Y、碎句、拍内断句、读者负担、紧邻重复
 */

// ============================================================
// 类型定义
// ============================================================

import { ChapterFact } from './extract-entities.js';

export type ParagraphType = 'narrative' | 'dialogue' | 'mixed';

export interface ParagraphInfo {
  index: number;
  text: string;
  type: ParagraphType;
  wordCount: number;
}

export interface TextStats {
  totalChars: number;
  totalWords: number;
  paragraphCount: number;
  avgParagraphLength: number;
  sentenceCount: number;
  avgSentenceLength: number;
  shortSentenceRatio: number;
  anchorCount: number;
  fillerCount: number;
  dialogueRatio: number;
  sensoryMentions: Record<string, number>;
  paragraphs: ParagraphInfo[];
}

export interface FixSuggestion {
  description: string;
  before: string;
  after: string;
}

export interface Violation {
  ruleId: string;
  ruleName: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  suggestion: string;
  fixes?: FixSuggestion[];
  paragraphType?: ParagraphType;
}

export interface CrossChapterResult {
  globalPhrases: { phrase: string; chapters: number[]; totalCount: number }[];
  globalClichés: { name: string; chapters: number[]; totalCount: number }[];
  openingPatterns: { pattern: string; chapters: number[] }[];
  /** 盲区1：角色登场一致性 */
  characterIntros: { name: string; firstChapter: number; detailLevel: string; issue?: string }[];
  /** 盲区2：情节线收束 */
  plotThreads: { name: string; chapters: number[]; status: 'open' | 'resolved' }[];
  /** 盲区3：信息释放节奏 */
  conceptPacing: { chapter: number; newConcepts: string[]; density: number }[];
  /** 盲区4：跨章设定一致性 */
  settingIssues: { key: string; chapters: number[]; description: string }[];
  /** 盲区5：段落结构重复 — 跨章检测相同段落结构模式 */
  paragraphPatterns: { pattern: string; chapters: number[]; totalCount: number }[];
}

// ============================================================
// 段落分类器
// ============================================================

export function classifyParagraph(paraText: string): ParagraphType {
  const trimmed = paraText.trim();
  if (!trimmed) return 'narrative';
  const dialogueChars = (trimmed.match(/[“”「」『』‘’]/g) || []).length;
  const totalChars = trimmed.replace(/\s/g, '').length;
  const dialogueRatio = totalChars > 0 ? dialogueChars / totalChars : 0;
  if (dialogueRatio > 0.6) return 'dialogue';
  if (dialogueRatio > 0.3) return 'mixed';
  if (/^[“”「」『』‘’]/.test(trimmed) && dialogueChars >= 4) return 'dialogue';
  return 'narrative';
}

export function splitParagraphs(text: string): ParagraphInfo[] {
  const rawParagraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  return rawParagraphs.map((p, i) => ({
    index: i,
    text: p.trim(),
    type: classifyParagraph(p),
    wordCount: (p.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length,
  }));
}

// ============================================================
// 文本统计
// ============================================================

export function computeTextStats(text: string): TextStats {
  const totalChars = text.replace(/\s/g, '').length;
  const cjkMatch = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g);
  const totalWords = cjkMatch ? cjkMatch.length : 0;

  const paragraphs = splitParagraphs(text);
  const paragraphCount = paragraphs.length;
  const avgParagraphLength = paragraphCount > 0 ? totalWords / paragraphCount : 0;

  const sentences = text.split(/[。！？；\n]+/).filter((s) => s.trim().length > 0);
  const sentenceCount = sentences.length;
  const avgSentenceLength = sentenceCount > 0 ? totalWords / sentenceCount : 0;

  const shortSentences = sentences.filter((s) => s.replace(/[，、\s]/g, '').length <= 8);
  const shortSentenceRatio = sentenceCount > 0 ? shortSentences.length / sentenceCount : 0;

  const bodyParts = /手|脚|腿|头|脸|眼|嘴|耳|鼻|肩|背|腰|腹|胸|臂|指|掌|拳|膝|踝|腕|颈|额|颊|唇|舌|齿|心口|后颈|肩胛/g;
  const anchorMatches = text.match(bodyParts);
  const anchorCount = anchorMatches ? anchorMatches.length : 0;

  const fillerMatch = text.match(/[了的着地得]/g);
  const fillerCount = fillerMatch ? fillerMatch.length : 0;

  const dialogueMatch = text.match(/[“”「」『』‘’]/g);
  const dialogueCharCount = dialogueMatch ? dialogueMatch.length : 0;
  const dialogueRatio = totalChars > 0 ? dialogueCharCount / totalChars : 0;

  const sensoryMentions: Record<string, number> = {
    visual: countSensoryChars(text, SENSORY_CHARS.visual),
    auditory: countSensoryChars(text, SENSORY_CHARS.auditory),
    tactile: countSensoryChars(text, SENSORY_CHARS.tactile),
    olfactory: countSensoryChars(text, SENSORY_CHARS.olfactory),
    gustatory: countSensoryChars(text, SENSORY_CHARS.gustatory),
  };

  return {
    totalChars, totalWords, paragraphCount, avgParagraphLength,
    sentenceCount, avgSentenceLength, shortSentenceRatio,
    anchorCount, fillerCount, dialogueRatio, sensoryMentions,
    paragraphs,
  };
}

// ============================================================
// 常量
// ============================================================

export const FORBIDDEN_CHARS = ['——', '…', '～', '※', '★', '☆', '◆', '◇', '○', '●'];

// 规范单字感官词典（2026-08-29 两树口径统一）：与源码树 radar.ts SENSORY_CATEGORIES 内容完全一致，
// 仅 key 名沿用 CLI 树习惯（visual/auditory/tactile/olfactory/gustatory）。
// 统一为「单字 + 每字计 1 次」计数，消除源码树「复合词拆解（看见→看+见=2）」造成的 1.6x 口径差。
const SENSORY_CHARS: Record<string, string[]> = {
  visual: ['看', '望', '盯', '瞥', '见', '瞧', '观', '视', '亮', '暗', '光', '影', '色', '红', '蓝', '绿', '白', '黑', '映', '照', '闪', '耀', '眩'],
  auditory: ['听', '声', '响', '鸣', '叫', '喊', '嗡', '轰', '哗', '啪', '吱', '砰', '咚', '叮', '铛', '嘎', '静', '嘈'],
  olfactory: ['香', '臭', '腥', '膻', '闻', '嗅', '焦', '霉'],
  tactile: ['触', '摸', '碰', '热', '冷', '凉', '烫', '温', '硬', '软', '冰', '疼', '痛', '麻', '痒', '刺', '压', '握', '抚', '粗', '细', '滑', '糙', '湿', '干', '黏'],
  gustatory: ['甜', '苦', '酸', '辣', '咸', '涩', '鲜', '味', '尝', '品', '甘', '腻'],
};

function countSensoryChars(text: string, chars: string[]): number {
  let n = 0;
  for (const c of chars) {
    let idx = 0;
    while ((idx = text.indexOf(c, idx)) !== -1) { n++; idx += c.length; }
  }
  return n;
}

export const CLICHE_PATTERNS: { pattern: RegExp; name: string; replacement: string }[] = [
  { pattern: /嘴角勾起|嘴角扬起|嘴角一勾/g, name: '嘴角勾起', replacement: '用具体表情或动作替代' },
  { pattern: /眼中寒芒|眼中精光|眼中杀意|眼中闪过一丝/g, name: '眼中寒芒', replacement: '写眼部的具体变化：瞳孔收缩/眼白泛红/视线聚焦' },
  { pattern: /倒吸一口凉气|倒吸一口冷气/g, name: '倒吸凉气', replacement: '写具体生理反应：后背发凉/汗毛竖起/手指发麻' },
  { pattern: /脸色大变|脸色一变|脸色骤变/g, name: '脸色大变', replacement: '写具体面部反应：血色褪尽/青筋暴起/嘴唇发白' },
  { pattern: /恐怖的气势|惊人的力量|毁灭性的/g, name: '万能修饰词', replacement: '用具体效果代替：地面裂开/空气扭曲/百米内无声' },
  { pattern: /他不知道的是/g, name: '他不知道的是', replacement: '删掉，让读者和角色一起发现' },
  { pattern: /就在这时/g, name: '就在这时', replacement: '直接写发生的事，不用过渡词' },
  { pattern: /一切才刚刚开始/g, name: '一切才刚刚开始', replacement: '删掉，用具体事件暗示还有后续' },
  { pattern: /盘膝坐下|内视丹田|突破境界|瓶颈松动/g, name: '修炼模板', replacement: '写修炼的具体身体感受和外部变化' },
  { pattern: /心中涌起|一股暖流|涌上心头/g, name: '情感模板', replacement: '写具体行为展现情感：沉默/握拳/转身' },
];

export const COMMON_DIALOGUE_TAGS = [
  '说', '道', '问', '答', '喊', '叫', '吼', '骂', '喝', '嚷',
  '低语', '呢喃', '喃喃', '嘀咕', '嘟囔', '咕哝', '自语',
  '冷笑', '怒喝', '喝道', '问道', '说道', '答道', '喊道',
  '叹道', '笑道', '哭道', '怒道', '惊道', '喜道',
];

export const COMMON_ACTION_VERBS = [
  '转身', '回头', '抬头', '低头', '举手', '握拳', '咬牙', '皱眉', '眯眼', '睁眼',
  '深吸', '呼出', '迈步', '后退', '前行', '跃起', '落下', '挥手', '点头',
  '摇头', '叹气', '冷笑', '凝视', '扫视', '环顾', '蹲下', '站起', '坐下', '躺下',
  '闪身', '飞身', '纵身', '探手', '伸手', '收手', '松手', '放手',
  '出拳', '收拳', '踢腿', '扫腿', '翻身', '倒退', '前冲', '飞跃', '坠落',
];

export const EXPLAIN_PATTERNS = [
  { pattern: /这说明了|这说明|这意味着|这代表着|也就是说|换言之|换句话说|总而言之|简单来说/gi, name: '解释腔' },
  { pattern: /从某种意义上说|严格来说|准确地说|不得不说|可以这么说/gi, name: '解释腔-变体' },
  { pattern: /其实.{0,5}是.{0,10}的/gi, name: '其实...是...的' },
];

// ============================================================
// 书面联接词安全网（P5 加固）：网文好懂口语化，禁止书面联接词堆叠
// ============================================================
const BOOKISH_CONJUNCTIONS = [
  '然而', '因此', '由此可见', '总而言之', '综上所述', '毋庸置疑', '不可否认',
  '客观地讲', '换言之', '换句话说', '事实上', '诚然', '固然', '虽说', '即便如此',
  '尽管如此', '究其原因', '值得一提的是', '众所周知', '毫不夸张地说', '平心而论',
  '说到底', '归根结底', '无可否认', '毋庸讳言', '整体而言', '从某种角度来看',
];
function checkBookishConjunction(text: string): Violation[] {
  const violations: Violation[] = [];
  const hits: string[] = [];
  for (const w of BOOKISH_CONJUNCTIONS) {
    const m = text.match(new RegExp(w, 'g'));
    if (m) hits.push(...m);
  }
  if (hits.length === 0) return violations;
  const chars = text.length || 1;
  const density = (hits.length / chars) * 1000;
  if (density > 4 || hits.length >= 5) {
    violations.push({
      ruleId: 'bookish_conjunction',
      ruleName: '书面联接词',
      message: `检测到 ${hits.length} 处书面联接词（如${[...new Set(hits)].slice(0, 6).join('、')}），密度 ${density.toFixed(1)}/千字。网文好懂口语化，禁用书面联接词堆叠。`,
      severity: 'warning',
      suggestion: '删掉"然而/因此/由此可见/总而言之"等书面联接词，用逗号连写或靠上下文自然过渡；转折用"可/但"，因果用"所以"。',
    });
  }
  return violations;
}

// ============================================================
// 漏引号通读（P5 加固）：全角引号必须成对，漏引号/错位给 error
// ============================================================
function checkQuoteBalance(text: string): Violation[] {
  const violations: Violation[] = [];
  const left = (text.match(/“/g) || []).length;
  const right = (text.match(/”/g) || []).length;
  if (left !== right) {
    violations.push({
      ruleId: 'quote_unbalanced',
      ruleName: '漏引号',
      message: `全角引号不成对：左引号“ ${left} 个，右引号” ${right} 个，差 ${Math.abs(left - right)} 个。漏引号/错位须通读逐句核对修正。`,
      severity: 'error',
      suggestion: '逐句通读，补上缺失的引号或修正错位引号；对话与引用必须成对收尾。',
    });
  }
  return violations;
}

// ============================================================
// 检测器注册表
// ============================================================

export type DetectorFn = (text: string, stats: TextStats, protagonistName?: string) => Violation[];
export type DetectorGroup = { name: string; detectors: { id: string; name: string; fn: DetectorFn }[] };

export const DETECTOR_GROUPS: DetectorGroup[] = [
  {
    name: '正则密集型',
    detectors: [
      { id: 'comma_chain', name: '逗号链', fn: checkCommaChain },
      { id: 'forbidden_char', name: '禁用字', fn: (t, s) => checkForbiddenChar(t) },
      { id: 'cliche', name: '万能套路', fn: (t, s) => checkClichés(t) },
      { id: 'explain_tone', name: '解释腔', fn: (t, s) => checkExplainTone(t) },
      { id: 'punctuation_damage', name: '标点残损', fn: (t, s) => checkPunctuationDamage(t) },
      { id: 'half_width_quote', name: '半角引号', fn: (t, s) => checkHalfWidthQuote(t) },
      { id: 'question_period', name: '疑问用句号', fn: (t, s) => checkQuestionPeriod(t) },
      { id: 'tag_colon_mid', name: '提示语中冒号', fn: (t, s) => checkTagColonMid(t) },
      { id: 'cjk_half_punct', name: '中文后半角', fn: (t, s) => checkCjkHalfPunct(t) },
      { id: 'repeat_qa', name: '连续问叹', fn: (t, s) => checkRepeatQa(t) },
      { id: 'bookish_conjunction', name: '书面联接词', fn: (t, s) => checkBookishConjunction(t) },
      { id: 'quote_unbalanced', name: '漏引号', fn: (t, s) => checkQuoteBalance(t) },
    ],
  },
  {
    name: '统计密集型',
    detectors: [
      { id: 'sense_density', name: '感官密度', fn: (t, s) => checkSenseDensity(s) },
      { id: 'data_anchor', name: '数据锚点', fn: checkDataAnchor },
      { id: 'character_voice', name: '台词差异化', fn: checkCharacterVoice },
      { id: 'action_rollcall', name: '动作点名册', fn: (t, s) => checkActionRollcall(t) },
      { id: 'exclamation_quota', name: '感叹号配额', fn: checkExclamationQuota },
      { id: 'anchor_density', name: '锚点密度', fn: checkAnchorDensity },
      { id: 'word_count', name: '字数达标', fn: (t, s) => [] },
    ],
  },
  {
    name: '结构密集型',
    detectors: [
      { id: 'sentence_waveform', name: '句群波形', fn: (t, s) => checkSentenceWaveform(t) },
      { id: 'phrase_repetition', name: '短语重复', fn: (t, s) => checkPhraseRepetition(t) },
      { id: 'not_shi_pattern', name: '不是X是Y', fn: (t, s) => checkNotShiPattern(t) },
      { id: 'short_sentence', name: '碎句', fn: (t, s) => checkShortSentenceFragments(t, s) },
      { id: 'beat_break', name: '拍内断句', fn: checkBeatBreak },
      { id: 'reader_burden', name: '读者负担', fn: checkReaderBurden },
      { id: 'adjacent_duplicate', name: '紧邻重复', fn: (t, s) => checkAdjacentDuplicate(t) },
      { id: 'scene_count', name: '场景碎片化', fn: (t, s) => checkSceneCount(t) },
      { id: 'dialogue_overload', name: '对话过载', fn: (t, s) => checkDialogueOverload(t, s) },
      { id: 'protagonist_stakes', name: '主角工具人', fn: (t, s, n) => checkProtagonistStakes(t, n) },
      { id: 'style_stacking', name: '排比堆叠', fn: (t, s) => checkStyleStacking(t, s) },
      { id: 'dialogue_tag_repeat', name: '对话引导词重复', fn: (t) => checkDialogueTagRepeat(t) },
    ],
  },
];

// ============================================================
// 主角私心驱动检测（Item 1 / #65 铁则二十一①抗工具人）
// 正则 v1（同步，CLI 门禁可拦）；LLM 语义层按方案 §三方向预留于 源码/checks/（async 生成时自纠），本次不阻塞门禁
// 已接 kb/config：protagonistName 经 checkChapter(text, targetWords, protagonistName) → 执行器第3参 → 本函数；
// CLI 侧源头为 project.json 的 ProjectEntry.protagonistName（裂日=林深），生成侧经 ReflectionConfig.protagonistName 注入；
// 缺省回退 '林深'（PROTAGONIST_NAME 常量）。
// 判定：主角名 + 0~20 字内出现私心动机词（家人牵挂/恐惧/利己抉择/未竟执念）→ 通过；否则报「主角工具人」warning
// ============================================================
const PROTAGONIST_NAME = '林深';
const PROTAGONIST_STAKES_WORDS = [
  '怕', '想', '要', '记着', '欠', '赎', '为了', '因为', '赌',
  '阿苓', '妹妹', '护', '找', '忘', '惦记', '放心不下', '惦',
];
function checkProtagonistStakes(text: string, protagonistName: string = PROTAGONIST_NAME): Violation[] {
  const violations: Violation[] = [];
  // 护栏：章节根本不出现主角名 → 无法评估其私心，跳过（避免非本作章节每章误报 主角工具人）
  if (!text.includes(protagonistName)) return violations;
  const re = new RegExp(
    protagonistName + '[^。！？\\n]{0,20}(' + PROTAGONIST_STAKES_WORDS.join('|') + ')',
    'g',
  );
  const hit = re.test(text);
  if (!hit) {
    violations.push({
      ruleId: 'protagonist_stakes',
      ruleName: '主角工具人',
      message: `主角「${protagonistName}」全章未表达任何个人化、利己动机（家人牵挂/恐惧/愧疚/未竟执念），仅转述指令或执行安排，读者难以共情`,
      severity: 'warning',
      suggestion: '给主角一个只属于他个人的赌注：具体人名（如阿苓）、怕失去什么、为个人而非为任务做的抉择。铁则二十一①抗工具人。',
    });
  }
  return violations;
}

// ============================================================
// Group 1: 正则密集型
// ============================================================

function checkCommaChain(text: string, stats: TextStats): Violation[] {
  const violations: Violation[] = [];
  if (stats.sentenceCount < 5) return violations;

  const narrativeText = stats.paragraphs.filter(p => p.type === 'narrative').map(p => p.text).join('\n');
  const dialogueText = stats.paragraphs.filter(p => p.type === 'dialogue' || p.type === 'mixed').map(p => p.text).join('\n');

  if (narrativeText.length > 50) {
    const nComma = (narrativeText.match(/，/g) || []).length;
    const nPeriod = (narrativeText.match(/。/g) || []).length;
    const nRatio = nPeriod > 0 ? nComma / nPeriod : nComma;
    if (nRatio > 3.8) {
      violations.push({
        ruleId: 'comma_chain', ruleName: '逗号链',
        message: `叙事段逗号/句号比过高（${nRatio.toFixed(1)}:1），存在"一逗到底"倾向`,
        severity: 'warning', suggestion: '叙事段在换拍、换判断、换压力处用句号断开，控制逗号/句号比在3.2以下',
        paragraphType: 'narrative',
      });
    }
  }

  if (dialogueText.length > 50) {
    const dComma = (dialogueText.match(/，/g) || []).length;
    const dPeriod = (dialogueText.match(/。/g) || []).length;
    const dRatio = dPeriod > 0 ? dComma / dPeriod : dComma;
    if (dRatio > 4.5) {
      violations.push({
        ruleId: 'comma_chain_dialogue', ruleName: '逗号链',
        message: `对话段逗号/句号比过高（${dRatio.toFixed(1)}:1），对话也需要适当断句`,
        severity: 'info', suggestion: '对话段逗号/句号比控制在4.5以下，长对话适当断句',
        paragraphType: 'dialogue',
      });
    }
  }

  const narrativeParagraphs = stats.paragraphs.filter(p => p.type === 'narrative');
  for (const para of narrativeParagraphs) {
    const paraSentences = para.text.split(/[。！？；\n]+/);
    for (const s of paraSentences) {
      const commas = (s.match(/，/g) || []).length;
      if (commas >= 10) {
        violations.push({
          ruleId: 'comma_chain_long', ruleName: '逗号链',
          message: `含${commas}个逗号的超长句（叙事段第${para.index + 1}段），建议在换拍处拆分`,
          severity: 'info', suggestion: '长句超过70字或含8个以上逗号时，在换拍处拆分为两句',
          paragraphType: 'narrative',
          fixes: [{ description: '在换拍处拆分', before: s.substring(0, 40) + '...', after: '在换拍/换判断/换压力处用句号断开为两句' }],
        });
      }
    }
  }
  return violations;
}

function checkForbiddenChar(text: string): Violation[] {
  const violations: Violation[] = [];
  for (const char of FORBIDDEN_CHARS) {
    if (char === '——') continue; // 破折号拆出，按全局禁止单独硬禁处理
    const escaped = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const count = (text.match(new RegExp(escaped, 'g')) || []).length;
    if (count > 0) {
      const charName = char === '…' ? '省略号' : `"${char}"`;
      violations.push({
        ruleId: 'forbidden_char', ruleName: '禁用字',
        message: `检测到${count}个${charName}，建议替换为逗号或句号`,
        severity: 'error', suggestion: '中文网文禁用该符号，用逗号或句号替代。',
        fixes: undefined,
      });
    }
  }
  // 破折号硬禁（零容忍）：与 base-prompt 铁则、preset no_dash 全面对齐。
  // 全局与所有节点一致禁止破折号，出现1个即 error，在门禁中记为错误。
  const dashCount = (text.match(/——/g) || []).length;
  if (dashCount > 0) {
    violations.push({
      ruleId: 'forbidden_char_dash', ruleName: '禁止破折号',
      message: `检测到${dashCount}个破折号，破折号全局禁止，须替换为逗号或冒号`,
      severity: 'error',
      suggestion: '中文网文不需要破折号。认知翻转用逗号，解释说明用冒号，停顿用省略号（适量）。',
      fixes: [{ description: '将破折号替换为逗号', before: '——', after: '，' }],
    });
  }
  return violations;
}

// ============================================================
// P0 去均匀腔：质感多样性检测（v5.1）
// 防"凉/麻/颤"循环成新套路——每章都模板化用同一批身体感受词。
// ============================================================
const TEXTURE_WORDS = ['凉', '冷', '麻', '颤', '涩', '糙', '黏', '刺', '烫', '冰', '寒', '酸', '痒', '疼', '痛', '灼', '腻', '钝', '木', '僵', '酥'];

export function checkTextureVariety(text: string, excludedTextureWords?: string[]): Violation[] {
  const violations: Violation[] = [];
  // per-project 排除：如 裂日 的「凉」概念词，不参与均匀腔统计
  const activeWords = (excludedTextureWords && excludedTextureWords.length)
    ? TEXTURE_WORDS.filter(w => !excludedTextureWords.includes(w))
    : TEXTURE_WORDS;
  // 叙述口径（2026-08-29）：只统计叙述段，剥离对话，避免把对话里的质感词（如"疼？""骨头疼。"医疗问询）计入均匀腔判定。
  // 复用本文件 splitParagraphs 段落分类（与 :289 checkCommaChain 同口径），叙述段 = type==='narrative'。
  const narrativeText = splitParagraphs(text)
    .filter(p => p.type === 'narrative')
    .map(p => p.text)
    .join('\n');
  const sourceText = narrativeText.length > 0 ? narrativeText : text;
  const sentences = sourceText.split(/[。！？；\n]+/).filter(s => s.trim().length > 0);
  // 每句含有的质感词
  const perSentence: string[][] = sentences.map(s => {
    const found: string[] = [];
    for (const w of activeWords) {
      if (s.includes(w)) found.push(w);
    }
    return found;
  });
  // 全章频次
  const freq: Record<string, number> = {};
  for (const arr of perSentence) for (const w of arr) freq[w] = (freq[w] || 0) + 1;

  const flagged = new Set<string>();
  // 1) 密集循环：同一质感词在连续2句内都出现，且全章≥4次（紧邻重复 = 均匀腔信号；阈值 3→4 放宽，避免冷感基调"凉"等刻意复用被误伤）
  for (let i = 0; i < perSentence.length - 1; i++) {
    const a = perSentence[i], b = perSentence[i + 1];
    for (const w of a) {
      if (b.includes(w) && (freq[w] || 0) >= 4) flagged.add(w);
    }
  }
  // 2) 单调霸权：某质感词全章≥6次且超过其余质感词频次总和（单一感受词刷屏）
  const entries = Object.entries(freq).sort((x, y) => y[1] - x[1]);
  if (entries.length >= 2) {
    const top = entries[0];
    const restSum = entries.slice(1).reduce((s, e) => s + e[1], 0);
    if (top[1] >= 6 && top[1] > restSum) flagged.add(top[0]);
  }

  if (flagged.size > 0) {
    // 取频次最高的一个报告（避免多条刷屏）
    const word = entries.filter(e => flagged.has(e[0])).sort((x, y) => y[1] - x[1])[0][0];
    violations.push({
      ruleId: 'texture_variety', ruleName: '质感多样性',
      message: `质感词"${word}"在全章密集重复（${freq[word] || 0}次），易形成"均匀腔"套路——每章都用同一批身体感受词。建议随场景轮换不同质感（紧张用绷紧/发木，冷用凉/冰/寒，痛用刺/灼/钝）。`,
      severity: 'warning',
      suggestion: '身体/材质感受词要随场景变化，避免"凉/麻/颤"循环。不同情绪匹配不同质感词库。',
    });
  }
  return violations;
}

// ============================================================
// P2 人味（v5.2）：情感弧线 / 留白 缺失检测
// 全 warning 级，绝不阻塞门禁；仅当"情绪密度高但层次标记为 0"才报，避免误杀冷硬叙事。
// ============================================================

// 平铺情绪锚点：数值化/单一感官堆叠，无层次
const FLAT_EMOTION_MARKS = ['三十七度', '骨温', '体温', '心跳', '脉', '凉意', '发麻', '发涩', '刺痛', '发紧', '发木', '发冷', '发烫', '寒意', '颤了一下', '抖了一下'];
// 层次标记：克制 → 释放 → 余波
const LAYERED_EMOTION_MARKS = [
  '忍住', '咽下', '咽了回去', '没说出口', '到嘴边', '话卡在', '别过头', '别过脸', '垂下眼',
  '终于', '脱力', '笑出声', '眼眶', '鼻子一酸', '喉头', '松了口气', '长长吐出', '呼出一口气', '垮下来', '泄了气',
];

// D1 · emotion_arc：情感只有平铺锚点、缺层次弧线
export function checkEmotionArc(text: string): Violation[] {
  const violations: Violation[] = [];
  const flatCount = FLAT_EMOTION_MARKS.reduce((n, m) => n + (text.split(m).length - 1), 0);
  const layerCount = LAYERED_EMOTION_MARKS.reduce((n, m) => n + (text.split(m).length - 1), 0);
  // 仅当平铺锚点密集（≥4）且层次标记为 0 → 情绪被"测量"而非"经历"
  if (flatCount >= 4 && layerCount === 0) {
    violations.push({
      ruleId: 'emotion_arc', ruleName: '情感弧线缺失',
      message: `本章情绪以身体数值/平铺感官锚点为主（${flatCount}处），但缺少"克制→溃堤→余波"的层次标记（0处）。AI 文典型特征：情绪被测量而非经历。`,
      severity: 'warning',
      suggestion: '给关键情绪制造层次：先克制（忍住/咽下/别过头），再释放（终于/脱力/笑出声/眼眶），最后留余波（事后身体残留）。不要通篇用数值平铺情绪。',
    });
  }
  return violations;
}

// 留白标记：对话截断 / 动作替语言 / 环境替角色说
const UNSAID_MARKS = [
  '……', '没说完', '话卡在', '咽了回去', '把话咽下', '欲言又止', '到嘴边又', '转过身去', '别过头', '低头不语',
  '望向别处', '没有回答', '没有接话', '沉默', '半句话', '后半句', '话咽了', '顿了顿没说',
];

// D2 · unsaid_gap：对话占比不低却无任何留白
export function checkUnsaidGap(text: string, stats: TextStats): Violation[] {
  const violations: Violation[] = [];
  if (stats.dialogueRatio < 0.08) return violations; // 冷硬独白本就少对话，不报
  const unsaidCount = UNSAID_MARKS.reduce((n, m) => n + (text.split(m).length - 1), 0);
  if (unsaidCount === 0) {
    violations.push({
      ruleId: 'unsaid_gap', ruleName: '留白缺失',
      message: `对话占比 ${(stats.dialogueRatio * 100).toFixed(0)}%，但全章无一处"未说破"的留白（对话截断/动作替语言/环境承接情绪均为 0）。关键情绪全说完了，少了余韵。`,
      severity: 'warning',
      suggestion: '至少 1 处关键情绪用"没说破"承接：对话截断（……）、用动作替代语言（转过身/低头/望向别处）、让环境替角色说。不是每句话都要说完。',
    });
  }
  return violations;
}

// 情绪显隐分布：量化"书面总结式告知"(AI味) vs "口语点名情绪"(好懂直白)
// 对应铁则：情绪可"显"可"示"，允许口语化直接点名（他怕了/心里一沉）+身体锚点；
// 禁止书面总结式情绪告知（"他感到一阵莫名的惆怅"）。用于验收对比量化提升。
const EMOTION_AI_TELL_PATTERNS: RegExp[] = [
  /感到一阵.{0,8}(惆怅|悲伤|失落|酸涩|空虚|迷茫|怅然|苦涩|凄凉|寂寥|落寞|无措)/g,
  /感到莫名.{0,6}(的)?(惆怅|悲伤|失落|酸涩|空虚|迷茫|怅然)/g,
  /涌上心头/g,
  /涌上心頭/g,
  /一股.{0,10}(寒意|暖流|酸楚|悲凉|恐惧|莫名的).{0,4}(涌上|袭来|弥漫|爬上)/g,
  /陷入.{0,6}(沉默|沉思|悲伤|绝望|迷茫|惆怅|低落|孤独)/g,
  /莫名的.{0,4}(惆怅|悲伤|失落|酸涩|空虚|迷茫|怅然|不安)/g,
  /内心.{0,4}(泛起|涌起|滋生|掠过).{0,8}(莫名的|说不清的|难以名状的|一丝|一阵)/g,
  /说不清的.{0,4}(惆怅|伤感|情绪|滋味|不安)/g,
  /难以名状的.{0,4}(悲伤|情绪|失落|孤独|恐惧)/g,
  /一种.{0,6}(说不出的|莫名的|难以名状的).{0,4}(感觉|情绪|滋味)/g,
  /心头.{0,4}(泛起|涌起|滋生).{0,8}(莫名的|一阵|一股|说不清的|酸楚)/g,
  /心里.{0,6}(涌起|泛起|升起|漫上).{0,8}(莫名的|一阵|一股|说不清的|酸涩)/g,
];

const EMOTION_COLLOQUIAL_TELL_PATTERNS: RegExp[] = [
  /心里一沉/g, /心头一紧/g, /心猛地一沉/g, /心口一紧/g, /心往下坠/g,
  /松了口气/g, /长舒一口气/g, /倒吸一口凉气/g,
  /头皮发麻/g, /背脊发凉/g, /浑身一僵/g, /遍体生寒/g, /汗毛竖起/g,
  /他怕了/g, /她怕了/g, /他慌了/g, /她慌了/g, /他怒了/g, /他懵了/g, /他愣了/g, /她愣了/g,
  /眼眶一热/g, /鼻子一酸/g, /喉咙发紧/g, /嗓子发干/g,
  /脸一红/g, /脸色一白/g, /脸色一变/g, /血往头上涌/g,
];

// 情绪显隐分布：检测书面总结式告知（AI味），鼓励口语点名+身体锚点
export function checkEmotionTellDistribution(text: string): Violation[] {
  const violations: Violation[] = [];
  const spans: Array<[number, number]> = [];
  for (const re of EMOTION_AI_TELL_PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (m.index !== undefined) spans.push([m.index, m.index + m[0].length]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  let aiTell = 0;
  let lastEnd = -1;
  const samples: string[] = [];
  for (const [s, e] of spans) {
    if (s >= lastEnd) {
      aiTell++;
      if (samples.length < 3) samples.push(text.slice(s, e));
      lastEnd = e;
    }
  }
  if (aiTell < 1) return violations;
  let colloq = 0;
  for (const re of EMOTION_COLLOQUIAL_TELL_PATTERNS) {
    const m = text.match(re);
    if (m) colloq += m.length;
  }
  const ratio = colloq === 0 ? '∞（无口语点名对照）' : `${(aiTell / colloq).toFixed(1)} : 1`;
  violations.push({
    ruleId: 'emotion_tell_distribution',
    ruleName: '情绪显隐分布',
    message: `检测到 ${aiTell} 处书面总结式情绪告知（AI 味，如"${[...new Set(samples)].join('、')}"），口语点名情绪 ${colloq} 处。书面总结式:口语点名 = ${ratio}。铁则禁书面总结式、改口语点名+身体锚点。`,
    severity: 'warning',
    suggestion: '把"他感到一阵莫名的惆怅"这类书面总结式，改为口语化直接点名（他怕了/心里一沉）+身体锚点（指节发白/背脊发凉）。显+示结合，别用抽象总结替角色感受。',
  });
  return violations;
}

function checkClichés(text: string): Violation[] {
  const violations: Violation[] = [];
  for (const { pattern, name, replacement } of CLICHE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      violations.push({
        ruleId: 'cliche_' + name, ruleName: '万能套路',
        message: `检测到${matches.length}处"${name}"套路词：${matches.slice(0, 3).join('、')}`,
        severity: matches.length >= 3 ? 'warning' : 'info',
        suggestion: '用具体的身体动作、表情变化、环境反应来替代万能套路词',
        fixes: [{ description: `替换"${name}"`, before: matches.slice(0, 3).join('、'), after: replacement }],
      });
    }
  }
  return violations;
}

function checkExplainTone(text: string): Violation[] {
  const violations: Violation[] = [];
  for (const { pattern, name } of EXPLAIN_PATTERNS) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      violations.push({
        ruleId: 'explain_tone', ruleName: '解释腔',
        message: `检测到${matches.length}处"${name}"：${matches.slice(0, 3).join('、')}`,
        severity: matches.length >= 3 ? 'warning' : 'info',
        suggestion: '叙事者跳出来解释是网文大忌。让读者自己从行为和对话中理解，不要替读者总结。',
        fixes: [{ description: '删除解释性语句，让行为自己说话', before: matches.slice(0, 3).join('、'), after: '（删除，让前文的行为和对话自己说明）' }],
      });
    }
  }
  return violations;
}

function checkPunctuationDamage(text: string): Violation[] {
  const violations: Violation[] = [];
  const commaChains = text.match(/[^。！？\n]{200,}/g);
  if (commaChains && commaChains.length >= 5) {
    violations.push({
      ruleId: 'punctuation_damage', ruleName: '标点残损',
      message: `检测到${commaChains.length}段超过100字无句号断句，疑似一逗到底`,
      severity: 'warning', suggestion: '在换拍、换判断、换压力处用句号断开。每段超过100字应检查是否需要断句。',
    });
  }
  const doublePeriods = (text.match(/。。/g) || []).length;
  if (doublePeriods > 0) {
    violations.push({ ruleId: 'punctuation_double_period', ruleName: '标点残损', message: `检测到${doublePeriods}处连续句号"。。"`, severity: 'error', suggestion: '删除多余句号，每处只保留一个句号。' });
  }
  const doubleCommas = (text.match(/，，/g) || []).length;
  if (doubleCommas > 0) {
    violations.push({ ruleId: 'punctuation_double_comma', ruleName: '标点残损', message: `检测到${doubleCommas}处连续逗号"，，"`, severity: 'error', suggestion: '删除多余逗号。' });
  }
  const commaPeriod = (text.match(/，。/g) || []).length;
  if (commaPeriod > 0) {
    violations.push({ ruleId: 'punctuation_comma_period', ruleName: '标点残损', message: `检测到${commaPeriod}处"，。"逗号句号连用`, severity: 'error', suggestion: '删除逗号或句号中的一个。' });
  }
  return violations;
}

// 半角引号检测（中文网文标点硬伤，用户 09-01 三纠后补齐）：
// 中文语境所有引号须为全角弯引号 “ ”（嵌套用 ‘ ’）；ASCII 直引号 " ' 一律判 error。
// 注：漏标引号 / 引号错位属语义层问题，本确定性检查不覆盖，交由人工 + 异步 LLM 语义层（见 L270 预留）处理。
function checkHalfWidthQuote(text: string): Violation[] {
  const violations: Violation[] = [];
  const dq = (text.match(/"/g) || []).length; // ASCII 双引号 0x22
  if (dq > 0) {
    violations.push({
      ruleId: 'half_width_quote', ruleName: '半角引号',
      message: `检测到${dq}处半角直引号（"），中文语境须用全角弯引号 “ ”`,
      severity: 'error',
      suggestion: '将半角直引号 " 替换为中文弯引号 “（左）和 ”（右）。对话与引述一律用全角弯引号。',
    });
  }
  // 半角单引号仅在贴近中文时报（英文撇号罕见于中文小说，避免误伤）
  const sqCJK = (text.match(/[一-鿿]'|[一-鿿]'[一-鿿]/g) || []).length;
  if (sqCJK > 0) {
    violations.push({
      ruleId: 'half_width_quote_single', ruleName: '半角引号',
      message: `检测到${sqCJK}处贴近中文的半角单引号（'），须用中文单弯引号 ‘ ’`,
      severity: 'error',
      suggestion: '将半角单引号替换为中文单弯引号 ‘（左）或 ’（右），用于引号内嵌套。',
    });
  }
  return violations;
}

// 疑问句末误用句号（中文网文标点硬伤，用户 09-01 三纠后补齐）：
// 强疑问词（吗/呢/咋/干嘛/干啥）句内句外都判（极少用于陈述句末）；
// 弱疑问词（哪/什么/谁/怎么/为何/为啥）仅引号内判，避免叙述句（如"他不知道说什么。"）误杀。
function checkQuestionPeriod(text: string): Violation[] {
  const violations: Violation[] = [];
  const seen = new Set<number>();
  const add = (msg: string, startIdx: number) => {
    if (seen.has(startIdx)) return;
    seen.add(startIdx);
    violations.push({
      ruleId: 'question_period', ruleName: '疑问用句号',
      message: msg + `疑问句末应使用问号？`,
      severity: 'error',
      suggestion: '将句末句号改为问号。带疑问语气词的句子是疑问句，不用句号。',
    });
  };
  const strong = /(吗|呢|咋|干嘛|干啥)[。．]/g;
  let m: RegExpExecArray | null;
  while ((m = strong.exec(text)) !== null) {
    add(`检测到疑问句误用句号（"...${m[1]}。"），`, m.index);
  }
  const weak = /[““][^””]{0,60}?(哪|什么|谁|怎么|为何|为啥)[^””]{0,20}?[。．]/g;
  while ((m = weak.exec(text)) !== null) {
    add(`检测到引号内疑问句误用句号（${m[0]}），`, m.index);
  }
  return violations;
}

// 提示语在对话中间误用冒号（应为逗号）： "……。"他说："……" 属错误，中间提示语只用逗号。
function checkTagColonMid(text: string): Violation[] {
  const violations: Violation[] = [];
  const re = /[”’][^一-鿿]{0,3}(说|道|问|答|喊|嘀咕|嘟囔|吼|骂|喘)[^一-鿿]{0,2}：[““]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    violations.push({
      ruleId: 'tag_colon_mid', ruleName: '标点残损',
      message: `提示语在对话中间却用了冒号（${m[0]}），应为逗号`,
      severity: 'error',
      suggestion: '插在引文中间的提示语（说/道/问）后只能用逗号，前后引号都保留。',
    });
  }
  return violations;
}

// 中文（或闭引号）后跟半角标点： 说, / 。”, 等一律 error，须全角。
function checkCjkHalfPunct(text: string): Violation[] {
  const violations: Violation[] = [];
  const re = /(?:[一-鿿]|”|’)[,\.:;!?]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    violations.push({
      ruleId: 'cjk_half_punct', ruleName: '半角标点',
      message: `检测到中文后跟半角标点（${m[0]}），须用全角标点`,
      severity: 'error',
      suggestion: '中文语境所有标点用全角（，。：；！？）。',
    });
  }
  return violations;
}

// 连续问号/叹号：网文一般单用；≥2 报 warning，≥3 报 error（国标允许至多3个，但无强烈情感不需叠用）。
function checkRepeatQa(text: string): Violation[] {
  const violations: Violation[] = [];
  const qLens = (text.match(/？+/g) || []).map(s => s.length);
  const eLens = (text.match(/！+/g) || []).map(s => s.length);
  const maxQ = qLens.length ? Math.max(...qLens) : 0;
  const maxE = eLens.length ? Math.max(...eLens) : 0;
  if (maxQ >= 3) {
    violations.push({ ruleId: 'repeat_question', ruleName: '标点残损', message: `检测到${maxQ}个连续问号？？？，至多保留1个`, severity: 'error', suggestion: '连续问号最多叠用3个且仅限强烈情感，网文一般用1个。' });
  } else if (maxQ === 2) {
    violations.push({ ruleId: 'repeat_question', ruleName: '标点残损', message: `检测到连续问号？？，建议只留1个`, severity: 'warning', suggestion: '除非强烈情感，问号单用。' });
  }
  if (maxE >= 3) {
    violations.push({ ruleId: 'repeat_exclaim', ruleName: '标点残损', message: `检测到${maxE}个连续叹号！！！，至多保留1个`, severity: 'error', suggestion: '连续叹号最多叠用3个且仅限强烈情感，网文一般用1个。' });
  } else if (maxE === 2) {
    violations.push({ ruleId: 'repeat_exclaim', ruleName: '标点残损', message: `检测到连续叹号！！，建议只留1个`, severity: 'warning', suggestion: '除非强烈情感，叹号单用。' });
  }
  return violations;
}

// ============================================================
// Group 2: 统计密集型
// ============================================================

function checkSenseDensity(stats: TextStats): Violation[] {
  const violations: Violation[] = [];
  const sensory = stats.sensoryMentions;
  const totalSensory = Object.values(sensory).reduce((a, b) => a + b, 0);
  const density = stats.totalWords > 0 ? totalSensory / stats.totalWords : 0;
  if (density < 0.045 && stats.totalWords > 1000) {
    violations.push({
      ruleId: 'sense_density_low', ruleName: '感官密度',
      message: `感官词密度过低（${(density * 100).toFixed(1)}%），建议增加视觉/听觉/触觉描写`,
      severity: 'warning', suggestion: '每200-300字至少出现一次感官触发',
    });
  }
  const values = Object.values(sensory);
  const visualVal = sensory.visual || 0;
  const tactileVal = sensory.tactile || 0;
  const totalSensoryCount = values.reduce((a, b) => a + b, 0);
  const visualPct = totalSensoryCount > 0 ? visualVal / totalSensoryCount : 0;
  // 推断本章基调感官 = 实际占比最高的感官（与 pre-analysis 的章号轮换目标一致：
  // 轮换只是让各章主感官不同，检测器按真实分布判定即可，无需依赖章节号）。
  const senseEntries = Object.entries(sensory).filter(([, v]) => v > 0);
  const topSense = senseEntries.length > 0
    ? senseEntries.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
    : '';

  // 视觉占比偏高：保留铁则八"鼓励多感官"的 warning 语义，但不因此废章。
  // 这条规则统一表达"防单一霸权"，不再与下方触觉约束重复触发（合并 D5）。
  if (visualVal > 30 && visualPct > 0.45) {
    const nonVisual = totalSensoryCount - visualVal;
    violations.push({
      ruleId: 'sense_density_balance', ruleName: '感官密度',
      message: `视觉占比${(visualPct * 100).toFixed(0)}%（${visualVal}/${totalSensoryCount}）偏高，非视觉感官仅 ${nonVisual} 处。`,
      // 打磨(v4.9)：视觉是人类主导感官天然占优，>45%作为 error 门禁过严（几乎每章必废章）。
      // 降级为 warning——保留铁则八"鼓励多感官"指导意图，但不因此废章。
      severity: 'warning',
      suggestion: '每场景至少穿插1次非视觉感官：听觉（环境音）、触觉（温度/材质）、嗅觉（气味）。视觉>45%为建议级，建议增加非视觉感官描写。',
    });
  }

  // 触觉≥视觉 硬约束：仅在"触觉是本章占比最高感官（触觉基调章）"时才启用。
  // 修复 D1：视觉/听觉/嗅觉/味觉基调章中视觉天然最高，若无条件要求触觉≥视觉会误报 8/9 章。
  // 仅当 topSense==='触觉' 却 tactile<visual 时，才是真问题（本应主导却没压过视觉）。
  if (topSense === '触觉' && tactileVal > 0 && visualVal > tactileVal) {
    violations.push({
      ruleId: 'sense_tactile_below_visual', ruleName: '感官密度',
      message: `本章为触觉基调章，但触觉(${tactileVal}) < 视觉(${visualVal})，触觉未主导分布。`,
      severity: 'warning',
      suggestion: '作为触觉基调章，应让触觉描写权重压过视觉（温度/材质/痛痒等体感至少≥视觉处数）。',
    });
  }
  return violations;
}

function checkDataAnchor(text: string, stats: TextStats): Violation[] {
  const violations: Violation[] = [];
  // 阿拉伯数字+单位
  const arabicMatches = text.match(/\d+[\.\d]*\s*(度|米|秒|分|时|公斤|斤|步|尺|丈|里|息|倍|成|层|个|条|道|缕|股|重)/g);
  const arabicCount = arabicMatches ? arabicMatches.length : 0;
  // 中文数字+单位：一/二/三/四/五/六/七/八/九/十/零/两/几/半/百/千/万 + 单位
  const cnNumPattern = /(一|二|三|四|五|六|七|八|九|十|零|两|几|半|百|千|万){1,3}\s*(度|米|秒|分|时|公斤|斤|步|尺|丈|里|息|倍|成|层|个|条|道|缕|股|重|厘米|毫米|赫兹|圈)/g;
  const cnMatches = text.match(cnNumPattern);
  const cnCount = cnMatches ? cnMatches.length : 0;
  const dataCount = arabicCount + cnCount;
  const density = stats.totalWords > 0 ? dataCount / stats.totalWords * 1000 : 0;
  if (density > 5) {
    violations.push({ ruleId: 'data_anchor_high', ruleName: '数据锚点', message: `数据锚点密度过高（${density.toFixed(1)}/千字），建议减少数字+单位的精确描述`, severity: 'info', suggestion: '将精确数据替换为模糊描述（如"片刻"代替"三秒"）' });
  }
  if (density < 0.5 && stats.totalWords > 2000) {
    violations.push({ ruleId: 'data_anchor_low', ruleName: '数据锚点', message: `数据锚点密度过低（${density.toFixed(1)}/千字），长文本缺少具体感`, severity: 'info', suggestion: '适当加入时间、距离、温度等具体数据增强真实感' });
  }
  return violations;
}

function checkAnchorDensity(text: string, stats: TextStats): Violation[] {
  const violations: Violation[] = [];
  const minAnchor = Math.floor(stats.totalWords / 200);
  if (stats.totalWords >= 600 && stats.anchorCount < minAnchor) {
    violations.push({
      ruleId: 'anchor_density_low', ruleName: '锚点密度',
      message: `身体/具体锚点 ${stats.anchorCount} 个，低于预设"每200字1个"目标（应≥${minAnchor}）`,
      severity: 'warning',
      suggestion: '增加身体部位、具体物件、量化细节等锚点，增强文本实感与记忆点。',
    });
  }
  return violations;
}

function checkCharacterVoice(text: string, stats: TextStats): Violation[] {
  const violations: Violation[] = [];
  if (stats.dialogueRatio < 0.05) return violations;
  const usedTags = new Set<string>();
  for (const tag of COMMON_DIALOGUE_TAGS) { if (text.includes(tag)) usedTags.add(tag); }
  if (usedTags.size < 3 && stats.dialogueRatio > 0.15) {
    violations.push({
      ruleId: 'character_voice', ruleName: '角色台词差异化',
      message: `对话占比${(stats.dialogueRatio * 100).toFixed(0)}%，但对话标签种类不足（${usedTags.size}种），建议增加角色台词差异化`,
      severity: 'warning', suggestion: '为不同角色设计独特的说话方式、惯用语和语气词',
    });
  }
  return violations;
}

function checkDialogueTagRepeat(text: string): Violation[] {
  const violations: Violation[] = [];
  // 铁则十四：同一角色对话引导词每章最多3次"说/道"，超3次轮换。
  // 统计每个 2–4 字角色名 + 引导词（说/道/问/答/喊/叫）的出现次数。
  const tagRe = /([一-龥]{2,4})(说|道|问|答|喊|叫)/g;
  const counts: Record<string, number> = {};
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(text)) !== null) {
    const name = m[1];
    counts[name] = (counts[name] || 0) + 1;
  }
  for (const [name, c] of Object.entries(counts)) {
    if (c > 3) {
      violations.push({
        ruleId: 'dialogue_tag_repeat',
        ruleName: '对话引导词重复',
        message: `角色"${name}"的对话引导词（说/道/问/答）出现${c}次，超过每角色每章3次上限，易显单调。`,
        severity: 'warning',
        suggestion: '超过3次后轮换：声音压低/从牙缝挤出/没回答/点了下头/看了他一眼/转过身去。',
      });
    }
  }
  return violations;
}

function checkActionRollcall(text: string): Violation[] {
  const violations: Violation[] = [];
  const actionCounts: Record<string, number> = {};
  for (const verb of COMMON_ACTION_VERBS) {
    const regex = new RegExp(verb, 'g');
    const matches = text.match(regex);
    if (matches && matches.length >= 5) actionCounts[verb] = matches.length;
  }
  const repeated = Object.entries(actionCounts).map(([v, c]) => `${v}(${c}次)`);
  if (repeated.length > 0) {
    violations.push({
      ruleId: 'action_rollcall', ruleName: '动作点名册',
      message: `以下动作词重复过多：${repeated.join('、')}`,
      severity: 'warning', suggestion: '分散使用同义动作词，避免重复点名',
    });
  }
  return violations;
}

function checkExclamationQuota(text: string, stats: TextStats): Violation[] {
  const violations: Violation[] = [];
  const exclamationCount = (text.match(/！/g) || []).length;
  const density = stats.totalWords > 0 ? exclamationCount / stats.totalWords * 1000 : 0;
  if (exclamationCount > 10) {
    violations.push({ ruleId: 'exclamation_quota', ruleName: '感叹号配额', message: `感叹号过多（${exclamationCount}个，${density.toFixed(1)}个/千字），建议控制在5个以内`, severity: 'warning', suggestion: '用动作描写、环境渲染代替感叹号表达情绪' });
  } else if (exclamationCount > 5) {
    violations.push({ ruleId: 'exclamation_quota', ruleName: '感叹号配额', message: `感叹号偏多（${exclamationCount}个），建议精简`, severity: 'info', suggestion: '保留关键情绪爆发的感叹号，其余用句号' });
  }
  return violations;
}

// ============================================================
// Group 3: 结构密集型
// ============================================================

function checkSentenceWaveform(text: string): Violation[] {
  const violations: Violation[] = [];
  const sentences = text.split(/[。！？；\n]+/).filter((s) => s.trim().length > 0);
  if (sentences.length < 5) return violations;
  const lengths = sentences.map((s) => s.replace(/[，、\s]/g, '').length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev < 5 && mean > 10) {
    violations.push({ ruleId: 'sentence_waveform', ruleName: '句群波形', message: `句长标准差过低（${stdDev.toFixed(1)}），节奏单调，建议长短句交替`, severity: 'warning', suggestion: '使用短句（≤10字）制造紧张感，长句（30+字）渲染氛围' });
  }
  let sameRun = 1;
  for (let i = 1; i < lengths.length; i++) {
    const diff = Math.abs(lengths[i] - lengths[i - 1]);
    if (diff < 3) {
      sameRun++;
      if (sameRun >= 5) {
        const rangeStart = i - sameRun + 1;
        violations.push({ ruleId: 'sentence_waveform_same', ruleName: '句群波形', message: `第${rangeStart + 1}-${i + 1}句连续${sameRun}句长度相近（${lengths[rangeStart]}-${lengths[i]}字），建议插入不同长度的句子打破同频`, severity: 'info', suggestion: '在连续相似长度句子中插入短句或长句打破节奏' });
        sameRun = 1;
      }
    } else { sameRun = 1; }
  }
  return violations;
}

function checkPhraseRepetition(text: string): Violation[] {
  const violations: Violation[] = [];
  const phrases = text.split(/[，。！？；\n]+/).filter(s => s.trim().length >= 2);
  let consecutiveRun = 1, maxConsecutive = 0, maxPhrase = '';
  for (let i = 1; i < phrases.length; i++) {
    if (phrases[i].trim() === phrases[i - 1].trim()) {
      consecutiveRun++;
      if (consecutiveRun > maxConsecutive) { maxConsecutive = consecutiveRun; maxPhrase = phrases[i].trim(); }
    } else { consecutiveRun = 1; }
  }
  if (maxConsecutive >= 3) {
    violations.push({
      ruleId: 'phrase_repetition_consecutive', ruleName: '短语重复',
      message: `"${maxPhrase}" 连续重复 ${maxConsecutive} 次，严重破坏阅读体验`,
      severity: maxConsecutive >= 10 ? 'error' : 'warning', suggestion: '删除重复的短语，保留1-2次即可。重复不等于强调，等于偷懒。',
      fixes: maxConsecutive <= 5 ? [{ description: '删除重复短语', before: Array(maxConsecutive).fill(`"${maxPhrase}"`).join(' → '), after: `"${maxPhrase}"（保留1次）` }] : undefined,
    });
  }
  const phraseCount: Record<string, number> = {};
  for (const p of phrases) { const trimmed = p.trim(); if (trimmed.length >= 3) phraseCount[trimmed] = (phraseCount[trimmed] || 0) + 1; }
  const highFreq = Object.entries(phraseCount).filter(([, c]) => c >= 5).map(([phrase, count]) => ({ phrase, count })).sort((a, b) => b.count - a.count);
  if (highFreq.length > 0) {
    const top3 = highFreq.slice(0, 3);
    violations.push({
      ruleId: 'phrase_repetition_high_freq', ruleName: '短语重复',
      message: `全文高频短语：${top3.map(p => `"${p.phrase}"(${p.count}次)`).join('、')}${highFreq.length > 3 ? ` 等${highFreq.length}个` : ''}`,
      severity: highFreq[0].count >= 20 ? 'error' : 'warning', suggestion: '高频短语会制造机械感，用同义表达替换或直接删除多余重复',
      fixes: top3.map(p => ({ description: `替换"${p.phrase}"`, before: `"${p.phrase}" 出现${p.count}次`, after: '建议用同义表达替换，或删减至≤3次' })),
    });
  }
  return violations;
}

function checkNotShiPattern(text: string): Violation[] {
  const violations: Violation[] = [];
  const allMatches: string[] = [];
  // 白名单：不是+动词/人称/指示词 → 合法否定，非"不是X是Y"公式
  const whitelistPattern = /不是(来|去|走|说|看|做|想|要|能|会|在|有|他|她|我|你|它|那|这|人|林|周|陈|赵)/;
  const patternInline = /不是[^。！？\n]{1,25}而是|不是[^。！？\n]{1,20}，[^。！？\n]{0,5}是|并不是[^。！？\n]{1,20}而是/gi;
  const inlineMatches = text.match(patternInline);
  if (inlineMatches) {
    for (const m of inlineMatches) {
      if (!whitelistPattern.test(m)) allMatches.push(m);
    }
  }
  const patternCross = /不是[^。！？\n]{1,20}[。\n]+(?:\s*\n)*\s*是[^。！？\n]{1,30}/gi;
  const crossMatches = text.match(patternCross);
  if (crossMatches) {
    for (const m of crossMatches) {
      if (!whitelistPattern.test(m)) allMatches.push(m.replace(/\n+/g, '↵'));
    }
  }
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const soloNegations: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    const soloMatch = p.match(/^不是[^。！？]{1,30}[。]$/);
    if (soloMatch && !whitelistPattern.test(soloMatch[0])) {
      soloNegations.push(soloMatch[0]);
      if (i + 1 < paragraphs.length) {
        const nextP = paragraphs[i + 1].trim();
        if (/^是/.test(nextP)) { soloNegations.pop(); allMatches.push(soloMatch[0] + '↵' + nextP.substring(0, 20) + '...'); }
      }
    }
  }
  if (soloNegations.length > 0) allMatches.push(...soloNegations);
  if (allMatches.length > 0) {
    const unique = [...new Set(allMatches)];
    const fixes: FixSuggestion[] = unique.slice(0, 5).map(m => ({ description: '删除"不是X"，直接写Y的具体表现', before: m.length > 60 ? m.substring(0, 60) + '...' : m, after: '直接写Y的具体表现，不用"不是X是Y"绕弯子' }));
    // 修复 D2：对齐铁则十二"零容忍/硬禁 error"。原阈值 >=5 才 error（放水），
    // 导致作者写 4 处仍可过门禁，与契约承诺严重不符。改为出现即 error。
    // D2 方案 B（用户拍板 2026-08-22）：≤2处宽容（warning），≥3处才 error。
    // 1–2处为感官/认知辨识破格放行；仅卡≥3处排比式堆砌的真 AI 味。
    const severity = allMatches.length >= 3 ? 'error' : (allMatches.length >= 1 ? 'warning' : 'info');
    violations.push({ ruleId: 'not_shi_pattern', ruleName: '不是X是Y', message: `检测到${allMatches.length}处"不是X是Y"句式（含跨段/孤句模式）：${unique.slice(0, 4).join(' | ')}`, severity, suggestion: '直接写Y的具体表现，不用"不是X是Y"绕弯子。跨段写法（"不是X。↵是Y。"）与同句写法同等违规。白名单已排除"不是+动词/人称"的合法否定。', fixes });
  }
  return violations;
}

// 修复 D3：网文在危险/发现/选择/打断场景刻意用短促句制造节奏，属正当技法，不应一律判 warning。
// 放行条件：① 短句位于对话段；② 短句含动作/感官动词（走跑看说拿 + 冷热敷刺等），属有信息的节奏短句。
// 仅当连续短句既非对话、又不含动作/感官动词时才报 warning（真正碎成渣、无信息量的流水短句）。
const SHORT_SENTENCE_ACTION_SENSE = /走|跑|跳|看|说|拿|放|推|拉|打|踢|握|抓|站|坐|躺|蹲|转身|回头|抬手|迈步|伸|缩|冷|热|烫|疼|痛|麻|痒|酸|软|硬|重|轻|紧|松|沉|静|响|亮|暗|刺|闭|睁|吸|呼|咽|咬|点|摇|晃|颤|缩/;

function checkShortSentenceFragments(text: string, stats?: TextStats): Violation[] {
  const violations: Violation[] = [];
  // 标记每句是否属于对话段（对话里的短句多为角色台词节奏，放行）
  const dialogueRanges = new Set<number>();
  if (stats && stats.paragraphs) {
    stats.paragraphs.forEach(p => {
      if (p.type === 'dialogue' || p.type === 'mixed') {
        const idx = text.indexOf(p.text);
        if (idx >= 0) { for (let k = idx; k < idx + p.text.length; k++) dialogueRanges.add(k); }
      }
    });
  }
  // 段落感知：连续短句 run 只在【同一段落内】累加；跨段的「一句一段」鼓点（各占一段）不累加成 run，
  // 与源码树 碎句病（同一段落内连续短句才报）口径对齐，避免误伤刻意节奏。真·段内碎句仍照常抓。
  const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
  for (const para of paragraphs) {
    const sentences = para.split(/[。！？；]+/).filter((s) => s.trim().length > 0);
    const lengths = sentences.map((s) => s.replace(/[，、\s]/g, '').length);
    let run = 0, runStart = 0;
    for (let i = 0; i < lengths.length; i++) {
      const s = sentences[i].trim();
      // 引号句（对话/独白/心理活动）是网文正常节奏，混排在叙述段里也合法，
      // 不计入碎句 run，避免对话混排段（如"谁？"他问。没人答。）被误判为碎句
      if (/[“”「」『』‘’]/.test(s)) { run = 0; continue; }
      if (lengths[i] <= 8) {
        if (run === 0) runStart = i;
        run++;
        if (run >= 3) {
          // 检查这串连续短句是否整体可放行：含动作/感官动词，或落在对话段内
          const runText = sentences.slice(runStart, i + 1).join('');
          const inDialogue = dialogueRanges.size > 0 && dialogueRanges.has(text.indexOf(sentences[runStart]));
          const hasActionSense = SHORT_SENTENCE_ACTION_SENSE.test(runText);
          if (!inDialogue && !hasActionSense) {
            const fragmentTexts = sentences.slice(runStart, i + 1).map(x => x.trim());
            violations.push({ ruleId: 'short_sentence_fragment', ruleName: '碎句', message: `第${runStart + 1}-${i + 1}句连续${run}句≤8字且无动作/感官信息，碎句过多，建议用逗号合并`, severity: 'error', suggestion: '相邻无信息短句用逗号合并为一句；若属危险/发现/选择/打断的刻意节奏短句（含动作/感官动词）可保留。', fixes: [{ description: '用逗号合并碎句', before: fragmentTexts.join('。'), after: fragmentTexts.join('，') + '。' }] });
          }
          run = 0;
        }
      } else { run = 0; }
    }
  }
  return violations;
}

function checkBeatBreak(text: string, stats: TextStats): Violation[] {
  const violations: Violation[] = [];
  const paragraphs = stats.paragraphs.filter(p => p.type === 'narrative');
  for (const para of paragraphs) {
    const sentences = para.text.split(/[。！？]+/).filter(s => s.trim().length > 0);
    if (sentences.length < 2) continue;
    for (let i = 0; i < sentences.length - 1; i++) {
      const a = sentences[i].trim(), b = sentences[i + 1].trim();
      const aWords = (a.match(/[\u4e00-\u9fff]/g) || []).length;
      const bWords = (b.match(/[\u4e00-\u9fff]/g) || []).length;
      const actionVerbs = /走|跑|跳|看|说|拿|放|推|拉|打|踢|握|抓|站|坐|躺|蹲|转身|回头|抬手|迈步|伸|缩/;
      const senseWords = /冷|热|烫|疼|痛|麻|痒|酸|软|硬|重|轻|紧|松|沉|静|响|亮|暗|刺眼|刺耳|刺鼻/;
      if (aWords <= 15 && bWords <= 15 && actionVerbs.test(a) && senseWords.test(b)) {
        violations.push({ ruleId: 'beat_break', ruleName: '拍内断句', message: `第${para.index + 1}段检测到拍内断句："${a.substring(0, 20)}。"→"${b.substring(0, 20)}。"，同拍内可逗号串联`, severity: 'error', suggestion: '同拍内的动作和感受可用逗号串联（逗号数与逗句比仅为参考，读着顺就保留连写，严禁为压低逗句比把一句剁碎），换拍（换动作/换空间/换时间）用句号断开。', fixes: [{ description: '同拍可逗号串联', before: `${a}。${b}`, after: `${a}，${b}` }] });
        break;
      }
    }
  }
  return violations;
}

function checkReaderBurden(text: string, stats: TextStats): Violation[] {
  const violations: Violation[] = [];
  const properNouns = text.match(/《[^》]+》|"[^"]{2,}"|「[^」]{2,}」|[A-Z][a-z]+|\b\w{4,6}(?:境|宗|盟|阁|城|墟|法|术|诀|丹|器|阵|兽|族|脉|息|骨)\b/g);
  const nounCount = properNouns ? properNouns.length : 0;
  const nounDensity = stats.totalWords > 0 ? nounCount / stats.totalWords * 1000 : 0;
  if (nounDensity > 15) {
    violations.push({ ruleId: 'reader_burden_nouns', ruleName: '读者负担', message: `专有名词密度过高（${nounDensity.toFixed(1)}个/千字），读者理解负担重`, severity: 'warning', suggestion: '专有名词第一次出现必须绑定可见物件或动作。连续两个以上专有名词需拆分段落。' });
  }
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const overloadedParas: number[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const nounsInPara = paragraphs[i].match(/《[^》]+》|"[^"]{2,}"|「[^」]{2,}」|[A-Z][a-z]+|\b\w{4,6}(?:境|宗|盟|阁|城|墟|法|术|诀|丹|器|阵|兽|族|脉|息|骨)\b/g);
    if (nounsInPara && nounsInPara.length >= 4) overloadedParas.push(i + 1);
  }
  if (overloadedParas.length > 0) {
    violations.push({ ruleId: 'reader_burden_para', ruleName: '读者负担', message: `第${overloadedParas.slice(0, 5).join('、')}段专有名词过多（≥4个），一段不应塞入多个新信息`, severity: 'info', suggestion: '一段只给一个新信息。拆分过载段落，每段只引入一个核心概念。' });
  }
  return violations;
}

function checkAdjacentDuplicate(text: string): Violation[] {
  const violations: Violation[] = [];
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const duplicates: { para1: number; para2: number; content: string }[] = [];
  for (let i = 0; i < paragraphs.length - 1; i++) {
    const a = paragraphs[i].trim(), b = paragraphs[i + 1].trim();
    if (a === b && a.length > 3) { duplicates.push({ para1: i + 1, para2: i + 2, content: a.substring(0, 50) }); continue; }
    const aFirst = a.split(/[。！？\n]/)[0].trim(), bFirst = b.split(/[。！？\n]/)[0].trim();
    if (aFirst === bFirst && aFirst.length >= 3 && aFirst.length <= 30) { duplicates.push({ para1: i + 1, para2: i + 2, content: '首句重复：' + aFirst }); }
  }
  if (duplicates.length > 0) {
    violations.push({ ruleId: 'adjacent_duplicate', ruleName: '紧邻重复', message: `检测到${duplicates.length}处紧邻段落重复：${duplicates.map(d => `第${d.para1}-${d.para2}段"${d.content}"`).join('、')}`, severity: 'error', suggestion: '相邻段落不能完全重复或首句相同。删除重复段落，或合并为一段。', fixes: duplicates.map(d => ({ description: `删除第${d.para2}段重复内容`, before: d.content, after: '（删除重复段落，保留一段即可）' })) });
  }
  return violations;
}

// ============================================================
// 新增结构性检测器（v4.1 实战驱动）
// ============================================================

/** 场景碎片化检测：段落数过多=场景碎片化，导致每场景不足300字 */
function checkSceneCount(text: string): Violation[] {
  const violations: Violation[] = [];
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  // 按 >150汉字 的段落作为场景候选，相邻候选合并为一个场景
  let sceneCount = 0;
  let inScene = false;
  for (const p of paragraphs) {
    const trimmed = p.trim();
    const chineseChars = (trimmed.match(/[\u4e00-\u9fff]/g) || []).length;
    if (chineseChars > 150) {
      if (!inScene) { sceneCount++; inScene = true; }
    } else {
      inScene = false;
    }
  }
  if (sceneCount > 8) {
    violations.push({
      ruleId: 'scene_count_high', ruleName: '场景碎片化',
      message: `检测到${sceneCount}个场景，超过目标4-6个。场景碎片化导致每场景不足400字，读者无法沉浸。`,
      severity: 'warning',
      suggestion: '合并相邻场景，将8+场景压缩为4-6个核心场景，每个场景500-700字。场景碎片化是碎句和字数超标的根因。',
    });
  } else if (sceneCount > 6) {
    violations.push({
      ruleId: 'scene_count_moderate', ruleName: '场景碎片化',
      message: `检测到${sceneCount}个场景，略超目标4-6个。`,
      severity: 'info',
      suggestion: '合并相邻的同类型场景，减少场景切换次数。',
    });
  }
  return violations;
}

/** 对话过载检测：对话占比过高导致碎句和节奏失衡 */
function checkDialogueOverload(text: string, stats: TextStats): Violation[] {
  const violations: Violation[] = [];
  // 使用更精确的对话比例：统计引号内的文字占总字数的比例
  const dialogueMatches = text.match(/[“”「」『』‘’][^“”「」『』‘’]*[“”「」『』‘’]/g);
  let dialogueChars = 0;
  if (dialogueMatches) {
    for (const m of dialogueMatches) {
      dialogueChars += (m.match(/[\u4e00-\u9fff]/g) || []).length;
    }
  }
  const realDialogueRatio = stats.totalWords > 0 ? dialogueChars / stats.totalWords : 0;
  if (realDialogueRatio > 0.35) {
    violations.push({
      ruleId: 'dialogue_overload_severe', ruleName: '对话过载',
      message: `对话占比${(realDialogueRatio * 100).toFixed(0)}%，严重超标（目标≤25%）。对话密集导致天然碎句，检测工具无法修复。`,
      severity: 'warning',
      suggestion: '将部分对话转化为动作+感官描写。一问一答拆成：动作→反应→简短对话→环境回应。',
    });
  } else if (realDialogueRatio > 0.25) {
    violations.push({
      ruleId: 'dialogue_overload_moderate', ruleName: '对话过载',
      message: `对话占比${(realDialogueRatio * 100).toFixed(0)}%，略超目标（≤25%）。`,
      severity: 'info',
      suggestion: '适当压缩对话，用动作和神态代替部分对白。',
    });
  }
  return violations;
}

/**
 * 排比堆叠检测（v4.9 新增）
 * 
 * 检测同章内相同句式结构的重复使用，包括：
 * 1. 重复动词引导的排比：穿过X，穿过Y，穿过Z
 * 2. 重复介词引导的堆叠：往X里流，往Y里渗，往Z里钻
 * 3. 重复"X的Y"句式过度密集
 * 
 * 检测逻辑：
 * - 提取所有句子，检测相同动词/介词开头的子句连续出现
 * - 统计每句的"的"字密度，过高标记为堆砌
 */
function checkStyleStacking(text: string, stats: TextStats): Violation[] {
  const violations: Violation[] = [];
  const paragraphs = stats.paragraphs;
  if (paragraphs.length < 3) return violations;

  // ====== 检测1：同动词排比堆叠 ======
  // 匹配模式：动词+X，动词+Y，动词+Z（连续≥3处）
  // 注意：仅保留真动词/方向动词。单字介词'在''从''往'已移除——
  // 它们会匹配"在他身体里，""从桌上，"等正常方位短语，造成海量误杀（见打磨记录）。
  const stackingVerbs = ['穿过', '听见', '看见', '闻到', '感到', '触到', '沿着', '顺着'];
  const stackingPattern = new RegExp(
    `(${stackingVerbs.join('|')})[^，。！？\\n]{1,30}[，]`,
    'g'
  );

  const allMatches: { verb: string; context: string }[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = stackingPattern.exec(text)) !== null) {
    allMatches.push({ verb: sm[1], context: sm[0].substring(0, 40) });
  }

  // 检测连续出现的相同动词堆叠
  const verbGroups: { verb: string; count: number; samples: string[] }[] = [];
  let currentVerb = '';
  let currentCount = 0;
  let currentSamples: string[] = [];
  for (const m of allMatches) {
    if (m.verb === currentVerb) {
      currentCount++;
      if (currentSamples.length < 3) currentSamples.push(m.context);
    } else {
      if (currentCount >= 3) {
        verbGroups.push({ verb: currentVerb, count: currentCount, samples: [...currentSamples] });
      }
      currentVerb = m.verb;
      currentCount = 1;
      currentSamples = [m.context];
    }
  }
  if (currentCount >= 3) {
    verbGroups.push({ verb: currentVerb, count: currentCount, samples: [...currentSamples] });
  }

  // 合并所有堆叠为一组违规
  if (verbGroups.length > 0) {
    const totalStacks = verbGroups.reduce((sum, g) => sum + g.count, 0);
    const topVerbs = verbGroups.slice(0, 3).map(g => `"${g.verb}"×${g.count}`);
    violations.push({
      ruleId: 'style_stacking_verb',
      ruleName: '排比堆叠',
      message: `检测到${verbGroups.length}组排比堆叠（共${totalStacks}处）：${topVerbs.join('、')}。同句式重复≥3次制造机械感。`,
      severity: totalStacks >= 3 ? 'error' : 'warning',
      suggestion: '每个场景至多1处排比。超过1处换句型——第2处用动作接感官，第3处用环境回应。≥6处为error，阻断生成。',
      fixes: verbGroups.slice(0, 2).map(g => ({
        description: `替换"${g.verb}"排比堆叠（${g.count}处）`,
        before: g.samples.join(' | '),
        after: '保留1处排比，其余换为动作+感官或环境回应句式',
      })),
    });
  }

  // ====== 检测2："的"字密度异常 ======
  for (const para of paragraphs) {
    if (para.type !== 'narrative') continue;
    const deCount = (para.text.match(/的/g) || []).length;
    const deDensity = para.wordCount > 0 ? deCount / para.wordCount : 0;
    if (deDensity > 0.08 && para.wordCount > 50) {
      violations.push({
        ruleId: 'style_stacking_de',
        ruleName: '排比堆叠',
        message: `第${para.index + 1}段"的"字密度${(deDensity * 100).toFixed(1)}%（${deCount}个/${para.wordCount}字），"X的Y"堆砌过度。`,
        severity: 'info',
        suggestion: '将"的"字结构拆分为独立短句或动作描写。每3个"的"至少换一次句式。',
      });
    }
  }

  // ====== 检测3：段落开头主角名重复（铁则十五） ======
  const protagonistNames = ['林深', '林浅', '周野', '赵明远', '赵静留', '陈老师', '韩立', '李火旺', '张'];
  let consecutiveNameRun = 0;
  let nameRunStart = 0;
  let currentName = '';
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const firstWord = p.text.replace(/[\s“”「」『』‘’]/g, '').substring(0, 2);
    const matchedName = protagonistNames.find(n => firstWord.startsWith(n));
    if (matchedName) {
      if (matchedName === currentName) {
        consecutiveNameRun++;
        if (consecutiveNameRun >= 3 && nameRunStart === i - consecutiveNameRun + 1) {
          nameRunStart = i - consecutiveNameRun + 1;
        }
      } else {
        if (consecutiveNameRun >= 3) {
          violations.push({
            ruleId: 'style_stacking_name',
            ruleName: '段落开头重复',
            message: `第${nameRunStart + 1}-${i}段连续${consecutiveNameRun}段以"${currentName}"开头，违反铁则十五。`,
            severity: 'warning',
            suggestion: '禁止连续3段同一主角名开头。轮换为：动作起头、感官起头、环境起头、对话起头。',
          });
        }
        currentName = matchedName;
        consecutiveNameRun = 1;
        nameRunStart = i;
      }
    } else {
      if (consecutiveNameRun >= 3) {
        violations.push({
          ruleId: 'style_stacking_name',
          ruleName: '段落开头重复',
          message: `第${nameRunStart + 1}-${i}段连续${consecutiveNameRun}段以"${currentName}"开头，违反铁则十五。`,
          severity: 'warning',
          suggestion: '禁止连续3段同一主角名开头。轮换为：动作起头、感官起头、环境起头、对话起头。',
        });
      }
      consecutiveNameRun = 0;
      currentName = '';
    }
  }
  // 尾部检查
  if (consecutiveNameRun >= 3) {
    violations.push({
      ruleId: 'style_stacking_name',
      ruleName: '段落开头重复',
      message: `第${nameRunStart + 1}-${paragraphs.length}段连续${consecutiveNameRun}段以"${currentName}"开头，违反铁则十五。`,
      severity: 'warning',
      suggestion: '禁止连续3段同一主角名开头。轮换为：动作起头、感官起头、环境起头、对话起头。',
    });
  }

  return violations;
}

// ============================================================
// 跨章重复句式检测（v4.9 新增）
// 读上章 fingerprint 的 verbStacking 具体句式，若本章出现同构句式则报 warning
// 白名单：对话段落内的同构不标记（角色口头禅/伏笔呼应）
// ============================================================

export interface PrevChapterVerbStacking {
  verb: string;
  count: number;
  samples: string[];
}

export function checkCrossChapterRepeat(
  text: string,
  stats: TextStats,
  prevVerbStacking: PrevChapterVerbStacking[]
): Violation[] {
  const violations: Violation[] = [];
  if (!prevVerbStacking || prevVerbStacking.length === 0) return violations;

  const narrativeText = stats.paragraphs.filter(p => p.type === 'narrative').map(p => p.text).join('\n');

  // 高频功能词白名单：这些词（介词/代词/副词/助词）必然高频出现，
  // 即使上章被误记为"排比动词"也不标记跨章复发，避免海量误杀。
  const STOPWORDS = new Set(['在', '从', '往', '是', '有', '他', '我', '你', '就', '都', '还', '又', '把', '被', '让', '给', '向', '对', '和', '与', '着', '了', '的', '而', '却', '也', '便']);

  const repeatedVerbs: { verb: string; count: number }[] = [];

  for (const prev of prevVerbStacking) {
    // 跳过高频功能词，避免跨章误杀（如"在""从"等方位介词）
    if (STOPWORDS.has(prev.verb)) continue;
    // 对每个上章堆叠动词，检查本章叙事段中是否出现同构
    const escapedVerb = prev.verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 匹配模式：verb + 任意内容 + 逗号（连续出现）
    const pattern = new RegExp(`${escapedVerb}[^，。！？\\n]{1,30}[，]`, 'g');
    const matches = narrativeText.match(pattern);
    if (matches && matches.length >= 3) {
      // narrativeText 仅含叙述段，已天然排除对话中的同构（白名单语义内置），直接计数
      repeatedVerbs.push({ verb: prev.verb, count: matches.length });
    }
  }

  if (repeatedVerbs.length > 0) {
    const topVerbs = repeatedVerbs.slice(0, 2).map(v => `"${v.verb}"×${v.count}`);
    violations.push({
      ruleId: 'cross_chapter_repeat',
      ruleName: '跨章重复句式',
      message: `检测到${repeatedVerbs.length}种上章排比句式在本章叙事段中复发：${topVerbs.join('、')}。连续2章同构句式降低文风多样性。`,
      severity: 'warning',
      suggestion: '上章已使用的排比动词（' + repeatedVerbs.map(v => v.verb).join('、') + '）在本章中需替换为不同动词或不同句式。对话中的同构已自动白名单过滤。',
      fixes: repeatedVerbs.slice(0, 2).map(v => ({
        description: `替换"${v.verb}"同构句式（${v.count}处）`,
        before: `"${v.verb}X，${v.verb}Y，${v.verb}Z"（上章同款）`,
        after: '改用分镜式：动作落点→环境回应→感官收束，或换用不同引导动词',
      })),
    });
  }

  return violations;
}

// ============================================================
// 感官密度闭环升级（v4.9）
// 上章 sense_density 为 error → 本章若仍超阈值，severity 升一级
// ============================================================

export function checkSenseDensityWithPrev(stats: TextStats, prevSenseError: boolean): Violation[] {
  const violations = checkSenseDensity(stats);
  if (!prevSenseError) return violations;

  // 打磨(v4.9)：感官密度已降级为 warning，不再升级为 error（避免连续章节连环废章）。
  // 保留"复发提醒"：上章有问题且本章仍超标时，提示作者重点补非视觉感官，但不改 severity。
  for (const v of violations) {
    if (v.ruleId.startsWith('sense_') && v.severity !== 'error') {
      v.message += '（上章已触发感官密度问题，本章复发，建议重点补非视觉感官）';
    }
  }
  return violations;
}

/** 字数硬约束：超标>20%直接报error，触发重写而非修补。targetWords从命令行--target参数传入 */
export function checkWordCountHard(text: string, stats: TextStats, targetWords?: number): Violation[] {
  const violations: Violation[] = [];
  const target = targetWords || 3000;
  const ratio = stats.totalWords / target;
  if (ratio > 1.2) {
    violations.push({
      ruleId: 'word_count_hard_error', ruleName: '字数硬约束',
      message: `实际字数${stats.totalWords}，超出目标${target}字${((ratio - 1) * 100).toFixed(0)}%。超过20%上限，章节不合格。`,
      severity: 'error',
      suggestion: '禁止修补！回到写前分析重新规划镜头链，将场景数压缩到4-6个，每场景500-700字，全文重写。修补只会产生更多碎句。',
    });
  }
  return violations;
}

// ============================================================
// 字数达标（独立检测器，需要 targetWords 参数）
// ============================================================

export function checkWordCountTarget(text: string, stats: TextStats, targetWords?: number): Violation[] {
  const violations: Violation[] = [];
  const target = targetWords || 3000;
  const ratio = stats.totalWords / target;
  // 治本同步（接 B 组源码树 R4，2026-08-25）：不再 2700 死闸硬 error。
  // 短而空→error 拦"写空"；短而密→warning 放行（精炼好文不被误判）。
  // 注意：CLI 树 sensoryMentions 字段名与源码树不同（visual/auditory/tactile/olfactory/gustatory）。
  // 方案 B（2026-08-29 定稿，2026-08-29 复核）：分层门禁。
  // 原门槛 `sensoryTotal<3 && anchorCount<3` 在真实章节恒 false（锚点/千字全样本 min 19.4 > 12），密度判空分支是死代码。
  // 复核删除密度豁免分支，只留硬下限：低于 70% 即 error；70%–100% 走下方"字数不足"warning（不再做密度判空）。
  //   ratio < 0.7  → 绝对下限，不论密度一律 error；
  //   ratio 0.7–1.0 → 仅 warning 字数不足（不判密度）；
  //   ratio > 1.5  → 超标 info。
  if (ratio < 0.7) {
    // 绝对下限：过短即不合格。短而密不再豁免——密度高只证明不注水，不证明篇幅达标。
    violations.push({ ruleId: 'word_count_hollow', ruleName: '字数过短（写空）', message: `实际字数${stats.totalWords}，目标${target}字，完成率仅${(ratio * 100).toFixed(0)}%，低于70%下限，判定写空。`, severity: 'error', suggestion: `补充场景与细节至目标的70%以上（≥${Math.round(target * 0.7)}字）。短而密不再豁免：密度高只证明不注水，不证明篇幅达标。禁止修补，回到写前分析重新规划镜头链后扩写。` });
  } else if (ratio < 1.0) {
    violations.push({ ruleId: 'word_count_below', ruleName: '字数不足', message: `实际字数${stats.totalWords}，目标${target}字，完成率${(ratio * 100).toFixed(0)}%（低于100%目标）。`, severity: 'warning', suggestion: `扩展内容至目标字数${target}，当前差距${target - stats.totalWords}字。` });
  } else if (ratio > 1.5) {
    violations.push({ ruleId: 'word_count_long', ruleName: '字数超标', message: `实际字数${stats.totalWords}，目标${target}字，超出${(ratio * 100 - 100).toFixed(0)}%。`, severity: 'info', suggestion: `考虑拆分章节或精简内容，目标字数${target}。` });
  }
  return violations;
}

// ============================================================
// 跨章检测
// ============================================================

export function checkCrossChapters(texts: string[]): CrossChapterResult {
  const result: CrossChapterResult = {
    globalPhrases: [], globalClichés: [], openingPatterns: [],
    characterIntros: [], plotThreads: [], conceptPacing: [], settingIssues: [],
    paragraphPatterns: [],
  };
  // 原有：跨章重复短语
  const globalPhraseMap: Record<string, { chapters: Set<number>; totalCount: number }> = {};
  for (let ci = 0; ci < texts.length; ci++) {
    const phrases = texts[ci].split(/[，。！？；\n]+/).filter(s => s.trim().length >= 3);
    const seen = new Set<string>();
    for (const p of phrases) {
      const trimmed = p.trim();
      if (!globalPhraseMap[trimmed]) globalPhraseMap[trimmed] = { chapters: new Set(), totalCount: 0 };
      globalPhraseMap[trimmed].chapters.add(ci + 1);
      if (!seen.has(trimmed)) { seen.add(trimmed); globalPhraseMap[trimmed].totalCount += 1; } else { globalPhraseMap[trimmed].totalCount += 1; }
    }
  }
  for (const [phrase, data] of Object.entries(globalPhraseMap)) {
    if (data.chapters.size >= 2 && data.totalCount >= 8) { result.globalPhrases.push({ phrase, chapters: Array.from(data.chapters).sort((a, b) => a - b), totalCount: data.totalCount }); }
  }
  result.globalPhrases.sort((a, b) => b.totalCount - a.totalCount);
  // 原有：跨章套路词
  const clichéChapterMap: Record<string, { chapters: Set<number>; totalCount: number }> = {};
  for (let ci = 0; ci < texts.length; ci++) {
    for (const { pattern, name } of CLICHE_PATTERNS) {
      const matches = texts[ci].match(pattern);
      if (matches && matches.length > 0) {
        if (!clichéChapterMap[name]) clichéChapterMap[name] = { chapters: new Set(), totalCount: 0 };
        clichéChapterMap[name].chapters.add(ci + 1); clichéChapterMap[name].totalCount += matches.length;
      }
    }
  }
  for (const [name, data] of Object.entries(clichéChapterMap)) {
    if (data.totalCount >= 5) { result.globalClichés.push({ name, chapters: Array.from(data.chapters).sort((a, b) => a - b), totalCount: data.totalCount }); }
  }
  result.globalClichés.sort((a, b) => b.totalCount - a.totalCount);
  // 原有：开头模式
  const openingPatterns = [
    { pattern: /眼中精光一闪|闪过一丝精光|眸中精光闪烁/, name: '眼中精光一闪' },
    { pattern: /深吸一口气|长长吐出一口浊气|缓缓吐出一口气/, name: '深吸一口气' },
    { pattern: /此刻的|此时的|眼下的/, name: '此刻的XX' },
    { pattern: /话音刚落|话音未落|话音落下/, name: '话音刚落' },
    { pattern: /清晨|天刚亮|翌日清晨|阳光透过/, name: '清晨醒来' },
  ];
  const openingMatches: Record<string, Set<number>> = {};
  for (let ci = 0; ci < texts.length; ci++) {
    const opening = texts[ci].substring(0, 200);
    for (const { pattern, name } of openingPatterns) { if (pattern.test(opening)) { if (!openingMatches[name]) openingMatches[name] = new Set(); openingMatches[name].add(ci + 1); } }
  }
  for (const [pattern, chapters] of Object.entries(openingMatches)) { if (chapters.size >= 2) result.openingPatterns.push({ pattern, chapters: Array.from(chapters).sort((a, b) => a - b) }); }

  // ====== 新增盲区检测 ======

  // 盲区1：角色登场一致性 — 检测角色首次出现时是否在前文有铺垫
  const characterNames = ['林深', '林浅', '周野', '陈老师', '赵明远', '赵静留'];
  const characterIntroChapters: Record<string, { firstMention: number; firstDetail: number; detailSample: string }> = {};
  for (const name of characterNames) characterIntroChapters[name] = { firstMention: -1, firstDetail: -1, detailSample: '' };
  for (let ci = 0; ci < texts.length; ci++) {
    for (const name of characterNames) {
      if (texts[ci].includes(name)) {
        if (characterIntroChapters[name].firstMention === -1) characterIntroChapters[name].firstMention = ci + 1;
        // 检测"详解式登场"：名字+外貌/身份/背景描述（≥30字上下文）
        const detailPattern = new RegExp(name + '.{0,50}(?:戴|穿|眼镜|高三|物理|老师|学长|妈妈|母亲|儿子|三年前|十四年)', 'g');
        const detailMatch = texts[ci].match(detailPattern);
        if (detailMatch && characterIntroChapters[name].firstDetail === -1) {
          characterIntroChapters[name].firstDetail = ci + 1;
          characterIntroChapters[name].detailSample = detailMatch[0].substring(0, 60);
        }
      }
    }
  }
  for (const [name, data] of Object.entries(characterIntroChapters)) {
    if (data.firstDetail > 0 && data.firstMention === data.firstDetail) {
      // 角色首次出现即带详细描述，无铺垫
      if (data.firstDetail >= 3) { // 第3章及以后才首次登场且无铺垫，标记
        result.characterIntros.push({
          name, firstChapter: data.firstDetail,
          detailLevel: '无铺垫登场',
          issue: `角色"${name}"在第${data.firstDetail}章首次出现即带详细描述，前${data.firstDetail - 1}章无任何提及。建议在前文增加伏笔或铺垫。`,
        });
      }
    }
  }

  // 盲区2：情节线收束 — 追踪关键实体在前后章的分布
  const plotEntities = [
    { name: '陈老师', patterns: ['陈老师', '班主任'] },
    { name: '戒痕', patterns: ['戒痕'] },
    { name: '第一批学生', patterns: ['第一批'] },
    { name: '物理老师', patterns: ['物理老师'] },
  ];
  for (const entity of plotEntities) {
    const chapters: number[] = [];
    for (let ci = 0; ci < texts.length; ci++) {
      if (entity.patterns.some(p => texts[ci].includes(p))) chapters.push(ci + 1);
    }
    if (chapters.length > 0) {
      const status: 'open' | 'resolved' = chapters.includes(texts.length) ? 'resolved' : 'open';
      result.plotThreads.push({ name: entity.name, chapters, status });
    }
  }

  // 盲区3：信息释放节奏 — 检测专有名词首次出现的章节分布
  const conceptTerms = ['摹本', '母体', '种子', '觉醒', '闪光', '初觉', '机房', '玻璃罩子', '赵静留'];
  const conceptFirstAppear: Record<string, number> = {};
  for (let ci = 0; ci < texts.length; ci++) {
    for (const term of conceptTerms) {
      if (texts[ci].includes(term) && !(term in conceptFirstAppear)) {
        conceptFirstAppear[term] = ci + 1;
      }
    }
  }
  const chapterConcepts: Record<number, string[]> = {};
  for (const [term, ch] of Object.entries(conceptFirstAppear)) {
    if (!chapterConcepts[ch]) chapterConcepts[ch] = [];
    chapterConcepts[ch].push(term);
  }
  for (let ci = 1; ci <= texts.length; ci++) {
    const concepts = chapterConcepts[ci] || [];
    result.conceptPacing.push({ chapter: ci, newConcepts: concepts, density: concepts.length });
  }

  // 盲区4：跨章设定一致性 — 检测关键设定数值的跨章矛盾
  const settingChecks = [
    { key: '疤的温度', pattern: /(?:疤|骨头).{0,5}(?:温度|烫).{0,5}?(\d{1,2})度/g, extract: (m: RegExpMatchArray) => parseInt(m[1]) },
    { key: '林浅觉醒时间', pattern: /(?:林浅|她).{0,10}(?:觉醒|觉醒之后).{0,10}(?:三个?月|几[个天]|今天)/g, extract: (_m: RegExpMatchArray) => 0 },
  ];
  for (const check of settingChecks) {
    const chapterValues: { chapter: number; values: string[] }[] = [];
    for (let ci = 0; ci < texts.length; ci++) {
      const matches = [...texts[ci].matchAll(check.pattern)];
      if (matches.length > 0) {
        chapterValues.push({ chapter: ci + 1, values: matches.map(m => m[0].substring(0, 40)) });
      }
    }
    if (chapterValues.length >= 2) {
      // 检查是否在不同章节有矛盾表述
      const allValues = chapterValues.flatMap(cv => cv.values);
      const uniqueValues = [...new Set(allValues)];
      if (uniqueValues.length >= 2) {
        result.settingIssues.push({
          key: check.key,
          chapters: chapterValues.map(cv => cv.chapter),
          description: `"${check.key}"在${chapterValues.length}个章节中出现不同表述：${uniqueValues.slice(0, 3).join('；')}`,
        });
      }
    }
  }

  // 盲区5：段落结构重复 — 检测跨章重复的段落结构模式
  // 提取每章每段的"结构指纹"：首3字 + 段落类型 + 长度分类
  const paraFingerprints: Record<string, { chapters: Set<number>; totalCount: number }> = {};
  const lengthClass = (wc: number) => wc <= 30 ? 'S' : wc <= 80 ? 'M' : wc <= 150 ? 'L' : 'XL';
  for (let ci = 0; ci < texts.length; ci++) {
    const paras = texts[ci].split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const seenInChapter = new Set<string>();
    for (const p of paras) {
      const trimmed = p.trim();
      const wc = (trimmed.match(/[\u4e00-\u9fff]/g) || []).length;
      if (wc < 10) continue; // 跳过过短段落
      const pType = classifyParagraph(trimmed);
      const first3 = trimmed.replace(/[\s“”「」『』‘’]/g, '').substring(0, 3);
      const fp = `${first3}|${pType}|${lengthClass(wc)}`;
      if (!paraFingerprints[fp]) paraFingerprints[fp] = { chapters: new Set(), totalCount: 0 };
      paraFingerprints[fp].chapters.add(ci + 1);
      if (!seenInChapter.has(fp)) { seenInChapter.add(fp); paraFingerprints[fp].totalCount += 1; } else { paraFingerprints[fp].totalCount += 1; }
    }
  }
  for (const [fp, data] of Object.entries(paraFingerprints)) {
    if (data.chapters.size >= 3 && data.totalCount >= 4) {
      const [first3, pType, lc] = fp.split('|');
      const typeNames: Record<string, string> = { narrative: '叙事', dialogue: '对话', mixed: '混合' };
      result.paragraphPatterns.push({
        pattern: `首"${first3}"+${typeNames[pType] || pType}+${lc}级`,
        chapters: Array.from(data.chapters).sort((a, b) => a - b),
        totalCount: data.totalCount,
      });
    }
  }
  result.paragraphPatterns.sort((a, b) => b.totalCount - a.totalCount);

  return result;
}

// ============================================================
// 主检测函数
// ============================================================

/** 分组检测结果 */
export interface GroupedResult {
  groupName: string;
  violations: Violation[];
}

/** 按组执行检测，返回分组结果 */
export function checkChapterGrouped(text: string, targetWords?: number, protagonistName?: string): { stats: TextStats; groups: GroupedResult[] } {
  const stats = computeTextStats(text);
  const groups: GroupedResult[] = [];

  for (const group of DETECTOR_GROUPS) {
    const groupViolations: Violation[] = [];
    for (const detector of group.detectors) {
      groupViolations.push(...detector.fn(text, stats, protagonistName));
    }
    groups.push({ groupName: group.name, violations: groupViolations });
  }

  return { stats, groups };
}

/** 单章检测（合并所有违规） */
export function checkChapter(text: string, targetWords?: number, protagonistName?: string, excludedTextureWords?: string[]): { stats: TextStats; violations: Violation[] } {
  const { stats, groups } = checkChapterGrouped(text, targetWords, protagonistName);

  const allViolations = [
    ...groups[0].violations,
    ...groups[1].violations,
    ...groups[2].violations,
    ...checkWordCountHard(text, stats, targetWords),
    ...checkWordCountTarget(text, stats, targetWords),
    ...checkTextureVariety(text, excludedTextureWords),
    ...checkEmotionArc(text),
    ...checkUnsaidGap(text, stats),
    ...checkEmotionTellDistribution(text),
  ];

  return { stats, violations: allViolations };
}

/** 异步批量检测：多章并行扫描 */
export async function checkChaptersAsync(
  chapters: { name: string; text: string }[],
  targetWords?: number,
  protagonistName?: string,
  excludedTextureWords?: string[]
): Promise<{ name: string; stats: TextStats; violations: Violation[] }[]> {
  // 使用 Promise.all 让各章检测在微任务中交错执行
  const results = await Promise.all(
    chapters.map(ch =>
      Promise.resolve().then(() => {
        const { stats, violations } = checkChapter(ch.text, targetWords, protagonistName, excludedTextureWords);
        return { name: ch.name, stats, violations };
      })
    )
  );
  return results;
}

// ============================================================
// 格式化输出
// ============================================================

export function formatSingleReport(stats: TextStats, violations: Violation[], chapterName?: string): string {
  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');
  const infos = violations.filter(v => v.severity === 'info');
  const lines: string[] = [];
  lines.push('╔══════════════════════════════════════╗');
  lines.push(`║   InkWeave v5.2 章节质量检测报告    ${chapterName ? '— ' + chapterName : ''}`);
  lines.push('╚══════════════════════════════════════╝');
  lines.push('');

  const baseScore = 100;
  let penalty = 0;
  for (const v of violations) { if (v.severity === 'error') penalty += 10; else if (v.severity === 'warning') penalty += 4; else penalty += 1; }
  const finalScore = Math.max(0, baseScore - penalty);
  const grade = finalScore >= 90 ? 'A' : finalScore >= 80 ? 'B' : finalScore >= 60 ? 'C' : 'D';
  const passed = finalScore >= 85;

  lines.push(`## 检测结果：${passed ? '✅ 通过' : '❌ 未通过'} | 评分 ${finalScore}/100（${grade}级）`);
  lines.push(`评分分解：基础100 - 错误${errors.length}×10 - 警告${warnings.length}×4 - 提示${infos.length}×1 = ${finalScore}`);
  lines.push(`违规总计：🔴 ${errors.length} 错误 | 🟡 ${warnings.length} 警告 | 🔵 ${infos.length} 提示`);
  lines.push('');

  const narrativeCount = stats.paragraphs.filter(p => p.type === 'narrative').length;
  const dialogueCount = stats.paragraphs.filter(p => p.type === 'dialogue').length;
  const mixedCount = stats.paragraphs.filter(p => p.type === 'mixed').length;
  lines.push(`段落分类：叙事${narrativeCount}段 | 对话${dialogueCount}段 | 混合${mixedCount}段`);
  lines.push('');

  lines.push('## 基础统计');
  lines.push('| 指标 | 数值 |');
  lines.push('|------|------|');
  lines.push(`| 总字数 | ${stats.totalWords} |`);
  lines.push(`| 句数 | ${stats.sentenceCount} |`);
  lines.push(`| 平均句长 | ${stats.avgSentenceLength.toFixed(1)}字 |`);
  lines.push(`| 短句比例 | ${(stats.shortSentenceRatio * 100).toFixed(1)}% |`);
  lines.push(`| 段落数 | ${stats.paragraphCount} |`);
  lines.push(`| 对话比例 | ${(stats.dialogueRatio * 100).toFixed(1)}% |`);
  lines.push(`| 身体锚点 | ${stats.anchorCount} |`);
  lines.push(`| 感官词 | 视觉${stats.sensoryMentions.visual}/听觉${stats.sensoryMentions.auditory}/触觉${stats.sensoryMentions.tactile}/嗅觉${stats.sensoryMentions.olfactory}/味觉${stats.sensoryMentions.gustatory} |`);
  lines.push('');

  if (violations.length === 0) {
    lines.push('## ✓ 无违规项，章节通过全部检测');
  } else {
    if (errors.length > 0) {
      lines.push('## 🔴 错误（必须修复）');
      lines.push('');
      errors.forEach((v, i) => {
        lines.push(`### 错误 #${i + 1}：${v.ruleName}${v.paragraphType ? ` [${v.paragraphType}段]` : ''}`);
        lines.push(`> ${v.message}`);
        lines.push(`**修复建议**：${v.suggestion}`);
        if (v.fixes) for (const fix of v.fixes) { lines.push(`- 💡 ${fix.description}`); lines.push(`  \`${fix.before}\` → \`${fix.after}\``); }
        lines.push('');
      });
    }
    if (warnings.length > 0) {
      lines.push('## 🟡 警告（建议修复）');
      lines.push('');
      warnings.forEach((v, i) => {
        lines.push(`### 警告 #${i + 1}：${v.ruleName}${v.paragraphType ? ` [${v.paragraphType}段]` : ''}`);
        lines.push(`> ${v.message}`);
        lines.push(`**修复建议**：${v.suggestion}`);
        if (v.fixes) for (const fix of v.fixes.slice(0, 2)) { lines.push(`- 💡 ${fix.description}`); }
        lines.push('');
      });
    }
    if (infos.length > 0) {
      lines.push('## 🔵 提示');
      lines.push('');
      infos.forEach((v, i) => {
        lines.push(`${i + 1}. **${v.ruleName}**${v.paragraphType ? ` [${v.paragraphType}段]` : ''}：${v.message}`);
      });
      lines.push('');
    }
  }
  lines.push('---');
  lines.push(`*检测时间：${new Date().toLocaleString('zh-CN')} | InkWeave v5.2*`);
  return lines.join('\n');
}

// ============================================================
// P1 · 跨章事实一致性校验（warning 级，防长文崩坏）
// ============================================================

/**
 * 比对上一章事实指纹与本章正文，检测长程一致性问题。
 * 设计：宁缺毋滥 + 全 warning 级，避免误杀真实写作。
 * 覆盖：时间线矛盾 / 专有名词突变 / 伏笔凭空消失 / 角色极端状态漂移。
 */
export function checkCrossChapterFacts(
  text: string,
  prevFacts: ChapterFact | null,
  curVoicePrints?: { name: string; tics: string[] }[]
): Violation[] {
  const violations: Violation[] = [];
  if (!prevFacts) return violations;

  // —— 1. 时间线矛盾：上章夜晚锚，本章直接出现天亮/日光线索且无过渡交代 ——
  const prevHasNight = prevFacts.timeAnchors.some(a => /夜|深|午夜|黄昏|傍晚|日落/.test(a));
  const prevHasDay = prevFacts.timeAnchors.some(a => /清晨|拂晓|天亮|上午|正午|中午|下午|日出/.test(a));
  if (prevHasNight && !prevHasDay) {
    // 本章若直接出现"天亮/阳光/日出"类强白昼信号，且未交代过渡 → 矛盾
    const dayBreak = /(天亮了|太阳|阳光|日出|天光大亮|晨光)/.test(text);
    const noTransition = !/(到了早上|天快亮|熬到天明|一夜过去|第二天|次日|第二天清早)/.test(text);
    if (dayBreak && noTransition) {
      violations.push({
        ruleId: 'fact_time_conflict',
        ruleName: '时间线矛盾',
        message: `上一章时间锚为「夜晚」，本章未交代过渡直接出现白昼信号（天亮/阳光/日出）。请确认时间推进是否有明确交代。`,
        severity: 'warning',
        suggestion: '在白昼信号出现前，补一句时间过渡（如"一夜过去，天光从窗缝里渗进来"），否则读者会认为场景在同一夜内突变。',
      });
    }
  }

  // —— 2. 专有名词突变：上章记录的设定专名，本章以明显不同写法出现 ——
  const prevNouns = prevFacts.properNouns.filter(n => n.length >= 2);
  if (prevNouns.length > 0) {
    for (const noun of prevNouns) {
      // 上章有，本章完全没出现该字符串，但出现语义相近的不同写法（长度差≤2 且 共享首字）
      if (!text.includes(noun)) {
        const similar = prevNouns.includes(noun) && /[一-龥]/.test(noun);
        if (similar) {
          // 仅在正文出现「同首字 + 不同后缀」的疑似变体时才报（避免对正常省略误杀）
          const head = noun[0];
          const variantRe = new RegExp(`${head}[\\u4e00-\\u9fff]{1,4}`, 'g');
          let vm: RegExpExecArray | null;
          const variants = new Set<string>();
          while ((vm = variantRe.exec(text)) !== null) {
            if (vm[0] !== noun && vm[0].length !== noun.length) variants.add(vm[0]);
          }
          if (variants.size > 0) {
            violations.push({
              ruleId: 'fact_noun_variant',
              ruleName: '专有名词写法不一致',
              message: `上一章设定名词「${noun}」，本章未沿用，却出现疑似变体：${[...variants].slice(0, 3).join('、')}。请核对是否为同一概念的不同写法。`,
              severity: 'warning',
              suggestion: '专有名词跨章应保持一致写法；若为有意变体（如昵称），请加一句说明关联。',
            });
            break; // 每章最多报一次，避免噪声
          }
        }
      }
    }
  }

  // —— 3. 伏笔凭空消失：上章有未回收伏笔，本章既未回收也未延续同类悬念 ——
  if (prevFacts.pendingForeshadow.length > 0) {
    const prevCount = prevFacts.pendingForeshadow.length;
    const resolved = /(揭开了|真相是|原来|终于明白|其实他|说出了秘密|答案.{0,6}是)/.test(text);
    const newForeshadow = /(还将|终究会|还没结束|更大的|更深层的|这只是开始|远没有)/.test(text);
    if (!resolved && !newForeshadow) {
      violations.push({
        ruleId: 'fact_foreshadow_drop',
        ruleName: '伏笔线索中断',
        message: `上一章埋下 ${prevCount} 处未回收伏笔/悬念，本章既未推进回收，也未延续同类悬念，存在伏笔凭空消失风险。`,
        severity: 'warning',
        suggestion: '长篇小说每章应至少「回收一条旧伏笔」或「埋下一条新伏笔」，保持悬念链条不断。可在此章结尾回扣上章的一个悬念。',
      });
    }
  }

  // —— 4. 角色极端状态漂移（保守）：上章已知角色 present，本章出现断臂/失明/死亡等极端词但无铺垫 ——
  const extremeStateRe = /(断了.{0,2}臂|瞎了|死了|失去.{0,2}手|残了|截肢|瘫痪)/;
  if (extremeStateRe.test(text)) {
    for (const ch of prevFacts.characters.filter(c => c.present)) {
      const appears = text.includes(ch.name);
      if (appears) {
        const context = extremeStateRe.exec(text);
        violations.push({
          ruleId: 'fact_char_state',
          ruleName: '角色状态突变',
          message: `角色「${ch.name}」在本章出现极端状态描述「${context ? context[0] : ''}」，但未见上一章铺垫或本章明确交代原因。长程角色状态需连续。`,
          severity: 'warning',
          suggestion: '若角色确实受伤/死亡，请补一句明确交代（如"他左臂的断口已经结了痂"）；若误用词汇请替换。',
        });
        break;
      }
    }
  }

  // —— 5. P2 角色声音指纹漂移（保守）：上章某角色有清晰口头禅(≥2)，本章该角色出场却完全无该口头禅 ——
  const prevVoices = prevFacts.voicePrints || [];
  if (prevVoices.length > 0 && curVoicePrints) {
    const curMap = new Map(curVoicePrints.map(v => [v.name, v.tics]));
    for (const pv of prevVoices) {
      if (!pv.tics || pv.tics.length < 2) continue; // 仅当上章口头禅清晰才比对，避免噪声
      const cur = curMap.get(pv.name);
      if (!cur) continue; // 本章该角色未出场或不适用
      // 上章有口头禅，本章该角色有对话但口头禅池为空 → 声音漂移
      const overlap = pv.tics.filter(t => cur.includes(t));
      if (cur.length === 0 && overlap.length === pv.tics.length) {
        violations.push({
          ruleId: 'fact_voice_drift',
          ruleName: '角色声音漂移',
          message: `角色「${pv.name}」上一章有稳定口头禅（${pv.tics.join('、')}），本章出场却完全无该语言指纹，存在"串味"风险。`,
          severity: 'warning',
          suggestion: '常驻角色的语言指纹（口头禅/语气词/句式）应跨章稳定。若本章刻意让该角色沉默或状态异常，请加一句说明；否则补回其标志性语言习惯。',
        });
        break; // 每章最多报一次
      }
    }
  }

  return violations;
}
// ============================================================

export interface FixResult {
  fixed: boolean;
  changes: FixChange[];
  fixedText: string;
}

export interface FixChange {
  type: string;
  before: string;
  after: string;
  line: number;
  description: string;
}

/**
 * 自动修复章节文本中的确定性违规。
 * 仅处理确定性规则（破折号→逗号），不碰语义相关规则。
 */
export function autoFix(text: string): FixResult {
  const changes: FixChange[] = [];
  let fixedText = text;

  // 1. 破折号 → 逗号（确定性替换）
  const dashRegex = /——/g;
  let dashMatch: RegExpExecArray | null;
  while ((dashMatch = dashRegex.exec(text)) !== null) {
    const lineNum = text.substring(0, dashMatch.index).split('\n').length;
    changes.push({
      type: '破折号',
      before: '——',
      after: '，',
      line: lineNum,
      description: '破折号替换为逗号',
    });
  }
  fixedText = fixedText.replace(dashRegex, '，');

  // 2. 连续≥3个≤12字短句 → 合并为逗号链（检测到合并，但需人工确认）
  // 跳过，属于语义相关修复

  return {
    fixed: changes.length > 0,
    changes,
    fixedText,
  };
}

export function formatCrossReport(
  chapterResults: { name: string; stats: TextStats; violations: Violation[] }[],
  crossResult: CrossChapterResult
): string {
  const lines: string[] = [];
  lines.push('╔══════════════════════════════════════╗');
  lines.push('║   InkWeave v5.2 跨章检测报告         ║');
  lines.push('╚══════════════════════════════════════╝');
  lines.push('');

  // 评分汇总
  const scores = chapterResults.map(cr => {
    const errors = cr.violations.filter(v => v.severity === 'error').length;
    const warnings = cr.violations.filter(v => v.severity === 'warning').length;
    const infos = cr.violations.filter(v => v.severity === 'info').length;
    return { name: cr.name, score: Math.max(0, 100 - errors * 10 - warnings * 4 - infos * 1), grade: '', errors, warnings, infos, nar: cr.stats.paragraphs.filter(p => p.type === 'narrative').length, dia: cr.stats.paragraphs.filter(p => p.type === 'dialogue').length };
  });
  scores.forEach(s => { s.grade = s.score >= 90 ? 'A' : s.score >= 80 ? 'B' : s.score >= 60 ? 'C' : 'D'; });
  const avgScore = scores.reduce((a, s) => a + s.score, 0) / scores.length;
  const aCount = scores.filter(s => s.score >= 90).length;
  const bCount = scores.filter(s => s.score >= 80 && s.score < 90).length;
  const totalErrors = scores.reduce((a, s) => a + s.errors, 0);

  lines.push(`## 全书概览`);
  lines.push(`| 指标 | 数值 |`);
  lines.push(`|------|------|`);
  lines.push(`| 平均分 | ${avgScore.toFixed(1)} |`);
  lines.push(`| A级(≥90) | ${aCount}章 |`);
  lines.push(`| B级(80-89) | ${bCount}章 |`);
  lines.push(`| 总错误数 | ${totalErrors} |`);
  lines.push('');

  lines.push('## 各章评分汇总');
  lines.push('| 章节 | 评分 | 等级 | 错误 | 警告 | 提示 | 叙事段 | 对话段 |');
  lines.push('|------|------|------|------|------|------|--------|--------|');
  for (const s of scores) {
    lines.push(`| ${s.name} | ${s.score} | ${s.grade} | ${s.errors} | ${s.warnings} | ${s.infos} | ${s.nar} | ${s.dia} |`);
  }
  lines.push('');

  // 跨章检测结果
  const hasCrossIssues = crossResult.globalPhrases.length > 0 || crossResult.globalClichés.length > 0
    || crossResult.openingPatterns.length > 0 || crossResult.characterIntros.length > 0
    || crossResult.plotThreads.length > 0 || crossResult.conceptPacing.some(c => c.density > 0)
    || crossResult.settingIssues.length > 0 || crossResult.paragraphPatterns.length > 0;

  if (!hasCrossIssues) {
    lines.push('## ✓ 跨章检测通过，无显著重复模式或一致性问题');
    lines.push('');
  } else {
    if (crossResult.globalPhrases.length > 0) {
      lines.push('## 🌐 跨章高频短语（出现在多章中）');
      for (const gp of crossResult.globalPhrases.slice(0, 10)) { lines.push(`- "${gp.phrase}" 共${gp.totalCount}次，出现在第${gp.chapters.join('、')}章`); }
      lines.push('');
    }
    if (crossResult.globalClichés.length > 0) {
      lines.push('## 🌐 跨章套路词');
      for (const gc of crossResult.globalClichés) { lines.push(`- "${gc.name}" 共${gc.totalCount}次，出现在第${gc.chapters.join('、')}章`); }
      lines.push('');
    }
    if (crossResult.openingPatterns.length > 0) {
      lines.push('## 🌐 开篇模式重复');
      for (const op of crossResult.openingPatterns) { lines.push(`- "${op.pattern}" 出现在第${op.chapters.join('、')}章开头`); }
      lines.push('');
    }

    // 盲区检测结果
    if (crossResult.characterIntros.length > 0) {
      lines.push('## 🟠 角色登场一致性（盲区1）');
      for (const ci of crossResult.characterIntros) {
        lines.push(`- **${ci.name}**：第${ci.firstChapter}章${ci.detailLevel}。${ci.issue || ''}`);
      }
      lines.push('');
    }
    if (crossResult.plotThreads.some(p => p.status === 'open')) {
      lines.push('## 🟠 情节线收束（盲区2）');
      for (const pt of crossResult.plotThreads.filter(p => p.status === 'open')) {
        lines.push(`- **${pt.name}**：出现在第${pt.chapters.join('、')}章，此后未再出现 → 情节线未收束`);
      }
      lines.push('');
    }
    if (crossResult.conceptPacing.some(c => c.density >= 3)) {
      lines.push('## 🟠 信息释放节奏（盲区3）');
      lines.push('| 章节 | 新概念数 | 新概念列表 |');
      lines.push('|------|---------|-----------|');
      for (const cp of crossResult.conceptPacing) {
        if (cp.density > 0) lines.push(`| 第${cp.chapter}章 | ${cp.density} | ${cp.newConcepts.join('、')} |`);
      }
      const highDensity = crossResult.conceptPacing.filter(c => c.density >= 3);
      if (highDensity.length > 0) {
        lines.push('');
        lines.push(`⚠️ 第${highDensity.map(c => c.chapter).join('、')}章新概念密度过高（≥3个/章），建议分散到更多章节逐步释放。`);
      }
      lines.push('');
    }
    if (crossResult.settingIssues.length > 0) {
      lines.push('## 🟠 跨章设定一致性（盲区4）');
      for (const si of crossResult.settingIssues) {
        lines.push(`- **${si.key}**：第${si.chapters.join('、')}章。${si.description}`);
      }
      lines.push('');
    }
    if (crossResult.paragraphPatterns.length > 0) {
      lines.push('## 🟠 段落结构重复（盲区5）');
      lines.push('| 结构指纹 | 出现章节 | 总次数 |');
      lines.push('|---------|---------|-------|');
      for (const pp of crossResult.paragraphPatterns.slice(0, 10)) {
        lines.push(`| ${pp.pattern} | 第${pp.chapters.join('、')}章 | ${pp.totalCount} |`);
      }
      lines.push('');
      lines.push(`⚠️ 检测到${crossResult.paragraphPatterns.length}种跨章重复的段落结构模式。同结构段落反复出现会制造机械感，建议在章节间轮换段落开头和结构。`);
      lines.push('');
    }
  }
  lines.push('---');
  lines.push(`*检测时间：${new Date().toLocaleString('zh-CN')} | InkWeave v5.2*`);
  return lines.join('\n');
}