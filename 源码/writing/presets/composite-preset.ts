// ============================================================
// 复合预设系统 — 预设混合/拆分/自定义
// 让作者可以"仙侠的节奏 + 轻小说的对话 + 硬科幻的描写密度"
// 不再只能选一个固定预设，而是从多个预设中提取想要的维度组合
// ============================================================

import type { WritingPreset, StyleConfig, WritingRule, Character, Setting } from '../types';
import { BUILTIN_PRESETS, getPresetById } from './index';

/** 可拆分/组合的风格维度 */
export type PresetDimension =
  | 'tone'              // 文风基调
  | 'pov'               // 视角
  | 'pace'              // 节奏
  | 'dialogRatio'       // 对话比例
  | 'descriptionDensity' // 描写密度
  | 'classicalRatio'    // 文白比例
  | 'humor'             // 幽默感
  | 'customInstructions' // 自定义风格指令
  | 'worldPremise'      // 世界观
  | 'rules'             // 规则
  | 'extraPrompt'       // 额外提示
  | 'extraConstraints';  // 额外约束

/** 从一个预设中提取指定维度 */
export function extractComponent(
  presetId: string,
  dimension: PresetDimension,
): Partial<StyleConfig> | string | WritingRule[] | string[] | undefined {
  const preset = getPresetById(presetId);
  if (!preset) return undefined;

  switch (dimension) {
    case 'tone':
      return { tone: preset.styleConfig.tone };
    case 'pov':
      return { pov: preset.styleConfig.pov };
    case 'pace':
      return { pace: preset.styleConfig.pace };
    case 'dialogRatio':
      return { dialogRatio: preset.styleConfig.dialogRatio };
    case 'descriptionDensity':
      return { descriptionDensity: preset.styleConfig.descriptionDensity };
    case 'classicalRatio':
      return { classicalRatio: preset.styleConfig.classicalRatio };
    case 'humor':
      return { humor: preset.styleConfig.humor };
    case 'customInstructions':
      return { customInstructions: preset.styleConfig.customInstructions };
    case 'worldPremise':
      return preset.worldPremise;
    case 'rules':
      return preset.rules;
    case 'extraPrompt':
      return preset.extraPrompt;
    case 'extraConstraints':
      return preset.extraConstraints;
    default:
      return undefined;
  }
}

/** 维度覆盖规则：指定每个维度从哪个预设取 */
export interface DimensionOverride {
  /** 维度名 */
  dimension: PresetDimension;
  /** 从哪个预设ID取 */
  fromPreset: string;
}

/**
 * 混合多个预设
 * 按覆盖规则从不同预设提取不同维度，合成一个新预设
 *
 * @example
 * // 仙侠的节奏 + 轻小说的对话 + 硬科幻的描写
 * const hybrid = mergePresets(
 *   ['xianxia_qidian', 'light_novel', 'hard_scifi'],
 *   [
 *     { dimension: 'pace', fromPreset: 'xianxia_qidian' },
 *     { dimension: 'dialogRatio', fromPreset: 'light_novel' },
 *     { dimension: 'descriptionDensity', fromPreset: 'hard_scifi' },
 *   ],
 *   { id: 'my_hybrid', name: '仙侠轻小说硬科幻混合' }
 * );
 */
export function mergePresets(
  basePresetIds: string[],
  overrides: DimensionOverride[],
  meta: { id: string; name: string; description?: string; genre?: string },
): WritingPreset {
  // 第一个预设作为基础
  const basePreset = getPresetById(basePresetIds[0]);
  if (!basePreset) {
    throw new Error(`基础预设 ${basePresetIds[0]} 不存在`);
  }

  // 从基础预设复制全部配置
  let styleConfig: Partial<StyleConfig> = { ...basePreset.styleConfig };
  let worldPremise: string | undefined = basePreset.worldPremise;
  let rules: WritingRule[] = [...(basePreset.rules || [])];
  let extraPrompt: string | undefined = basePreset.extraPrompt;
  let extraConstraints: string[] = [...(basePreset.extraConstraints || [])];

  // 按覆盖规则替换维度
  for (const override of overrides) {
    const sourcePreset = getPresetById(override.fromPreset);
    if (!sourcePreset) continue;

    switch (override.dimension) {
      case 'tone':
        styleConfig.tone = sourcePreset.styleConfig.tone;
        break;
      case 'pov':
        styleConfig.pov = sourcePreset.styleConfig.pov;
        break;
      case 'pace':
        styleConfig.pace = sourcePreset.styleConfig.pace;
        break;
      case 'dialogRatio':
        styleConfig.dialogRatio = sourcePreset.styleConfig.dialogRatio;
        break;
      case 'descriptionDensity':
        styleConfig.descriptionDensity = sourcePreset.styleConfig.descriptionDensity;
        break;
      case 'classicalRatio':
        styleConfig.classicalRatio = sourcePreset.styleConfig.classicalRatio;
        break;
      case 'humor':
        styleConfig.humor = sourcePreset.styleConfig.humor;
        break;
      case 'customInstructions':
        styleConfig.customInstructions = sourcePreset.styleConfig.customInstructions;
        break;
      case 'worldPremise':
        worldPremise = sourcePreset.worldPremise;
        break;
      case 'rules':
        // 规则合并而非替换（不同预设的规则可以共存）
        rules = [...rules, ...(sourcePreset.rules || [])];
        break;
      case 'extraPrompt':
        // 额外提示合并
        extraPrompt = [extraPrompt, sourcePreset.extraPrompt].filter(Boolean).join('\n\n');
        break;
      case 'extraConstraints':
        // 约束合并
        extraConstraints = [...extraConstraints, ...(sourcePreset.extraConstraints || [])];
        break;
    }
  }

  return {
    id: meta.id,
    name: meta.name,
    genre: meta.genre || basePreset.genre,
    description: meta.description || `混合预设：${basePresetIds.join(' + ')}`,
    styleConfig,
    worldPremise,
    rules: deduplicateRules(rules),
    extraPrompt,
    extraConstraints: [...new Set(extraConstraints)],
  };
}

