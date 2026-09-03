// ============================================================
// 冲突多样性检测器 — v10.0
// 追踪冲突类型和解决方式的多样性，防止单调
// 双轨架构：LLM语义分析 + 规则信号兜底
// ============================================================

import {
  CONFLICT_TYPES,
  DEFAULT_CONFLICT_CONFIG,
  getConflictTypeDef,
  getConflictTypeName,
  getResolutionName,
  generateConflictAnalysisPrompt,
} from './knowledge/conflict-types';
import type { ConflictType, ConflictResolution } from './knowledge/conflict-types';
import type { LLMProvider } from '../types';
import { llmJson, hasLLM } from '../llm-helper';

// ============ 类型定义 ============

/** 冲突追踪记录 */
export interface ConflictRecord {
  /** 章节编号 */
  chapterNumber: number;
  /** 主要冲突类型 */
  primaryConflict: ConflictType;
  /** 次要冲突类型 */
  secondaryConflicts: ConflictType[];
  /** 解决方式 */
  resolution: ConflictResolution;
  /** 置信度 */
  confidence: number;
  /** 检测方式 */
  detectedBy: 'llm' | 'rule';
}

/** 冲突多样性检测结果 */
export interface ConflictDiversityResult {
  /** 主要冲突类型 */
  primaryConflict: ConflictType;
  /** 次要冲突类型 */
  secondaryConflicts: ConflictType[];
  /** 冲突类型名称 */
  conflictName: string;
  /** 解决方式 */
  resolution: ConflictResolution;
  /** 解决方式名称 */
  resolutionName: string;
  /** 置信度 */
  confidence: number;
  /** 检测方式 */
  detectedBy: 'llm' | 'rule';
  /** 警告列表 */
  warnings: ConflictWarning[];
  /** 推荐的冲突类型（增加多样性用） */
  recommendedConflictTypes: ConflictType[];
}

/** 冲突警告 */
export interface ConflictWarning {
  /** 警告等级 */
  level: 'error' | 'warning' | 'info';
  /** 警告类型 */
  kind: 'same_conflict_streak' | 'same_resolution_streak' | 'low_diversity' | 'bad_resolution';
  /** 警告消息 */
  message: string;
}

// ============ 核心检测器 ============

export class ConflictDiversityCheck {
  private history: ConflictRecord[] = [];
  private config = DEFAULT_CONFLICT_CONFIG;

  /** 设置历史记录 */
  setHistory(records: ConflictRecord[]): void {
    this.history = [...records];
  }

  /** 获取历史记录 */
  getHistory(): ConflictRecord[] {
    return [...this.history];
  }

  /**
   * 分析章节冲突 — LLM优先，规则兜底
   */
  async analyzeConflict(
    content: string,
    chapterNumber: number,
    provider?: LLMProvider,
  ): Promise<ConflictDiversityResult> {
    let primaryConflict: ConflictType = 'external_combat';
    let secondaryConflicts: ConflictType[] = [];
    let resolution: ConflictResolution = 'force';
    let confidence = 0;
    let detectedBy: 'llm' | 'rule' = 'rule';

    // LLM检测
    if (hasLLM(provider)) {
      try {
        const prompt = generateConflictAnalysisPrompt(content);
        const parsed = await llmJson<{
          primaryConflict: ConflictType;
          secondaryConflicts: ConflictType[];
          resolution: ConflictResolution;
          confidence: number;
        }>(provider, [
          { role: 'system', content: '你是网文冲突分析专家。请分析章节内容并返回JSON。' },
          { role: 'user', content: prompt },
        ], { temperature: 0.3, maxTokens: 512 });

        if (parsed && parsed.confidence >= 0.6 && CONFLICT_TYPES.some(t => t.type === parsed.primaryConflict)) {
          primaryConflict = parsed.primaryConflict;
          secondaryConflicts = Array.isArray(parsed.secondaryConflicts)
            ? parsed.secondaryConflicts.filter((c) => CONFLICT_TYPES.some(t => t.type === c))
            : [];
          resolution = parsed.resolution || 'unresolved';
          confidence = parsed.confidence;
          detectedBy = 'llm';
        }
      } catch {
        // 降级到规则检测
      }
    }

    // 规则兜底
    if (detectedBy === 'rule') {
      const ruleResult = this.detectByRule(content);
      primaryConflict = ruleResult.primaryConflict;
      secondaryConflicts = ruleResult.secondaryConflicts;
      resolution = ruleResult.resolution;
      confidence = ruleResult.confidence;
    }

    // 记录历史
    this.history.push({
      chapterNumber,
      primaryConflict,
      secondaryConflicts,
      resolution,
      confidence,
      detectedBy,
    });

    // 生成警告
    const warnings = this.generateWarnings(primaryConflict, resolution);

    // 推荐冲突类型
    const recommendedConflictTypes = this.recommendDiverseConflictTypes(primaryConflict, warnings);

    return {
      primaryConflict,
      secondaryConflicts,
      conflictName: getConflictTypeName(primaryConflict),
      resolution,
      resolutionName: getResolutionName(resolution),
      confidence,
      detectedBy,
      warnings,
      recommendedConflictTypes,
    };
  }

