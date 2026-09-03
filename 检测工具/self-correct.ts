/**
 * InkWeave 一键模型自纠连跑脚本
 * ============================================================
 * 对目录下每章执行：门禁检测 → 收集 AI 味警告 → 构造自纠 prompt →
 * 调 LLM 重写 → 门禁 accept/reject → 写回。
 *
 * - 零 LLM 也可跑：默认 --dry-run，仅输出每章「模型会怎么改」的待改清单
 *   + 模拟门禁判定，用于验证自纠逻辑与验收基线（不写文件）。
 * - 接 provider 后加 --llm 即真跑自动连写：需环境变量
 *   CUSTOM_BASE_URL + CUSTOM_MODEL (+ 可选 CUSTOM_API_KEY/OPENAI_API_KEY)。
 *
 * 复用：
 *   - 模型自纠核心（唯一真源）：../源码/writing/self-correction-core.js
 *   - 双树门禁（与 check-all 同口径）：./checkers.js + ../源码/checker.js
 *
 * 用法：
 *   npx tsx self-correct.ts <章节目录> [--dry-run | --llm] [--target 2800] [--project <名>]
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  SELF_CORRECTION_INSTRUCTIONS,
  isAiFeelViolation,
  buildSelfCorrectionPrompt,
  evaluateSelfCorrection,
  type AiViolation,
} from '../源码/writing/self-correction-core.js'
import { checkChapter } from './checkers.js'
import { check as runSourceTreeCheckRaw } from '../源码/checker.js'
import { DEFAULT_THRESHOLDS, DEFAULT_RADAR_WEIGHTS, MergedConfig } from '../源码/types.js'
import { getProjectPath } from './project-config.js'

// —— R1 双跑聚合：与 check-all 同口径的最小 mergedConfig（disabledChecks 必须空）——
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
}

function runSourceTreeCheck(text: string, targetWords?: number): any[] {
  try {
    const r = runSourceTreeCheckRaw(text, null, R1_MERGED_CONFIG, targetWords)
    return (r && (r as any).violations) || []
  } catch {
    return []
  }
}

function computeScore(violations: any[]): number {
  let penalty = 0
  for (const v of violations) {
    if (v.severity === 'error') penalty += 10
    else if (v.severity === 'warning') penalty += 4
    else penalty += 1
  }
  return Math.max(0, 100 - penalty)
}

function toAi(v: any): AiViolation {
  return { ruleName: v.ruleName, message: v.message, severity: v.severity, suggestion: v.suggestion }
}

/** 清理 LLM 输出可能裹的 markdown 噪音（``` 代码块 / 标题行） */
function cleanOutput(text: string): string {
  let t = text.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '')
  }
  return t
    .split('\n')
    .filter((l) => !/^#{1,6}\s+/.test(l.trim()))
    .join('\n')
    .trim()
}

/** 调 OpenAI 兼容 chat completions（需 provider；无则抛错由上层降级 dry-run） */
async function callLlm(prompt: string, targetWords: number): Promise<string> {
  const base = process.env.CUSTOM_BASE_URL
  const model = process.env.CUSTOM_MODEL
  const key = process.env.CUSTOM_API_KEY || process.env.OPENAI_API_KEY
  if (!base || !model) {
    throw new Error('未配置 provider：需 CUSTOM_BASE_URL + CUSTOM_MODEL（+ 可选 key）')
  }
  const resp = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: Math.ceil(targetWords * 2.4),
    }),
  })
  if (!resp.ok) throw new Error(`LLM 调用失败 ${resp.status}: ${await resp.text()}`)
  const j = await resp.json()
  return j?.choices?.[0]?.message?.content ?? ''
}

interface ChapterResult {
  name: string
  score: number
  errors: number
  aiWarnings: number
  status: string
  detail?: string
}

