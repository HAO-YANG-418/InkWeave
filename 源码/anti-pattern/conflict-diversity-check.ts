// anti-pattern/conflict-diversity-check.ts
// P3 补齐：冲突多样性检测（反模式模块）。
// 当前为安全降级实现：不调用 LLM，返回中性结果与分布维护。
// 真实冲突识别（基于读者模型反馈）属软件化阶段。
import type { LLMProvider } from '../types';

export type DetectedBy = 'rule' | 'llm';

export interface ConflictDiversityWarning {
  message: string;
}

export interface ConflictDiversityResult {
  warnings: ConflictDiversityWarning[];
  primaryConflict: string;
  secondaryConflicts: string[];
  resolution: string;
  confidence: number;
  detectedBy: DetectedBy;
  recommendedConflictTypes: string[];
}

export class ConflictDiversityCheck {
  private conflicts: string[] = [];
  private resolutions: string[] = [];

  constructor() {}

  async analyzeConflict(
    _content: string,
    _chapterNumber: number,
    _provider?: LLMProvider,
  ): Promise<ConflictDiversityResult> {
    return {
      warnings: [],
      primaryConflict: 'unknown',
      secondaryConflicts: [],
      resolution: 'unknown',
      confidence: 0.4,
      detectedBy: 'rule',
      recommendedConflictTypes: ['internal', 'external', 'interpersonal'],
    };
  }

  getConflictDistribution(): Record<string, number> {
    const d: Record<string, number> = {};
    for (const c of this.conflicts) d[c] = (d[c] || 0) + 1;
    return d;
  }

  getResolutionDistribution(): Record<string, number> {
    const d: Record<string, number> = {};
    for (const r of this.resolutions) d[r] = (d[r] || 0) + 1;
    return d;
  }
}
