// ============================================================
// GWE V12.0 - CLI 命令行工具
// 用法: gwe check <file> | gwe book <file> | gwe write | gwe -
// ============================================================
import fs from 'fs';
import path from 'path';
import { createEngineWithKB } from './kb-loader';
import { createLLMProvider, getLLMConfig } from './config';
import type { CheckResult } from './types';
import { checkBook } from './book-checker';
import type { BookIssue } from './book-context';
import { WritingAgent } from './writing/agent';
import type { WritingSession } from './writing/agent';
import { createEmptyContext } from './writing/context-builder';

const VERSION = '12.0.0';

// 颜色
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

function printHelp(): void {
  console.log(`
${colorize('GWE - Generic Web-novel Engine 网文写作引擎', 'bold')} v${VERSION}

${colorize('用法:', 'cyan')}
  gwe check <file>        检测单个章节文件
  gwe book <file>         全书检测（多章连贯性/套路化/伏笔）
  gwe write [options]     智能写作：根据意图生成章节
  gwe -                   从标准输入读取文本并检测
  gwe --json <file>       输出JSON格式结果（用于程序集成）
  gwe --help, -h          显示帮助
  gwe --version, -v       显示版本

${colorize('写作命令 (write):', 'cyan')}
  gwe write --number <n> --title <标题> [--intent <意图>] [--outline <大纲文件>]
  gwe write --number <n> --title <标题> --instruction <用户指令>
  
  意图类型: advance_plot, reveal_secret, build_relationship, create_conflict,
            show_growth, build_atmosphere, plant_foreshadow, resolve_foreshadow,
            transition, climax, emotional_impact, world_building, character_intro,
            raise_stakes, breather

${colorize('示例:', 'cyan')}
  gwe check chapter.txt
  gwe book novel.txt
  gwe write --number 1 --title "觉醒" --intent show_growth
  gwe write --number 3 --title "决战" --intent climax --outline outline.txt
  cat chapter.txt | gwe -
  gwe --json chapter.txt > report.json

${colorize('评分说明:', 'cyan')}
  ≥90分 🏆 优秀，对标一线热门网文
  ≥85分 ✅ 良好，达到发布标准
  ≥75分 ⚠  及格，需要修改
  ≥60分 ⚠  较多问题，建议重写
  <60分 ✗ 质量不达标
`);
}

function printVersion(): void {
  console.log(`GWE v${VERSION}`);
}

// 全局引擎实例
let _engine: Awaited<ReturnType<typeof createEngineWithKB>>['engine'] | null = null;
async function getEngine() {
  if (_engine) return _engine;
  const llm = createLLMProvider();
  const { engine, result } = await createEngineWithKB(llm);
  if (result.errors.length > 0) {
    console.error(colorize(`KB加载警告: ${result.errors.length}个错误`, 'yellow'));
    for (const err of result.errors) console.error(colorize(`  - ${err}`, 'gray'));
  }
  _engine = engine;
  return engine;
}

