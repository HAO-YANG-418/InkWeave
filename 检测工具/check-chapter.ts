/**
 * InkWeave 增强版章节检测器 v4.9
 * 
 * 不依赖完整引擎，直接对 .md 文件运行算法级检测。
 * 用法：
 *   单章：inkweave check <章节文件> [--target 3000] [--fix] [--save-fingerprint] [--project <项目名>]
 *   跨章：inkweave check --cross <章1> <章2> <章3> ... [--project <项目名>]
 * 
 *   检测 + 自动修复：inkweave check <章节文件> --fix（仅修破折号→逗号，排比/感官需重写）
 *   检测 + 保存指纹：inkweave check <章节文件> --save-fingerprint
 *   检测逻辑全部在 checkers.ts 共享模块中。
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  TextStats, Violation, PrevChapterVerbStacking,
  checkChapter, checkCrossChapters,
  checkCrossChapterRepeat, checkSenseDensityWithPrev,
  checkCrossChapterFacts,
  formatSingleReport, formatCrossReport,
  autoFix,
} from './checkers.js';
import { extractChapterFacts, loadProjectProfiles, ChapterFact } from './extract-entities.js';
import { resolveChapterPath, getProjectPath, readProjectConfig } from './project-config.js';
import { checkCrossChapterSemantic, generateSemanticSummary, isSemanticEnabled } from './semantic-check.js';
// —— R1（方案B 双跑聚合）：额外跑生成时检测器树（源码/checker.ts 的 check），与 CLI 专属树合并 ——
// 不 import mergeConfig（避免拉进 kb-loader/technique 等 CLI 编译范围外模块），造最小 mergedConfig。
import { check as runSourceTreeCheckRaw } from '../源码/checker.js';
import { DEFAULT_THRESHOLDS, DEFAULT_RADAR_WEIGHTS, MergedConfig } from '../源码/types.js';

// 最小 mergedConfig：check() 实际只读 thresholds/vocabulary/extraRules/disabledChecks，
// 其余字段（radarWeights/systemPrompts/constraints/examples/enabledChecks）必填但 check() 不碰，给默认值即可。
// disabledChecks 必须为空 Set —— 否则所有检测器（含①-B 已升 error 的去 AI 味项）都会被跳过。
const R1_MERGED_CONFIG: MergedConfig = {
  thresholds: DEFAULT_THRESHOLDS,
  radarWeights: DEFAULT_RADAR_WEIGHTS,
  vocabulary: {
    bodyParts: new Set(), sensoryVerbs: new Set(), environmentSignals: new Set(),
    actionVerbs: new Set(), fillerPatterns: new Set(), dialogueTags: new Set(), worldTerms: new Set(),
  },
  systemPrompts: [], constraints: [], examples: [],
  extraRules: [],
  disabledChecks: new Set<string>(),
  enabledChecks: new Set<string>(),
};

/** R1 方案B：跑生成时检测器树（源码/checker.ts），返回其违规项，供与 CLI 树合并 */
function runSourceTreeCheck(text: string, targetWords?: number): Violation[] {
  try {
    const result = runSourceTreeCheckRaw(text, null, R1_MERGED_CONFIG, targetWords);
    return result.violations as Violation[];
  } catch {
    // 任何异常静默降级，绝不阻断 CLI 门禁
    return [];
  }
}

// ============================================================
// 质量门禁：error 级违规 = 本章未通过，必须重写
// ============================================================
function assertGate(violations: Violation[]): void {
  const errorCount = violations.filter(v => v.severity === 'error').length;
  if (errorCount > 0) {
    console.log(`\n❌ 本章未通过质量门禁：存在 ${errorCount} 处 error 级违规（如排比堆叠≥6处）。`);
    console.log(`   处置：必须重写本章，直至 check-chapter 退出码为 0（无 error 级违规）。`);
    process.exit(1);
  }
  console.log(`\n✅ 本章通过质量门禁（无 error 级违规）`);
}

