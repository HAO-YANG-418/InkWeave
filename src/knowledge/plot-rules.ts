// ============================================================
// 情节结构规则 — 大纲生成/节点关系/一致性检查/水章检测
// 情节规划模块读取这份知识来生成和管理大纲
// ============================================================

// === 节点依赖规则 ===

export interface NodeDependencyRule {
  /** 节点类型 */
  nodeType: string;
  /** 之后必须跟的节点类型（至少满足一个） */
  mustFollowWith: string[];
  /** 之后不能跟的节点类型 */
  mustNotFollowWith: string[];
  /** 最小间隔章节数 */
  minGap: number;
  /** 最大间隔章节数（超过则警告） */
  maxGap: number;
}

export const NODE_DEPENDENCIES: NodeDependencyRule[] = [
  {
    nodeType: 'climax',
    mustFollowWith: ['breather', 'resolution'],
    mustNotFollowWith: ['climax', 'setup'],
    minGap: 2,
    maxGap: 5,
  },
  {
    nodeType: 'twist',
    mustFollowWith: ['revelation', 'development'],
    mustNotFollowWith: ['twist'],
    minGap: 1,
    maxGap: 3,
  },
  {
    nodeType: 'setup',
    mustFollowWith: ['development', 'twist', 'climax'],
    mustNotFollowWith: ['setup'],
    minGap: 1,
    maxGap: 8,
  },
  {
    nodeType: 'revelation',
    mustFollowWith: ['development', 'climax', 'breather'],
    mustNotFollowWith: ['revelation'],
    minGap: 1,
    maxGap: 5,
  },
  {
    nodeType: 'breather',
    mustFollowWith: ['setup', 'development'],
    mustNotFollowWith: ['breather', 'climax'],
    minGap: 3,
    maxGap: 10,
  },
  {
    nodeType: 'resolution',
    mustFollowWith: ['hook', 'setup'],
    mustNotFollowWith: ['resolution'],
    minGap: 5,
    maxGap: 20,
  },
  {
    nodeType: 'hook',
    mustFollowWith: ['setup', 'development'],
    mustNotFollowWith: ['hook'],
    minGap: 1,
    maxGap: 3,
  },
];

// === 节奏配比规则 ===

export interface PacingRatio {
  /** 一卷总章节数范围 */
  volumeSize: { min: number; max: number };
  /** 各节点类型占比 */
  ratios: Array<{ type: string; label: string; min: number; max: number }>;
}

export const PACING_RATIOS: PacingRatio = {
  volumeSize: { min: 10, max: 20 },
  ratios: [
    { type: 'setup', label: '铺垫', min: 0.15, max: 0.25 },
    { type: 'development', label: '发展', min: 0.35, max: 0.50 },
    { type: 'twist', label: '转折', min: 0.10, max: 0.20 },
    { type: 'climax', label: '高潮', min: 0.08, max: 0.15 },
    { type: 'breather', label: '缓冲', min: 0.05, max: 0.10 },
    { type: 'resolution', label: '解决', min: 0.03, max: 0.08 },
    { type: 'hook', label: '钩子', min: 0.02, max: 0.05 },
  ],
};

// === 水章检测规则 ===

export interface WaterChapterRule {
  /** 检测项 */
  check: string;
  /** 判断条件 */
  condition: string;
  /** 严重度 */
  severity: 'critical' | 'warning' | 'notice';
  /** 建议 */
  suggestion: string;
}

