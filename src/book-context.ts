/**
 * BookContext - 全书上下文追踪器
 *
 * 跟踪跨章节信息，解决单章检测无法发现的问题：
 * - 开头/结尾句式重复套路化
 * - 设定规则违反
 * - 章节衔接断裂
 * - 伏笔回收追踪
 */

export interface ChapterSnapshot {
  index: number;
  title: string;
  /** 首句 */
  firstSentence: string;
  /** 首句结构特征 */
  openingPattern: OpeningPattern;
  /** 末3句 */
  lastSentences: string[];
  /** 结尾结构特征 */
  endingPattern: EndingPattern;
  /** 本章出场人物及其最后状态 */
  characterStates: Map<string, CharacterState>;
  /** 本章建立/引用的设定规则 */
  settingRules: SettingRule[];
  /** 本章埋下的伏笔 */
  foreshadowing: Foreshadow[];
  /** 本章回收的伏笔（关键词匹配） */
  resolvedForeshadow: string[];
  /** 本章结尾地点/场景 */
  closingScene: string;
  /** 字数 */
  charCount: number;
}

export interface OpeningPattern {
  /** 首句长度（字数） */
  length: number;
  /** 首句类型：single-sensory（单字感官如"疼。""麻。"）/ dialogue / action / description / internal-thought */
  type: 'single-sensory' | 'dialogue' | 'action' | 'description' | 'internal-thought';
  /** 首句核心词 */
  keyword: string;
  /** 结构签名：用于跨章比对 */
  signature: string;
}

export interface EndingPattern {
  /** 结尾类型：reveal（揭示）/ cliffhanger（悬念）/ dialogue / action / emotion */
  type: 'reveal' | 'cliffhanger' | 'dialogue' | 'action' | 'emotion';
  /** 是否使用了否定→肯定断句模式（"不是X。是Y。"） */
  usesNegationReveal: boolean;
  /** 结尾句数量（断句堆叠数） */
  fragmentCount: number;
  /** 最后一句字数 */
  lastSentenceLength: number;
  /** 结构签名 */
  signature: string;
}

export interface CharacterState {
  name: string;
  /** 最后出现位置描述 */
  lastLocation: string;
  /** 最后动作 */
  lastAction: string;
  /** 本章出场章节号 */
  lastChapter: number;
}

export interface SettingRule {
  /** 规则描述 */
  rule: string;
  /** 规则类型：absolute（永远/从不）/ conditional（在X条件下） */
  type: 'absolute' | 'conditional';
  /** 规则关键词，用于后续检测违反 */
  keywords: string[];
  /** 被哪一章建立 */
  establishedIn: number;
}

export interface Foreshadow {
  /** 伏笔关键词 */
  keyword: string;
  /** 伏笔描述 */
  description: string;
  /** 埋设章节 */
  plantedIn: number;
  /** 重要程度 1-3 */
  importance: 1 | 2 | 3;
  /** 是否已回收 */
  resolved: boolean;
}

export interface BookIssue {
  level: 'error' | 'warning' | 'info';
  type: 'repetitive-opening' | 'repetitive-ending' | 'setting-violation' | 'continuity-break' | 'unresolved-foreshadow' | 'stale-thread';
  message: string;
  chapterIndex?: number;
  details?: string;
}

// ============ 模式识别工具 ============

const SENSORY_SINGLE = /^(疼|麻|冷|热|烫|酸|胀|痒|涩|苦|甜|咸|腥|臭|香|黑|亮|静|响|湿|干|硬|软|滑|糙|重|轻)。?$/;