// ============================================================
// 反向闭环（v4.9）：读取上一章质量指纹，供跨章检测器使用
// ============================================================
function loadPrevChapterFingerprint(projectName: string, chapterName: string): { verbStacking: PrevChapterVerbStacking[]; senseError: boolean; facts: ChapterFact | null; semanticSummary?: string; prevChapterText?: string } {
  const m = chapterName.match(/第\s*(\d+)\s*章/);
  if (!m) return { verbStacking: [], senseError: false, facts: null };
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 1) return { verbStacking: [], senseError: false, facts: null };
  const prevN = n - 1;
  let chaptersDir: string;
  try {
    const projectPath = getProjectPath(projectName);
    chaptersDir = path.join(projectPath, '章节');
  } catch {
    return { verbStacking: [], senseError: false, facts: null };
  }
  if (!fs.existsSync(chaptersDir)) return { verbStacking: [], senseError: false, facts: null };
  const files = fs.readdirSync(chaptersDir).filter(f => f.startsWith(`第${prevN}章`) && f.endsWith('.fingerprint.json'));
  if (files.length === 0) return { verbStacking: [], senseError: false, facts: null };
  try {
    const fp = JSON.parse(fs.readFileSync(path.join(chaptersDir, files[0]), 'utf-8'));
    const verbStacking: PrevChapterVerbStacking[] = (fp.stylePatterns?.verbStackingVerbs || []).map((v: string) => ({ verb: v, count: 0, samples: [] }));
    const senseError = (fp.errors || []).some((id: string) => typeof id === 'string' && id.startsWith('sense_'));
    const facts: ChapterFact | null = fp.facts || null;
    const semanticSummary: string | undefined = typeof fp.semanticSummary === 'string' ? fp.semanticSummary : undefined;
    return { verbStacking, senseError, facts, semanticSummary };
  } catch {
    return { verbStacking: [], senseError: false, facts: null };
  }
}

