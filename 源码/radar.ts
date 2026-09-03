// ============================================================
// GWE V3.0 - 7维雷达评分（追读力增强版）
// 维度：bodyReaction/sensorySignal/action/emotion/infoAdvance/twistFrequency/hookStrength
// ============================================================

import type {
  RadarScores,
  TextStats,
  MergedConfig,
  MergedVocabulary,
  RadarWeights,
} from './types';
import { detectAnchors } from './anchor-detector';

// ============================================================
// 五感词分类（内置基础词表，用于sensorySignal维度）
// ============================================================

// 2026-08-29 两树口径统一：改为规范「单字」感官词典，去掉 模糊/呼啸/咆哮 等复合短语；
// 味→taste、闻→smell、腥→smell 各归一类（每字仅出现于一个感官，避免跨类重复计数）。
// 计数语义与 CLI 树 SENSORY_CHARS 逐字 indexOf 等价（见 countSensoryMentions）。
const SENSORY_CATEGORIES = {
  sight: ['看', '望', '盯', '瞥', '见', '瞧', '观', '视', '亮', '暗', '光', '影', '色', '红', '蓝', '绿', '白', '黑', '映', '照', '闪', '耀', '眩'],
  sound: ['听', '声', '响', '鸣', '叫', '喊', '嗡', '轰', '哗', '啪', '吱', '砰', '咚', '叮', '铛', '嘎', '静', '嘈'],
  smell: ['香', '臭', '腥', '膻', '闻', '嗅', '焦', '霉'],
  touch: ['触', '摸', '碰', '冷', '热', '温', '凉', '冰', '烫', '软', '硬', '粗', '细', '滑', '糙', '疼', '痛', '麻', '痒', '刺', '压', '握', '抚', '湿', '干', '黏'],
  taste: ['甜', '苦', '酸', '辣', '咸', '涩', '鲜', '味', '尝', '品', '甘', '腻'],
};

// 情感词基础列表（用于emotion维度）
const EMOTION_WORDS = [
  '怒', '喜', '悲', '恐', '惊', '忧', '思', '愁', '恨', '妒',
  '悔', '愧', '羞', '窘', '慌', '急', '烦', '闷', '爽', '悦',
  '愤怒', '喜悦', '悲伤', '恐惧', '惊讶', '忧虑', '思念', '愁苦',
  '憎恨', '嫉妒', '后悔', '愧疚', '羞愧', '窘迫', '慌张', '焦急',
  '烦躁', '郁闷', '舒畅', '愉悦', '冷笑', '苦笑', '微笑', '狞笑',
  '颤抖', '战栗', '惊恐', '狂喜', '暴怒', '绝望', '希望', '失落',
  '心动', '心悸', '心碎', '心痛', '心软', '心酸', '心醉', '心慌',
];

// ============================================================
// 雷达评分计算
// ============================================================

/** 雷达评分计算所需的统计信息 */
export interface RadarInput {
  text: string;
  stats: TextStats;
  mergedConfig: MergedConfig;
}

/**
 * 计算7维雷达评分（V3追读力增强版）
 *
 * 维度说明：
 * - bodyReaction: 基于锚点密度（身体反应描写丰富度）
 * - sensorySignal: 基于五感词汇出现次数和覆盖面
 * - action: 基于动作动词密度和对话穿插
 * - emotion: 基于情感词和身体反应表达
 * - infoAdvance: 基于新信息点（名词/专有名词首次出现）
 * - twistFrequency: V3新增：转折/反咬词密度，衡量信息反转频率
 * - hookStrength: V3新增：章末钩子强度，衡量结尾追读力
 *
 * 每个维度0-100分，使用radar_weights做权重调整（乘法系数）
 */
