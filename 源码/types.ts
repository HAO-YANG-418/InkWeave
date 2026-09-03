// ============================================================
// GWE (Generic Web-novel Engine) 通用网文引擎 - 核心类型定义
// 节点化架构 V3.0（追读力增强版）
// ============================================================

// === 节点与选项 ===

export type NodeCategory = 'style' | 'vocab' | 'rule' | 'ai';

export interface NodeDefinition {
  readonly id: NodeId;
  readonly name: string;
  readonly category: NodeCategory;
  readonly description: string;
  readonly required: boolean;
  readonly defaultOptionId: string;
  readonly options: OptionId[];
}

export type NodeId =
  | 'node_sentence_rhythm'
  | 'node_paragraph_density'
  | 'node_dialogue_style'
  | 'node_description_style'
  | 'node_battle_style'
  | 'node_emotion_style'
  | 'node_tone'
  | 'node_platform'
  | 'node_info_density'
  | 'node_payoff_frequency'
  | 'node_pov'
  | 'node_rhetoric'
  | 'node_vocab_sensory'
  | 'node_vocab_filler'
  | 'node_target_length'
  | 'node_anchor_density'
  | 'node_strictness'
  | 'node_opening_impact'
  | 'node_twist_frequency'
  | 'node_ending_hook'
  | 'node_ai_creativity'
  | 'node_ai_continue_length';

export type OptionId = string;

/** 节点选项 .kb.json 文件格式 */
export interface NodeOptionKB {
  readonly kb_version: '2.0' | '3.0';
  readonly node_id: NodeId;
  readonly option_id: OptionId;
  readonly option_name: string;
  readonly option_description: string;

  /** 词汇表：词库类节点使用，其他节点可为空 */
  readonly vocabulary?: {
    readonly add?: {
      readonly bodyParts?: string[];
      readonly sensoryVerbs?: string[];
      readonly environmentSignals?: string[];
      readonly actionVerbs?: string[];
      readonly fillerPatterns?: string[];
      readonly dialogueTags?: string[];
      readonly worldTerms?: string[];
      readonly [category: string]: string[] | undefined;
    };
    readonly remove?: string[];
  };

  /** 检测阈值覆盖 */
  readonly threshold_overrides?: Partial<Thresholds>;

  /** 雷达权重调整（乘系数） */
  readonly radar_weights?: Partial<RadarWeights>;

  /** 启用/禁用检测项 */
  readonly checks?: {
    readonly disable?: string[];
    readonly enable?: string[];
  };

  /** AI系统提示词（注入到system prompt） */
  readonly system_prompt?: string;

  /** 示例段落（给用户预览，也作为AI的few-shot） */
  readonly examples?: Array<{
    readonly text: string;
    readonly note?: string;
  }>;

  /** 约束：AI必须遵守的硬规则 */
  readonly constraints?: string[];

  /** 依赖：必须同时选中这些选项才能生效 */
  readonly requires?: OptionId[];

  /** 冲突：不能和这些选项同时选中 */
  readonly conflicts?: OptionId[];
}

// === 检测阈值 ===

export interface Thresholds {
  // 锚点相关
  minAnchors: number;              // 单章最少身体锚点数
  anchorsPerWords: number;         // 每多少字至少1个锚点
  maxAnchorGap: number;            // 锚点之间最大字数间隔

  // 填充词相关
  maxFillerSentences: number;      // 填充词句数上限（每千字）
  maxFillerWords: number;          // 填充词个数上限（每千字）
  maxDashCount: number;            // 破折号数量上限（每千字）
  maxEllipsisCount: number;        // 省略号数量上限（每千字）

  // 段落相关
  maxParagraphLength: number;      // 单段最大字数
  targetParagraphLength: number;   // 目标段落长度
  minParagraphCount: number;       // 单章最少段落数

  // 对话相关
  maxDialogueContinuous: number;   // 连续对话最大句数（无动作穿插）
  maxDialogueTagRepeat: number;    // 对话标签重复上限（如连续"XX道"）

  // 句子节奏
  maxSentenceLength: number;       // 单句最大字数
  targetSentenceLength: number;    // 目标句长
  shortSentenceRatio: number;      // 短句占比目标

