/**
 * book-checker.ts - 全书级别检测器
 *
 * 使用 BookContext 对多章文本进行连续性/一致性/套路化检测
 */

import { BookContext, ChapterSnapshot, extractSettingRules, extractForeshadowing, detectOpeningPattern, detectEndingPattern } from './book-context';
import type { BookIssue } from './book-context';

export interface BookCheckResult {
  issues: BookIssue[];
  chapters: ChapterSnapshot[];
  stats: {
    totalChapters: number;
    totalChars: number;
    openingTypeCounts: Record<string, number>;
    endingTypeCounts: Record<string, number>;
    totalForeshadowing: number;
    unresolvedForeshadowing: number;
    repetitiveOpenings: number;
    repetitiveEndings: number;
    settingViolations: number;
    continuityBreaks: number;
  };
}

const CHAPTER_HEADER = /第[一二三四五六七八九十百千万零\d]+[章节回卷部][\s\n]*/g;

/** 将文本拆分为章节 */
export function splitChapters(text: string): { title: string; content: string; index: number }[] {
  // 找到所有章节标题位置
  const matches = [...text.matchAll(CHAPTER_HEADER)];
  if (matches.length === 0) {
    return [{ title: '全文', content: text.trim(), index: 0 }];
  }

  const chapters: { title: string; content: string; index: number }[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const titleStart = match.index ?? 0;
    const contentStart = titleStart + match[0].length;
    const contentEnd = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const title = match[0].trim();
    const content = text.slice(contentStart, contentEnd).trim();

    if (content.length > 30) {
      chapters.push({ title, content, index: chapters.length });
    }
  }

  return chapters.length > 0 ? chapters : [{ title: '全文', content: text.trim(), index: 0 }];
}

/** 从单章文本提取ChapterSnapshot */
export function extractChapterSnapshot(text: string, index: number, title: string = `第${index + 1}章`): ChapterSnapshot {
  const sentences = text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[。！？…])\s*\n?|(?<=[。！？])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const firstSentence = sentences[0] || text.slice(0, 20);
  const lastSentences = sentences.slice(-5);

  // 提取人物（简单规则：2-3字中文名，出现>=2次）
  const nameRegex = /[\u4e00-\u9fa5]{2,3}(?=说|道|问|喊|叫|笑|怒|叹|想|看|听|走|跑|站|蹲|转身|回头|点头|摇头|皱眉|咬|握|拿|举|伸|抬)/g;
  const nameCounts = new Map<string, number>();
  let m;
  while ((m = nameRegex.exec(text)) !== null) {
    const name = m[0];
    // 过滤常见代词和普通词
    if (/^(自己|大家|众人|对方|这个|那个|什么|怎么|没有|不是|可以|已经|突然|然后|可是|但是|如果|因为|所以|虽然|只是|就是|还是|还有|有些|一点|一下|一声|一眼|脸上|心里|眼中|时候|地方|东西|声音|样子|问题|事情)/.test(name)) continue;
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }

  const characterStates = new Map<string, { name: string; lastLocation: string; lastAction: string; lastChapter: number }>();
  for (const [name, count] of nameCounts) {
    if (count >= 2) {
      // 找人物最后出现的动作
      const lastIdx = text.lastIndexOf(name);
      const context = text.slice(Math.max(0, lastIdx - 10), Math.min(text.length, lastIdx + 30));
      characterStates.set(name, {
        name,
        lastLocation: '',
        lastAction: context.slice(0, 30),
        lastChapter: index,
      });
    }
  }

  // 提取结尾场景关键词（最后200字中的地点/环境词）
  const endingText = text.slice(-200);
  const closingScene = endingText.slice(0, 50);

  const settingRules = extractSettingRules(text, index);
  const foreshadowing = extractForeshadowing(text, index);

  return {
    index,
    title,
    firstSentence,
    openingPattern: detectOpeningPattern(firstSentence),
    lastSentences,
    endingPattern: detectEndingPattern(lastSentences),
    characterStates,
    settingRules,
    foreshadowing,
    resolvedForeshadow: [],
    closingScene,
    charCount: text.length,
  };
}

