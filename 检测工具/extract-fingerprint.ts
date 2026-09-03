/**
 * InkWeave 质量指纹提取器 v4.5.2
 * 
 * 从检测报告中提取前章第一轮的质量指纹，
 * 供下一章生成时注入为预生成约束。
 * 
 * 用法：npx tsx extract-fingerprint.ts <章节文件路径>
 * 输出：JSON格式的质量指纹，可直接嵌入生成指令
 * 
 * 原理来源：LibriScribe ContentQualityAgent 的 Style Constraints 注入机制
 * 效果：将检测器发现的问题作为"前车之鉴"注入下一章，预防重复犯错
 */

import * as fs from 'fs';
import * as path from 'path';
import { checkChapter, computeTextStats } from './checkers.js';

interface QualityFingerprint {
  chapterName: string;
  timestamp: string;
  issues: {
    dashes: number;
    notXButY: number;
    commaChainRatio: number;
    wordCount: number;
    targetWords: number;
    wordCountOverflow: string;
    repeatedPhrases: string[];
    actionWordOveruse: string[];
    dialogueRatio: number;
    sensoryImbalance: string;
  };
  constraints: string[];
}

function extractFingerprint(filePath: string, targetWords: number = 3000): QualityFingerprint {
  const text = fs.readFileSync(filePath, 'utf-8');
  const chapterName = path.basename(filePath, '.md');
  const { stats, violations } = checkChapter(text, targetWords);
  const fullStats = computeTextStats(text);

  // 提取具体问题
  const dashes = (text.match(/——/g) || []).length;
  const notXButY = (text.match(/不是.{1,20}，.{0,5}是/g) || []).length;
  
  // 计算逗号/句号比
  const commas = (text.match(/，/g) || []).length;
  const periods = (text.match(/。/g) || []).length;
  const commaChainRatio = periods > 0 ? +(commas / periods).toFixed(1) : 0;

  // 计算字数
  const actualWords = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const overflow = ((actualWords - targetWords) / targetWords * 100).toFixed(0);

  // 提取高频短语（>3次）
  const phraseCounts: Record<string, number> = {};
  const phraseRegex = /[\u4e00-\u9fff]{2,4}/g;
  let match: RegExpExecArray | null;
  while ((match = phraseRegex.exec(text)) !== null) {
    const phrase = match[0];
    phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
  }
  const repeatedPhrases = Object.entries(phraseCounts)
    .filter(([, count]) => count > 5)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([phrase, count]) => `${phrase}(${count}次)`);

  // 对话比例
  const dialogueChars = (text.match(/[""「」『』]/g) || []).length;
  const totalChars = text.replace(/\s/g, '').length;
  const dialogueRatio = totalChars > 0 ? +(dialogueChars / totalChars * 100).toFixed(0) : 0;

  // 感官失衡
  const sensory = fullStats.sensoryMentions;
  const visualRatio = sensory.视觉 || 0;
  const totalSensory: number = (Object.values(sensory) as number[]).reduce((a: number, b: number) => a + b, 0);
  const sensoryImbalance = totalSensory > 0 
    ? `视觉${visualRatio}次占${(visualRatio/totalSensory*100).toFixed(0)}%` 
    : '无感官数据';

  // 生成约束语句
  const constraints: string[] = [];
  
  if (dashes > 0) {
    constraints.push(`上一章出现了${dashes}个破折号，本章必须确保0破折号。认知翻转用逗号，对话中断用动作打断。`);
  }
  if (notXButY > 0) {
    constraints.push(`上一章出现了${notXButY}处"不是X是Y"句式，本章必须确保0处。直接写Y的具体表现。`);
  }
  if (commaChainRatio > 5.0) {
    constraints.push(`上一章逗号/句号比${commaChainRatio}:1偏高。本章只禁"一逗到底"（一口气连写不换气）；读着顺的连写保留，严禁为压低逗句比把句子剁碎。`);
  }
  if (Math.abs(parseInt(overflow)) > 20) {
    constraints.push(`上一章字数${actualWords}（超标${overflow}%），本章必须控制在${targetWords}±20%内。每完成一个场景就数一下字数。`);
  }
  if (dialogueRatio < 5) {
    constraints.push(`上一章对话比例仅${dialogueRatio}%（目标≥5%），本章必须确保对话占比不低于5%。`);
  }
  if (repeatedPhrases.length > 0) {
    constraints.push(`上一章高频短语：${repeatedPhrases.join('、')}。本章必须轮换表达方式。`);
  }

  return {
    chapterName,
    timestamp: new Date().toISOString(),
    issues: {
      dashes,
      notXButY,
      commaChainRatio,
      wordCount: actualWords,
      targetWords,
      wordCountOverflow: `${overflow}%`,
      repeatedPhrases,
      actionWordOveruse: [],
      dialogueRatio,
      sensoryImbalance,
    },
    constraints,
  };
}

// CLI
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('用法：npx tsx extract-fingerprint.ts <章节文件路径> [--target 3000]');
    process.exit(1);
  }

  let targetWords = 3000;
  const filePath = args[0];
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--target' && i + 1 < args.length) {
      targetWords = parseInt(args[i + 1], 10);
    }
  }

  const fingerprint = extractFingerprint(filePath, targetWords);
  console.log(JSON.stringify(fingerprint, null, 2));
}

main();