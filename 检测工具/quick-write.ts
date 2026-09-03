/**
 * 轻量快写模式 v4.9
 * 
 * 跳过详细逐段推演，仅跑关键门禁 + 风格配方，输出最小生成简报。
 * 面向非技术用户——不需要懂镜头链、不需要填冷却表格。
 * 
 * 用法：npx tsx 检测工具/quick-write.ts <章节号> [目标字数] [--project <项目名>]
 * 示例：npx tsx 检测工具/quick-write.ts 16 3000 --project 裂日
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getProjectPath } from './project-config.js';
import { resolveProjectDir, step0StyleRecipe } from './pre-analysis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let PROJECT_PATH = '';

function chapterDir(): string {
  return path.join(PROJECT_PATH, '章节');
}

function readFileSafe(filePath: string): string {
  try { return fs.readFileSync(filePath, 'utf-8'); }
  catch { return ''; }
}

function countWords(text: string): number {
  return (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
}

function main() {
  const args = process.argv.slice(2);
  let projectName: string | undefined;

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
    console.log('用法：npx tsx 检测工具/quick-write.ts <章节号> [目标字数] [--project <项目名>]');
    console.log('示例：npx tsx 检测工具/quick-write.ts 16 3000 --project 裂日');
    console.log('');
    console.log('轻量模式：跳过详细推演，仅跑关键门禁，输出最小生成简报。');
    process.exit(1);
  }

  PROJECT_PATH = getProjectPath(projectName);
  resolveProjectDir(projectName); // 同步 PROJECT_PATH 到 pre-analysis 模块

  const dir = chapterDir();

  // ====== v4.9：加载风格配方 ======
  const styleRecipe = step0StyleRecipe(chapterNum);

  // ====== 检查上一章指纹 ======
  const prevChapter = chapterNum - 1;
  let prevFingerprint: any = null;
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    const fpFiles = files.filter(f => f.startsWith(`第${prevChapter}章`) && f.endsWith('.fingerprint.json'));
    if (fpFiles.length > 0) {
      try { prevFingerprint = JSON.parse(fs.readFileSync(path.join(dir, fpFiles[0]), 'utf-8')); }
      catch {}
    }
  }

  // ====== 读取大纲 ======
  const outlineDir = path.join(PROJECT_PATH, '大纲');
  let chapterOutline = '(未找到本章大纲)';
  if (fs.existsSync(outlineDir)) {
    const outlineFiles = fs.readdirSync(outlineDir).filter(f => f.endsWith('.md'));
    if (outlineFiles.length > 0) {
      const outline = readFileSafe(path.join(outlineDir, outlineFiles[0]));
      const lines = outline.split('\n');
      let inChapter = false;
      for (const line of lines) {
        if (line.includes(`第${chapterNum}章`) || line.includes(`Ch${chapterNum}`)) {
          inChapter = true;
          chapterOutline = line.trim();
        } else if (inChapter) {
          if (line.includes(`第${chapterNum + 1}章`) || line.match(/^#{1,3}\s/)) break;
          if (line.trim()) chapterOutline += '\n' + line.trim();
        }
      }
    }
  }

  // ====== 输出最小简报 ======
  console.log('╔══════════════════════════════════════╗');
  console.log(`║   轻量快写模式 v4.9 — 第${chapterNum}章       ║`);
  console.log(`║   目标字数：${targetWords}                    ║`);
  console.log('╚══════════════════════════════════════╝\n');

  console.log('## 本章简报（轻量）\n');
  console.log(`**大纲**：${chapterOutline.split('\n')[0]}`);
  console.log(`**目标字数**：${targetWords}（±20%：${Math.floor(targetWords * 0.8)}-${Math.ceil(targetWords * 1.2)}）`);
  console.log(`**场景数**：4-6个\n`);

  // ====== v4.9：风格配方（预设驱动） ======
  console.log('## 风格配方（预设 + 多样性轮换）\n');
  console.log(styleRecipe);
  console.log('---\n');

  // ====== 关键门禁（仅3条） ======
  console.log('## 关键门禁（仅3条，写前确认）\n');

  // 门禁1：破折号零容忍
  console.log('### 门禁1：破折号零容忍');
  console.log('本章不出现任何一个"——"。认知翻转用逗号，对话中断用动作打断。\n');

  // 门禁2：字数硬约束
  console.log(`### 门禁2：字数硬约束`);
  console.log(`目标${targetWords}字，超标20%（>${Math.ceil(targetWords * 1.2)}字）直接不合格。\n`);

  // 门禁3：本章禁忌（从上一章指纹注入）
  console.log('### 门禁3：本章禁忌');
  if (prevFingerprint) {
    const stylePatterns = prevFingerprint.stylePatterns || {};
    let hasConstraint = false;

    if (stylePatterns.verbStacking && stylePatterns.verbStacking.length > 0) {
      console.log('**排比堆叠（最高优先级）**');
      console.log(`- 上章检测到${stylePatterns.verbStacking.length}组排比堆叠`);
      console.log('- 本章每场景至多1处排比。超过1处换句型：第2处动作接感官，第3处环境回应。');
      console.log('- 禁止："穿过X穿过Y穿过Z" / "往X里流往Y里渗往Z里钻"');
      hasConstraint = true;
    }

    if (prevFingerprint.dashes > 0) {
      console.log(`- 上章有${prevFingerprint.dashes}处破折号 → 本章零容忍`);
      hasConstraint = true;
    }

    if (prevFingerprint.notXButY > 0) {
      console.log(`- 上章有${prevFingerprint.notXButY}处"不是X是Y" → 本章禁止`);
      hasConstraint = true;
    }

    if (!hasConstraint) {
      console.log('✅ 上章无关键违规，本章维持标准约束。');
    }
  } else {
    console.log('⚠️ 无上一章指纹数据（首章或指纹缺失），跳过本章禁忌。');
  }
  console.log('');

  // ====== 生成提示 ======
  console.log('## 生成提示\n');
  console.log('1. 读完大纲后直接开始写，不要反复推敲');
  console.log('2. 写完每个场景回头数一下字数，接近目标就收束');
  console.log('3. 写完后运行：`npx tsx 检测工具/check-chapter.ts <本章文件> --target ' + targetWords + ' --save-fingerprint' + (projectName ? ' --project ' + projectName : '') + '`');
  console.log('4. 评分≥85分直接交稿，<85分全文重写（禁止修补）\n');

  console.log('═══════════════════════════════════════');
  console.log('轻量简报完成。开始写，写完检测。');
  console.log('═══════════════════════════════════════');
}

main();