  // 信息密度
  maxExpositionContinuous: number; // 连续说明/铺垫最大字数
  infoPointsPerThousand: number;   // 每千字新信息点数

  // 五感
  minSensoryTypes: number;         // 每场景最少激活感官类型数
  sightRatio: number;              // 视觉描写占比上限

  // 句式约束
  notShiErrorMin?: number;         // "不是X是Y"句式达到此数量才报 error（默认3，方案B口径）
  maxSmoothnessViolations?: number; // 单章顺滑度违规上限，超出部分报 error（默认3，①-C D-SMOOTH 口径）

  // === ③ 阶段二 KB 阈值收敛（落点 A）：16 项 V3.2 泛用化检测阈值，全部可选，缺失时由 check 内部 ?? 默认兜底 ===
  commaChainRatioWarn?: number;      // 逗号/句号比超此值→一逗到底 warning（原 3.2）
  commaChainLongMax?: number;        // 单句逗号数≥此值→逗号链 info（原 8）
  minChapterWords?: number;          // 章节字数硬下限：低于此值一律 error 判写空（不论密度，"短而密"不再豁免；接 ③ 2E 单一标定源：知识库/阈值标定/default.json）
  dataAnchorDensityMax?: number;     // 数据锚点密度>此值/千字→info（原 5）
  dataAnchorDensityMin?: number;     // 数据锚点密度<此值且长文→具体感不足 info（原 0.5）
  exclamationWarnThreshold?: number; // 感叹号>此值→warning（原 10）
  exclamationInfoThreshold?: number; // 感叹号>此值→info（原 5）
  forbiddenCharWarnCount?: number;   // 禁用字计数>此值→warning，否则 info（原 5）
  sentenceWaveStdDevMin?: number;    // 句长标准差<此值且均值>阈值→节奏单调 warning（原 5）
  sentenceWaveMeanMin?: number;      // 句长均值下限（与 StdDev 同判，原 10）
  sentenceWaveSameRunMax?: number;   // 连续同长度句数≥此值→info（原 5）
  senseDensityMin?: number;          // 感官词密度<此值且长文→warning（原 0.02）
  senseBalanceRatioMax?: number;     // 五感最大/最小比>此值→分布不均 info（原 5）
  characterVoiceSkipRatio?: number;  // 对话占比<此值→跳过角色台词检测（原 0.05）
  characterVoiceTagMin?: number;     // 对话标签种类<此值且对话占比高→warning（原 3）
  characterVoiceRatioMax?: number;   // 对话占比>此值触发角色台词差异化检测（原 0.15）
  actionRollcallRepeatMax?: number;    // 单动作词出现次数≥此值→重复点名 warning（原 5）

