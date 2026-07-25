// ============================================================
// 冷却系统 (Cooling System) — v4.0
// 职责：4级冷却（模板ID/模板类型/对手原型/效果词）+ 知识库驱动套路检测
// v3.0: 接入knowledge/cooling-patterns，自动检测文本中的套路并管理冷却
// v4.0: LLM语义检测 — 从关键词匹配升级为语义理解，识别同义变体和隐式套路
// ============================================================

import {
  detectPatterns,
  getCategoryLabel,
  getPatternById,
  COOLING_PATTERNS,
  type PatternEntry,
  type PatternCategory,
  PLOT_TEMPLATES,
  type PlotTemplate,
} from '../knowledge/cooling-patterns'
import type { LLMProvider } from '../types'
import { llmJson, hasLLM, type LLMChatMessage } from '../llm-helper'
import { logWarn } from '../logger'

/** 存储接口：浏览器用localStorage，Node用fs，默认内存 */
export interface CoolingStorage {
  load(): Promise<Record<string, unknown> | null>;
  save(data: Record<string, unknown>): Promise<void>;
}

/** 内存存储（默认） */
export class MemoryCoolingStorage implements CoolingStorage {
  private data: Record<string, unknown> | null = null;
  async load() { return this.data; }
  async save(data: Record<string, unknown>) { this.data = data; }
}

// === 冷却记录 ===
export interface CoolingRecord {
  id: string;
  type: 'template_id' | 'template_type' | 'opponent_archetype' | 'effect_keyword';
  last_used_chapter: number;
  cooldown_duration: number;
  cooldown_until: number;
}

// === 冷却配置 ===
export interface CoolingConfig {
  template_id_cooldown: Record<string, number>;  // 默认5章
  template_type_cooldown: Record<string, number>; // 默认2章
  opponent_archetype_cooldown: Record<string, number>; // 默认8章
  effect_keyword_cooldown: number; // 默认3章
}

// === 冷却系统 ===

/** v11.0: 智能检测结果 */
export interface SmartDetectionResult {
  /** 套路模式检测结果 */
  patterns: Array<{
    pattern: PatternEntry
    count: number
    matchedTriggers: string[]
    cooldownUntil: number
    alternative: string
    source: 'llm' | 'keyword'
  }>
  /** 情节模板检测结果 */
  templates: Array<{
    template: PlotTemplate
    matchedSignals: string[]
    isOnCooldown: boolean
    remainingCooldown: number
    source: 'llm' | 'keyword'
  }>
  /** 冷却建议 */
  recommendations: CoolingRecommendation[]
  /** 检测摘要 */
  summary: {
    totalDetected: number
    onCooldown: number
    available: number
    llmDetected: number
    keywordDetected: number
    usedLLM: boolean
  }
}

/** v11.0: 冷却建议 */
export interface CoolingRecommendation {
  type: 'pattern' | 'template'
  id: string
  name: string
  category: string
  severity: 'high' | 'medium' | 'low'
  message: string
  suggestion: string
  chaptersLeft: number
  source: 'llm' | 'keyword'
}

export class CoolingSystem {
  private records: Map<string, CoolingRecord> = new Map();
  private config: CoolingConfig;
  private storage: CoolingStorage;
  private currentChapter: number = 0;
  private version: number = 0;
  private llm: LLMProvider | null = null;

  constructor(storage?: CoolingStorage, config?: Partial<CoolingConfig>) {
    this.storage = storage || new MemoryCoolingStorage();
    this.config = {
      template_id_cooldown: { default: 5 },
      template_type_cooldown: { default: 2 },
      opponent_archetype_cooldown: { default: 8 },
      effect_keyword_cooldown: 3,
      ...config,
    };
  }

  /** 注入LLM Provider，启用语义检测 */
  setLLM(provider: LLMProvider | null): void {
    this.llm = provider;
  }

  // ===== 初始化 =====

  async load(currentChapter: number): Promise<void> {
    this.currentChapter = currentChapter;
    try {
      const data = await this.storage.load();
      if (data) {
        this.records = new Map(Object.entries(data.records || {}));
        this.version = (data.version as number) || 0;
      }
    } catch {
      logWarn('Cooling', '冷却状态持久化数据加载失败，已重置');
      this.records = new Map();
    }
  }