export function calculateRadar(input: RadarInput): RadarScores {
  const { text, stats, mergedConfig } = input;
  const { vocabulary, radarWeights } = mergedConfig;

  const totalChars = stats.totalChars || text.length;

  // ---- 1. bodyReaction：锚点密度（V3.1收紧曲线，有区分度）----
  const anchorResult = detectAnchors(text, vocabulary);
  // V3.1：使用weightedCount（套路×0.3，高质量×1.5）代替原始count
  const effectiveAnchorCount = anchorResult.weightedCount || anchorResult.count;
  const anchorDensity = totalChars > 0 ? (effectiveAnchorCount / totalChars) * 1000 : 0;
  // V3.1收紧曲线（实战校准）：千字3→40，千字6→65，千字9→80，千字12→90，千字16→100，千字>22开始扣分
  let bodyReaction: number;
  if (anchorDensity <= 0) bodyReaction = 10;
  else if (anchorDensity < 3) bodyReaction = mapRange(anchorDensity, 0, 3, 10, 40);
  else if (anchorDensity < 6) bodyReaction = mapRange(anchorDensity, 3, 6, 40, 65);
  else if (anchorDensity < 9) bodyReaction = mapRange(anchorDensity, 6, 9, 65, 80);
  else if (anchorDensity < 12) bodyReaction = mapRange(anchorDensity, 9, 12, 80, 90);
  else if (anchorDensity < 16) bodyReaction = mapRange(anchorDensity, 12, 16, 90, 100);
  else bodyReaction = clampScore(100 - (anchorDensity - 22) * 3);
  // 套路锚点太多额外扣分
  if (anchorResult.quality && anchorResult.count > 0) {
    const clicheRatio = anchorResult.quality.cliche / anchorResult.count;
    if (clicheRatio > 0.3) bodyReaction = clampScore(bodyReaction - 15);
    else if (clicheRatio > 0.15) bodyReaction = clampScore(bodyReaction - 5);
  }

  // ---- 2. sensorySignal：五感覆盖（V3.1收紧）----
  const sensoryCounts = countSensoryMentions(text);
  const totalSensory = Object.values(sensoryCounts).reduce((a, b) => a + b, 0);
  const activeSenses = Object.values(sensoryCounts).filter((c) => c > 0).length;
  const sensoryDensity = totalChars > 0 ? (totalSensory / totalChars) * 1000 : 0;
  // V3.1收紧：2种感官→30，3种→50，4种→65，5种→80；密度千字5→+10，千字8→+15，千字12→+20
  let coverageScore: number;
  if (activeSenses <= 1) coverageScore = 10;
  else if (activeSenses === 2) coverageScore = 30;
  else if (activeSenses === 3) coverageScore = 55;
  else if (activeSenses === 4) coverageScore = 72;
  else coverageScore = 82; // 5种全激活
  let densityBonus: number;
  if (sensoryDensity < 3) densityBonus = 0;
  else if (sensoryDensity < 6) densityBonus = mapRange(sensoryDensity, 3, 6, 5, 10);
  else if (sensoryDensity < 10) densityBonus = mapRange(sensoryDensity, 6, 10, 10, 16);
  else densityBonus = Math.min(18, mapRange(sensoryDensity, 10, 15, 16, 18));
  // 嗅觉/触觉必选加分
  const hasSmellOrTouch = (sensoryCounts.smell || 0) > 0 || (sensoryCounts.touch || 0) > 0;
  const senseTypeBonus = hasSmellOrTouch ? 0 : -10; // 没有嗅觉/触觉扣10分（监控录像感）
  let sensorySignal = clampScore(coverageScore + densityBonus + senseTypeBonus);

  // ---- 3. action：动作动词密度 + 对话穿插 + 对话冲突（V3.1收紧）----
  const actionVerbCount = countMatches(text, vocabulary.actionVerbs);
  const actionDensity = totalChars > 0 ? (actionVerbCount / totalChars) * 1000 : 0;
  // V3.1收紧：千字5→30，千字10→50，千字15→65，千字20→78，千字25→88，千字30→95，千字35→100
  let actionDensityScore: number;
  if (actionDensity < 5) actionDensityScore = mapRange(actionDensity, 0, 5, 10, 30);
  else if (actionDensity < 10) actionDensityScore = mapRange(actionDensity, 5, 10, 30, 50);
  else if (actionDensity < 15) actionDensityScore = mapRange(actionDensity, 10, 15, 50, 65);
  else if (actionDensity < 20) actionDensityScore = mapRange(actionDensity, 15, 20, 65, 78);
  else if (actionDensity < 25) actionDensityScore = mapRange(actionDensity, 20, 25, 78, 88);
  else if (actionDensity < 30) actionDensityScore = mapRange(actionDensity, 25, 30, 88, 95);
  else actionDensityScore = clampScore(mapRange(Math.min(actionDensity, 40), 30, 40, 95, 100));

  const dialogueRatio = stats.dialogueRatio || 0;
  let dialogueScore = 0;
  if (dialogueRatio >= 0.2 && dialogueRatio <= 0.5) {
    dialogueScore = 12; // 对话比例适中
  } else if (dialogueRatio > 0 && dialogueRatio < 0.2) {
    dialogueScore = mapRange(dialogueRatio, 0, 0.2, 0, 12);
  } else if (dialogueRatio > 0.5) {
    dialogueScore = mapRange(dialogueRatio, 0.5, 0.8, 12, 2);
  } else dialogueScore = 0;

  // 对话冲突加分：检测否定/质疑/打断词
  const conflictWords = ['不对', '不可能', '错', '但是', '却', '竟然', '居然', '怎么', '为什么', '难道', '不是', '停', '闭嘴', '凭什么', '我不信', '你骗我', '放屁', '胡说', '滚', '找死'];
  let conflictCount = 0;
  for (const w of conflictWords) {
    let idx = text.indexOf(w);
    while (idx !== -1) { conflictCount++; idx = text.indexOf(w, idx + w.length); }
  }
  const conflictDensity = totalChars > 0 ? (conflictCount / totalChars) * 1000 : 0;
  const conflictBonus = conflictDensity >= 3 ? 10 : conflictDensity >= 1.5 ? 5 : conflictDensity >= 0.5 ? 2 : 0;
  let action = clampScore(actionDensityScore + dialogueScore + conflictBonus);

  // ---- 4. emotion：情感表达（V3.1收紧，Show Don't Tell友好）----
  const emotionWordCount = countEmotionWords(text);
  const emotionDensity = totalChars > 0 ? (emotionWordCount / totalChars) * 1000 : 0;
  // V3.1收紧：情感词密度太低(<1)→15分，1-2→25，2-3→35，3-4→30，>4→15（太多是Tell）
  let emotionWordScore: number;
  if (emotionDensity < 0.5) emotionWordScore = 10;
  else if (emotionDensity < 1.5) emotionWordScore = mapRange(emotionDensity, 0.5, 1.5, 15, 28);
  else if (emotionDensity < 3) emotionWordScore = mapRange(emotionDensity, 1.5, 3, 28, 35);
  else if (emotionDensity < 5) emotionWordScore = mapRange(emotionDensity, 3, 5, 35, 25);
  else emotionWordScore = mapRange(Math.min(emotionDensity, 10), 5, 10, 25, 10);

  // 身体锚点带来的情绪分（Show Don't Tell核心，实战校准）
  let bodyEmotionScore: number;
  if (anchorDensity < 3) bodyEmotionScore = mapRange(anchorDensity, 0, 3, 0, 20);
  else if (anchorDensity < 6) bodyEmotionScore = mapRange(anchorDensity, 3, 6, 20, 38);
  else if (anchorDensity < 10) bodyEmotionScore = mapRange(anchorDensity, 6, 10, 38, 52);
  else if (anchorDensity < 15) bodyEmotionScore = mapRange(anchorDensity, 10, 15, 52, 62);
  else bodyEmotionScore = 65;
  // 高质量生理锚点额外加分
  const qualityAnchorBonus = anchorResult.quality ? Math.min(10, anchorResult.quality.quality * 1.5) : 0;
  // 转折/冲突带来的情绪张力加分
  const conflictTwistBonus = conflictDensity >= 3 ? 8 : conflictDensity >= 1.5 ? 4 : 0;
  let emotion = clampScore(emotionWordScore + bodyEmotionScore + qualityAnchorBonus + conflictTwistBonus);

  // ---- 5. infoAdvance：新信息点推进（V3.1实战校准）----
  const infoPoints = countInfoPoints(text, vocabulary);
  const infoDensity = totalChars > 0 ? (infoPoints / totalChars) * 1000 : 0;
  // V3.1实战校准（加入通用新事物检测后重新校准）：千字3→40，千字5→60，千字8→78，千字12→90，千字16→100，千字>22扣分
  let infoAdvance: number;
  if (infoDensity <= 0) infoAdvance = 10;
  else if (infoDensity < 3) infoAdvance = mapRange(infoDensity, 0, 3, 10, 40);
  else if (infoDensity < 5) infoAdvance = mapRange(infoDensity, 3, 5, 40, 60);
  else if (infoDensity < 8) infoAdvance = mapRange(infoDensity, 5, 8, 60, 78);
  else if (infoDensity < 12) infoAdvance = mapRange(infoDensity, 8, 12, 78, 90);
  else if (infoDensity < 16) infoAdvance = mapRange(infoDensity, 12, 16, 90, 100);
  else infoAdvance = clampScore(100 - (infoDensity - 22) * 3);

  // ---- 6. V3.1: twistFrequency 信息反咬/转折密度（收紧曲线）----
  const twistWordsFull = ['但是', '但', '可是', '然而', '却', '竟然', '居然', '突然', '不对', '奇怪', '怎么', '为什么', '难道', '不是', '反而', '相反', '没想到', '原来', '其实', '实际上', '等等', '不对劲', '有问题', '不可能', '错了', '等一下'];
  let twistCount = 0;
  for (const word of twistWordsFull) {
    let idx = text.indexOf(word);
    while (idx !== -1) {
      twistCount++;
      idx = text.indexOf(word, idx + word.length);
    }
  }
  const twistDensity = totalChars > 0 ? (twistCount / totalChars) * 1000 : 0;
  // V3.1收紧（实战校准）：千字1→25，千字2→45，千字3→60，千字5→78，千字8→90，千字11→100，千字>16扣分
  let twistFrequency: number;
  if (twistDensity <= 0) twistFrequency = 5;
  else if (twistDensity < 1) twistFrequency = mapRange(twistDensity, 0, 1, 5, 25);
  else if (twistDensity < 2) twistFrequency = mapRange(twistDensity, 1, 2, 25, 45);
  else if (twistDensity < 3) twistFrequency = mapRange(twistDensity, 2, 3, 45, 60);
  else if (twistDensity < 5) twistFrequency = mapRange(twistDensity, 3, 5, 60, 78);
  else if (twistDensity < 8) twistFrequency = mapRange(twistDensity, 5, 8, 78, 90);
  else if (twistDensity < 11) twistFrequency = mapRange(twistDensity, 8, 11, 90, 100);
  else twistFrequency = clampScore(100 - (twistDensity - 16) * 3);

  // ---- 7. V3.1: hookStrength 章末钩子强度（重新校准，有区分度）----
  let hookStrength = 30; // 基础分更低，没有有效钩子就是30分
  if (totalChars > 200) {
    const tail = text.substring(Math.max(0, text.length - 300));
    const sentenceEndRegex = /[。！？!?…]+[^。！？!?…]*$/;
    const endMatch = tail.match(sentenceEndRegex);
    const lastChunk = (endMatch ? endMatch[0] : tail).replace(/^[\s\n]+/, '');
    const lastSentence = lastChunk.replace(/[。！？!?…\s]+$/, '').trim();
    const lastPuncMatch = lastChunk.match(/[。！？!?…]+$/);
    const lastPunc = lastPuncMatch ? lastPuncMatch[0] : '';
    const lastChar = lastSentence.slice(-1);
    const lastLen = lastSentence.replace(/\s/g, '').length;

    const last150 = text.substring(Math.max(0, text.length - 150));
    const hasTwistAtEnd = twistWordsFull.some((w) => last150.includes(w));
    const hasQuestion = /[？?]/.test(lastPunc);
    const hasExclamation = /[！!]/.test(lastPunc);
    const hasEllipsis = /…/.test(lastPunc);
    // 具体新信息/危险信号（看得见摸得着的具体事物）
    const hasConcreteDanger = /(血|杀|死|塌|崩|灭|凉|冷|逃|追|来了|动了|亮了|灭了|醒了|碎了|掉了|倒了|在搏动|在爬|在流|是活的|敲|响了|发光|亮了|号牌|钥匙|信|刀|剑|枪|手|眼睛|脸|影子|人|尸体|骨头|指纹|字|洞|门)/.test(last150);
    // 抽象悬念词（假钩子）
    const hasAbstractHook = /(不对劲|有什么|神秘|不祥|诡异|奇怪|可怕|恐怖|危险|不对劲)/.test(last150) && !hasConcreteDanger;

    // 加分项（严格，具体钩子才加分）
    if (hasQuestion && lastLen <= 20) hookStrength += 25;     // 短句问号+25
    if (hasExclamation && lastLen <= 15) hookStrength += 20; // 短句感叹号+20
    if (hasEllipsis && lastLen <= 15) hookStrength += 15;    // 短句省略号+15
    if (hasConcreteDanger && lastLen <= 20) hookStrength += 30; // 具体新危险/事物极短句+30
    else if (hasConcreteDanger) hookStrength += 15;
    if (hasTwistAtEnd && /(不对|不是|竟然|原来|其实|难道)/.test(last150)) hookStrength += 10;
    // 极短句（≤10字）+15
    if (lastLen <= 10 && lastLen > 0) hookStrength += 15;
    else if (lastLen <= 18) hookStrength += 8;
    // 断裂动作钩子
    if (/^(他刚|她刚|刚要|正要|就在|话没说完|还没|突然|然后它|然后他|然后她)/.test(lastSentence.trim())) {
      hookStrength += 15;
    }

    // 减分项
    if (/[了的是着过]$/.test(lastChar) && !/[？?！!…]/.test(lastPunc)) {
      hookStrength -= 25;
    }
    if (/^(就这样|原来如此|所以|于是|最终|最后|总之|总而言之|这一晚|这一天|这一刻|他知道|他明白)/.test(lastSentence.trim())) {
      hookStrength -= 20;
    }
    if (/了。$/.test(lastChunk.trimEnd())) {
      hookStrength -= 20;
    }
    if (lastLen > 35 && !hasQuestion && !hasExclamation) {
      hookStrength -= 15; // 长句收尾-15
    }
    if (hasAbstractHook && !hasConcreteDanger) {
      hookStrength -= 15; // 抽象假钩子-15
    }

    hookStrength = clampScore(hookStrength);
  }

  // ---- 应用radar_weights乘法系数 ----
  const raw: RadarScores = {
    bodyReaction,
    sensorySignal,
    action,
    emotion,
    infoAdvance,
    twistFrequency,
    hookStrength,
  };

  return applyWeights(raw, radarWeights);
}

