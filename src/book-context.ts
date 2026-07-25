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

  /**
   * 生成跨章警告（v7.0）
   * 在续写下一章时调用，从已有章节快照中提取需要警告的问题
   * 返回人类可读的警告文本，供注入到续写 Prompt 中
   */
  getCrossChapterWarnings(): string[] {
    const warnings: string[] = [];

    if (this.chapters.length === 0) return warnings;

    const recent = this.chapters.slice(-5);

    // 1. 开头模式重复检测
    const recentOpenings = recent.map(c => c.openingPattern);
    const lastOpening = recentOpenings[recentOpenings.length - 1];
    if (lastOpening) {
      const sameTypeCount = recentOpenings.filter(o => o.type === lastOpening.type).length;
      if (sameTypeCount >= 3) {
        warnings.push(`最近${sameTypeCount}章中有${sameTypeCount}章使用"${lastOpening.type}"类型开头，本章必须换一种开头方式`);
      }
      if (lastOpening.type === 'single-sensory') {
        const sensoryCount = recentOpenings.filter(o => o.type === 'single-sensory').length;
        if (sensoryCount >= 2) {
          warnings.push(`最近${sensoryCount}章连续使用单字感官开头（如"疼。""冷。"），本章严禁再用，换对话/动作开头`);
        }
      }
    }

    // 2. 结尾模式重复检测
    const recentEndings = recent.map(c => c.endingPattern);
    const lastEnding = recentEndings[recentEndings.length - 1];
    if (lastEnding) {
      const negationCount = recentEndings.filter(e => e.usesNegationReveal).length;
      if (negationCount >= 2 && lastEnding.usesNegationReveal) {
        warnings.push(`最近${negationCount}章使用了"不是X。是Y。"否定揭示结尾，本章请换结尾方式（悬念提问/对话/动作收尾）`);
      }
      const sameSignatureCount = recentEndings.filter(e => e.signature === lastEnding.signature).length;
      if (sameSignatureCount >= 3) {
        warnings.push(`最近${sameSignatureCount}章结尾结构签名相同，本章结尾需要变化节奏`);
      }
    }

    // 3. 超期伏笔警告
    const lastChapterIndex = this.chapters[this.chapters.length - 1].index;
    for (const fs of this.allForeshadowing) {
      if (fs.resolved) continue;
      const gap = lastChapterIndex - fs.plantedIn;
      if (fs.importance >= 3 && gap >= 5) {
        warnings.push(`重要伏笔"${fs.keyword}"在第${fs.plantedIn + 1}章埋设，已过${gap}章未回收，建议本章推进`);
      } else if (fs.importance >= 2 && gap >= 10) {
        warnings.push(`伏笔"${fs.keyword}"已过${gap}章未回收，可能已被读者遗忘`);
      }
    }

    // 4. 场景衔接提示
    if (this.chapters.length > 0) {
      const lastCh = this.chapters[this.chapters.length - 1];
      if (lastCh.closingScene) {
        warnings.push(`上章结尾场景：${lastCh.closingScene}。本章开头必须自然承接`);
      }
    }

    // 5. 人物连续性提示
    if (this.chapters.length >= 2) {
      const prevCh = this.chapters[this.chapters.length - 1];
      const prevNames = [...prevCh.characterStates.keys()];
      if (prevNames.length > 0) {
        warnings.push(`上章出场人物：${prevNames.slice(0, 4).join('、')}。注意本章的人物衔接`);
      }
    }

    return warnings;
  }

  /**
   * v11.0: 生成章节写作指导（跨章追踪集成到生成流程）
   * 与 getCrossChapterWarnings() 不同，本方法提供的是**正向指导**
   * （告诉LLM应该做什么），而非反向警告（告诉LLM不要做什么）
   *
   * 包含：
   * - 人物连续性要求：哪些角色必须在/应该在本章出现
   * - 伏笔推进要求：哪些伏笔需要在本章推进或回收
   * - 场景衔接指导：从上章结尾场景如何过渡
   * - 情绪连续性：上章结尾的情绪状态如何延续
   * - 情节线程状态：活跃情节线程的推进建议
   */
  getGenerationGuidance(): {
    characterContinuity: string[]
    foreshadowToAdvance: string[]
    sceneTransition: string | null
    emotionalContinuity: string | null
    plotThreadGuidance: string[]
    summary: string
  } {
    const guidance = {
      characterContinuity: [] as string[],
      foreshadowToAdvance: [] as string[],
      sceneTransition: null as string | null,
      emotionalContinuity: null as string | null,
      plotThreadGuidance: [] as string[],
      summary: '',
    }

    if (this.chapters.length === 0) {
      guidance.summary = '这是第一章，无跨章追踪信息。'
      return guidance
    }

    const lastCh = this.chapters[this.chapters.length - 1]
    const nextChapterIndex = lastCh.index + 1

    // === 1. 人物连续性指导 ===
    if (lastCh.characterStates.size > 0) {
      const lastChars = [...lastCh.characterStates.entries()]
      // 最近出场的主要角色（按最后出场章节排序）
      const recentChars = lastChars
        .filter(([, state]) => nextChapterIndex - state.lastChapter <= 3)
        .map(([name, state]) => ({ name, lastAction: state.lastAction, lastLocation: state.lastLocation }))

      if (recentChars.length > 0) {
        guidance.characterContinuity.push(
          `必须承接的角色：${recentChars.slice(0, 3).map(c => `${c.name}（最后状态：${c.lastAction}）`).join('、')}`
        )
      }

      // 检查是否有角色多章未出现
      const absentChars = [...this.globalCharacterStates.entries()]
        .filter(([, state]) => nextChapterIndex - state.lastChapter > 5)
        .map(([name]) => name)

      if (absentChars.length > 0) {
        guidance.characterContinuity.push(
          `长期未出场角色（建议安排出场）：${absentChars.slice(0, 3).join('、')}`
        )
      }
    }

    // === 2. 伏笔推进指导 ===
    const currentChapterIndex = lastCh.index
    const urgentForeshadows = this.allForeshadowing
      .filter(fs => !fs.resolved)
      .map(fs => ({
        ...fs,
        gap: currentChapterIndex - fs.plantedIn,
      }))
      .filter(fs => (fs.importance >= 3 && fs.gap >= 4) || (fs.importance >= 2 && fs.gap >= 8))
      .sort((a, b) => b.importance * 10 + b.gap - (a.importance * 10 + a.gap))

    for (const fs of urgentForeshadows.slice(0, 3)) {
      const urgency = fs.gap >= 8 ? '【紧急回收】' : fs.gap >= 5 ? '【建议推进】' : '【可以提及】'
      guidance.foreshadowToAdvance.push(
        `${urgency}伏笔"${fs.keyword}"：${fs.description}（第${fs.plantedIn + 1}章埋设，已过${fs.gap}章）`
      )
    }

    // 最近的伏笔（轻度提醒）
    const recentForeshadows = this.allForeshadowing
      .filter(fs => !fs.resolved && fs.importance >= 2 && currentChapterIndex - fs.plantedIn <= 3)
      .slice(0, 2)

    for (const fs of recentForeshadows) {
      if (!guidance.foreshadowToAdvance.some(f => f.includes(fs.keyword))) {
        guidance.foreshadowToAdvance.push(
          `【近期伏笔】"${fs.keyword}"：${fs.description}（第${fs.plantedIn + 1}章埋设，可适当提及）`
        )
      }
    }

    // === 3. 场景衔接指导 ===
    if (lastCh.closingScene) {
      guidance.sceneTransition = `上章结尾场景：${lastCh.closingScene}。本章开头应自然承接此场景，如需转场请加入过渡描述。`
    }

    // === 4. 情绪连续性指导 ===
    // 从人物状态推断情绪基调
    const lastActions = [...lastCh.characterStates.values()].map(s => s.lastAction)
    const emotionalActions = lastActions.filter(a =>
      /怒|悲|惊|恐惧|绝望|狂喜|激动|沉默|低落|消沉|颓然|颤抖|瘫坐|跪倒|狂笑|泪|哭|叹|吼|骂|咆哮/.test(a)
    )
    if (emotionalActions.length > 0) {
      guidance.emotionalContinuity = `上章结尾情绪状态：${emotionalActions.slice(0, 2).join('；')}。本章开头需延续此情绪基调，或给予合理的情绪转折。`
    }

    // === 5. 情节线程指导 ===
    // 检测最近章节的设定规则（暗示活跃的情节线程）
    const recentRules = this.allSettingRules
      .filter(r => currentChapterIndex - r.establishedIn <= 5)
      .slice(0, 3)

    if (recentRules.length > 0) {
      guidance.plotThreadGuidance.push(
        `近期建立的设定规则：${recentRules.map(r => `"${r.rule}"（第${r.establishedIn + 1}章）`).join('；')}。注意后续内容不得违反这些规则。`
      )
    }

    // 检测章节类型分布，避免重复
    const recentOpenings = this.chapters.slice(-5).map(c => c.openingPattern.type)
    const recentEndings = this.chapters.slice(-5).map(c => c.endingPattern.type)
    const openingTypeCount = recentOpenings.filter(o => o === recentOpenings[recentOpenings.length - 1]).length
    const endingTypeCount = recentEndings.filter(e => e === recentEndings[recentEndings.length - 1]).length

    if (openingTypeCount >= 3) {
      const typeLabels: Record<string, string> = {
        'single-sensory': '单字感官',
        'dialogue': '对话',
        'action': '动作',
        'description': '叙述描写',
        'internal-thought': '内心独白',
      }
      const currentType = typeLabels[recentOpenings[recentOpenings.length - 1]] || recentOpenings[recentOpenings.length - 1]
      guidance.plotThreadGuidance.push(
        `开头类型变化：已连续${openingTypeCount}章使用"${currentType}"开头，本章必须换一种开头方式（建议：${this.suggestAlternativeOpening(recentOpenings[recentOpenings.length - 1])}）`
      )
    }

    if (endingTypeCount >= 3) {
      const typeLabels: Record<string, string> = {
        'reveal': '揭示',
        'cliffhanger': '悬念',
        'dialogue': '对话',
        'action': '动作',
        'emotion': '情感',
      }
      const currentType = typeLabels[recentEndings[recentEndings.length - 1]] || recentEndings[recentEndings.length - 1]
      guidance.plotThreadGuidance.push(
        `结尾类型变化：已连续${endingTypeCount}章使用"${currentType}"结尾，本章建议换一种结尾方式`
      )
    }

    // === 汇总 ===
    const parts: string[] = []
    if (guidance.characterContinuity.length > 0) parts.push('角色：' + guidance.characterContinuity.join('；'))
    if (guidance.foreshadowToAdvance.length > 0) parts.push('伏笔：' + guidance.foreshadowToAdvance.join('；'))
    if (guidance.sceneTransition) parts.push('场景：' + guidance.sceneTransition)
    if (guidance.emotionalContinuity) parts.push('情绪：' + guidance.emotionalContinuity)
    if (guidance.plotThreadGuidance.length > 0) parts.push('节奏：' + guidance.plotThreadGuidance.join('；'))
    guidance.summary = parts.length > 0 ? parts.join('\n') : '跨章追踪正常，无特殊指导。'

    return guidance
  }

  /**
   * 建议替代开头类型
   */
  private suggestAlternativeOpening(currentType: string): string {
    const alternatives: Record<string, string> = {
      'single-sensory': '对话或动作开头',
      'dialogue': '动作或感官描写开头',
      'action': '对话或内心独白开头',
      'description': '动作或对话开头',
      'internal-thought': '动作或感官描写开头',
    }
    return alternatives[currentType] || '动作或对话开头'
  }
}