/** 对全书文本进行检测 */
export function checkBook(fullText: string): BookCheckResult {
  const chapters = splitChapters(fullText);
  const ctx = new BookContext();
  const allIssues: BookIssue[] = [];
  const snapshots: ChapterSnapshot[] = [];

  let totalChars = 0;
  const openingCounts: Record<string, number> = {};
  const endingCounts: Record<string, number> = {};
  let repOpen = 0, repEnd = 0, setVio = 0, contBrk = 0;

  for (const { title, content, index } of chapters) {
    const snap = extractChapterSnapshot(content, index, title);
    snapshots.push(snap);
    totalChars += snap.charCount;

    openingCounts[snap.openingPattern.type] = (openingCounts[snap.openingPattern.type] || 0) + 1;
    endingCounts[snap.endingPattern.type] = (endingCounts[snap.endingPattern.type] || 0) + 1;

    const issues = ctx.addChapter(snap);
    for (const issue of issues) {
      allIssues.push(issue);
      if (issue.type === 'repetitive-opening') repOpen++;
      if (issue.type === 'repetitive-ending') repEnd++;
      if (issue.type === 'setting-violation') setVio++;
      if (issue.type === 'continuity-break') contBrk++;
    }
  }

  const stats = ctx.getStats();

  return {
    issues: allIssues,
    chapters: snapshots,
    stats: {
      totalChapters: chapters.length,
      totalChars,
      openingTypeCounts: openingCounts,
      endingTypeCounts: endingCounts,
      totalForeshadowing: stats.totalForeshadowing,
      unresolvedForeshadowing: stats.unresolvedForeshadowing,
      repetitiveOpenings: repOpen,
      repetitiveEndings: repEnd,
      settingViolations: setVio,
      continuityBreaks: contBrk,
    },
  };
}

/** 对章节文件列表进行检测（每章一个文件） */
export function checkChapterFiles(files: { name: string; content: string }[]): BookCheckResult {
  const ctx = new BookContext();
  const allIssues: BookIssue[] = [];
  const snapshots: ChapterSnapshot[] = [];

  let totalChars = 0;
  const openingCounts: Record<string, number> = {};
  const endingCounts: Record<string, number> = {};
  let repOpen = 0, repEnd = 0, setVio = 0, contBrk = 0;

  for (let i = 0; i < files.length; i++) {
    const { name, content } = files[i];
    const snap = extractChapterSnapshot(content, i, name);
    snapshots.push(snap);
    totalChars += snap.charCount;

    openingCounts[snap.openingPattern.type] = (openingCounts[snap.openingPattern.type] || 0) + 1;
    endingCounts[snap.endingPattern.type] = (endingCounts[snap.endingPattern.type] || 0) + 1;

    const issues = ctx.addChapter(snap);
    for (const issue of issues) {
      allIssues.push(issue);
      if (issue.type === 'repetitive-opening') repOpen++;
      if (issue.type === 'repetitive-ending') repEnd++;
      if (issue.type === 'setting-violation') setVio++;
      if (issue.type === 'continuity-break') contBrk++;
    }
  }

  const stats = ctx.getStats();

  return {
    issues: allIssues,
    chapters: snapshots,
    stats: {
      totalChapters: files.length,
      totalChars,
      openingTypeCounts: openingCounts,
      endingTypeCounts: endingCounts,
      totalForeshadowing: stats.totalForeshadowing,
      unresolvedForeshadowing: stats.unresolvedForeshadowing,
      repetitiveOpenings: repOpen,
      repetitiveEndings: repEnd,
      settingViolations: setVio,
      continuityBreaks: contBrk,
    },
  };
}
