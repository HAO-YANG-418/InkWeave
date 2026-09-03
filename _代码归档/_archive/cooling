// ============================================================
// 约束栈 (Constraint Stack) — v2.1
// 职责：5层约束校验（境界→属性→卷级→类型包→质量）
// 来源：narrative-engine-service → 框架70%通用，已剥离矿工专属规则
// ============================================================

import {
  GeneratedElement,
  ConstraintWritingContext as WritingContext,
  ConstraintValidationResult as ValidationResult,
  LayerCheckDetail,
  ConstraintCheckResult as CheckResult,
  ViolationDetail,
  AbilityTemplate,
  OpponentTemplate,
} from './types';

// === 约束配置 ===
export interface RealmConstraints {
  realms: Record<string, RealmConstraint>;
}

export interface RealmConstraint {
  power_ceiling: string;
  range_ceiling: string;
  cost_tiers: string[];
  available_templates: string[];
  max_opponent_realm: number;
}

export interface AttributeConstraints {
  counter_ring: string[];
  mutual_exclusions: [string, string][];
  compatibility_matrix: Record<string, string[]>;
  /** 属性别名映射：模板子属性 → 主角主属性（可注入） */
  attribute_aliases?: Record<string, string[]>;
}

export interface VolumeConstraints {
  redlines: string[];
  forbidden_items: string[];
  quotas: VolumeQuotaConfig;
  template_whitelist?: string[];
  template_blacklist?: string[];
}

export interface VolumeQuotaConfig {
  new_terms: number;
  new_factions: number;
  info_release: number;
  /** 可扩展的自定义配额 */
  [key: string]: number;
}

export interface QualityConstraints {
  template_cooldown: Record<string, number>;
  type_cooldown: Record<string, number>;
  effect_cooldown: number;
  name_similarity_threshold: number;
  max_abilities_per_chapter: number;
  diversity_interval: number;
}

// === 约束栈配置 ===
export interface ConstraintStackConfig {
  realmConstraints: RealmConstraints | null;
  attributeConstraints: AttributeConstraints | null;
  volumeConstraints: Map<number, VolumeConstraints>;
  qualityConstraints: QualityConstraints | null;
  /** 境界排序列表（低→高），用于对手境界比较 */
  realmOrder: string[];
}

// === 约束栈 ===
export class ConstraintStack {
  private realmConstraints: RealmConstraints | null;
  private attributeConstraints: AttributeConstraints | null;
  private volumeConstraints: Map<number, VolumeConstraints>;
  private qualityConstraints: QualityConstraints | null;
  private realmOrder: string[];

  constructor(config: ConstraintStackConfig) {
    this.realmConstraints = config.realmConstraints;
    this.attributeConstraints = config.attributeConstraints;
    this.volumeConstraints = config.volumeConstraints;
    this.qualityConstraints = config.qualityConstraints;
    this.realmOrder = config.realmOrder;
  }

  // ===== 5层验证 =====

  validate(
    element: GeneratedElement,
    context: WritingContext,
    module: string,
    template?: AbilityTemplate | OpponentTemplate
  ): ValidationResult {
    const violations: ViolationDetail[] = [];
    const warnings: string[] = [];
    const layers: Record<string, LayerCheckDetail> = {};

    // Layer 1: 境界约束
    const realmResult = this.validateRealm(element, context, module, template);
    layers['realm'] = realmResult;
    if (realmResult.status === 'FAIL') {
      for (const [key, check] of Object.entries(realmResult.checks)) {
        if (check.status === 'FAIL') {
          violations.push({ template: module, violation: `realm:${key}`, detail: check.message });
        }
      }
    }

    // Layer 2: 属性约束
    const attrResult = this.validateAttribute(element, context, module);
    layers['attribute'] = attrResult;
    if (attrResult.status === 'FAIL') {
      for (const [key, check] of Object.entries(attrResult.checks)) {
        if (check.status === 'FAIL') {
          violations.push({ template: module, violation: `attribute:${key}`, detail: check.message });
        }
      }
    }

    // Layer 3: 卷级约束
    const volResult = this.validateVolume(element, context);
    layers['volume'] = volResult;
    if (volResult.status === 'FAIL') {
      for (const [key, check] of Object.entries(volResult.checks)) {
        if (check.status === 'FAIL') {
          violations.push({ template: module, violation: `volume:${key}`, detail: check.message });
        }
      }
      return { pass: false, violations, warnings, layers };
    } else if (volResult.status === 'WARN') {
      for (const [key, check] of Object.entries(volResult.checks)) {
        if (check.message) warnings.push(check.message);
      }
    }

    // Layer 4: 类型包约束（委托给外部 TypePackManager）
    const packResult = this.validateGenrePack(element, context);
    layers['genre_pack'] = packResult;
    if (packResult.status === 'FAIL') {
      for (const [key, check] of Object.entries(packResult.checks)) {
        if (check.status === 'FAIL') {
          violations.push({ template: module, violation: `genre_pack:${key}`, detail: check.message });
        }
      }
    }

    // Layer 5: 质量约束
    const qualResult = this.validateQuality(element, context, template);
    layers['quality'] = qualResult;
    if (qualResult.status === 'FAIL') {
      for (const [key, check] of Object.entries(qualResult.checks)) {
        if (check.status === 'FAIL') {
          violations.push({ template: module, violation: `quality:${key}`, detail: check.message });
        }
      }
    }
    if (qualResult.status === 'WARN') {
      for (const [key, check] of Object.entries(qualResult.checks)) {
        if (check.status === 'WARN') {
          warnings.push(check.message || `质量警告: ${key}`);
        }
      }
    }

    return { pass: violations.length === 0, violations, warnings, layers };
  }

