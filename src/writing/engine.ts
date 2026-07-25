/* ============================================================
   GWE v4.0 — 写作引擎主入口
   整合：质量检测 + 全书连贯性检测 + Prompt构建 + 上下文管理
   ============================================================ */

import { createEngineWithKB } from '../kb-loader';
import { MockProvider } from '../llm-provider';
import type { CheckResult } from '../types';
import { BookContext } from '../book-context';
import { checkBook, extractChapterSnapshot } from '../book-checker';
import type { BookCheckResult } from '../book-checker';

import type {
  WritingContext,
  ChatMessage,
  CapabilityId,
  CapabilityParams,
  Character,
  Setting,
  Chapter,
  Foreshadow,
  WritingPreset,
  ChapterEndingState,
} from './types';

import {
  buildWritingMessages,
  createEmptyContext,
  updateContextAfterChapter,
  getCurrentChapter,
} from './context-builder';

// v6.2: 类人认知模块
import { ReaderModel } from '../technique/reader-model';
import { PacingCurve } from '../planning/pacing-curve';
import { createLearningBridge } from './learning-bridge';
import type { LearningBridge } from './learning-bridge';
import { TechniqueLibrary } from '../technique/library';
import type { TechniqueRecommendContext, TechniqueRecommendation } from '../technique/types';

// v10.0: 反模式追踪模块
import { ChapterTypeTracker } from '../anti-pattern/chapter-type-tracker';
import type { ChapterTypeTrackResult } from '../anti-pattern/chapter-type-tracker';
import { ConflictDiversityCheck } from '../anti-pattern/conflict-diversity-check';
import type { ConflictDiversityResult } from '../anti-pattern/conflict-diversity-check';
import { TemplateComposer } from '../anti-pattern/template-composer';
import type { TemplateComposerResult } from '../anti-pattern/template-composer';
import type { LLMProvider } from '../types';

export interface GWEWritingEngine {
  /** 获取当前写作上下文 */
  getContext(): WritingContext;

  /** 设置/更新书籍信息 */
  setBook(book: Partial<WritingContext['book']>): void;

  /** 添加角色 */
  addCharacter(char: Character): void;

  /** 添加设定 */
  addSetting(setting: Setting): void;

  /** 添加章节 */
  addChapter(chapter: Chapter): void;

  /** 更新当前章节内容 */
  updateChapterContent(chapterId: string, content: string): void;

  /** 添加伏笔 */
  addForeshadow(fs: Omit<Foreshadow, 'id' | 'status'>): void;

  /** 标记伏笔已回收 */
  resolveForeshadow(keyword: string, chapterNum: number): void;

  /** 设置当前章节和光标位置 */
  setCursor(chapterId: string, position: number): void;

  /** 构建AI写作消息（续写/改写/审稿等） */
  buildMessages(capability: CapabilityId, params?: CapabilityParams): ChatMessage[];

  /** 对当前章节做质量检测（单章） */
  checkCurrentChapter(): CheckResult | null;

  /** 对全书做连贯性检测 */
  checkBookContinuity(): BookCheckResult;

  /** 写完一章后更新上下文状态（模式追踪/伏笔等） */
  finishChapter(chapterId: string, endingState?: ChapterEndingState): void;

  /** 应用预设 */
  applyPreset(preset: WritingPreset): void;

  /** 获取防套路提示（给用户看的） */
  getAntiPatternHints(): string[];

  /** v6.2: 获取章节反馈（ReaderModel + PacingCurve + LearningBridge） */
  getChapterFeedback(chapterId: string): ChapterFeedback | null;

  /** v6.2: 推荐写作技法（用户主动调用） */
  suggestTechnique(context: TechniqueRecommendContext): TechniqueRecommendation[];

  /** v6.2: 记录用户编辑 */
  recordEdit(params: { original: string; modified: string; chapterNumber: number; note?: string; position?: number }): void;

  /** v6.2: 记录用户接受 */
  recordAccept(chapterNumber: number, content: string): void;

  /** v6.2: 记录用户拒绝 */
  recordReject(chapterNumber: number, content: string, reason?: string): void;

  /** v6.2: 获取学习到的建议 */
  getLearnedSuggestions(): { warnings: string[]; styleInjection: string; summary: ReturnType<LearningBridge['getLearningSummary']> };

  /** v10.0: 异步分析章节反模式（章类型+冲突多样性+模板组合） */
  analyzeChapterAntiPattern(chapterId: string, llm?: LLMProvider | null): Promise<AntiPatternAnalysisResult | null>;

  /** v10.0: 获取反模式追踪状态（章类型分布、冲突分布、模板组合历史） */
  getAntiPatternStatus(): AntiPatternStatus;

