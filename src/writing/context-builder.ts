/* ============================================================
   GWE v6.1 — 写作上下文构建器
   从WritingContext智能提取相关信息，组装LLM可用的prompt
   核心改进：分层上下文 + 学习桥接 + 热冷路径分离
   ============================================================ */

import type {
  WritingContext,
  Character,
  Setting,
  Chapter,
  StyleConfig,
  ChatMessage,
  CapabilityId,
  CapabilityParams,
  WritingRule,
  ChapterEndingState,
} from './types';
import { getLayersForCapability, buildLayeredPrompt } from '../kb/base-prompt-layered';
import type { BookContext } from '../book-context';
import {
  recommendOpeningFormula,
  generateOpeningPrompt,
  recommendQuestionCycle,
  generateQuestionCyclePrompt,
  recommendEmotionCurve,
  generateEmotionCurvePrompt,
  recommendBattleStyle,
  generateBattleStylePrompt,
} from '../knowledge';
import type { OpeningFormulaType, QuestionCycleType, EmotionCurveType, BattleStyleType } from '../knowledge';

export interface ContextBuildOptions {
  capability: CapabilityId;
  maxChars?: number;
  selectedText?: string;
  speakerId?: string;
  params?: CapabilityParams;
  /** v7.0: 跨章上下文，用于生成跨章警告 */
  bookContext?: BookContext;
  /** v11.0: 预计算的冷却警告（同步），用于注入到生成Prompt */
  coolingWarnings?: string[];
}

const DEFAULT_MAX_CHARS = 8000;

// ============ 上下文提取工具 ============

export function getCurrentChapter(context: WritingContext): Chapter | null {
  if (!context.currentChapterId) return null;
  return context.chapters.find(c => c.id === context.currentChapterId) || null;
}

export function getPrefixContext(context: WritingContext, maxChars: number = 2000): string {
  const chapter = getCurrentChapter(context);
  if (!chapter) return '';
  const pos = Math.min(context.cursorPosition, chapter.content.length);
  const start = Math.max(0, pos - maxChars);
  return chapter.content.slice(start, pos);
}

/** 获取前一章（及其章末状态） */
export function getPreviousChapter(context: WritingContext): Chapter | null {
  const current = getCurrentChapter(context);
  if (!current) return null;
  const idx = context.chapters.findIndex(c => c.id === current.id);
  if (idx <= 0) return null;
  return context.chapters[idx - 1];
}

/** 获取最近N章的摘要+末尾 */
export function getRecentChapters(
  context: WritingContext,
  count: number = 3
): Array<{ title: string; number: number; summary?: string; excerpt: string; endingState?: ChapterEndingState }> {
  if (!context.currentChapterId) return [];
  const idx = context.chapters.findIndex(c => c.id === context.currentChapterId);
  if (idx === -1) return [];

  const results = [];
  for (let i = Math.max(0, idx - count); i < idx; i++) {
    const ch = context.chapters[i];
    if (!ch) continue;
    results.push({
      title: ch.title,
      number: ch.number,
      summary: ch.summary,
      excerpt: ch.content.slice(-400),
      endingState: ch.endingState,
    });
  }
  return results;
}

/** 获取活跃伏笔（未回收且应在近期回收的） */
export function getActiveForeshadows(context: WritingContext, currentChapterNum: number): Array<{
  keyword: string;
  description: string;
  plantedIn: number;
  chaptersSince: number;
  importance: number;
}> {
  return context.foreshadows
    .filter(f => f.status !== 'resolved')
    .map(f => ({
      keyword: f.keyword,
      description: f.description,
      plantedIn: f.plantedInChapter,
      chaptersSince: currentChapterNum - f.plantedInChapter,
      importance: f.importance,
    }))
    .filter(f => f.chaptersSince <= 15 || f.importance >= 2) // 15章内或重要伏笔
    .sort((a, b) => b.importance - a.importance || b.chaptersSince - a.chaptersSince)
    .slice(0, 8);
}

