// ============================================================
// GWE - 知识库加载器（通用版）
// v12.0: 动态导入替代静态导入，避免模块加载时一次性加载95个JSON文件
// 兼容 Node.js 和浏览器
// ============================================================

import type { NodeOptionKB, Preset } from './types';
import { GWEEngine } from './gwe-engine';
import { BASE_PROMPT_MD } from './kb/base-prompt';
import baseVocabJson from './kb/base-vocab.json';

// ---- 动态导入所有节点选项 KB ----
// 使用工厂函数按需加载，避免模块初始化时全部加载到内存

async function loadAllNodeOptions(): Promise<NodeOptionKB[]> {
  const [
    ai_continue_short, ai_continue_medium, ai_continue_long, ai_continue_xlong,
    ai_creativity_conservative, ai_creativity_balanced, ai_creativity_adventurous,
    anchor_sparse, anchor_standard, anchor_dense, anchor_extreme,
    battle_atmosphere, battle_detail, battle_psychological, battle_result,
    desc_clinical, desc_minimal, desc_poetic, desc_sensory,
    dialogue_concise, dialogue_natural, dialogue_stylized, dialogue_verbose,
    emotion_show, emotion_tell, emotion_both,
    hook_soft, hook_suspense, hook_break,
    info_fast, info_balanced, info_leisurely,
    opening_medium, opening_strong, opening_weak,
    dense_low, dense_medium, dense_high,
    payoff_every3, payoff_every_ch, payoff_sparse,
    platform_generic, platform_qidian, platform_tomato, platform_qimao, platform_feilu, platform_jinjiang, platform_newmedia,
    pov_first_past, pov_first_present, pov_lim3_past, pov_lim3_present, pov_omi3_past, pov_omi3_present,
    rhetoric_plain, rhetoric_metaphor, rhetoric_ornate, rhetoric_sketch,
    rhythm_short, rhythm_medium, rhythm_mixed, rhythm_long,
    strict_lenient, strict_standard, strict_strict,
    length_1500, length_2200, length_2800, length_3000, length_4000, length_custom,
    tone_badass, tone_classical, tone_cold, tone_colloquial, tone_folksy, tone_playful, tone_serious,
    twist_sparse, twist_standard, twist_dense,
    filler_relaxed, filler_standard, filler_strict, filler_webnovel,
    vocab_daily, vocab_esports, vocab_fantasy, vocab_generic, vocab_historical,
    vocab_horror, vocab_military, vocab_mystery, vocab_scifi, vocab_urban, vocab_xianxia,
  ] = await Promise.all([
    import('./kb/nodes/node_ai_continue_length/opt_ai_short.kb.json'),
    import('./kb/nodes/node_ai_continue_length/opt_ai_medium.kb.json'),
    import('./kb/nodes/node_ai_continue_length/opt_ai_long.kb.json'),
    import('./kb/nodes/node_ai_continue_length/opt_ai_xtra_long.kb.json'),
    import('./kb/nodes/node_ai_creativity/opt_ai_conservative.kb.json'),
    import('./kb/nodes/node_ai_creativity/opt_ai_balanced.kb.json'),
    import('./kb/nodes/node_ai_creativity/opt_ai_adventurous.kb.json'),
    import('./kb/nodes/node_anchor_density/opt_anchor_sparse.kb.json'),
    import('./kb/nodes/node_anchor_density/opt_anchor_standard.kb.json'),
    import('./kb/nodes/node_anchor_density/opt_anchor_dense.kb.json'),
    import('./kb/nodes/node_anchor_density/opt_anchor_extreme.kb.json'),
    import('./kb/nodes/node_battle_style/opt_battle_atmosphere.kb.json'),
    import('./kb/nodes/node_battle_style/opt_battle_detail.kb.json'),
    import('./kb/nodes/node_battle_style/opt_battle_psychological.kb.json'),
    import('./kb/nodes/node_battle_style/opt_battle_result.kb.json'),
    import('./kb/nodes/node_description_style/opt_desc_clinical.kb.json'),
    import('./kb/nodes/node_description_style/opt_desc_minimal.kb.json'),
    import('./kb/nodes/node_description_style/opt_desc_poetic.kb.json'),
    import('./kb/nodes/node_description_style/opt_desc_sensory.kb.json'),
    import('./kb/nodes/node_dialogue_style/opt_dialogue_concise.kb.json'),
    import('./kb/nodes/node_dialogue_style/opt_dialogue_natural.kb.json'),
    import('./kb/nodes/node_dialogue_style/opt_dialogue_stylized.kb.json'),
    import('./kb/nodes/node_dialogue_style/opt_dialogue_verbose.kb.json'),
    import('./kb/nodes/node_emotion_style/opt_emotion_show.kb.json'),
    import('./kb/nodes/node_emotion_style/opt_emotion_tell.kb.json'),
    import('./kb/nodes/node_emotion_style/opt_emotion_both.kb.json'),
    import('./kb/nodes/node_ending_hook/opt_hook_soft.kb.json'),
    import('./kb/nodes/node_ending_hook/opt_hook_suspense.kb.json'),
    import('./kb/nodes/node_ending_hook/opt_hook_break.kb.json'),
    import('./kb/nodes/node_info_density/opt_info_fast.kb.json'),
    import('./kb/nodes/node_info_density/opt_info_balanced.kb.json'),
    import('./kb/nodes/node_info_density/opt_info_leisurely.kb.json'),
    import('./kb/nodes/node_opening_impact/opt_opening_medium.kb.json'),
    import('./kb/nodes/node_opening_impact/opt_opening_strong.kb.json'),
    import('./kb/nodes/node_opening_impact/opt_opening_weak.kb.json'),
    import('./kb/nodes/node_paragraph_density/opt_dense_low.kb.json'),
    import('./kb/nodes/node_paragraph_density/opt_dense_medium.kb.json'),
    import('./kb/nodes/node_paragraph_density/opt_dense_high.kb.json'),
    import('./kb/nodes/node_payoff_frequency/opt_payoff_every_3.kb.json'),
    import('./kb/nodes/node_payoff_frequency/opt_payoff_every_chapter.kb.json'),
    import('./kb/nodes/node_payoff_frequency/opt_payoff_sparse.kb.json'),
    import('./kb/nodes/node_platform/opt_platform_generic.kb.json'),
    import('./kb/nodes/node_platform/opt_platform_qidian.kb.json'),
    import('./kb/nodes/node_platform/opt_platform_tomato.kb.json'),
    import('./kb/nodes/node_platform/opt_platform_qimao.kb.json'),
    import('./kb/nodes/node_platform/opt_platform_feilu.kb.json'),
    import('./kb/nodes/node_platform/opt_platform_jinjiang.kb.json'),
    import('./kb/nodes/node_platform/opt_platform_newmedia.kb.json'),
    import('./kb/nodes/node_pov/opt_pov_first_past.kb.json'),
    import('./kb/nodes/node_pov/opt_pov_first_present.kb.json'),
    import('./kb/nodes/node_pov/opt_pov_limited_third_past.kb.json'),
    import('./kb/nodes/node_pov/opt_pov_limited_third_present.kb.json'),
    import('./kb/nodes/node_pov/opt_pov_omniscient_third_past.kb.json'),
    import('./kb/nodes/node_pov/opt_pov_omniscient_third_present.kb.json'),
    import('./kb/nodes/node_rhetoric/opt_rhetoric_plain.kb.json'),
    import('./kb/nodes/node_rhetoric/opt_rhetoric_metaphor.kb.json'),
    import('./kb/nodes/node_rhetoric/opt_rhetoric_ornate.kb.json'),
    import('./kb/nodes/node_rhetoric/opt_rhetoric_sketch.kb.json'),
    import('./kb/nodes/node_sentence_rhythm/opt_rhythm_short.kb.json'),
    import('./kb/nodes/node_sentence_rhythm/opt_rhythm_medium.kb.json'),
    import('./kb/nodes/node_sentence_rhythm/opt_rhythm_mixed.kb.json'),
    import('./kb/nodes/node_sentence_rhythm/opt_rhythm_long.kb.json'),
    import('./kb/nodes/node_strictness/opt_strict_lenient.kb.json'),
    import('./kb/nodes/node_strictness/opt_strict_standard.kb.json'),
    import('./kb/nodes/node_strictness/opt_strict_strict.kb.json'),
    import('./kb/nodes/node_target_length/opt_length_1500.kb.json'),
    import('./kb/nodes/node_target_length/opt_length_2200.kb.json'),
    import('./kb/nodes/node_target_length/opt_length_2800.kb.json'),
    import('./kb/nodes/node_target_length/opt_length_3000.kb.json'),
    import('./kb/nodes/node_target_length/opt_length_4000.kb.json'),
    import('./kb/nodes/node_target_length/opt_length_custom.kb.json'),
    import('./kb/nodes/node_tone/opt_tone_badass.kb.json'),
    import('./kb/nodes/node_tone/opt_tone_classical.kb.json'),
    import('./kb/nodes/node_tone/opt_tone_cold.kb.json'),
    import('./kb/nodes/node_tone/opt_tone_colloquial.kb.json'),
    import('./kb/nodes/node_tone/opt_tone_folksy.kb.json'),
    import('./kb/nodes/node_tone/opt_tone_playful.kb.json'),
    import('./kb/nodes/node_tone/opt_tone_serious.kb.json'),
    import('./kb/nodes/node_twist_frequency/opt_twist_sparse.kb.json'),
    import('./kb/nodes/node_twist_frequency/opt_twist_standard.kb.json'),
    import('./kb/nodes/node_twist_frequency/opt_twist_dense.kb.json'),
    import('./kb/nodes/node_vocab_filler/opt_filler_relaxed.kb.json'),
    import('./kb/nodes/node_vocab_filler/opt_filler_standard.kb.json'),
    import('./kb/nodes/node_vocab_filler/opt_filler_strict.kb.json'),
    import('./kb/nodes/node_vocab_filler/opt_filler_webnovel.kb.json'),
    import('./kb/nodes/node_vocab_sensory/opt_vocab_daily.kb.json'),
    import('./kb/nodes/node_vocab_sensory/opt_vocab_esports.kb.json'),
    import('./kb/nodes/node_vocab_sensory/opt_vocab_fantasy.kb.json'),
    import('./kb/nodes/node_vocab_sensory/opt_vocab_generic.kb.json'),
    import('./kb/nodes/node_vocab_sensory/opt_vocab_historical.kb.json'),
    import('./kb/nodes/node_vocab_sensory/opt_vocab_horror.kb.json'),
    import('./kb/nodes/node_vocab_sensory/opt_vocab_military.kb.json'),
    import('./kb/nodes/node_vocab_sensory/opt_vocab_mystery.kb.json'),
    import('./kb/nodes/node_vocab_sensory/opt_vocab_scifi.kb.json'),
    import('./kb/nodes/node_vocab_sensory/opt_vocab_urban.kb.json'),
    import('./kb/nodes/node_vocab_sensory/opt_vocab_xianxia.kb.json'),
  ]);

  return [
    ai_continue_short.default ?? ai_continue_short, ai_continue_medium.default ?? ai_continue_medium, ai_continue_long.default ?? ai_continue_long, ai_continue_xlong.default ?? ai_continue_xlong,
    ai_creativity_conservative.default ?? ai_creativity_conservative, ai_creativity_balanced.default ?? ai_creativity_balanced, ai_creativity_adventurous.default ?? ai_creativity_adventurous,
    anchor_sparse.default ?? anchor_sparse, anchor_standard.default ?? anchor_standard, anchor_dense.default ?? anchor_dense, anchor_extreme.default ?? anchor_extreme,
    battle_atmosphere.default ?? battle_atmosphere, battle_detail.default ?? battle_detail, battle_psychological.default ?? battle_psychological, battle_result.default ?? battle_result,
    desc_clinical.default ?? desc_clinical, desc_minimal.default ?? desc_minimal, desc_poetic.default ?? desc_poetic, desc_sensory.default ?? desc_sensory,
    dialogue_concise.default ?? dialogue_concise, dialogue_natural.default ?? dialogue_natural, dialogue_stylized.default ?? dialogue_stylized, dialogue_verbose.default ?? dialogue_verbose,
    emotion_show.default ?? emotion_show, emotion_tell.default ?? emotion_tell, emotion_both.default ?? emotion_both,
    hook_soft.default ?? hook_soft, hook_suspense.default ?? hook_suspense, hook_break.default ?? hook_break,
    info_fast.default ?? info_fast, info_balanced.default ?? info_balanced, info_leisurely.default ?? info_leisurely,
    opening_medium.default ?? opening_medium, opening_strong.default ?? opening_strong, opening_weak.default ?? opening_weak,
    dense_low.default ?? dense_low, dense_medium.default ?? dense_medium, dense_high.default ?? dense_high,
    payoff_every3.default ?? payoff_every3, payoff_every_ch.default ?? payoff_every_ch, payoff_sparse.default ?? payoff_sparse,
    platform_generic.default ?? platform_generic, platform_qidian.default ?? platform_qidian, platform_tomato.default ?? platform_tomato, platform_qimao.default ?? platform_qimao, platform_feilu.default ?? platform_feilu, platform_jinjiang.default ?? platform_jinjiang, platform_newmedia.default ?? platform_newmedia,
    pov_first_past.default ?? pov_first_past, pov_first_present.default ?? pov_first_present, pov_lim3_past.default ?? pov_lim3_past, pov_lim3_present.default ?? pov_lim3_present, pov_omi3_past.default ?? pov_omi3_past, pov_omi3_present.default ?? pov_omi3_present,
    rhetoric_plain.default ?? rhetoric_plain, rhetoric_metaphor.default ?? rhetoric_metaphor, rhetoric_ornate.default ?? rhetoric_ornate, rhetoric_sketch.default ?? rhetoric_sketch,
    rhythm_short.default ?? rhythm_short, rhythm_medium.default ?? rhythm_medium, rhythm_mixed.default ?? rhythm_mixed, rhythm_long.default ?? rhythm_long,
    strict_lenient.default ?? strict_lenient, strict_standard.default ?? strict_standard, strict_strict.default ?? strict_strict,
    length_1500.default ?? length_1500, length_2200.default ?? length_2200, length_2800.default ?? length_2800, length_3000.default ?? length_3000, length_4000.default ?? length_4000, length_custom.default ?? length_custom,
    tone_badass.default ?? tone_badass, tone_classical.default ?? tone_classical, tone_cold.default ?? tone_cold, tone_colloquial.default ?? tone_colloquial, tone_folksy.default ?? tone_folksy, tone_playful.default ?? tone_playful, tone_serious.default ?? tone_serious,
    twist_sparse.default ?? twist_sparse, twist_standard.default ?? twist_standard, twist_dense.default ?? twist_dense,
    filler_relaxed.default ?? filler_relaxed, filler_standard.default ?? filler_standard, filler_strict.default ?? filler_strict, filler_webnovel.default ?? filler_webnovel,
    vocab_daily.default ?? vocab_daily, vocab_esports.default ?? vocab_esports, vocab_fantasy.default ?? vocab_fantasy, vocab_generic.default ?? vocab_generic, vocab_historical.default ?? vocab_historical,
    vocab_horror.default ?? vocab_horror, vocab_military.default ?? vocab_military, vocab_mystery.default ?? vocab_mystery, vocab_scifi.default ?? vocab_scifi, vocab_urban.default ?? vocab_urban, vocab_xianxia.default ?? vocab_xianxia,
  ] as unknown as NodeOptionKB[];
}

