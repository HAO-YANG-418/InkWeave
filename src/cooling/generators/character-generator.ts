// ============================================================
// 角色生成器 (Character Generator) — v2.1
// 职责：根据模板+上下文+词库，生成新配角
// 来源：narrative-engine-service → 100%通用
// ============================================================

import { GeneratedElement, WritingContext, VocabProvider } from './types';
import { fillParams, renderTemplate } from '../param-filler';

export class CharacterGenerator {
  private vocabProvider: VocabProvider;

  constructor(vocabProvider: VocabProvider) {
    this.vocabProvider = vocabProvider;
  }

  generate(
    template: any,
    context: WritingContext,
    packId: string,
    characterContext?: { role_hint?: string; relation_to_protagonist?: string; gender?: string }
  ): GeneratedElement {
    const namingRules = this.vocabProvider.getNamingRules(packId);
    const paramPools = template.param_pools || {};

    const characterName = this.generateName(namingRules);

    const personality = this.pickFromPool(
      template.personality_pool || paramPools.coping_mechanism || null,
      ['沉默寡言', '豪爽直率', '心思缜密', '外冷内热', '老谋深算', '心直口快']
    );
    const appearance = this.pickFromPool(
      template.appearance_pool || paramPools.visual_identifier || null,
      ['满脸风霜但眼神锐利', '身形魁梧肌肉结实', '面容清瘦目光深邃', '脸上有一道旧疤', '皮肤黝黑手掌粗糙']
    );
    const speechStyle = this.pickFromPool(
      template.speech_style_pool || paramPools.dialogue_style || null,
      ['说话简短有力', '声音洪亮', '语速缓慢但字字清晰', '口音浓重', '惜字如金']
    );
    const role = template.role || (template.role_types && template.role_types[0]) || template.name || '配角';

    const params = fillParams(template.parameters, {
      protagonist: context.protagonist.name,
      character_name: characterName,
      personality,
      appearance,
      speech_style: speechStyle,
      role,
      location: context.location,
    });

    const narrative = renderTemplate(
      template.narrative_template || '',
      params,
      { protagonist: context.protagonist.name, character_name: characterName, location: context.location }
    );

    return {
      name: template.name || '角色',
      character_name: characterName,
      role,
      personality,
      appearance,
      speech_style: speechStyle,
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

  // ===== 内部方法 =====

  private generateName(namingRules: any): string {
    const surnames = namingRules?.surnames || [
      '叶', '林', '苏', '白', '铁', '顾', '赵', '李', '王', '陈',
      '刘', '张', '周', '吴', '郑', '孙', '钱', '秦', '许', '何',
      '萧', '沈', '韩', '杨', '朱', '段', '雷', '宋', '唐', '陆',
    ];
    const maleChars = namingRules?.male_chars || [
      '尘', '云', '风', '霆', '铮', '远', '渊', '明', '恒', '峰',
      '山', '河', '天', '龙', '虎', '刚', '正', '义', '诚', '信',
      '破', '军', '战', '凯', '烈', '寒', '锋', '锐', '岩', '磊',
    ];
    const femaleChars = namingRules?.female_chars || [
      '萤', '灵', '烟', '月', '雪', '霜', '凝', '雨', '琴', '若',
      '如', '语', '诗', '画', '颜', '璃', '玉', '瑶', '兰', '竹',
    ];
    const neutralChars = namingRules?.neutral_chars || ['尘', '云', '风', '远', '明', '恒', '寒', '青', '墨', '白'];

    const surname = surnames[Math.floor(Math.random() * surnames.length)];
    const useDouble = Math.random() < 0.7;
    const allChars = [...maleChars, ...femaleChars, ...neutralChars];
    if (useDouble) {
      const c1 = allChars[Math.floor(Math.random() * allChars.length)];
      const c2 = allChars[Math.floor(Math.random() * allChars.length)];
      return `${surname}${c1}${c2}`;
    } else {
      const c = allChars[Math.floor(Math.random() * allChars.length)];
      return `${surname}${c}`;
    }
  }

  private pickFromPool(pool: string[] | null, fallback: string[]): string {
    const combined = [...(pool || []), ...fallback];
    if (combined.length === 0) return '普通';
    return combined[Math.floor(Math.random() * combined.length)];
  }
}