  /**
   * 规则检测：多信号加权评分
   * 信号1: 关键词匹配（含排除信号扣分）— 权重40%
   * 信号2: 对话密度（引号段落占比）— 权重25%
   * 信号3: 位置权重（开头结尾关键词加权）— 权重20%
   * 信号4: 句子长度方差 — 权重15%
   */
  private detectByRule(content: string): {
    primaryConflict: ConflictType;
    secondaryConflicts: ConflictType[];
    resolution: ConflictResolution;
    confidence: number;
  } {
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
    // 战斗冲突句子短而均匀 → stdDev小; 心理/道德冲突句子长短交错 → stdDev大
    const sentenceUniformity = avgLen > 0 ? Math.min(1, stdDev / avgLen) : 0.5; // 0=均匀, 1=差异大

    // 信号3: 位置权重 — 开头300字和结尾300字
    const head = content.slice(0, 300);
    const tail = content.slice(-300);

    const scores: Record<string, number> = {};

    for (const def of CONFLICT_TYPES) {
      // 信号1: 关键词匹配（全文）+ 位置加权
      let kwScore = 0;
      for (const signal of def.triggerSignals) {
        const fullMatches = content.split(signal).length - 1;
        const headMatches = head.split(signal).length - 1;
        const tailMatches = tail.split(signal).length - 1;
        // 信号3: 开头结尾信号加权1.5x
        kwScore += (fullMatches - headMatches - tailMatches) + (headMatches + tailMatches) * 1.5;
      }
      // 排除信号扣分
      let suppressCount = 0;
      for (const sk of def.suppressSignals) {
        suppressCount += content.split(sk).length - 1;
      }
      kwScore = Math.max(0, kwScore - suppressCount * 0.8);

      // 信号2: 对话密度（乘数，不独立加分）
      let dialogueMultiplier = 0;
      if (def.type === 'interpersonal' || def.type === 'informational_cognitive') {
        // 人际/信息冲突 — 对话多 → 加分（冲突通过对话展开）
        dialogueMultiplier = dialogueRatio * 0.5;
      } else if (def.type === 'external_combat') {
        // 外部战斗 — 对话多 → 扣分（战斗应以动作为主）
        dialogueMultiplier = -dialogueRatio * 0.3;
      }

      // 信号4: 句子均匀度（乘数，不独立加分）
      let uniformityMultiplier = 0;
      if (def.type === 'external_combat') {
        // 战斗冲突句子短而均匀
        uniformityMultiplier = (1 - sentenceUniformity) * 0.3;
      } else if (def.type === 'internal_psychological' || def.type === 'moral_choice') {
        // 心理/道德冲突句子长短交错（内心独白+叙述交替）
        uniformityMultiplier = sentenceUniformity * 0.3;
      }

      // 乘法总分：关键词得分为基础，结构信号为乘数
      const multiplier = Math.max(0.1, 1.0 + dialogueMultiplier + uniformityMultiplier);
      const totalScore = kwScore * multiplier;
      scores[def.type] = Math.max(0, totalScore);
    }

    // 排序找前2
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const primary = (sorted[0]?.[0] || 'external_combat') as ConflictType;
    const secondaryScore = sorted[1]?.[1] || 0;
    const secondary = sorted[1]?.[0] as ConflictType | undefined;
    const secondaryConflicts = secondary && secondaryScore > 0.5 ? [secondary] : [];

    // 解决方式检测
    const resolution = this.detectResolution(content);

    // 如果所有得分都接近0，默认为外部战斗冲突
    const bestScore = sorted[0]?.[1] || 0;
    if (bestScore < 0.5) {
      return {
        primaryConflict: 'external_combat',
        secondaryConflicts: [],
        resolution,
        confidence: 0.3,
      };
    }

    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = Math.min(0.85, 0.4 + (bestScore / Math.max(1, totalScore)) * 0.45);

    return {
      primaryConflict: primary,
      secondaryConflicts,
      resolution,
      confidence,
    };
  }

