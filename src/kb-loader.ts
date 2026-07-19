// ============================================================
// GWE - 知识库加载器（通用版）
// 静态导入所有内置 KB 数据，兼容 Node.js 和浏览器
// 不依赖 Vite 的 import.meta.glob 或 Node.js 的 fs
// ============================================================

import type { NodeOptionKB, Preset } from './types';
import { GWEEngine } from './gwe-engine';
import { BASE_PROMPT_MD } from './kb/base-prompt';
import baseVocabJson from './kb/base-vocab.json';

// ---- 静态导入所有节点选项 KB ----
// AI 设置
import ai_continue_short from './kb/nodes/node_ai_continue_length/opt_ai_short.kb.json';
import ai_continue_medium from './kb/nodes/node_ai_continue_length/opt_ai_medium.kb.json';
import ai_continue_long from './kb/nodes/node_ai_continue_length/opt_ai_long.kb.json';
import ai_continue_xlong from './kb/nodes/node_ai_continue_length/opt_ai_xtra_long.kb.json';
import ai_creativity_conservative from './kb/nodes/node_ai_creativity/opt_ai_conservative.kb.json';
import ai_creativity_balanced from './kb/nodes/node_ai_creativity/opt_ai_balanced.kb.json';
import ai_creativity_adventurous from './kb/nodes/node_ai_creativity/opt_ai_adventurous.kb.json';

// 锚点密度
import anchor_sparse from './kb/nodes/node_anchor_density/opt_anchor_sparse.kb.json';
import anchor_standard from './kb/nodes/node_anchor_density/opt_anchor_standard.kb.json';
import anchor_dense from './kb/nodes/node_anchor_density/opt_anchor_dense.kb.json';
import anchor_extreme from './kb/nodes/node_anchor_density/opt_anchor_extreme.kb.json';

// 战斗风格
import battle_atmosphere from './kb/nodes/node_battle_style/opt_battle_atmosphere.kb.json';
import battle_detail from './kb/nodes/node_battle_style/opt_battle_detail.kb.json';
import battle_psychological from './kb/nodes/node_battle_style/opt_battle_psychological.kb.json';
import battle_result from './kb/nodes/node_battle_style/opt_battle_result.kb.json';

// 描写风格
import desc_clinical from './kb/nodes/node_description_style/opt_desc_clinical.kb.json';
import desc_minimal from './kb/nodes/node_description_style/opt_desc_minimal.kb.json';
import desc_poetic from './kb/nodes/node_description_style/opt_desc_poetic.kb.json';
import desc_sensory from './kb/nodes/node_description_style/opt_desc_sensory.kb.json';

// 对话风格
import dialogue_concise from './kb/nodes/node_dialogue_style/opt_dialogue_concise.kb.json';
import dialogue_natural from './kb/nodes/node_dialogue_style/opt_dialogue_natural.kb.json';
import dialogue_stylized from './kb/nodes/node_dialogue_style/opt_dialogue_stylized.kb.json';
import dialogue_verbose from './kb/nodes/node_dialogue_style/opt_dialogue_verbose.kb.json';

// 情绪风格
import emotion_show from './kb/nodes/node_emotion_style/opt_emotion_show.kb.json';
import emotion_tell from './kb/nodes/node_emotion_style/opt_emotion_tell.kb.json';
import emotion_both from './kb/nodes/node_emotion_style/opt_emotion_both.kb.json';

// 结尾钩子
import hook_soft from './kb/nodes/node_ending_hook/opt_hook_soft.kb.json';
import hook_suspense from './kb/nodes/node_ending_hook/opt_hook_suspense.kb.json';
import hook_break from './kb/nodes/node_ending_hook/opt_hook_break.kb.json';

// 信息密度
import info_fast from './kb/nodes/node_info_density/opt_info_fast.kb.json';
import info_balanced from './kb/nodes/node_info_density/opt_info_balanced.kb.json';
import info_leisurely from './kb/nodes/node_info_density/opt_info_leisurely.kb.json';

// 开头力度
import opening_medium from './kb/nodes/node_opening_impact/opt_opening_medium.kb.json';
import opening_strong from './kb/nodes/node_opening_impact/opt_opening_strong.kb.json';
import opening_weak from './kb/nodes/node_opening_impact/opt_opening_weak.kb.json';

// 段落密度
import dense_low from './kb/nodes/node_paragraph_density/opt_dense_low.kb.json';
import dense_medium from './kb/nodes/node_paragraph_density/opt_dense_medium.kb.json';
import dense_high from './kb/nodes/node_paragraph_density/opt_dense_high.kb.json';

