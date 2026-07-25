// ============================================================
// 场景生成器 (Scene Generator) — v2.1
// 职责：根据模板+上下文+词库，生成场景框架
// 来源：narrative-engine-service → 100%通用
// ============================================================

import { GeneratedElement, WritingContext, VocabProvider } from './types';
import { fillParams, renderTemplate } from '../param-filler';

export class SceneGenerator {
  private vocabProvider: VocabProvider;

  constructor(vocabProvider: VocabProvider) {
    this.vocabProvider = vocabProvider;
  }

  generate(
    template: any,
    context: WritingContext,
    packId: string,
    sceneContext?: { scene_type?: string; duration?: string; participants?: string[] }
  ): GeneratedElement {
    const vocab = this.vocabProvider.getVocab(packId);
    const paramPools = template.param_pools || {};

    const sceneStructure = this.buildStructure(template.structure, context);
    const atmosphere = this.pickAtmosphere(
      template.atmosphere_pool || paramPools.environment || null,
      vocab
    );

    const params = fillParams(template.parameters, {
      protagonist: context.protagonist.name,
      location: context.location,
      atmosphere,
      scene_type: template.scene_type || template.type || '场景',
    });

    const narrative = renderTemplate(
      template.narrative_template || '',
      params,
      { protagonist: context.protagonist.name, location: context.location, atmosphere }
    );

    return {
      name: template.name || '场景',
      scene_structure: sceneStructure,
      atmosphere,
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

  private buildStructure(structureRaw: any, context: WritingContext): string[] {
    if (Array.isArray(structureRaw)) {
      return structureRaw.map((s: string) =>
        s.replace(/\{protagonist\}/g, context.protagonist.name)
          .replace(/\{location\}/g, context.location)
      );
    }
    if (structureRaw && typeof structureRaw === 'object') {
      const stages: string[] = [];
      if (structureRaw.enter) stages.push(structureRaw.enter);
      if (structureRaw.build) stages.push(structureRaw.build);
      if (structureRaw.climax) stages.push(structureRaw.climax);
      if (structureRaw.exit) stages.push(structureRaw.exit);
      if (stages.length > 0) {
        return stages.map((s: string) =>
          s.replace(/\{protagonist\}/g, context.protagonist.name)
           .replace(/\{location\}/g, context.location)
        );
      }
    }
    return ['进入场景', '发现异常', '高潮转折', '离开场景'];
  }

  private pickAtmosphere(pool: string[] | null, vocab?: any): string {
    const combined = [...(pool || []), ...(vocab?.emotion_terms || [])];
    if (combined.length === 0) {
      const fallbacks = ['紧张', '压抑', '诡异', '肃穆', '沉闷', '躁动'];
      return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
    return combined[Math.floor(Math.random() * combined.length)];
  }
}