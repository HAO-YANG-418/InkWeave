/**
 * ② 反向闭环：上章质量指纹 → 生成时禁忌注入
 *
 * 目的：把 `检测工具/check-chapter.ts` 离线写出的 `章节/第N章*.fingerprint.json`
 * 转成自然语言禁忌，经 setPrevChapterTaboo → buildWritingMessages 的 dynamicSections
 * 注入 user message 动态区（真实生成通道，非 system prompt 第[4]层 userCustomPrompt——
 * 后者在 GWEEngine 类里存在但 orchestrator 实际不走，属死通道），让「生成时」读到
 * 「检测时」的上章问题，实现自纠闭环。
 *
 * 重要约束（见 InkWeave_v2_②反向闭环接生成循环方案_2026-08-24.md）：
 * 1. 本文件在 `源码/` 树，严禁 import `检测工具/` 树的任何模块（双树编译隔离，R1 复盘铁律）。
 *    读指纹的拼法逐字对齐闭环1 读侧真身（check-chapter.ts:84/89），但逻辑在本文件重实现。
 * 2. 转写核心移植自 `检测工具/pre-analysis.ts:444-576` 的纯字符串拼装段，但输出形态不同：
 *    原 injectFingerprint 输出给人看的 Markdown 模板（带标题/emoji/提示语）；
 *    本文件输出给 LLM 的紧凑指令式禁忌块（去标题/emoji/提示语、cap ~400 字）。
 * 3. 感官基调依赖 chapterNum（原 :506 用 ['视觉','听觉','触觉','嗅觉','味觉'][chapterNum%5]），
 *    故 fingerprintToTabooText 签名带 chapterNum，由插桩块从 request.chapterNumber 传入。
 */

import * as fs from 'fs'
import * as path from 'path'

/**
 * 上章指纹的轻量结构（仅取转写实际用到的字段，避免依赖 CLI 树完整类型）。
 * 字段名与 check-chapter.ts:288-341 写出的 fingerprint.json 完全一致。
 */
export interface ChapterFingerprint {
  chapterName?: string
  errors?: string[]
  warnings?: string[]
  dashes?: number
  notXButY?: number
  commaChainRatio?: number
  stylePatterns?: {
    verbStacking?: Array<{ message: string; severity: string }>
    verbStackingVerbs?: string[]
    nameStacking?: Array<{ message: string; severity: string }>
    deDensity?: Array<{ message: string; severity: string }>
  }
  facts?: unknown
  [key: string]: unknown
}

const SENSE_MODALITIES = ['视觉', '听觉', '触觉', '嗅觉', '味觉'] as const

/**
 * 定位并读取上一章指纹。
 * 逐字对齐闭环1 读侧真身（check-chapter.ts:75-101）：
 * - 章节目录 = path.join(projectDir, '章节')
 * - 匹配规则：startsWith(`第${prevN}章`) && endsWith('.fingerprint.json')
 * - 容错：prevN<=1 / 目录不存在 / 解析失败 → 返回 null（静默降级，绝不阻断生成）
 *
 * @param projectDir 项目根目录（由 CLI 入口透传，含 章节/ 子目录）
 * @param chapterNum 当前章编号，上章 = chapterNum - 1
 */
export function loadPrevFingerprint(
  projectDir: string,
  chapterNum: number,
): ChapterFingerprint | null {
  const prevN = chapterNum - 1
  if (prevN <= 1) return null // 第1/2章无上章指纹（闭环1 读侧 :79 同逻辑：n<=1 返回空）
  const chaptersDir = path.join(projectDir, '章节')
  if (!fs.existsSync(chaptersDir)) return null
  let files: string[]
  try {
    files = fs.readdirSync(chaptersDir)
  } catch {
    return null
  }
  const fpFiles = files.filter(
    f => f.startsWith(`第${prevN}章`) && f.endsWith('.fingerprint.json'),
  )
  if (fpFiles.length === 0) return null
  try {
    const raw = fs.readFileSync(path.join(chaptersDir, fpFiles[0]), 'utf-8')
    return JSON.parse(raw) as ChapterFingerprint
  } catch {
    return null // 解析失败静默降级
  }
}

