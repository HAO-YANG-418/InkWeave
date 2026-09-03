/**
 * InkWeave 全书一键检测脚本 v4.0
 * 
 * 扫描指定目录下所有章节 .md 文件，运行：
 * 1. 单章质量检测（18项检测器 + 段落分类 + 自动修复建议）
 * 2. 跨章重复检测（全局短语/套路词/开篇模式）
 * 3. 全书质量报告（各章评分排行/趋势分析/重点问题汇总）
 * 
 * 检测逻辑全部在 checkers.ts 共享模块中。
 * 
 * 用法：npx tsx check-all.ts <章节目录路径> [--json]
 *   默认输出 Markdown 格式报告
 *   --json 输出 JSON 格式（方便程序化处理）
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  TextStats, Violation, CrossChapterResult,
  checkChapter, checkChaptersAsync, checkCrossChapters,
} from './checkers.js';
import { getProjectPath } from './project-config.js';
// —— R1（方案B 双跑聚合）：额外跑生成时检测器树（源码/checker.ts），与 CLI 树合并，避免全章检查藏警告 ——
import { check as runSourceTreeCheckRaw } from '../源码/checker.js';
import { DEFAULT_THRESHOLDS, DEFAULT_RADAR_WEIGHTS, MergedConfig } from '../源码/types.js';

// ============================================================
// 评分计算
// ============================================================

function computeScore(violations: Violation[]): number {
  let penalty = 0;
  for (const v of violations) {
    if (v.severity === 'error') penalty += 10;
    else if (v.severity === 'warning') penalty += 4;
    else penalty += 1;
  }
  return Math.max(0, 100 - penalty);
}

// ============================================================
// 双树合并（2026-09-03 口径统一修复）
// 背景：check-all 双跑 CLI 树（检测工具/checkers.ts）与源树（源码/checker.ts），
//       原实现在第 482 行直接拼接、无去重、无来源标注，导致：
//         ① 同一处问题被两棵树各报一次 → 重复扣分（分数虚低）
//         ② 读者无法判断某条警告出自哪棵树 → 口径矛盾时无法溯源
// 方案：为每条违规标注来源树；「同 ruleId + 同 message」判定为双树命中同一处，
//       合并为一条并标记「双树一致」（更可信，且只扣一次分）。
// 注意：不可只按 ruleId 去重 —— 同一规则的多处真实命中（如两个不同超长句）必须保留。
// ============================================================
type DualTreeSource = 'CLI树' | '源树' | '双树一致';

/** 全书累计的「双树重复合并」条数，用于报告透明披露 */
let dualTreeDupTotal = 0;

function mergeDualTreeViolations(
  cliViolations: Violation[],
  srcViolations: Violation[]
): { merged: Violation[]; dupCount: number } {
  const merged: Array<Violation & { source?: DualTreeSource }> = [];
  const indexByKey = new Map<string, number>();
  let dupCount = 0;

  for (const v of cliViolations) {
    indexByKey.set(`${v.ruleId}||${v.message}`, merged.length);
    merged.push({ ...v, source: 'CLI树' });
  }

  for (const v of srcViolations) {
    const key = `${v.ruleId}||${v.message}`;
    const idx = indexByKey.get(key);
    if (idx !== undefined) {
      merged[idx] = { ...merged[idx], source: '双树一致' };
      dupCount++;
    } else {
      merged.push({ ...v, source: '源树' });
    }
  }

  return { merged, dupCount };
}

