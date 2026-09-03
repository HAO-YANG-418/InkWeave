// ============================================================
// GWE V3.0 - 身体锚点检测器（追读力增强版）
// 识别"身体部位+感官/动作动词"的组合作为身体反应锚点
// V3升级：套路反应降权，生理反应加权，返回质量加权后的有效锚点数
// ============================================================

import type { MergedVocabulary } from './types';

// ============================================================
// 锚点检测结果类型
// ============================================================

export interface AnchorDetectionResult {
  /** 检测到的锚点总数 */
  count: number;
  /** 质量加权后的有效锚点数（套路反应0.3倍，生理反应1.5倍） */
  weightedCount: number;
  /** 锚点在文本中的起始位置列表 */
  positions: number[];
  /** 按锚点类型分类的统计 */
  types: Record<string, number>;
  /** 按质量分级的统计：套路/普通/高质量 */
  quality: Record<string, number>;
  /** 检测到的锚点文本片段列表 */
  matches: string[];
}

// ============================================================
// 锚点类型常量
// ============================================================

const ANCHOR_TYPE = {
  BODY_SENSORY: 'body_sensory',     // 身体部位+感官动词（如指尖发凉）
  BODY_ACTION: 'body_action',       // 身体部位+动作动词（如拳头握紧）
  BODY_STATE: 'body_state',         // 身体部位+状态（如心跳加速）
} as const;

const ANCHOR_QUALITY = {
  CLICHE: 'cliche',                 // 套路反应（降权×0.3）：微微一笑、点点头、叹了口气
  NORMAL: 'normal',                 // 普通反应（权重×1.0）
  QUALITY: 'quality',               // 高质量生理反应（加权×1.5）：后颈发凉、指节发白、胃里翻涌
} as const;

/** 锚点匹配窗口：身体部位词和动词之间的最大字符距离（前后各MAX_ANCHOR_GAP个字符内） */
const MAX_ANCHOR_GAP = 10;

// ============================================================
// V3新增：锚点质量分级词表
// ============================================================

/** 套路反应词（降权×0.2）——网文高频套路化身体反应，Tell not Show */
const CLICHE_PHRASES = [
  '微微一笑', '淡淡一笑', '笑了笑', '笑了一下', '点了点头', '点点头',
  '叹了口气', '叹了一声', '摇了摇头', '皱了皱眉', '眉头一皱', '眉头紧锁',
  '嘴角微扬', '嘴角上扬', '勾起嘴角', '抿了抿嘴', '撇了撇嘴', '翻了个白眼',
  '冷哼一声', '冷笑一声', '嗤笑一声', '轻笑一声', '苦笑一声',
  '深吸一口气', '深吸了口气', '松了口气', '松了一口气', '心中一动',
  '目光一闪', '眼中闪过一丝', '眼中寒光一闪', '嘴角露出一丝', '脸上露出一丝',
  '不由得', '不由自主地', '下意识地', '缓缓地说', '淡淡地说', '冷冷地说',
  '紧紧握着拳头', '握紧了拳头', '打量了一番', '上下打量',
];

/** 高质量生理反应词（加权×1.8）——能直接传递情绪/紧张感的具象不自主生理描写 */
const QUALITY_MARKERS = [
  '发凉', '发冷', '发紧', '发麻', '发烫', '发热', '冒汗', '冷汗', '汗水顺着',
  '心跳加速', '心跳漏了一拍', '心脏骤停', '心提到了嗓子眼', '心脏狂跳', '心悸',
  '指节发白', '指节泛白', '指甲掐进', '攥紧', '捏紧', '手背青筋暴起',
  '后颈发凉', '后背发凉', '脊背发寒', '寒毛竖起', '汗毛倒竖', '鸡皮疙瘩',
  '喉咙发紧', '喉头滚动', '咽了口唾沫', '口干舌燥', '嘴里发苦', '胃里翻涌',
  '胃里一阵痉挛', '呼吸一滞', '呼吸急促', '屏住呼吸', '窒息感', '眼前一黑',
  '一阵眩晕', '天旋地转', '腿软', '膝盖发软', '脚底发软', '脚下一滑',
  '血液凝固', '血液冲上头顶', '血往头上涌', '浑身僵硬', '全身僵住', '动弹不得',
  '瞳孔一缩', '瞳孔骤缩', '瞳孔收缩', '牙咬紧', '牙关紧咬', '嘴唇哆嗦',
  '手指发抖', '手在抖', '声音发颤', '声音发抖', '肠子悔青了', '后背全是汗',
  '耳膜嗡嗡', '耳朵嗡嗡响', '太阳穴突突跳', '胃里一阵抽搐', '舌头根发硬',
  '硌得掌心生疼', '金属硌得', '烫得一缩手', '疼得倒吸凉气',
];