async function runCheck(text: string, filePath?: string, outputJson = false): Promise<void> {
  const engine = await getEngine();
  const result: CheckResult = engine.check(text);

  if (outputJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // 标题
  console.log('');
  if (filePath) {
    console.log(colorize(`  GWE V${VERSION} 网文追读力检测`, 'bold') + colorize(`  ${filePath}`, 'gray'));
  } else {
    console.log(colorize(`  GWE V${VERSION} 网文追读力检测`, 'bold'));
  }
  console.log('');

  // 分数
  const scoreColor = result.score >= 90 ? 'green' : result.score >= 80 ? 'cyan' : result.score >= 70 ? 'yellow' : 'red';
  const passed = result.passed ? colorize('通过', 'green') : colorize('未通过', 'red');
  let grade = '';
  if (result.score >= 90) grade = colorize('🏆 优秀', 'green');
  else if (result.score >= 85) grade = colorize('✅ 良好', 'green');
  else if (result.score >= 75) grade = colorize('⚠  及格', 'yellow');
  else if (result.score >= 60) grade = colorize('⚠  较差', 'yellow');
  else grade = colorize('✗ 不达标', 'red');
  
  console.log(`  综合得分: ${colorize(`${result.score}分`, scoreColor)}  (${passed})  字数: ${result.stats.totalChars}字  ${grade}`);
  console.log('');

  // 雷达图
  console.log(colorize('  ─── 7维雷达评分 ───', 'cyan'));
  const radarLabels: Record<string, string> = {
    bodyReaction: '身体反应',
    sensorySignal: '感官信号',
    action: '动作推进',
    emotion: '情绪张力',
    infoAdvance: '信息推进',
    twistFrequency: '转折密度',
    hookStrength: '章末钩子',
  };
  for (const [key, label] of Object.entries(radarLabels)) {
    const score = result.radarScores[key as keyof typeof result.radarScores];
    const barLen = Math.floor(score / 5);
    const bar = colorize('█'.repeat(barLen), score >= 90 ? 'green' : score >= 75 ? 'cyan' : score >= 60 ? 'yellow' : 'red') + colorize('░'.repeat(20 - barLen), 'gray');
    const scoreStr = score === 100 ? colorize('100', 'green') : colorize(String(score).padStart(3), score >= 90 ? 'green' : score >= 75 ? 'cyan' : score >= 60 ? 'yellow' : 'red');
    console.log(`  ${label.padEnd(6)}  ${bar} ${scoreStr}`);
  }
  console.log('');

  // 违规项
  if (result.violations.length > 0) {
    const order = { error: 0, warning: 1, info: 2 };
    const sorted = [...result.violations].sort((a, b) => 
      (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
    );
    const errorCount = sorted.filter(v => v.severity === 'error').length;
    const warnCount = sorted.filter(v => v.severity === 'warning').length;
    const infoCount = sorted.filter(v => v.severity === 'info').length;
    
    console.log(colorize(`  ─── 违规项 (${colorize(`${errorCount} error`, 'red')}, ${colorize(`${warnCount} warning`, 'yellow')}, ${colorize(`${infoCount} info`, 'gray')}) ───`, 'cyan'));
    console.log('');
    for (const v of sorted) {
      const icon = v.severity === 'error' ? colorize('  ✗', 'red') : v.severity === 'warning' ? colorize('  ⚠', 'yellow') : colorize('  ℹ', 'gray');
      const name = colorize(`[${v.ruleName}]`, v.severity === 'error' ? 'red' : v.severity === 'warning' ? 'yellow' : 'gray');
      console.log(`${icon} ${name} ${v.message}`);
      if (v.suggestion) {
        const sugLines = v.suggestion.split('\n');
        for (const line of sugLines) {
          if (line.trim()) console.log(colorize(`      → ${line}`, 'gray'));
        }
      }
      console.log('');
    }
  } else {
    console.log(colorize('  ✓ 无违规项，章节质量优秀！', 'green'));
    console.log('');
  }

  // 统计
  console.log(colorize('  ─── 文本统计 ───', 'cyan'));
  console.log(`  段落数: ${result.stats.paragraphCount}  平均段长: ${result.stats.avgParagraphLength.toFixed(1)}字`);
  const anchorDensity = result.stats.totalChars > 0 ? ((result.stats.anchorCount / result.stats.totalChars) * 1000).toFixed(1) : '0';
  console.log(`  身体锚点: ${result.stats.anchorCount}个  (千字${anchorDensity}个)`);
  console.log(`  填充词: ${result.stats.fillerCount}个  对话占比: ${(result.stats.dialogueRatio * 100).toFixed(0)}%`);
  console.log('');
}

function printBookIssues(issues: BookIssue[]): void {
  if (issues.length === 0) {
    console.log(colorize('  ✓ 全书检测通过，未发现跨章问题！', 'green'));
    console.log('');
    return;
  }

  const errors = issues.filter(i => i.level === 'error');
  const warnings = issues.filter(i => i.level === 'warning');
  const infos = issues.filter(i => i.level === 'info');

  console.log(colorize(`  ─── 全书问题 (${colorize(`${errors.length} error`, 'red')}, ${colorize(`${warnings.length} warning`, 'yellow')}, ${colorize(`${infos.length} info`, 'gray')}) ───`, 'cyan'));
  console.log('');

  for (const issue of issues) {
    const icon = issue.level === 'error' ? colorize('  ✗', 'red') : issue.level === 'warning' ? colorize('  ⚠', 'yellow') : colorize('  ℹ', 'gray');
    const ch = issue.chapterIndex !== undefined ? colorize(`[第${issue.chapterIndex + 1}章]`, 'cyan') : '';
    console.log(`${icon} ${ch} ${issue.message}`);
    console.log('');
  }
}

function runBookCheck(text: string, filePath?: string): void {
  console.log('');
  if (filePath) {
    console.log(colorize(`  GWE V${VERSION} 全书连贯性检测`, 'bold') + colorize(`  ${filePath}`, 'gray'));
  } else {
    console.log(colorize(`  GWE V${VERSION} 全书连贯性检测`, 'bold'));
  }
  console.log('');

  const result = checkBook(text);

  console.log(colorize('  ─── 全书概览 ───', 'cyan'));
  console.log(`  章节数: ${result.stats.totalChapters}  总字数: ${result.stats.totalChars}字`);
  console.log(`  伏笔总数: ${result.stats.totalForeshadowing}  未回收: ${colorize(String(result.stats.unresolvedForeshadowing), result.stats.unresolvedForeshadowing > 5 ? 'yellow' : 'green')}`);
  console.log('');

  console.log(colorize('  ─── 开头类型分布 ───', 'cyan'));
  const typeNames: Record<string, string> = {
    'single-sensory': '单字感官',
    'dialogue': '对话',
    'action': '动作',
    'description': '描写',
    'internal-thought': '内心',
  };
  for (const [type, count] of Object.entries(result.stats.openingTypeCounts)) {
    const name = typeNames[type] || type;
    const warn = type === 'single-sensory' && count >= 3;
    console.log(`  ${name.padEnd(6)}: ${colorize(String(count), warn ? 'yellow' : 'cyan')}章 ${warn ? colorize('← 偏多，建议变化', 'yellow') : ''}`);
  }
  console.log('');

  console.log(colorize('  ─── 结尾类型分布 ───', 'cyan'));
  const endNames: Record<string, string> = {
    'reveal': '否定揭示',
    'cliffhanger': '悬念提问',
    'dialogue': '对话收尾',
    'action': '动作收尾',
    'emotion': '情绪短句',
  };
  for (const [type, count] of Object.entries(result.stats.endingTypeCounts)) {
    const name = endNames[type] || type;
    const warn = type === 'reveal' && count >= 3;
    console.log(`  ${name.padEnd(6)}: ${colorize(String(count), warn ? 'yellow' : 'cyan')}章 ${warn ? colorize('← 套路化风险', 'yellow') : ''}`);
  }
  console.log('');

  printBookIssues(result.issues);
}

// ============================================================
// v12.0: write 命令 — 智能写作
// ============================================================

async function runWrite(args: string[]): Promise<void> {
  // 解析参数
  let chapterNumber = 1;
  let title = '';
  let intent: string | undefined;
  let outlineFile: string | undefined;
  let instruction: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--number' && args[i + 1]) {
      chapterNumber = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--title' && args[i + 1]) {
      title = args[i + 1];
      i++;
    } else if (args[i] === '--intent' && args[i + 1]) {
      intent = args[i + 1];
      i++;
    } else if (args[i] === '--outline' && args[i + 1]) {
      outlineFile = args[i + 1];
      i++;
    } else if (args[i] === '--instruction' && args[i + 1]) {
      instruction = args[i + 1];
      i++;
    }
  }

  if (!title) {
    console.error(colorize('错误: 请指定章节标题 (--title)', 'red'));
    console.log('用法: gwe write --number <n> --title <标题> [--intent <意图>] [--outline <大纲文件>]');
    process.exit(1);
  }

  if (isNaN(chapterNumber) || chapterNumber < 1) {
    console.error(colorize('错误: 章节编号必须是正整数', 'red'));
    process.exit(1);
  }

  // 读取大纲文件
  let outline: string | undefined;
  if (outlineFile) {
    const resolvedPath = path.resolve(process.cwd(), outlineFile);
    if (!fs.existsSync(resolvedPath)) {
      console.error(colorize(`错误: 大纲文件不存在: ${resolvedPath}`, 'red'));
      process.exit(1);
    }
    outline = fs.readFileSync(resolvedPath, 'utf-8').trim();
  }

  console.log('');
  console.log(colorize(`  GWE V${VERSION} 智能写作`, 'bold'));
  console.log('');
  console.log(colorize(`  章节: 第${chapterNumber}章「${title}」`, 'cyan'));
  if (intent) console.log(colorize(`  意图: ${intent}`, 'cyan'));
  if (outline) console.log(colorize(`  大纲: ${outline.slice(0, 100)}${outline.length > 100 ? '...' : ''}`, 'gray'));
  if (instruction) console.log(colorize(`  指令: ${instruction}`, 'gray'));
  console.log('');

  // 创建写作智能体
  const llm = createLLMProvider();
  const cfg = getLLMConfig();
  console.log(colorize(`  LLM: ${cfg.provider} / ${cfg.model}`, 'cyan'));
  console.log('');

  const agent = new WritingAgent({}, llm);
  agent.createSession('未命名作品', '玄幻');

  console.log(colorize('  ─── 开始写作 ───', 'cyan'));
  console.log('');

  const validIntents = [
    'advance_plot', 'reveal_secret', 'build_relationship', 'create_conflict',
    'show_growth', 'build_atmosphere', 'plant_foreshadow', 'resolve_foreshadow',
    'transition', 'climax', 'emotional_impact', 'world_building', 'character_intro',
    'raise_stakes', 'breather',
  ];

  const startTime = Date.now();
  const result = await agent.writeChapter(chapterNumber, title, {
    userIntent: intent && validIntents.includes(intent) ? intent as any : undefined,
    outline,
    userInstruction: instruction,
  });

  const elapsed = Date.now() - startTime;
  const cr = result.chapterResult;

  console.log(colorize('  ─── 写作结果 ───', 'cyan'));
  console.log('');
  console.log(`  质量评分: ${colorize(`${Math.round(cr.qualityScore * 100)}分`, cr.success ? 'green' : 'yellow')}`);
  console.log(`  字数: ${cr.wordCount}字`);
  console.log(`  意图: ${cr.intent.primary.type} (置信度 ${Math.round(cr.intent.primary.confidence * 100)}%)`);
  console.log(`  重写次数: ${cr.rewriteRounds}次`);
  console.log(`  耗时: ${(elapsed / 1000).toFixed(1)}秒`);
  console.log('');

  if (cr.reflection.concerns.length > 0) {
    console.log(colorize('  ─── 质量关注点 ───', 'cyan'));
    for (const c of cr.reflection.concerns.slice(0, 5)) {
      console.log(`  [${c.dimension}] ${c.description} (${Math.round(c.severity * 100)}%)`);
    }
    console.log('');
  }

  if (cr.suggestions.length > 0) {
    console.log(colorize('  ─── 写作建议 ───', 'cyan'));
    for (const s of cr.suggestions) {
      console.log(`  ${s}`);
    }
    console.log('');
  }

  // 输出内容
  console.log(colorize('  ─── 章节内容 ───', 'cyan'));
  console.log(cr.content);
  console.log('');

  // 输出会话统计
  const session = result.session;
  console.log(colorize('  ─── 会话统计 ───', 'cyan'));
  console.log(`  总章节: ${session.stats.totalChapters}  总字数: ${session.stats.totalWords}字`);
  console.log(`  通过率: ${Math.round(session.stats.passRate * 100)}%  平均质量: ${Math.round(session.averageQualityScore * 100)}分`);
  console.log('');
}