  async save(): Promise<void> {
    await this.storage.save({
      version: this.version + 1,
      updated_at: new Date().toISOString(),
      records: Object.fromEntries(this.records),
    });
    this.version++;
  }

  // ===== 冷却检查 =====

  isTemplateOnCooldown(templateId: string): boolean {
    const record = this.records.get(`template_id:${templateId}`);
    if (!record) return false;
    return this.currentChapter < record.cooldown_until;
  }

  isTypeOnCooldown(templateType: string): boolean {
    const record = this.records.get(`template_type:${templateType}`);
    if (!record) return false;
    return this.currentChapter < record.cooldown_until;
  }

  isArchetypeOnCooldown(archetype: string): boolean {
    const record = this.records.get(`opponent_archetype:${archetype}`);
    if (!record) return false;
    return this.currentChapter < record.cooldown_until;
  }

  isEffectOnCooldown(effect: string): boolean {
    const record = this.records.get(`effect_keyword:${effect}`);
    if (!record) return false;
    return this.currentChapter < record.cooldown_until;
  }

  checkAll(templateId: string, templateType: string, archetype?: string, effect?: string): string[] {
    const cooldownItems: string[] = [];
    if (this.isTemplateOnCooldown(templateId)) cooldownItems.push(`模板ID:${templateId}`);
    if (this.isTypeOnCooldown(templateType)) cooldownItems.push(`模板类型:${templateType}`);
    if (archetype && this.isArchetypeOnCooldown(archetype)) cooldownItems.push(`对手原型:${archetype}`);
    if (effect && this.isEffectOnCooldown(effect)) cooldownItems.push(`效果词:${effect}`);
    return cooldownItems;
  }

  // ===== 冷却记录 =====

  recordTemplateUsage(templateId: string, templateType: string): void {
    const chapter = this.currentChapter;
    const idDuration = this.config.template_id_cooldown[templateId] || this.config.template_id_cooldown.default || 5;
    this.records.set(`template_id:${templateId}`, {
      id: `template_id:${templateId}`, type: 'template_id',
      last_used_chapter: chapter, cooldown_duration: idDuration, cooldown_until: chapter + idDuration,
    });
    const typeDuration = this.config.template_type_cooldown[templateType] || this.config.template_type_cooldown.default || 2;
    this.records.set(`template_type:${templateType}`, {
      id: `template_type:${templateType}`, type: 'template_type',
      last_used_chapter: chapter, cooldown_duration: typeDuration, cooldown_until: chapter + typeDuration,
    });
  }

  recordArchetypeUsage(archetype: string): void {
    const chapter = this.currentChapter;
    const duration = this.config.opponent_archetype_cooldown[archetype] || this.config.opponent_archetype_cooldown.default || 8;
    this.records.set(`opponent_archetype:${archetype}`, {
      id: `opponent_archetype:${archetype}`, type: 'opponent_archetype',
      last_used_chapter: chapter, cooldown_duration: duration, cooldown_until: chapter + duration,
    });
  }

  recordEffectUsage(effect: string): void {
    const chapter = this.currentChapter;
    const duration = this.config.effect_keyword_cooldown || 3;
    this.records.set(`effect_keyword:${effect}`, {
      id: `effect_keyword:${effect}`, type: 'effect_keyword',
      last_used_chapter: chapter, cooldown_duration: duration, cooldown_until: chapter + duration,
    });
  }

  // ===== 章节推进 =====

  advanceChapter(chapter: number): void {
    this.currentChapter = chapter;
    const expired: string[] = [];
    for (const [key, record] of Array.from(this.records.entries())) {
      if (chapter >= record.cooldown_until) expired.push(key);
    }
    for (const key of expired) this.records.delete(key);
  }

  // ===== 查询 =====

  getAllRecords(): CoolingRecord[] {
    return Array.from(this.records.values());
  }

  getRecordsByType(type: CoolingRecord['type']): CoolingRecord[] {
    return Array.from(this.records.values()).filter(r => r.type === type);
  }

  getRemainingCooldown(key: string): number {
    const record = this.records.get(key);
    if (!record) return 0;
    return Math.max(0, record.cooldown_until - this.currentChapter);
  }

  getCurrentChapter(): number { return this.currentChapter; }

  reset(): void {
    this.records.clear();
    this.version = 0;
  }

  // ===== 知识库驱动的套路检测（v3.0 新增）=====

  // ===== v4.0: LLM 语义检测 =====

