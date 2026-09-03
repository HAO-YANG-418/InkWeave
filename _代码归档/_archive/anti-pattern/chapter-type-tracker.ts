// ============================================================
// 章类型追踪器 — v10.0
// 追踪章功能类型的轮换模式，检测重复和比例失衡
// 双轨架构：LLM语义判断 + 规则关键词兜底
// ============================================================

import {
  CHAPTER_TYPES,
  DEFAULT_CHAPTER_TYPE_CONFIG,
  getChapterTypeDef,
  getChapterTypeName,
  getRecommendedNext,
  getMinInterval,
  generateChapterTypePrompt,
} from './knowledge/chapter-types';
import type { ChapterFunctionType } from './knowledge/chapter-types';
import type { LLMProvider } from '../types';
import { llmJson, hasLLM } from '../llm-helper';

// ============ 类型定义 ============

/** 章类型追踪记录 */
export interface ChapterTypeRecord {
  /** 章节编号 */
  chapterNumber: number;
  /** 章节标题 */
  chapterTitle: string;
  /** 检测到的类型 */
  type: ChapterFunctionType;
  /** 置信度 0-1 */
  confidence: number;
  /** 检测方式：llm | rule */
  detectedBy: 'llm' | 'rule';
}

/** 章类型追踪结果 */
export interface ChapterTypeTrackResult {
  /** 检测到的类型 */
  type: ChapterFunctionType;
  /** 类型名称 */
  typeName: string;
  /** 置信度 */
  confidence: number;
  /** 检测方式 */
  detectedBy: 'llm' | 'rule';
  /** 基于追踪的警告列表 */
  warnings: ChapterTypeWarning[];
  /** 推荐的下一章类型 */
  recommendedNext: ChapterFunctionType[];
}

/** 章类型警告 */
export interface ChapterTypeWarning {
  /** 警告等级 */
  level: 'error' | 'warning' | 'info';
  /** 警告类型 */
  kind: 'consecutive_same' | 'ratio_exceeded' | 'interval_violation' | 'monotone_sequence';
  /** 警告消息 */
  message: string;
}

// ============ 核心追踪器 ============

export class ChapterTypeTracker {
  private history: ChapterTypeRecord[] = [];
  private config = DEFAULT_CHAPTER_TYPE_CONFIG;

  /** 设置历史记录（从外部恢复状态时用） */
  setHistory(records: ChapterTypeRecord[]): void {
    this.history = [...records];
  }

  /** 获取历史记录 */
  getHistory(): ChapterTypeRecord[] {
    return [...this.history];
  }

  /**
   * 检测章节类型 — LLM优先，规则兜底
   */
  async detectChapterType(
    content: string,
    chapterNumber: number,
    chapterTitle: string,
    provider?: LLMProvider,
  ): Promise<ChapterTypeTrackResult> {
    let type: ChapterFunctionType = 'transition';
    let confidence = 0;
    let detectedBy: 'llm' | 'rule' = 'rule';

    // LLM检测
    if (hasLLM(provider)) {
      try {
        const prompt = generateChapterTypePrompt(content);
        const parsed = await llmJson<{ type: ChapterFunctionType; confidence: number; reason?: string }>(
          provider,
          [
            { role: 'system', content: '你是网文章节类型分析专家。请分析章节内容并返回JSON。' },
            { role: 'user', content: prompt },
          ],
          { temperature: 0.3, maxTokens: 512 },
        );
        if (parsed && parsed.confidence >= 0.6 && CHAPTER_TYPES.some(t => t.type === parsed.type)) {
          type = parsed.type;
          confidence = parsed.confidence;
          detectedBy = 'llm';
        }
      } catch {
        // LLM失败，降级到规则检测
      }
    }

    // 规则兜底
    if (detectedBy === 'rule') {
      const ruleResult = this.detectByRule(content);
      type = ruleResult.type;
      confidence = ruleResult.confidence;
    }

    // 记录到历史
    this.history.push({ chapterNumber, chapterTitle, type, confidence, detectedBy });

    // 生成警告
    const warnings = this.generateWarnings(type);

    // 推荐下一章类型
    const recommendedNext = this.recommendNextType(type, warnings);

    return {
      type,
      typeName: getChapterTypeName(type),
      confidence,
      detectedBy,
      warnings,
      recommendedNext,
    };
  }

