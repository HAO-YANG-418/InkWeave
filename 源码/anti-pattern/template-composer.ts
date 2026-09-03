// anti-pattern/template-composer.ts
// P3 补齐：模板组合推荐与冷却（反模式模块）。
// 当前为安全降级实现：维护 combo 历史与冷却状态，推荐返回默认组合，不调用 LLM。
// 真实组合推荐（基于章节类型+冲突多样性）属软件化阶段。
import type { LLMProvider } from '../types';

export interface TemplateCombo {
  id: string;
  name?: string;
  description?: string;
}

export interface TemplateComposerResult {
  combo: TemplateCombo;
  warnings?: string[];
}

export interface RecommendComboParams {
  chapterType: string;
  conflictType: string;
  chapterIntent: string;
  genre: string;
  prefixContent: string;
  recentComboIds: string[];
  recommendedChapterType?: string;
  recommendedConflictType?: string;
  diversityWarnings?: string;
}

export interface CooldownEntry {
  comboId: string;
  onCooldown: boolean;
  chaptersLeft: number;
}

export class TemplateComposer {
  private comboHistory: string[] = [];
  private cooldownMap: Map<string, number> = new Map();

  constructor() {}

  setComboHistory(recentComboIds: string[]): void {
    this.comboHistory = [...recentComboIds];
  }

  async recommendCombo(
    _params: RecommendComboParams,
    _provider?: LLMProvider,
  ): Promise<TemplateComposerResult> {
    const id = `combo_${this.comboHistory.length + 1}`;
    return {
      combo: { id, name: '默认组合（P3 降级）', description: '安全降级实现，非真推荐' },
      warnings: [],
    };
  }

  recordCombo(comboId: string): void {
    this.comboHistory.push(comboId);
    this.cooldownMap.set(comboId, 3);
  }

  getComboHistory(): string[] {
    return [...this.comboHistory];
  }

  getCooldownStatus(): CooldownEntry[] {
    return Array.from(this.cooldownMap.entries()).map(([comboId, chaptersLeft]) => ({
      comboId,
      onCooldown: chaptersLeft > 0,
      chaptersLeft,
    }));
  }
}
