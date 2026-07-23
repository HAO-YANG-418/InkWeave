// ============================================================
// 文本统计函数 — V3.2
// 从 checker.ts 中提取出的纯文本统计逻辑
// 来源：Storyvein
// ============================================================

import type { TextStats } from '../types';

/**
 * 计算文本基础统计数据
 */
export function computeTextStats(text: string): TextStats {
  const totalChars = text.replace(/\s/g, '').length;

  // 中文字数（CJK字符）
  const cjkMatch = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g);
  const totalWords = cjkMatch ? cjkMatch.length : 0;

  // 段落数
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const paragraphCount = paragraphs.length;
  const avgParagraphLength = paragraphCount > 0 ? totalWords / paragraphCount : 0;

  // 句子数（按。！？；\n切分）
  const sentences = text.split(/[。！？；\n]+/).filter((s) => s.trim().length > 0);
  const sentenceCount = sentences.length;
  const avgSentenceLength = sentenceCount > 0 ? totalWords / sentenceCount : 0;

  // 短句比例（≤8字）
  const shortSentences = sentences.filter((s) => s.replace(/[，、\s]/g, '').length <= 8);
  const shortSentenceRatio = sentenceCount > 0 ? shortSentences.length / sentenceCount : 0;

  // 锚点数（身体部位相关词）
  const bodyParts = /手|脚|腿|头|脸|眼|嘴|耳|鼻|肩|背|腰|腹|胸|臂|指|掌|拳|膝|踝|腕|颈|额|颊|唇|舌|齿|心口|后颈|肩胛/g;
  const anchorMatches = text.match(bodyParts);
  const anchorCount = anchorMatches ? anchorMatches.length : 0;

  // 填充词数（"了""着""的""地""得"等虚词密度）
  const fillerMatch = text.match(/[了的着地得]/g);
  const fillerCount = fillerMatch ? fillerMatch.length : 0;

  // 对话比例
  const dialogueMatch = text.match(/[""「」『』]/g);
  const dialogueCharCount = dialogueMatch ? dialogueMatch.length : 0;
  const dialogueRatio = totalChars > 0 ? dialogueCharCount / totalChars : 0;

  // 五感提及
  const sensoryMentions: Record<string, number> = {
    visual: (text.match(/看见|看到|望见|注视|盯着|映入|光|暗|亮|黑|白|红|蓝|绿|黄|颜色|色彩|形状|轮廓|影子/g) || []).length,
    auditory: (text.match(/听见|听到|声音|响|静|嘈杂|嗡|轰|咔|啪|脚步声|呼吸声/g) || []).length,
    tactile: (text.match(/触|摸|碰|热|冷|凉|烫|温|硬|软|粗糙|光滑|湿|干|黏|刺痛|发麻/g) || []).length,
    olfactory: (text.match(/闻到|气味|臭|香|腥|焦|霉|刺鼻/g) || []).length,
    gustatory: (text.match(/尝|味道|甜|酸|苦|辣|咸|涩|腥/g) || []).length,
  };

  return {
    totalChars,
    totalWords,
    paragraphCount,
    avgParagraphLength,
    sentenceCount,
    avgSentenceLength,
    shortSentenceRatio,
    anchorCount,
    fillerCount,
    dialogueRatio,
    sensoryMentions,
  };
}