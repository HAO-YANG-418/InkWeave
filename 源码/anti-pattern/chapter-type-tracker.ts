// anti-pattern/chapter-type-tracker.ts
// P3 补齐：章功能类型追踪（反模式模块）。
// 当前为安全降级实现：浅层启发式分类 + 维护类型分布历史，不调用 LLM。
// 真实分类（基于意图策略）属软件化阶段。
import type { LLMProvider } from '../types';

export type ChapterType =
  | 'action'
  | 'dialogue'
  | 'reveal'
  | 'transition'
  | 'emotion'
  | 'summary'
  | 'unknown';

export type DetectedBy = 'rule' | 'llm';

export interface ChapterTypeWarning {
  message: string;
}

export interface ChapterTypeTrackResult {
  type: ChapterType;
  warnings: ChapterTypeWarning[];
  confidence: number;
  detectedBy: DetectedBy;
  recommendedNext: ChapterType[];
}

const ACTION_CHARS = /[冲跑跳打杀扑撞掀砸踢飞落崩炸]/u;

export class ChapterTypeTracker {
  private history: ChapterType[] = [];

  constructor() {}

  async detectChapterType(
    content: string,
    _chapterNumber: number,
    _title: string,
    _provider?: LLMProvider,
  ): Promise<ChapterTypeTrackResult> {
    let type: ChapterType = 'unknown';
    const dialogueRatio =
      (content.match(/["“]/g) || []).length / Math.max(1, content.length / 100);
    if (dialogueRatio > 0.5) type = 'dialogue';
    else if (ACTION_CHARS.test(content.slice(0, 200))) type = 'action';
    else if (content.length < 300) type = 'transition';
    else type = 'reveal';

    this.history.push(type);
    return {
      type,
      warnings: [],
      confidence: 0.5,
      detectedBy: 'rule',
      recommendedNext: ['dialogue', 'action', 'reveal'],
    };
  }

  getTypeDistribution(): Record<string, number> {
    const dist: Record<string, number> = {};
    for (const t of this.history) dist[t] = (dist[t] || 0) + 1;
    return dist;
  }
}
