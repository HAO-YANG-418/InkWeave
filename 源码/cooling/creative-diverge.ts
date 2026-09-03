// ============================================================
// 创意发散管理器 (Creative Diverge Manager) — V5.0
// 职责：写前发散——冷却查重 → 选多样化模板 → 生成发散指引 → 注入prompt
// 核心功能：让AI每章在角色/冲突/对话/场景四个维度自然变化，避免重复
// ============================================================

import { CoolingSystem } from './cooling-system';
import type { CoolingStorage } from './cooling-system';

// === 创意选项池（品类无关，通用于所有网文类型） ===

/** 角色登场方式池 */
const CHARACTER_INTRO_POOLS: Record<string, string[]> = {
  '动作先于外貌': ['先写角色在做什么动作，再写长什么样', '用一连串动作展示角色性格，不给外貌描述'],
  '物件先于人': ['先写角色的标志性物件（武器/工具/饰品），再引入人', '让物件替角色说话，物件出场后才给名字'],
  '对话先于描写': ['角色先开口说话，从台词中让读者感知身份', '第一句话就是角色性格的浓缩'],
  '环境烘托': ['通过环境氛围暗示角色性格，不直接描写', '环境变化（温度/光线/声音）先于角色出场'],
  '他人视角': ['通过其他角色对其的反应来引入，不直接描写', '旁观者的身体反应替代对角色本人的描写'],
  '意外登场': ['在最不可能出现的时候出现，打破读者预期', '用一个意料之外的动作或声音突然切入'],
  '沉默登场': ['角色出现但不说话，用存在感压迫场景', '不说话但气场改变环境，让读者感知到'],
};

/** 冲突推进方式池 */
const CONFLICT_PROGRESSION_POOLS: Record<string, string[]> = {
  '信息不对等': ['一方知道另一方不知道的事，信息差制造张力', '读者知道但角色不知道，制造悬疑'],
  '目标冲突': ['双方想要同一件东西，但只能有一个人拿到', '双方目标完全相反，必须有一方让步'],
  '价值观冲突': ['双方对同一件事有完全不同的判断，但不涉及利益', '对错不重要，重要的是两人都认为自己是对的'],
  '时间压力': ['必须在限定时间内完成某事，否则后果严重', '倒计时制造紧迫感，每拖延一秒代价增加'],
  '信任危机': ['已有的信任关系被打破，猜疑升级', '怀疑的种子一旦种下，每件小事都变成证据'],
  '制度压迫': ['不是个人，是规则/制度/系统在压迫主角', '不是某个人要为难主角，是规则本身不给人活路'],
  '空间压迫': ['物理空间在压缩主角的选择，越来越窄', '不是人堵路，是空间本身在变化'],
};

/** 对话风格池 */
const DIALOGUE_STYLE_POOLS: Record<string, string[]> = {
  '试探性': ['双方都在试探对方底线，每句话都在搜集信息', '不直接问，用迂回的方式套话'],
  '对抗性': ['直接碰撞，针锋相对，每句话都像刀子', '对话就是战斗，每一句都是攻击和反击'],
  '隐瞒性': ['一方在隐瞒关键信息，另一方在追问', '说出来的和想的是两回事，读者能感知到没说出来的'],
  '交易性': ['各取所需，讨价还价，每句话都在计算', '对话本身就是谈判，信息就是筹码'],
  // 2026-08-31 改软：原「留白比填满更有力」会被模型读成"少说"，与好懂红线冲突。
  // 沉默只适用于**情绪层**（不直说角色感受），不适用于信息层（事件因果/动作链必须写清）。
  '沉默性': ['不说的话比说的话重要，沉默就是回答', '用停顿、眼神、动作代替语言（仅限情绪层：不直说角色感受；事件因果、动作链、谁做了什么必须写清，不许靠沉默藏信息）'],
  '误导性': ['故意说错的信息来引导对方做出错误判断', '看似在回答，实际上在把对方引向歧途'],
  '揭露性': ['对话中突然爆出关键信息，改变整个局面', '一句话让之前的所有对话都变了意思'],
};

/** 场景氛围池 */
const SCENE_ATMOSPHERE_POOLS: Record<string, string[]> = {
  '压迫感': ['空间逼仄，时间紧迫，每一个选择都有代价', '让读者感觉喘不过气，无处可逃'],
  '诡异感': ['看似正常但处处不对劲，细节在不断暗示异常', '正常的面具下裂开一条缝，让读者看到不正常的底色'],
  '孤独感': ['人物与环境格格不入，越热闹的地方越孤独', '人群中的孤独比独处时的孤独更刺骨'],
  '躁动感': ['山雨欲来，暗流涌动，每个人都在等什么发生', '所有人都在动，但没有人知道方向'],
  '静谧感': ['暴风雨前的宁静，安静本身比噪音更让人不安', '太安静了，安静到不正常'],
  '疏离感': ['熟悉的环境变得陌生，人物像在看别人的故事', '一切都还在，但一切都不一样了'],
  '宿命感': ['一切都是注定的，但人物还在挣扎', '明明知道结局，还要走完这条路'],
};

// === 发散结果 ===
export interface DivergeResult {
  /** 注入到system prompt的指引文本 */
  promptInjection: string;
  /** 本章使用的发散维度记录 */
  dimensions: {
    characterIntro: string;
    conflictProgression: string;
    dialogueStyle: string;
    sceneAtmosphere: string;
  };
}

// === 创意发散管理器 ===
export class CreativeDivergeManager {
  private cooling: CoolingSystem;
  private recentDiverge: Map<string, string[]> = new Map();
  private chapterNumber: number = 0;

