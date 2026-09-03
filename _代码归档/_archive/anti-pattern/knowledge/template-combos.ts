// ============================================================
// 模板组合方案知识库 — v10.0
// 定义Coach模式的预定义模板组合方案
// TemplateComposer 读取这份知识来推荐模板组合
// ============================================================

import type { OpeningFormulaType } from '../../knowledge/opening-formulas';
import type { QuestionCycleType } from '../../knowledge/question-cycle';
import type { EmotionCurveType } from '../../knowledge/emotion-curve';
import type { BattleStyleType } from '../../knowledge/battle-styles';
import type { ChapterFunctionType } from './chapter-types';
import type { ConflictType } from './conflict-types';

/** 模板组合方案 */
export interface TemplateCombo {
  /** 组合ID */
  id: string;
  /** 组合名称 */
  name: string;
  /** 适用场景 */
  bestFor: string;
  /** 开篇公式 */
  opening: OpeningFormulaType;
  /** 问题循环 */
  questionCycle: QuestionCycleType;
  /** 情感曲线 */
  emotionCurve: EmotionCurveType;
  /** 战斗风格（可选，没有战斗时为undefined） */
  battleStyle?: BattleStyleType;
  /** 章功能类型 */
  chapterType: ChapterFunctionType;
  /** 冲突类型 */
  conflictType: ConflictType;
  /** 组合冷却（章数） */
  cooldown: number;
  /** 相邻组合约束：不能紧跟在哪些组合后面 */
  avoidAfter: string[];
  /** 推荐承接组合：建议跟在哪些组合后面 */
  followAfter: string[];
}

/** 8种预定义组合方案 */
export const TEMPLATE_COMBOS: TemplateCombo[] = [
  {
    id: 'combo_opening_crisis',
    name: '危机开局型',
    bestFor: '新卷开篇、新地图开局、重大危机爆发',
    opening: 'dead_end',
    questionCycle: 'single_chain',
    emotionCurve: 'rising',
    chapterType: 'conflict',
    conflictType: 'external_combat',
    cooldown: 5,
    avoidAfter: ['combo_opening_crisis', 'combo_battle_climax'],
    followAfter: ['combo_transition_breather', 'combo_setup_mystery'],
  },
  {
    id: 'combo_reward_explore',
    name: '收获探索型',
    bestFor: '主角获得新能力/资源、探索新区域、信息收集',
    opening: 'info_potential',
    questionCycle: 'parallel_chains',
    emotionCurve: 'roller_coaster',
    chapterType: 'reward',
    conflictType: 'informational_cognitive',
    cooldown: 4,
    avoidAfter: ['combo_reward_explore'],
    followAfter: ['combo_opening_crisis', 'combo_battle_climax', 'combo_setup_mystery'],
  },
  {
    id: 'combo_payoff_reversal',
    name: '反转打脸型',
    bestFor: '装逼打脸、身份揭露、实力碾压、读者爽点爆发',
    opening: 'identity_reversal',
    questionCycle: 'single_chain',
    emotionCurve: 'rising',
    battleStyle: 'intelligence',
    chapterType: 'payoff',
    conflictType: 'social_power',
    cooldown: 5,
    avoidAfter: ['combo_payoff_reversal', 'combo_opening_crisis'],
    followAfter: ['combo_setup_mystery', 'combo_transition_breather', 'combo_conflict_emotional'],
  },
  {
    id: 'combo_setup_mystery',
    name: '悬念铺垫型',
    bestFor: '埋设伏笔、展开世界观、建立角色关系、制造好奇心',
    opening: 'result_first',
    questionCycle: 'parallel_chains',
    emotionCurve: 'valley_peak',
    chapterType: 'setup',
    conflictType: 'informational_cognitive',
    cooldown: 3,
    avoidAfter: ['combo_setup_mystery'],
    followAfter: ['combo_opening_crisis', 'combo_battle_climax', 'combo_suspense_reveal'],
  },
  {
    id: 'combo_battle_climax',
    name: '决战高潮型',
    bestFor: '高潮战斗、生死对决、卷末高潮',
    opening: 'dead_end',
    questionCycle: 'single_chain',
    emotionCurve: 'rising',
    battleStyle: 'overwhelming',
    chapterType: 'battle',
    conflictType: 'external_combat',
    cooldown: 6,
    avoidAfter: ['combo_battle_climax', 'combo_opening_crisis'],
    followAfter: ['combo_payoff_reversal', 'combo_transition_breather', 'combo_setup_mystery'],
  },
  {
    id: 'combo_conflict_emotional',
    name: '情感抉择型',
    bestFor: '角色内心挣扎、道德两难、人际关系破裂',
    opening: 'behavior_reversal',
    questionCycle: 'single_chain',
    emotionCurve: 'valley_peak',
    chapterType: 'conflict',
    conflictType: 'moral_choice',
    cooldown: 4,
    avoidAfter: ['combo_conflict_emotional'],
    followAfter: ['combo_payoff_reversal', 'combo_suspense_reveal', 'combo_transition_breather'],
  },
  {
    id: 'combo_transition_breather',
    name: '日常过渡型',
    bestFor: '大事件后的喘息、场景转换、日常修炼、角色深化',
    opening: 'info_potential',
    questionCycle: 'parallel_chains',
    emotionCurve: 'roller_coaster',
    chapterType: 'transition',
    conflictType: 'interpersonal',
    cooldown: 2,
    avoidAfter: ['combo_transition_breather'],
    followAfter: ['combo_opening_crisis', 'combo_setup_mystery', 'combo_battle_climax', 'combo_reward_explore'],
  },
  {
    id: 'combo_suspense_reveal',
    name: '真相揭示型',
    bestFor: '揭示关键真相、伏笔回收、认知颠覆',
    opening: 'rule_subversion',
    questionCycle: 'single_chain',
    emotionCurve: 'valley_peak',
    chapterType: 'suspense',
    conflictType: 'informational_cognitive',
    cooldown: 4,
    avoidAfter: ['combo_suspense_reveal', 'combo_payoff_reversal'],
    followAfter: ['combo_setup_mystery', 'combo_transition_breather', 'combo_opening_crisis'],
  },
];