  /**
   * 规则检测：多信号加权评分
   * 信号1: 关键词匹配（含排除词扣分）— 权重40%
   * 信号2: 对话密度（引号段落占比）— 权重25%
   * 信号3: 位置权重（开头结尾关键词加权）— 权重20%
   * 信号4: 句子长度方差 — 权重15%
   * 信号5: 关键词优势比（v10.1新增）— 当某类型关键词数远超其他时加分
   */
  private detectByRule(content: string): { type: ChapterFunctionType; confidence: number } {
    const paragraphs = content.split(/\n+/).filter(p => p.trim().length > 0);

    // 信号2: 对话密度
    const dialogueParas = paragraphs.filter(p => /^[""""].*[""""]/.test(p.trim()) || /\u201c.*\u201d/.test(p));
    const dialogueRatio = paragraphs.length > 0 ? dialogueParas.length / paragraphs.length : 0;

    // 信号4: 句子长度方差
    const sentences = content.split(/[。！？\n]/).filter(s => s.trim().length > 0);
    const sentLengths = sentences.map(s => s.trim().length);
    const avgLen = sentLengths.length > 0 ? sentLengths.reduce((a, b) => a + b, 0) / sentLengths.length : 0;
    const variance = sentLengths.length > 0
      ? sentLengths.reduce((sum, len) => sum + Math.pow(len - avgLen, 2), 0) / sentLengths.length
      : 0;
    const stdDev = Math.sqrt(variance);
    const sentenceUniformity = avgLen > 0 ? Math.min(1, stdDev / avgLen) : 0.5;

    // 信号3: 位置权重 — 开头300字和结尾300字
    const head = content.slice(0, 300);
    const tail = content.slice(-300);

    const scores: Record<string, number> = {};
    const rawKeywordCounts: Record<string, number> = {}; // v10.1: 记录原始关键词命中数

    for (const def of CHAPTER_TYPES) {
      // 信号1: 关键词匹配（全文）
      let kwScore = 0;
      let rawCount = 0;
      for (const kw of def.triggerKeywords) {
        const fullMatches = content.split(kw).length - 1;
        const headMatches = head.split(kw).length - 1;
        const tailMatches = tail.split(kw).length - 1;
        rawCount += fullMatches;
        // 信号3: 开头结尾关键词加权1.5x
        kwScore += (fullMatches - headMatches - tailMatches) + (headMatches + tailMatches) * 1.5;
      }
      // 排除词扣分
      let suppressCount = 0;
      for (const sk of def.suppressKeywords) {
        suppressCount += content.split(sk).length - 1;
      }
      kwScore = Math.max(0, kwScore - suppressCount * 0.8);
      rawKeywordCounts[def.type] = rawCount;

      // 信号2: 对话密度（乘数，不独立加分）
      let dialogueMultiplier = 0;
      if (def.type === 'setup' || def.type === 'transition' || def.type === 'suspense') {
        dialogueMultiplier = dialogueRatio * 0.5;
      } else if (def.type === 'battle' || def.type === 'payoff') {
        dialogueMultiplier = -dialogueRatio * 0.3;
      }

      // 信号4: 句子均匀度（乘数，不独立加分）
      let uniformityMultiplier = 0;
      if (def.type === 'battle') {
        uniformityMultiplier = (1 - sentenceUniformity) * 0.3;
      } else if (def.type === 'setup' || def.type === 'transition') {
        uniformityMultiplier = sentenceUniformity * 0.3;
      }

      const multiplier = Math.max(0.1, 1.0 + dialogueMultiplier + uniformityMultiplier);
      let totalScore = kwScore * multiplier;

      // v10.1: 信号5 — 关键词优势比。当某类型关键词数远超其他所有类型时给予额外加分
      const otherCounts = Object.entries(rawKeywordCounts)
        .filter(([t]) => t !== def.type)
        .reduce((sum, [, c]) => sum + c, 0);
      if (rawCount > 0 && rawCount > otherCounts * 2) {
        totalScore *= 1.5; // 关键词数2倍以上 → 50%加分
      } else if (rawCount > 0 && rawCount > otherCounts * 1.5) {
        totalScore *= 1.2; // 1.5倍以上 → 20%加分
      }

      scores[def.type] = Math.max(0, totalScore);
    }

    // 找到得分最高的类型
    let bestType: ChapterFunctionType = 'transition';
    let bestScore = 0;
    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type as ChapterFunctionType;
      }
    }

    // 如果所有得分都接近0，默认为过渡章
    if (bestScore < 0.5) {
      return { type: 'transition', confidence: 0.3 };
    }

    // 置信度基于得分差异
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = Math.min(0.85, 0.4 + (bestScore / Math.max(1, totalScore)) * 0.45);

    return { type: bestType, confidence };
  }

