// ============================================================
// 模板组合器 — v10.0
// 根据章类型 + 冲突类型 + 历史追踪，推荐模板组合方案
// 协调 Coach 模块（开篇/问题循环/情感曲线/战斗风格）的协同输出
// 双轨架构：LLM动态生成 + 规则预定义选择
// ============================================================

import {
  TEMPLATE_COMBOS,
  getComboById,
  generateDynamicComboPrompt,
} from './knowledge/template-combos';
import type { TemplateCombo } from './knowledge/template-combos';
import type { ChapterFunctionType } from './knowledge/chapter-types';
import type { ConflictType } from './knowledge/conflict-types';
import type { LLMProvider } from '../types';
import { llmJson, hasLLM } from '../llm-helper';

// ============ 类型定义 ============

/** 组合推荐输入 */
export interface ComboRecommendInput {
  /** 当前章类型 */
  chapterType: ChapterFunctionType;
  /** 当前冲突类型 */
  conflictType: ConflictType;
  /** 章节意图 */
  chapterIntent: string;
  /** 题材 */
  genre?: string;
  /** 前文内容 */
  prefixContent: string;
  /** 最近使用的组合ID列表（按时间顺序） */
  recentComboIds: string[];
  /** 推荐的章类型（来自Tracker） */
  recommendedChapterType?: ChapterFunctionType;
  /** 推荐的冲突类型（来自DiversityCheck） */
  recommendedConflictType?: ConflictType;
  /** 多样性警告文本 */
  diversityWarnings?: string;
}

/** 组合推荐结果 */
export interface TemplateComposerResult {
  /** 选择的组合方案（预定义或LLM动态生成的） */
  combo: TemplateCombo;
  /** 选择来源 */
  source: 'predefined' | 'llm_dynamic';
  /** 选择理由 */
  reason: string;
  /** 是否因为冷却/约束而被排除的组合数 */
  excludedCount: number;
}

/** 单条推荐 */
export interface ComboRecommendation {
  comboId: string;
  comboName: string;
  reason: string;
}

// ============ 核心组合器 ============

export class TemplateComposer {
  /** 最近使用的组合历史（用于冷却计算） */
  private comboHistory: string[] = [];

  /** 设置组合历史 */
  setComboHistory(ids: string[]): void {
    this.comboHistory = [...ids];
  }

  /** 获取组合历史 */
  getComboHistory(): string[] {
    return [...this.comboHistory];
  }

  /**
   * 推荐模板组合 — LLM动态优先，预定义兜底
   */
  async recommendCombo(
    input: ComboRecommendInput,
    provider?: LLMProvider,
  ): Promise<TemplateComposerResult> {
    // 1. 先尝试预定义选择
    const predefined = this.selectPredefined(input);
    if (predefined) {
      return predefined;
    }

    // 2. 预定义都不合适时，LLM动态生成
    if (hasLLM(provider)) {
      const dynamic = await this.generateDynamicCombo(input, provider!);
      if (dynamic) {
        return dynamic;
      }
    }

    // 3. 最终兜底：返回一个安全默认组合
    const fallback = TEMPLATE_COMBOS.find(c => c.id === 'combo_transition_breather') || TEMPLATE_COMBOS[0];
    return {
      combo: fallback,
      source: 'predefined',
      reason: '所有预定义组合都不匹配，使用安全默认组合',
      excludedCount: TEMPLATE_COMBOS.length - 1,
    };
  }

