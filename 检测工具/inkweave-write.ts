/**
 * InkWeave 写章编排器（skill 唯一入口）
 * ============================================================
 * 把"写前分析(镜头链规划) → 生成 → 门禁循环"焊成一条命令，
 * 使跳过写前分析 / 跳过门禁在物理上不可能。
 *
 * 用法：
 *   规划+生成： npx tsx 检测工具/inkweave-write.ts --chapter <N> --title "<标题>" [--intent I] [--outline O] [--target 3000] [--project P]
 *   验收修订： npx tsx 检测工具/inkweave-write.ts --review "<章节文件绝对路径>" [--target 3000] [--project P]
 *
 * 模式：
 *   - provider 模式（已配 CUSTOM_BASE_URL + CUSTOM_MODEL）：步骤1 自动调引擎生成并接 self-correct 门禁自纠循环，直接产出终稿。
 *   - agent 模式（默认，无 key）：步骤1 输出规划简报；agent 按规划写正文后，用 --review 跑门禁循环把 error 打回修订，直到 0 error。
 *
 * 复用：
 *   - 写前分析（唯一真源）：./pre-analysis.js
 *   - 门禁（双树口径）：./checkers.js 的 checkChapter
 *   - 生成（provider 模式）：../源码/cli.js 的 write 命令 + ./self-correct.js 自纠循环
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { resolveProjectDir, step0StyleRecipe } from './pre-analysis.js';
import { checkChapter } from './checkers.js';
import { getProjectPath } from './project-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function countWords(text: string): number {
  return (text.match(/[一-鿿]/g) || []).length;
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--review') { out.review = argv[++i]; }
    else if (a === '--chapter') { out.chapter = argv[++i]; }
    else if (a === '--title') { out.title = argv[++i]; }
    else if (a === '--intent') { out.intent = argv[++i]; }
    else if (a === '--outline') { out.outline = argv[++i]; }
    else if (a === '--target') { out.target = argv[++i]; }
    else if (a === '--project') { out.project = argv[++i]; }
    else if (a === '--auto') { out.auto = true; }
  }
  return out;
}

function sanitizeTitle(t: string): string {
  return t.replace(/[\\/:*?"<>|]/g, '').slice(0, 20);
}

/** 阶段 0：写前分析 + 镜头链规划文件（强制前置） */
function runPreAnalysis(chapterNum: number, title: string, targetWords: number, projectName?: string): string {
  resolveProjectDir(projectName);
  const styleRecipe = step0StyleRecipe(chapterNum);

  // 镜头链模板：4 场，每场 ≥ target/4，合计 ≥ target 才允许开写
  const perScene = Math.floor(targetWords / 4);
  const planPath = path.join(ROOT, '实战出文', '压力测试', `_plan_第${chapterNum}章_${sanitizeTitle(title)}.md`);
  const plan = `# 写前分析 · 第${chapterNum}章「${title}」

> 本文件由 inkweave-write.ts 自动生成，是**写正文的强制前置**。每场字数预算合计须 ≥ ${targetWords}。

## 意图 / 调性
- 意图：${projectName || '(按题材默认)'}
- 目标字数：${targetWords}（门禁下限，低于即 error）

## 风格配方（预设 + 多样性轮换）
${styleRecipe}

## 镜头链规划（MANDATORY · 每场 ≥${perScene} 字，合计 ≥${targetWords}）
| 场次 | 场景 | 字数预算 | 核心任务 | 反转/信息反咬 |
|------|------|---------|---------|--------------|
| 1 | （待填） | ≥${perScene} | | |
| 2 | （待填） | ≥${perScene} | | |
| 3 | （待填） | ≥${perScene} | | |
| 4 | （待填） | ≥${perScene} | | |

## 门禁（写前确认，写时遵守）
1. 破折号零容忍：本章不出现任何"——"。
2. 省略号零容忍：不出现"……"。
3. 引号内疑问句用问号结尾，不用句号。
4. 全角弯引号""成对；禁半角直引号"。
5. 章末留真钩子；连续段落须有反转/信息反咬。
6. 禁 AI 套路（"笑了笑""嘴角一勾"等）、禁书面联接词（然而/因此/由此可见）。
`;
  fs.writeFileSync(planPath, plan, 'utf-8');
  return planPath;
}