  /**
   * 解析LLM响应
   */
  private parseLLMResponse(response: string): { type: ChapterFunctionType; confidence: number } | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.type && CHAPTER_TYPES.some(t => t.type === parsed.type)) {
        return {
          type: parsed.type,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 生成基于历史追踪的警告
   */
  private generateWarnings(currentType: ChapterFunctionType): ChapterTypeWarning[] {
    const warnings: ChapterTypeWarning[] = [];
    const recent = this.history.slice(-this.config.slidingWindowSize);
    const recentWithoutCurrent = recent.slice(0, -1);

    // 1. 连续同类型检测
    let consecutive = 0;
    for (let i = recentWithoutCurrent.length - 1; i >= 0; i--) {
      if (recentWithoutCurrent[i].type === currentType) {
        consecutive++;
      } else {
        break;
      }
    }

    const def = getChapterTypeDef(currentType);
    const maxConsecutive = def?.minInterval === 1 ? this.config.maxConsecutiveSameType + 1 : this.config.maxConsecutiveSameType;

    if (consecutive >= maxConsecutive) {
      warnings.push({
        level: consecutive >= maxConsecutive + 1 ? 'error' : 'warning',
        kind: 'consecutive_same',
        message: `连续${consecutive + 1}章为「${getChapterTypeName(currentType)}」，超出容忍阈值${maxConsecutive}章。读者会感到重复疲劳。`,
      });
    }

    // 2. 窗口内类型占比检测
    const typeCount = recent.filter(r => r.type === currentType).length;
    const ratio = typeCount / Math.max(1, recent.length);
    if (ratio > this.config.maxTypeRatio && recent.length >= 4) {
      warnings.push({
        level: 'warning',
        kind: 'ratio_exceeded',
        message: `最近${recent.length}章中「${getChapterTypeName(currentType)}」占比${(ratio * 100).toFixed(0)}%，超过${(this.config.maxTypeRatio * 100).toFixed(0)}%上限。类型分布过于集中。`,
      });
    }

    // 3. 最小间隔检测
    const minInterval = getMinInterval(currentType);
    if (minInterval > 1 && recentWithoutCurrent.length > 0) {
      const lastSameType = [...recentWithoutCurrent].reverse().findIndex(r => r.type === currentType);
      if (lastSameType !== -1 && lastSameType < minInterval - 1) {
        warnings.push({
          level: 'warning',
          kind: 'interval_violation',
          message: `「${getChapterTypeName(currentType)}」要求最小间隔${minInterval}章，但上一章距今仅${lastSameType + 1}章。`,
        });
      }
    }

    // 4. 单调序列检测（连续3+章都是同一情感色调）
    const defCurrent = getChapterTypeDef(currentType);
    if (defCurrent && recentWithoutCurrent.length >= 2) {
      const lastTwo = recentWithoutCurrent.slice(-2);
      const allSameEmotion = lastTwo.every(r => {
        const d = getChapterTypeDef(r.type);
        return d?.emotion === defCurrent.emotion;
      });
      if (allSameEmotion) {
        warnings.push({
          level: 'warning',
          kind: 'monotone_sequence',
          message: `最近3章情感色调均为「${defCurrent.emotion}」，读者会产生审美疲劳，建议变化情感节奏。`,
        });
      }
    }

    return warnings;
  }

  /**
   * 推荐下一章类型
   */
  private recommendNextType(
    currentType: ChapterFunctionType,
    warnings: ChapterTypeWarning[],
  ): ChapterFunctionType[] {
    const baseRecommendations = getRecommendedNext(currentType);

    // 如果有连续重复警告，从推荐中排除当前类型
    const hasConsecutiveWarning = warnings.some(w => w.kind === 'consecutive_same');
    if (hasConsecutiveWarning) {
      return baseRecommendations.filter(t => t !== currentType);
    }

    // 如果有单调序列警告，优先推荐情感色调不同的类型
    const hasMonotoneWarning = warnings.some(w => w.kind === 'monotone_sequence');
    if (hasMonotoneWarning) {
      const currentDef = getChapterTypeDef(currentType);
      const diverse = baseRecommendations.filter(t => {
        const def = getChapterTypeDef(t);
        return def?.emotion !== currentDef?.emotion;
      });
      if (diverse.length > 0) return diverse;
    }

    return baseRecommendations;
  }

  /**
   * 获取类型分布统计
   */
  getTypeDistribution(): Record<ChapterFunctionType, number> {
    const dist: Record<string, number> = {};
    for (const def of CHAPTER_TYPES) {
      dist[def.type] = 0;
    }
    for (const record of this.history) {
      dist[record.type] = (dist[record.type] || 0) + 1;
    }
    return dist as Record<ChapterFunctionType, number>;
  }

  /**
   * 获取最近N章的类型序列
   */
  getRecentTypeSequence(count: number = 8): ChapterFunctionType[] {
    return this.history.slice(-count).map(r => r.type);
  }
}