/** 获取组合方案 */
export function getComboById(id: string): TemplateCombo | undefined {
  return TEMPLATE_COMBOS.find(c => c.id === id);
}

/** 获取组合名称 */
export function getComboName(id: string): string {
  return getComboById(id)?.name || id;
}

/** LLM Prompt：让LLM动态生成模板组合 */
export function generateDynamicComboPrompt(context: {
  chapterIntent: string;
  genre?: string;
  prefixContent: string;
  recentCombos: string[];
  recommendedChapterType?: string;
  recommendedConflictType?: string;
  diversityWarnings?: string;
}): string {
  return `你是一个网文写作策略引擎。请根据以下上下文，为本章推荐一个模板组合方案。

已有的预定义组合（参考但不要完全照搬）：
${TEMPLATE_COMBOS.map(c => `- ${c.id}（${c.name}）：${c.bestFor}。冷却${c.cooldown}章`).join('\n')}

当前上下文：
- 章节意图：${context.chapterIntent}
- 题材：${context.genre || '未指定'}
- 前文摘要（最后500字）：${context.prefixContent.slice(-500)}
- 最近使用的组合：${context.recentCombos.length > 0 ? context.recentCombos.join(', ') : '无'}
- 推荐章类型：${context.recommendedChapterType || '未指定'}
- 推荐冲突类型：${context.recommendedConflictType || '未指定'}
- 多样性警告：${context.diversityWarnings || '无'}

开篇公式类型：dead_end, identity_reversal, behavior_reversal, result_first, rule_subversion, info_potential
问题循环类型：single_chain, parallel_chains, spiral
情感曲线类型：rising, valley_peak, peak_valley_peak, slow_burn, roller_coaster
战斗风格类型：intelligence, overwhelming, comeback, artistic, team_strategy
章类型：battle, reward, setup, conflict, payoff, suspense, transition
冲突类型：external_combat, internal_psychological, interpersonal, informational_cognitive, moral_choice, social_power

要求：
1. 推荐一个与最近使用的组合不同的方案
2. 如果有多样性警告，优先选择能打破重复的组合
3. 组合中的模板之间应该有协同效应

请只返回一个JSON：
{"id": "combo_custom_xxx", "name": "组合名称", "bestFor": "适用场景", "opening": "开篇类型", "questionCycle": "问题循环类型", "emotionCurve": "情感曲线类型", "battleStyle": "战斗风格或null", "chapterType": "章类型", "conflictType": "冲突类型", "cooldown": 3, "reason": "一句话推荐理由"}`;
}