/**
 * 计算雷达综合得分（加权平均）
 */
export function calculateScore(radar: RadarScores): number {
  const values = Object.values(radar);
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

/**
 * 计算带自定义权重的综合得分
 */
export function calculateWeightedScore(
  radar: RadarScores,
  weights: Partial<RadarWeights>
): number {
  const keys: Array<keyof RadarScores> = [
    'bodyReaction', 'sensorySignal', 'action', 'emotion', 'infoAdvance',
    'twistFrequency', 'hookStrength',
  ];
  let totalWeight = 0;
  let weightedSum = 0;
  for (const key of keys) {
    const w = weights[key] ?? 1;
    weightedSum += radar[key] * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

// ============================================================
// 辅助函数
// ============================================================

/** 将值从一个范围映射到另一个范围 */
function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  if (inMax === inMin) return outMin;
  return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
}

/** 将分数限制在0-100之间 */
function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** 应用雷达权重（V3.1修复：权重仅用于加权平均，不乘到维度分数上，避免封顶100） */
function applyWeights(scores: RadarScores, _weights: RadarWeights): RadarScores {
  // V3.1修复：不把权重乘到维度分数上，否则高权重维度会被clamp到100失去区分度
  // 权重在calculateWeightedScore里用于加权平均
  return {
    bodyReaction: clampScore(scores.bodyReaction),
    sensorySignal: clampScore(scores.sensorySignal),
    action: clampScore(scores.action),
    emotion: clampScore(scores.emotion),
    infoAdvance: clampScore(scores.infoAdvance),
    twistFrequency: clampScore(scores.twistFrequency),
    hookStrength: clampScore(scores.hookStrength),
  };
}

/** 统计五感词汇出现次数 */
export function countSensoryMentions(text: string): Record<string, number> {
  const counts: Record<string, number> = {
    sight: 0,
    sound: 0,
    smell: 0,
    touch: 0,
    taste: 0,
  };

  for (const [sense, words] of Object.entries(SENSORY_CATEGORIES)) {
    let total = 0;
    for (const word of words) {
      let idx = 0;
      while ((idx = text.indexOf(word, idx)) !== -1) {
        total++;
        idx += word.length;
      }
    }
    counts[sense] = total;
  }

  return counts;
}

/** 统计词表中的词在文本中出现的总次数 */
function countMatches(text: string, wordSet: Set<string>): number {
  let count = 0;
  const words = Array.from(wordSet).sort((a, b) => b.length - a.length);
  const found = new Set<number>();

  for (const word of words) {
    let idx = 0;
    while ((idx = text.indexOf(word, idx)) !== -1) {
      // 检查重叠
      let overlaps = false;
      for (let p = idx; p < idx + word.length; p++) {
        if (found.has(p)) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        count++;
        for (let p = idx; p < idx + word.length; p++) {
          found.add(p);
        }
      }
      idx += word.length;
    }
  }

  return count;
}

/** 统计情感词出现次数 */
function countEmotionWords(text: string): number {
  let count = 0;
  const sorted = EMOTION_WORDS.sort((a, b) => b.length - a.length);
  const found = new Set<number>();

  for (const word of sorted) {
    let idx = 0;
    while ((idx = text.indexOf(word, idx)) !== -1) {
      let overlaps = false;
      for (let p = idx; p < idx + word.length; p++) {
        if (found.has(p)) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        count++;
        for (let p = idx; p < idx + word.length; p++) {
          found.add(p);
        }
      }
      idx += word.length;
    }
  }

  return count;
}

/**
 * 统计新信息点数量（基于worldTerms和一般专有名词识别）
 * 简单启发式：
 * 1. worldTerms中的词首次出现算信息点
 * 2. 引号内的新名词（2-4字连续出现两次以上且首次出现的词）
 * 3. 数字+单位组合
 */
function countInfoPoints(text: string, vocab: MergedVocabulary): number {
  let count = 0;
  const seen = new Set<string>();

  // worldTerms
  const worldTerms = vocab.worldTerms || new Set<string>();
  for (const term of worldTerms) {
    if (text.includes(term)) {
      if (!seen.has(term)) {
        count++;
        seen.add(term);
      }
    }
  }

  // 中文引号/书名号内的词汇（首次出现视为信息点）
  const bracketRegex = /[《「『【]([^》」』】]{2,10})[》」』】]/g;
  let m: RegExpExecArray | null;
  while ((m = bracketRegex.exec(text)) !== null) {
    const term = m[1];
    if (!seen.has(term)) {
      count++;
      seen.add(term);
    }
  }

  // 数字+量词组合（如"三阶"、"九品"、"万年"）
  const measureRegex = /[一二三四五六七八九十百千万0-9]+[阶品级层重天年月日个里斤][^，。！？、\s]{0,2}/g;
  while ((m = measureRegex.exec(text)) !== null) {
    const term = m[0];
    if (!seen.has(term)) {
      count++;
      seen.add(term);
    }
  }

  // 【V3.1实战新增】通用新事物检测（不依赖预设词表）
  // 检测"这是/那是/不是/是+[名词]"结构的首次出现（异常揭示）
  const revealRegex = /(?:这是|那是|不是|就是|原来是|其实是)([^\s，。！？、"」』]{1,6})/g;
  while ((m = revealRegex.exec(text)) !== null) {
    const term = m[1];
    if (term.length >= 2 && !seen.has(term)) {
      count++;
      seen.add(term);
    }
  }

  // 【V3.1实战新增】危险/异常具体名词检测（血、刀、剑、尸体、门、手、眼睛、号牌等）
  // 每段首次出现的新具体物件视为信息点
  const dangerWords = ['血','刀','剑','尸体','骨头','眼睛','脸','手','影子','洞','门','钥匙','信','号牌','盾','铜棍','镜子','黄符','黑液','搏纹','金光','黑血','腔室','筋膜','简历','招聘'];
  for (const w of dangerWords) {
    if (text.includes(w) && !seen.has(w)) {
      count++;
      seen.add(w);
    }
  }

  return count;
}