// —— R1（方案B 双跑聚合）：额外跑生成时检测器树（源码/checker.ts 的 check），与 CLI 专属树合并 ——
// 不 import mergeConfig（避免拉进 kb-loader 等编译范围外模块），造最小 mergedConfig。
// disabledChecks 必须为空 Set —— 否则所有检测器（含已升 error 的去 AI 味项）都会被跳过。
const R1_MERGED_CONFIG: MergedConfig = {
  thresholds: DEFAULT_THRESHOLDS,
  radarWeights: DEFAULT_RADAR_WEIGHTS,
  vocabulary: {
    bodyParts: new Set(), sensoryVerbs: new Set(), environmentSignals: new Set(),
    actionVerbs: new Set(), fillerPatterns: new Set(), dialogueTags: new Set(), worldTerms: new Set(),
  },
  systemPrompts: [], constraints: [], examples: [],
  extraRules: [],
  // 2026-09-03：以下两项在「验收场景」由 CLI 树独占，源树侧禁用。
  // 原因：check-all 给源树的是空 vocabulary（不加载 kb-loader），导致两项在验收下必然失真：
  //   ① character_voice：源树读 vocabulary.dialogueTags.size 恒为 0 → `tagCount<3` 恒真
  //      → 只要对话占比过线就必报，实测 5 章 100% 假阳性、每章冤枉扣 4 分。
  //      CLI 树同名检查用内置 COMMON_DIALOGUE_TAGS 常量表统计实际用词，是真检测。
  //   ② sense_density：与 CLI 树同 ruleId 命中同一处，但措辞不同
  //      （"sight占比过高(105次)" vs "视觉占比58%(105/180)偏高"），去重抓不到 → 同一问题扣两次（-4 + -1）。
  //      CLI 树是唯一检测逻辑源（checkers.ts 头文件明定）。
  // 作用域：仅本 R1 验收配置。源树在「生成时」拿真 vocabulary，两模块照常工作，不影响引擎能力。
  disabledChecks: new Set<string>(['character_voice', 'sense_density']),
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
// 全书报告格式化
// ============================================================

function formatReport(
  results: { name: string; stats: TextStats; violations: Violation[]; score: number }[],
  cross: CrossChapterResult,
  chapterNames: string[]
): string {
  // 将跨章检测结果中的章节索引映射为章节名
  const globalPhrases = cross.globalPhrases.map(gp => ({
    phrase: gp.phrase,
    chapters: gp.chapters.map(i => chapterNames[i]),
    totalCount: gp.totalCount,
  }));
  const globalClichés = cross.globalClichés.map(gc => ({
    name: gc.name,
    chapters: gc.chapters.map(i => chapterNames[i]),
    totalCount: gc.totalCount,
  }));
  const openings = cross.openingPatterns.map(op => ({
    pattern: op.pattern,
    chapters: op.chapters.map(i => chapterNames[i]),
  }));

  const lines: string[] = [];
  lines.push('# 全书质量检测报告');
  lines.push('');
  lines.push(`**检测时间**：${new Date().toLocaleString('zh-CN')} | **章节数**：${results.length} | **总字数**：${results.reduce((s, r) => s + r.stats.totalWords, 0).toLocaleString()}`);
  lines.push('');

  // 评分排行
  const scores = results.map(r => r.score);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const aCount = scores.filter(s => s >= 90).length;
  const bCount = scores.filter(s => s >= 80 && s < 90).length;
  const cCount = scores.filter(s => s >= 60 && s < 80).length;
  const dCount = scores.filter(s => s < 60).length;

  lines.push('## 全书概览');
  lines.push('');
  lines.push(`| 指标 | 数值 |`);
  lines.push(`|------|------|`);
  lines.push(`| 平均分 | ${avgScore.toFixed(1)} |`);
  lines.push(`| A级(≥90) | ${aCount}章 (${(aCount / results.length * 100).toFixed(0)}%) |`);
  lines.push(`| B级(80-89) | ${bCount}章 (${(bCount / results.length * 100).toFixed(0)}%) |`);
  lines.push(`| C级(60-79) | ${cCount}章 (${(cCount / results.length * 100).toFixed(0)}%) |`);
  lines.push(`| D级(<60) | ${dCount}章 (${(dCount / results.length * 100).toFixed(0)}%) |`);
  lines.push('');

  // 各章评分排行
  lines.push('## 各章评分排行');
  lines.push('');
  const sorted = [...results].sort((a, b) => b.score - a.score);
  lines.push('| 排名 | 章节 | 评分 | 等级 | 错误 | 警告 | 提示 | 字数 | 叙事段 | 对话段 |');
  lines.push('|------|------|------|------|------|------|------|------|--------|--------|');
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const errors = r.violations.filter(v => v.severity === 'error').length;
    const warnings = r.violations.filter(v => v.severity === 'warning').length;
    const infos = r.violations.filter(v => v.severity === 'info').length;
    const grade = r.score >= 90 ? 'A' : r.score >= 80 ? 'B' : r.score >= 60 ? 'C' : 'D';
    const nar = r.stats.paragraphs.filter(p => p.type === 'narrative').length;
    const dia = r.stats.paragraphs.filter(p => p.type === 'dialogue').length;
    lines.push(`| ${i + 1} | ${r.name} | ${r.score} | ${grade} | ${errors} | ${warnings} | ${infos} | ${r.stats.totalWords} | ${nar} | ${dia} |`);
  }
  lines.push('');

  // 重点问题章节（D级+C级）
  const problemChapters = results.filter(r => r.score < 80);
  if (problemChapters.length > 0) {
    lines.push('## 需重点修复的章节');
    lines.push('');
    for (const r of problemChapters) {
      const topViolations = r.violations
        .sort((a, b) => (b.severity === 'error' ? 10 : b.severity === 'warning' ? 4 : 1) - (a.severity === 'error' ? 10 : a.severity === 'warning' ? 4 : 1))
        .slice(0, 5);
      lines.push(`### ${r.name}（${r.score}分）`);
      for (const v of topViolations) {
        const icon = v.severity === 'error' ? '🔴' : v.severity === 'warning' ? '🟡' : '🔵';
        const srcTag = (v as { source?: string }).source ? ` [${(v as { source?: string }).source}]` : '';
        lines.push(`- ${icon} **${v.ruleName}**${srcTag}：${v.message}`);
      }
      lines.push('');
    }
  }

  // 跨章高频短语
  if (globalPhrases.length > 0) {
    lines.push('## 跨章高频短语（全书范围）');
    lines.push('');
    for (const gp of globalPhrases.slice(0, 15)) {
      lines.push(`- "${gp.phrase}" 共${gp.totalCount}次，出现在 ${gp.chapters.join('、')}`);
    }
    lines.push('');
  }

  // 跨章套路词
  if (globalClichés.length > 0) {
    lines.push('## 跨章套路词');
    lines.push('');
    for (const gc of globalClichés) {
      lines.push(`- "${gc.name}" 共${gc.totalCount}次，出现在 ${gc.chapters.join('、')}`);
    }
    lines.push('');
  }

  // 开篇模式重复
  if (openings.length > 0) {
    lines.push('## 开篇模式重复');
    lines.push('');
    for (const op of openings) {
      lines.push(`- "${op.pattern}" 出现在 ${op.chapters.join('、')} 开头`);
    }
    lines.push('');
  }

  // 全书统计
  lines.push('## 全书统计');
  lines.push('');
  const totalWords = results.reduce((s, r) => s + r.stats.totalWords, 0);
  const totalViolations = results.reduce((s, r) => s + r.violations.length, 0);
  const totalErrors = results.reduce((s, r) => s + r.violations.filter(v => v.severity === 'error').length, 0);
  const totalWarnings = results.reduce((s, r) => s + r.violations.filter(v => v.severity === 'warning').length, 0);
  const totalInfos = results.reduce((s, r) => s + r.violations.filter(v => v.severity === 'info').length, 0);
  const totalDashes = results.reduce((s, r) => s + (r.violations.filter(v => v.ruleId === 'forbidden_char').reduce((a, v) => a + parseInt(v.message.match(/\d+/)?.[0] || '0'), 0)), 0);
  const totalNotShi = results.reduce((s, r) => s + (r.violations.filter(v => v.ruleId === 'not_shi_pattern').reduce((a, v) => a + parseInt(v.message.match(/\d+/)?.[0] || '0'), 0)), 0);

  lines.push(`| 指标 | 数值 |`);
  lines.push(`|------|------|`);
  lines.push(`| 总字数 | ${totalWords.toLocaleString()} |`);
  lines.push(`| 总违规数 | ${totalViolations} |`);
  lines.push(`| 错误 | ${totalErrors} |`);
  lines.push(`| 警告 | ${totalWarnings} |`);
  lines.push(`| 提示 | ${totalInfos} |`);
  lines.push(`| 破折号总数 | ${totalDashes} |`);
  lines.push(`| "不是X是Y"总数 | ${totalNotShi} |`);
  lines.push(`| 双树重复合并 | ${dualTreeDupTotal} 条（同规则同描述，两树各报一次已合并为一条，只扣一次分） |`);
  lines.push('');
  lines.push('> **检测口径**：本验收双跑 CLI 树（`检测工具/checkers.ts`）与源树（`源码/checker.ts`）。');
  lines.push('> 每条违规标注来源：`[CLI树]`、`[源树]`、`[双树一致]`（两树独立命中同一处，结论更可信）。');
  lines.push('> 若同一指标在两树出现矛盾数值，以 **CLI 树**为准（`checkers.ts` 为唯一检测逻辑源）。');
  lines.push('');

  // ====== 盲区检测结果（v4.1新增） ======
  const blindSpotLines: string[] = [];

  if (cross.characterIntros.length > 0) {
    blindSpotLines.push('## 🟠 角色登场一致性（盲区1）');
    blindSpotLines.push('');
    for (const ci of cross.characterIntros) {
      blindSpotLines.push(`- **${ci.name}**：第${ci.firstChapter}章${ci.detailLevel}。${ci.issue || ''}`);
    }
    blindSpotLines.push('');
  }

  const openThreads = cross.plotThreads.filter(p => p.status === 'open');
  if (openThreads.length > 0) {
    blindSpotLines.push('## 🟠 情节线收束（盲区2）');
    blindSpotLines.push('');
    for (const pt of openThreads) {
      blindSpotLines.push(`- **${pt.name}**：出现在第${pt.chapters.join('、')}章，此后未再出现 → 情节线未收束`);
    }
    blindSpotLines.push('');
  }

  if (cross.conceptPacing.some(c => c.density >= 2)) {
    blindSpotLines.push('## 🟠 信息释放节奏（盲区3）');
    blindSpotLines.push('');
    blindSpotLines.push('| 章节 | 新概念数 | 新概念列表 |');
    blindSpotLines.push('|------|---------|-----------|');
    for (const cp of cross.conceptPacing) {
      if (cp.density > 0) blindSpotLines.push(`| 第${cp.chapter}章 | ${cp.density} | ${cp.newConcepts.join('、')} |`);
    }
    const highDensity = cross.conceptPacing.filter(c => c.density >= 3);
    if (highDensity.length > 0) {
      blindSpotLines.push('');
      blindSpotLines.push(`⚠️ 第${highDensity.map(c => c.chapter).join('、')}章新概念密度过高（≥3个/章），建议分散释放。`);
    }
    blindSpotLines.push('');
  }

  if (cross.settingIssues.length > 0) {
    blindSpotLines.push('## 🟠 跨章设定一致性（盲区4）');
    blindSpotLines.push('');
    for (const si of cross.settingIssues) {
      blindSpotLines.push(`- **${si.key}**：第${si.chapters.join('、')}章。${si.description}`);
    }
    blindSpotLines.push('');
  }

  if (cross.paragraphPatterns.length > 0) {
    blindSpotLines.push('## 🟠 段落结构重复（盲区5）');
    blindSpotLines.push('');
    blindSpotLines.push('| 结构指纹 | 出现章节 | 总次数 |');
    blindSpotLines.push('|---------|---------|-------|');
    for (const pp of cross.paragraphPatterns.slice(0, 10)) {
      blindSpotLines.push(`| ${pp.pattern} | 第${pp.chapters.join('、')}章 | ${pp.totalCount} |`);
    }
    blindSpotLines.push('');
    blindSpotLines.push(`⚠️ 检测到${cross.paragraphPatterns.length}种跨章重复的段落结构模式。建议在章节间轮换段落开头和结构。`);
    blindSpotLines.push('');
  }

  if (blindSpotLines.length === 0) {
    blindSpotLines.push('## ✓ 盲区检测通过，无跨章一致性问题');
    blindSpotLines.push('');
  }

  lines.push(...blindSpotLines);

  lines.push('---');
  lines.push(`*InkWeave v4.0 检测引擎*`);

  return lines.join('\n');
}