export const WATER_CHAPTER_RULES: WaterChapterRule[] = [
  {
    check: '无新信息',
    condition: '全章没有新事件/新发现/关系变化/角色变化',
    severity: 'critical',
    suggestion: '这章是水章，建议删掉或合并到前后章。每章至少要有"一个新信息/一个冲突/一个决策"中的一个',
  },
  {
    check: '无冲突',
    condition: '全章没有对抗/张力/决策/阻碍',
    severity: 'critical',
    suggestion: '加入一个冲突点：可以是人际冲突/环境威胁/内心挣扎/目标阻碍',
  },
  {
    check: '修炼无意外',
    condition: '大段修炼描写且过程中没有意外/发现/突破',
    severity: 'warning',
    suggestion: '修炼过程中加入意外：被打断/发现异常/突破失败/获得感悟',
  },
  {
    check: '回顾过多',
    condition: '回顾/总结已发生的事超过全章30%',
    severity: 'warning',
    suggestion: '砍掉回顾内容，用一个相关细节带出前情即可',
  },
  {
    check: '心理过载',
    condition: '角色思考/内心独白超过全章40%且无结论/决策',
    severity: 'warning',
    suggestion: '减少心理描写，让角色通过行动来做决定，而非想完再做',
  },
  {
    check: '对话无推进',
    condition: '全章大量对话但无新信息/无关系变化/无决策',
    severity: 'warning',
    suggestion: '让对话中至少产生一个新信息/一个关系变化/一个决定',
  },
];

// === 一致性检查清单 ===

export interface ConsistencyCheck {
  /** 检查项 */
  name: string;
  /** 检查内容 */
  what: string;
  /** 严重度 */
  severity: 'critical' | 'warning' | 'notice';
  /** 通过条件 */
  passCondition: string;
  /** 不通过时的建议 */
  failSuggestion: string;
}

export const CONSISTENCY_CHECKS: ConsistencyCheck[] = [
  {
    name: '因果链完整性',
    what: '检查每个事件是否有前因后果',
    severity: 'critical',
    passCondition: '所有事件都能追溯到前文的原因，且产生了后续影响',
    failSuggestion: '补充事件的前因（为什么发生）或后果（导致了什么）',
  },
  {
    name: '角色弧线',
    what: '检查主要角色在本卷中是否有变化/成长',
    severity: 'warning',
    passCondition: '主角和主要配角在卷末与卷初有可感知的变化（能力/认知/关系/地位）',
    failSuggestion: '设计一个让角色被迫改变的事件，让角色在卷末与卷初不同',
  },
  {
    name: '伏笔回收',
    what: '检查活跃伏笔数量和回收情况',
    severity: 'warning',
    passCondition: '活跃伏笔不超过10个，且每卷至少回收2-3个',
    failSuggestion: '回收部分旧伏笔，减少活跃伏笔数量',
  },
  {
    name: '高潮密度',
    what: '检查高潮/转折的分布是否合理',
    severity: 'warning',
    passCondition: '连续5章内至少有1个高潮或转折',
    failSuggestion: '在连续平淡的章节中插入一个转折或小高潮',
  },
  {
    name: '战力一致',
    what: '检查角色实力表现是否与设定一致',
    severity: 'critical',
    passCondition: '角色实力表现与设定匹配，无明显忽高忽低',
    failSuggestion: '检查实力异常的章节，补充解释（受伤/限制/爆发原因）',
  },
  {
    name: '时间线一致',
    what: '检查事件发生的时间顺序是否合理',
    severity: 'critical',
    passCondition: '所有事件的时间顺序与前文一致，无时间矛盾',
    failSuggestion: '修正时间线矛盾，或通过叙事解释时间差异',
  },
  {
    name: '角色出场',
    what: '检查重要角色是否合理出场',
    severity: 'notice',
    passCondition: '主要角色不无故消失多章，消失时有交代去向',
    failSuggestion: '为消失的角色补充一句交代（"XX仍在闭关""XX去了某地"）',
  },
  {
    name: '场景连续',
    what: '检查章节间的场景衔接',
    severity: 'notice',
    passCondition: '每章开头与上一章结尾有逻辑衔接',
    failSuggestion: '在本章开头回应上章结尾的悬念/事件',
  },
];

// === 大纲生成规则 ===

