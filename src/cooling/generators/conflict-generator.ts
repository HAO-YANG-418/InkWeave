// ============================================================
// 冲突生成器 (Conflict Generator) — v2.1
// 职责：根据模板+上下文+词库，生成冲突事件
// 来源：narrative-engine-service → 100%通用
// ============================================================

import { GeneratedElement, WritingContext, VocabProvider } from './types';
import { fillParams, renderTemplate } from '../param-filler';

export class ConflictGenerator {
  private vocabProvider: VocabProvider;

  constructor(vocabProvider: VocabProvider) {
    this.vocabProvider = vocabProvider;
  }

  generate(
    template: any,
    context: WritingContext,
    packId: string,
    conflictContext?: { conflict_type?: string; intensity?: string; parties?: string[] }
  ): GeneratedElement {
    const paramPools = template.param_pools || {};

    const conflictType = template.type || template.conflict_type || '对抗';
    const intensity = conflictContext?.intensity || template.intensity || '中等';

    const escalation = this.buildEscalation(template, context);
    const resolution = this.pickFromPool(
      template.resolution_pool || paramPools.resolution || null,
      ['惨胜', '险胜', '平局', '惨胜但付出代价', '撤退']
    );

    const params = fillParams(template.parameters, {
      protagonist: context.protagonist.name,
      location: context.location,
      conflict_type: conflictType,
      intensity,
      resolution,
    });

    const narrative = renderTemplate(
      template.narrative_template || '',
      params,
      { protagonist: context.protagonist.name, location: context.location }
    );

    return {
      name: template.name || '冲突',
      conflict_type: conflictType,
      intensity,
      escalation_path: escalation,
      resolution,
      narrative,
    };
  }

  scoreTemplate(
    template: any,
    _context: WritingContext
  ): { relevance: number; novelty: number; compatibility: number; total: number } {
    const usageCount = template.usage_count || 0;
    const relevance = 0.5;
    const novelty = 1 - Math.min(usageCount / 10, 1);
    const compatibility = 0.7;
    return {
      relevance,
      novelty,
      compatibility,
      total: relevance * 0.4 + novelty * 0.3 + compatibility * 0.3,
    };
  }

  private buildEscalation(template: any, context: WritingContext): string[] {
    const escalationPath = template.escalation_stages
      || template.escalation_path
      || (template.structure && (template.structure.escalation || template.structure.build))
      || null;

    if (Array.isArray(escalationPath) && escalationPath.length > 0) {
      return escalationPath.map((s: string) =>
        s.replace(/\{protagonist\}/g, context.protagonist.name)
         .replace(/\{location\}/g, context.location)
      );
    }
    if (escalationPath && typeof escalationPath === 'object') {
      const stages: string[] = [];
      for (const [, val] of Object.entries(escalationPath)) {
        if (typeof val === 'string') {
          stages.push(val.replace(/\{protagonist\}/g, context.protagonist.name));
        }
      }
      if (stages.length > 0) return stages;
    }
    return ['矛盾初现', '冲突升级', '高潮对决', '分出胜负'];
  }

  private pickFromPool(pool: string[] | null, fallback: string[]): string {
    const combined = [...(pool || []), ...fallback];
    if (combined.length === 0) return '解决';
    return combined[Math.floor(Math.random() * combined.length)];
  }
}