  /**
   * LLM 语义套路检测
   * 把文本和全部套路定义发给 LLM，让它从语义层面判断哪些套路被使用了
   * 能识别关键词匹配检测不到的同义变体和隐式套路
   *
   * @returns 检测到的套路ID列表 + 置信度 + 命中片段；LLM不可用时返回 null
   */
  async detectPatternsAsync(text: string): Promise<Array<{
    patternId: string;
    confidence: number;
    snippet: string;
  }> | null> {
    if (!hasLLM(this.llm)) return null;

    // 截取前 4000 字，避免 token 超限
    const truncated = text.length > 4000 ? text.slice(0, 4000) : text;

    const patternList = COOLING_PATTERNS.map(p =>
      `- ID:${p.id} | ${p.name} | 类别:${getCategoryLabel(p.category)} | 触发词:${p.triggers.join('/')} | 冷却:${p.cooldown}章`
    ).join('\n');

    const messages: LLMChatMessage[] = [
      {
        role: 'system',
        content: `你是网文套路检测专家。请阅读以下章节文本，从语义层面判断是否使用了以下套路模式。
注意：不是关键词匹配，而是语义理解。比如"一拳打过去"和"一拳轰出"是同一个套路；"他深吸了一口气"和"缓缓吐出一口气"也是同一个套路。
只返回确实使用的套路，不确定的不返回。

套路模式列表：
${patternList}

请返回JSON格式：
{"detected": [{"patternId": "套路ID", "confidence": 0.0-1.0, "snippet": "命中的文本片段"}]}
如果没有任何套路被使用，返回 {"detected": []}`,
      },
      {
        role: 'user',
        content: truncated,
      },
    ];

    const result = await llmJson<{ detected: Array<{ patternId: string; confidence: number; snippet: string }> }>(
      this.llm,
      messages,
      { temperature: 0.2, maxTokens: 2048, timeoutMs: 15000 },
    );

    if (!result || !result.detected) return null;

    // 过滤掉置信度太低的
    return result.detected.filter(d => d.confidence >= 0.5);
  }

  /**
   * LLM 语义情节模板检测
   * 判断整章文本是否走了某种情节模板的老路（装逼打脸/拍卖会/比赛等）
   */
  async detectPlotTemplateAsync(text: string): Promise<Array<{
    templateId: string;
    confidence: number;
    matchedSteps: string[];
  }> | null> {
    if (!hasLLM(this.llm)) return null;

    const truncated = text.length > 4000 ? text.slice(0, 4000) : text;

    const templateList = PLOT_TEMPLATES.map(t =>
      `- ID:${t.id} | ${t.name} | 步骤:${t.steps.join('→')} | 冷却:${t.cooldown}章`
    ).join('\n');

    const messages: LLMChatMessage[] = [
      {
        role: 'system',
        content: `你是网文情节结构分析专家。请阅读以下章节文本，判断是否走了以下情节模板的老路。
注意：要从情节走向判断，不是关键词匹配。比如"被嘲讽→展示实力→震惊全场"就是装逼打脸模板，即使没有出现"废物"这个词。

情节模板列表：
${templateList}

请返回JSON格式：
{"detected": [{"templateId": "模板ID", "confidence": 0.0-1.0, "matchedSteps": ["匹配的步骤描述"]}]}
如果没有任何模板被使用，返回 {"detected": []}`,
      },
      {
        role: 'user',
        content: truncated,
      },
    ];

    const result = await llmJson<{ detected: Array<{ templateId: string; confidence: number; matchedSteps: string[] }> }>(
      this.llm,
      messages,
      { temperature: 0.2, maxTokens: 2048, timeoutMs: 15000 },
    );

    if (!result || !result.detected) return null;

    return result.detected.filter(d => d.confidence >= 0.5);
  }

