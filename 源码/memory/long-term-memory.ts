// ============================================================
// LongTermMemory 跨书长期记忆 — GWE v6.0 记忆进化层
// 核心能力：跨书积累写作知识，语义搜索历史模式
// 书A中学到的伏笔技法可以迁移到书B
// v6.4: LLM语义搜索（检索+重排序）
// v11.0: 语义嵌入向量 — 从Jaccard字符级升级为10维语义向量
//   嵌入维度：战斗/情感/对话/世界观/修炼/悬念/转折/日常/冲突/揭示
//   搜索路径：嵌入向量余弦相似度(主) → LLM重排序(精排)
// ============================================================

import {
  type MemoryEntry,
  type MemoryType,
  type MemorySearchResult,
  type LongTermMemoryConfig,
  type MemoryStats,
  DEFAULT_MEMORY_CONFIG,
} from './types'
import type { LLMProvider } from '../types'
import { llmJson, hasLLM } from '../llm-helper'
import { DEFAULT_LLM_CONFIG } from '../llm-config'
import {
  MEMORY_EXTRACTION_RULES,
  FORGETTING_RULES,
  detectExtractableMemories,
  getRuleByType,
  getForeshadowPayoffSuggestion,
  type MemoryExtractionRule,
} from '../knowledge/memory-schema'

// ============================================================
// v11.0: 语义嵌入向量 — 10维语义空间
// ============================================================

/** 语义嵌入维度定义 */
const SEMANTIC_DIMENSIONS = [
  { key: 'combat', label: '战斗/动作', description: '战斗场景、动作描写、力量对抗、招式施展' },
  { key: 'emotional', label: '情感/心理', description: '情感表达、内心独白、心理变化、情绪波动' },
  { key: 'dialogue', label: '对话/互动', description: '角色对话、语言交锋、信息交流、关系互动' },
  { key: 'world_building', label: '世界观/设定', description: '世界观揭示、设定讲解、规则说明、历史背景' },
  { key: 'cultivation', label: '修炼/成长', description: '修炼突破、能力提升、领悟觉醒、成长蜕变' },
  { key: 'suspense', label: '悬念/伏笔', description: '悬念设置、伏笔埋设、谜题铺垫、未知探索' },
  { key: 'twist', label: '转折/反转', description: '情节转折、意外反转、真相揭示、认知颠覆' },
  { key: 'daily', label: '日常/过渡', description: '日常描写、场景过渡、氛围营造、生活细节' },
  { key: 'conflict', label: '冲突/对抗', description: '人际冲突、利益对抗、价值观碰撞、势力博弈' },
  { key: 'revelation', label: '揭示/发现', description: '秘密揭示、真相发现、信息揭露、认知突破' },
] as const

const EMBEDDING_DIM = SEMANTIC_DIMENSIONS.length // 10维

/** 简易余弦相似度（不依赖外部库） */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom > 0 ? dot / denom : 0
}

/** 简易文本相似度（字符级Jaccard — 降级方案） */
function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  const aWords = new Set(a.slice(0, 200).split(''))
  const bWords = new Set(b.slice(0, 200).split(''))
  const intersection = [...aWords].filter(w => bWords.has(w)).length
  const union = new Set([...aWords, ...bWords]).size
  return union > 0 ? intersection / union : 0
}

// ============================================================
// LongTermMemory 主类
// ============================================================

export class LongTermMemory {
  private config: LongTermMemoryConfig
  private entries: Map<string, MemoryEntry> = new Map()
  private entryCounter = 0
  private llm: LLMProvider | null