  /**
   * 从预定义组合中选择最匹配的
   */
  private selectPredefined(input: ComboRecommendInput): TemplateComposerResult | null {
    const recent = input.recentComboIds;
    const lastComboId = recent.length > 0 ? recent[recent.length - 1] : null;

    // 计算每个组合的得分
    const scored = TEMPLATE_COMBOS.map(combo => {
      let score = 0;
      const reasons: string[] = [];

      // 匹配章类型
      if (combo.chapterType === input.chapterType) {
        score += 30;
        reasons.push('章类型匹配');
      }

      // 匹配冲突类型
      if (combo.conflictType === input.conflictType) {
        score += 20;
        reasons.push('冲突类型匹配');
      }

      // 如果有推荐的章类型/冲突类型，额外加分
      if (input.recommendedChapterType && combo.chapterType === input.recommendedChapterType) {
        score += 15;
        reasons.push('符合推荐章类型');
      }
      if (input.recommendedConflictType && combo.conflictType === input.recommendedConflictType) {
        score += 15;
        reasons.push('符合推荐冲突类型');
      }

      // 冷却检测：如果在冷却期内，扣分
      const lastUsedIndex = recent.lastIndexOf(combo.id);
      if (lastUsedIndex !== -1) {
        const chaptersSince = recent.length - lastUsedIndex;
        if (chaptersSince < combo.cooldown) {
          // 冷却期内，大幅扣分
          score -= 50;
          reasons.push(`冷却中（还需${combo.cooldown - chaptersSince}章）`);
        }
      }

      // avoidAfter 检测：如果上一个是avoidAfter中的，扣分
      if (lastComboId && combo.avoidAfter.includes(lastComboId)) {
        score -= 30;
        reasons.push(`不应紧跟在「${lastComboId}」后面`);
      }

      // followAfter 检测：如果上一个是followAfter中的，加分
      if (lastComboId && combo.followAfter.includes(lastComboId)) {
        score += 15;
        reasons.push(`适合承接「${lastComboId}」`);
      }

      // 如果有多样性警告，优先选择能打破重复的组合
      if (input.diversityWarnings && combo.chapterType !== input.chapterType) {
        score += 10;
        reasons.push('能打破重复模式');
      }

      return { combo, score, reasons };
    });

    // 过滤掉冷却期内的组合（分数太低的）
    const viable = scored.filter(s => s.score > 0);

    if (viable.length === 0) {
      return null;
    }

    // 按分数排序
    viable.sort((a, b) => b.score - a.score);
    const best = viable[0];

    return {
      combo: best.combo,
      source: 'predefined',
      reason: best.reasons.join('，'),
      excludedCount: TEMPLATE_COMBOS.length - viable.length,
    };
  }

  /**
   * LLM动态生成组合
   */
  private async generateDynamicCombo(
    input: ComboRecommendInput,
    provider: LLMProvider,
  ): Promise<TemplateComposerResult | null> {
    try {
      const prompt = generateDynamicComboPrompt({
        chapterIntent: input.chapterIntent,
        genre: input.genre,
        prefixContent: input.prefixContent,
        recentCombos: input.recentComboIds,
        recommendedChapterType: input.recommendedChapterType,
        recommendedConflictType: input.recommendedConflictType,
        diversityWarnings: input.diversityWarnings,
      });

      const result = await llmJson<{
        id: string;
        name: string;
        bestFor: string;
        opening: string;
        questionCycle: string;
        emotionCurve: string;
        battleStyle: string | null;
        chapterType: string;
        conflictType: string;
        cooldown: number;
        reason: string;
      }>(provider, [
        { role: 'system', content: '你是网文写作策略引擎。请根据上下文推荐一个模板组合方案。返回JSON。' },
        { role: 'user', content: prompt },
      ], { temperature: 0.4, maxTokens: 1024 });

      if (!result || !result.opening || !result.chapterType) return null;

      // 转换为TemplateCombo结构
      const dynamicCombo: TemplateCombo = {
        id: result.id || 'combo_dynamic',
        name: result.name || '动态组合',
        bestFor: result.bestFor || '',
        opening: result.opening as TemplateCombo['opening'],
        questionCycle: result.questionCycle as TemplateCombo['questionCycle'],
        emotionCurve: result.emotionCurve as TemplateCombo['emotionCurve'],
        battleStyle: result.battleStyle as TemplateCombo['battleStyle'] || undefined,
        chapterType: result.chapterType as ChapterFunctionType,
        conflictType: result.conflictType as ConflictType,
        cooldown: result.cooldown || 3,
        avoidAfter: [],
        followAfter: [],
      };

      return {
        combo: dynamicCombo,
        source: 'llm_dynamic',
        reason: result.reason || 'LLM动态推荐',
        excludedCount: 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * 记录使用的组合
   */
  recordCombo(comboId: string): void {
    this.comboHistory.push(comboId);
    if (this.comboHistory.length > 20) {
      this.comboHistory = this.comboHistory.slice(-20);
    }
  }

  /**
   * 获取冷却状态
   */
  getCooldownStatus(): Array<{ comboId: string; onCooldown: boolean; chaptersLeft: number }> {
    return TEMPLATE_COMBOS.map(combo => {
      const lastUsedIndex = this.comboHistory.lastIndexOf(combo.id);
      if (lastUsedIndex === -1) {
        return { comboId: combo.id, onCooldown: false, chaptersLeft: 0 };
      }
      const chaptersSince = this.comboHistory.length - lastUsedIndex;
      const onCooldown = chaptersSince < combo.cooldown;
      return {
        comboId: combo.id,
        onCooldown,
        chaptersLeft: onCooldown ? combo.cooldown - chaptersSince : 0,
      };
    });
  }
}