  // === ③ 阶段二 2E：14 项去AI味/追读力质量检查阈值（13 函数外置，#14 unnecessary_english 纯词表跳过），全部可选，?? 默认兜底 ===
  clicheReactionReportCap?: number;       // 套路反应最多报告条数（原 3）
  fragmentedShortLen?: number;            // 碎句病：短句字数上限（原 12）
  fragmentedMinSentences?: number;         // 碎句病：段内最少句数才检测（原 3）
  fragmentedConsecutiveMin?: number;       // 碎句病：连续短句达此数才报（原 3）
  fragmentedMaxReports?: number;           // 碎句病：最多报几个（原 2）
  dialogueConflictRatioMin?: number;       // 对话碰撞：对话占比下限才检测（原 0.05）
  dialogueConflictMinCount?: number;        // 对话碰撞：对话句数下限（原 4）
  golden300MinChars?: number;              // 黄金300字：前N字才检测（原 300）
  golden300FirstSentenceMax?: number;       // 黄金300字：首句超此字告警（原 35）
  openingTaboosWindow?: number;             // 开篇禁忌：扫前N字（原 150）
  openingTaboosSelfIntroWindow?: number;    // 开篇禁忌：自我介绍扫前N字（原 80）
  fakeHookZoneWindow?: number;             // 假钩子：扫末N字（原 200）
  clichePhraseCountWarn?: number;           // 空洞成语：≥此数 warning（原 3）
  clichePhraseCountError?: number;          // 空洞成语：≥此数 error（原 5）
  clichePhraseDensityMax?: number;          // 空洞成语：千字密度上限（原 2.5）
  openingSceneWindow?: number;              // 开篇写景：前N字（原 200）
  openingSceneSceneCountMin?: number;        // 开篇写景：写景词≥此数才报（原 3）
  fakeReactionCountMin?: number;            // 假反应：≥此数才报（原 3）
  fakeReactionDensityMax?: number;          // 假反应：千字密度上限（原 2）
  repetitionMinParaLen?: number;            // 重复：段长下限才检测（原 8）
  repetitionMinSentLen?: number;            // 重复：句长下限（原 10）
  repetitionSimilarityMax?: number;         // 重复：相似度上限（原 0.75）
  repetitionMinSentPairLen?: number;         // 重复：句对长度下限（原 15）
  sensoryBalanceMinChars?: number;          // 五感平衡：章节最短字数（原 500）
  sensoryBalanceMinSenses?: number;          // 五感平衡：最少感官数（原 3）
  sensoryBalanceLongChars?: number;          // 五感平衡：长文须有体感字数（原 800）
  hookConcretenessMinChars?: number;        // 钩子具体性：章节最短字数（原 500）
  hookConcretenessZoneWindow?: number;       // 钩子具体性：扫末N字（原 200）
  hookConcretenessSimileLenMax?: number;     // 钩子具体性：末句含"像"且<此字告警（原 20）
  similePerParaMax?: number;                // 比喻密度：同段≥此数告警（原 2）
  simileParaMaxLen?: number;                // 比喻密度：段长上限（原 200）
  simileDensityMax?: number;                // 比喻密度：千字上限（原 5）
  simileParaMinLen?: number;                // 比喻密度：段落最小字数过滤（原 20）
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  minAnchors: 4,
  anchorsPerWords: 500,
  maxAnchorGap: 800,
  maxFillerSentences: 3,
  maxFillerWords: 8,
  maxDashCount: 1,  // V3.1：破折号几乎禁用，每千字最多1个（对话打断用），用逗号替代
  maxEllipsisCount: 3,
  maxParagraphLength: 200,
  targetParagraphLength: 80,
  minParagraphCount: 20,
  maxDialogueContinuous: 4,
  maxDialogueTagRepeat: 2,
  maxSentenceLength: 60,
  targetSentenceLength: 22,
  shortSentenceRatio: 0.4,
  maxExpositionContinuous: 300,
  infoPointsPerThousand: 3,
  minSensoryTypes: 2,
  sightRatio: 0.6,
  maxSmoothnessViolations: 3, // ①-C D-SMOOTH 默认上限（对齐 notShiErrorMin 方案B口径）

  // === ③ 阶段二 KB 阈值收敛（落点 A）：16 项默认值=原硬编码魔法数，行为零变化（可被 知识库/阈值标定/default.json 覆盖） ===
  commaChainRatioWarn: 3.2,
  commaChainLongMax: 8,
  minChapterWords: 2100,          // 原 2000；2026-08-29 按方案 B 与 CLI 验收下限（0.7×3000）对齐
  dataAnchorDensityMax: 5,
  dataAnchorDensityMin: 0.5,
  exclamationWarnThreshold: 10,
  exclamationInfoThreshold: 5,
  forbiddenCharWarnCount: 5,
  sentenceWaveStdDevMin: 5,
  sentenceWaveMeanMin: 10,
  sentenceWaveSameRunMax: 5,
  senseDensityMin: 0.045,          // 2026-08-29 重标定：原 0.02 对裂日全集恒低于真实分布(min 38/千字→0.038)，sense_density_low 成死警告；0.045≈45/千字仅标最稀尾部(warning 级、不拦门禁)
  senseBalanceRatioMax: 5,
  characterVoiceSkipRatio: 0.05,
  characterVoiceTagMin: 3,
  characterVoiceRatioMax: 0.15,
  actionRollcallRepeatMax: 5,

