// ============================================================
// 生成器模块 — 共享接口
// ============================================================

/** 词汇提供者接口（替代 TypePackManager 的依赖） */
export interface VocabProvider {
  getVocab(packId: string): VocabData | undefined;
  getNamingRules(packId: string): NamingRules | undefined;
}

export interface VocabData {
  emotion_terms?: string[];
  [key: string]: unknown;
}

export interface NamingRules {
  surnames?: string[];
  male_chars?: string[];
  female_chars?: string[];
  neutral_chars?: string[];
  [key: string]: unknown;
}

/** 生成元素 */
export interface GeneratedElement {
  name?: string;
  narrative?: string;
  [key: string]: unknown;
}

/** 叙事上下文 */
export interface WritingContext {
  protagonist: {
    name: string;
    realm?: string;
    attributes?: string[];
  };
  location: string;
  volume?: number;
  chapter?: number;
  current_event?: string;
  [key: string]: unknown;
}

/** 对话轮次 */
export interface DialogueTurn {
  speaker: string;
  line: string;
  action: string;
  subtext: string;
}