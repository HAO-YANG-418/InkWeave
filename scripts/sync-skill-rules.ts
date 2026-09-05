#!/usr/bin/env tsx
/**
 * 铁则 + 好范本 自动同步脚本 —— 根治「SKILL.md 与底座漂移」
 *
 * 背景（2026-09-04 事故）：
 *   agent 模式（无 key）下，模型 system 上下文里真正生效的只有 SKILL.md。
 *   base-prompt.ts 的十二铁则若不物理嵌进 SKILL.md，就永远只是「文件里的字」，
 *   不进 system = 不生效 = 初稿写空 / 卡 D 级。此前靠手工复制，必然漂移。
 *
 * 2026-09-05 扩展（方案乙·治本）：
 *   原脚本只同步「铁则」一块，导致 SKILL.md 里的「好范本」段游离在 AUTO_RULES 块之外、
 *   永远不被同步、手工改了也跨副本漂移（残留跨两轮未清）。
 *   现改为「双块」：铁则来自 base-prompt.ts，好范本来自 源码/kb/good-examples.md，
 *   两块都以 BEGIN/END 标记自动同步到全部 4 个加载点，杜绝任何一块手工漂移。
 *
 * 用法：npx tsx scripts/sync-skill-rules.ts [--check]
 *   --check 只校验是否漂移（CI/报告前自检），有漂移 exit 1
 *
 * 铁律：改了 源码/kb/base-prompt.ts 或 源码/kb/good-examples.md 之后必须跑本脚本，
 *       再跑 npm run build 同步 dist。两步缺一即视为未生效。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const BASE_PROMPT_PATH = resolve(ROOT, '源码/kb/base-prompt.ts');
const GOOD_EXAMPLES_PATH = resolve(ROOT, '源码/kb/good-examples.md');

/**
 * 好范本内容合规门禁 —— 根治「sync 只搬运不校验」的复发路径。
 * 背景：上一轮好范本 L17 把破折号 + 是字判断句 + 固定锚点词当「正面示范」灌进 4 副本 system，
 *   sync 却只做字节搬运不校验内容。故在同步/校验前先扫好范本内容，命中铁则硬伤即阻断。
 * 边界：只扫 ✅ 正例段（✅ 之后、下一个 ❌ 之前的行）；❌ 反例段豁免（它本就故意展示"别这么写"）。
 * 注意：是字判断句 tell 无法可靠正则化（易误伤普通"是"字），靠正例驱动解决，不在此硬卡。
 */
const EXAMPLE_FORBIDDEN: { name: string; re: RegExp }[] = [
  { name: '破折号——（铁则零容忍）', re: /——/ },
  { name: '固定锚点词库标准件', re: /指节发白|胃猛地一缩|喉咙发紧|后颈汗毛竖起|肌肉绷紧|喉结滚动/ },
];

function validateGoodExamples(content: string): string[] {
  const errors: string[] = [];
  const lines = content.split(/\r?\n/);
  let inBad = false;
  lines.forEach((line, i) => {
    const t = line.trim();
    if (/^❌/.test(t)) { inBad = true; return; }
    if (/^✅/.test(t)) { inBad = false; return; }
    if (inBad) return;
    for (const f of EXAMPLE_FORBIDDEN) {
      if (f.re.test(line)) {
        errors.push(`L${i + 1}: ${f.name} → ${t.slice(0, 40)}`);
        break;
      }
    }
  });
  return errors;
}

/**
 * 全部「真实 skill」加载点（铁则 + 好范本 副本）。
 * 注意：inkweave-writer-bare 是零铁则裸写对照变体，故意不同步，必须排除。
 * 历史上本脚本只同步主副本，导致其余副本长期漂移（user-level 副本陈旧、
 * 且因在 InkWeave 目录树之外从未被树内 grep/校验覆盖）。故统一覆盖全部副本，
 * 杜绝「加载点不一致」——改了底座一次跑通即全副本生效。
 */
const SKILL_PATHS: string[] = [
  resolve(ROOT, 'skill/inkweave-writer/SKILL.md'),                             // A 主副本（InkWeave/skill）
  resolve(ROOT, '..', '.workbuddy/skills/inkweave-writer/SKILL.md'),           // B 根项目（写作引擎产品/.workbuddy）
  resolve(ROOT, '.workbuddy/skills/inkweave-writer/SKILL.md'),                 // C 子目录（InkWeave/.workbuddy）
  'C:/Users/admin/.workbuddy/skills/inkweave-writer/SKILL.md',                 // D user-level（跨项目，实际加载点）
].filter(existsSync);

type SourceSpec =
  | { type: 'ts-const'; file: string; name: string }
  | { type: 'md'; file: string };

interface BlockSpec {
  begin: string;
  end: string;
  source: SourceSpec;
  fence: boolean;   // true=包进 ```text（铁则需当原文读）；false=裸 markdown（好范本要保留标题/加粗渲染）
  label: string;
}

const BLOCKS: BlockSpec[] = [
  {
    begin: '<!-- BEGIN_AUTO_RULES -->',
    end: '<!-- END_AUTO_RULES -->',
    source: { type: 'ts-const', file: BASE_PROMPT_PATH, name: 'BASE_PROMPT_MD' },
    fence: true,
    label: '铁则',
  },
  {
    begin: '<!-- BEGIN_AUTO_EXAMPLES -->',
    end: '<!-- END_AUTO_EXAMPLES -->',
    source: { type: 'md', file: GOOD_EXAMPLES_PATH },
    fence: false,
    label: '好范本',
  },
];