  /**
   * 检测解决方式
   */
  private detectResolution(content: string): ConflictResolution {
    // 力量获胜
    if (/碾压|秒杀|击败|斩杀|灭杀|一击|破开|震碎|实力|更强/.test(content)) {
      return 'force';
    }
    // 智取
    if (/计谋|陷阱|布局|引诱|算计|利用|弱点|破绽|策略|巧妙/.test(content)) {
      return 'intelligence';
    }
    // 说服
    if (/说服|劝|言语|道理|感化|沟通|谈判|约定/.test(content)) {
      return 'persuasion';
    }
    // 牺牲
    if (/牺牲|付出代价|失去|消耗|代价|燃烧|燃烧寿元|断臂|重伤/.test(content)) {
      return 'sacrifice';
    }
    // 运气
    if (/巧合|恰好|正好|意外|侥幸|碰巧|突然|刚好/.test(content)) {
      return 'luck';
    }
    // 未解决
    return 'unresolved';
  }

  /**
   * 解析LLM响应
   */
  private parseLLMResponse(response: string): {
    primaryConflict: ConflictType;
    secondaryConflicts: ConflictType[];
    resolution: ConflictResolution;
    confidence: number;
  } | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]);

      const validConflict = CONFLICT_TYPES.some(t => t.type === parsed.primaryConflict);
      if (!validConflict) return null;

      return {
        primaryConflict: parsed.primaryConflict,
        secondaryConflicts: Array.isArray(parsed.secondaryConflicts)
          ? parsed.secondaryConflicts.filter((c: string) => CONFLICT_TYPES.some(t => t.type === c))
          : [],
        resolution: parsed.resolution || 'unresolved',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    } catch {
      return null;
    }
  }

  /**
   * 生成多样性警告
   */
  private generateWarnings(
    currentConflict: ConflictType,
    currentResolution: ConflictResolution,
  ): ConflictWarning[] {
    const warnings: ConflictWarning[] = [];
    const recent = this.history.slice(-this.config.windowSize);
    const recentWithoutCurrent = recent.slice(0, -1);

    if (recentWithoutCurrent.length === 0) return warnings;

    // 1. 同类型连续检测
    let conflictStreak = 0;
    for (let i = recentWithoutCurrent.length - 1; i >= 0; i--) {
      if (recentWithoutCurrent[i].primaryConflict === currentConflict) {
        conflictStreak++;
      } else {
        break;
      }
    }

    if (conflictStreak >= this.config.maxConsecutiveSame) {
      warnings.push({
        level: conflictStreak >= this.config.maxConsecutiveSame + 1 ? 'error' : 'warning',
        kind: 'same_conflict_streak',
        message: `连续${conflictStreak + 1}章冲突类型均为「${getConflictTypeName(currentConflict)}」，读者会产生重复感。建议变换冲突维度。`,
      });
    }

    // 2. 同解决方式连续检测
    let resolutionStreak = 0;
    for (let i = recentWithoutCurrent.length - 1; i >= 0; i--) {
      if (recentWithoutCurrent[i].resolution === currentResolution) {
        resolutionStreak++;
      } else {
        break;
      }
    }

    if (resolutionStreak >= this.config.maxConsecutiveSameResolution) {
      warnings.push({
        level: resolutionStreak >= this.config.maxConsecutiveSameResolution + 1 ? 'error' : 'warning',
        kind: 'same_resolution_streak',
        message: `连续${resolutionStreak + 1}章冲突解决方式均为「${getResolutionName(currentResolution)}」，缺乏变化。建议更换解决手段。`,
      });
    }

    // 3. 低多样性检测
    if (recent.length >= this.config.minConflictTypes + 1) {
      const uniqueTypes = new Set(recent.map(r => r.primaryConflict));
      if (uniqueTypes.size < this.config.minConflictTypes) {
        warnings.push({
          level: 'warning',
          kind: 'low_diversity',
          message: `最近${recent.length}章仅使用了${uniqueTypes.size}种冲突类型（建议至少${this.config.minConflictTypes}种），冲突维度过于单一。`,
        });
      }
    }

    // 4. 不当解决方式检测
    const def = getConflictTypeDef(currentConflict);
    if (def && def.badResolutions.includes(currentResolution)) {
      warnings.push({
        level: 'info',
        kind: 'bad_resolution',
        message: `「${getConflictTypeName(currentConflict)}」用「${getResolutionName(currentResolution)}」解决不太合适，建议用${def.suggestedResolutions.map(r => `「${getResolutionName(r)}」`).join('或')}。`,
      });
    }

    return warnings;
  }

  /**
   * 推荐多样化冲突类型
   */
  private recommendDiverseConflictTypes(
    currentConflict: ConflictType,
    warnings: ConflictWarning[],
  ): ConflictType[] {
    const hasStreak = warnings.some(w => w.kind === 'same_conflict_streak');
    const hasLowDiversity = warnings.some(w => w.kind === 'low_diversity');

    // 找出最近窗口内未使用过的冲突类型
    const recent = this.history.slice(-this.config.windowSize);
    const usedTypes = new Set(recent.map(r => r.primaryConflict));
    const unusedTypes = CONFLICT_TYPES
      .filter(t => !usedTypes.has(t.type))
      .map(t => t.type);

    if (hasStreak || hasLowDiversity) {
      // 优先返回未使用的类型
      if (unusedTypes.length > 0) {
        return unusedTypes.slice(0, 3);
      }
    }

    // 返回与当前冲突互补的类型
    const complementary: Record<ConflictType, ConflictType[]> = {
      external_combat: ['internal_psychological', 'interpersonal', 'moral_choice'],
      internal_psychological: ['external_combat', 'informational_cognitive', 'social_power'],
      interpersonal: ['external_combat', 'moral_choice', 'social_power'],
      informational_cognitive: ['external_combat', 'interpersonal', 'moral_choice'],
      moral_choice: ['external_combat', 'informational_cognitive', 'interpersonal'],
      social_power: ['internal_psychological', 'interpersonal', 'moral_choice'],
    };

    return (complementary[currentConflict] || []).filter(t => !usedTypes.has(t)).slice(0, 3);
  }

  /**
   * 获取冲突类型分布统计
   */
  getConflictDistribution(): Record<ConflictType, number> {
    const dist: Record<string, number> = {};
    for (const def of CONFLICT_TYPES) {
      dist[def.type] = 0;
    }
    for (const record of this.history) {
      dist[record.primaryConflict] = (dist[record.primaryConflict] || 0) + 1;
    }
    return dist as Record<ConflictType, number>;
  }

  /**
   * 获取解决方式分布统计
   */
  getResolutionDistribution(): Record<ConflictResolution, number> {
    const dist: Record<string, number> = {};
    const resolutions: ConflictResolution[] = ['force', 'intelligence', 'persuasion', 'luck', 'sacrifice', 'unresolved'];
    for (const r of resolutions) {
      dist[r] = 0;
    }
    for (const record of this.history) {
      dist[record.resolution] = (dist[record.resolution] || 0) + 1;
    }
    return dist as Record<ConflictResolution, number>;
  }
}
