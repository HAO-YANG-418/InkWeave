/**
 * 质量指纹全链路自动化 v4.9
 * 一键串联：检测 → 保存指纹 → 生成下一章写前分析（含指纹注入）
 * 
 * 用法：
 *   npx tsx 检测工具/auto-pipeline.ts <当前章节号> [目标字数] [--project <项目名>]
 * 
 * 示例（刚写完第15章，准备写第16章）：
 *   npx tsx 检测工具/auto-pipeline.ts 15 3000 --project 裂日
 * 
 * 流程：
 *   1. 检测第N章 (--save-fingerprint)
 *   2. 验证指纹文件已生成
 *   3. 运行第N+1章写前分析（自动注入第N章指纹）
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { getProjectPath } from './project-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let CHAPTER_DIR = '';

function findChapterFile(chapterNum: number): string | null {
  if (!fs.existsSync(CHAPTER_DIR)) return null;
  const files = fs.readdirSync(CHAPTER_DIR).filter(f => f.endsWith('.md') && f.startsWith(`第${chapterNum}章`));
  return files.length > 0 ? path.join(CHAPTER_DIR, files[0]) : null;
}

function findFingerprintFile(chapterNum: number): string | null {
  if (!fs.existsSync(CHAPTER_DIR)) return null;
  const files = fs.readdirSync(CHAPTER_DIR).filter(f => f.startsWith(`第${chapterNum}章`) && f.endsWith('.fingerprint.json'));
  return files.length > 0 ? path.join(CHAPTER_DIR, files[0]) : null;
}

function findNode(): string {
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
    path.join(process.env.ProgramFiles?.replace(' (x86)', '') || 'C:\\Program Files', 'nodejs', 'node.exe'),
    'C:\\Program Files\\nodejs\\node.exe',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'node';
}

function runCommand(cmd: string, cwd: string): { output: string; success: boolean } {
  try {
    const output = execSync(cmd, { cwd, encoding: 'utf-8', stdio: 'pipe', timeout: 30000 });
    return { output, success: true };
  } catch (e: any) {
    return { output: e.stdout || e.stderr || e.message || '', success: false };
  }
}

function main() {
  const args = process.argv.slice(2);
  let projectName: string | undefined;

  // Parse --project
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && i + 1 < args.length) {
      projectName = args[i + 1];
      args.splice(i, 2);
      break;
    }
  }

  const chapterNum = parseInt(args[0]);
  const targetWords = parseInt(args[1]) || 3000;

  if (!chapterNum || chapterNum < 1) {
    console.log('用法：npx tsx 检测工具/auto-pipeline.ts <当前章节号> [目标字数] [--project <项目名>]');
    console.log('示例：npx tsx 检测工具/auto-pipeline.ts 15 3000 --project 裂日');
    console.log('');
    console.log('流程：检测第N章 → 保存指纹 → 第N+1章写前分析（含指纹注入）');
    process.exit(1);
  }

  // 解析项目路径
  const projectPath = getProjectPath(projectName);
  CHAPTER_DIR = path.join(projectPath, '章节');

  const nodeExe = findNode();
  const nextChapter = chapterNum + 1;

  console.log('╔══════════════════════════════════════════╗');
  console.log('║   质量指纹全链路自动化 v4.9              ║');
  console.log(`║   当前章：${chapterNum} → 下一章：${nextChapter}       ║`);
  console.log(`║   项目路径：${projectPath}                    ║`);
  console.log('╚══════════════════════════════════════════╝\n');

  // ============================================
  // Phase 1: 检测当前章 + 保存指纹
  // ============================================
  console.log('━━━ Phase 1/3：检测第' + chapterNum + '章 + 保存指纹 ━━━\n');

  const chapterFile = findChapterFile(chapterNum);
  if (!chapterFile) {
    console.error(`❌ 第${chapterNum}章文件不存在（目录：${CHAPTER_DIR}）`);
    process.exit(1);
  }

  const checkCmd = `"${nodeExe}" --import tsx "检测工具/check-chapter.ts" "${chapterFile}" --target ${targetWords} --save-fingerprint`;
  console.log(`执行：${checkCmd}\n`);
  const checkResult = runCommand(checkCmd, ROOT);

  if (checkResult.success) {
    console.log(checkResult.output);
    console.log('✅ 检测完成，本章通过质量门禁\n');
  } else {
    console.log(checkResult.output);
    console.log('❌ 本章存在 error 级违规（如排比堆叠≥6处），未通过质量门禁。');
    console.log('   处置：必须重写本章后重新运行 auto-pipeline，或在 check 通过（退出码0）后再继续。\n');
    process.exit(1);
  }

  // ============================================
  // Phase 2: 验证指纹文件
  // ============================================
  console.log('━━━ Phase 2/3：验证指纹文件 ━━━\n');

  const fpFile = findFingerprintFile(chapterNum);
  if (!fpFile) {
    console.error(`❌ 第${chapterNum}章指纹文件未生成`);
    console.error('   请确保 check-chapter.ts 支持 --save-fingerprint 参数');
    process.exit(1);
  }

  try {
    const fp = JSON.parse(fs.readFileSync(fpFile, 'utf-8'));
    console.log(`✅ 指纹文件已生成：${path.basename(fpFile)}`);
    console.log(`   破折号：${fp.dashes ?? 0} | "不是X是Y"：${fp.notXButY ?? 0} | 逗号比：${fp.commaChainRatio ?? '未知'}`);
    console.log(`   Error：${Array.isArray(fp.errors) ? fp.errors.length : 0} | Warning：${Array.isArray(fp.warnings) ? fp.warnings.length : 0}`);
    console.log(`   字数：${fp.wordCount ?? '未知'} / ${fp.targetWords ?? '未知'}\n`);
  } catch (e) {
    console.error(`❌ 指纹文件解析失败：${e}`);
    process.exit(1);
  }

  // ============================================
  // Phase 3: 下一章写前分析（含指纹注入）
  // ============================================
  console.log(`━━━ Phase 3/3：第${nextChapter}章写前分析（含指纹注入）━━━\n`);

  const preCmd = `"${nodeExe}" --import tsx "检测工具/pre-analysis.ts" ${nextChapter} ${targetWords} --project ${projectName || ''}`;
  console.log(`执行：${preCmd}\n`);
  const preResult = runCommand(preCmd, ROOT);

  if (preResult.success) {
    console.log(preResult.output);
    console.log('✅ 写前分析完成\n');
  } else {
    console.log(preResult.output);
    console.log('⚠️ 写前分析完成（部分数据缺失）\n');
  }

  // ============================================
  // Summary
  // ============================================
  console.log('═══════════════════════════════════════════');
  console.log('全链路自动化完成。');
  console.log(`  第${chapterNum}章检测 → 指纹保存 → 第${nextChapter}章写前分析（含指纹注入）`);
  console.log('═══════════════════════════════════════════');
}

main();