/* ============================================================
   GWE v4.0 — 写作上下文核心类型
   从narrative-engine提炼，作为写作+检测双引擎的统一数据模型
   ============================================================ */

/* ============ 基础实体类型 ============ */

/** 角色 */
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
  type: 'friend' | 'enemy' | 'family' | 'lover' | 'mentor' | 'rival' | string;
  description?: string;
  strength?: number;
}

/** 世界观设定 */
export interface Setting {
  id: string;
  name: string;
  category: 'world' | 'power' | 'geography' | 'item' | 'faction' | 'custom';
  description: string;
  rules?: string[];
  relatedChars?: string[];
  attributes?: Record<string, unknown>;
}

/** 章节 */
export interface Chapter {
  id: string;
  title: string;
  number: number;
  volumeId?: string;
  content: string;
  wordCount: number;
  status: 'draft' | 'writing' | 'reviewing' | 'done';
  summary?: string;
  authorNote?: string;
  charactersAppeared?: string[];
  settingsReferenced?: string[];
  /** 章末状态快照（人物位置/场景/未解决悬念） */
  endingState?: ChapterEndingState;
  metadata?: Record<string, unknown>;
}

/** 章末状态快照 - 解决章节衔接问题的关键 */
export interface ChapterEndingState {
  /** 章末场景/地点 */
  location?: string;
  /** 在场人物 */
  presentCharacters?: string[];
  /** 正在进行的动作/事件 */
  ongoingAction?: string;
  /** 未解决的悬念/钩子（下一章需要回应） */
  pendingHooks?: string[];
  /** 时间线位置（如"第三天凌晨"） */
  timeline?: string;
}

/** 卷 */
export interface Volume {
  id: string;
  title: string;
  description?: string;
  order: number;
}

/** 伏笔/线索追踪 */
export interface Foreshadow {
  id: string;
  keyword: string;
  description: string;
  plantedInChapter: number;
  /** 计划在第几章回收（-1表示未定） */
  plannedResolveChapter?: number;
  resolvedInChapter?: number;
  importance: 1 | 2 | 3;
  status: 'planted' | 'growing' | 'resolved' | 'forgotten';
}

/** 支线 */
export interface Subplot {
  id: string;
  title: string;
  volumeId?: string;
  description?: string;
  status: 'planned' | 'active' | 'resolved';
  involvedChars?: string[];
}

/** 书籍/项目 */
export interface Book {
  id: string;
  title: string;
  genre: string;
  author?: string;
  synopsis?: string;
  tags?: string[];
  styleConfig?: StyleConfig;
  worldPremise?: string;
  globalRules?: WritingRule[];
}

/* ============ 写作规则 ============ */

export interface WritingRule {
  id: string;
  name: string;
  description: string;
  type: 'regex' | 'count' | 'keyword' | 'custom';
  severity: 'error' | 'warning' | 'info';
  pattern?: string;
  maxMatches?: number;
  minWords?: number;
  maxWords?: number;
  requiredKeywords?: string[];
  forbiddenKeywords?: string[];
  check?: (content: string, context?: WritingContext) => RuleViolation | null;
  injectToPrompt?: boolean;
}

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  position?: { from: number; to: number };
  suggestion?: string;
}

/* ============ 风格配置 ============ */

export interface StyleConfig {
  /** 文风基调 0(冷峻)-1(热烈) */
  tone: number;
  /** 视角 */
  pov: 'first' | 'third-limited' | 'third-omniscient';
  /** 节奏 0(慢铺陈)-1(快推进) */
  pace: number;
  /** 对话比例 0-1 */
  dialogRatio: number;
  /** 描写密度 0(白描)-1(浓墨) */
  descriptionDensity: number;
  /** 文白比例 0(白话)-1(文言) */
  classicalRatio: number;
  /** 幽默感 0(严肃)-1(诙谐) */
  humor: number;
  /** 自定义风格指令 */
  customInstructions?: string;
}

/* ============ 写作上下文（核心数据结构） ============ */

export interface WritingContext {
  book: Book;
  characters: Character[];
  settings: Setting[];
  volumes: Volume[];
  subplots: Subplot[];
  chapters: Chapter[];
  foreshadows: Foreshadow[];
  currentChapterId: string | null;
  cursorPosition: number;
  selection: { from: number; to: number; text: string } | null;
  recentMessages?: ChatMessage[];
  /** 最近使用的开头/结尾模式（防止套路重复） */
  recentPatterns?: {
    openingTypes: string[];
    endingTypes: string[];
    negationRevealStreak: number;
    sensoryOpeningStreak: number;
  };
  /** v10.0: 反模式追踪 — 章类型历史 */
  chapterTypeHistory?: Array<{
    chapterNumber: number;
    chapterTitle: string;
    type: string;
    confidence: number;
    detectedBy: 'llm' | 'rule';
  }>;
  /** v10.0: 反模式追踪 — 冲突历史 */
  conflictHistory?: Array<{
    chapterNumber: number;
    primaryConflict: string;
    secondaryConflicts: string[];
    resolution: string;
    confidence: number;
    detectedBy: 'llm' | 'rule';
  }>;
  /** v10.0: 反模式追踪 — 模板组合历史 */
  templateComboHistory?: Array<{
    chapterNumber: number;
    comboId: string;
  }>;
  extra?: Record<string, unknown>;
}

/* ============ LLM抽象层 ============ */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type CapabilityId =
  | 'continue'
  | 'rewrite'
  | 'review'
  | 'outline'
  | 'dialog'
  | 'consistency'
  | 'polish'
  | 'expand'
  | 'compress'
  | 'suggest-technique';

export interface CapabilityParams {
  rewriteMode?: 'polish' | 'dialog' | 'expand' | 'compress';
  reviewType?: 'full' | 'ai-flavor' | 'contradiction' | 'foreshadowing' | 'pacing' | 'custom';
  speakerId?: string;
  targetWords?: number;
  userInstruction?: string;
  [key: string]: unknown;
}

/* ============ 插件系统 ============ */

export interface EnginePlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  install(api: EnginePluginApi): void | Promise<void>;
}

export interface EnginePluginApi {
  registerRule(rule: WritingRule): void;
  registerCapability(cap: unknown): void;
  registerCharacterPreset(preset: Partial<Character>): void;
  registerSettingPreset(preset: Partial<Setting>): void;
  extendPromptTemplate(templateId: string, injector: PromptInjector): void;
  registerStylePreset(name: string, config: Partial<StyleConfig>): void;
}

export type PromptInjector = (context: WritingContext, basePrompt: string) => string;

/* ============ 引擎配置 ============ */

export interface EngineConfig {
  defaultStyle: StyleConfig;
  contextWindowChars: number;
  continueContextChars: number;
  enableLocalRules: boolean;
  maxChatHistoryTurns: number;
  temperature: number;
  /** 防套路重复：连续N章相同模式即警告 */
  patternWarnStreak: number;
  [key: string]: unknown;
}

/* ============ 写作预设（类型+风格+规则+设定的打包） ============ */

export interface WritingPreset {
  id: string;
  name: string;
  genre: string;
  description: string;
  styleConfig: Partial<StyleConfig>;
  worldPremise?: string;
  rules?: WritingRule[];
  baseCharacters?: Character[];
  baseSettings?: Setting[];
  extraPrompt?: string;
  extraConstraints?: string[];
}
