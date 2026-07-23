// ============================================================
// GWE V3.2 - CLI 命令行工具
// 用法: gwe check <file> | gwe - | gwe --json <file>
// ============================================================
import fs from 'fs';
import path from 'path';
import { createEngineWithKB } from './kb-loader';
import { MockProvider } from './llm-provider';
import type { CheckResult } from './types';
import { checkBook } from './book-checker';
import type { BookIssue } from './book-context';

const VERSION = '3.3.0';

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
${colorize('GWE - Generic Web-novel Engine 网文追读力引擎', 'bold')} v${VERSION}

${colorize('用法:', 'cyan')}
  gwe check <file>        检测单个章节文件
  gwe book <file>         全书检测（多章连贯性/套路化/伏笔）
  gwe -                   从标准输入读取文本并检测
  gwe --json <file>       输出JSON格式结果（用于程序集成）
  gwe --help, -h          显示帮助
  gwe --version, -v       显示版本

${colorize('示例:', 'cyan')}
  gwe check chapter.txt
  gwe book novel.txt
  cat chapter.txt | gwe -
  gwe --json chapter.txt > report.json

${colorize('评分说明:', 'cyan')}
  ≥90分 🏆 优秀，对标一线热门网文
  ≥85分 ✅ 良好，达到发布标准
  ≥75分 ⚠  及格，需要修改
  ≥60分 ⚠  较多问题，建议重写
  <60分 ✗ 质量不达标

${colorize('评分维度:', 'cyan')}
  身体反应  感官信号  动作推进  情绪张力
  信息推进  转折密度  章末钩子

${colorize('全书检测:', 'cyan')}
  检测开头/结尾套路重复、章节衔接断裂、设定违反、伏笔未回收
`);
}

function printVersion(): void {
  console.log(`GWE v${VERSION}`);
}

// 全局引擎实例
let _engine: ReturnType<typeof createEngineWithKB>['engine'] | null = null;
function getEngine() {
  if (_engine) return _engine;
  const { engine, result } = createEngineWithKB(new MockProvider());
  if (result.errors.length > 0) {
    console.error(colorize(`KB加载警告: ${result.errors.length}个错误`, 'yellow'));
    for (const err of result.errors) console.error(colorize(`  - ${err}`, 'gray'));
  }
  _engine = engine;
  return engine;
}

function runCheck(text: string, filePath?: string, outputJson = false): void {
  const engine = getEngine();
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

  // 统计概览
  console.log(colorize('  ─── 全书概览 ───', 'cyan'));
  console.log(`  章节数: ${result.stats.totalChapters}  总字数: ${result.stats.totalChars}字`);
  console.log(`  伏笔总数: ${result.stats.totalForeshadowing}  未回收: ${colorize(String(result.stats.unresolvedForeshadowing), result.stats.unresolvedForeshadowing > 5 ? 'yellow' : 'green')}`);
  console.log('');

  // 开头类型分布
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

  // 结尾类型分布
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

  // 问题列表
  printBookIssues(result.issues);
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
  process.stdin.on('end', () => {
    if (!data.trim()) {
      console.error(colorize('错误: 标准输入为空', 'red'));
      process.exit(1);
    }
    runCheck(data, undefined, outputJson);
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
  runCheck(text, filePath, outputJson);
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
} else {
  const filePath = cleanArgs[0];
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(resolvedPath)) {
    const text = fs.readFileSync(resolvedPath, 'utf-8');
    runCheck(text, filePath, outputJson);
  } else {
    console.error(colorize(`错误: 未知命令或文件不存在: ${cleanArgs[0]}`, 'red'));
    console.log('使用 gwe --help 查看帮助');
    process.exit(1);
  }
}