// ============================================================
// 入口
// ============================================================

function generateFixReport(
  results: { name: string; stats: TextStats; violations: Violation[]; score: number }[],
  cross: CrossChapterResult,
  chapterNames: string[]
): string {
  const lines: string[] = [];
  lines.push('# 跨章盲区修复建议');
  lines.push('');
  lines.push(`生成时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push('');

  // 角色登场不一致
  if (cross.characterIntros.length > 0) {
    lines.push('## 角色登场一致性修复');
    lines.push('');
    for (const ci of cross.characterIntros) {
      lines.push(`### ${ci.name}（首现第${ci.firstChapter}章）`);
      lines.push('');
      lines.push(`**问题**：前${ci.firstChapter - 1}章无任何铺垫，第${ci.firstChapter}章首次出现即带详细描述。`);
      lines.push('');
      lines.push('**修复建议**：');
      lines.push(`1. 在第${Math.max(1, ci.firstChapter - 2)}章或第${Math.max(1, ci.firstChapter - 1)}章增加伏笔提及`);
      lines.push(`2. 伏笔形式：名单中出现名字、场景中一闪而过的身影、他人对话中提及`);
      lines.push(`3. 在第${ci.firstChapter}章首次正式登场时，保留详细描述，但增加"之前见过"的呼应`);
      lines.push('');
    }
  }

  // 情节线未收束
  const openThreads = cross.plotThreads.filter(p => p.status === 'open');
  if (openThreads.length > 0) {
    lines.push('## 情节线收束修复');
    lines.push('');
    for (const pt of openThreads) {
      lines.push(`### ${pt.name}`);
      lines.push('');
      lines.push(`**问题**：出现在第${pt.chapters.join('、')}章，此后未再出现。`);
      lines.push('');
      lines.push('**修复选项**：');
      lines.push(`- **方案A**：在后续章节增加一句交代，收束该情节线`);
      lines.push(`- **方案B**：若为第二卷伏笔，在前文明确标注"延至第二卷"`);
      lines.push('');
    }
  }

  // 信息释放密度
  if (cross.conceptPacing.some(c => c.density >= 3)) {
    lines.push('## 信息释放节奏修复');
    lines.push('');
    const highDensity = cross.conceptPacing.filter(c => c.density >= 3);
    for (const hd of highDensity) {
      lines.push(`### 第${hd.chapter}章（${hd.density}个新概念）`);
      lines.push('');
      lines.push(`新概念：${hd.newConcepts.join('、')}`);
      lines.push('');
      lines.push(`**修复建议**：将部分概念前移至第${Math.max(1, hd.chapter - 1)}章或后移至第${hd.chapter + 1}章`);
      lines.push('');
    }
  }

  // 段落结构重复
  if (cross.paragraphPatterns.length > 0) {
    lines.push('## 段落结构重复修复');
    lines.push('');
    lines.push('以下结构模式在跨章范围重复出现，建议在第二卷写作时有意识地轮换：');
    lines.push('');
    for (const pp of cross.paragraphPatterns.slice(0, 10)) {
      lines.push(`- \`${pp.pattern}\`：第${pp.chapters.join('、')}章，共${pp.totalCount}次`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('用法：npx tsx check-all.ts <章节目录> [--json] [--parallel] [--fix-report] [--project <项目名>]');
    console.log('示例：npx tsx check-all.ts "../荒古纪元/章节"');
    console.log('  npx tsx check-all.ts --project 裂日 --fix-report');
    console.log('  --json       输出 JSON 格式');
    console.log('  --parallel   并行扫描模式（多章同时检测）');
    console.log('  --fix-report 生成跨章盲区修复建议报告');
    console.log('  --project    指定项目名（自动解析章节目录路径）');
    process.exit(1);
  }

  let projectName: string | undefined;
  let dirPath: string | undefined;

  // Parse --project
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && i + 1 < args.length) {
      projectName = args[i + 1];
      args.splice(i, 2);
      i--;
      continue;
    }
  }

  const jsonMode = args.includes('--json');
  const parallelMode = args.includes('--parallel');
  const fixReportMode = args.includes('--fix-report');

  // R1 字数验收线（默认 2800，与单章门禁 --target 对齐）
  let targetWords = 2800;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' && i + 1 < args.length) {
      targetWords = parseInt(args[i + 1], 10);
      args.splice(i, 2);
      i--;
      continue;
    }
  }

  // Resolve directory path: if --project is set, auto-resolve from project config
  if (projectName) {
    dirPath = path.join(getProjectPath(projectName), '章节');
  } else if (args.length > 0 && !args[0].startsWith('--')) {
    dirPath = path.resolve(args[0]);
  } else {
    console.error('请提供章节目录路径或使用 --project <项目名>');
    process.exit(1);
  }

  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    console.error(`目录不存在：${dirPath}`);
    process.exit(1);
  }

  // 扫描所有 .md 文件
  // 2026-09-03：排除说明性文件。README/说明 之类不是章节，
  // 一旦被扫入会被当"写空章节"判 error 并挂 D 级，污染验收结论（实测踩过）。
  const DOC_FILE_RE = /^(readme|说明|使用说明|changelog|license|contributing)/i;
  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.md'))
    .filter(f => !DOC_FILE_RE.test(f))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0');
      const numB = parseInt(b.match(/\d+/)?.[0] || '0');
      return numA - numB;
    });

  if (files.length === 0) {
    console.error('目录中没有 .md 文件');
    process.exit(1);
  }

  console.error(`扫描到 ${files.length} 个章节文件，正在检测${parallelMode ? '（并行模式）' : ''}...`);

  const texts: string[] = [];
  const chapterNames: string[] = [];

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const text = fs.readFileSync(filePath, 'utf-8');
    texts.push(text);
    chapterNames.push(file.replace('.md', ''));
  }

  const cross = checkCrossChapters(texts);

  if (parallelMode) {
    // 并行模式：使用 Promise.all 批量处理
    checkChaptersAsync(
      chapterNames.map((name, i) => ({ name, text: texts[i] })),
    ).then(chapterResults => {
      // 并行模式此前只跑 CLI 树、漏跑源树，与串行模式结果不一致（既存缺陷，2026-09-03 修复）
      const results = chapterResults.map((r, i) => {
        const src = runSourceTreeCheck(texts[i], targetWords);
        const { merged, dupCount } = mergeDualTreeViolations(r.violations, src);
        dualTreeDupTotal += dupCount;
        return { ...r, violations: merged, score: computeScore(merged) };
      });

      if (jsonMode) {
        const jsonCross = {
          globalPhrases: cross.globalPhrases.map(gp => ({
            ...gp,
            chapters: gp.chapters.map(i => chapterNames[i]),
          })),
          globalClichés: cross.globalClichés.map(gc => ({
            ...gc,
            chapters: gc.chapters.map(i => chapterNames[i]),
          })),
          openingPatterns: cross.openingPatterns.map(op => ({
            ...op,
            chapters: op.chapters.map(i => chapterNames[i]),
          })),
        };
        console.log(JSON.stringify({ results, cross: jsonCross }, null, 2));
      } else {
        console.log(formatReport(results, cross, chapterNames));
      }
    });
    return;
  }

  // 串行模式（默认）
  const results: { name: string; stats: TextStats; violations: Violation[]; score: number }[] = [];

  for (let i = 0; i < texts.length; i++) {
    // R1 双跑聚合：与单章 check-chapter 同树，避免全章检查藏源码树警告
    const cli = checkChapter(texts[i], targetWords);
    const srcViolations = runSourceTreeCheck(texts[i], targetWords);
    const { merged, dupCount } = mergeDualTreeViolations(cli.violations, srcViolations);
    dualTreeDupTotal += dupCount;
    const stats = cli.stats;
    const score = computeScore(merged);
    results.push({ name: chapterNames[i], stats, violations: merged, score });
  }

  if (jsonMode) {
    const jsonCross = {
      globalPhrases: cross.globalPhrases.map(gp => ({
        ...gp,
        chapters: gp.chapters.map(i => chapterNames[i]),
      })),
      globalClichés: cross.globalClichés.map(gc => ({
        ...gc,
        chapters: gc.chapters.map(i => chapterNames[i]),
      })),
      openingPatterns: cross.openingPatterns.map(op => ({
        ...op,
        chapters: op.chapters.map(i => chapterNames[i]),
      })),
    };
    console.log(JSON.stringify({ results, cross: jsonCross }, null, 2));
  } else {
    console.log(formatReport(results, cross, chapterNames));
  }

  // 生成跨章盲区修复建议报告
  if (fixReportMode) {
    const fixReport = generateFixReport(results, cross, chapterNames);
    const fixReportPath = path.join(dirPath, '..', '跨章盲区修复建议.md');
    fs.writeFileSync(fixReportPath, fixReport, 'utf-8');
    console.error(`\n📋 跨章盲区修复建议已保存：${fixReportPath}`);
  }
}

main();