export interface OutlineGenerationRule {
  /** 规则名 */
  name: string;
  /** 规则描述 */
  description: string;
}

export const OUTLINE_RULES: OutlineGenerationRule[] = [
  {
    name: '核心事件驱动',
    description: '每章围绕一个核心事件设计，不要多事件并行。核心事件 = 这章读者最该记住的事',
  },
  {
    name: '因果链推进',
    description: '相邻章节之间必须有因果关系：A章的事件导致B章的事件，B章的决策导致C章的冲突',
  },
  {
    name: '情绪曲线设计',
    description: '一卷内的情绪要有起伏：紧张→缓解→更紧张→爆发→余韵，不要一路平或一路紧张',
  },
  {
    name: '伏笔规划',
    description: '大纲中标注伏笔的埋设章和预计回收章，确保每卷有2-3个伏笔回收',
  },
  {
    name: '角色焦点',
    description: '每章有明确的焦点角色（通常是主角），避免视角混乱。多角色章节需有明确切换标记',
  },
  {
    name: '卷尾高潮',
    description: '每卷的倒数2-3章应该是该卷的高潮，解决本卷核心冲突，同时开启下一卷的钩子',
  },
];

// === 工具函数 ===

/** 按节点类型获取依赖规则 */
export function getDependencyByType(nodeType: string): NodeDependencyRule | undefined {
  return NODE_DEPENDENCIES.find(d => d.nodeType === nodeType);
}

/** 检查节点序列是否违反依赖规则 */
export function checkNodeSequence(sequence: string[]): Array<{ rule: NodeDependencyRule; violation: string }> {
  const violations: Array<{ rule: NodeDependencyRule; violation: string }> = [];
  for (let i = 0; i < sequence.length - 1; i++) {
    const current = sequence[i];
    const next = sequence[i + 1];
    const rule = getDependencyByType(current);
    if (!rule) continue;

    if (rule.mustNotFollowWith.includes(next)) {
      violations.push({
        rule,
        violation: `${current}后不应直接跟${next}（第${i + 1}-${i + 2}章）`,
      });
    }
  }
  return violations;
}

/** 检查节点分布是否符合节奏配比 */
export function checkPacingRatio(nodeTypes: string[]): Array<{ type: string; label: string; actual: number; expected: string }> {
  const total = nodeTypes.length;
  if (total === 0) return [];

  const results: Array<{ type: string; label: string; actual: number; expected: string }> = [];
  for (const ratio of PACING_RATIOS.ratios) {
    const count = nodeTypes.filter(t => t === ratio.type).length;
    const actual = count / total;
    const expected = `${(ratio.min * 100).toFixed(0)}%-${(ratio.max * 100).toFixed(0)}%`;
    if (actual < ratio.min || actual > ratio.max) {
      results.push({
        type: ratio.type,
        label: ratio.label,
        actual,
        expected,
      });
    }
  }
  return results;
}

/** 检测水章 */
export function detectWaterChapter(
  _content: string,
  metrics: {
    newEvents: number;
    conflicts: number;
    decisions: number;
    reviewRatio: number;
    monologueRatio: number;
    dialogueRatio: number;
    trainingDescription: boolean;
  }
): Array<{ rule: WaterChapterRule; triggered: boolean; detail: string }> {
  const results: Array<{ rule: WaterChapterRule; triggered: boolean; detail: string }> = [];

  for (const rule of WATER_CHAPTER_RULES) {
    let triggered = false;
    let detail = '';

    switch (rule.check) {
      case '无新信息':
        if (metrics.newEvents === 0) {
          triggered = true;
          detail = `全章新事件数：${metrics.newEvents}`;
        }
        break;
      case '无冲突':
        if (metrics.conflicts === 0 && metrics.decisions === 0) {
          triggered = true;
          detail = `冲突数：${metrics.conflicts}，决策数：${metrics.decisions}`;
        }
        break;
      case '修炼无意外':
        if (metrics.trainingDescription && metrics.newEvents === 0) {
          triggered = true;
          detail = '大段修炼描写但无新事件';
        }
        break;
      case '回顾过多':
        if (metrics.reviewRatio > 0.3) {
          triggered = true;
          detail = `回顾占比：${(metrics.reviewRatio * 100).toFixed(0)}%`;
        }
        break;
      case '心理过载':
        if (metrics.monologueRatio > 0.4) {
          triggered = true;
          detail = `心理独白占比：${(metrics.monologueRatio * 100).toFixed(0)}%`;
        }
        break;
      case '对话无推进':
        if (metrics.dialogueRatio > 0.5 && metrics.newEvents === 0 && metrics.decisions === 0) {
          triggered = true;
          detail = `对话占比：${(metrics.dialogueRatio * 100).toFixed(0)}%，但无新信息/决策`;
        }
        break;
    }
    results.push({ rule, triggered, detail });
  }
  return results;
}