// 主逻辑
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  printHelp();
  process.exit(0);
}

if (args.includes('-v') || args.includes('--version')) {
  printVersion();
  process.exit(0);
}

const outputJson = args.includes('--json');
const cleanArgs = args.filter(a => a !== '--json');

// 从stdin读取
if (cleanArgs[0] === '-' || cleanArgs[0] === '--stdin') {
  let data = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (chunk) => { data += chunk; });
  process.stdin.on('end', async () => {
    if (!data.trim()) {
      console.error(colorize('错误: 标准输入为空', 'red'));
      process.exit(1);
    }
    await runCheck(data, undefined, outputJson);
  });
} else if (cleanArgs[0] === 'check') {
  const filePath = cleanArgs[1];
  if (!filePath) {
    console.error(colorize('错误: 请指定要检测的文件路径', 'red'));
    console.log('用法: gwe check <file.txt>');
    process.exit(1);
  }
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(colorize(`错误: 文件不存在: ${resolvedPath}`, 'red'));
    process.exit(1);
  }
  const text = fs.readFileSync(resolvedPath, 'utf-8');
  (async () => { await runCheck(text, filePath, outputJson); })();
} else if (cleanArgs[0] === 'book') {
  const filePath = cleanArgs[1];
  if (!filePath) {
    console.error(colorize('错误: 请指定要检测的文件路径（支持含多章的全书文件）', 'red'));
    console.log('用法: gwe book <novel.txt>');
    process.exit(1);
  }
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(colorize(`错误: 文件不存在: ${resolvedPath}`, 'red'));
    process.exit(1);
  }
  const text = fs.readFileSync(resolvedPath, 'utf-8');
  runBookCheck(text, filePath);
} else if (cleanArgs[0] === 'write') {
  runWrite(cleanArgs.slice(1)).catch(err => {
    console.error(colorize(`错误: ${err.message}`, 'red'));
    process.exit(1);
  });
} else {
  const filePath = cleanArgs[0];
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(resolvedPath)) {
    const text = fs.readFileSync(resolvedPath, 'utf-8');
    (async () => { await runCheck(text, filePath, outputJson); })();
  } else {
    console.error(colorize(`错误: 未知命令或文件不存在: ${cleanArgs[0]}`, 'red'));
    console.log('使用 gwe --help 查看帮助');
    process.exit(1);
  }
}