  constructor(config?: Partial<LongTermMemoryConfig>, llm?: LLMProvider | null) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config }
    this.llm = llm ?? null
  }

  /**
   * 注入LLM Provider
   */
  setLLM(llm: LLMProvider | null): void {
    this.llm = llm
  }

  /**
   * 存储一条记忆（同步，不生成嵌入）
   */
  store(entry: Omit<MemoryEntry, 'id' | 'accessCount' | 'lastAccessedAt'>): MemoryEntry {
    const id = `mem_${++this.entryCounter}_${Date.now()}`
    const fullEntry: MemoryEntry = {
      ...entry,
      id,
      accessCount: 0,
      lastAccessedAt: Date.now(),
      createdAt: entry.createdAt || Date.now(),
    }

    this.entries.set(id, fullEntry)

    // 检查是否需要清理
    if (this.entries.size > this.config.maxEntries) {
      this.forget()
    }

    return fullEntry
  }

  /**
   * v11.0: 存储记忆并生成语义嵌入（异步）
   * 使用LLM生成10维语义嵌入向量，用于后续语义搜索
   * 无LLM时降级为store()（不生成嵌入，搜索时回退到Jaccard）
   */
  async storeAsync(entry: Omit<MemoryEntry, 'id' | 'accessCount' | 'lastAccessedAt'>): Promise<MemoryEntry> {
    const fullEntry = this.store(entry)

    // 尝试生成语义嵌入
    if (hasLLM(this.llm)) {
      const embedding = await this.generateSemanticEmbedding(fullEntry.content)
      if (embedding) {
        fullEntry.embedding = embedding
      }
    }

    return fullEntry
  }

  /**
   * v11.0: 批量生成语义嵌入（异步）
   * 为没有嵌入的已有记忆批量生成嵌入向量
   * 用于数据迁移：从旧版Jaccard搜索升级到语义搜索
   */
  async batchGenerateEmbeddings(limit = 50): Promise<{ generated: number; skipped: number; failed: number }> {
    if (!hasLLM(this.llm)) {
      return { generated: 0, skipped: 0, failed: 0 }
    }

    const entriesWithoutEmbedding = [...this.entries.values()]
      .filter(e => !e.embedding || e.embedding.length === 0)
      .slice(0, limit)

    let generated = 0
    let failed = 0

    // 串行生成（避免LLM并发压力）
    for (const entry of entriesWithoutEmbedding) {
      const embedding = await this.generateSemanticEmbedding(entry.content)
      if (embedding) {
        entry.embedding = embedding
        generated++
      } else {
        failed++
      }
    }

    return {
      generated,
      skipped: 0,
      failed,
    }
  }

  /**
   * 语义搜索记忆（同步）
   * 优先使用嵌入向量余弦相似度，回退到文本Jaccard相似度
   * 注意：同步方法无法生成查询嵌入，仅使用已有存储嵌入
   */
  search(query: string, topK?: number, typeFilter?: MemoryType[]): MemorySearchResult[] {
    const k = topK || this.config.defaultTopK
    const results: MemorySearchResult[] = []

    // 检查是否有嵌入向量可用
    const hasEmbeddings = [...this.entries.values()].some(e => e.embedding && e.embedding.length > 0)

    for (const entry of this.entries.values()) {
      // 类型过滤
      if (typeFilter && typeFilter.length > 0 && !typeFilter.includes(entry.type)) {
        continue
      }

      let similarity: number

      // v11.0: 优先使用语义嵌入向量（10维余弦相似度）
      if (hasEmbeddings && entry.embedding && entry.embedding.length > 0) {
        // 对查询词做简易嵌入（字符级向量）作为查询嵌入
        const queryEmbedding = this.simpleEmbed(query, entry.embedding.length)
        similarity = cosineSimilarity(queryEmbedding, entry.embedding)
      } else {
        // 回退到文本Jaccard相似度
        similarity = textSimilarity(query, entry.content)
      }

      // 重要性加权
      similarity *= (0.5 + 0.5 * entry.importance)

      if (similarity > 0.05) {
        results.push({ entry, similarity })
      }
    }

    // 排序并截取
    results.sort((a, b) => b.similarity - a.similarity)

    // 更新访问计数
    for (const r of results.slice(0, k)) {
      r.entry.accessCount++
      r.entry.lastAccessedAt = Date.now()
    }

    return results.slice(0, k)
  }

  /**
   * LLM语义搜索（异步）— v11.0升级版
   * 三阶段搜索管道：
   *   阶段1: 生成查询嵌入向量(LLM) → 余弦相似度召回 top-N 候选
   *   阶段2: 粗筛（标签匹配 + 文本相似度补充）
   *   阶段3: LLM语义重排序（精排 top-15）
   * 无LLM时降级到search()（Jaccard + 低级嵌入）
   */
  async searchAsync(query: string, topK?: number, typeFilter?: MemoryType[]): Promise<MemorySearchResult[]> {
    const k = topK || this.config.defaultTopK

    if (this.entries.size === 0) {
      return []
    }

    // 无LLM → 降级到同步搜索
    if (!hasLLM(this.llm)) {
      return this.search(query, k, typeFilter)
    }

    // === 阶段1: 语义嵌入向量召回 ===
    // 生成查询的语义嵌入向量
    const queryEmbedding = await this.generateSemanticEmbedding(query)
    const hasStoredEmbeddings = [...this.entries.values()].some(e => e.embedding && e.embedding.length > 0)

    const candidates: Array<{ entry: MemoryEntry; baseScore: number }> = []

    if (queryEmbedding && hasStoredEmbeddings) {
      // 主路径：嵌入向量余弦相似度
      for (const entry of this.entries.values()) {
        if (typeFilter && typeFilter.length > 0 && !typeFilter.includes(entry.type)) continue

        let score = 0

        if (entry.embedding && entry.embedding.length > 0) {
          // 语义嵌入余弦相似度（权重70%）
          score = cosineSimilarity(queryEmbedding, entry.embedding) * 0.7
        }

        // 标签匹配加分（权重15%）
        const queryChars = new Set(query.split(''))
        const tagMatch = entry.tags.filter(t => [...t].some(c => queryChars.has(c))).length
        score += tagMatch * 0.05

        // 文本相似度补充（权重15%）
        score += textSimilarity(query, entry.content) * 0.15

        // 重要性加权
        score *= (0.5 + 0.5 * entry.importance)

        if (score > 0.02) {
          candidates.push({ entry, baseScore: score })
        }
      }
    } else {
      // 降级路径：无嵌入向量时使用文本相似度粗筛
      for (const entry of this.entries.values()) {
        if (typeFilter && typeFilter.length > 0 && !typeFilter.includes(entry.type)) continue

        let baseScore = textSimilarity(query, entry.content)

        const queryChars = new Set(query.split(''))
        const tagMatch = entry.tags.filter(t => [...t].some(c => queryChars.has(c))).length
        baseScore += tagMatch * 0.15

        baseScore *= (0.5 + 0.5 * entry.importance)

        if (baseScore > 0.02) {
          candidates.push({ entry, baseScore })
        }
      }
    }

    // === 阶段2: 粗筛取 top 15 进入LLM精排 ===
    candidates.sort((a, b) => b.baseScore - a.baseScore)
    const rerankCandidates = candidates.slice(0, 15)

    if (rerankCandidates.length === 0) {
      return []
    }

    // === 阶段3: LLM语义重排序 ===
    const reranked = await this.llmRerank(query, rerankCandidates)
    if (!reranked) {
      // LLM失败，回退到粗筛结果
      return rerankCandidates.slice(0, k).map(c => ({ entry: c.entry, similarity: c.baseScore }))
    }

    // 合并LLM分数和基础分数（LLM权重70%，基础分数30%）
    const results: MemorySearchResult[] = rerankCandidates.map((c: { entry: MemoryEntry; baseScore: number }, i: number) => {
      const llmScore = reranked.scores[i] ?? 0
      const combined = llmScore * 0.7 + c.baseScore * 0.3
      return { entry: c.entry, similarity: combined }
    })

    results.sort((a, b) => b.similarity - a.similarity)

    // 更新访问计数
    for (const r of results.slice(0, k)) {
      r.entry.accessCount++
      r.entry.lastAccessedAt = Date.now()
    }

    return results.slice(0, k)
  }

  /**
   * 按ID获取记忆
   */
  get(id: string): MemoryEntry | undefined {
    const entry = this.entries.get(id)
    if (entry) {
      entry.accessCount++
      entry.lastAccessedAt = Date.now()
    }
    return entry
  }

  /**
   * 按类型获取记忆
   */
  getByType(type: MemoryType, limit = 50): MemoryEntry[] {
    return [...this.entries.values()]
      .filter(e => e.type === type)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit)
  }

  /**
   * 按标签获取记忆
   */
  getByTag(tag: string, limit = 50): MemoryEntry[] {
    return [...this.entries.values()]
      .filter(e => e.tags.includes(tag))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit)
  }

  /**
   * 按书获取记忆
   */
  getByBook(bookId: string, limit = 50): MemoryEntry[] {
    return [...this.entries.values()]
      .filter(e => e.sourceBookId === bookId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
  }

  /**
   * 遗忘低价值记忆
   */
  forget(threshold?: number): number {
    const thresh = threshold || this.config.forgetThreshold
    let removed = 0

    // 按重要性 + 最近访问时间排序
    const entries = [...this.entries.values()]
      .sort((a, b) => {
        const scoreA = a.importance * 0.7 + Math.min(a.accessCount / 100, 1) * 0.3
        const scoreB = b.importance * 0.7 + Math.min(b.accessCount / 100, 1) * 0.3
        return scoreA - scoreB
      })

    // 删除低于阈值的条目
    const now = Date.now()
    for (const entry of entries) {
      if (this.entries.size <= this.config.maxEntries * 0.8) break

      const score = entry.importance * 0.7 + Math.min(entry.accessCount / 100, 1) * 0.3
      // 30天未访问的降低评分
      const daysSinceAccess = (now - entry.lastAccessedAt) / (24 * 3600 * 1000)
      const adjustedScore = score * Math.max(0.3, 1 - daysSinceAccess / 60)

      if (adjustedScore < thresh) {
        this.entries.delete(entry.id)
        removed++
      }
    }

    return removed
  }

  /**
   * 记忆巩固：合并相似记忆，更新重要性
   * v13.3: 标签分桶优化 — 按类型分桶 + 标签交集预过滤，避免 O(n²) 全文比较
   */
  consolidate(): { merged: number; updated: number } {
    let merged = 0
    let updated = 0

    const entries = [...this.entries.values()]
    const toRemove = new Set<string>()

    // v13.3: 按类型分桶，只比较同类型条目
    const typeBuckets = new Map<string, MemoryEntry[]>()
    for (const entry of entries) {
      const bucket = typeBuckets.get(entry.type) || []
      bucket.push(entry)
      typeBuckets.set(entry.type, bucket)
    }

    // 在每个桶内，用标签交集做预过滤，避免 O(n²) 的全文比较
    for (const bucket of typeBuckets.values()) {
      if (bucket.length < 2) continue

      for (let i = 0; i < bucket.length; i++) {
        if (toRemove.has(bucket[i].id)) continue
        const tagsA = new Set(bucket[i].tags)

        for (let j = i + 1; j < bucket.length; j++) {
          if (toRemove.has(bucket[j].id)) continue

          // 标签预过滤：至少共享一个标签才计算相似度
          const hasSharedTag = bucket[j].tags.some(t => tagsA.has(t))
          if (!hasSharedTag) continue

          const sim = textSimilarity(bucket[i].content, bucket[j].content)
          if (sim > 0.7) {
            const newer = bucket[i].createdAt > bucket[j].createdAt ? bucket[i] : bucket[j]
            const older = bucket[i].createdAt > bucket[j].createdAt ? bucket[j] : bucket[i]

            newer.importance = Math.min(1, newer.importance + older.importance * 0.3)
            newer.tags = [...new Set([...newer.tags, ...older.tags])]
            toRemove.add(older.id)
            merged++
          }
        }
      }
    }

    for (const id of toRemove) {
      this.entries.delete(id)
    }

    // 更新长时间未访问记忆的重要性
    const now = Date.now()
    for (const entry of this.entries.values()) {
      const daysSinceAccess = (now - entry.lastAccessedAt) / (24 * 3600 * 1000)
      if (daysSinceAccess > 30) {
        entry.importance = Math.max(0.05, entry.importance * (1 - (daysSinceAccess - 30) / 300))
        updated++
      }
    }

    return { merged, updated }
  }

  /**
   * 获取记忆统计
   */
  getStats(): MemoryStats {
    const byType: Record<string, number> = {}
    let totalImportance = 0
    let totalAccesses = 0
    let oldest = Infinity
    let newest = 0

    for (const entry of this.entries.values()) {
      byType[entry.type] = (byType[entry.type] || 0) + 1
      totalImportance += entry.importance
      totalAccesses += entry.accessCount
      if (entry.createdAt < oldest) oldest = entry.createdAt
      if (entry.createdAt > newest) newest = entry.createdAt
    }

    return {
      totalEntries: this.entries.size,
      byType: byType as Record<MemoryType, number>,
      avgImportance: this.entries.size > 0 ? totalImportance / this.entries.size : 0,
      totalAccesses,
      oldestEntry: oldest === Infinity ? 0 : oldest,
      newestEntry: newest,
    }
  }

  /**
   * 批量导入记忆
   */
  importEntries(entries: Omit<MemoryEntry, 'id' | 'accessCount' | 'lastAccessedAt'>[]): MemoryEntry[] {
    return entries.map(e => this.store(e))
  }

  /**
   * 导出所有记忆
   */
  exportEntries(): MemoryEntry[] {
    return [...this.entries.values()]
  }

  /**
   * 清空所有记忆
   */
  clear(): void {
    this.entries.clear()
    this.entryCounter = 0
  }

  /**
   * 获取记忆总数
   */
  get size(): number {
    return this.entries.size
  }

  // ============================================================
  // 知识库驱动的记忆管理（v6.5 新增）
  // ============================================================

  /**
   * 从章节内容中自动提取记忆
   * 使用知识库的detectExtractableMemories识别值得记忆的内容
   * 自动填充重要性、标签、保留策略
   *
   * @param content 章节文本内容
   * @param chapterNumber 章节号
   * @param bookId 书籍ID
   * @returns 提取并存储的记忆条目列表
   */
  extractFromContent(
    content: string,
    chapterNumber: number,
    bookId: string,
  ): MemoryEntry[] {
    // 用知识库检测可提取的记忆
    const detected = detectExtractableMemories(content, chapterNumber);
    const stored: MemoryEntry[] = [];

    for (const det of detected) {
      const rule = getRuleByType(det.type);
      if (!rule) continue;

      // 从内容中提取触发关键词附近的文本作为记忆内容
      const triggerKeywords = det.trigger.match(/[\u4e00-\u9fa5]{2,}/g) || [];
      let snippet = '';
      for (const kw of triggerKeywords) {
        const idx = content.indexOf(kw);
        if (idx >= 0) {
          // 提取关键词前后50字的上下文
          const start = Math.max(0, idx - 30);
          const end = Math.min(content.length, idx + kw.length + 50);
          snippet = content.slice(start, end).replace(/\n/g, ' ');
          break;
        }
      }

      if (!snippet) {
        snippet = det.trigger;
      }

      const entry = this.store({
        type: det.type,
        content: `${rule.name}：${snippet}（第${chapterNumber}章）`,
        importance: det.suggestedImportance,
        sourceBookId: bookId,
        sourceChapter: chapterNumber,
        tags: rule.tags,
        createdAt: Date.now(),
      });

      stored.push(entry);
    }

    return stored;
  }

  /**
   * 检查伏笔状态
   * 使用知识库的FORESHADOW_LIFECYCLE规则判断伏笔是否需要回收
   *
   * @param currentChapter 当前章节号
   * @returns 伏笔状态报告
   */
  checkForeshadowStatus(currentChapter: number): Array<{
    entry: MemoryEntry;
    urgency: 'normal' | 'warning' | 'overdue';
    message: string;
    shouldPayoff: boolean;
  }> {
    const foreshadows = this.getByType('foreshadow_pattern' as MemoryType);
    const results: Array<{
      entry: MemoryEntry;
      urgency: 'normal' | 'warning' | 'overdue';
      message: string;
      shouldPayoff: boolean;
    }> = [];

    for (const fs of foreshadows) {
      const plantedChapter = fs.sourceChapter || 0;
      const suggestion = getForeshadowPayoffSuggestion(
        plantedChapter,
        currentChapter,
        fs.importance,
      );
      results.push({
        entry: fs,
        urgency: suggestion.urgency,
        message: suggestion.message,
        shouldPayoff: suggestion.shouldPayoff,
      });
    }

    return results;
  }

  /**
   * 获取记忆提取规则参考
   * 供外部模块了解什么类型的内容会被自动提取
   */
  getExtractionRules(): MemoryExtractionRule[] {
    return MEMORY_EXTRACTION_RULES;
  }

  /**
   * 获取某类记忆的检索场景建议
   * 写作时根据当前场景查询应该检索哪些类型的记忆
   *
   * @param scenario 当前写作场景描述
   * @returns 建议检索的记忆类型列表
   */
  getRetrievalSuggestions(scenario: string): Array<{
    type: MemoryType;
    reason: string;
  }> {
    const suggestions: Array<{ type: MemoryType; reason: string }> = [];

    for (const rule of MEMORY_EXTRACTION_RULES) {
      for (const retrievalScenario of rule.retrievalScenarios) {
        // 简单关键词匹配
        const keywords = retrievalScenario.match(/[\u4e00-\u9fa5]{2,}/g) || [];
        const matched = keywords.some(kw => scenario.includes(kw));
        if (matched) {
          suggestions.push({
            type: rule.type,
            reason: retrievalScenario,
          });
          break;
        }
      }
    }

    return suggestions;
  }

  /**
   * 基于保留策略的智能遗忘（增强版）
   * 使用知识库的FORGETTING_RULES，不同保留策略有不同的遗忘权重
   */
  smartForget(): { removed: number; byRetention: Record<string, number> } {
    const byRetention: Record<string, number> = {};
    let removed = 0;

    // 获取每条记忆的保留策略
    const entriesWithRules = [...this.entries.values()].map(entry => {
      const rule = getRuleByType(entry.type);
      const retention = rule?.retention || 'medium_term';
      const forgettingRule = FORGETTING_RULES.find(r => r.retention === retention) ||
        FORGETTING_RULES.find(r => r.retention === 'medium_term')!;
      return { entry, forgettingRule, retention };
    });

    // 计算每条记忆的保留分数
    const now = Date.now();
    const scored = entriesWithRules.map(({ entry, forgettingRule, retention }) => {
      const daysSinceAccess = (now - entry.lastAccessedAt) / (24 * 3600 * 1000);

      // 永久记忆不遗忘
      if (forgettingRule.retention === 'permanent') {
        return { entry, score: 1, retention };
      }

      const importanceScore = entry.importance * forgettingRule.importanceWeight;
      const accessScore = Math.min(entry.accessCount / 100, 1) * forgettingRule.accessWeight;
      const timeDecay = Math.max(0, 1 - daysSinceAccess / forgettingRule.baseDays) * forgettingRule.timeDecayWeight;
      const score = importanceScore + accessScore + timeDecay;

      return { entry, score, retention, threshold: forgettingRule?.forgetThreshold ?? 0.3 };
    });

    // 按分数排序，从最低分开始删除
    scored.sort((a, b) => a.score - b.score);

    for (const item of scored) {
      if (this.entries.size <= this.config.maxEntries * 0.8) break;

      if (item.threshold !== undefined && item.score < item.threshold) {
        this.entries.delete(item.entry.id);
        removed++;
        byRetention[item.retention] = (byRetention[item.retention] || 0) + 1;
      }
    }

    return { removed, byRetention };
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * v11.0: 使用LLM生成语义嵌入向量
   * 将文本映射到10维语义空间：战斗/情感/对话/世界观/修炼/悬念/转折/日常/冲突/揭示
   * 每个维度0-1分，形成10维语义指纹
   * 无LLM时返回null，调用方降级到文本相似度
   */
  private async generateSemanticEmbedding(text: string): Promise<number[] | null> {
    if (!hasLLM(this.llm)) return null

    const dimensionsDesc = SEMANTIC_DIMENSIONS
      .map((d, i) => `${i + 1}. ${d.label}（${d.key}）：${d.description}`)
      .join('\n')

    const systemPrompt = `你是文本语义分析专家。请将给定文本映射到10维语义空间，给出每个维度的强度评分（0-1的浮点数，保留2位小数）。

评分标准：
- 0.0-0.2：该维度几乎不涉及
- 0.3-0.5：该维度有一定涉及
- 0.6-0.8：该维度是重要组成部分
- 0.9-1.0：该维度是核心主题

语义维度定义：
${dimensionsDesc}

注意：
- 要理解文本的深层语义，不要只看表面关键词
- 同一段文本可能同时在多个维度有高分
- "他看着眼前的剑，回想起师父的教导" → cultivation:0.6, emotional:0.7, combat:0.3
- 战斗场景通常伴随情感波动，不要只给combat高分
- 日常对话中如果包含世界观信息，world_building也应有分

必须严格返回JSON，格式：{"embedding": [0.85, 0.30, 0.65, ...]}，数组长度必须为10。`

    const userPrompt = `文本内容（截取前${DEFAULT_LLM_CONFIG.memorySummary.maxTokens * 3}字）：
${text.slice(0, DEFAULT_LLM_CONFIG.memorySummary.maxTokens * 3)}

请给出10维语义嵌入向量。`

    const result = await llmJson<{ embedding: number[] }>(this.llm, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: DEFAULT_LLM_CONFIG.memorySummary.temperature, maxTokens: DEFAULT_LLM_CONFIG.memorySummary.maxTokens })

    if (!result || !result.embedding || result.embedding.length !== EMBEDDING_DIM) {
      return null
    }

    // 确保分数在0-1范围内，归一化
    const embedding = result.embedding.map(v => Math.max(0, Math.min(1, v)))

    // L2归一化（使余弦相似度计算更准确）
    const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0))
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm
      }
    }

    return embedding
  }

  /**
   * 简易嵌入向量生成（字符级词袋 — 降级方案）
   * 仅在没有LLM嵌入时使用，用于同步search()的查询嵌入
   */
  private simpleEmbed(text: string, dim: number): number[] {
    const embedding = new Array(dim).fill(0)
    const chars = text.slice(0, 500).split('')

    for (let i = 0; i < chars.length; i++) {
      const code = chars[i].charCodeAt(0)
      const idx = (code * 31 + i) % dim
      embedding[idx] += 1
    }

    // 归一化
    const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0))
    if (norm > 0) {
      for (let i = 0; i < dim; i++) {
        embedding[i] /= norm
      }
    }

    return embedding
  }

  /**
   * LLM语义重排序
   * 让LLM判断每条记忆与查询的语义相关度（0-1）
   */
  private async llmRerank(
    query: string,
    candidates: Array<{ entry: MemoryEntry; baseScore: number }>
  ): Promise<{ scores: number[] } | null> {
    const itemsText = candidates.map((c, i) =>
      `${i + 1}. [${c.entry.type}] ${c.entry.content}${c.entry.tags.length > 0 ? '（标签：' + c.entry.tags.join('、') + '）' : ''}`
    ).join('\n')

    const systemPrompt = `你是一个语义相关性判断专家。给定一个查询词和若干条记忆条目，请判断每条记忆与查询词的语义相关程度。

相关度评分标准：
- 1.0：直接相关，记忆内容明确包含查询词所指的概念/实体/事件
- 0.7-0.9：高度相关，记忆内容与查询词有密切语义联系
- 0.4-0.6：中度相关，有间接关联或同属一个主题
- 0.1-0.3：弱相关，仅有表面字符重叠
- 0.0：完全不相关

注意：
- 要理解语义，不能只看字符是否匹配
- "影子"和"黑影""阴影""投影"是相关的
- "壁"和"壁面""壁温""壁里""裂缝"是相关的
- "父亲"和"父""爸""老爹""林父"是相关的
- 同义词、上下位词、场景关联都算相关

必须严格返回JSON，格式：{"scores": [0.9, 0.3, 0.7, ...]}，scores数组长度必须等于条目数量。`

    const userPrompt = `查询词："${query}"

记忆条目：
${itemsText}

请为每条记忆给出0-1的语义相关度分数，返回JSON。`

    const result = await llmJson<{ scores: number[] }>(this.llm, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: DEFAULT_LLM_CONFIG.memoryCompress.temperature, maxTokens: DEFAULT_LLM_CONFIG.memoryCompress.maxTokens })

    if (!result || !result.scores || result.scores.length !== candidates.length) {
      return null
    }

    // 确保分数在0-1范围内
    result.scores = result.scores.map(s => Math.max(0, Math.min(1, s)))
    return result
  }
}