async function loadAllPresets(): Promise<Preset[]> {
  const [
    preset_daily, preset_esports, preset_fantasy, preset_historical,
    preset_horror, preset_miner, preset_mystery, preset_scifi,
    preset_urban_jj, preset_urban_tomato, preset_xianxia_qd, preset_xianxia_tomato,
  ] = await Promise.all([
    import('./kb/presets/preset_daily.json'),
    import('./kb/presets/preset_esports.json'),
    import('./kb/presets/preset_fantasy.json'),
    import('./kb/presets/preset_historical.json'),
    import('./kb/presets/preset_horror.json'),
    import('./kb/presets/preset_miner.json'),
    import('./kb/presets/preset_mystery.json'),
    import('./kb/presets/preset_scifi_hardcore.json'),
    import('./kb/presets/preset_urban_jinjiang.json'),
    import('./kb/presets/preset_urban_tomato.json'),
    import('./kb/presets/preset_xianxia_qidian.json'),
    import('./kb/presets/preset_xianxia_tomato.json'),
  ]);

  return [
    (preset_daily.default ?? preset_daily), (preset_esports.default ?? preset_esports),
    (preset_fantasy.default ?? preset_fantasy), (preset_historical.default ?? preset_historical),
    (preset_horror.default ?? preset_horror), (preset_miner.default ?? preset_miner),
    (preset_mystery.default ?? preset_mystery), (preset_scifi.default ?? preset_scifi),
    (preset_urban_jj.default ?? preset_urban_jj), (preset_urban_tomato.default ?? preset_urban_tomato),
    (preset_xianxia_qd.default ?? preset_xianxia_qd), (preset_xianxia_tomato.default ?? preset_xianxia_tomato),
  ] as unknown as Preset[];
}