// 回报频率
import payoff_every3 from './kb/nodes/node_payoff_frequency/opt_payoff_every_3.kb.json';
import payoff_every_ch from './kb/nodes/node_payoff_frequency/opt_payoff_every_chapter.kb.json';
import payoff_sparse from './kb/nodes/node_payoff_frequency/opt_payoff_sparse.kb.json';

// 平台适配
import platform_generic from './kb/nodes/node_platform/opt_platform_generic.kb.json';
import platform_qidian from './kb/nodes/node_platform/opt_platform_qidian.kb.json';
import platform_tomato from './kb/nodes/node_platform/opt_platform_tomato.kb.json';
import platform_qimao from './kb/nodes/node_platform/opt_platform_qimao.kb.json';
import platform_feilu from './kb/nodes/node_platform/opt_platform_feilu.kb.json';
import platform_jinjiang from './kb/nodes/node_platform/opt_platform_jinjiang.kb.json';
import platform_newmedia from './kb/nodes/node_platform/opt_platform_newmedia.kb.json';

// 视角
import pov_first_past from './kb/nodes/node_pov/opt_pov_first_past.kb.json';
import pov_first_present from './kb/nodes/node_pov/opt_pov_first_present.kb.json';
import pov_lim3_past from './kb/nodes/node_pov/opt_pov_limited_third_past.kb.json';
import pov_lim3_present from './kb/nodes/node_pov/opt_pov_limited_third_present.kb.json';
import pov_omi3_past from './kb/nodes/node_pov/opt_pov_omniscient_third_past.kb.json';
import pov_omi3_present from './kb/nodes/node_pov/opt_pov_omniscient_third_present.kb.json';

// 修辞风格
import rhetoric_plain from './kb/nodes/node_rhetoric/opt_rhetoric_plain.kb.json';
import rhetoric_metaphor from './kb/nodes/node_rhetoric/opt_rhetoric_metaphor.kb.json';
import rhetoric_ornate from './kb/nodes/node_rhetoric/opt_rhetoric_ornate.kb.json';
import rhetoric_sketch from './kb/nodes/node_rhetoric/opt_rhetoric_sketch.kb.json';

// 句长节奏
import rhythm_short from './kb/nodes/node_sentence_rhythm/opt_rhythm_short.kb.json';
import rhythm_medium from './kb/nodes/node_sentence_rhythm/opt_rhythm_medium.kb.json';
import rhythm_mixed from './kb/nodes/node_sentence_rhythm/opt_rhythm_mixed.kb.json';
import rhythm_long from './kb/nodes/node_sentence_rhythm/opt_rhythm_long.kb.json';

// 检测严格度
import strict_lenient from './kb/nodes/node_strictness/opt_strict_lenient.kb.json';
import strict_standard from './kb/nodes/node_strictness/opt_strict_standard.kb.json';
import strict_strict from './kb/nodes/node_strictness/opt_strict_strict.kb.json';

// 目标字数
import length_1500 from './kb/nodes/node_target_length/opt_length_1500.kb.json';
import length_2200 from './kb/nodes/node_target_length/opt_length_2200.kb.json';
import length_3000 from './kb/nodes/node_target_length/opt_length_3000.kb.json';
import length_4000 from './kb/nodes/node_target_length/opt_length_4000.kb.json';
import length_custom from './kb/nodes/node_target_length/opt_length_custom.kb.json';

// 语调
import tone_badass from './kb/nodes/node_tone/opt_tone_badass.kb.json';
import tone_classical from './kb/nodes/node_tone/opt_tone_classical.kb.json';
import tone_cold from './kb/nodes/node_tone/opt_tone_cold.kb.json';
import tone_colloquial from './kb/nodes/node_tone/opt_tone_colloquial.kb.json';
import tone_folksy from './kb/nodes/node_tone/opt_tone_folksy.kb.json';
import tone_playful from './kb/nodes/node_tone/opt_tone_playful.kb.json';
import tone_serious from './kb/nodes/node_tone/opt_tone_serious.kb.json';

// 反转频率
import twist_sparse from './kb/nodes/node_twist_frequency/opt_twist_sparse.kb.json';
import twist_standard from './kb/nodes/node_twist_frequency/opt_twist_standard.kb.json';
import twist_dense from './kb/nodes/node_twist_frequency/opt_twist_dense.kb.json';