  // === ③ 阶段二 2E：默认值=原硬编码魔法数，行为零变化（可被 知识库/阈值标定/default.json 覆盖） ===
  clicheReactionReportCap: 3,
  fragmentedShortLen: 12,
  fragmentedMinSentences: 3,
  fragmentedConsecutiveMin: 3,
  fragmentedMaxReports: 2,
  dialogueConflictRatioMin: 0.05,
  dialogueConflictMinCount: 4,
  golden300MinChars: 300,
  golden300FirstSentenceMax: 35,
  openingTaboosWindow: 150,
  openingTaboosSelfIntroWindow: 80,
  fakeHookZoneWindow: 200,
  clichePhraseCountWarn: 3,
  clichePhraseCountError: 5,
  clichePhraseDensityMax: 2.5,
  openingSceneWindow: 200,
  openingSceneSceneCountMin: 3,
  fakeReactionCountMin: 3,
  fakeReactionDensityMax: 2,
  repetitionMinParaLen: 8,
  repetitionMinSentLen: 10,
  repetitionSimilarityMax: 0.75,
  repetitionMinSentPairLen: 15,
  sensoryBalanceMinChars: 500,
  sensoryBalanceMinSenses: 3,
  sensoryBalanceLongChars: 800,
  hookConcretenessMinChars: 500,
  hookConcretenessZoneWindow: 200,
  hookConcretenessSimileLenMax: 20,
  similePerParaMax: 2,
  simileParaMaxLen: 200,
  simileDensityMax: 5,
  simileParaMinLen: 20
};

// === 雷达权重 ===

export interface RadarWeights {
  bodyReaction: number;      // 身体反应/锚点
  sensorySignal: number;     // 感官信号/环境
  action: number;            // 动作推进
  emotion: number;           // 情感浓度
  infoAdvance: number;       // 信息推进
  twistFrequency: number;    // V3: 信息反咬/转折密度
  hookStrength: number;      // V3: 章末钩子强度
}

export const DEFAULT_RADAR_WEIGHTS: RadarWeights = {
  bodyReaction: 1.0,
  sensorySignal: 1.0,
  action: 1.0,
  emotion: 1.0,
  infoAdvance: 1.0,
  twistFrequency: 1.0,
  hookStrength: 1.0,
};

// === 预设包 ===

export interface Preset {
  readonly preset_id: string;
  readonly preset_name: string;
  readonly preset_description: string;
  readonly based_on: string | null;

  /** 节点选项选择 */
  readonly selections: Record<NodeId, OptionId>;

  /** 预设追加词库 */
  readonly extra_vocab?: NodeOptionKB['vocabulary'];

  /** 预设追加提示词 */
  readonly extra_prompt?: string;

  /** 预设追加约束 */
  readonly extra_constraints?: string[];

  /** 预设专属规则（正则/自定义检查） */
  readonly extra_rules?: CustomRule[];

  /** 预设阈值覆盖 */
  readonly threshold_overrides?: Partial<Thresholds>;

  /** 封面/标签 */
  readonly tags?: string[];
}

export interface CustomRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly pattern?: string;       // 正则模式
  readonly check?: (text: string) => RuleViolation | null;
  readonly injectToPrompt?: boolean;
}

// === 引擎配置 ===

export interface EngineConfig {
  presetId: string | null;
  selections: Record<NodeId, OptionId>;
  userOverrides: UserOverrides;
}

export interface UserOverrides {
  thresholds?: Partial<Thresholds>;
  vocab?: NodeOptionKB['vocabulary'];
  prompt?: string;
  rules?: CustomRule[];
  targetLength?: number;
}

// === 写作上下文（书籍数据）===

export interface WritingContext {
  book: BookMeta;
  characters: Character[];
  settings: Setting[];
  volumes?: Volume[];
  chapters: Chapter[];
  subplots?: Subplot[];
  currentChapterId: string;
  cursorPosition: number;
  selection: TextSelection | null;
}

export interface BookMeta {
  id: string;
  title: string;
  author?: string;
  synopsis?: string;
  tags?: string[];
}

export interface Character {
  id: string;
  name: string;
  aliases?: string[];
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  tags?: string[];
  description?: string;
  background?: string;
  relationships?: CharacterRelationship[];
  speechStyle?: string;
  attributes?: Record<string, unknown>;
}

export interface CharacterRelationship {
  targetId: string;
  type: string;
  description?: string;
}