/** 生成大纲检查prompt（供LLM使用） */
export function generatePlotCheckPrompt(): string {
  const checks = CONSISTENCY_CHECKS.map(c => {
    return `【${c.name}】（${c.severity}）
检查：${c.what}
通过条件：${c.passCondition}
不通过建议：${c.failSuggestion}`;
  }).join('\n\n');

  const rules = OUTLINE_RULES.map(r => `${r.name}：${r.description}`).join('\n');

  return `你是网文情节结构审查专家。请按以下规则检查大纲/章节的一致性和结构合理性。

大纲生成规则：
${rules}

一致性检查清单：
${checks}

请检查提供的大纲/章节，输出发现的问题和建议。`;
}

// ============================================================
// v9.0 LLM Prompt 生成器
// ============================================================

/** 生成大纲生成LLM prompt */
export function generateOutlineLLMPrompt(params: {
  genre: string;
  worldPremise: string;
  characters: Array<{ name: string; role: string; description: string }>;
  existingChapters: Array<{ number: number; title: string; summary: string }>;
  totalVolumes: number;
  chaptersPerVolume: number;
  volumeTitles?: string[];
  volumeArcs?: string[];
}): string {
  const rules = OUTLINE_RULES.map(r => `- ${r.name}：${r.description}`).join('\n');
  const ratios = PACING_RATIOS.ratios.map(r =>
    `- ${r.label}：${(r.min * 100).toFixed(0)}%-${(r.max * 100).toFixed(0)}%`
  ).join('\n');

  const charsText = params.characters.length > 0
    ? params.characters.map(c => `  - ${c.name}（${c.role}）：${c.description}`).join('\n')
    : '  （暂无角色信息）';

  const existingText = params.existingChapters.length > 0
    ? params.existingChapters.map(c => `  第${c.number}章《${c.title}》：${c.summary || '（无摘要）'}`).join('\n')
    : '  （暂无已有章节）';

  const volumeText = params.volumeTitles
    ? params.volumeTitles.map((t, i) => `  第${i + 1}卷：${t}（${params.volumeArcs?.[i] || ''}）`).join('\n')
    : `  共${params.totalVolumes}卷，每卷约${params.chaptersPerVolume}章`;

  return `请为以下网文生成完整的大纲节点。

【题材】${params.genre}
【世界观】${params.worldPremise || '（未指定）'}

【角色】
${charsText}

【已有章节】
${existingText}

【卷结构】
${volumeText}

【大纲生成规则】
${rules}

【节点节奏配比（每卷）】
${ratios}

【节点类型说明】
- setup（铺垫）：建立场景、角色或规则
- turning_point（转折）：剧情方向改变
- climax（高潮）：冲突达到顶点
- revelation（揭示）：关键信息释放
- resolution（解决）：冲突解决/收束
- breather（缓冲）：节奏调节
- hook（钩子）：引发下一阶段

请为每章生成一个节点，返回JSON数组，格式如下：
[
  {
    "volume": 1,
    "chapter": 1,
    "type": "setup",
    "title": "第一章 破晓",
    "event": "主角在宗门醒来，发现师父留下的玉佩碎裂",
    "keyEvents": ["玉佩碎裂", "师父失踪", "发现密室入口"],
    "foreshadows": ["玉佩碎裂的原因", "密室中隐藏的秘密"]
  }
]

要求：
1. 每章围绕一个核心事件设计
2. 相邻章节之间有因果关系
3. 伏笔要有埋设和回收的规划
4. 每卷倒数2-3章应该是该卷高潮
5. 节点类型分布要符合节奏配比`;
}