  /**
   * 检测文本中的套路模式并记录冷却（异步版，v4.0）
   * LLM可用时走语义检测，不可用时降级到关键词匹配
   *
   * @param text 章节文本内容
   * @returns 检测到的套路列表（含冷却信息）
   */
  async detectAndRecordPatternsAsync(text: string): Promise<Array<{
    pattern: PatternEntry;
    count: number;
    matchedTriggers: string[];
    cooldownUntil: number;
    alternative: string;
    source: 'llm' | 'keyword';
  }>> {
    // v11.0: LLM语义检测 + 关键词检测并行执行（互不依赖）
    if (hasLLM(this.llm)) {
      const [llmResult, keywordResult] = await Promise.all([
        this.detectPatternsAsync(text),
        Promise.resolve(this.detectAndRecordPatterns(text)),
      ]);

      // 合并：LLM结果为主，关键词结果补充（防止漏检）
      const results: Array<{
        pattern: PatternEntry;
        count: number;
        matchedTriggers: string[];
        cooldownUntil: number;
        alternative: string;
        source: 'llm' | 'keyword';
      }> = [];

      if (llmResult && llmResult.length > 0) {
        for (const det of llmResult) {
          const pattern = getPatternById(det.patternId);
          if (!pattern) continue;

          const key = `pattern:${pattern.id}`;
          const cooldownUntil = this.currentChapter + pattern.cooldown;

          this.records.set(key, {
            id: key,
            type: 'template_id',
            last_used_chapter: this.currentChapter,
            cooldown_duration: pattern.cooldown,
            cooldown_until: cooldownUntil,
          });

          results.push({
            pattern,
            count: 1,
            matchedTriggers: [det.snippet],
            cooldownUntil,
            alternative: pattern.alternative,
            source: 'llm',
          });
        }
      }

      // 关键词结果补充（去重）
      for (const kr of keywordResult) {
        if (!results.find(r => r.pattern.id === kr.pattern.id)) {
          results.push({ ...kr, source: 'keyword' });
        }
      }

      return results;
    }

    // 降级到关键词匹配
    const keywordResults = this.detectAndRecordPatterns(text);
    return keywordResults.map(r => ({ ...r, source: 'keyword' as const }));
  }

  /**
   * 检测情节模板（异步版，v4.0）
   * LLM可用时走语义检测，不可用时降级到信号词匹配
   */
  async detectPlotTemplateAsyncWithFallback(text: string): Promise<Array<{
    template: PlotTemplate;
    matchedSignals: string[];
    isOnCooldown: boolean;
    remainingCooldown: number;
    source: 'llm' | 'keyword';
  }>> {
    // v11.0: LLM语义检测 + 关键词检测并行执行
    if (hasLLM(this.llm)) {
      const [llmResult, keywordResult] = await Promise.all([
        this.detectPlotTemplateAsync(text),
        Promise.resolve(this.detectPlotTemplate(text)),
      ]);

      // 合并：LLM结果为主，关键词结果补充
      const results: Array<{
        template: PlotTemplate;
        matchedSignals: string[];
        isOnCooldown: boolean;
        remainingCooldown: number;
        source: 'llm' | 'keyword';
      }> = [];

      if (llmResult && llmResult.length > 0) {
        for (const det of llmResult) {
          const template = PLOT_TEMPLATES.find(t => t.id === det.templateId);
          if (!template) continue;

          const key = `plot_template:${template.id}`;
          const record = this.records.get(key);
          const isOnCooldown = record ? this.currentChapter < record.cooldown_until : false;

          results.push({
            template,
            matchedSignals: det.matchedSteps,
            isOnCooldown,
            remainingCooldown: isOnCooldown && record ? record.cooldown_until - this.currentChapter : 0,
            source: 'llm',
          });
        }
      }

      // 关键词结果补充（去重）
      for (const kr of keywordResult) {
        if (!results.find(r => r.template.id === kr.template.id)) {
          results.push({ ...kr, source: 'keyword' });
        }
      }

      return results;
    }

    // 降级
    return this.detectPlotTemplate(text).map(r => ({ ...r, source: 'keyword' as const }));
  }

  /**
   * v11.0: 智能检测 — 统一入口
   * LLM可用时走语义检测（主路径），关键词匹配作为补充（防止漏检）
   * LLM不可用时自动降级到关键词匹配
   * 同时检测套路模式和情节模板，并行执行
   *
   * @returns 检测结果 + 冷却建议
   */
  async detectAllSmart(text: string): Promise<SmartDetectionResult> {
    // 并行执行套路检测和情节模板检测
    const [patternResult, templateResult] = await Promise.all([
      this.detectAndRecordPatternsAsync(text),
      this.detectPlotTemplateAsyncWithFallback(text),
    ])

    // 生成冷却建议
    const recommendations = this.generateCoolingRecommendations(patternResult, templateResult)

    // 统计
    const patternCount = patternResult.length
    const templateCount = templateResult.filter(t => !t.isOnCooldown).length
    const onCooldownCount = templateResult.filter(t => t.isOnCooldown).length
    const llmDetected = patternResult.filter(p => p.source === 'llm').length +
      templateResult.filter(t => t.source === 'llm').length
    const keywordDetected = patternResult.filter(p => p.source === 'keyword').length +
      templateResult.filter(t => t.source === 'keyword').length

    return {
      patterns: patternResult,
      templates: templateResult,
      recommendations,
      summary: {
        totalDetected: patternCount + templateCount,
        onCooldown: onCooldownCount,
        available: templateCount,
        llmDetected,
        keywordDetected,
        usedLLM: hasLLM(this.llm),
      },
    }
  }

