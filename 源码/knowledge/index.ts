// ============================================================
// 知识库统一导出
// GWE写作引擎的所有写作知识数据集中在此
// ============================================================

// 反思评判标准
export {
  REFLECTION_CRITERIA,
  CLICHE_BLACKLIST,
  getAllDimensionKeys,
  getCriterionByKey,
  getAllCliches,
  getClichesByCategory,
  generateReflectionPrompt,
  DIMENSION_LABELS,
} from './reflection-criteria';
export type { DimensionCriterion, BadPattern, ClicheEntry } from './reflection-criteria';

// 套路冷却库
export {
  COOLING_PATTERNS,
  PLOT_TEMPLATES,
  getPatternsByCategory,
  getAllTriggers as getAllCoolingTriggers,
  getPatternById,
  getCategoryCooldown,
  getCategoryLabel,
  detectPatterns,
} from './cooling-patterns';
export type { PatternEntry, PatternCategory, PlotTemplate } from './cooling-patterns';

// 记忆提取规则
export {
  MEMORY_EXTRACTION_RULES,
  FORESHADOW_LIFECYCLE,
  FORGETTING_RULES,
  getRuleByType,
  getAllTriggers as getAllMemoryTriggers,
  detectExtractableMemories,
  getForeshadowPayoffSuggestion,
} from './memory-schema';
export type { MemoryExtractionRule, ForeshadowLifecycleRule, ForgettingRule } from './memory-schema';

// 叙事策略执行手册
export {
  STRATEGY_PLAYBOOKS,
  getPlaybookByKey,
  matchStrategiesByScenario,
  generateStrategyPrompt,
} from './narrative-strategies';
export type { StrategyPlaybook } from './narrative-strategies';

// 创意跳跃触发条件
export {
  LEAP_KNOWLEDGE,
  getLeapKnowledgeByType,
  matchLeapsByScenario,
  generateLeapPrompt,
} from './creative-leaps';
export type { LeapKnowledge } from './creative-leaps';

// 情节结构规则
export {
  NODE_DEPENDENCIES,
  PACING_RATIOS,
  WATER_CHAPTER_RULES,
  CONSISTENCY_CHECKS,
  OUTLINE_RULES,
  getDependencyByType,
  checkNodeSequence,
  checkPacingRatio,
  detectWaterChapter,
  generatePlotCheckPrompt,
  generateOutlineLLMPrompt,
  generateConsistencyLLMPrompt,
  generateWaterChapterLLMPrompt,
} from './plot-rules';
export type { NodeDependencyRule, PacingRatio, WaterChapterRule, ConsistencyCheck, OutlineGenerationRule } from './plot-rules';

// ============================================================
// v8.0 新增：生成时指导知识库（Coach模式）
// 不是"检查坏的开篇"，而是"告诉作者好的怎么写"
// ============================================================

// 开篇公式
export {
  OPENING_FORMULAS,
  recommendOpeningFormula,
  generateOpeningPrompt,
} from './opening-formulas';
export type { OpeningFormulaType, OpeningFormula, OpeningCaseStudy } from './opening-formulas';

// 问题滚动循环
export {
  QUESTION_CYCLE_MODELS,
  recommendQuestionCycle,
  generateQuestionCyclePrompt,
  analyzeQuestionDensity,
} from './question-cycle';
export type { QuestionType, QuestionNode, QuestionCycle, QuestionCycleType, QuestionCaseStudy } from './question-cycle';

// 情感曲线
export {
  EMOTION_CURVES,
  recommendEmotionCurve,
  generateEmotionCurvePrompt,
} from './emotion-curve';
export type { EmotionIntensity, EmotionType, EmotionBeat, EmotionCurve, EmotionCurveType, EmotionCaseStudy } from './emotion-curve';

// 战斗风格
export {
  BATTLE_STYLES,
  recommendBattleStyle,
  generateBattleStylePrompt,
} from './battle-styles';
export type { BattleStyleType, BattlePhase, BattleStyle, BattleCaseStudy } from './battle-styles';