  /** v10.0: 设置LLM Provider（用于反模式分析） */
  setLLMProvider(llm: LLMProvider | null): void;
}

/** v10.0: 反模式分析结果 */
export interface AntiPatternAnalysisResult {
  /** 章类型追踪结果 */
  chapterType: ChapterTypeTrackResult;
  /** 冲突多样性检测结果 */
  conflictDiversity: ConflictDiversityResult;
  /** 模板组合推荐结果 */
  templateCombo: TemplateComposerResult;
}

/** v10.0: 反模式追踪状态 */
export interface AntiPatternStatus {
  /** 章类型分布 */
  chapterTypeDistribution: Record<string, number>;
  /** 冲突类型分布 */
  conflictDistribution: Record<string, number>;
  /** 解决方式分布 */
  resolutionDistribution: Record<string, number>;
  /** 模板组合历史 */
  comboHistory: string[];
  /** 冷却状态 */
  cooldownStatus: Array<{ comboId: string; onCooldown: boolean; chaptersLeft: number }>;
}

/** v6.2: 章节反馈数据类型 */
export interface ChapterFeedback {
  chapterId: string;
  readerAnalysis: {
    overallScore: { engagement: number; readability: number; emotionalImpact: number; retention: number };
    dropRiskPoints: Array<{ position: number; risk: number; reason: string; snippet: string }>;
    report: string;
  } | null;
  pacingIssues: string[];
  pacingAdvice: string | null;
  learnedWarnings: string[];
}

/**
 * 创建GWE写作引擎实例
 */