export interface LoadResult {
  optionsLoaded: number;
  presetsLoaded: number;
  errors: string[];
}

/**
 * 从 JSON 对象加载单个节点选项 KB
 */
export function loadKBFromJSON(engine: GWEEngine, kb: NodeOptionKB): void {
  engine.loadNodeOption(kb);
}

/**
 * 异步加载所有内置 KB 数据到引擎
 * v12.0: 使用动态导入，避免模块加载时一次性加载95个JSON文件
 */
export async function loadAllKB(engine: GWEEngine): Promise<LoadResult> {
  const result: LoadResult = { optionsLoaded: 0, presetsLoaded: 0, errors: [] };

  try {
    engine.setBasePrompt(BASE_PROMPT_MD);
  } catch (e) {
    result.errors.push(`加载base-prompt失败: ${e}`);
  }

  try {
    engine.setBaseVocab(baseVocabJson as Record<string, string[]>);
  } catch (e) {
    result.errors.push(`加载base-vocab失败: ${e}`);
  }

  const allNodeKb = await loadAllNodeOptions();
  for (const kb of allNodeKb) {
    try {
      engine.loadNodeOption(kb);
      result.optionsLoaded++;
    } catch (e) {
      result.errors.push(`加载节点选项${kb.option_id}失败: ${e}`);
    }
  }

  const allPresets = await loadAllPresets();
  for (const preset of allPresets) {
    try {
      engine.registerPreset(preset);
      result.presetsLoaded++;
    } catch (e) {
      result.errors.push(`加载预设${preset.preset_id}失败: ${e}`);
    }
  }

  return result;
}

// ---- 引擎缓存（进程级单例，避免重复加载95个KB文件） ----
let _cachedEngine: GWEEngine | null = null;
let _cachedResult: LoadResult | null = null;

/**
 * 快速创建一个已加载所有内置知识库的引擎实例（异步）
 * v12.0: 异步版本，使用动态导入
 * v12.1: 进程级缓存，避免重复创建引擎导致OOM
 */
export async function createEngineWithKB(
  provider?: ConstructorParameters<typeof GWEEngine>[0],
): Promise<{ engine: GWEEngine; result: LoadResult }> {
  if (_cachedEngine && _cachedResult) {
    return { engine: _cachedEngine, result: _cachedResult };
  }
  const engine = new GWEEngine(provider);
  const result = await loadAllKB(engine);
  _cachedEngine = engine;
  _cachedResult = result;
  return { engine, result };
}

/**
 * 清除引擎缓存（仅测试用）
 */
export function clearEngineCache(): void {
  _cachedEngine = null;
  _cachedResult = null;
}