/**
 * 纯自定义预设
 * 不基于任何现有预设，直接传入风格参数创建
 */
export function createCustomPreset(config: {
  id: string;
  name: string;
  genre: string;
  description?: string;
  styleConfig: Partial<StyleConfig>;
  worldPremise?: string;
  rules?: WritingRule[];
  extraPrompt?: string;
  extraConstraints?: string[];
  baseCharacters?: Character[];
  baseSettings?: Setting[];
}): WritingPreset {
  return {
    id: config.id,
    name: config.name,
    genre: config.genre,
    description: config.description || `自定义预设：${config.name}`,
    styleConfig: config.styleConfig,
    worldPremise: config.worldPremise,
    rules: config.rules,
    extraPrompt: config.extraPrompt,
    extraConstraints: config.extraConstraints,
    baseCharacters: config.baseCharacters,
    baseSettings: config.baseSettings,
  };
}

/**
 * 从两个预设中各取一半，合成新预设
 * 快捷方式：前半部分从 A 取，后半部分从 B 取
 */
export function blendPresets(
  presetAId: string,
  presetBId: string,
  ratio: number,
  meta: { id: string; name: string; description?: string },
): WritingPreset {
  const a = getPresetById(presetAId);
  const b = getPresetById(presetBId);
  if (!a || !b) {
    throw new Error(`预设不存在: ${presetAId} 或 ${presetBId}`);
  }

  const r = Math.max(0, Math.min(1, ratio)); // 0=全A, 1=全B

  // 数值维度做线性插值
  const blend = (va: number | undefined, vb: number | undefined): number | undefined => {
    if (va === undefined && vb === undefined) return undefined;
    if (va === undefined) return vb;
    if (vb === undefined) return va;
    return va * (1 - r) + vb * r;
  };

  return {
    id: meta.id,
    name: meta.name,
    genre: r > 0.5 ? b.genre : a.genre,
    description: meta.description || `${a.name}(${((1 - r) * 100).toFixed(0)}%) × ${b.name}(${(r * 100).toFixed(0)}%)`,
    styleConfig: {
      tone: blend(a.styleConfig.tone, b.styleConfig.tone),
      pov: r > 0.5 ? b.styleConfig.pov : a.styleConfig.pov,
      pace: blend(a.styleConfig.pace, b.styleConfig.pace),
      dialogRatio: blend(a.styleConfig.dialogRatio, b.styleConfig.dialogRatio),
      descriptionDensity: blend(a.styleConfig.descriptionDensity, b.styleConfig.descriptionDensity),
      classicalRatio: blend(a.styleConfig.classicalRatio, b.styleConfig.classicalRatio),
      humor: blend(a.styleConfig.humor, b.styleConfig.humor),
      customInstructions: r > 0.5 ? b.styleConfig.customInstructions : a.styleConfig.customInstructions,
    },
    worldPremise: r > 0.5 ? b.worldPremise : a.worldPremise,
    rules: [...(a.rules || []), ...(b.rules || [])],
    extraPrompt: [a.extraPrompt, b.extraPrompt].filter(Boolean).join('\n\n') || undefined,
    extraConstraints: [...new Set([...(a.extraConstraints || []), ...(b.extraConstraints || [])])],
  };
}

/** 规则去重（按ID） */
function deduplicateRules(rules: WritingRule[]): WritingRule[] {
  const seen = new Set<string>();
  const result: WritingRule[] = [];
  for (const rule of rules) {
    if (rule.id && !seen.has(rule.id)) {
      seen.add(rule.id);
      result.push(rule);
    } else if (!rule.id) {
      result.push(rule);
    }
  }
  return result;
}

/** 列出所有可用的预设ID */
export function listAvailablePresetIds(): string[] {
  return BUILTIN_PRESETS.map(p => p.id);
}
