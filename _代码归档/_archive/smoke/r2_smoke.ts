/**
 * ② 反向闭环 · 冒烟测试（r2_smoke.ts）
 * 验证指纹读取 + 转写 + 注入 user message 动态区的真实链路。
 * 不跑完整 LLM 生成（避免 KB 加载开销），只测纯函数与拼接逻辑。
 *
 * 运行：npx tsx 检测工具/r2_smoke.ts
 */
import * as fs from 'fs'
import * as path from 'path'
import { loadPrevFingerprint, fingerprintToTabooText } from '../源码/writing/fingerprint-inject'
import { buildWritingMessages } from '../源码/writing/context-builder'
import { createEmptyContext } from '../源码/writing/context-builder'

let pass = true
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`✅ ${name}`)
  } else {
    console.log(`❌ ${name} ${detail}`)
    pass = false
  }
}

// ===== 构造临时项目目录，模拟闭环1 写出的上章指纹 =====
const tmpDir = path.join(process.cwd(), '.r2_smoke_tmp')
const chaptersDir = path.join(tmpDir, '章节')
fs.mkdirSync(chaptersDir, { recursive: true })

const fakeFingerprint = {
  chapterName: '第3章烈阳',
  errors: [],
  warnings: ['style_stacking_verb'],
  dashes: 2,
  notXButY: 1,
  commaChainRatio: 4.2,
  stylePatterns: {
    verbStacking: [{ message: '检测到3组排比堆叠', severity: 'warning' }],
    verbStackingVerbs: ['穿过', '往里流', '钻入'],
    nameStacking: [],
    deDensity: [],
  },
  facts: { planted: ['伏笔A'] },
}
fs.writeFileSync(
  path.join(chaptersDir, '第3章烈阳.md.fingerprint.json'),
  JSON.stringify(fakeFingerprint, null, 2),
  'utf-8',
)

// ===== 1. loadPrevFingerprint：当前章=4，上章=3 =====
const fp = loadPrevFingerprint(tmpDir, 4)
check('loadPrevFingerprint 读到上章指纹', fp !== null, '应为第3章指纹')
check('loadPrevFingerprint 前缀模糊匹配', fp?.chapterName === '第3章烈阳', `实际=${fp?.chapterName}`)

// ===== 2. fingerprintToTabooText：转写 + cap =====
const taboo = fingerprintToTabooText(fp!, 4)
check('taboo 含【禁忌1·排比堆叠】', taboo.includes('禁忌1'), taboo.slice(0, 80))
check('taboo 含【禁忌2·感官基调】', taboo.includes('禁忌2'), taboo.slice(0, 80))
check('taboo 含【禁忌3·破折号】', taboo.includes('禁忌3'), taboo.slice(0, 80))
check('taboo 含【禁忌4·不是X是Y】', taboo.includes('禁忌4'), taboo.slice(0, 80))
check('taboo 含【禁忌5·逗号链】', taboo.includes('禁忌5'), taboo.slice(0, 80))
check('taboo 含【禁忌6·长程事实】', taboo.includes('禁忌6'), taboo.slice(0, 80))
check('taboo 不含 markdown 标题/emoji', !taboo.includes('##') && !taboo.includes('🔴'), '应是指令块')
check('taboo 长度 <= 400', taboo.length <= 400, `len=${taboo.length}`)

// ===== 3. chapterNum=4 → 感官基调=味觉（['视觉','听觉','触觉','嗅觉','味觉'][4%5=4]） =====
check('chapterNum=4 感官基调=味觉', taboo.includes('味觉'), taboo.slice(0, 120))

// ===== 4. buildWritingMessages 接收 prevChapterTaboo 拼入动态区 =====
const ctx = createEmptyContext({ title: '测试书', genre: '玄幻' })
const msgs = buildWritingMessages(ctx, {
  capability: 'continue',
  prevChapterTaboo: taboo,
})
const userMsg = msgs.find(m => m.role === 'user')
check('buildWritingMessages 产出 user message', !!userMsg, '应含 user role')
check('user message 含上章禁忌', !!userMsg && (userMsg.content as string).includes('上章质量禁忌'), 'taboo 应进动态区')

// ===== 5. 跨章污染：无指纹时 taboo='' 不注入 =====
const fpNull = loadPrevFingerprint(tmpDir, 2) // 上章=1，返回 null
check('第2章上章=1 返回 null（无污染）', fpNull === null)
const tabooNull = fingerprintToTabooText(fpNull, 2) // 防御：传 null 返回 ''
check('null 指纹转写为空串', tabooNull === '', `实际="${tabooNull}"`)
const msgs2 = buildWritingMessages(ctx, { capability: 'continue', prevChapterTaboo: tabooNull })
const userMsg2 = msgs2.find(m => m.role === 'user')
check('空 taboo 不污染 user message', !!userMsg2 && !(userMsg2.content as string).includes('上章质量禁忌'))

// ===== 清理 =====
fs.rmSync(tmpDir, { recursive: true, force: true })

console.log('\n' + (pass ? 'R2 SMOKE: PASS ✅' : 'R2 SMOKE: FAIL ❌'))
process.exit(pass ? 0 : 1)
