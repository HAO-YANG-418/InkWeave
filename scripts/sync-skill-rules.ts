#!/usr/bin/env tsx
/**
 * 铁则自动同步脚本 —— 根治「SKILL.md 铁则与 base-prompt.ts 漂移」
 *
 * 背景（2026-09-04 事故）：
 *   agent 模式（无 key）下，模型 system 上下文里真正生效的只有 SKILL.md。
 *   base-prompt.ts 的十二铁则若不物理嵌进 SKILL.md，就永远只是「文件里的字」，
 *   不进 system = 不生效 = 初稿写空 / 卡 D 级。此前靠手工复制，必然漂移。
 *
 * 做法：
 *   从 源码/kb/base-prompt.ts 抽取 BASE_PROMPT_MD 全文，
 *   写入 SKILL.md 中 <!-- BEGIN_AUTO_RULES --> … <!-- END_AUTO_RULES --> 之间。
 *
 * 用法：npx tsx scripts/sync-skill-rules.ts [--check]
 *   --check 只校验是否漂移（CI/报告前自检），有漂移 exit 1
 *
 * 铁律：改了 源码/kb/base-prompt.ts 之后必须跑本脚本（不带 --check），
 *       再跑 npm run build 同步 dist。两步缺一即视为未生效。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const BASE_PROMPT_PATH = resolve(ROOT, '源码/kb/base-prompt.ts');
const SKILL_PATH = resolve(ROOT, 'skill/inkweave-writer/SKILL.md');

const BEGIN = '<!-- BEGIN_AUTO_RULES -->';
const END = '<!-- END_AUTO_RULES -->';

/** 从 ts 源文件中抽出 BASE_PROMPT_MD 模板字符串正文 */
function extractBasePrompt(): string {
  if (!existsSync(BASE_PROMPT_PATH)) {
    throw new Error(`找不到底座文件: ${BASE_PROMPT_PATH}`);
  }
  const src = readFileSync(BASE_PROMPT_PATH, 'utf-8');
  const startMatch = src.match(/export\s+const\s+BASE_PROMPT_MD\s*=\s*`/);
  if (!startMatch || startMatch.index === undefined) {
    throw new Error('base-prompt.ts 中未找到 `export const BASE_PROMPT_MD = ` 声明');
  }
  const bodyStart = startMatch.index + startMatch[0].length;
  // 模板字符串以反引号结束；本体中不含裸反引号，直接找下一个反引号
  const bodyEnd = src.indexOf('`', bodyStart);
  if (bodyEnd < 0) {
    throw new Error('base-prompt.ts 中 BASE_PROMPT_MD 模板字符串未闭合');
  }
  return src.slice(bodyStart, bodyEnd);
}

/** 把底座正文包成 SKILL.md 里的自动块 */
function buildAutoBlock(base: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return [
    BEGIN,
    '',
    '> **本段由 `scripts/sync-skill-rules.ts` 从 `源码/kb/base-prompt.ts` 自动同步，禁止手改。**',
    `> 最近同步：${stamp} · 改了 base-prompt.ts 必须重跑 \`npx tsx scripts/sync-skill-rules.ts\` + \`npm run build\``,
    '',
    '```text',
    base.trim(),
    '```',
    '',
    END,
  ].join('\n');
}

function main(): void {
  const checkOnly = process.argv.includes('--check');

  if (!existsSync(SKILL_PATH)) {
    console.error(`[sync-skill-rules] 找不到 SKILL.md: ${SKILL_PATH}`);
    process.exit(1);
  }

  const base = extractBasePrompt();
  const skill = readFileSync(SKILL_PATH, 'utf-8');
  const wanted = buildAutoBlock(base);

  const bIdx = skill.indexOf(BEGIN);
  const eIdx = skill.indexOf(END);

  if (bIdx < 0 || eIdx < 0 || eIdx <= bIdx) {
    console.error(`[sync-skill-rules] SKILL.md 缺少 ${BEGIN} / ${END} 标记，无法自动同步`);
    process.exit(1);
  }

  const current = skill.slice(bIdx, eIdx + END.length);

  if (checkOnly) {
    // 忽略时间戳行差异，只比规则正文
    const norm = (s: string) => s.replace(/^> 最近同步：.*$/m, '').trim();
    if (norm(current) === norm(wanted)) {
      console.log('[sync-skill-rules] ✓ 无漂移：SKILL.md 铁则与 base-prompt.ts 一致');
      process.exit(0);
    }
    console.error('[sync-skill-rules] ✗ 检测到漂移：SKILL.md 铁则已落后于 base-prompt.ts');
    console.error('[sync-skill-rules]   请运行：npx tsx scripts/sync-skill-rules.ts && npm run build');
    process.exit(1);
  }

  const next = skill.slice(0, bIdx) + wanted + skill.slice(eIdx + END.length);
  writeFileSync(SKILL_PATH, next, 'utf-8');

  // 统计同步量，便于报告核对
  const ruleCount = (base.match(/^铁则[零一二三四五六七八九十]+：/gm) || []).length;
  console.log(`[sync-skill-rules] ✓ 已同步 ${ruleCount} 条铁则 → SKILL.md（${base.trim().length} 字符）`);
}

main();