/** 检索相关角色（按出场/主角/前文出现打分） */
export function getRelevantCharacters(context: WritingContext, maxCount: number = 8): Character[] {
  const chapter = getCurrentChapter(context);
  const appearedIds = new Set(chapter?.charactersAppeared || []);
  const prefix = getPrefixContext(context, 2500);

  const scored = context.characters.map(ch => {
    let score = 0;
    if (appearedIds.has(ch.id)) score += 100;
    if (ch.role === 'protagonist') score += 50;
    if (ch.role === 'antagonist') score += 30;
    if (ch.role === 'supporting') score += 10;
    if (ch.name && prefix.includes(ch.name)) score += 20;
    ch.aliases?.forEach(a => { if (prefix.includes(a)) score += 15; });
    return { ch, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCount)
    .map(s => s.ch);
}

/** 检索相关设定 */
export function getRelevantSettings(context: WritingContext, maxCount: number = 6): Setting[] {
  const chapter = getCurrentChapter(context);
  const referencedIds = new Set(chapter?.settingsReferenced || []);
  const prefix = getPrefixContext(context, 2500);

  const scored = context.settings.map(s => {
    let score = 0;
    if (referencedIds.has(s.id)) score += 50;
    if (s.name && prefix.includes(s.name)) score += 30;
    if (s.category === 'world') score += 20;
    if (s.category === 'power') score += 15;
    return { s, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCount)
    .map(s => s.s);
}

// ============ 风格/角色/设定格式化 ============

export function styleToPrompt(style: StyleConfig): string {
  const parts: string[] = [];

  if (style.tone < 0.3) parts.push('文风冷峻克制，避免过度抒情');
  else if (style.tone > 0.7) parts.push('文风热烈饱满，情感充沛');

  if (style.pov === 'first') parts.push('使用第一人称视角叙事');
  else if (style.pov === 'third-limited') parts.push('使用第三人称有限视角（紧贴主角感知，不切换视角）');
  else parts.push('使用第三人称全知视角');

  if (style.pace < 0.3) parts.push('节奏舒缓，注重铺陈和细节');
  else if (style.pace > 0.7) parts.push('节奏紧凑，推进有力，少冗余描写');

  if (style.dialogRatio > 0.6) parts.push('对话比例较高，以对话推动情节');
  else if (style.dialogRatio < 0.2) parts.push('以叙述和描写为主，对话精简');

  if (style.descriptionDensity > 0.7) parts.push('描写浓墨重彩，善用感官细节');
  else if (style.descriptionDensity < 0.3) parts.push('描写白描为主，点到即止');

  if (style.classicalRatio > 0.5) parts.push('语言偏文白夹杂，有古典质感');
  if (style.humor > 0.6) parts.push('适当融入幽默感');
  if (style.customInstructions) {
    const ci = style.customInstructions.trim();
    parts.push(ci.endsWith('。') ? ci.slice(0, -1) : ci);
  }

  return parts.length > 0 ? `【风格要求】${parts.join('；')}。` : '';
}

/**
 * v12.10: 从角色元数据推导语音风格
 * 当角色没有显式 speechStyle 时，根据角色身份、标签、描述自动生成
 * 确保LLM能获得具体的角色声音差异化指引
 */
function deriveVoiceStyle(ch: Character): string {
  if (ch.speechStyle) return ch.speechStyle

  const traits: string[] = []

  // 基于角色身份推导
  if (ch.role === 'protagonist') {
    traits.push('说话直接有力，少废话，关键时刻有一句定乾坤的台词')
  } else if (ch.role === 'antagonist') {
    traits.push('说话带着压迫感或轻蔑，喜欢用反问和短句制造压力')
  } else if (ch.role === 'supporting') {
    traits.push('说话有鲜明的个人习惯——可能是口头禅、特定句式、或对某类话题的敏感')
  }

  // 基于标签推导
  if (ch.tags?.length) {
    const tagStr = ch.tags.join(' ')
    if (/老|年长|前辈|师父|长老/.test(tagStr)) traits.push('语气沉稳，爱说教，喜欢用"当年""你可知"开头')
    if (/少年|年轻|师妹|师弟|徒弟/.test(tagStr)) traits.push('语气急切，常用短句，偶尔冲动失言')
    if (/冷酷|冷漠|杀手|无情/.test(tagStr)) traits.push('惜字如金，每句不超过15字，从不解释')
    if (/豪爽|粗犷|莽/.test(tagStr)) traits.push('嗓门大，说话直来直去，喜欢用"他娘的""老子"等粗口')
    if (/神秘|隐藏|伪装/.test(tagStr)) traits.push('说话留三分，从不把话说满，常用"也许""或许""不一定"')
    if (/贵族|高贵|优雅|公主/.test(tagStr)) traits.push('说话文雅，多用敬语和书面语，从不使用粗俗词汇')
    if (/商人|掌柜|精明/.test(tagStr)) traits.push('说话圆滑，喜欢绕弯子，每句话都在计算利益')
    if (/疯|狂|癫/.test(tagStr)) traits.push('说话跳跃，逻辑断裂，但疯话中藏着真相')
  }

  // 基于描述推导
  if (ch.description) {
    if (/沉默|寡言|不爱说话/.test(ch.description)) traits.push('极少主动开口，一旦开口必是重要信息')
    if (/暴躁|易怒|冲动/.test(ch.description)) traits.push('说话带火药味，容易激动，常用感叹句')
    if (/温柔|温和|善良/.test(ch.description)) traits.push('说话轻声细语，多用商量语气，从不咄咄逼人')
    if (/骄傲|自负|傲慢/.test(ch.description)) traits.push('说话居高临下，喜欢用"你懂什么""不过是"等蔑视句式')
    if (/自卑|怯懦|胆小/.test(ch.description)) traits.push('说话结巴或犹豫，常用"那个……""可能……""对不起"')
    if (/狡猾|心机|城府/.test(ch.description)) traits.push('说话滴水不漏，从不暴露真实想法，善于用问题回答问题')
  }

  if (traits.length === 0) {
    traits.push('说话风格自然，避免与其他角色雷同的句式')
  }

  return traits.join('；')
}

export function formatCharacters(chars: Character[]): string {
  if (chars.length === 0) return '';
  const lines = chars.map(ch => {
    let line = `- ${ch.name}（${roleLabel(ch.role)}）`;
    if (ch.tags?.length) line += `，身份：${ch.tags.join('、')}`;
    if (ch.description) line += `，${ch.description}`;
    const voice = deriveVoiceStyle(ch);
    line += `，说话风格：${voice}`;
    return line;
  });

  // v12.10: 多角色时追加差异化要求
  let extra = '';
  if (chars.length >= 2) {
    const names = chars.map(c => c.name).join('、');
    extra = `\n\n【角色声音差异化 - 必须遵守】\n- 本章涉及角色：${names}\n- 每位角色的对话必须能从语气/用词/句式上区分开来，读者不看名字也能分辨谁在说话\n- 禁止所有角色使用相同的句式、语气词、或对话节奏\n- 每个角色至少有一句标志性的、只有TA会说的话`;
  }

  return `【相关角色】\n${lines.join('\n')}${extra}`;
}

export function formatSettings(settings: Setting[]): string {
  if (settings.length === 0) return '';
  const lines = settings.map(s => {
    let line = `- ${s.name}（${categoryLabel(s.category)}）：${s.description}`;
    if (s.rules?.length) line += `。规则：${s.rules.join('；')}`;
    return line;
  });
  return `【相关设定】\n${lines.join('\n')}`;
}

export function formatGlobalRules(rules: WritingRule[]): string {
  if (rules.length === 0) return '';
  const injected = rules.filter(r => r.injectToPrompt !== false);
  if (injected.length === 0) return '';
  return `【硬性规则】\n${injected.map(r => `- ${r.description}`).join('\n')}`;
}

function roleLabel(role: Character['role']): string {
  const map = { protagonist: '主角', antagonist: '反派', supporting: '主要配角', minor: '次要配角' };
  return map[role] || role;
}

function categoryLabel(cat: Setting['category']): string {
  const map = { world: '世界观', power: '力量体系', geography: '地理', item: '物品道具', faction: '势力组织', custom: '自定义' };
  return map[cat] || cat;
}

// ============ 反套路警告（核心改进） ============

function buildAntiPatternWarning(context: WritingContext): string {
  const warnings: string[] = [];
  const patterns = context.recentPatterns;

  if (!patterns) return '';

  if (patterns.sensoryOpeningStreak >= 1) {
    const n = patterns.sensoryOpeningStreak;
    const desc = n === 1 ? '上一章用了' : `连续${n}章用了`;
    warnings.push(`${desc}单字感官开头（如"疼。""麻。""冷。"），本章请勿再用，换对话或动作开头`);
  }

  if (patterns.negationRevealStreak >= 1) {
    const n = patterns.negationRevealStreak;
    const desc = n === 1 ? '上一章结尾用了' : `连续${n}章结尾用了`;
    warnings.push(`${desc}"不是X，是Y"的否定揭示，本章结尾请换种方式（悬念提问/对话/动作收尾）`);
  }

  const recentOpenings = patterns.openingTypes.slice(-3);
  const allSame = recentOpenings.length >= 2 && recentOpenings.every(t => t === recentOpenings[0]);
  if (allSame) {
    warnings.push(`最近几章开头类型都是"${recentOpenings[0]}"，建议本章变化节奏`);
  }

  if (warnings.length > 0) {
    return `【避免套路化 - 重要】\n${warnings.map(w => `- ${w}`).join('\n')}`;
  }
  return '';
}

// ============ v10.0: 反模式追踪警告 ============

function buildChapterTypeWarning(context: WritingContext): string {
  const history = context.chapterTypeHistory;
  if (!history || history.length === 0) return '';

  const warnings: string[] = [];
  const recent = history.slice(-8);

  // 连续同类型检测
  let consecutive = 0;
  const lastType = recent[recent.length - 1]?.type;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].type === lastType) consecutive++;
    else break;
  }

  if (consecutive >= 3) {
    warnings.push(`最近${consecutive}章都是同一类型（${lastType}），读者会产生重复疲劳，本章强烈建议变换节奏`);
  }

  // 类型分布集中检测
  const typeCounts: Record<string, number> = {};
  for (const r of recent) {
    typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
  }
  const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
  if (dominantType && dominantType[1] >= 5 && recent.length >= 6) {
    const ratio = (dominantType[1] / recent.length * 100).toFixed(0);
    warnings.push(`最近${recent.length}章中${dominantType[0]}占比${ratio}%，类型分布过于集中`);
  }

  // 单调情感序列检测
  if (recent.length >= 3) {
    const last3 = recent.slice(-3);
    const emotionMap: Record<string, string> = {
      battle: '紧张/热血', reward: '满足/期待', setup: '好奇/沉浸',
      conflict: '紧张/不安', payoff: '爽/释放', suspense: '好奇/追读冲动', transition: '松弛/沉浸',
    };
    const emotions = last3.map(r => emotionMap[r.type] || '');
    if (emotions.every(e => e === emotions[0]) && emotions[0]) {
      warnings.push(`最近3章情感色调均为「${emotions[0]}」，建议本章变化情感节奏`);
    }
  }

  if (warnings.length > 0) {
    return `【章类型追踪 - 重要】\n${warnings.map(w => `- ${w}`).join('\n')}`;
  }
  return '';
}

function buildConflictDiversityWarning(context: WritingContext): string {
  const history = context.conflictHistory;
  if (!history || history.length === 0) return '';

  const warnings: string[] = [];
  const recent = history.slice(-5);

  // 同冲突类型连续检测
  let conflictStreak = 0;
  const lastConflict = recent[recent.length - 1]?.primaryConflict;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].primaryConflict === lastConflict) conflictStreak++;
    else break;
  }

  if (conflictStreak >= 3) {
    warnings.push(`最近${conflictStreak}章冲突类型相同（${lastConflict}），建议变换冲突维度（如从外部战斗转向内心挣扎或人际关系）`);
  }

  // 同解决方式连续检测
  let resolutionStreak = 0;
  const lastResolution = recent[recent.length - 1]?.resolution;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].resolution === lastResolution) resolutionStreak++;
    else break;
  }

  if (resolutionStreak >= 3) {
    warnings.push(`最近${resolutionStreak}章冲突解决方式相同（${lastResolution}），建议更换解决手段`);
  }

  // 低多样性检测
  if (recent.length >= 4) {
    const uniqueTypes = new Set(recent.map(r => r.primaryConflict));
    if (uniqueTypes.size < 3) {
      warnings.push(`最近${recent.length}章仅使用${uniqueTypes.size}种冲突类型，冲突维度过于单一`);
    }
  }

  if (warnings.length > 0) {
    return `【冲突多样性 - 重要】\n${warnings.map(w => `- ${w}`).join('\n')}`;
  }
  return '';
}