/** 阶段 2：门禁循环（agent 模式：打印 error 退出；provider 模式：返回是否通过） */
function runGate(chapterFile: string, targetWords: number): { passed: boolean; score: number; errors: number } {
  const text = fs.readFileSync(chapterFile, 'utf-8');
  const res: any = checkChapter(text, targetWords);
  const violations = res.violations || [];
  const errors = violations.filter((v: any) => v.severity === 'error');
  const warnings = violations.filter((v: any) => v.severity === 'warning');
  const score = res.score ?? 0;

  console.log('');
  console.log('══════════════════════════════════════════');
  console.log(`门禁结果：${path.basename(chapterFile)}`);
  console.log(`字数：${countWords(text)} / 目标 ${targetWords}`);
  console.log(`评分：${score}`);
  console.log(`error：${errors.length}  warning：${warnings.length}`);
  if (errors.length > 0) {
    console.log('── error 清单（必须修）──');
    for (const v of errors) console.log(`  [${v.ruleName}] ${v.message}`);
  }
  if (warnings.length > 0) {
    console.log('── warning 清单（非阻塞）──');
    for (const v of warnings.slice(0, 12)) console.log(`  [${v.ruleName}] ${v.message}`);
  }
  console.log('══════════════════════════════════════════');
  return { passed: errors.length === 0, score, errors: errors.length };
}

function hasProvider(): boolean {
  return !!process.env.CUSTOM_BASE_URL && !!process.env.CUSTOM_MODEL;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetWords = parseInt((args.target as string) || '3000', 10);
  const projectName = args.project as string | undefined;

  // ====== 验收模式 ======
  if (args.review) {
    const file = args.review as string;
    if (!fs.existsSync(file)) { console.error(`文件不存在：${file}`); process.exit(1); }
    const r = runGate(file, targetWords);
    if (!r.passed) {
      console.log('\n>>> 有 error，未通过门禁。请修订后重跑本命令，直到 0 error。');
      process.exit(1);
    }
    console.log('\n✅ 0 error，门禁通过，可交付。');
    process.exit(0);
  }

  // ====== 规划 + 生成模式 ======
  const chapterNum = parseInt((args.chapter as string) || '0', 10);
  const title = (args.title as string) || '';
  if (!chapterNum || !title) {
    console.log('用法：npx tsx 检测工具/inkweave-write.ts --chapter <N> --title "<标题>" [--intent I] [--outline O] [--target 3000]');
    console.log('验收：npx tsx 检测工具/inkweave-write.ts --review "<章节文件>" [--target 3000]');
    process.exit(1);
  }

  const planPath = runPreAnalysis(chapterNum, title, targetWords, projectName);
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log(`║  InkWeave 写前分析 · 第${chapterNum}章「${title}」`);
  console.log(`║  目标字数：${targetWords}`);
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\n📋 镜头链规划已生成：${planPath}\n`);

  if (hasProvider()) {
    // provider 模式：引擎自动生成 + 自纠循环
    console.log('>>> provider 模式：调引擎生成（gwe write）...');
    try {
      const out = execFileSync(
        'npx', ['tsx', '源码/cli.ts', 'write', '--number', String(chapterNum), '--title', title,
          ...(args.intent ? ['--intent', args.intent as string] : []),
          ...(args.outline ? ['--outline', args.outline as string] : []),
          ...(projectName ? ['--project', projectName] : [])],
        { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
      const marker = '─── 章节内容 ───';
      const endMarker = '─── 会话统计 ───';
      let content = out;
      const s = out.indexOf(marker);
      const e = out.indexOf(endMarker);
      if (s >= 0) content = out.slice(s + marker.length, e >= 0 ? e : undefined);
      const chapterFile = path.join(ROOT, '实战出文', '压力测试', `第${chapterNum}章_${sanitizeTitle(title)}.md`);
      fs.writeFileSync(chapterFile, content.trim() + '\n', 'utf-8');
      console.log(`>>> 已写出：${chapterFile}`);
      console.log('>>> 跑门禁自纠循环（self-correct --llm）...');
      try {
        execFileSync('npx', ['tsx', '检测工具/self-correct.ts', path.dirname(chapterFile), '--llm', '--target', String(targetWords), ...(projectName ? ['--project', projectName] : [])],
          { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' });
      } catch { /* self-correct 非零退出不阻断 */ }
      runGate(chapterFile, targetWords);
    } catch (err: any) {
      console.error('引擎生成失败（检查 provider 配置）：', err?.message || err);
      process.exit(1);
    }
  } else {
    // agent 模式：输出规划，由 agent 按规划写正文，再用 --review 验收
    const chapterFile = path.join(ROOT, '实战出文', '压力测试', `第${chapterNum}章_${sanitizeTitle(title)}.md`);
    console.log('>>> agent 模式（无 LLM key）：请按上面的镜头链规划写正文，');
    console.log(`>>> 章节文件写到：${chapterFile}`);
    console.log(`>>> 写完后运行：npx tsx 检测工具/inkweave-write.ts --review "${chapterFile}" --target ${targetWords}`);
    console.log('>>> 门禁有 error 会打回，修到 0 error 才算完成。');
  }
}

main();