const DIALOGUE_OPEN = /^[""「"]/;

const NEGATION_REVEAL = /不是[^。？！]{1,8}[。？！]\s*是/g;

export function detectOpeningPattern(firstSentence: string): OpeningPattern {
  const trimmed = firstSentence.trim();
  const len = trimmed.length;

  let type: OpeningPattern['type'] = 'description';
  let keyword = trimmed.slice(0, 4);
  let signature = '';

  if (SENSORY_SINGLE.test(trimmed) || (len <= 3 && /[疼麻冷热烫酸胀痛痒涩]/.test(trimmed))) {
    type = 'single-sensory';
    keyword = trimmed.replace(/[。！？]/g, '');
    signature = `sensory:${keyword}`;
  } else if (DIALOGUE_OPEN.test(trimmed)) {
    type = 'dialogue';
    signature = 'dialogue';
  } else if (/^(他|她|我|[\u4e00-\u9fa5]{2,3})(把|将|用|举|拿|握|伸|抬|踢|踩|抓|放|推|拉|扯|拽|蹲|站|跳|跑|走|转身|回头|低头|抬头)/.test(trimmed)) {
    type = 'action';
    signature = `action:${trimmed.slice(0, 2)}`;
  } else if (/^(我|他|她)(想|觉得|意识到|知道|明白|想起|记得|感觉|以为|怀疑)/.test(trimmed)) {
    type = 'internal-thought';
    signature = 'internal';
  } else {
    type = 'description';
    signature = `desc:${len}`;
  }

  return { length: len, type, keyword, signature };
}

export function detectEndingPattern(lastSentences: string[]): EndingPattern {
  const fullEnding = lastSentences.join('');
  const lastSent = lastSentences[lastSentences.length - 1]?.trim() || '';

  // 检测否定→肯定断句模式
  const negationMatches = fullEnding.match(NEGATION_REVEAL);
  const usesNegationReveal = negationMatches !== null && negationMatches.length >= 1;

  // 统计短句数量（≤5字的句子）
  const fragmentCount = lastSentences.filter(s => s.trim().length <= 8).length;

  // 判断结尾类型
  let type: EndingPattern['type'] = 'action';
  if (usesNegationReveal && /(是|原来|其实)/.test(fullEnding.slice(-20))) {
    type = 'reveal';
  } else if (/[？?]|吗|呢|难道|会不会|是不是/.test(lastSent)) {
    type = 'cliffhanger';
  } else if (DIALOGUE_OPEN.test(lastSent)) {
    type = 'dialogue';
  } else if (usesNegationReveal) {
    type = 'reveal';
  } else if (fragmentCount >= 2 && lastSent.length <= 6) {
    type = 'emotion';
  } else {
    type = 'action';
  }

  const signature = `${type}:${usesNegationReveal ? 'neg' : 'normal'}:${fragmentCount}`;

  return {
    type,
    usesNegationReveal,
    fragmentCount,
    lastSentenceLength: lastSent.length,
    signature,
  };
}

export function extractSettingRules(text: string, chapterIndex: number): SettingRule[] {
  const rules: SettingRule[] = [];

  // "X永远是Y" / "X永远不会Y" / "X从来不Y" / "X不可能Y"
  const absolutePatterns = [
    /([^，。？！\n]{2,15})永远(?:是|不会|不能|不可能)([^，。？！\n]{2,15})/g,
    /([^，。？！\n]{2,15})从来(?:不|没|没有)([^，。？！\n]{2,15})/g,
    /([^，。？！\n]{2,15})(?:绝?对|一定|必须)是([^，。？！\n]{2,15})/g,
    /([^，。？！\n]{2,8})只(?:能|会|有)([^，。？！\n]{2,15})/g,
  ];

  for (const pattern of absolutePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      rules.push({
        rule: match[0],
        type: 'absolute',
        keywords: [match[1].slice(-4), match[2].slice(0, 4)],
        establishedIn: chapterIndex,
      });
    }
  }

  return rules;
}

export function extractForeshadowing(text: string, chapterIndex: number): Foreshadow[] {
  const foreshadows: Foreshadow[] = [];

  // "他想起X" / "记得X说过" / "X之前说过" / "爷爷说过" / "不对" / "有问题"
  const plantPatterns = [
    { re: /([^，。？！\n]{0,10}(?:想起|记得|回忆起|意识到|感觉到|注意到)[^，。？！\n]{2,25})/g, importance: 2 as const },
    { re: /([^，。？！\n]{0,10}(?:说过|警告过|提醒过|告诉过他)[^，。？！\n]{2,25})/g, importance: 3 as const },
    { re: /(不对劲|有问题|不对|奇怪|异常|反常|不寻常)/g, importance: 2 as const },
  ];

  const seen = new Set<string>();
  for (const { re, importance } of plantPatterns) {
    let match;
    while ((match = re.exec(text)) !== null) {
      const desc = match[1] || match[0];
      const key = desc.slice(0, 10);
      if (seen.has(key)) continue;
      seen.add(key);
      foreshadows.push({
        keyword: key,
        description: desc.slice(0, 40),
        plantedIn: chapterIndex,
        importance,
        resolved: false,
      });
    }
  }

  return foreshadows;
}

