// ============================================================
// GWE V2.0 - 填充词检测器
// 检测冗余填充词、过多标点、重复对话标签等问题
// ============================================================

import type { MergedVocabulary, Thresholds } from './types';

// ============================================================
// 填充词检测结果类型
// ============================================================

export interface FillerDetectionResult {
  /** 检测到的填充词总数 */
  count: number;
  /** 包含填充词的句子列表 */
  sentences: string[];
  /** 填充词在文本中的位置列表 */
  positions: number[];
  /** 破折号"——"出现次数 */
  dashCount: number;
  /** 省略号"……"出现次数 */
  ellipsisCount: number;
  /** 重复对话标签信息 */
  repeatedTags: Array<{
    tag: string;
    count: number;
    positions: number[];
  }>;
  /** 检测到的填充词详情（词+位置） */
  fillerDetails: Array<{
    word: string;
    position: number;
  }>;
}

// ============================================================
// 句子切分正则（中文句子结束符）
// ============================================================

const SENTENCE_ENDINGS = /[。！？!?\n]/g;

/**
 * 将文本切分为句子列表，返回句子文本和起始位置
 */
function splitSentences(text: string): Array<{ text: string; start: number; end: number }> {
  const sentences: Array<{ text: string; start: number; end: number }> = [];
  let start = 0;
  let match: RegExpExecArray | null;

  const re = new RegExp(SENTENCE_ENDINGS.source, 'g');
  while ((match = re.exec(text)) !== null) {
    const end = match.index + match[0].length;
    const sentText = text.substring(start, end).trim();
    if (sentText.length > 0) {
      sentences.push({ text: sentText, start, end });
    }
    start = end;
  }

  // 最后一段（可能没有结束符）
  if (start < text.length) {
    const sentText = text.substring(start).trim();
    if (sentText.length > 0) {
      sentences.push({ text: sentText, start, end: text.length });
    }
  }

  return sentences;
}

// ============================================================
// 核心检测函数
// ============================================================

/**
 * 检测文本中的填充词和相关问题
 *
 * @param text 待检测文本
 * @param vocab 合并后的词库
 * @param thresholds 检测阈值（用于对话标签重复判断）
 * @returns FillerDetectionResult
 */
export function detectFillers(
  text: string,
  vocab: MergedVocabulary,
  thresholds: Thresholds
): FillerDetectionResult {
  const sentences: string[] = [];
  const positions: number[] = [];
  const fillerDetails: Array<{ word: string; position: number }> = [];
  const fillerPatterns = vocab.fillerPatterns || new Set<string>();
  const dialogueTags = vocab.dialogueTags || new Set<string>();

  // ---- 1. 检测填充词模式 ----
  const sortedPatterns = Array.from(fillerPatterns).sort((a, b) => b.length - a.length);
  const foundPositions = new Set<number>(); // 避免同一位置重复计数

  for (const pattern of sortedPatterns) {
    let idx = 0;
    while ((idx = text.indexOf(pattern, idx)) !== -1) {
      // 检查是否与已发现的位置重叠
      let overlaps = false;
      for (let p = idx; p < idx + pattern.length; p++) {
        if (foundPositions.has(p)) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        fillerDetails.push({ word: pattern, position: idx });
        positions.push(idx);
        // 标记该区域已匹配
        for (let p = idx; p < idx + pattern.length; p++) {
          foundPositions.add(p);
        }
      }
      idx += pattern.length;
    }
  }

  // ---- 2. 检测破折号和省略号 ----
  let dashCount = 0;
  let ellipsisCount = 0;

  {
    let idx = 0;
    while ((idx = text.indexOf('——', idx)) !== -1) {
      dashCount++;
      idx += 2;
    }
  }
  {
    let idx = 0;
    while ((idx = text.indexOf('……', idx)) !== -1) {
      ellipsisCount++;
      idx += 2;
    }
  }

  // 也统计半角省略号...
  {
    const dotsRegex = /\.{3,}/g;
    while (dotsRegex.exec(text) !== null) {
      ellipsisCount++;
    }
  }

  // ---- 3. 检测连续相同对话标签 ----
  const repeatedTags: Array<{ tag: string; count: number; positions: number[] }> = [];
  const maxRepeat = thresholds.maxDialogueTagRepeat || 2;

  for (const tag of dialogueTags) {
    const tagPositions: number[] = [];
    let idx = 0;
    while ((idx = text.indexOf(tag, idx)) !== -1) {
      // 确保是独立的对话标签（前面不是普通文字组成部分）
      // 简单启发式：标签前一个字符如果是引号或逗号或换行或开头，就算
      const charBefore = idx > 0 ? text[idx - 1] : '';
      if (
        idx === 0 ||
        charBefore === '"' ||
        charBefore === '"' ||
        charBefore === '「' ||
        charBefore === '」' ||
        charBefore === '，' ||
        charBefore === ',' ||
        charBefore === '\n' ||
        charBefore === ' '
      ) {
        tagPositions.push(idx);
      }
      idx += tag.length;
    }

    // 检查连续出现（在相邻句子中）
    if (tagPositions.length > maxRepeat) {
      // 将句子切分，看标签在句子中的分布
      const sents = splitSentences(text);
      const tagSentenceIndices: number[] = [];

      for (const tp of tagPositions) {
        for (let si = 0; si < sents.length; si++) {
          if (tp >= sents[si].start && tp < sents[si].end) {
            if (!tagSentenceIndices.includes(si)) {
              tagSentenceIndices.push(si);
            }
            break;
          }
        }
      }

      // 检查连续句子索引
      let consecutiveCount = 1;
      let maxConsecutive = 1;
      let consecutiveStart = tagSentenceIndices[0];

      for (let i = 1; i < tagSentenceIndices.length; i++) {
        if (tagSentenceIndices[i] === tagSentenceIndices[i - 1] + 1) {
          consecutiveCount++;
          maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
        } else {
          if (consecutiveCount > maxRepeat) {
            repeatedTags.push({
              tag,
              count: consecutiveCount,
              positions: tagPositions.slice(
                tagSentenceIndices.indexOf(consecutiveStart),
                i
              ),
            });
          }
          consecutiveCount = 1;
          consecutiveStart = tagSentenceIndices[i];
        }
      }
      // 最后一段
      if (consecutiveCount > maxRepeat) {
        repeatedTags.push({
          tag,
          count: consecutiveCount,
          positions: tagPositions.slice(-consecutiveCount),
        });
      }
    }
  }

  // ---- 4. 找出包含填充词的句子 ----
  const sents = splitSentences(text);
  const sentenceSet = new Set<string>();

  for (const fp of positions) {
    for (const s of sents) {
      if (fp >= s.start && fp < s.end) {
        sentenceSet.add(s.text);
        break;
      }
    }
  }

  for (const s of sentenceSet) {
    sentences.push(s);
  }

  // 按位置排序
  positions.sort((a, b) => a - b);
  fillerDetails.sort((a, b) => a.position - b.position);

  return {
    count: fillerDetails.length,
    sentences,
    positions,
    dashCount,
    ellipsisCount,
    repeatedTags,
    fillerDetails,
  };
}

/**
 * 计算每千字填充词密度
 */
export function calculateFillerDensity(count: number, totalChars: number): number {
  if (totalChars === 0) return 0;
  return (count / totalChars) * 1000;
}