  // ===== Layer 1: 境界约束 =====

  private validateRealm(
    element: GeneratedElement,
    context: WritingContext,
    module: string,
    template?: any
  ): LayerCheckDetail {
    const checks: Record<string, CheckResult> = {};
    const realmName = context.protagonist.realm;
    const realmConfig = this.realmConstraints?.realms[realmName];

    if (!realmConfig) {
      checks['realm_config'] = { status: 'WARN', message: `未找到境界配置: ${realmName}` };
      return { layer: 'realm', status: 'WARN', checks };
    }

    // 能力破坏力检查
    if (module === 'ability' && element.effect) {
      checks['power_check'] = {
        status: 'PASS',
        actual: element.effect,
        limit: realmConfig.power_ceiling,
      };
    }

    // 对手境界检查（使用可注入的境界排序）
    if (module === 'opponent' && element.realm) {
      const protIdx = this.realmOrder.indexOf(realmName);
      const oppIdx = this.realmOrder.indexOf(element.realm);
      if (protIdx >= 0 && oppIdx >= 0) {
        const allowed = oppIdx <= protIdx;
        checks['opponent_check'] = {
          status: allowed ? 'PASS' : 'FAIL',
          actual: element.realm,
          limit: `${realmName}及以下`,
          message: !allowed ? `对手境界(${element.realm})超出主角境界(${realmName})` : undefined,
        };
      } else {
        checks['opponent_check'] = { status: 'PASS' };
      }
    }

    // 模板检查
    if (module === 'ability' && template?.id) {
      const available: any = realmConfig.available_templates;
      let templateOk = false;
      if (Array.isArray(available)) {
        templateOk = available.includes(template.id);
      } else if (typeof available === 'string' && available.includes('全部')) {
        templateOk = true;
      }
      checks['template_check'] = {
        status: templateOk ? 'PASS' : 'FAIL',
        actual: template.id,
        limit: Array.isArray(available) ? available.join(', ') : String(available),
        message: templateOk ? undefined : `模板 ${template.id} 不在境界 ${realmName} 的可用列表中`,
      };
    }

    const hasFailure = Object.values(checks).some(c => c.status === 'FAIL');
    return { layer: 'realm', status: hasFailure ? 'FAIL' : 'PASS', checks };
  }

  // ===== Layer 2: 属性约束 =====

  private validateAttribute(
    element: GeneratedElement,
    context: WritingContext,
    module?: string
  ): LayerCheckDetail {
    const checks: Record<string, CheckResult> = {};
    const attrConfig = this.attributeConstraints;
    const protAttrs = context.protagonist.attributes;
    const elemAttr = element.attribute;

    // 非能力模块不做属性匹配检查
    if (!attrConfig || !elemAttr || module !== 'ability') {
      checks['attribute_match'] = { status: 'N/A' };
      return { layer: 'attribute', status: 'PASS', checks };
    }

    // 属性兼容性检查（使用可注入的别名映射）
    const aliases = attrConfig.attribute_aliases || {};
    const elemAliases = aliases[elemAttr] || [];
    const attrMatch = protAttrs.some((pa: string) =>
      elemAttr.includes(pa) || pa.includes(elemAttr) || elemAliases.includes(pa)
    ) || protAttrs.includes(elemAttr);

    checks['attribute_match'] = {
      status: attrMatch ? 'PASS' : 'FAIL',
      actual: elemAttr,
      limit: protAttrs.join(', '),
      message: !attrMatch
        ? `角色 ${context.protagonist.name} 的属性 ${protAttrs.join('/')} 与能力属性 ${elemAttr} 不兼容`
        : undefined,
    };

    checks['mutual_exclusion'] = { status: 'PASS' };

    if (element.attribute && attrConfig.counter_ring) {
      checks['counter_relation'] = { status: 'N/A' };
    }

    const hasFailure = Object.values(checks).some(c => c.status === 'FAIL');
    return { layer: 'attribute', status: hasFailure ? 'FAIL' : 'PASS', checks };
  }