  constructor(storage?: CoolingStorage) {
    this.cooling = new CoolingSystem(storage);
  }

  async init(chapterNumber: number): Promise<void> {
    this.chapterNumber = chapterNumber;
    await this.cooling.load(chapterNumber);
  }

  async save(): Promise<void> {
    await this.cooling.save();
  }

  // ===== 核心方法：生成发散指引 =====

  /**
   * 为当前章节生成创意发散指引
   * 在四个维度上选择与近期不同的选项，生成自然语言指引注入prompt
   */
  diverge(): DivergeResult {
    const characterIntro = this.selectOption('char_intro', CHARACTER_INTRO_POOLS);
    const conflictProgression = this.selectOption('conflict_prog', CONFLICT_PROGRESSION_POOLS);
    const dialogueStyle = this.selectOption('dialogue_style', DIALOGUE_STYLE_POOLS);
    const sceneAtmosphere = this.selectOption('scene_atmo', SCENE_ATMOSPHERE_POOLS);

    const promptInjection = this.buildPromptInjection({
      characterIntro,
      conflictProgression,
      dialogueStyle,
      sceneAtmosphere,
    });

    return {
      promptInjection,
      dimensions: { characterIntro, conflictProgression, dialogueStyle, sceneAtmosphere },
    };
  }

  /**
   * 记录本章使用的发散维度（写后调用）
   */
  recordUsage(dimensions: DivergeResult['dimensions']): void {
    this.cooling.recordTemplateUsage(`char_intro:${dimensions.characterIntro}`, '角色登场');
    this.cooling.recordTemplateUsage(`conflict_prog:${dimensions.conflictProgression}`, '冲突推进');
    this.cooling.recordTemplateUsage(`dialogue_style:${dimensions.dialogueStyle}`, '对话风格');
    this.cooling.recordTemplateUsage(`scene_atmo:${dimensions.sceneAtmosphere}`, '场景氛围');
  }

  /**
   * 推进章节（清理过期冷却记录）
   */
  advanceChapter(chapter: number): void {
    this.chapterNumber = chapter;
    this.cooling.advanceChapter(chapter);
  }

  /**
   * 获取冷却状态摘要（供调试用）
   */
  getCoolingSummary(): string {
    const records = this.cooling.getAllRecords();
    if (records.length === 0) return '无冷却记录';
    return records
      .filter(r => r.cooldown_until > this.chapterNumber)
      .map(r => `${r.id}: 剩余${r.cooldown_until - this.chapterNumber}章`)
      .join('; ');
  }

  reset(): void {
    this.cooling.reset();
    this.recentDiverge.clear();
  }

  // ===== 内部方法 =====

  private selectOption(prefix: string, pools: Record<string, string[]>): string {
    const keys = Object.keys(pools);
    const available = keys.filter(k => !this.cooling.isTemplateOnCooldown(`${prefix}:${k}`));

    // 如果全部在冷却中，选冷却剩余最少的
    if (available.length === 0) {
      let minRemaining = Infinity;
      let best = keys[0];
      for (const k of keys) {
        const remaining = this.cooling.getRemainingCooldown(`template_id:${prefix}:${k}`);
        if (remaining < minRemaining) {
          minRemaining = remaining;
          best = k;
        }
      }
      return best;
    }

    // 从可用池中随机选一个
    return available[Math.floor(Math.random() * available.length)];
  }

  private buildPromptInjection(dims: {
    characterIntro: string;
    conflictProgression: string;
    dialogueStyle: string;
    sceneAtmosphere: string;
  }): string {
    const charGuide = CHARACTER_INTRO_POOLS[dims.characterIntro] || [];
    const conflictGuide = CONFLICT_PROGRESSION_POOLS[dims.conflictProgression] || [];
    const dialogueGuide = DIALOGUE_STYLE_POOLS[dims.dialogueStyle] || [];
    const sceneGuide = SCENE_ATMOSPHERE_POOLS[dims.sceneAtmosphere] || [];

    const lines: string[] = [];
    lines.push('【创意发散指引 - 本章风格变体】');
    lines.push('以下指引用于确保本章与前后章节在叙事手法上有明显差异，避免重复套路：');
    lines.push('');
    lines.push(`角色登场方式：${dims.characterIntro}`);
    if (charGuide.length > 0) lines.push(`  → ${charGuide[0]}`);
    if (charGuide.length > 1) lines.push(`  → ${charGuide[1]}`);
    lines.push('');
    lines.push(`冲突推进方式：${dims.conflictProgression}`);
    if (conflictGuide.length > 0) lines.push(`  → ${conflictGuide[0]}`);
    if (conflictGuide.length > 1) lines.push(`  → ${conflictGuide[1]}`);
    lines.push('');
    lines.push(`对话风格：${dims.dialogueStyle}`);
    if (dialogueGuide.length > 0) lines.push(`  → ${dialogueGuide[0]}`);
    if (dialogueGuide.length > 1) lines.push(`  → ${dialogueGuide[1]}`);
    lines.push('');
    lines.push(`场景氛围：${dims.sceneAtmosphere}`);
    if (sceneGuide.length > 0) lines.push(`  → ${sceneGuide[0]}`);
    if (sceneGuide.length > 1) lines.push(`  → ${sceneGuide[1]}`);
    lines.push('');
    lines.push('注意：以上指引不是让你生硬套用，而是提醒你本章的叙事手法要与前后章有所区别。');

    return lines.join('\n');
  }
}