// 水词过滤
import filler_relaxed from './kb/nodes/node_vocab_filler/opt_filler_relaxed.kb.json';
import filler_standard from './kb/nodes/node_vocab_filler/opt_filler_standard.kb.json';
import filler_strict from './kb/nodes/node_vocab_filler/opt_filler_strict.kb.json';
import filler_webnovel from './kb/nodes/node_vocab_filler/opt_filler_webnovel.kb.json';

// 题材词库
import vocab_daily from './kb/nodes/node_vocab_sensory/opt_vocab_daily.kb.json';
import vocab_esports from './kb/nodes/node_vocab_sensory/opt_vocab_esports.kb.json';
import vocab_fantasy from './kb/nodes/node_vocab_sensory/opt_vocab_fantasy.kb.json';
import vocab_generic from './kb/nodes/node_vocab_sensory/opt_vocab_generic.kb.json';
import vocab_historical from './kb/nodes/node_vocab_sensory/opt_vocab_historical.kb.json';
import vocab_horror from './kb/nodes/node_vocab_sensory/opt_vocab_horror.kb.json';
import vocab_military from './kb/nodes/node_vocab_sensory/opt_vocab_military.kb.json';
import vocab_mystery from './kb/nodes/node_vocab_sensory/opt_vocab_mystery.kb.json';
import vocab_scifi from './kb/nodes/node_vocab_sensory/opt_vocab_scifi.kb.json';
import vocab_urban from './kb/nodes/node_vocab_sensory/opt_vocab_urban.kb.json';
import vocab_xianxia from './kb/nodes/node_vocab_sensory/opt_vocab_xianxia.kb.json';

// ---- 静态导入所有预设 ----
import preset_daily from './kb/presets/preset_daily.json';
import preset_esports from './kb/presets/preset_esports.json';
import preset_fantasy from './kb/presets/preset_fantasy.json';
import preset_historical from './kb/presets/preset_historical.json';
import preset_horror from './kb/presets/preset_horror.json';
import preset_miner from './kb/presets/preset_miner.json';
import preset_mystery from './kb/presets/preset_mystery.json';
import preset_scifi from './kb/presets/preset_scifi_hardcore.json';
import preset_urban_jj from './kb/presets/preset_urban_jinjiang.json';
import preset_urban_tomato from './kb/presets/preset_urban_tomato.json';
import preset_xianxia_qd from './kb/presets/preset_xianxia_qidian.json';
import preset_xianxia_tomato from './kb/presets/preset_xianxia_tomato.json';

// 收集所有节点选项 KB
const ALL_NODE_KB: NodeOptionKB[] = [
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
  length_1500, length_2200, length_3000, length_4000, length_custom,
  tone_badass, tone_classical, tone_cold, tone_colloquial, tone_folksy, tone_playful, tone_serious,
  twist_sparse, twist_standard, twist_dense,
  filler_relaxed, filler_standard, filler_strict, filler_webnovel,
  vocab_daily, vocab_esports, vocab_fantasy, vocab_generic, vocab_historical,
  vocab_horror, vocab_military, vocab_mystery, vocab_scifi, vocab_urban, vocab_xianxia,
] as unknown as NodeOptionKB[];

// 收集所有预设
const ALL_PRESETS: Preset[] = [
  preset_daily, preset_esports, preset_fantasy, preset_historical,
  preset_horror, preset_miner, preset_mystery, preset_scifi,
  preset_urban_jj, preset_urban_tomato, preset_xianxia_qd, preset_xianxia_tomato,
] as unknown as Preset[];

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
 * 加载所有内置 KB 数据到引擎
 */
export function loadAllKB(engine: GWEEngine): LoadResult {
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

  for (const kb of ALL_NODE_KB) {
    try {
      engine.loadNodeOption(kb);
      result.optionsLoaded++;
    } catch (e) {
      result.errors.push(`加载节点选项${kb.option_id}失败: ${e}`);
    }
  }

  for (const preset of ALL_PRESETS) {
    try {
      engine.registerPreset(preset);
      result.presetsLoaded++;
    } catch (e) {
      result.errors.push(`加载预设${preset.preset_id}失败: ${e}`);
    }
  }

  return result;
}

/**
 * 快速创建一个已加载所有内置知识库的引擎实例
 */
export function createEngineWithKB(
  provider?: ConstructorParameters<typeof GWEEngine>[0],
): { engine: GWEEngine; result: LoadResult } {
  const engine = new GWEEngine(provider);
  const result = loadAllKB(engine);
  return { engine, result };
}