async function selfCorrectChapter(
  file: string,
  text: string,
  targetWords: number,
  dryRun: boolean,
): Promise<ChapterResult> {
  const cli = checkChapter(text, targetWords)
  const src = runSourceTreeCheck(text, targetWords)
  const all = [...(cli as any).violations, ...src]
  const asAi = all.map(toAi)
  const score = computeScore(all)
  const errors = all.filter((v: any) => v.severity === 'error').length
  const ai = asAi.filter((v) => v.severity !== 'error' && isAiFeelViolation(v))

  if (errors > 0) {
    return { name: path.basename(file), score, errors, aiWarnings: ai.length, status: 'SKIP', detail: '有硬错误，交检测器门禁处理' }
  }
  if (ai.length === 0) {
    return { name: path.basename(file), score, errors: 0, aiWarnings: 0, status: 'CLEAN', detail: '无 AI 味可修' }
  }

  const prompt = buildSelfCorrectionPrompt(text, asAi)

  if (dryRun) {
    return {
      name: path.basename(file), score, errors: 0, aiWarnings: ai.length,
      status: 'DRY-RUN', detail: ai.map((v) => `${v.ruleName}: ${v.message?.slice(0, 50)}`).join(' | '),
    }
  }

  try {
    const corrected = await callLlm(prompt, targetWords)
    const cleaned = cleanOutput(corrected)
    if (cleaned.length < targetWords * 0.5) {
      return { name: path.basename(file), score, errors: 0, aiWarnings: ai.length, status: 'REJECT', detail: '字数额外不足50%' }
    }
    const afterCli = checkChapter(cleaned, targetWords)
    const afterSrc = runSourceTreeCheck(cleaned, targetWords)
    const afterAll = [...(afterCli as any).violations, ...afterSrc].map(toAi)
    if (!evaluateSelfCorrection(asAi, afterAll, text.length, cleaned.length, targetWords)) {
      return { name: path.basename(file), score, errors: 0, aiWarnings: ai.length, status: 'REJECT', detail: '门禁驳回（error增多/AI味增多/字数崩）' }
    }
    fs.writeFileSync(file, cleaned, 'utf-8')
    return { name: path.basename(file), score, errors: 0, aiWarnings: ai.length, status: 'APPLIED', detail: `已自纠写回（${text.length}→${cleaned.length}字）` }
  } catch (e: any) {
    return { name: path.basename(file), score, errors: 0, aiWarnings: ai.length, status: 'NO-PROVIDER', detail: e?.message || String(e) }
  }
}

function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.log('用法：npx tsx self-correct.ts <章节目录> [--dry-run | --llm] [--target 2800] [--project <名>]')
    console.log('  --dry-run  默认；零 LLM 输出每章待改清单 + 模拟门禁（不写文件）')
    console.log('  --llm      需 CUSTOM_BASE_URL+CUSTOM_MODEL(+key)；真跑自动连写')
    process.exit(1)
  }
  let projectName: string | undefined
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && i + 1 < args.length) { projectName = args[i + 1]; args.splice(i, 2); i-- }
  }
  const dryRun = !args.includes('--llm')
  const jsonMode = args.includes('--json')
  let targetWords = 2800
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' && i + 1 < args.length) { targetWords = parseInt(args[i + 1], 10); args.splice(i, 2); i-- }
  }
  let dirPath: string | undefined
  if (projectName) dirPath = path.join(getProjectPath(projectName), '章节')
  else if (args.length > 0 && !args[0].startsWith('--')) dirPath = path.resolve(args[0])
  else { console.error('请提供章节目录或 --project <名>'); process.exit(1) }

  if (!fs.existsSync(dirPath!) || !fs.statSync(dirPath!).isDirectory()) {
    console.error(`目录不存在：${dirPath}`); process.exit(1)
  }

  const files = fs.readdirSync(dirPath!)
    .filter((f) => f.endsWith('.md'))
    .sort((a, b) => parseInt(a.match(/\d+/)?.[0] || '0') - parseInt(b.match(/\d+/)?.[0] || '0'))
    .map((f) => path.join(dirPath!, f))

  if (files.length === 0) { console.error('目录中没有 .md 文件'); process.exit(1) }

  console.error(`[self-correct] ${dryRun ? 'DRY-RUN（零 LLM）' : 'LLM 连跑'} | ${files.length} 章 | target=${targetWords}`)

  const run = async () => {
    const results: ChapterResult[] = []
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf-8')
      results.push(await selfCorrectChapter(file, text, targetWords, dryRun))
    }
    if (jsonMode) {
      console.log(JSON.stringify({ results }, null, 2))
    } else {
      console.log('\n# 一键模型自纠结果')
      console.log('| 章节 | 评分 | 硬错 | AI味警告 | 状态 | 说明 |')
      console.log('|------|------|------|---------|------|------|')
      for (const r of results) {
        console.log(`| ${r.name} | ${r.score} | ${r.errors} | ${r.aiWarnings} | ${r.status} | ${r.detail || ''} |`)
      }
      if (dryRun) console.log('\n（DRY-RUN：未写文件。配置 provider 后加 --llm 真跑自动连写）')
    }
  }
  run()
}

main()