/** 从 ts 源文件中抽出某个 const 模板字符串正文 */
function extractTsConst(file: string, name: string): string {
  if (!existsSync(file)) throw new Error(`找不到源文件: ${file}`);
  const src = readFileSync(file, 'utf-8');
  const startMatch = src.match(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\``));
  if (!startMatch || startMatch.index === undefined) {
    throw new Error(`${file} 中未找到 \`export const ${name} =\` 声明`);
  }
  const bodyStart = startMatch.index + startMatch[0].length;
  const bodyEnd = src.indexOf('`', bodyStart);   // 本体不含裸反引号，直接找下一个反引号
  if (bodyEnd < 0) throw new Error(`${file} 中 ${name} 模板字符串未闭合`);
  return src.slice(bodyStart, bodyEnd);
}

/** 取某块的正文（来自 ts const 或 md 文件） */
function getBody(spec: BlockSpec): string {
  if (spec.source.type === 'ts-const') {
    return extractTsConst(spec.source.file, spec.source.name);
  }
  if (!existsSync(spec.source.file)) throw new Error(`找不到好范本源文件: ${spec.source.file}`);
  return readFileSync(spec.source.file, 'utf-8');
}

/** 把正文包成 SKILL.md 里的自动块（含禁止手改警告 + 同步时间戳） */
function buildBlock(spec: BlockSpec): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const body = getBody(spec).trim();
  const inner = spec.fence ? ['```text', body, '```'] : [body];
  return [
    spec.begin,
    '',
    '> **本段由 `scripts/sync-skill-rules.ts` 从底座自动同步，禁止手改。**',
    `> 最近同步：${stamp} · 改了底座必须重跑 \`npx tsx scripts/sync-skill-rules.ts\` + \`npm run build\``,
    '',
    ...inner,
    '',
    spec.end,
  ].join('\n');
}

/** 单副本单块同步：把块写入 path 的 BEGIN/END 之间。返回是否成功写入 */
function syncOne(path: string, spec: BlockSpec, wanted: string): boolean {
  if (!existsSync(path)) return false;
  const skill = readFileSync(path, 'utf-8');
  const bIdx = skill.indexOf(spec.begin);
  const eIdx = skill.indexOf(spec.end);
  if (bIdx < 0 || eIdx < 0 || eIdx <= bIdx) {
    console.error(`[sync] ✗ ${path} 缺少 ${spec.label} 的 BEGIN/END 标记，跳过`);
    return false;
  }
  const next = skill.slice(0, bIdx) + wanted + skill.slice(eIdx + spec.end.length);
  writeFileSync(path, next, 'utf-8');
  return true;
}

/** 归一化：忽略同步时间戳行，只比正文 */
function normBlock(s: string): string {
  return s.replace(/^> 最近同步：.*$/m, '').trim();
}

function main(): void {
  const checkOnly = process.argv.includes('--check');

  // 好范本内容合规门禁：同步/校验前先扫，脏范本直接阻断（exit 1），不搬运不判绿。
  const exViolations = validateGoodExamples(readFileSync(GOOD_EXAMPLES_PATH, 'utf-8'));
  if (exViolations.length > 0) {
    console.error('[sync] ✗ 好范本内容违反铁则，阻断（先改 源码/kb/good-examples.md）：');
    for (const v of exViolations) console.error(`  - ${v}`);
    process.exit(1);
  }

  if (checkOnly) {
    let allOk = true;
    for (const spec of BLOCKS) {
      const wanted = buildBlock(spec);
      for (const p of SKILL_PATHS) {
        if (!existsSync(p)) continue;
        const skill = readFileSync(p, 'utf-8');
        const bIdx = skill.indexOf(spec.begin);
        const eIdx = skill.indexOf(spec.end);
        if (bIdx < 0 || eIdx < 0) {
          console.error(`[sync] ✗ 漂移：${p} 缺 ${spec.label} 标记`);
          allOk = false;
          continue;
        }
        const current = skill.slice(bIdx, eIdx + spec.end.length);
        if (normBlock(current) !== normBlock(wanted)) {
          console.error(`[sync] ✗ 漂移：${p} ${spec.label} 落后于底座`);
          allOk = false;
        }
      }
    }
    if (allOk) {
      console.log(`[sync] ✓ 无漂移：全部 ${SKILL_PATHS.length} 个副本 · 铁则 + 好范本 两块均与底座一致`);
      process.exit(0);
    }
    console.error('[sync]   请运行：npx tsx scripts/sync-skill-rules.ts && npm run build');
    process.exit(1);
  }

  // 同步模式：逐块写入全部副本
  let synced = 0;
  for (const spec of BLOCKS) {
    const wanted = buildBlock(spec);
    for (const p of SKILL_PATHS) {
      if (syncOne(p, spec, wanted)) synced++;
    }
  }
  if (synced === 0) {
    console.error('[sync] 未写入任何副本，请检查路径配置');
    process.exit(1);
  }
  console.log(`[sync] ✓ 已同步 ${BLOCKS.length} 块内容 → ${synced} 个副本（铁则 + 好范本）`);
}

main();
