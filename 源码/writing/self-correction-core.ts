// ============================================================
// 模型自纠核心（纯函数，无 engine 运行时依赖）
// 引擎内部 pass（orchestrator.runSelfCorrection）与 CLI 一键自纠脚本
// （检测工具/self-correct.ts）共用此唯一真源，避免逻辑漂移。
// ============================================================

/** 模型自纠判定所需的违规最小结构（RuleViolation 的结构子类型，两者互通） */
export interface AiViolation {
  ruleName?: string
  message?: string
  severity?: 'error' | 'warning' | 'info'
  suggestion?: string
}

/** 自纠 prompt 模板：聚焦"写好"的分布级指令，不碰情节/信息量 */
export const SELF_CORRECTION_INSTRUCTIONS: string[] = [
  `去主语连续重复：相邻两句若同一主语（许照/老周/孙/那人等），把后句主语换成代词（他/她）或用动作开头，避免"许照…许照…许照"的单调。`,
  `顺节奏/句号碎切：连续≤8字短句≥3处的，用逗号合并或接长句，保留鼓点但不碎；不要为了短而短。`,
  `变质感词集中（均匀腔）：同一触觉词（凉/冰/寒/冷/麻/刺等）单章集中≥6次，分散到不同感官或换具体描写，避免反复同一词。`,
  `守标点铁则（零容忍）：绝对不用破折号（——）；引号用全角弯引号""；疑问句用问号；禁连续句号/逗号/问号/叹号；并列用顿号。`,
  `连续对话过长：>4句对话之间无动作/表情/环境描写的，在中间插一句动作beat或环境描写断开，避免审讯感。`,
  `补情感弧线/保口语人味：可插入克制层情绪标记（忍住/别过头/垂下眼/喉头一紧）；保留口语人味，禁书面联接词堆砌。`,
  `查逻辑硬伤（检测器抓不到，自纠必查）：①时间线——章内所有时间点/时长自洽，前文"X点"与后文推算一致，不出现内部矛盾时长（如23:40减22:00算出13小时）；②前向引用——角色不能在台词出口前就"回想"该原话；③道具/人物衔接——跨章道具归属转移须有文字交代，不能凭空出现或消失；④人称与设定不漂移。发现即补一句交代修正，不动情节骨架。`,
  `绝对不要改情节、不要改角色关系、不要改信息量、不要改章末钩子；只顺节奏与标点。`,
]

/** AI 味违规的关键词提示（用于判定某条违规是否属于"分布级 AI 感"） */
const AI_FEEL_RULE_HINTS = [
  '主语重复', '碎句', '拍内断句', '连续对话', '质感', '均匀',
  '情感弧线', '排比', '不是X是Y', '感官密度', '句号碎', '断奏',
  '口语', '人味', '冷峻',
]

/** 判定一条违规是否属于"分布级 AI 味"（放给模型自纠修的类别） */
export function isAiFeelViolation(v: AiViolation): boolean {
  const hay = `${v.ruleName || ''} ${v.message || ''}`
  return AI_FEEL_RULE_HINTS.some((h) => hay.includes(h))
}

/**
 * 构建模型自纠的用户消息正文（纯函数，便于单测）
 * @param lastContent 上一轮生成内容
 * @param violations 检测器门禁反馈（error+warning，供模型逐项修复）
 */
export function buildSelfCorrectionPrompt(lastContent: string, violations: AiViolation[]): string {
  const feedback = violations
    .filter((v) => v.severity !== 'info')
    .map(
      (v) =>
        `- [${v.severity === 'error' ? '错误' : '警告'}][${v.ruleName}] ${v.message}${v.suggestion ? ' → ' + v.suggestion : ''}`,
    )
    .slice(0, 15)

  const endingExcerpt = lastContent.length > 200 ? lastContent.slice(-200) : lastContent

  return [
    `【模型自纠 — 收口分布级 AI 味，保持情节/情绪/信息量不变】`,
    ``,
    `【修正指令】`,
    ...SELF_CORRECTION_INSTRUCTIONS,
    ``,
    `【检测器反馈 — 请逐项修复其中的 AI 味与标点类问题】`,
    feedback.length ? feedback.join('\n') : '（无，可只顺节奏）',
    ``,
    `【强制要求】`,
    `1. 只改节奏、标点、质感词分布、对话穿插、主语重复；不改情节、不改角色关系、不改信息量。`,
    `2. ⚠️ 标点铁则零容忍：绝对禁止破折号（——）；引号用全角弯引号""；疑问句用问号；禁连续句号/逗号/问号/叹号；并列用顿号。`,
    `3. 修改后字数应与原章节接近（±15%）。`,
    `4. 结尾段落一个字都不改，原封不动放在最后：「${endingExcerpt}」`,
    ``,
    `【完整内容 — 请定向修改】`,
    lastContent,
  ].join('\n')
}

/**
 * 模型自纠门禁：自纠结果是否接受（确定性，不依赖 LLM）
 * - 不得引入任何新 error（尤其破折号/半角引号）——否则驳回
 * - AI 味警告不得增多——否则驳回
 * - 字数不得崩（<目标50%）——否则驳回
 */
export function evaluateSelfCorrection(
  before: AiViolation[],
  after: AiViolation[],
  beforeLen: number,
  afterLen: number,
  targetWords: number,
): boolean {
  const beforeErr = before.filter((v) => v.severity === 'error').length
  const afterErr = after.filter((v) => v.severity === 'error').length
  if (afterErr > beforeErr) return false

  const beforeAi = before.filter((v) => isAiFeelViolation(v)).length
  const afterAi = after.filter((v) => isAiFeelViolation(v)).length
  if (afterAi > beforeAi) return false

  if (afterLen < targetWords * 0.5) return false
  void beforeLen
  return true
}