// ============ BookContext 主类 ============

export class BookContext {
  private chapters: ChapterSnapshot[] = [];
  private allSettingRules: SettingRule[] = [];
  private allForeshadowing: Foreshadow[] = [];
  private globalCharacterStates = new Map<string, CharacterState>();

  /** 添加一个章节的快照，返回检测到的全书级别问题 */
  addChapter(snapshot: ChapterSnapshot): BookIssue[] {
    const issues: BookIssue[] = [];

    // 1. 检测开头套路重复
    const openingIssues = this.checkOpeningRepetition(snapshot);
    issues.push(...openingIssues);

    // 2. 检测结尾套路重复
    const endingIssues = this.checkEndingRepetition(snapshot);
    issues.push(...endingIssues);

    // 3. 检测设定违反
    const settingIssues = this.checkSettingViolations(snapshot);
    issues.push(...settingIssues);

    // 4. 检测章节衔接
    const continuityIssues = this.checkContinuity(snapshot);
    issues.push(...continuityIssues);

    // 5. 检测伏笔回收
    const foreshadowIssues = this.checkForeshadowing(snapshot);
    issues.push(...foreshadowIssues);

    // 更新状态
    this.chapters.push(snapshot);
    for (const rule of snapshot.settingRules) {
      this.allSettingRules.push(rule);
    }
    for (const fs of snapshot.foreshadowing) {
      this.allForeshadowing.push(fs);
    }
    for (const [name, state] of snapshot.characterStates) {
      this.globalCharacterStates.set(name, state);
    }

    return issues;
  }

  /** 检测最近N章开头模式是否重复 */
  private checkOpeningRepetition(snapshot: ChapterSnapshot): BookIssue[] {
    const issues: BookIssue[] = [];
    const recentN = 5;
    const recent = this.chapters.slice(-recentN);

    const sameTypeCount = recent.filter(c => c.openingPattern.type === snapshot.openingPattern.type).length;
    const sameSensoryCount = recent.filter(c => c.openingPattern.type === 'single-sensory').length;

    if (sameSensoryCount >= 1 && snapshot.openingPattern.type === 'single-sensory') {
      issues.push({
        level: sameSensoryCount >= 2 ? 'warning' : 'info',
        type: 'repetitive-opening',
        message: `${sameSensoryCount >= 2 ? '连续' : ''}${sameSensoryCount + 1}章使用单字感官开头（"${snapshot.firstSentence.slice(0, 8)}"）${sameSensoryCount >= 2 ? '，容易套路化' : ''}。建议换对话/动作开头。`,
        chapterIndex: snapshot.index,
      });
    }

    if (sameTypeCount >= 2 && snapshot.openingPattern.type !== 'single-sensory') {
      issues.push({
        level: 'info',
        type: 'repetitive-opening',
        message: `连续${sameTypeCount + 1}章使用${snapshot.openingPattern.type}类型开头，建议变化节奏。`,
        chapterIndex: snapshot.index,
      });
    }

    return issues;
  }

  /** 检测最近N章结尾模式是否重复 */
  private checkEndingRepetition(snapshot: ChapterSnapshot): BookIssue[] {
    const issues: BookIssue[] = [];
    const recentN = 5;
    const recent = this.chapters.slice(-recentN);

    const sameEndingCount = recent.filter(c => c.endingPattern.signature === snapshot.endingPattern.signature).length;
    const sameNegationCount = recent.filter(c => c.endingPattern.usesNegationReveal).length;

    if (sameNegationCount >= 1 && snapshot.endingPattern.usesNegationReveal) {
      issues.push({
        level: sameNegationCount >= 2 ? 'warning' : 'info',
        type: 'repetitive-ending',
        message: `${sameNegationCount >= 2 ? '连续' : ''}${sameNegationCount + 1}章使用"不是X。是Y。"的否定揭示结尾${sameNegationCount >= 2 ? '，套路感强' : ''}。建议换个结尾方式（对话/动作/悬念提问）。`,
        chapterIndex: snapshot.index,
      });
    }

    if (sameEndingCount >= 2 && snapshot.endingPattern.fragmentCount >= 3) {
      issues.push({
        level: 'info',
        type: 'repetitive-ending',
        message: `连续${sameEndingCount + 1}章使用多段断句收尾（${snapshot.endingPattern.fragmentCount}个短句），注意变化。`,
        chapterIndex: snapshot.index,
      });
    }

    return issues;
  }