/**
 * 把上章指纹转成给 LLM 的硬约束禁忌块（注入 system prompt 第[4]层）。
 * 移植自 pre-analysis.ts:444-576 的转写核心，但形态改为指令式（非 Markdown 模板）。
 *
 * 优先级（对齐 injectFingerprint 的 :465/:503/:513-526/:547/:539-544）：
 *   1. 排比堆叠（最高优先级，verbStacking）
 *   2. 感官密度（sense_density_balance，靠 chapterNum 定基调）
 *   3. 确定性违规（破折号 dashes / 不是X是Y notXButY / 逗号链 commaChainRatio）
 *   4. 长程事实（facts）
 * 其余 warning 不转（防噪声，因注入 system prompt 比写前分析更激进）。
 *
 * @param fp 上章指纹对象
 * @param chapterNum 当前章编号（用于感官基调确定性选择）
 * @param cap 最大字数，默认 400
 */
export function fingerprintToTabooText(
  fp: ChapterFingerprint | null,
  chapterNum: number,
  cap = 400,
): string {
  if (!fp) return ''
  const lines: string[] = []
  const sp = fp.stylePatterns || {}
  const senseModality = SENSE_MODALITIES[chapterNum % SENSE_MODALITIES.length]

  // 1. 排比堆叠（最高优先级）
  if (sp.verbStacking && sp.verbStacking.length > 0) {
    const verbs = (sp.verbStackingVerbs || []).filter(Boolean)
    const verbHint = verbs.length > 0 ? `（上章高频排比动词如：${verbs.slice(0, 5).join('、')}）` : ''
    lines.push(
      `【禁忌1·排比堆叠】上章检测到${sp.verbStacking.length}组排比堆叠${verbHint}。本章每场景至多1处排比；超限换句型（第2处用动作接感官、第3处用环境回应），禁止"穿过X穿过Y穿过Z"式同构堆叠。`,
    )
  }

  // 2. 感官密度（靠 chapterNum 定本章基调）
  lines.push(
    `【禁忌2·感官基调】本章感官描写以「${senseModality}」为主基调，避免过度堆砌其他单一感官；每场景至多2处精细感官刻画，其余用动作/对话推进。`,
  )

  // 3. 确定性违规（破折号 / 不是X是Y / 逗号链）
  if (fp.dashes && fp.dashes > 0) {
    lines.push(`【禁忌3·破折号】上章有${fp.dashes}处"——"破折号。本章零容忍：认知翻转用逗号，对话中断用动作打断。`)
  }
  if (fp.notXButY && fp.notXButY > 0) {
    lines.push(`【禁忌4·不是X是Y】上章有${fp.notXButY}处"不是X是Y"句式。本章禁止该固定句式，改为自然陈述或对比描写。`)
  }
  if (fp.commaChainRatio && fp.commaChainRatio > 5) {
    lines.push(`【禁忌5·逗号链】上章逗号/句号比${fp.commaChainRatio}偏高（>5）。本章只禁"一逗到底"（一口气连写不换气）；读着顺的连写保留，严禁为压低逗句比把句子剁碎。`)
  }

  // 4. 长程事实（facts 存在则提示回收，不展开具体内容避免污染）
  if (fp.facts) {
    lines.push(`【禁忌6·长程事实】上章已建立事实/伏笔约束，本章续写须与上章事实一致，不得自相矛盾或凭空新增未交代的设定。`)
  }

  if (lines.length === 0) return ''

  const header = '【上章质量禁忌·生成硬约束】以下为上章检测出的高发问题，本章写作须规避：'
  let out = header + '\n' + lines.join('\n')
  if (out.length > cap) out = out.slice(0, cap)
  return out
}
