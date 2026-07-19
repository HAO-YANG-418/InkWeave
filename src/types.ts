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