// ============================================================
// 内部接口定义
// ============================================================

interface BodyPartOccurrence {
  word: string;
  start: number;
  end: number;
}

interface MatchedAnchor {
  start: number;
  end: number;
  text: string;
  type: string;
  quality: string;
}

type Direction = 'before' | 'after';

// ============================================================
// 核心检测函数
// ============================================================

/**
 * 检测文本中的身体锚点
 * 锚点定义：身体部位词 + (0~MAX_ANCHOR_GAP个字符内) 感官动词或动作动词
 *
 * @param text 待检测文本
 * @param vocab 合并后的词库（含bodyParts, sensoryVerbs, actionVerbs）
 * @returns AnchorDetectionResult
 */
export function detectAnchors(
  text: string,
  vocab: MergedVocabulary
): AnchorDetectionResult {
  const types: Record<string, number> = {
    [ANCHOR_TYPE.BODY_SENSORY]: 0,
    [ANCHOR_TYPE.BODY_ACTION]: 0,
    [ANCHOR_TYPE.BODY_STATE]: 0,
  };

  const quality: Record<string, number> = {
    [ANCHOR_QUALITY.CLICHE]: 0,
    [ANCHOR_QUALITY.NORMAL]: 0,
    [ANCHOR_QUALITY.QUALITY]: 0,
  };

  // BUG② 修复：内置 fallback 词表，与 CLI 树 computeTextStats 的 bodyParts 正则等价。
  // KB/配置未提供锚点词表时，detectAnchors 应退化为"数身体部位名词"，而非返回 0 造成误报
  // （双树锚点口径不一致：CLI 树数名词=92、源码树组合匹配=0）。
  const FALLBACK_BODY_PARTS = ['手','脚','腿','头','脸','眼','嘴','耳','鼻','肩','背','腰','腹','胸','臂','指','掌','拳','膝','踝','腕','颈','额','颊','唇','舌','齿','心口','后颈','肩胛'];
  const useFallbackParts = !vocab.bodyParts || vocab.bodyParts.size === 0;
  const bodyParts = useFallbackParts ? new Set(FALLBACK_BODY_PARTS) : vocab.bodyParts;
  const sensoryVerbs = vocab.sensoryVerbs || new Set<string>();
  const actionVerbs = vocab.actionVerbs || new Set<string>();

  if (useFallbackParts) {
    // fallback 模式：直接数身体部位名词（等价 CLI 树口径），返回位置用于间隔/开头锚点计算
    const fre = new RegExp(FALLBACK_BODY_PARTS.join('|'), 'g');
    const positions: number[] = [];
    let fmatch: RegExpExecArray | null;
    while ((fmatch = fre.exec(text)) !== null) positions.push(fmatch.index);
    return {
      count: positions.length,
      weightedCount: positions.length,
      positions,
      types,
      quality,
      matches: [],
    };
  }

  // 将词表转为排序后的数组（长词优先匹配，避免"手指"被"手"先匹配）
  const sortedBodyParts = Array.from(bodyParts).sort((a, b) => b.length - a.length);
  const sortedSensoryVerbs = Array.from(sensoryVerbs).sort((a, b) => b.length - a.length);
  const sortedActionVerbs = Array.from(actionVerbs).sort((a, b) => b.length - a.length);

  // 收集所有身体部位的位置
  const bodyPartOccurrences: Array<{ word: string; start: number; end: number }> = [];
  for (const bp of sortedBodyParts) {
    let idx = 0;
    while ((idx = text.indexOf(bp, idx)) !== -1) {
      bodyPartOccurrences.push({ word: bp, start: idx, end: idx + bp.length });
      idx += bp.length; // 前进避免重叠匹配
    }
  }

  // 按位置排序
  bodyPartOccurrences.sort((a, b) => a.start - b.start);

  // 去除重叠的身体部位匹配（保留先匹配的/更长的）
  const filteredBPs: Array<{ word: string; start: number; end: number }> = [];
  for (const bp of bodyPartOccurrences) {
    const overlaps = filteredBPs.some(
      (prev) => !(bp.end <= prev.start || bp.start >= prev.end)
    );
    if (!overlaps) {
      filteredBPs.push(bp);
    }
  }

  // 对每个身体部位，查找附近（前面+后面）的感官/动作动词
  // 存储已匹配的锚点区间，用于去重
  const matchedAnchors: MatchedAnchor[] = [];

  for (const bp of filteredBPs) {
    // 搜索范围：身体部位前后各MAX_ANCHOR_GAP+maxWordLength个字符
    const maxVerbLen = Math.max(
      maxWordLength(sortedSensoryVerbs),
      maxWordLength(sortedActionVerbs)
    );

    // ---- 先在身体部位**后面**查找 ----
    const afterSearchStart = bp.end;
    const afterSearchEnd = Math.min(text.length, bp.end + MAX_ANCHOR_GAP + maxVerbLen);
    const afterWindow = text.substring(afterSearchStart, afterSearchEnd);

    let foundAfter = findMatchingVerb(
      afterWindow, sortedSensoryVerbs, sortedActionVerbs, afterSearchStart, bp, 'after', text, matchedAnchors
    );
    if (foundAfter) {
      matchedAnchors.push(foundAfter);
      continue;
    }

    // ---- 再在身体部位**前面**查找（动词在前，身体部位在后，如"低头"、"抬手"、"凉了的指尖"）----
    const beforeSearchStart = Math.max(0, bp.start - MAX_ANCHOR_GAP - maxVerbLen);
    const beforeWindow = text.substring(beforeSearchStart, bp.start);

    const foundBefore = findMatchingVerb(
      beforeWindow, sortedSensoryVerbs, sortedActionVerbs, beforeSearchStart, bp, 'before', text, matchedAnchors
    );
    if (foundBefore) {
      matchedAnchors.push(foundBefore);
    }
  }

  // 按位置排序结果并去重
  matchedAnchors.sort((a, b) => a.start - b.start);

  // 去重：去除重叠的锚点（保留先匹配的/更长的）
  const finalAnchors: typeof matchedAnchors = [];
  for (const anchor of matchedAnchors) {
    const overlaps = finalAnchors.some(
      (prev) => !(anchor.end <= prev.start || anchor.start >= prev.end)
    );
    if (!overlaps) {
      finalAnchors.push(anchor);
    }
  }

  // 构建返回结果
  // BUG② 兜底：组合匹配为空（词表配置了身体部位但缺感官/动作动词）时退化为名词计数，避免误报 0
  if (finalAnchors.length === 0) {
    const fre = new RegExp(FALLBACK_BODY_PARTS.join('|'), 'g');
    const fpos: number[] = [];
    let fmatch: RegExpExecArray | null;
    while ((fmatch = fre.exec(text)) !== null) fpos.push(fmatch.index);
    if (fpos.length > 0) {
      return { count: fpos.length, weightedCount: fpos.length, positions: fpos, types, quality, matches: [] };
    }
  }
  const positions: number[] = [];
  const matches: string[] = [];
  let weightedCount = 0;
  for (const anchor of finalAnchors) {
    positions.push(anchor.start);
    matches.push(anchor.text);
    types[anchor.type]++;
    quality[anchor.quality]++;
    // 计算加权计数
    if (anchor.quality === ANCHOR_QUALITY.CLICHE) {
      weightedCount += 0.2;
    } else if (anchor.quality === ANCHOR_QUALITY.QUALITY) {
      weightedCount += 1.8;
    } else {
      weightedCount += 1.0;
    }
  }

  return {
    count: finalAnchors.length,
    weightedCount: Math.round(weightedCount * 10) / 10,
    positions: finalAnchors.map((a) => a.start),
    types,
    quality,
    matches: finalAnchors.map((a) => a.text),
  };
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 判断锚点质量等级
 */
function classifyAnchorQuality(anchorText: string): string {
  // 先检查是否包含套路短语
  for (const cliche of CLICHE_PHRASES) {
    if (anchorText.includes(cliche)) {
      return ANCHOR_QUALITY.CLICHE;
    }
  }
  // 再检查是否包含高质量生理反应标记
  for (const marker of QUALITY_MARKERS) {
    if (anchorText.includes(marker)) {
      return ANCHOR_QUALITY.QUALITY;
    }
  }
  return ANCHOR_QUALITY.NORMAL;
}

/**
 * 在搜索窗口中查找与身体部位匹配的感官/动作动词
 * @returns 找到的锚点信息，或null
 */
function findMatchingVerb(
  searchWin: string,
  sortedSensoryVerbs: string[],
  sortedActionVerbs: string[],
  windowStartInText: number,
  bp: BodyPartOccurrence,
  direction: Direction,
  fullText: string,
  existingAnchors: MatchedAnchor[]
): MatchedAnchor | null {
  // 先检查感官动词（优先级更高，是核心锚点）
  const sensoryMatch = findBestVerbMatch(
    searchWin, sortedSensoryVerbs, windowStartInText, bp, direction, fullText, existingAnchors, ANCHOR_TYPE.BODY_SENSORY
  );
  if (sensoryMatch) return sensoryMatch;

  // 再检查动作动词
  const actionMatch = findBestVerbMatch(
    searchWin, sortedActionVerbs, windowStartInText, bp, direction, fullText, existingAnchors, ANCHOR_TYPE.BODY_ACTION
  );
  if (actionMatch) return actionMatch;

  return null;
}

/**
 * 在窗口中查找最佳（距离最近的）动词匹配
 */
function findBestVerbMatch(
  searchWin: string,
  sortedVerbs: string[],
  windowStartInText: number,
  bp: BodyPartOccurrence,
  direction: Direction,
  fullText: string,
  existingAnchors: MatchedAnchor[],
  anchorType: string
): MatchedAnchor | null {
  let best: MatchedAnchor | null = null;
  let bestGap = Infinity;

  for (const verb of sortedVerbs) {
    let searchIdx = 0;
    while (true) {
      const idxInWindow = searchWin.indexOf(verb, searchIdx);
      if (idxInWindow === -1) break;

      const verbStartInText = windowStartInText + idxInWindow;
      const verbEndInText = verbStartInText + verb.length;

      // 计算gap
      const gap = direction === 'after'
        ? verbStartInText - bp.end
        : bp.start - verbEndInText;

      if (gap >= 0 && gap <= MAX_ANCHOR_GAP) {
        const anchorStart = direction === 'after' ? bp.start : verbStartInText;
        const anchorEnd = direction === 'after' ? verbEndInText : bp.end;

        // 检查重叠
        const overlaps = existingAnchors.some(
          (prev) => !(anchorEnd <= prev.start || anchorStart >= prev.end)
        );
        if (!overlaps && gap < bestGap) {
          bestGap = gap;
          const anchorText = fullText.substring(anchorStart, anchorEnd);
          best = {
            start: anchorStart,
            end: anchorEnd,
            text: anchorText,
            type: anchorType,
            quality: classifyAnchorQuality(anchorText),
          };
        }
      }

      searchIdx = idxInWindow + 1;
    }
  }

  return best;
}

/** 计算词表中最长词的长度 */
function maxWordLength(words: string[]): number {
  let max = 0;
  for (const w of words) {
    if (w.length > max) max = w.length;
  }
  return max;
}

/**
 * 计算锚点密度（每千字锚点数）
 */
export function calculateAnchorDensity(count: number, totalChars: number): number {
  if (totalChars === 0) return 0;
  return (count / totalChars) * 1000;
}

/**
 * 计算锚点间最大间隔（字数）
 */
export function calculateMaxAnchorGap(
  positions: number[],
  totalChars: number
): number {
  if (positions.length === 0) return totalChars;

  let maxGap = positions[0]; // 从开头到第一个锚点的距离
  for (let i = 1; i < positions.length; i++) {
    const gap = positions[i] - positions[i - 1];
    if (gap > maxGap) maxGap = gap;
  }
  // 最后一个锚点到结尾
  const endGap = totalChars - positions[positions.length - 1];
  if (endGap > maxGap) maxGap = endGap;

  return maxGap;
}