function buildTemplateComboWarning(context: WritingContext): string {
  const history = context.templateComboHistory;
  if (!history || history.length === 0) return '';

  const warnings: string[] = [];
  const recent = history.slice(-6);

  // 同组合连续检测
  let comboStreak = 0;
  const lastCombo = recent[recent.length - 1]?.comboId;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].comboId === lastCombo) comboStreak++;
    else break;
  }

  if (comboStreak >= 2) {
    warnings.push(`最近${comboStreak}章使用相同模板组合（${lastCombo}），本章必须更换写作策略组合`);
  }

  if (warnings.length > 0) {
    return `【模板组合 - 重要】\n${warnings.map(w => `- ${w}`).join('\n')}`;
  }
  return '';
}

// ============ 章末衔接提示 ============

function buildContinuityHint(context: WritingContext): string {
  const prev = getPreviousChapter(context);
  if (!prev?.endingState) return '';

  const es = prev.endingState;
  const hints: string[] = [];

  if (es.location) hints.push(`上章结束场景：${es.location}`);
  if (es.presentCharacters?.length) hints.push(`上章在场人物：${es.presentCharacters.join('、')}`);
  if (es.ongoingAction) hints.push(`上章正在进行：${es.ongoingAction}`);
  if (es.pendingHooks?.length) {
    hints.push(`上章留下的悬念（本章需回应或推进）：${es.pendingHooks.join('；')}`);
  }
  if (es.timeline) hints.push(`当前时间线：${es.timeline}`);

  if (hints.length === 0) return '';
  return `【章节衔接 - 必须承接】\n${hints.map(h => `- ${h}`).join('\n')}\n注意：本章开头必须自然承接以上状态，不能突兀跳转。`;
}