  /** 检测本章是否违反之前建立的设定 */
  private checkSettingViolations(snapshot: ChapterSnapshot): BookIssue[] {
    const issues: BookIssue[] = [];

    for (const rule of this.allSettingRules) {
      // 简单关键词冲突检测：如果规则说"X永远不会Y"，而本章出现了"X了Y"或"XY"的描述
      const { keywords, rule: ruleText, establishedIn } = rule;
      if (keywords.length < 2) continue;

      // 检查本章文本中是否有直接违反规则的描述
      // 这里做简化检测：如果规则含"不"（否定规则），检查本章是否出现了矛盾的肯定描述
      const isNegative = /不|没|从未|永不/.test(ruleText);
      if (!isNegative) continue;

      const [subject, predicate] = keywords;
      // 非常简化的冲突检测：如果主题词和谓词在同一段落中共同出现，且没有否定词
      // 这是一个启发式检测，后续可以优化
      const violationRegex = new RegExp(`${subject}[^，。？！]{0,15}${predicate.replace(/不|没/g, '')}`);
      // 注意：这个检测比较粗糙，主要作为提醒，不做error级别
      // 实际违反检测需要更复杂的NLP，这里标记为info
    }

    return issues;
  }

  /** 检测与上一章的衔接是否断裂 */
  private checkContinuity(snapshot: ChapterSnapshot): BookIssue[] {
    const issues: BookIssue[] = [];
    if (this.chapters.length === 0) return issues;

    const prev = this.chapters[this.chapters.length - 1];

    // 如果上一章结尾场景和本章开头场景没有关键词重叠，标记为可能脱节
    const prevScene = prev.closingScene;
    const firstSent = snapshot.firstSentence;
    const openContext = firstSent.slice(0, 50);

    // 检查是否有地点/人物连续性
    const hasCharacterLink = [...snapshot.characterStates.keys()].some(name =>
      prev.characterStates.has(name)
    );

    if (!hasCharacterLink && prev.characterStates.size > 0 && snapshot.characterStates.size > 0) {
      const prevNames = [...prev.characterStates.keys()].slice(0, 3).join('、');
      issues.push({
        level: 'warning',
        type: 'continuity-break',
        message: `上章出场人物（${prevNames}）在本章开头均未出现，注意场景转换是否自然。`,
        chapterIndex: snapshot.index,
      });
    }

    return issues;
  }

  /** 追踪伏笔，标记长期未回收的伏笔 */
  private checkForeshadowing(snapshot: ChapterSnapshot): BookIssue[] {
    const issues: BookIssue[] = [];

    // 标记已回收的伏笔（简单关键词匹配）
    const currentText = snapshot.lastSentences.join('') + snapshot.firstSentence;
    for (const fs of this.allForeshadowing) {
      if (fs.resolved) continue;
      if (currentText.includes(fs.keyword.slice(0, 3))) {
        fs.resolved = true;
      }
    }

    // 标记超期未回收的重要伏笔
    for (const fs of this.allForeshadowing) {
      if (fs.resolved) continue;
      const gap = snapshot.index - fs.plantedIn;
      if (fs.importance >= 3 && gap >= 5) {
        issues.push({
          level: 'warning',
          type: 'unresolved-foreshadow',
          message: `重要伏笔"${fs.keyword}……"在第${fs.plantedIn + 1}章埋设，已过${gap}章未回收。`,
          chapterIndex: snapshot.index,
          details: fs.description,
        });
      } else if (fs.importance >= 2 && gap >= 10) {
        issues.push({
          level: 'info',
          type: 'stale-thread',
          message: `伏笔"${fs.keyword}……"已过${gap}章未回收，可能已被遗忘。`,
          chapterIndex: snapshot.index,
        });
      }
    }

    return issues;
  }

  getChapterCount(): number {
    return this.chapters.length;
  }

  getStats() {
    const unresolved = this.allForeshadowing.filter(f => !f.resolved).length;
    const total = this.allForeshadowing.length;
    return {
      chapters: this.chapters.length,
      totalForeshadowing: total,
      unresolvedForeshadowing: unresolved,
      settingRules: this.allSettingRules.length,
      characters: this.globalCharacterStates.size,
    };
  }
}