  /**
   * v11.0: 生成冷却建议
   * 基于检测结果，生成人类可读的冷却建议
   */
  private generateCoolingRecommendations(
    patterns: Array<{
      pattern: PatternEntry
      count: number
      matchedTriggers: string[]
      cooldownUntil: number
      alternative: string
      source: 'llm' | 'keyword'
    }>,
    templates: Array<{
      template: PlotTemplate
      matchedSignals: string[]
      isOnCooldown: boolean
      remainingCooldown: number
      source: 'llm' | 'keyword'
    }>,
  ): CoolingRecommendation[] {
    const recommendations: CoolingRecommendation[] = []

    // 套路模式建议
    for (const p of patterns) {
      const chaptersLeft = p.cooldownUntil - this.currentChapter
      recommendations.push({
        type: 'pattern',
        id: p.pattern.id,
        name: p.pattern.name,
        category: getCategoryLabel(p.pattern.category),
        severity: p.count >= 3 ? 'high' : p.count >= 2 ? 'medium' : 'low',
        message: `检测到套路「${p.pattern.name}」${p.count}次（触发词：${p.matchedTriggers.slice(0, 3).join('、')}）`,
        suggestion: `替换建议：${p.alternative}`,
        chaptersLeft,
        source: p.source,
      })
    }

    // 情节模板建议
    for (const t of templates) {
      if (t.isOnCooldown) {
        recommendations.push({
          type: 'template',
          id: t.template.id,
          name: t.template.name,
          category: '情节模板',
          severity: 'high',
          message: `情节模板「${t.template.name}」仍在冷却中（剩余${t.remainingCooldown}章）`,
          suggestion: `严禁使用！建议尝试其他模板或变化写法`,
          chaptersLeft: t.remainingCooldown,
          source: t.source,
        })
      } else {
        recommendations.push({
          type: 'template',
          id: t.template.id,
          name: t.template.name,
          category: '情节模板',
          severity: 'medium',
          message: `检测到情节模板「${t.template.name}」的影子（${t.matchedSignals.slice(0, 3).join('→')}）`,
          suggestion: `可以考虑但需注意变化。避免完全照搬模板步骤`,
          chaptersLeft: 0,
          source: t.source,
        })
      }
    }

    // 按严重程度排序
    return recommendations.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 }
      return severityOrder[a.severity] - severityOrder[b.severity]
    })
  }

  /**
   * 检测文本中的套路模式并记录冷却
   * 使用知识库的detectPatterns自动识别文本中的套路词/模式
   * 检测到的每个套路都会被记录冷却，后续章节再用同样的套路会被拦截
   *
   * @param text 章节文本内容
   * @returns 检测到的套路列表（含冷却信息）
   */
  detectAndRecordPatterns(text: string): Array<{
    pattern: PatternEntry;
    count: number;
    matchedTriggers: string[];
    cooldownUntil: number;
    alternative: string;
  }> {
    const detected = detectPatterns(text);
    const results: Array<{
      pattern: PatternEntry;
      count: number;
      matchedTriggers: string[];
      cooldownUntil: number;
      alternative: string;
    }> = [];

    for (const det of detected) {
      const key = `pattern:${det.pattern.id}`;
      const cooldownDuration = det.pattern.cooldown;
      const cooldownUntil = this.currentChapter + cooldownDuration;

      // 记录冷却
      this.records.set(key, {
        id: key,
        type: 'template_id',
        last_used_chapter: this.currentChapter,
        cooldown_duration: cooldownDuration,
        cooldown_until: cooldownUntil,
      });

      results.push({
        pattern: det.pattern,
        count: det.count,
        matchedTriggers: det.matchedTriggers,
        cooldownUntil,
        alternative: det.pattern.alternative,
      });
    }

    return results;
  }

  /**
   * 检查文本中的套路是否处于冷却期
   * 返回所有正在冷却中的套路，供生成时避免重复使用
   *
   * @param text 章节文本内容
   * @returns 冷却中的套路列表
   */
  checkTextPatterns(text: string): Array<{
    pattern: PatternEntry;
    matchedTriggers: string[];
    remainingCooldown: number;
    alternative: string;
  }> {
    const detected = detectPatterns(text);
    const onCooldown: Array<{
      pattern: PatternEntry;
      matchedTriggers: string[];
      remainingCooldown: number;
      alternative: string;
    }> = [];

    for (const det of detected) {
      const key = `pattern:${det.pattern.id}`;
      const record = this.records.get(key);
      if (record && this.currentChapter < record.cooldown_until) {
        onCooldown.push({
          pattern: det.pattern,
          matchedTriggers: det.matchedTriggers,
          remainingCooldown: record.cooldown_until - this.currentChapter,
          alternative: det.pattern.alternative,
        });
      }
    }

    return onCooldown;
  }

  /**
   * 获取文本中套路的替代写法建议
   * 生成时调用，返回"不要用X，改用Y"的建议
   */
  getPatternSuggestions(text: string): string[] {
    const onCooldown = this.checkTextPatterns(text);
    const suggestions: string[] = [];

    for (const item of onCooldown) {
      const categoryLabel = getCategoryLabel(item.pattern.category);
      suggestions.push(
        `[${categoryLabel}] "${item.matchedTriggers.join('/')}" 正在冷却（剩${item.remainingCooldown}章），替代写法：${item.alternative}`
      );
    }

    return suggestions;
  }

  /**
   * 检测文本是否匹配情节套路模板
   * 情节模板是更高层级的套路（如装逼打脸、拍卖会等）
   *
   * @param text 章节文本内容
   * @returns 匹配的情节模板列表
   */
  detectPlotTemplate(text: string): Array<{
    template: PlotTemplate;
    matchedSignals: string[];
    isOnCooldown: boolean;
    remainingCooldown: number;
  }> {
    const results: Array<{
      template: PlotTemplate;
      matchedSignals: string[];
      isOnCooldown: boolean;
      remainingCooldown: number;
    }> = [];

    for (const template of PLOT_TEMPLATES) {
      const matchedSignals = template.signals.filter(s => text.includes(s));

      if (matchedSignals.length >= Math.ceil(template.signals.length * 0.5)) {
        const key = `plot_template:${template.id}`;
        const record = this.records.get(key);
        const isOnCooldown = record ? this.currentChapter < record.cooldown_until : false;

        results.push({
          template,
          matchedSignals,
          isOnCooldown,
          remainingCooldown: isOnCooldown && record ? record.cooldown_until - this.currentChapter : 0,
        });
      }
    }

    return results;
  }

  /**
   * 记录情节模板使用
   */
  recordPlotTemplate(templateId: string): void {
    const template = PLOT_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    const key = `plot_template:${templateId}`;
    this.records.set(key, {
      id: key,
      type: 'template_id',
      last_used_chapter: this.currentChapter,
      cooldown_duration: template.cooldown,
      cooldown_until: this.currentChapter + template.cooldown,
    });
  }

  /**
   * 获取某类套路的冷却状态摘要
   * 返回各类套路的活跃冷却数量
   */
  getCategoryCooldownStatus(): Array<{ category: PatternCategory; label: string; activeCount: number }> {
    const categories: PatternCategory[] = ['opening', 'battle', 'face_slap', 'emotion', 'transition', 'opponent', 'effect'];
    const status: Array<{ category: PatternCategory; label: string; activeCount: number }> = [];

    for (const cat of categories) {
      const label = getCategoryLabel(cat);
      // 统计该类别下正在冷却的套路数
      let activeCount = 0;
      for (const [key, record] of Array.from(this.records.entries())) {
        if (key.startsWith('pattern:') && this.currentChapter < record.cooldown_until) {
          // 需要检查该pattern是否属于此category
          // 从key中提取pattern id
          const patternId = key.replace('pattern:', '')
          const pattern = getPatternById(patternId);
          if (pattern && pattern.category === cat) {
            activeCount++;
          }
        }
      }
      status.push({ category: cat, label, activeCount });
    }

    return status;
  }
}