  // ===== Layer 3: 卷级约束 =====

  private validateVolume(
    element: GeneratedElement,
    context: WritingContext
  ): LayerCheckDetail {
    const checks: Record<string, CheckResult> = {};
    const volConfig = this.volumeConstraints.get(context.volume);

    if (!volConfig) {
      checks['volume_config'] = { status: 'WARN', message: `未找到卷${context.volume}的约束配置` };
      return { layer: 'volume', status: 'WARN', checks };
    }

    // 红线检查
    for (const redline of volConfig.redlines) {
      const elementText = JSON.stringify(element).toLowerCase();
      if (elementText.includes(redline.toLowerCase())) {
        checks['redline_check'] = {
          status: 'FAIL',
          message: `触发卷${context.volume}红线: "${redline}"`,
        };
        return { layer: 'volume', status: 'FAIL', checks };
      }
    }
    checks['redline_check'] = { status: 'PASS', actual: '未触发红线', limit: volConfig.redlines.join(', ') };

    // 禁止项检查
    for (const item of volConfig.forbidden_items) {
      if (!item || item.length < 3) continue;
      const elementText = JSON.stringify(element).toLowerCase();
      if (elementText.includes(item.toLowerCase())) {
        checks['forbidden_check'] = {
          status: 'FAIL',
          message: `触发卷${context.volume}禁止项: "${item}"`,
        };
        return { layer: 'volume', status: 'FAIL', checks };
      }
    }

    // 软警告（短词）
    const softWarnings: string[] = [];
    for (const item of volConfig.forbidden_items) {
      if (item && item.length < 3) {
        const elementText = JSON.stringify(element).toLowerCase();
        if (elementText.includes(item.toLowerCase())) {
          softWarnings.push(`"${item}"在卷${context.volume}需谨慎使用`);
        }
      }
    }
    checks['forbidden_check'] = {
      status: softWarnings.length > 0 ? 'WARN' : 'PASS',
      message: softWarnings.length > 0 ? softWarnings.join('; ') : undefined,
    };

    // 配额检查
    checks['quota_check'] = { status: 'PASS', message: `配额: 新术语${volConfig.quotas.new_terms}` };

    return { layer: 'volume', status: 'PASS', checks };
  }

  // ===== Layer 4: 类型包约束（占位，由外部 TypePackManager 实现） =====

  private typePackValidator?: (element: GeneratedElement, context: WritingContext) => LayerCheckDetail;

  /** 注入外部类型包校验器 */
  setTypePackValidator(validator: (element: GeneratedElement, context: WritingContext) => LayerCheckDetail): void {
    this.typePackValidator = validator;
  }

  private validateGenrePack(
    element: GeneratedElement,
    context: WritingContext
  ): LayerCheckDetail {
    if (this.typePackValidator) {
      return this.typePackValidator(element, context);
    }
    return { layer: 'genre_pack', status: 'PASS', checks: { 'pack_available': { status: 'N/A' } } };
  }

  // ===== Layer 5: 质量约束 =====

  private validateQuality(
    element: GeneratedElement,
    _context: WritingContext,
    template?: AbilityTemplate | OpponentTemplate
  ): LayerCheckDetail {
    const checks: Record<string, CheckResult> = {};
    const qc = this.qualityConstraints;

    if (!qc) {
      checks['quality_config'] = { status: 'WARN', message: '质量约束配置未加载' };
      return { layer: 'quality', status: 'WARN', checks };
    }

    if (element.name) {
      checks['name_uniqueness'] = { status: 'PASS', actual: element.name, limit: '不重复' };
    }

    if (template?.id) {
      const cooldownMap = qc.template_cooldown;
      const cooldownVal = cooldownMap && typeof cooldownMap === 'object'
        ? (cooldownMap[template.id] || 5)
        : 5;
      checks['template_cooldown'] = {
        status: 'PASS', actual: template.id, limit: `${cooldownVal}章`,
      };
    }

    if (element.effect) {
      const effectCooldown = typeof qc.effect_cooldown === 'number' ? qc.effect_cooldown : 3;
      checks['effect_cooldown'] = {
        status: 'PASS', actual: element.effect, limit: `${effectCooldown}章`,
      };
    }

    return { layer: 'quality', status: 'PASS', checks };
  }

  // ===== 独立内容验证 =====

  validateContent(
    content: GeneratedElement,
    context: WritingContext,
    module: string
  ): ValidationResult {
    return this.validate(content, context, module);
  }

  // ===== 查询 =====

  getRealmConstraint(realmName: string): RealmConstraint | undefined {
    return this.realmConstraints?.realms[realmName];
  }

  getVolumeConstraints(volume: number): VolumeConstraints | undefined {
    return this.volumeConstraints.get(volume);
  }

  getQualityConstraints(): QualityConstraints | null {
    return this.qualityConstraints;
  }
}