export function createWritingEngine(): GWEWritingEngine {
  // 初始化检测引擎
  const { engine: checkEngine } = createEngineWithKB(new MockProvider());
  const bookContext = new BookContext();

  // v6.2: 初始化类人认知模块
  const readerModel = new ReaderModel();
  const pacingCurve = new PacingCurve();
  const learningBridge = createLearningBridge();
  const techniqueLibrary = new TechniqueLibrary();
  const chapterFeedback = new Map<string, ChapterFeedback>();

  // v10.0: 初始化反模式追踪模块
  const chapterTypeTracker = new ChapterTypeTracker();
  const conflictDiversityCheck = new ConflictDiversityCheck();
  const templateComposer = new TemplateComposer();
  let llmProvider: LLMProvider | null = null;

  // 初始化空上下文
  let context: WritingContext = createEmptyContext({ title: '未命名作品', genre: '通用' });

  return {
    getContext() {
      return context;
    },

    setBook(book) {
      context.book = { ...context.book, ...book };
    },

    addCharacter(char) {
      const idx = context.characters.findIndex(c => c.id === char.id);
      if (idx >= 0) {
        context.characters[idx] = { ...context.characters[idx], ...char };
      } else {
        context.characters.push(char);
      }
    },

    addSetting(setting) {
      const idx = context.settings.findIndex(s => s.id === setting.id);
      if (idx >= 0) {
        context.settings[idx] = { ...context.settings[idx], ...setting };
      } else {
        context.settings.push(setting);
      }
    },

    addChapter(chapter) {
      const idx = context.chapters.findIndex(c => c.id === chapter.id);
      if (idx >= 0) {
        context.chapters[idx] = { ...context.chapters[idx], ...chapter };
      } else {
        context.chapters.push(chapter);
      }
      // 排序
      context.chapters.sort((a, b) => a.number - b.number);
    },

    updateChapterContent(chapterId, content) {
      const ch = context.chapters.find(c => c.id === chapterId);
      if (ch) {
        ch.content = content;
        ch.wordCount = content.length;
      }
    },

    addForeshadow(fs) {
      const id = `fs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      context.foreshadows.push({
        ...fs,
        id,
        status: 'planted',
      });
    },

    resolveForeshadow(keyword, chapterNum) {
      const fs = context.foreshadows.find(
        f => f.keyword === keyword || keyword.includes(f.keyword)
      );
      if (fs) {
        fs.status = 'resolved';
        fs.resolvedInChapter = chapterNum;
      }
    },

    setCursor(chapterId, position) {
      context.currentChapterId = chapterId;
      context.cursorPosition = position;
    },

    buildMessages(capability, params) {
      return buildWritingMessages(context, {
        capability,
        params,
        selectedText: context.selection?.text,
        speakerId: params?.speakerId as string | undefined,
        bookContext,  // v7.0: 传递跨章上下文
      });
    },

    checkCurrentChapter() {
      const chapter = getCurrentChapter(context);
      if (!chapter || !chapter.content.trim()) return null;
      return checkEngine.check(chapter.content);
    },

    checkBookContinuity() {
      // 将所有章节合并为一个文本，用章节标题分隔
      const fullText = context.chapters
        .map(ch => `${ch.title}\n${ch.content}`)
        .join('\n\n');
      return checkBook(fullText);
    },

    finishChapter(chapterId, endingState) {
      const ch = context.chapters.find(c => c.id === chapterId);
      if (!ch) return;

      ch.endingState = endingState;
      ch.status = 'done';

      // 更新模式追踪
      updateContextAfterChapter(context, ch.content, endingState);

      // 将章节加入BookContext进行跨章分析
      const snap = extractChapterSnapshot(ch.content, ch.number - 1, ch.title);
      bookContext.addChapter(snap);

      // v6.2: 写后反馈分析（走旁路，不影响核心链路）
      const chapterContent = ch.content;
      if (chapterContent && chapterContent.trim()) {
        // ReaderModel: 读者弃书风险分析
        const sim = readerModel.simulateReading(chapterContent);
        const report = readerModel.generateReport(sim);

        // PacingCurve: 节奏分析
        const allDone = context.chapters
          .filter(c => c.status === 'done' || c.id === chapterId)
          .sort((a, b) => a.number - b.number)
          .map(c => ({ number: c.number, content: c.content }));
        pacingCurve.analyzeRhythm(allDone);
        const pacingIssues = pacingCurve.detectIssues();
        const pacingAdvice = pacingCurve.generatePacingAdvice();

        // LearningBridge: 定期风格采样
        learningBridge.updateStyleProfile([{ number: ch.number, content: chapterContent }]);

        chapterFeedback.set(chapterId, {
          chapterId,
          readerAnalysis: {
            overallScore: sim.overallScore,
            dropRiskPoints: sim.dropRiskPoints,
            report,
          },
          pacingIssues,
          pacingAdvice: pacingIssues.length > 0 ? pacingAdvice : null,
          learnedWarnings: learningBridge.getPreWriteWarnings(),
        });
      }
    },

    applyPreset(preset) {
      context.book.genre = preset.genre;
      if (preset.styleConfig) {
        context.book.styleConfig = { ...context.book.styleConfig, ...preset.styleConfig } as any;
      }
      if (preset.worldPremise) {
        context.book.worldPremise = preset.worldPremise;
      }
      if (preset.rules) {
        context.book.globalRules = [...(context.book.globalRules || []), ...preset.rules];
      }
      if (preset.baseCharacters) {
        for (const ch of preset.baseCharacters) {
          this.addCharacter(ch);
        }
      }
      if (preset.baseSettings) {
        for (const s of preset.baseSettings) {
          this.addSetting(s);
        }
      }
    },

    getAntiPatternHints() {
      const hints: string[] = [];
      const rp = context.recentPatterns;
      if (rp) {
        if (rp.sensoryOpeningStreak >= 1) {
          const n = rp.sensoryOpeningStreak;
          hints.push(n === 1 ? '上一章用了单字感官开头，建议本章换对话或动作开头' : `连续${n}章用了单字感官开头，建议本章换对话或动作开头`);
        }
        if (rp.negationRevealStreak >= 1) {
          const n = rp.negationRevealStreak;
          hints.push(n === 1 ? '上一章结尾用了"不是X是Y"揭示，建议换结尾方式' : `连续${n}章结尾用了"不是X是Y"揭示，建议换结尾方式`);
        }
      }

      // v10.0: 章类型追踪提示
      const ctHistory = context.chapterTypeHistory;
      if (ctHistory && ctHistory.length > 0) {
        const recent = ctHistory.slice(-8);
        let consecutive = 0;
        const lastType = recent[recent.length - 1]?.type;
        for (let i = recent.length - 1; i >= 0; i--) {
          if (recent[i].type === lastType) consecutive++;
          else break;
        }
        if (consecutive >= 3) {
          hints.push(`连续${consecutive}章为同一类型（${lastType}），建议变换章功能类型`);
        }
      }

      // v10.0: 冲突多样性提示
      const cfHistory = context.conflictHistory;
      if (cfHistory && cfHistory.length >= 3) {
        const recent = cfHistory.slice(-5);
        const uniqueTypes = new Set(recent.map(r => r.primaryConflict));
        if (uniqueTypes.size < 3) {
          hints.push(`最近${recent.length}章冲突类型仅${uniqueTypes.size}种，建议增加冲突维度多样性`);
        }
      }

      // 未回收伏笔提醒
      const currentCh = getCurrentChapter(context);
      const chNum = currentCh?.number ?? context.chapters.length + 1;
      const urgentFs = context.foreshadows.filter(
        f => f.status !== 'resolved' && f.importance >= 2 && chNum - f.plantedInChapter >= 5
      );
      for (const fs of urgentFs) {
        hints.push(`伏笔"${fs.keyword}"已${chNum - fs.plantedInChapter}章未回收，建议本章推进`);
      }

      return hints;
    },

    // v6.2: 类人认知接口

    getChapterFeedback(chapterId) {
      return chapterFeedback.get(chapterId) || null;
    },

    suggestTechnique(ctx) {
      return techniqueLibrary.recommend(ctx);
    },

    recordEdit(params) {
      learningBridge.recordEdit(params);
    },

    recordAccept(chapterNumber, content) {
      learningBridge.recordAccept(chapterNumber, content);
    },

    recordReject(chapterNumber, content, reason) {
      learningBridge.recordReject(chapterNumber, content, reason);
    },

    getLearnedSuggestions() {
      return {
        warnings: learningBridge.getPreWriteWarnings(),
        styleInjection: learningBridge.getStyleInjection(),
        summary: learningBridge.getLearningSummary(),
      };
    },

    // v10.0: 反模式追踪接口

    setLLMProvider(llm) {
      llmProvider = llm;
    },

    async analyzeChapterAntiPattern(chapterId, llm) {
      const ch = context.chapters.find(c => c.id === chapterId);
      if (!ch || !ch.content.trim()) return null;

      const provider = llm || llmProvider;

      // 1. 章类型检测
      const chapterTypeResult = await chapterTypeTracker.detectChapterType(
        ch.content, ch.number, ch.title, provider || undefined,
      );

      // 2. 冲突多样性检测
      const conflictResult = await conflictDiversityCheck.analyzeConflict(
        ch.content, ch.number, provider || undefined,
      );

      // 3. 模板组合推荐
      const recentComboIds = context.templateComboHistory?.map(h => h.comboId) || [];
      templateComposer.setComboHistory(recentComboIds);

      const diversityWarnings = [
        ...chapterTypeResult.warnings.map(w => w.message),
        ...conflictResult.warnings.map(w => w.message),
      ].join('; ');

      const comboResult = await templateComposer.recommendCombo({
        chapterType: chapterTypeResult.type,
        conflictType: conflictResult.primaryConflict,
        chapterIntent: ch.title,
        genre: context.book.genre,
        prefixContent: ch.content.slice(-500),
        recentComboIds,
        recommendedChapterType: chapterTypeResult.recommendedNext[0],
        recommendedConflictType: conflictResult.recommendedConflictTypes[0],
        diversityWarnings: diversityWarnings || undefined,
      }, provider || undefined);

      // 4. 更新上下文追踪历史
      if (!context.chapterTypeHistory) context.chapterTypeHistory = [];
      context.chapterTypeHistory.push({
        chapterNumber: ch.number,
        chapterTitle: ch.title,
        type: chapterTypeResult.type,
        confidence: chapterTypeResult.confidence,
        detectedBy: chapterTypeResult.detectedBy,
      });
      if (context.chapterTypeHistory.length > 30) {
        context.chapterTypeHistory = context.chapterTypeHistory.slice(-30);
      }

      if (!context.conflictHistory) context.conflictHistory = [];
      context.conflictHistory.push({
        chapterNumber: ch.number,
        primaryConflict: conflictResult.primaryConflict,
        secondaryConflicts: conflictResult.secondaryConflicts as string[],
        resolution: conflictResult.resolution,
        confidence: conflictResult.confidence,
        detectedBy: conflictResult.detectedBy,
      });
      if (context.conflictHistory.length > 30) {
        context.conflictHistory = context.conflictHistory.slice(-30);
      }

      if (!context.templateComboHistory) context.templateComboHistory = [];
      context.templateComboHistory.push({
        chapterNumber: ch.number,
        comboId: comboResult.combo.id,
      });
      if (context.templateComboHistory.length > 20) {
        context.templateComboHistory = context.templateComboHistory.slice(-20);
      }

      templateComposer.recordCombo(comboResult.combo.id);

      return {
        chapterType: chapterTypeResult,
        conflictDiversity: conflictResult,
        templateCombo: comboResult,
      };
    },

    getAntiPatternStatus() {
      return {
        chapterTypeDistribution: chapterTypeTracker.getTypeDistribution() as Record<string, number>,
        conflictDistribution: conflictDiversityCheck.getConflictDistribution() as Record<string, number>,
        resolutionDistribution: conflictDiversityCheck.getResolutionDistribution() as Record<string, number>,
        comboHistory: templateComposer.getComboHistory(),
        cooldownStatus: templateComposer.getCooldownStatus(),
      };
    },
  };
}

// 导出类型
export type { WritingContext, ChatMessage, CapabilityId, WritingPreset, Chapter, Character, Setting } from './types';
export { buildWritingMessages, createEmptyContext } from './context-builder';