// ============================================================
// 入口
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('用法：');
    console.log('  单章检测：inkweave check <章节文件> [--target 3000] [--fix] [--save-fingerprint] [--project <项目名>]');
    console.log('  跨章检测：inkweave check --cross <章1> <章2> <章3> ... [--project <项目名>]');
    console.log('');
    console.log('--fix 仅自动修复确定性违规（破折号→逗号等），排比堆叠/感官失衡等风格类 error 需手动重写或 LLM 重写。');
    console.log('');
    process.exit(1);
  }

  let targetWords: number | undefined;
  let fixMode = false;
  let saveFingerprint = false;
  let projectName: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' && i + 1 < args.length) {
      targetWords = parseInt(args[i + 1], 10);
      args.splice(i, 2);
      i--;
      continue;
    }
    if (args[i] === '--project' && i + 1 < args.length) {
      projectName = args[i + 1];
      args.splice(i, 2);
      i--;
      continue;
    }
    if (args[i] === '--fix') {
      fixMode = true;
      args.splice(i, 1);
      i--;
      continue;
    }
    if (args[i] === '--save-fingerprint') {
      saveFingerprint = true;
      args.splice(i, 1);
      i--;
      continue;
    }
  }

  // —— ② 接 kb：从 project.json 读取 per-work 主角名，透传给 CLI 树检测（缺省回退 '林深'）——
  const projCfg = readProjectConfig();
  const projEntry = projectName
    ? projCfg.projects[projectName]
    : (projCfg.activeProject ? projCfg.projects[projCfg.activeProject] : null);
  const protagonistName: string | undefined = projEntry?.protagonistName;
  // —— 凉质感词排除（U2 per-project）：从 project.json 读取 per-work 排除词，透传给 CLI 树检测 ——
  const excludedTextureWords: string[] | undefined = projEntry?.excludedTextureWords;

  if (args[0] === '--cross') {
    const filePaths = args.slice(1);
    if (filePaths.length < 2) {
      console.error('跨章检测需要至少2个章节文件');
      process.exit(1);
    }

    const chapterResults: { name: string; stats: TextStats; violations: Violation[] }[] = [];
    const texts: string[] = [];

    for (const fp of filePaths) {
      const resolvedPath = resolveChapterPath(fp, projectName);
      if (!fs.existsSync(resolvedPath)) {
        console.error(`文件不存在：${resolvedPath}`);
        process.exit(1);
      }
      const text = fs.readFileSync(resolvedPath, 'utf-8');
      texts.push(text);
      const chapterName = path.basename(fp, path.extname(fp));
      const { stats, violations: cliViolations } = checkChapter(text, targetWords, protagonistName, excludedTextureWords);
      // R1 方案B：合并生成时检测器树（源码/checker.ts）的违规项
      const violations = [...cliViolations, ...runSourceTreeCheck(text, targetWords)];
      chapterResults.push({ name: chapterName, stats, violations });
    }

    const crossResult = checkCrossChapters(texts);
    console.log(formatCrossReport(chapterResults, crossResult));
    return;
  }

  const filePath = resolveChapterPath(args[0], projectName);
  if (!fs.existsSync(filePath)) {
    console.error(`文件不存在：${filePath}`);
    console.error(`提示：使用 --project <项目名> 指定项目后，可直接用章节文件名（如 "第1章.md"）`);
    process.exit(1);
  }

  const text = fs.readFileSync(filePath, 'utf-8');
  const chapterName = path.basename(args[0], path.extname(args[0]));

  // --fix 模式：先修复再检测
  if (fixMode) {
    const fixResult = autoFix(text);
    if (fixResult.fixed) {
      console.log(`🔧 自动修复：${fixResult.changes.length} 处`);
      for (const c of fixResult.changes) {
        console.log(`  第${c.line}行：${c.type} → ${c.description}`);
      }
      fs.writeFileSync(filePath, fixResult.fixedText, 'utf-8');
      console.log(`✅ 已写入：${path.basename(filePath)}`);
      console.log('');
      // 修复后重新检测
      const { stats, violations: cliViolationsFix } = checkChapter(fixResult.fixedText, targetWords, protagonistName, excludedTextureWords);
      // R1 方案B：合并生成时检测器树（源码/checker.ts）的违规项
      const violations = [...cliViolationsFix, ...runSourceTreeCheck(fixResult.fixedText, targetWords)];
      console.log(formatSingleReport(stats, violations, chapterName));
      assertGate(violations);
    } else {
      const { violations: origViolationsCli } = checkChapter(text, targetWords, protagonistName, excludedTextureWords);
      // R1 方案B：合并生成时检测器树
      const origViolations = [...origViolationsCli, ...runSourceTreeCheck(text, targetWords)];
      console.log('✅ 无需修复');
      assertGate(origViolations);
    }
    return;
  }

  const { stats, violations: cliViolationsMain } = checkChapter(text, targetWords, protagonistName, excludedTextureWords);
  // R1 方案B：合并生成时检测器树（源码/checker.ts）的违规项
  const violations = [...cliViolationsMain, ...runSourceTreeCheck(text, targetWords)];

  // —— v5.0 反向闭环：事实层 ——
  let chapterFacts: ChapterFact | null = null;
  // —— v4.9 反向闭环：读取上章排比/感官指纹，本章复发即标记/升级 ——
  let finalViolations = violations;
  if (projectName) {
    const prev = loadPrevChapterFingerprint(projectName, chapterName);
    if (prev.verbStacking.length > 0) {
      const crossViolations = checkCrossChapterRepeat(text, stats, prev.verbStacking);
      if (crossViolations.length > 0) finalViolations = [...finalViolations, ...crossViolations];
    }
    if (prev.senseError) {
      const upgraded = checkSenseDensityWithPrev(stats, true);
      const nonSense = finalViolations.filter(v => !v.ruleId.startsWith('sense_'));
      finalViolations = [...nonSense, ...upgraded];
    }
    // P1：上章事实指纹 → 本章跨章事实校验
    if (prev.facts) {
      // 先抽本章事实指纹（含 voicePrints），再传入跨章比对（含 D3 声音指纹漂移）
      try {
        const projectPath = getProjectPath(projectName);
        const { profileText, worldText } = loadProjectProfiles(projectPath);
        chapterFacts = extractChapterFacts(text, { profileText, worldText, chapterName });
      } catch {
        chapterFacts = null;
      }
      const curVoices = chapterFacts?.voicePrints;
      const factViolations = checkCrossChapterFacts(text, prev.facts, curVoices);
      if (factViolations.length > 0) finalViolations = [...finalViolations, ...factViolations];
    } else {
      // 无上章事实，仍需抽本章指纹供下一章（含 voicePrints）
      try {
        const projectPath = getProjectPath(projectName);
        const { profileText, worldText } = loadProjectProfiles(projectPath);
        chapterFacts = extractChapterFacts(text, { profileText, worldText, chapterName });
      } catch {
        chapterFacts = null;
      }
    }
    // P1.5：语义级长程一致性（可插拔 LLM，未配置自动降级，不阻塞）
    if (isSemanticEnabled()) {
      try {
        const projectPath = getProjectPath(projectName);
        const { profileText, worldText } = loadProjectProfiles(projectPath);
        const settingText = `${profileText}\n${worldText}`;
        const semanticFindings = await checkCrossChapterSemantic({
          prevSemanticSummary: prev.semanticSummary,
          prevFacts: prev.facts,
          settingText,
          currentChapterText: text,
          cwd: process.cwd(),
        });
        if (semanticFindings.length > 0) finalViolations = [...finalViolations, ...semanticFindings];
        else if (prev.semanticSummary || prev.facts) {
          console.log('🧠 语义记忆校验：未检出一致性问题（已启用 LLM）');
        }
      } catch {
        // 任何异常静默降级，绝不阻断门禁
      }
    }
  }

  console.log(formatSingleReport(stats, finalViolations, chapterName));

  // --save-fingerprint：保存第一轮检测报告供下一章注入
  if (saveFingerprint) {
    const fingerprintPath = filePath.replace(/\.md$/, '.fingerprint.json');
    const fingerprint = {
      chapterName,
      timestamp: new Date().toISOString(),
      errors: violations.filter(v => v.severity === 'error').map(v => v.ruleId),
      warnings: violations.filter(v => v.severity === 'warning').map(v => v.ruleId),
      infos: violations.filter(v => v.severity === 'info').map(v => v.ruleId),
      dashes: (text.match(/——/g) || []).length,
      notXButY: (text.match(/不是.{1,20}，.{0,5}是/g) || []).length,
      commaChainRatio: (() => {
        const commas = (text.match(/，/g) || []).length;
        const periods = (text.match(/。/g) || []).length;
        return periods > 0 ? +(commas / periods).toFixed(1) : 0;
      })(),
      wordCount: (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length,
      targetWords: targetWords || 2800,
      rawViolations: violations,
      // v4.9 新增：风格指纹数据
      stylePatterns: {
        verbStacking: violations
          .filter(v => v.ruleId === 'style_stacking_verb')
          .map(v => ({ message: v.message, severity: v.severity })),
        // v4.9 新增：提取排比动词字符串，供下一章 checkCrossChapterRepeat 复用（避免重新解析）
        verbStackingVerbs: violations
          .filter(v => v.ruleId === 'style_stacking_verb')
          .flatMap(v => (v.fixes || [])
            .map(f => {
              const mm = (f.description || '').match(/替换"(.+?)"排比堆叠/);
              return mm ? mm[1] : null;
            })
            .filter((x): x is string => x !== null)),
        nameStacking: violations
          .filter(v => v.ruleId === 'style_stacking_name')
          .map(v => ({ message: v.message, severity: v.severity })),
        deDensity: violations
          .filter(v => v.ruleId === 'style_stacking_de')
          .map(v => ({ message: v.message, severity: v.severity })),
      },
      // v5.0 P1：事实指纹（供下一章跨章一致性校验 + pre-analysis 注入）
      facts: chapterFacts,
      // v5.1 P1.5：语义记忆摘要（记忆雏形，供下一章语义校验基线；未配置 LLM 则为空）
      semanticSummary: await generateSemanticSummary({
        chapterText: text,
        settingText: (() => {
          try {
            const projectPath = getProjectPath(projectName!);
            const { profileText, worldText } = loadProjectProfiles(projectPath);
            return `${profileText}\n${worldText}`;
          } catch {
            return '';
          }
        })(),
        cwd: process.cwd(),
      }),
    };
      fs.writeFileSync(fingerprintPath, JSON.stringify(fingerprint, null, 2), 'utf-8');
      console.log(`\n📋 第一轮质量指纹已保存：${path.basename(fingerprintPath)}`);
  }

  // 质量门禁：error 级违规硬失败（盲点修复：error 不再只是扣分）
  assertGate(finalViolations);
}

main();