export interface Setting {
  id: string;
  name: string;
  type: 'world' | 'location' | 'faction' | 'system' | 'item' | 'other';
  description: string;
  attributes?: Record<string, unknown>;
}

export interface Volume {
  id: string;
  title: string;
  number: number;
  summary?: string;
}

export interface Chapter {
  id: string;
  title: string;
  number: number;
  volumeId?: string;
  content: string;
  wordCount: number;
  summary?: string;
  status: 'draft' | 'writing' | 'done';
}

export interface Subplot {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'foreshadowing' | 'resolved';
  relatedCharacterIds?: string[];
}

export interface TextSelection {
  from: number;
  to: number;
  text: string;
}

// === 检测结果 ===

export interface CheckResult {
  score: number;                    // 综合得分 0-100
  radarScores: RadarScores;         // 7维雷达得分（V3）
  violations: RuleViolation[];      // 违规项
  stats: TextStats;                 // 文本统计
  passed: boolean;                  // 是否通过（无error级违规）
}

export interface RadarScores {
  bodyReaction: number;   // 0-100
  sensorySignal: number;
  action: number;
  emotion: number;
  infoAdvance: number;
  twistFrequency: number; // V3: 信息反咬/转折密度
  hookStrength: number;   // V3: 章末钩子强度
}

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  position?: { from: number; to: number };
  suggestion?: string;
}

export interface TextStats {
  totalChars: number;
  totalWords: number;         // 中文字数
  paragraphCount: number;
  avgParagraphLength: number;
  sentenceCount: number;
  avgSentenceLength: number;
  shortSentenceRatio: number;
  anchorCount: number;
  fillerCount: number;
  dialogueRatio: number;
  sensoryMentions: Record<string, number>;
}

// === LLM Provider ===

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface LLMRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface StreamCallbacks {
  onToken: (delta: string) => void;
  onDone: (fullContent: string, usage?: LLMUsage) => void;
  onError: (error: Error) => void;
}

export interface LLMProvider {
  readonly name: string;
  chat(request: LLMRequest): Promise<{ content: string; usage?: LLMUsage }>;
  stream(request: LLMRequest, callbacks: StreamCallbacks): Promise<void>;
}

// === 引擎事件 ===

export type EngineEventType =
  | 'config:changed'
  | 'config:validated'
  | 'preset:loaded'
  | 'preset:saved'
  | 'preset:deleted'
  | 'check:done'
  | 'ai:token'
  | 'ai:done'
  | 'ai:error'
  | 'rule:violation';

export interface EngineEvent {
  type: EngineEventType;
  payload?: unknown;
}

export type EngineEventListener = (event: EngineEvent) => void;

// === 冲突/依赖验证结果 ===

export interface ValidationResult {
  valid: boolean;
  conflicts: ConflictInfo[];
  missingDeps: DependencyInfo[];
}

export interface ConflictInfo {
  optionA: OptionId;
  optionB: OptionId;
  nodeA: NodeId;
  nodeB: NodeId;
  message: string;
}

export interface DependencyInfo {
  optionId: OptionId;
  nodeId: NodeId;
  requiredOption: OptionId;
  message: string;
}

// === 合并后的运行时配置（内部使用）===

export interface MergedConfig {
  thresholds: Thresholds;
  radarWeights: RadarWeights;
  vocabulary: MergedVocabulary;
  systemPrompts: string[];
  constraints: string[];
  examples: Array<{ text: string; note?: string }>;
  extraRules: CustomRule[];
  disabledChecks: Set<string>;
  enabledChecks: Set<string>;
  /** 主角名（per-work）：接 project/kb 配置，消硬编码；生成侧经 ReflectionConfig 注入，CLI 侧经 project-config 注入；缺省时检测层用默认 '林深' */
  protagonistName?: string;
}

export interface MergedVocabulary {
  bodyParts: Set<string>;
  sensoryVerbs: Set<string>;
  environmentSignals: Set<string>;
  actionVerbs: Set<string>;
  fillerPatterns: Set<string>;
  dialogueTags: Set<string>;
  worldTerms: Set<string>;
  [category: string]: Set<string>;
}