// ============ 伏笔提醒 ============

function buildForeshadowHint(context: WritingContext): string {
  const current = getCurrentChapter(context);
  const chNum = current?.number ?? context.chapters.length + 1;
  const active = getActiveForeshadows(context, chNum);

  if (active.length === 0) return '';

  const urgent = active.filter(f => f.chaptersSince >= 5 && f.importance >= 2);
  const growing = active.filter(f => f.chaptersSince >= 2 && f.chaptersSince < 5);

  const lines: string[] = [];
  if (urgent.length > 0) {
    lines.push('【需要尽快回收的伏笔】');
    for (const f of urgent) {
      lines.push(`- "${f.keyword}"（第${f.plantedIn}章埋设，已过${f.chaptersSince}章）：${f.description}`);
    }
  }
  if (growing.length > 0) {
    lines.push('【正在生长的伏笔（可推进）】');
    for (const f of growing.slice(0, 3)) {
      lines.push(`- "${f.keyword}"（第${f.plantedIn}章）：${f.description}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : '';
}

// ============ 任务指令 ============

function getCapabilityInstruction(capability: CapabilityId, params?: CapabilityParams): string {
  switch (capability) {
    case 'continue':
      return [
        '【当前任务：续写】',
        '请根据下面提供的正文内容，在文末继续往下写。要求：',
        '1. 保持文风、视角、人称与前文完全一致',
        '2. 自然承接上一章的章末状态（场景、人物、正在进行的动作），禁止突兀跳转',
        '3. 不要重复前文内容，不要加过渡性废话（如"就在这时"、"话说回来"、"紧接着"）',
        '4. 推进剧情或深化场景，不要原地踏步',
        '5. 注意回应上一章留下的悬念/钩子',
        '6. 直接输出续写的正文，不要加任何解释、标题、引号或"以下是续写"之类的提示语',
        '7. 严格遵守上面列出的硬性规则和世界观设定，不得违反',
        '8. 注意段落节奏，手机端每段80-150字，关键处可用极短段落',
        params?.userInstruction ? `9. ${params.userInstruction}` : '',
      ].filter(Boolean).join('\n');

    case 'rewrite':
      return [
        '【当前任务：改写】',
        '请根据要求改写选中的文字。要求：',
        '1. 保持原意不变，但提升文字质量',
        '2. 保持文风、视角、人称与上下文一致',
        '3. 消除填充词（不禁/忍不住/竟然/仿佛），增强身体锚点',
        '4. 直接输出改写后的文字，不要加任何解释',
      ].join('\n');

    case 'review':
      return [
        '【当前任务：审稿】',
        '请仔细审查章节内容，找出问题并给出具体修改建议。检查维度：',
        '1. 逻辑漏洞与设定矛盾',
        '2. 节奏问题（拖沓/跳跃）',
        '3. 角色一致性（言行是否符合设定）',
        '4. 伏笔与线索（是否遗忘前文伏笔）',
        '5. 文字问题（冗余、语病、AI味、重复表达、填充词）',
        '6. 感官描写是否充分（2-3种感官交织）',
        '7. 开头结尾是否套路化（单字感官/否定揭示是否连续使用）',
        '8. 身体锚点密度（每段最好有触觉/温度/身体反应）',
        '输出格式：先给总体评价，然后分点列出问题，每个问题标明位置并给出具体修改建议。',
      ].join('\n');

    case 'dialog':
      return [
        '【当前任务：角色对话生成】',
        '请以指定角色的口吻，生成自然对话。要求：',
        '1. 严格符合该角色身份、性格和说话风格',
        '2. 对话符合当前场景情境',
        '3. 对话之间穿插动作、微表情',
        '4. 不要加"某某说："之类的提示',
        '5. 直接输出对话正文',
      ].join('\n');

    case 'polish':
      return [
        '【当前任务：润色】',
        '润色文字：保持原意，优化节奏，增强画面感和沉浸感，去AI味。直接输出润色后文字。',
      ].join('\n');

    case 'expand':
      return [
        '【当前任务：扩写】',
        '扩写文字：增加感官描写、环境细节、身体反应、微表情，不改变情节走向。直接输出。',
      ].join('\n');

    case 'compress':
      return [
        '【当前任务：缩写】',
        '压缩文字：保留核心情节，去除冗余，保持逻辑连贯。直接输出。',
      ].join('\n');

    case 'outline':
      return [
        '【当前任务：大纲/情节建议】',
        '根据现有剧情、角色和设定，提供后续大纲建议。要具体可操作，包含事件、转折、伏笔埋设/回收点。',
      ].join('\n');

    case 'consistency':
      return [
        '【当前任务：一致性检查】',
        '检查内容是否与角色设定、世界观规则、前文章节矛盾。列出所有不一致。无矛盾则回复"未发现不一致"。',
      ].join('\n');

    case 'suggest-technique':
      return [
        '【当前任务：技法推荐】',
        '请根据当前上下文，推荐2-3个适合的写作技法。要求：',
        '1. 结合当前场景（开头/对话/描写/悬念/高潮/结尾）推荐具体技法',
        '2. 每个技法给出名称、简要说明和1个示例',
        '3. 说明为什么这个技法适合当前场景',
        '4. 输出格式：技法名 + 说明 + 示例 + 推荐理由',
      ].join('\n');

    default:
      return '请根据上下文协助作者完成写作任务。';
  }
}

// ============ v8.0 Coach模式：生成时指导 ============

interface CoachingContext {
  /** 章节标题/意图 */
  chapterIntent: string;
  /** 题材 */
  genre?: string;
  /** 光标位置（判断是否在开头） */
  cursorPosition: number;
  /** 前文内容（用于检测是否涉及战斗） */
  prefixContent: string;
  /** 最近使用过的开篇公式 */
  recentOpenings?: OpeningFormulaType[];
  /** 最近使用过的问题循环 */
  recentCycles?: QuestionCycleType[];
  /** 最近使用过的情感曲线 */
  recentCurves?: EmotionCurveType[];
  /** 最近使用过的战斗风格 */
  recentBattleStyles?: BattleStyleType[];
  /** v10.0: 最近章类型序列 */
  recentChapterTypes?: string[];
  /** v10.0: 最近冲突类型序列 */
  recentConflictTypes?: string[];
}

function buildCoachingSection(coaching: CoachingContext): string {
  const sections: string[] = [];
  const isAtBeginning = coaching.cursorPosition < 200;

  // v10.0: 基于章类型历史判断是否需要变换策略
  const recentTypes = coaching.recentChapterTypes || [];
  const recentConflicts = coaching.recentConflictTypes || [];
  const needsVariation = recentTypes.length >= 2 && recentTypes.slice(-2).every(t => t === recentTypes[recentTypes.length - 1]);
  const needsConflictVariation = recentConflicts.length >= 2 && recentConflicts.slice(-2).every(c => c === recentConflicts[recentConflicts.length - 1]);

  // 1. 开篇公式（仅在章节开头时推荐）
  if (isAtBeginning) {
    // v10.0: 如果最近用了相同开篇，强制排除
    const excludeRecent = needsVariation ? (coaching.recentOpenings || []) : [];
    const openingFormula = recommendOpeningFormula(
      coaching.chapterIntent,
      excludeRecent,
      coaching.genre,
    );
    if (openingFormula) {
      sections.push(generateOpeningPrompt(openingFormula));
    }
  }

  // 2. 问题滚动循环（始终推荐——这是章节驱动力的核心）
  // v10.0: 如果需要变化，传入最近的循环类型用于排除
  const excludeCycles = needsVariation ? (coaching.recentCycles || []) : undefined;
  const questionCycle = recommendQuestionCycle(
    coaching.chapterIntent,
    coaching.genre,
    excludeCycles,
  );
  if (questionCycle) {
    sections.push(generateQuestionCyclePrompt(questionCycle));
  }

  // 3. 情感曲线（始终推荐——读者追的是情感体验）
  // v10.0: 如果最近情感色调单调，强制变化
  const excludeCurves = needsVariation ? (coaching.recentCurves || []) : undefined;
  const emotionCurve = recommendEmotionCurve(
    coaching.chapterIntent,
    coaching.genre,
    excludeCurves,
  );
  if (emotionCurve) {
    sections.push(generateEmotionCurvePrompt(emotionCurve));
  }

  // 4. 战斗风格（仅在前文涉及战斗时推荐）
  const battleKeywords = ['战斗', '攻击', '出手', '对决', '杀', '剑', '刀', '拳', '掌', '灵力', '魂力', '斗气', '打', '战', 'Boss', '敌人', '对手'];
  const hasBattleIntent = battleKeywords.some(kw => coaching.chapterIntent.includes(kw)) ||
    battleKeywords.some(kw => coaching.prefixContent.slice(-500).includes(kw));

  if (hasBattleIntent) {
    // v10.0: 如果最近战斗风格相同，排除
    const excludeStyles = needsConflictVariation ? (coaching.recentBattleStyles || []) : undefined;
    const battleStyle = recommendBattleStyle(
      coaching.chapterIntent,
      coaching.genre,
      excludeStyles,
    );
    if (battleStyle) {
      sections.push(generateBattleStylePrompt(battleStyle));
    }
  }

  return sections.length > 0
    ? `【Coach模式 — 写作指导】\n以下是根据当前场景和顶流网文经验为您定制的写作策略，请参考执行。\n\n${sections.join('\n\n---\n\n')}`
    : '';
}

// ============ 核心API：构建消息列表 ============

export function buildWritingMessages(
  context: WritingContext,
  opts: ContextBuildOptions
): ChatMessage[] {
  const { capability, maxChars = DEFAULT_MAX_CHARS, params } = opts;
  const { book } = context;
  const style = book.styleConfig || {
    tone: 0.5, pov: 'third-limited' as const, pace: 0.5,
    dialogRatio: 0.35, descriptionDensity: 0.5, classicalRatio: 0, humor: 0.2,
  };
  const chars = getRelevantCharacters(context);
  const settings = getRelevantSettings(context);
  const recentChapters = getRecentChapters(context);
  const rules = book.globalRules || [];

  const sections: string[] = [];

  // 基础身份
  sections.push(`你是一位专业的中文网络小说写作引擎（GWE Generic Web-novel Engine v4），精通网文写作技法，正在协助作者创作《${book.title}》。`);
  if (book.genre) sections.push(`题材类型：${book.genre}。`);
  if (book.synopsis) sections.push(`作品简介：${book.synopsis}`);
  if (book.worldPremise) sections.push(`世界观背景：${book.worldPremise}`);
  sections.push('');

  // v6.1: 分层系统提示词
  const layers = getLayersForCapability(capability);
  const layeredPrompt = buildLayeredPrompt(layers);
  sections.push(layeredPrompt);
  sections.push('');

  // 风格
  const stylePrompt = styleToPrompt(style);
  if (stylePrompt) { sections.push(stylePrompt); sections.push(''); }

  // 反套路警告
  const antiPattern = buildAntiPatternWarning(context);
  if (antiPattern) { sections.push(antiPattern); sections.push(''); }

  // v10.0: 反模式追踪警告
  const chapterTypeWarning = buildChapterTypeWarning(context);
  if (chapterTypeWarning) { sections.push(chapterTypeWarning); sections.push(''); }

  const conflictDiversityWarning = buildConflictDiversityWarning(context);
  if (conflictDiversityWarning) { sections.push(conflictDiversityWarning); sections.push(''); }

  const templateComboWarning = buildTemplateComboWarning(context);
  if (templateComboWarning) { sections.push(templateComboWarning); sections.push(''); }

  // v7.0 & v11.0: 跨章追踪 — 从 BookContext 提取正向指导 + 反向警告
  if (opts.bookContext) {
    // v11.0: 正向指导 — 告诉LLM应该做什么（角色承接、伏笔推进、场景衔接）
    const guidance = opts.bookContext.getGenerationGuidance();
    if (guidance.summary && guidance.summary !== '跨章追踪正常，无特殊指导。') {
      sections.push(`【跨章追踪指导 - 本章必须遵守】\n${guidance.summary}`);
      sections.push('');
    }

    // v7.0: 反向警告 — 告诉LLM不要做什么（开头/结尾重复、伏笔超期）
    const crossChapterWarnings = opts.bookContext.getCrossChapterWarnings();
    if (crossChapterWarnings.length > 0) {
      sections.push(`【跨章警告 - 避免重复套路】\n${crossChapterWarnings.map(w => `- ${w}`).join('\n')}`);
      sections.push('');
    }
  }

  // v11.0: 冷却系统警告 — 预计算的套路/模板冷却状态
  if (opts.coolingWarnings && opts.coolingWarnings.length > 0) {
    sections.push(`【冷却系统警告 - 避免套路化】\n${opts.coolingWarnings.map(w => `- ${w}`).join('\n')}`);
    sections.push('');
  }

  // 章节衔接
  const continuity = buildContinuityHint(context);
  if (continuity) { sections.push(continuity); sections.push(''); }

  // 伏笔提醒
  const foreshadow = buildForeshadowHint(context);
  if (foreshadow) { sections.push(foreshadow); sections.push(''); }

  // 规则
  const rulesPrompt = formatGlobalRules(rules);
  if (rulesPrompt) { sections.push(rulesPrompt); sections.push(''); }

  // 角色
  const charsPrompt = formatCharacters(chars);
  if (charsPrompt) { sections.push(charsPrompt); sections.push(''); }

  // 设定
  const settingsPrompt = formatSettings(settings);
  if (settingsPrompt) { sections.push(settingsPrompt); sections.push(''); }

  // v8.0: Coach模式 — 生成时写作策略指导
  if (capability === 'continue' || capability === 'expand') {
    const chapter = getCurrentChapter(context);
    const coaching = buildCoachingSection({
      chapterIntent: chapter?.title || book.genre || '',
      genre: book.genre,
      cursorPosition: context.cursorPosition,
      prefixContent: getPrefixContext(context, 3000),
      recentOpenings: context.recentPatterns?.openingTypes as OpeningFormulaType[] | undefined,
      recentChapterTypes: context.chapterTypeHistory?.slice(-5).map(h => h.type),
      recentConflictTypes: context.conflictHistory?.slice(-5).map(h => h.primaryConflict),
    });
    if (coaching) { sections.push(coaching); sections.push(''); }
  }

  // 前情提要
  if (recentChapters.length > 0) {
    const recentText = recentChapters.map(rc => {
      let txt = `第${rc.number}章《${rc.title}》`;
      if (rc.summary) txt += `：${rc.summary}`;
      txt += `（末尾：...${rc.excerpt.slice(-120)}）`;
      return txt;
    }).join('\n');
    sections.push(`【前情提要】\n${recentText}`);
    sections.push('');
  }

  // 任务指令
  sections.push(getCapabilityInstruction(capability, params));

  // 组装system prompt
  let systemPrompt = sections.join('\n');

  // 裁剪过长的system prompt
  if (systemPrompt.length > maxChars * 0.65) {
    const half = Math.floor(maxChars * 0.32);
    systemPrompt = systemPrompt.slice(0, half) + '\n...（部分设定省略）...\n' + systemPrompt.slice(-half);
  }

  // 构建user message
  const userMessage = buildUserMessage(context, opts);

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
}

function buildUserMessage(context: WritingContext, opts: ContextBuildOptions): string {
  const { capability, selectedText, params } = opts;
  const chapter = getCurrentChapter(context);
  const chapterTitle = chapter?.title || '';
  const fullContent = chapter?.content || '';
  const prefix = getPrefixContext(context, 3000);

  const parts: string[] = [];

  if (capability === 'continue') {
    parts.push(`【当前章节】《${chapterTitle}》`);
    parts.push(`【前文（光标前内容）】\n${prefix}`);
    parts.push('\n请从光标处直接开始续写：');
  } else if (capability === 'rewrite' && selectedText) {
    parts.push(`【当前章节】《${chapterTitle}》`);
    parts.push(`【选区前文（末200字）】...${prefix.slice(-200)}`);
    parts.push(`【需要改写的原文】\n${selectedText}`);
    parts.push('\n请直接输出改写后的文字：');
  } else if (capability === 'review') {
    parts.push(`【章节标题】《${chapterTitle}》`);
    parts.push(`【章节正文】\n${fullContent}`);
    parts.push('\n请给出审稿意见：');
  } else if (capability === 'polish' || capability === 'expand' || capability === 'compress') {
    parts.push(`【需要处理的文字】\n${selectedText || fullContent}`);
    parts.push(`\n请直接输出处理后的文字：`);
  } else if (capability === 'dialog' && opts.speakerId) {
    const speaker = context.characters.find(c => c.id === opts.speakerId);
    if (speaker) parts.push(`【说话角色】${speaker.name}`);
    parts.push(`【当前场景上下文】\n${prefix.slice(-500)}`);
    parts.push('\n请以该角色口吻写出接下来要说的话：');
  } else if (capability === 'consistency') {
    parts.push(`【当前章节】《${chapterTitle}》`);
    parts.push(`【章节正文】\n${fullContent}`);
    parts.push('\n请检查一致性问题：');
  } else if (capability === 'outline') {
    parts.push(`【当前进度】第${chapter?.number || 0}章《${chapterTitle}》`);
    if (context.book.synopsis) parts.push(`【简介】${context.book.synopsis}`);
    if (params?.userInstruction) parts.push(`\n【需求】${params.userInstruction}`);
    parts.push('\n请给出后续大纲建议：');
  } else {
    parts.push(`【当前章节】《${chapterTitle}》\n${prefix}`);
  }

  return parts.join('\n\n');
}

/**
 * 创建一个空的WritingContext（用于初始化新书）
 */
export function createEmptyContext(book: { title: string; genre: string }): WritingContext {
  return {
    book: {
      id: 'book-1',
      title: book.title,
      genre: book.genre,
      styleConfig: {
        tone: 0.5, pov: 'third-limited', pace: 0.5,
        dialogRatio: 0.35, descriptionDensity: 0.5, classicalRatio: 0, humor: 0.2,
      },
    },
    characters: [],
    settings: [],
    volumes: [],
    subplots: [],
    chapters: [],
    foreshadows: [],
    currentChapterId: null,
    cursorPosition: 0,
    selection: null,
    recentPatterns: {
      openingTypes: [],
      endingTypes: [],
      negationRevealStreak: 0,
      sensoryOpeningStreak: 0,
    },
  };
}

/**
 * 章节写完后更新上下文（更新模式追踪、伏笔状态等）
 */
export function updateContextAfterChapter(
  context: WritingContext,
  chapterContent: string,
  _endingState?: ChapterEndingState
): void {
  // 更新开头/结尾模式追踪
  const firstSentence = chapterContent.split(/[。！？…]/)[0]?.trim() || '';
  const lastSentences = chapterContent.split(/[。！？…]/).filter(s => s.trim()).slice(-4);

  // 检测开头类型
  let openingType = 'description';
  if (/^(疼|麻|冷|热|烫|酸|胀|痒|涩|静|响|湿|干|硬|软|重|轻)[。！？]?$/.test(firstSentence) || firstSentence.length <= 2) {
    openingType = 'single-sensory';
  } else if (/^[""「"]/.test(firstSentence)) {
    openingType = 'dialogue';
  }

  // 检测结尾类型
  const endingText = lastSentences.join('');
  const usesNegationReveal = /不是[^，。？！]{1,10}[，。][^，。？！]{1,8}是/.test(endingText);

  if (!context.recentPatterns) {
    context.recentPatterns = { openingTypes: [], endingTypes: [], negationRevealStreak: 0, sensoryOpeningStreak: 0 };
  }

  const rp = context.recentPatterns;
  rp.openingTypes.push(openingType);
  rp.endingTypes.push(usesNegationReveal ? 'negation-reveal' : 'normal');

  // 追踪连续使用
  if (openingType === 'single-sensory') {
    rp.sensoryOpeningStreak++;
  } else {
    rp.sensoryOpeningStreak = 0;
  }

  if (usesNegationReveal) {
    rp.negationRevealStreak++;
  } else {
    rp.negationRevealStreak = 0;
  }

  // 只保留最近5章
  if (rp.openingTypes.length > 5) rp.openingTypes = rp.openingTypes.slice(-5);
  if (rp.endingTypes.length > 5) rp.endingTypes = rp.endingTypes.slice(-5);
}