/** 生成一致性检查LLM prompt */
export function generateConsistencyLLMPrompt(params: {
  outlineText: string;
  chaptersText: string;
  charactersText: string;
  settingsText: string;
}): string {
  const checks = CONSISTENCY_CHECKS.map(c =>
    `- 【${c.name}】（${c.severity}）：${c.what}。通过条件：${c.passCondition}`
  ).join('\n');

  return `请检查以下网文内容的一致性。

【大纲】
${params.outlineText}

【章节内容】
${params.chaptersText || '（未提供章节内容）'}

【角色设定】
${params.charactersText || '（未提供角色信息）'}

【世界观设定】
${params.settingsText || '（未提供设定信息）'}

【检查清单】
${checks}

请返回JSON，格式如下：
{
  "issues": [
    {
      "severity": "critical/warning/notice",
      "description": "具体问题描述",
      "suggestion": "修改建议"
    }
  ]
}

要求：
1. 只报告真实的问题，不要过度解读
2. 每个问题都要给出具体的修改建议
3. 如果没有问题，返回空数组`;
}

/** 生成水章检测LLM prompt */
export function generateWaterChapterLLMPrompt(params: {
  content: string;
  chapterNumber?: number;
  chapterTitle?: string;
  previousContent?: string;
  metrics: {
    newEvents: number;
    conflicts: number;
    decisions: number;
    reviewRatio: number;
    monologueRatio: number;
    dialogueRatio: number;
    trainingDescription: boolean;
  };
}): string {
  const rules = WATER_CHAPTER_RULES.map(r =>
    `- 【${r.check}】（${r.severity}）：${r.condition}。建议：${r.suggestion}`
  ).join('\n');

  return `请判断以下章节是否为"水章"（没有实质内容推进的章节）。

【章节信息】
${params.chapterTitle ? `第${params.chapterNumber}章《${params.chapterTitle}》` : '（未指定章节信息）'}

【章节内容】
${params.content}

【前一章末尾】
${params.previousContent || '（无前章信息）'}

【统计数据】
- 新事件数：${params.metrics.newEvents}
- 冲突数：${params.metrics.conflicts}
- 决策数：${params.metrics.decisions}
- 回顾占比：${(params.metrics.reviewRatio * 100).toFixed(0)}%
- 心理独白占比：${(params.metrics.monologueRatio * 100).toFixed(0)}%
- 对话占比：${(params.metrics.dialogueRatio * 100).toFixed(0)}%
- 是否含修炼描写：${params.metrics.trainingDescription ? '是' : '否'}

【水章判定规则】
${rules}

请返回JSON，格式如下：
{
  "isWaterChapter": true/false,
  "issues": [
    {
      "rule": "命中的规则名",
      "severity": "critical/warning/notice",
      "detail": "具体说明"
    }
  ],
  "suggestions": ["改进建议1", "改进建议2"],
  "analysis": "整体分析：这章的核心问题是什么，应该怎么改"
}

要求：
1. 不要只看统计数字，要结合内容语义判断
2. 如果章节有实质内容推进，即使统计数字偏低也不应判定为水章
3. analysis要具体到"这章缺少什么、应该怎么改"`;
}
