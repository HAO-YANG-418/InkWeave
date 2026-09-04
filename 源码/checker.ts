// ============================================================
// GWE V3.0 - 13项硬指标检测器（V3新增5项追读力检测）
// 整合锚点检测、填充词检测、追读力检测、文本统计
// ============================================================

import type {
  CheckResult,
  RuleViolation,
  TextStats,
  MergedConfig,
  WritingContext,
  Thresholds,
} from './types';
import { detectAnchors, calculateAnchorDensity, calculateMaxAnchorGap } from './anchor-detector';
import { detectFillers } from './filler-words';
import { logWarn } from './logger';
import { calculateRadar, calculateWeightedScore, countSensoryMentions } from './radar';
import { checkCharacterVoice, checkActionRollcall, checkSenseDensity, checkSentenceWaveform, checkDataAnchor, checkExclamationQuota, checkForbiddenChar, checkNotShiPattern, checkCommaChain } from './checks/index';

// ============================================================
// 检查器入口
// ============================================================

/**
 * 对文本执行全面质量检查
 *
 * @param text 待检查文本
 * @param context 写作上下文（书籍/章节/角色等数据）
 * @param mergedConfig 合并后的运行时配置
 * @returns CheckResult 包含综合得分、雷达分、违规项、统计信息
 */
export function check(
  text: string,
  _context: WritingContext | null,
  mergedConfig: MergedConfig,
  targetWords?: number
): CheckResult {
  const { thresholds, vocabulary, extraRules, disabledChecks } = mergedConfig;
  const violations: RuleViolation[] = [];

  // ---- 1. 基础文本统计 ----
  const stats = computeTextStats(text, vocabulary);

  // ---- 2. 锚点检测 ----
  const anchorResult = detectAnchors(text, vocabulary);
  stats.anchorCount = anchorResult.count;

  // ---- 3. 填充词检测 ----
  const fillerResult = detectFillers(text, vocabulary, thresholds);
  stats.fillerCount = fillerResult.count;

  // ---- 4. 五感统计 ----
  stats.sensoryMentions = countSensoryMentions(text);

  // ---- R4: 字数门禁（治本"写空"，经 R3 接线逼自纠）----
  // 字数下限优先用 KB 外置的 minChapterWords（接 ③ 阶段二 2E 单一标定源，可在知识库/阈值标定/default.json 调）；
  // 未配置时回退 0.7×目标（默认 2800 时回退=1960 兜底），与检测工具树门禁下限对齐（2026-09-04 统一单一真值 2800）。
  // 方案 B（2026-08-29）：原门槛 `sensoryTotal<3 && anchorCount<3` 在真实章节恒 false（锚点/千字全样本 min 19.4 > 12），
  // 等于"短而密放行"永为假 → 密度判空分支是死代码。2026-08-29 复核：删除该密度分支，只留硬下限——
  // 低于 minChapterWords(2800) 不论密度一律 error（逼生成自纠）；2800+ 不再做密度判空（交由 Y 降噪/thresholds，不由写空门禁兼任）。
  const r4Target = (targetWords && targetWords > 0) ? targetWords : 2800;
  const r4Min = (thresholds.minChapterWords && thresholds.minChapterWords > 0)
    ? thresholds.minChapterWords
    : Math.round(r4Target * 0.7);
  if (stats.totalWords < r4Min) {
    // 绝对下限：过短即不合格，不论密度。短而密不再豁免——密度高只证明不注水，不证明篇幅达标。
    violations.push({
      ruleId: 'word_count_hollow',
      ruleName: '字数过短（写空）',
      message: `实际字数${stats.totalWords}，下限${r4Min}字，完成率仅${((stats.totalWords / r4Target) * 100).toFixed(0)}%，判定写空。`,
      severity: 'error',
      position: { from: 0, to: Math.min(text.length, 50) },
      suggestion: `补充场景与细节至下限${r4Min}字以上。短而密不再豁免：密度高只证明不注水，不证明篇幅达标。`,
    });
  }

  // ---- 5. 执行8项硬指标检查 ----
  // 检查项1：锚点密度
  if (!disabledChecks.has('anchor_density')) {
    checkAnchorDensity(text, anchorResult, stats, thresholds, violations);
  }

  // 检查项2：填充词
  if (!disabledChecks.has('filler_words')) {
    checkFillerWords(text, fillerResult, stats, thresholds, violations);
  }

  // 检查项3：段落长度
  if (!disabledChecks.has('paragraph_length')) {
    checkParagraphLength(text, stats, thresholds, violations);
  }

  // 检查项4：对话穿插
  if (!disabledChecks.has('dialogue_interleave')) {
    checkDialogueInterleave(text, fillerResult, stats, thresholds, vocabulary, violations);
  }

  // 检查项5：句子节奏
  if (!disabledChecks.has('sentence_rhythm')) {
    checkSentenceRhythm(text, stats, thresholds, violations);
  }

  // 检查项6：信息密度
  if (!disabledChecks.has('info_density')) {
    checkInfoDensity(text, stats, thresholds, vocabulary, violations);
  }

  // 检查项7：五感覆盖
  if (!disabledChecks.has('sensory_coverage')) {
    checkSensoryCoverage(stats, thresholds, violations);
  }

  // 检查项8：自定义规则
  for (const rule of extraRules) {
    if (disabledChecks.has(rule.id)) continue;

    if (rule.pattern) {
      // 正则模式匹配
      try {
        const regex = new RegExp(rule.pattern, 'g');
        let m: RegExpExecArray | null;
        while ((m = regex.exec(text)) !== null) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            message: `${rule.description}：匹配到 "${m[0]}"`,
            severity: rule.severity,
            position: { from: m.index, to: m.index + m[0].length },
            suggestion: `建议修改或删除此表达`,
          });
        }
      } catch {
        logWarn('Checker', `规则 "${rule.name}" 的正则表达式无效，已跳过`);
      }
    }

    if (rule.check) {
      // 自定义检查函数
      try {
        const result = rule.check(text);
        if (result) {
          violations.push(result);
        }
      } catch {
        logWarn('Checker', `规则 "${rule.name}" 的自定义检查函数执行失败，已跳过`);
      }
    }
  }

  // ---- V3新增：追读力5项检测 ----

  // 检查项9：开头冲击检测
  if (!disabledChecks.has('opening_impact')) {
    checkOpeningImpact(text, stats, thresholds, violations);
  }

  // 检查项10：套路反应黑名单
  if (!disabledChecks.has('cliche_reactions')) {
    checkClicheReactions(text, thresholds, violations);
  }

  // 检查项11：碎句病检测
  if (!disabledChecks.has('fragmented_sentences')) {
    checkFragmentedSentences(text, stats, thresholds, violations);
  }

  // 检查项12：对话碰撞检测（启发式：否定/反对词密度）
  if (!disabledChecks.has('dialogue_conflict')) {
    checkDialogueConflict(text, stats, thresholds, violations);
  }

  // 检查项13：章末钩子检测
  if (!disabledChecks.has('ending_hook')) {
    checkEndingHook(text, stats, thresholds, violations);
  }

  // 检查项14：信息反咬密度检测（V3新增）
  if (!disabledChecks.has('twist_density')) {
    checkTwistDensity(text, stats, thresholds, violations);
  }

  // 检查项15：黄金300字冲突检测（2026网文铁则：3秒停留率）
  if (!disabledChecks.has('golden_300')) {
    checkGolden300(text, thresholds, violations);
  }

  // 检查项16：开篇禁忌检测（禁止写景/回忆/背景开头）
  if (!disabledChecks.has('opening_taboos')) {
    checkOpeningTaboos(text, thresholds, violations);
  }

  // 检查项17：装神弄鬼假钩子检测（禁止"似乎意识到""神秘气息"等空泛悬念）
  if (!disabledChecks.has('fake_hook')) {
    checkFakeHooks(text, thresholds, violations);
  }

  // 检查项18：五感平衡检测（V3.1实战新增：关键场景需要≥3种感官，必须包含嗅觉或触觉）
  if (!disabledChecks.has('sensory_balance')) {
    checkSensoryBalance(text, stats, thresholds, violations);
  }

  // 检查项19：钩子具体性检测（V3.1实战新增：章末最后一句禁止抽象比喻收尾）
  if (!disabledChecks.has('hook_concreteness')) {
    checkHookConcreteness(text, thresholds, violations);
  }

  // 检查项20：连续比喻检测（V3.1实战新增：同段连续2个以上"像/如/仿佛"比喻）
  if (!disabledChecks.has('simile_density')) {
    checkSimileDensity(text, thresholds, violations);
  }

  // 检查项21：不必要英文检测（V3.1实战新增：中文网文非专有名词不夹英文）
  if (!disabledChecks.has('unnecessary_english')) {
    checkUnnecessaryEnglish(text, violations);
  }

  // 注：开头力度检测已含于检查项9（checkOpeningImpact），此处不再重复调用，避免开口警告双计。

  // 检查项23：重复内容检测（V3.1读者视角校准：重复段落/句子是严重错误）
  if (!disabledChecks.has('repetition')) {
    checkRepetition(text, thresholds, violations);
  }

  // 检查项24：空洞四字成语堆砌检测（V3.1客观测试新增）
  if (!disabledChecks.has('cliché_phrases')) {
    checkClichéPhrases(text, thresholds, violations);
  }

  // 检查项25：开头纯写景无人物检测（V3.1客观测试新增）
  if (!disabledChecks.has('opening_scene_setting')) {
    checkOpeningScene(text, thresholds, violations);
  }

  // 检查项26：标签化假反应检测（V3.1客观测试新增）
  if (!disabledChecks.has('fake_reactions')) {
    checkFakeReactions(text, thresholds, violations);
  }

  // ---- 5.5. V3.2 泛用化检测模块（9项） ----
  if (!disabledChecks.has('character_voice')) {
    checkCharacterVoice(text, stats, thresholds, vocabulary, violations);
  }
  if (!disabledChecks.has('action_rollcall')) {
    checkActionRollcall(text, stats, thresholds, vocabulary, violations);
  }
  if (!disabledChecks.has('sense_density')) {
    checkSenseDensity(text, stats, thresholds, vocabulary, violations);
  }
  if (!disabledChecks.has('sentence_waveform')) {
    checkSentenceWaveform(text, stats, thresholds, vocabulary, violations);
  }
  if (!disabledChecks.has('data_anchor')) {
    checkDataAnchor(text, stats, thresholds, vocabulary, violations);
  }
  if (!disabledChecks.has('exclamation_quota')) {
    checkExclamationQuota(text, stats, thresholds, vocabulary, violations);
  }
  if (!disabledChecks.has('forbidden_char')) {
    checkForbiddenChar(text, stats, thresholds, vocabulary, violations);
  }
  if (!disabledChecks.has('not_shi_pattern')) {
    checkNotShiPattern(text, stats, thresholds, vocabulary, violations);
  }
  if (!disabledChecks.has('comma_chain')) {
    checkCommaChain(text, stats, thresholds, vocabulary, violations);
  }

  // ---- 6. 计算雷达评分 ----
  const radarScores = calculateRadar({ text, stats, mergedConfig });

  // ---- 7. 计算综合得分 ----
  // 基础分来自雷达加权平均分（使用radarWeights做加权平均，而非乘法系数），根据违规项扣分
  const baseScore = calculateWeightedScore(radarScores, mergedConfig.radarWeights);
  const score = applyViolationPenalty(baseScore, violations);

  // ---- 8. 判断是否通过 ----
  const hasErrors = violations.some((v) => v.severity === 'error');

  return {
    score: Math.max(0, Math.min(100, Math.round(score * 10) / 10)),
    radarScores,
    violations,
    stats,
    passed: !hasErrors,
  };
}

// ============================================================
// 文本统计
// ============================================================

/**
 * 计算文本基础统计数据
 */
function computeTextStats(text: string, vocab: MergedConfig['vocabulary']): TextStats {
  void vocab; // vocab保留参数但暂不使用
  // 总字符数（不含空白）
  const totalChars = text.replace(/\s/g, '').length;

  // 中文字数（粗略：统计CJK字符）
  const cjkRegex = /[\u4e00-\u9fa5]/g;
  const cjkMatches = text.match(cjkRegex);
  const totalWords = cjkMatches ? cjkMatches.length : totalChars;

  // 段落切分（按换行切分，过滤空段落）
  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);
  const paragraphCount = paragraphs.length;
  const avgParagraphLength = paragraphCount > 0
    ? paragraphs.reduce((sum, p) => sum + p.replace(/\s/g, '').length, 0) / paragraphCount
    : 0;

  // 句子切分
  const sentenceRegex = /[^。！？!?\n]+[。！？!?]?/g;
  const sentenceMatches = text.match(sentenceRegex);
  const sentences = sentenceMatches
    ? sentenceMatches.map((s) => s.trim()).filter((s) => s.length > 0)
    : [];
  const sentenceCount = sentences.length;
  const avgSentenceLength = sentenceCount > 0
    ? sentences.reduce((sum, s) => sum + s.replace(/\s/g, '').length, 0) / sentenceCount
    : 0;

  // 短句占比（短句定义：<= 15字）
  const shortThreshold = 15;
  const shortSentences = sentences.filter(
    (s) => s.replace(/\s/g, '').length <= shortThreshold
  ).length;
  const shortSentenceRatio = sentenceCount > 0 ? shortSentences / sentenceCount : 0;

  // 对话比例（引号内文字占比）
  const dialogueRegex = /[“”「」『』‘’【】《》][^““「」『』【】《》]{1,}[“”「」『』‘’【】《》]/g;
  let dialogueChars = 0;
  let dm: RegExpExecArray | null;
  while ((dm = dialogueRegex.exec(text)) !== null) {
    dialogueChars += dm[0].replace(/\s/g, '').length;
  }
  const dialogueRatio = totalChars > 0 ? dialogueChars / totalChars : 0;

  return {
    totalChars,
    totalWords,
    paragraphCount,
    avgParagraphLength: Math.round(avgParagraphLength * 10) / 10,
    sentenceCount,
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    shortSentenceRatio: Math.round(shortSentenceRatio * 100) / 100,
    anchorCount: 0, // 后续填充
    fillerCount: 0, // 后续填充
    dialogueRatio: Math.round(dialogueRatio * 100) / 100,
    sensoryMentions: { sight: 0, sound: 0, smell: 0, touch: 0, taste: 0 },
  };
}

// ============================================================
// 8项硬指标检查实现
// ============================================================

/** 检查项1：锚点密度 */
function checkAnchorDensity(
  text: string,
  anchorResult: ReturnType<typeof detectAnchors>,
  stats: TextStats,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  void text;
  const totalChars = stats.totalChars;

  // 锚点总数不足
  if (anchorResult.count < thresholds.minAnchors) {
    violations.push({
      ruleId: 'min_anchors',
      ruleName: '锚点数量不足',
      message: `当前锚点数为 ${anchorResult.count}，至少需要 ${thresholds.minAnchors} 个身体反应描写`,
      severity: 'warning',
      suggestion: '建议在叙事中加入角色的身体反应，如"指尖发凉"、"后颈一紧"等',
    });
  }

  // 锚点密度不足
  const density = calculateAnchorDensity(anchorResult.count, totalChars);
  const expectedDensity = 1000 / thresholds.anchorsPerWords;
  if (density < expectedDensity * 0.5) {
    violations.push({
      ruleId: 'anchors_per_words',
      ruleName: '锚点密度偏低',
      message: `锚点密度为每千字 ${density.toFixed(1)} 个，建议达到每千字 ${expectedDensity.toFixed(1)} 个`,
      severity: 'warning',
      suggestion: '在对话、动作、情感场景中穿插身体感受描写',
    });
  }

  // 锚点间隔过大
  const maxGap = calculateMaxAnchorGap(anchorResult.positions, totalChars);
  if (maxGap > thresholds.maxAnchorGap) {
    violations.push({
      ruleId: 'max_anchor_gap',
      ruleName: '锚点间隔过大',
      message: `存在 ${maxGap} 字无锚点的段落，最大允许间隔为 ${thresholds.maxAnchorGap} 字`,
      severity: 'warning',
      suggestion: '在长段叙述或对话中穿插角色的身体反应',
    });
  }
}

/** 检查项2：填充词 */
function checkFillerWords(
  text: string,
  fillerResult: ReturnType<typeof detectFillers>,
  stats: TextStats,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  void text;
  const totalChars = stats.totalChars;
  const perThousandFactor = totalChars / 1000 || 1;

  // 填充词数量
  const fillerPerThousand = fillerResult.count / perThousandFactor;
  if (fillerPerThousand > thresholds.maxFillerWords) {
    violations.push({
      ruleId: 'max_filler_words',
      ruleName: '填充词过多',
      message: `每千字填充词约 ${fillerPerThousand.toFixed(1)} 个，上限为 ${thresholds.maxFillerWords} 个`,
      severity: 'warning',
      suggestion: '删除冗余的修饰词，如"不由得"、"忍不住"、"似乎"等',
      position: fillerResult.positions.length > 0
        ? { from: fillerResult.positions[0], to: fillerResult.positions[0] + 2 }
        : undefined,
    });
  }

  // 破折号数量
  const dashPerThousand = fillerResult.dashCount / perThousandFactor;
  if (dashPerThousand > thresholds.maxDashCount) {
    violations.push({
      ruleId: 'max_dash_count',
      ruleName: '破折号过多',
      message: `每千字破折号约 ${dashPerThousand.toFixed(1)} 个，上限为 ${thresholds.maxDashCount} 个`,
      severity: 'info',
      suggestion: '减少破折号使用，改用句号或逗号断句',
    });
  }

  // 省略号数量
  const ellipsisPerThousand = fillerResult.ellipsisCount / perThousandFactor;
  if (ellipsisPerThousand > thresholds.maxEllipsisCount) {
    violations.push({
      ruleId: 'max_ellipsis_count',
      ruleName: '省略号过多',
      message: `每千字省略号约 ${ellipsisPerThousand.toFixed(1)} 个，上限为 ${thresholds.maxEllipsisCount} 个`,
      severity: 'info',
      suggestion: '减少省略号使用，避免语气拖沓',
    });
  }

  // 重复对话标签
  for (const rep of fillerResult.repeatedTags) {
    violations.push({
      ruleId: 'dialogue_tag_repeat',
      ruleName: '对话标签重复',
      message: `对话标签"${rep.tag}"连续出现 ${rep.count} 次，上限为 ${thresholds.maxDialogueTagRepeat} 次`,
      severity: 'warning',
      position: rep.positions.length > 0
        ? { from: rep.positions[0], to: rep.positions[0] + rep.tag.length }
        : undefined,
      suggestion: '用动作描写替换部分对话标签，避免重复使用"XX道"',
    });
  }
}

/** 检查项3：段落长度 */
function checkParagraphLength(
  text: string,
  stats: TextStats,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);

  // 段落数不足
  if (stats.paragraphCount < thresholds.minParagraphCount && stats.totalChars > 500) {
    violations.push({
      ruleId: 'min_paragraph_count',
      ruleName: '段落数不足',
      message: `当前仅 ${stats.paragraphCount} 段，建议至少 ${thresholds.minParagraphCount} 段`,
      severity: 'warning',
      suggestion: '适当分段，手机阅读建议每段不超过3-4行',
    });
  }

  // 超长段落
  for (let i = 0; i < paragraphs.length; i++) {
    const paraLen = paragraphs[i].replace(/\s/g, '').length;
    if (paraLen > thresholds.maxParagraphLength) {
      // 找到段落位置
      const paraStart = text.indexOf(paragraphs[i]);
      violations.push({
        ruleId: 'max_paragraph_length',
        ruleName: '段落过长',
        message: `第 ${i + 1} 段字数 ${paraLen}，超过上限 ${thresholds.maxParagraphLength} 字`,
        severity: 'warning',
        position: paraStart !== -1
          ? { from: paraStart, to: paraStart + paragraphs[i].length }
          : undefined,
        suggestion: `将长段拆分为多个短段，目标段落长度约 ${thresholds.targetParagraphLength} 字`,
      });
      // 只报前3个超长段落，避免信息过载
      if (violations.filter((v) => v.ruleId === 'max_paragraph_length').length >= 3) break;
    }
  }
}

// ============================================================
// V3.2 检测注册表初始化
// ============================================================

import { registerChecks, wrapCheck } from './checks/checker-registry';

let _registryInitialized = false;
export function initCheckerRegistry(): void {
  if (_registryInitialized) return;
  _registryInitialized = true;

  registerChecks([
    { id: 'anchor_density', name: '锚点密度', fn: wrapCheck('anchor_density', checkAnchorDensity, ['text', 'anchorResult', 'stats', 'thresholds', 'violations']), priority: 'core' },
    { id: 'filler_words', name: '填充词', fn: wrapCheck('filler_words', checkFillerWords, ['text', 'fillerResult', 'stats', 'thresholds', 'violations']), priority: 'core' },
    { id: 'paragraph_length', name: '段落长度', fn: wrapCheck('paragraph_length', checkParagraphLength, ['text', 'stats', 'thresholds', 'violations']), priority: 'core' },
    { id: 'dialogue_interleave', name: '对话穿插', fn: wrapCheck('dialogue_interleave', checkDialogueInterleave, ['text', 'fillerResult', 'stats', 'thresholds', 'vocabulary', 'violations']), priority: 'core' },
    { id: 'sentence_rhythm', name: '句子节奏', fn: wrapCheck('sentence_rhythm', checkSentenceRhythm, ['text', 'stats', 'thresholds', 'violations']), priority: 'core' },
    { id: 'info_density', name: '信息密度', fn: wrapCheck('info_density', checkInfoDensity, ['text', 'stats', 'thresholds', 'vocabulary', 'violations']), priority: 'core' },
    { id: 'sensory_coverage', name: '五感覆盖', fn: wrapCheck('sensory_coverage', checkSensoryCoverage, ['stats', 'thresholds', 'violations']), priority: 'core' },
    { id: 'opening_impact', name: '开头冲击', fn: wrapCheck('opening_impact', checkOpeningImpact, ['text', 'stats', 'thresholds', 'violations']), priority: 'quality' },
    { id: 'cliche_reactions', name: '套路反应', fn: wrapCheck('cliche_reactions', checkClicheReactions, ['text', 'thresholds', 'violations']), priority: 'quality' },
    { id: 'fragmented_sentences', name: '碎句病', fn: wrapCheck('fragmented_sentences', checkFragmentedSentences, ['text', 'stats', 'thresholds', 'violations']), priority: 'quality' },
    { id: 'dialogue_conflict', name: '对话碰撞', fn: wrapCheck('dialogue_conflict', checkDialogueConflict, ['text', 'stats', 'thresholds', 'violations']), priority: 'quality' },
    { id: 'ending_hook', name: '章末钩子', fn: wrapCheck('ending_hook', checkEndingHook, ['text', 'stats', 'thresholds', 'violations']), priority: 'quality' },
    { id: 'twist_density', name: '反咬密度', fn: wrapCheck('twist_density', checkTwistDensity, ['text', 'stats', 'thresholds', 'violations']), priority: 'quality' },
    { id: 'golden_300', name: '黄金300字', fn: wrapCheck('golden_300', checkGolden300, ['text', 'thresholds', 'violations']), priority: 'release' },
    { id: 'opening_taboos', name: '开篇禁忌', fn: wrapCheck('opening_taboos', checkOpeningTaboos, ['text', 'thresholds', 'violations']), priority: 'release' },
    { id: 'fake_hook', name: '假钩子', fn: wrapCheck('fake_hook', checkFakeHooks, ['text', 'thresholds', 'violations']), priority: 'release' },
    { id: 'sensory_balance', name: '五感平衡', fn: wrapCheck('sensory_balance', checkSensoryBalance, ['text', 'stats', 'thresholds', 'violations']), priority: 'release' },
    { id: 'hook_concreteness', name: '钩子具体性', fn: wrapCheck('hook_concreteness', checkHookConcreteness, ['text', 'thresholds', 'violations']), priority: 'release' },
    { id: 'simile_density', name: '比喻密度', fn: wrapCheck('simile_density', checkSimileDensity, ['text', 'thresholds', 'violations']), priority: 'release' },
    { id: 'unnecessary_english', name: '英文检测', fn: wrapCheck('unnecessary_english', checkUnnecessaryEnglish, ['text', 'violations']), priority: 'release' },
    { id: 'repetition', name: '重复检测', fn: wrapCheck('repetition', checkRepetition, ['text', 'thresholds', 'violations']), priority: 'release' },
    { id: 'cliché_phrases', name: '空洞成语', fn: wrapCheck('cliché_phrases', checkClichéPhrases, ['text', 'thresholds', 'violations']), priority: 'release' },
    { id: 'opening_scene_setting', name: '开篇写景', fn: wrapCheck('opening_scene_setting', checkOpeningScene, ['text', 'thresholds', 'violations']), priority: 'release' },
    { id: 'fake_reactions', name: '假反应', fn: wrapCheck('fake_reactions', checkFakeReactions, ['text', 'thresholds', 'violations']), priority: 'release' },
    { id: 'character_voice', name: '角色台词', fn: wrapCheck('character_voice', checkCharacterVoice, ['text', 'stats', 'thresholds', 'vocabulary', 'violations']), priority: 'migrated' },
    { id: 'action_rollcall', name: '动作点名册', fn: wrapCheck('action_rollcall', checkActionRollcall, ['text', 'stats', 'thresholds', 'vocabulary', 'violations']), priority: 'migrated' },
    { id: 'sense_density', name: '感官密度', fn: wrapCheck('sense_density', checkSenseDensity, ['text', 'stats', 'thresholds', 'vocabulary', 'violations']), priority: 'migrated' },
    { id: 'sentence_waveform', name: '句群波形', fn: wrapCheck('sentence_waveform', checkSentenceWaveform, ['text', 'stats', 'thresholds', 'vocabulary', 'violations']), priority: 'migrated' },
    { id: 'data_anchor', name: '数据锚点', fn: wrapCheck('data_anchor', checkDataAnchor, ['text', 'stats', 'thresholds', 'vocabulary', 'violations']), priority: 'migrated' },
    { id: 'exclamation_quota', name: '感叹号配额', fn: wrapCheck('exclamation_quota', checkExclamationQuota, ['text', 'stats', 'thresholds', 'vocabulary', 'violations']), priority: 'migrated' },
    { id: 'forbidden_char', name: '禁用字', fn: wrapCheck('forbidden_char', checkForbiddenChar, ['text', 'stats', 'thresholds', 'vocabulary', 'violations']), priority: 'migrated' },
    { id: 'not_shi_pattern', name: '不是X是Y', fn: wrapCheck('not_shi_pattern', checkNotShiPattern, ['text', 'stats', 'thresholds', 'vocabulary', 'violations']), priority: 'migrated' },
    { id: 'comma_chain', name: '逗号链', fn: wrapCheck('comma_chain', checkCommaChain, ['text', 'stats', 'thresholds', 'vocabulary', 'violations']), priority: 'migrated' },
  ]);
}

/** 检查项4：对话穿插 */
function checkDialogueInterleave(
  text: string,
  fillerResult: ReturnType<typeof detectFillers>,
  stats: TextStats,
  thresholds: Thresholds,
  vocab: MergedConfig['vocabulary'],
  violations: RuleViolation[]
): void {
  void fillerResult; void stats; void vocab;
  // 检测连续对话（无动作/叙述穿插）
  const dialogueRegex = /[“”「」『』‘’]([^“”「」『』‘’]{1,})[“”「」『』‘’]/g;
  const dialoguePositions: Array<{ start: number; end: number; text: string }> = [];
  let dm: RegExpExecArray | null;

  while ((dm = dialogueRegex.exec(text)) !== null) {
    dialoguePositions.push({ start: dm.index, end: dm.index + dm[0].length, text: dm[1] });
  }

  if (dialoguePositions.length === 0) return;

  // 检查连续对话句数（两句对话之间没有非对话文字超过20字就算连续）
  let consecutiveCount = 1;
  let consecutiveStart = dialoguePositions[0]?.start ?? 0;

  for (let i = 1; i < dialoguePositions.length; i++) {
    const gap = dialoguePositions[i].start - dialoguePositions[i - 1].end;
    const gapText = text.substring(dialoguePositions[i - 1].end, dialoguePositions[i].start);
    // 如果间隔文字少于15字，认为是连续对话
    if (gap < 15 || gapText.replace(/\s/g, '').length < 15) {
      consecutiveCount++;
    } else {
      if (consecutiveCount > thresholds.maxDialogueContinuous) {
        violations.push({
          ruleId: 'max_dialogue_continuous',
          ruleName: '连续对话过多',
          message: `有 ${consecutiveCount} 句连续对话未穿插动作/描写，上限为 ${thresholds.maxDialogueContinuous} 句`,
          severity: 'warning',
          position: { from: consecutiveStart, to: dialoguePositions[i - 1].end },
          suggestion: '在对话之间插入角色的动作、表情或环境描写',
        });
      }
      consecutiveCount = 1;
      consecutiveStart = dialoguePositions[i].start;
    }
  }

  // 最后一段
  if (consecutiveCount > thresholds.maxDialogueContinuous) {
    violations.push({
      ruleId: 'max_dialogue_continuous',
      ruleName: '连续对话过多',
      message: `有 ${consecutiveCount} 句连续对话未穿插动作/描写，上限为 ${thresholds.maxDialogueContinuous} 句`,
      severity: 'warning',
      position: { from: consecutiveStart, to: text.length },
      suggestion: '在对话之间插入角色的动作、表情或环境描写',
    });
  }
}

/** 检查项5：句子节奏 */
function checkSentenceRhythm(
  text: string,
  stats: TextStats,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  // 切分句子
  const sentenceRegex = /[^。！？!?\n]+[。！？!?]?/g;
  const matches = text.match(sentenceRegex);
  const sentences = matches
    ? matches.map((s) => s.trim()).filter((s) => s.length > 0)
    : [];

  // 超长句子
  let longSentenceCount = 0;
  for (const sent of sentences) {
    const len = sent.replace(/\s/g, '').length;
    if (len > thresholds.maxSentenceLength) {
      longSentenceCount++;
      if (longSentenceCount <= 3) {
        const sentStart = text.indexOf(sent);
        violations.push({
          ruleId: 'max_sentence_length',
          ruleName: '句子过长',
          message: `句子长度 ${len} 字，超过上限 ${thresholds.maxSentenceLength} 字`,
          severity: 'warning',
          position: sentStart !== -1 ? { from: sentStart, to: sentStart + sent.length } : undefined,
          suggestion: `将长句拆分为短句，目标句长约 ${thresholds.targetSentenceLength} 字`,
        });
      }
    }
  }

  // 短句占比不足
  if (stats.shortSentenceRatio < thresholds.shortSentenceRatio * 0.6) {
    violations.push({
      ruleId: 'short_sentence_ratio',
      ruleName: '短句占比不足',
      message: `短句占比 ${(stats.shortSentenceRatio * 100).toFixed(0)}%，目标为 ${(thresholds.shortSentenceRatio * 100).toFixed(0)}%`,
      severity: 'info',
      suggestion: '适当增加短句，让节奏更明快',
    });
  }
}

/** 检查项6：信息密度 */
function checkInfoDensity(
  text: string,
  stats: TextStats,
  thresholds: Thresholds,
  vocab: MergedConfig['vocabulary'],
  violations: RuleViolation[]
): void {
  // 检测连续说明/铺垫（大段叙述无对话/动作/锚点）
  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const hasDialogue = /[“”「」『』‘’]/.test(para);
    const paraLen = para.replace(/\s/g, '').length;

    if (!hasDialogue && paraLen > thresholds.maxExpositionContinuous) {
      const paraStart = text.indexOf(para);
      violations.push({
        ruleId: 'max_exposition_continuous',
        ruleName: '说明/铺垫过长',
        message: `存在 ${paraLen} 字的纯叙述段落，上限为 ${thresholds.maxExpositionContinuous} 字`,
        severity: 'warning',
        position: paraStart !== -1 ? { from: paraStart, to: paraStart + para.length } : undefined,
        suggestion: '在设定说明/环境铺垫中穿插对话、动作或角色反应',
      });
      if (violations.filter((v) => v.ruleId === 'max_exposition_continuous').length >= 2) break;
    }
  }

  // 信息点密度检测（worldTerms + 数字量词）
  const totalChars = stats.totalChars;
  const perThousandFactor = totalChars / 1000 || 1;
  let infoPointCount = 0;

  // 统计世界观术语出现次数
  if (vocab.worldTerms && vocab.worldTerms.size > 0) {
    for (const term of vocab.worldTerms) {
      let idx = text.indexOf(term);
      while (idx !== -1) {
        infoPointCount++;
        idx = text.indexOf(term, idx + term.length);
      }
    }
  }

  // 统计数字+量词（如"三年""五丈""七层"等中文数字/阿拉伯数字+量词组合）
  const numberMeasureRegex = /[零一二三四五六七八九十百千万两\d]+[年月天日岁丈尺寸斤两里步级层座位只个条块匹件种项类]/g;
  const numMatches = text.match(numberMeasureRegex);
  if (numMatches) {
    infoPointCount += numMatches.length;
  }

  // 统计专有名词模式（连续2-4个大写字母或连续大写开头的词，中文人名/地名启发式）
  // 简化：统计长度2-4字的非停用词开头的词（粗略）

  // 信息点密度过低：如果设定了目标密度且实际远低于目标
  const infoPointsPerThousand = infoPointCount / perThousandFactor;
  const targetPoints = thresholds.infoPointsPerThousand ?? 3;

  // 只有在有worldTerms时才检查信息点密度（避免在无设定书籍中误报）
  if (vocab.worldTerms && vocab.worldTerms.size > 3 && totalChars > 500) {
    if (infoPointsPerThousand < targetPoints * 0.3) {
      violations.push({
        ruleId: 'info_points_low',
        ruleName: '信息推进不足',
        message: `每千字世界观/新信息点约 ${infoPointsPerThousand.toFixed(1)} 个，建议达到 ${targetPoints} 个以上`,
        severity: 'info',
        suggestion: '适当推进剧情、引入新设定或揭示新信息，避免原地踏步',
      });
    }
  }
}

/** 检查项7：五感覆盖 */
function checkSensoryCoverage(
  stats: TextStats,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  const sensory = stats.sensoryMentions;
  const activeTypes = Object.values(sensory).filter((c) => c > 0).length;
  const totalSensory = Object.values(sensory).reduce((a, b) => a + b, 0);

  // 感官类型不足
  if (totalSensory > 3 && activeTypes < thresholds.minSensoryTypes) {
    violations.push({
      ruleId: 'min_sensory_types',
      ruleName: '五感类型不足',
      message: `当前仅激活 ${activeTypes} 种感官描写，建议至少 ${thresholds.minSensoryTypes} 种`,
      severity: 'info',
      suggestion: '除了视觉描写，可加入听觉、触觉、嗅觉等多感官细节',
    });
  }

  // 视觉占比过高
  if (totalSensory > 5) {
    const sightCount = sensory.sight || 0;
    const sightRatio = sightCount / totalSensory;
    if (sightRatio > thresholds.sightRatio) {
      violations.push({
        ruleId: 'sight_ratio',
        ruleName: '视觉描写占比过高',
        message: `视觉描写占比 ${(sightRatio * 100).toFixed(0)}%，上限为 ${(thresholds.sightRatio * 100).toFixed(0)}%`,
        severity: 'info',
        suggestion: '减少纯视觉描写，加入其他感官体验',
      });
    }
  }
}

// ============================================================
// 违规扣分计算
// ============================================================

/**
 * 根据违规项对基础分进行扣分
 * error级扣10分，warning级扣3分，info级扣1分
 */
function applyViolationPenalty(baseScore: number, violations: RuleViolation[]): number {
  let penalty = 0;
  for (const v of violations) {
    switch (v.severity) {
      case 'error':
        penalty += 10;
        break;
      case 'warning':
        penalty += 3;
        break;
      case 'info':
        penalty += 1;
        break;
    }
  }
  // 扣分上限：最多扣40分
  return baseScore - Math.min(penalty, 40);
}

// ============================================================
// V3.0 追读力5项检测实现
// ============================================================

/** 强感官刺激词（开头用） */
const STRONG_SENSORY_WORDS = [
  '疼', '痛', '烫', '冷', '凉', '麻', '震', '响', '亮', '黑', '酸', '软',
  '僵', '紧', '嗡', '抖', '颤', '炸', '轰', '砰', '当', '咔',
  '喘不上气', '眼前一黑', '炸响', '刺骨', '灼痛', '剧痛', '发凉', '发麻',
  '发紧', '窒息', '心悸', '冷汗', '汗毛倒竖', '鸡皮疙瘩', '胃里一缩',
  '血冲上头顶', '呼吸一滞', '后颈一凉', '后背发凉',
];

/** 套路反应黑名单词（网文高频AI味身体反应，必须替换为具象生理反应） */
const CLICHE_REACTIONS = [
  // 高频套路词
  '微微一笑', '淡淡一笑', '笑了笑', '点了点头', '点点头', '叹了口气',
  '摇了摇头', '皱了皱眉', '眉头一皱', '眉头紧锁', '嘴角微扬', '嘴角上扬',
  '勾起嘴角', '抿了抿嘴', '撇了撇嘴', '翻了个白眼', '冷哼一声', '冷笑一声',
  '嗤笑一声', '轻笑一声', '苦笑一声', '深吸一口气', '松了口气', '松了一口气',
  '心中一动', '目光一闪', '眼中闪过', '瞳孔一缩', '瞳孔骤缩', '眼中寒光',
  // AI常用套路
  '心头一跳', '脸色一变', '握紧拳头', '不由得', '情不自禁', '忍不住笑',
  '不仅皱了皱眉', '不仅心中一紧', '不仅倒吸一口凉气', '不仅心中暗道',
  '不禁想到', '不仅感叹', '倒吸一口凉气', '倒吸了口凉气', '心中一凛',
  '眼中闪过一丝', '嘴角勾起一抹', '不禁笑了', '眉头微蹙', '神色一凝',
  '脸色微变', '面色一沉', '眸中闪过', '眼底闪过',
];

/** 对话中否定/反对/质疑/冲突词（启发式检测对话碰撞） */
const DIALOGUE_CONFLICT_WORDS = [
  '不对', '不可能', '扯蛋', '放屁', '错了', '等一下', '等等',
  '你确定', '不可能吧', '不对吧', '胡说', '瞎说', '怎么可能',
  '没道理', '奇怪', '不对劲', '有问题', '等会儿', '别急',
  '不是', '错', '停', '闭嘴', '你疯了', '凭什么', '为什么',
  '你胡说', '我不信', '不可能', '不行', '滚开', '滚',
  '你再说一遍', '你什么意思', '什么意思', '你骗我',
];

/** 转折/意外/反咬词（启发式检测信息反咬） */
const TWIST_WORDS = [
  '但是', '但', '可是', '然而', '却', '竟然', '居然', '突然',
  '不对', '奇怪', '怎么', '为什么', '难道', '不是', '反而',
  '相反', '没想到', '原来', '其实', '实际上', '等等',
  '等一下', '不对劲', '有问题', '不可能', '错了',
  // V3.1扩充：动作/认知反转词
  '猛地', '刹住', '停住', '僵住', '愣住', '怔住', '一把',
  '错了', '反了', '疯了', '完了', '糟了',
  '不对', '不是', '没有', '并没', '并非',
  '哪知道', '谁知道', '出乎意料',
];

/** 单句鼓点检测：≤8字+以句号/感叹号/问号结尾+包含强冲击词，算作反咬落点 */
function isPunchLine(para: string): boolean {
  const trimmed = para.trim();
  if (trimmed.length === 0) return false;
  // 单句成段且≤10字，结尾是句号/感叹号/问号
  const sentences = trimmed.split(/[。！？!?]/).filter(s => s.trim().length > 0);
  if (sentences.length !== 1) return false;
  const len = trimmed.replace(/\s/g, '').length;
  if (len > 12) return false;
  if (!/[。！？!?…]$/.test(trimmed)) return false;
  // 包含强冲击词
  const punchWords = ['疼', '痛', '血', '死', '杀', '凉', '冷', '烫', '麻', '黑', '亮',
    '逃', '跑', '停', '动了', '来了', '响', '碎', '倒', '掉', '僵',
    '吸光', '冒烟', '搏动', '在爬', '在流', '发光', '敲门',
    '跪', '喊', '吼', '跪', '不是', '不对', '没有', '不可能',
    // 拟声词鼓点
    '咚', '砰', '咔', '当', '叮', '啪', '嘶', '嗡', '哗', '嘎', '铛'];
  return punchWords.some(w => trimmed.includes(w));
}

/** 检查项9：开头冲击检测 */
function checkOpeningImpact(
  text: string,
  _stats: TextStats,
  _thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  // 取前3个非空段落
  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);
  if (paragraphs.length === 0) return;

  const first3 = paragraphs.slice(0, 3).join('\n');
  const firstSentence = first3.split(/[。！？!?]/)[0]?.trim() || '';

  // 检查第一句是否以环境/背景开头（启发式：以"XX的""在XX""有一个"开头且没有强感官词）
  const envStartPatterns = /^(这是|在一个|话说|从前|很久|矿道里|走廊|房间里|大街上|壁面|街道|天空|夜色|清晨|傍晚|午后|今天|那天|这一天|清晨的|夜晚的|城市里|村子里)/;
  const hasStrongSensory = STRONG_SENSORY_WORDS.some((w) => firstSentence.includes(w));
  const isShortPunch = firstSentence.replace(/\s/g, '').length <= 8; // 短句开头（≤8字）

  if (!hasStrongSensory && !isShortPunch && envStartPatterns.test(firstSentence)) {
    violations.push({
      ruleId: 'opening_impact',
      ruleName: '开头缺乏冲击力',
      message: '第一句是环境/背景描写式开头，建议用强感官刺激（疼/烫/麻/响/冷/凉）开头，0.5秒内把读者拽进场景',
      severity: 'warning',
      position: { from: 0, to: firstSentence.length },
      suggestion: '参考：第一句极短句感官轰炸（如"凉。""痛！""麻。""响。"），第二句本能反应，第三句交代场景',
    });
  }

  // 检查前200字是否有身体锚点（V3.1强化：包含单字感官鼓点开头）
  const first200 = text.substring(0, Math.min(200, text.length));
  // 模式1：身体部位+感觉词组合
  const bodyReactionPattern = /(后颈|脖颈|颈|脊背|后背|背|心脏|心|掌心|掌|指尖|指节|指|手|肩|喉咙|喉|胃|腹|腿|脚|皮肤|皮|冷汗|汗|汗毛|毛|骨|牙|眼|眉|鼻尖|鼻翼|耳根|腕|胸口|胸|肺|太阳穴|虎口|锁骨|牙根|指腹|拳头|牙关|眼眶|颧|脊背|胃里|后背|浑身|全身|毛孔).{0,6}(凉|冷|麻|紧|僵|抖|颤|跳|震|沉|酸|软|疼|痛|灼|汗|嗡|缩|悸|窒|热|烫|湿|干|硬|软|一凉|一麻|一紧|一沉|一缩|发紧|发凉|发麻|发烫|狂跳|咯噔|翻腾|窒息|泛起|冷汗|汗毛竖|起鸡皮|绷紧|僵硬)/;
  // 模式2：单字感官鼓点开头（疼。/痛。/凉。/烫。/麻。/响。）
  const singlePunchOpening = /^\s*(疼|痛|凉|冷|烫|麻|响|血|黑|亮|动了|不对)\s*[。！？!?…]/m;
  // 模式3：直接身体反应短语
  const directBodyPhrase = /(呼吸一滞|呼吸停|屏住呼吸|心跳加速|心跳漏|汗毛竖起|鸡皮疙瘩|倒吸凉气|倒吸一口|胃里一缩|胃里翻腾|喉咙发紧|后背发凉|掌心冒汗|后颈一凉|眼前一黑|耳朵嗡|脑子嗡|血往上冲|脸白了|脸色煞白|脸色发白)/;
  const bodyReactionInOpening = bodyReactionPattern.test(first200) || singlePunchOpening.test(first200) || directBodyPhrase.test(first200);
  if (!bodyReactionInOpening && text.length > 500) {
    violations.push({
      ruleId: 'opening_no_body',
      ruleName: '开头缺少身体锚点',
      message: '开头前200字内没有主角身体反应描写，读者无法第一时间代入',
      severity: 'warning',
      suggestion: '开头200字内必须给出主角的生理反应（后颈发凉/掌心发麻/呼吸一滞/指节攥紧/心跳加速/胃里一缩）',
    });
  }

  // 检查第一句是否过长（>25字且不是短句冲击）
  const firstLen = firstSentence.replace(/\s/g, '').length;
  if (firstLen > 30 && !isShortPunch && text.length > 500) {
    violations.push({
      ruleId: 'opening_too_long',
      ruleName: '开篇首句过长',
      message: `第一句${firstLen}字过长，网文黄金三句要求首句≤15字快速切入`,
      severity: 'info',
      suggestion: '把首句砍到15字以内，最好是5-8字的感官冲击短句',
    });
  }

  // V3.1读者视角校准：检测"XX的时候，XX"时间状语从句开场（力度弱）
  if (/的时候[，,]/.test(firstSentence) && firstLen > 15) {
    violations.push({
      ruleId: 'opening_weak_adverbial',
      ruleName: '开头铺垫过弱',
      message: '第一句用了"XX的时候，XX"时间状语从句开场，力度不够，慢了半拍',
      severity: 'warning',
      suggestion: '第一句直接砸正在发生的身体刺激：疼/烫/凉/响/震。不要先写"在什么时间发生了什么"，直接写刺激本身。\n反面："玉碑碎的时候，苏明的掌心按在碑面上。"\n正面："疼。钻心的疼从指尖窜上来，玉碑碎了。"',
    });
  }
}

/** 检查项10：套路反应黑名单 */
function checkClicheReactions(
  text: string,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  for (const cliche of CLICHE_REACTIONS) {
    let idx = text.indexOf(cliche);
    while (idx !== -1) {
      violations.push({
        ruleId: 'cliche_reaction',
        ruleName: 'AI套路反应',
        message: `使用了AI套路反应词"${cliche}"，建议替换为生理级身体反应`,
        severity: 'error',
        position: { from: idx, to: idx + cliche.length },
        suggestion: '替换为具体生理反应：后颈汗毛竖起/后背冷汗/胃猛地一缩/后槽牙咬紧/呼吸卡在喉咙里/耳朵嗡的一声',
      });
      idx = text.indexOf(cliche, idx + cliche.length);
      // 只报前3个，避免信息过载
      if (violations.filter((v) => v.ruleId === 'cliche_reaction').length >= (thresholds.clicheReactionReportCap ?? 3)) break;
    }
    if (violations.filter((v) => v.ruleId === 'cliche_reaction').length >= (thresholds.clicheReactionReportCap ?? 3)) break;
  }
}

/** 检查项11：碎句病检测（同一段落内连续3个以上≤12字短句且无转折/无对话/无新信息/无单句成段） */
function checkFragmentedSentences(
  text: string,
  _stats: TextStats,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  // 按段落检测：只有同一段落内连续短句才算碎句病
  // 网文正确写法：短句单独成段做鼓点（一句一段），这不是碎句病
  const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0);
  let violationCount = 0;

  for (const para of paragraphs) {
    const sentenceRegex = /[^。！？!?]+[。！？!?]?/g;
    const matches = para.match(sentenceRegex);
    if (!matches || matches.length < (thresholds.fragmentedMinSentences ?? 3)) continue; // 段落内少于3句不检测

    const sentences = matches.map((s) => s.trim()).filter((s) => s.length > 0);
    let consecutiveShort = 0;

    for (let i = 0; i < sentences.length; i++) {
      const len = sentences[i].replace(/\s/g, '').length;
      const hasTwist = TWIST_WORDS.some((w) => sentences[i].includes(w));
      const hasDialogue = /[“”「」『』‘’]/.test(sentences[i]);
      const hasStrongEmotion = /(！|!)/.test(sentences[i]);
      const isPunch = isPunchLine(sentences[i] + '。'); // 单句检测
      const isShort = len <= (thresholds.fragmentedShortLen ?? 12);

      if (isShort && !hasTwist && !hasDialogue && !hasStrongEmotion && !isPunch) {
        consecutiveShort++;
      } else {
        if (consecutiveShort >= (thresholds.fragmentedConsecutiveMin ?? 3)) {
          violations.push({
            ruleId: 'fragmented_sentences',
            ruleName: '碎句病',
            message: `同一段落内连续 ${consecutiveShort} 个短句（≤12字）且无转折/无对话/无感叹，节奏断裂。段落内容："${para.substring(0, 60)}${para.length > 60 ? '...' : ''}"`,
            severity: 'warning',
            suggestion: '短句单独成段是鼓点（正确写法），但同一段落内连续多个无转折短句就是碎句病。将同一动作链内的短句用逗号合并，短句只用于危险/发现/反咬/钩子等鼓点位置（单独成段）。',
          });
          violationCount++;
          if (violationCount >= (thresholds.fragmentedMaxReports ?? 2)) return; // 最多报2个
        }
        consecutiveShort = 0;
      }
    }

    // 段落末尾检查
    if (consecutiveShort >= (thresholds.fragmentedConsecutiveMin ?? 3)) {
      violations.push({
        ruleId: 'fragmented_sentences',
        ruleName: '碎句病',
        message: `同一段落内连续 ${consecutiveShort} 个短句（≤12字）且无转折/无对话/无感叹，节奏断裂`,
        severity: 'warning',
        suggestion: '短句单独成段是鼓点（正确写法），但同一段落内连续多个无转折短句就是碎句病。将同一动作链内的短句用逗号合并，短句只用于危险/发现/反咬/钩子等鼓点位置（单独成段）。',
      });
      violationCount++;
      if (violationCount >= (thresholds.fragmentedMaxReports ?? 2)) return;
    }
  }
}

/** 检查项12：对话碰撞检测（启发式：对话中否定/反对词密度） */
function checkDialogueConflict(
  text: string,
  stats: TextStats,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  // 提取所有对话轮次：引号对话 + 无引号"角色名+言语动词"对话（修复仅依赖引号的盲区）
  // 无引号通道强制"角色名 + 说/道/问/开口/插话…"前置，纯叙事不会被捕为轮次，避免单字反对词（错/停/滚）假阳性
  const quotedTurns: string[] = [];
  const unquotedTurns: string[] = [];

  // 1) 引号对话（原有逻辑）
  const quotedRegex = /[“”「」『』‘’]([^“”「」『』‘’]{1,})[“”「」『』‘’]/g;
  let qm: RegExpExecArray | null;
  while ((qm = quotedRegex.exec(text)) !== null) {
    if (qm[1] && qm[1].trim().length >= 2) quotedTurns.push(qm[1].trim());
  }

  // 2) 无引号对话：找所有"角色名+言语动词"锚点，取锚点到下一锚点/段末为整段话语（允许多句，避免截断漏掉反对词）
  const anchorRegex = /(?:^|[\n。！？])\s*([一-龥]{1,6})\s*(?:说|道|问|回|喊|叫|低声|沉声|哑声|轻声|冷笑|笑|答|插话|骂|吼|喃喃|嘀咕|开口|拔高)[\s]*[：:，,]?/g;
  const anchors: number[] = [];
  let am: RegExpExecArray | null;
  while ((am = anchorRegex.exec(text)) !== null) {
    anchors.push(am.index + am[0].length);
  }
  for (let i = 0; i < anchors.length; i++) {
    const segStart = anchors[i];
    const segEnd = i + 1 < anchors.length ? anchors[i + 1] : text.length;
    const paraEnd = text.indexOf('\n\n', segStart);
    const realEnd = paraEnd === -1 ? segEnd : Math.min(segEnd, paraEnd);
    const seg = text.slice(segStart, realEnd).trim();
    if (seg.length >= 2) unquotedTurns.push(seg);
  }

  const allTurns = quotedTurns.concat(unquotedTurns);
  const minCount = thresholds.dialogueConflictMinCount ?? 4;
  if (allTurns.length < minCount) return; // 对话轮次太少（含独白/内心章），不检测

  // 反对词计数：引号轮次用完整词表；无引号轮次仅用 ≥2 字强反对词（排除 错/停/滚 等单字，避免叙事误判）
  const strongWords = DIALOGUE_CONFLICT_WORDS.filter((w) => w.length >= 2);
  let conflictCount = 0;
  for (const d of quotedTurns) {
    if (DIALOGUE_CONFLICT_WORDS.some((w) => d.includes(w))) conflictCount++;
  }
  for (const d of unquotedTurns) {
    if (strongWords.some((w) => d.includes(w))) conflictCount++;
  }

  // 若对话轮次达到阈值，却没有任何反对/否定/质疑词，报 warning
  if (allTurns.length >= minCount && conflictCount === 0) {
    violations.push({
      ruleId: 'dialogue_conflict',
      ruleName: '对话缺乏碰撞',
      message: `检测到 ${allTurns.length} 句对话轮次，但没有任何反对/质疑/否定，对话像工作汇报而非角色碰撞`,
      severity: 'warning',
      suggestion: '角色说出判断后，下一个人先反对/质疑；至少一人做出错误判断；对话中用动作打断',
    });
  }
}

/** 检查项13：章末钩子检测（V3强化版） */
function checkEndingHook(
  text: string,
  _stats: TextStats,
  _thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  if (text.length < 800) return; // 短章节不检测

  // 找最后一句（保留标点）
  const tail = text.substring(Math.max(0, text.length - 400));
  const sentenceEndRegex = /[。！？!?…]+[^。！？!?…]*$/;
  const endMatch = tail.match(sentenceEndRegex);
  const lastChunk = (endMatch ? endMatch[0] : tail).replace(/^[\s\n]+/, '');
  const lastSentence = lastChunk.replace(/[。！？!?…\s]+$/, '').trim();
  const lastPuncMatch = lastChunk.match(/[。！？!?…]+$/);
  const lastPunc = lastPuncMatch ? lastPuncMatch[0] : '';
  const lastChar = lastSentence.slice(-1);

  // 检查最后150字转折词
  const last150 = text.substring(Math.max(0, text.length - 150));
  const hasTwistAtEnd = TWIST_WORDS.some((w) => last150.includes(w)) ||
    /[？?]/.test(last150) ||
    /突然|竟然|居然|原来|其实|不是|反而|不对|不可能|等等|醒了|来了|动了|亮了|灭了|开了/.test(last150);

  // 检查是否有新信息/悬念/危险在结尾
  const hasNewInfo = /(发现|意识到|看到|听到|感觉到|不对|奇怪|难道|不可能|竟然|居然|原来|其实|不是)/.test(last150);
  const hasDanger = /(危险|杀|死|血|塌|崩|裂|灭|黑|凉|冷|逃|跑|躲|追|来了|到了)/.test(last150);
  const hasQuestion = /[？?]/.test(lastPunc);

  // 情况1：以"了。"结尾，叙事闭合，没有转折/新信息/危险
  const isNarrativeClosure = /了。$/.test(lastChunk.trimEnd()) ||
    (/[了的是着过]$/.test(lastChar) && /[。.]/.test(lastPunc) && !hasTwistAtEnd && !hasNewInfo && !hasDanger);

  if (isNarrativeClosure) {
    violations.push({
      ruleId: 'ending_hook',
      ruleName: '章末钩子不足',
      message: '最后一句是判断式/叙事闭合结尾（"了。"收束），读者读完就放下了',
      severity: 'warning',
      position: { from: Math.max(0, text.length - lastChunk.length), to: text.length },
      suggestion: '结尾100字内引入新信息/新危险/颠覆认知：①突然发现不对 ②某个东西动了/来了/亮了/灭了 ③未解问题用问号收尾 ④动作断裂在半空中',
    });
    return;
  }

  // 情况2：最后一句以总结性词语开头
  if (/^(就这样|原来如此|所以|于是|最终|最后|总之|总而言之|这一天|那天以后)/.test(lastSentence.trim())) {
    violations.push({
      ruleId: 'ending_summary',
      ruleName: '章末总结收束',
      message: '结尾用总结性词语收束，破坏追读欲望',
      severity: 'warning',
      suggestion: '删掉总结句，在最后50字内加入一个新的、未解释的异常信号',
    });
    return;
  }

  // 情况3：最后一句是长句（>25字），不是短句鼓点落点
  const lastLen = lastSentence.replace(/\s/g, '').length;
  if (lastLen > 25 && !hasQuestion && !hasNewInfo && !hasDanger) {
    violations.push({
      ruleId: 'ending_weak',
      ruleName: '章末落点太软',
      message: `最后一句${lastLen}字过长，且无问号/新信息/危险信号，落点不够有力`,
      severity: 'info',
      suggestion: '章末最后一句建议≤15字短句鼓点落点，用动作/感官/发现/问题结尾',
    });
  }

  // 情况4：章末凭空 bait 检测（铁则七补漏：回收伏笔 vs 凭空抛谜题）
  // 铁则七要求钩子必须回收本章已埋伏笔或颠覆已立判断；纯在最后一句话抛出全新场景/人物、
  // 前文零铺垫、且不带任何颠覆信号，属"bait"——读者只觉突兀，不会"骂断更"。
  const baitReveal = /挂着(了)?(一)?(个)?人|出现(了)?(一)?(个|道|名|团|个身影)|多了一(个|道|名)|站着(一)?(个|道)|从(门缝|暗处|阴影|黑暗|墙后|天花板|角落)里(伸|探|走|钻|冒)|新(的)?(人|身影|物体|东西)|凭空(出现|多)/;
  const tailText = text.substring(Math.max(0, text.length - 160));
  if (baitReveal.test(tailText)) {
    const baitStructures = ['塔吊', '横臂', '天台', '楼顶', '井下', '坑底', '墓室', '暗门', '密室', '地下室', '天桥', '隧道', '仓库', '厂房', '隔壁', '邻屋', '阴影里', '暗处', '身后的'];
    const bodyBeforeTail = text.substring(0, Math.max(0, text.length - 200));
    const matchedStruct = baitStructures.find((s) => tailText.includes(s) && !bodyBeforeTail.includes(s));
    const hasTwist = TWIST_WORDS.some((w) => tailText.includes(w)) ||
      /(本该|应该|原来|其实|竟然|居然|不是|反而|颠倒|早就|早料到)/.test(tailText);
    // 护栏：若章末钩子回收到本章已立伏笔（铁牌/陈默/货/周/门/板房），属合法回收，不误杀
    const hasForeshadowLink = /铁牌|陈默|货|周|门|板房|硬帽/.test(tailText);
    if (matchedStruct && !hasTwist && !hasForeshadowLink) {
      violations.push({
        ruleId: 'ending_bait',
        ruleName: '章末钩子凭空bait',
        message: `章末抛出全新场景元素「${matchedStruct}」及新人物，前文${matchedStruct}零铺垫、且无颠覆信号，属凭空悬念而非回收伏笔`,
        severity: 'warning',
        suggestion: '章末钩子必须回收本章已埋伏笔或颠覆已立判断；禁止在最后一句话凭空抛出全新谜题当 bait',
      });
    }
  }
}

/** 检查项14：信息反咬密度检测（V3新增） */
function checkTwistDensity(
  text: string,
  _stats: TextStats,
  _thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  if (text.length < 1000) return; // 短章节不检测

  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);
  let consecutiveNoTwist = 0;
  let maxConsecutive = 0;
  let totalTwists = 0;

  for (const para of paragraphs) {
    const hasTwist = TWIST_WORDS.some((w) => para.includes(w)) ||
      STRONG_SENSORY_WORDS.slice(0, 25).some((w) => para.includes(w)) ||
      isPunchLine(para); // V3.1：单句鼓点也算反咬落点
    if (hasTwist) {
      totalTwists++;
      consecutiveNoTwist = 0;
    } else {
      consecutiveNoTwist++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveNoTwist);
    }
  }

  const totalChars = text.replace(/\s/g, '').length;
  const twistPer1000 = (totalTwists / totalChars) * 1000;

  // 连续4段以上没有任何转折/意外/反咬
  if (maxConsecutive >= 4) {
    violations.push({
      ruleId: 'twist_gap',
      ruleName: '连续段落无反转',
      message: `连续${maxConsecutive}段没有任何信息反咬/意外/转折，读者注意力会涣散`,
      severity: 'warning',
      suggestion: '每2-3段（约300-500字）必须有一次信息反咬：读者预期被颠覆、发现不对、突然变化、人物做出反常反应',
    });
  }

  // 千字反咬密度低于2个
  if (twistPer1000 < 2 && totalChars > 1500) {
    violations.push({
      ruleId: 'twist_density_low',
      ruleName: '信息反咬密度不足',
      message: `千字反咬密度仅${twistPer1000.toFixed(1)}个，追读文要求每千字≥3个意外/转折/发现`,
      severity: 'info',
      suggestion: '增加"但是/不对/奇怪/竟然/没想到/原来/其实"等信息反转词的使用频率，不断给读者新的认知冲击',
    });
  }
}

// ===== V3.1 新增：2026网文追读力铁则检测器 =====

/** 开篇环境描写黑名单词 */
const OPENING_SCENERY_WORDS = [
  '天刚亮', '清晨', '傍晚', '深夜', '夜色', '月光', '阳光',
  '寒风', '大雪', '小雨', '暴雨', '乌云', '蓝天', '白云',
  '村子里', '小镇上', '城市里', '大陆', '世界', '纪元',
  '巍峨', '连绵', '高耸', '古老', '破旧', '繁华', '荒凉',
  '在这个', '在一座', '在一片', '这是一个', '那是一个',
  '很久以前', '从前', '话说', '自从',
];

/** 假钩子/装神弄鬼黑名单词 */
const FAKE_HOOK_WORDS = [
  '一股神秘的', '一种莫名的', '一丝诡异的', '一股奇怪的',
  '他似乎意识到了什么', '她好像发现了什么', '他总觉得哪里不对',
  '一种不祥的预感', '一股寒意涌上心头', '一种说不出的感觉',
  '黑暗中有什么东西', '暗处有一双眼睛', '背后似乎有人',
  '这件事没那么简单', '这背后一定有隐情', '事情越来越不对劲',
  '他不知道的是', '没有人知道', '所有人都没发现',
];

/** 黄金300字必须出现的冲突/动作词 */
const GOLDEN_CONFLICT_WORDS = [
  '死', '杀', '血', '刀', '枪', '逃', '追', '打', '骂', '吼',
  '抓', '推', '撞', '摔', '碎', '塌', '崩', '裂', '炸', '烧',
  '危险', '不对', '该死', '操', '靠', '妈的', '跑', '快',
  '不', '别', '住手', '停', '滚', '你敢', '凭什么', '为什么',
  '怎么可能', '不可能', '竟然', '居然', '没想到', '不好',
  '系统', '绑定', '穿越', '重生', '觉醒', '激活', '弹窗',
  '离婚', '分手', '开除', '辞退', '赶出', '驱逐', '背叛',
  '发现', '意识到', '看到', '听见', '摸到',
];

/** 检查项15：黄金300字冲突检测（2026网文铁则：3秒停留率） */
function checkGolden300(
  text: string,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  if (text.length < (thresholds.golden300MinChars ?? 300)) return;

  const first300 = text.substring(0, 300);

  // 检查前300字内有没有冲突/动作/异常信号
  const hasConflict = GOLDEN_CONFLICT_WORDS.some((w) => first300.includes(w));
  const hasDialogue = /[“”「」『』‘’]/.test(first300);
  const hasBodyReaction = STRONG_SENSORY_WORDS.slice(0, 30).some((w) => first300.includes(w));

  if (!hasConflict && !hasDialogue && !hasBodyReaction) {
    violations.push({
      ruleId: 'golden_300',
      ruleName: '黄金300字无冲突',
      message: '前300字内没有冲突爆发、没有动作、没有对话、没有身体反应，读者3秒就划走',
      severity: 'error',
      suggestion: '2026网文铁则：前300字必须完成「冲突爆发→主角在场→异常出现」三件事，不要写景、不要铺垫、不要回忆',
    });
  }

  // 检查第一段（第一句）长度，超过40字太长
  const firstPara = text.split(/\n+/).find((p) => p.trim().length > 0) || '';
  const firstSentence = firstPara.split(/[。！？!?…]/)[0];
  if (firstSentence.length > (thresholds.golden300FirstSentenceMax ?? 35)) {
    violations.push({
      ruleId: 'golden_300',
      ruleName: '开篇首句过长',
      message: `开篇第一句${firstSentence.length}字，太长，读者扫一眼就划走`,
      severity: 'warning',
      suggestion: '开篇第一句必须≤20字，直接写动作/冲突/结果，比如"刀尖抵住她喉结时，系统亮了。""外门弟子林凡，一刀斩了大师兄。"',
    });
  }
}

/** 检查项16：开篇禁忌检测（禁止写景/回忆/背景开头） */
function checkOpeningTaboos(
  text: string,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  const first150 = text.substring(0, thresholds.openingTaboosWindow ?? 150);
  const firstPara = text.split(/\n+/).find((p) => p.trim().length > 0) || '';
  const firstSentence = firstPara.split(/[。！？!?…]/)[0].trim();

  // 检查第一句是不是环境描写开头
  for (const word of OPENING_SCENERY_WORDS) {
    if (firstSentence.includes(word) || first150.startsWith(word)) {
      violations.push({
        ruleId: 'opening_taboos',
        ruleName: '开篇写景/背景',
        message: `开篇用"${word}"等环境/背景词开头，浪费黄金3秒`,
        severity: 'warning',
        suggestion: '开篇禁止写景、禁止交代背景、禁止回忆前世。第一句直接写动作现场：谁在什么危险里，正在发生什么事。背景用一句话插在动作中间带过："这是灵气枯竭第27年，他正在被人追砍。"',
      });
      break;
    }
  }

  // 检查前100字内有没有"我叫XX""我是XX""XX今年XX岁"这种自我介绍
  if (/^(我叫|我是|他叫|他是|.*今年\d+岁|.*出生在)/.test(firstSentence) ||
      /我叫|我是.*，今年|名字叫/.test(first150.substring(0, thresholds.openingTaboosSelfIntroWindow ?? 80))) {
    violations.push({
      ruleId: 'opening_taboos',
      ruleName: '开篇自我介绍',
      message: '开篇用自我介绍开头，是新人最常见的死亡开局',
      severity: 'warning',
      suggestion: '不要告诉读者主角是谁，要让读者在动作和冲突中自己认识主角。先写刀架在脖子上，再告诉读者这人是谁。',
    });
  }
}

/** 检查项17：装神弄鬼假钩子检测 */
function checkFakeHooks(
  text: string,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  // 检查最后200字（钩子区域）
  const last200 = text.substring(Math.max(0, text.length - (thresholds.fakeHookZoneWindow ?? 200)));

  for (const word of FAKE_HOOK_WORDS) {
    if (last200.includes(word)) {
      violations.push({
        ruleId: 'fake_hook',
        ruleName: '装神弄鬼假钩子',
        message: `结尾用了"${word}"这类空泛悬念，现在读者已经免疫了`,
        severity: 'warning',
        suggestion: '钩子不能是"有什么不对"，钩子必须是具体的信息：具体谁来了、具体发现了什么、具体哪句话不对、具体什么东西动了。比如"他低头，看见凿尖上沾了血。"比"他觉得哪里不对"有效100倍。',
      });
      break;
    }
  }
}

/** 检查项24：空洞四字成语/形容词堆砌检测（V3.1客观测试新增）
 * 扑街文/AI水文标志：大量使用"巍峨壮丽"、"宛如仙境"、"天昏地暗"这种空洞成语，没有具体细节
 */
function checkClichéPhrases(
  text: string,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  // 网文最常见的空洞成语/套路形容词
  const clichéWords = [
    '巍峨壮丽','连绵起伏','宛如仙境','仙气氤氲','鳞次栉比','琼楼玉宇','金碧辉煌',
    '天昏地暗','日月无光','刀光剑影','真气激荡','飞沙走石','惊天动地','震耳欲聋',
    '气势磅礴','雄伟壮观','美不胜收','风景如画','古色古香','雕梁画栋','巧夺天工',
    '神采飞扬','容光焕发','英姿飒爽','威风凛凛','气宇轩昂','风度翩翩','一表人才',
    '波光粼粼','湖光山色','山清水秀','层峦叠嶂','云雾缭绕','霞光万道','瑞彩千条',
    '人山人海','摩肩接踵','人声鼎沸','水泄不通','车水马龙','热闹非凡',
    '电闪雷鸣','狂风大作','乌云密布','倾盆大雨','天寒地冻','烈日炎炎',
    '欣喜若狂','悲痛欲绝','怒发冲冠','胆战心惊','魂飞魄散','毛骨悚然',
    '时光飞逝','岁月如梭','光阴似箭','白驹过隙','弹指之间','转眼之间',
    '一飞冲天','一鸣惊人','飞黄腾达','平步青云','前程似锦','前途无量',
    '博大精深','源远流长','历史悠久','人杰地灵','物华天宝','钟灵毓秀',
    '不以为然','不屑一顾','嗤之以鼻','置若罔闻','熟视无睹','无动于衷',
    '滔滔不绝','口若悬河','能说会道','妙语连珠','出口成章','对答如流'
  ];

  let count = 0;
  const found: string[] = [];
  for (const w of clichéWords) {
    if (text.includes(w)) {
      count++;
      found.push(w);
    }
  }

  const totalChars = text.replace(/\s/g, '').length;
  const density = totalChars > 0 ? (count / totalChars) * 1000 : 0;

  if (count >= (thresholds.clichePhraseCountWarn ?? 3) || density > (thresholds.clichePhraseDensityMax ?? 2.5)) {
    const severity = count >= (thresholds.clichePhraseCountError ?? 5) ? 'error' : (count >= (thresholds.clichePhraseCountWarn ?? 3) ? 'warning' : 'info');
    violations.push({
      ruleId: 'cliché_phrases',
      ruleName: '空洞成语堆砌',
      message: `文中出现${count}个套路四字成语（${found.slice(0,3).join('、')}${count>3?'...':''}），千字密度${density.toFixed(1)}个，描写太笼统`,
      severity: severity as any,
      suggestion: '网文不要用成语写描写！"巍峨壮丽"读者脑子里没有画面，不如直接写"山尖戳进云里，石头是黑的，风刮在脸上像刀子割"。成语是总结，不是描写。把成语换成具体的颜色/触感/温度/声音/味道。',
    });
  }
}

/** 检查项25：前200字无人物冲突检测（V3.1客观测试新增）
 * 黄金三章铁则：开头必须立刻进人物/冲突，纯写景/纯背景介绍是死亡开局
 */
function checkOpeningScene(
  text: string,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  if (text.length < (thresholds.openingSceneWindow ?? 200)) return;
  const opening = text.substring(0, thresholds.openingSceneWindow ?? 200);
  
  // 检查前200字里有没有人物代词/人名
  const personWords = ['我','你','他','她','它','我们','你们','他们','主角','少年','青年','男人','女人','老人','女孩','男孩','老子','老娘','爷','俺'];
  // 提取人名（简单的2-3字中文姓名检测）
  const nameRegex = /[\u4e00-\u9fa5]{2,3}(?=[说问喊叫笑道怒骂看盯望])/g;
  const hasPerson = personWords.some(w => opening.includes(w)) || nameRegex.test(opening);
  
  // 检查前200字里有没有身体动作/感官词
  const actionSenseWords = ['疼','痛','烫','凉','冷','热','麻','硬','软','响','声','味','喘','跳','震','手','眼','脚','嘴','脸','心','头','砸','砍','刺','抓','握','跑','喊','叫','碎','裂','喷','流','滴'];
  const hasAction = actionSenseWords.some(w => opening.includes(w));

  // 开头写景/写环境的标志词
  const sceneWords = ['山脉','山峰','大地','天空','苍穹','乾坤','宇宙','天地','大陆','世界','王朝','帝国','宗门','门派','家族','城市','都城','古城','小镇','村庄','森林','大海','草原','沙漠','雪山','云海','云雾','灵气','仙气','灵力','内力'];
  let sceneCount = 0;
  for (const w of sceneWords) {
    if (opening.includes(w)) sceneCount++;
  }

  if ((!hasPerson || !hasAction) && sceneCount >= (thresholds.openingSceneSceneCountMin ?? 3)) {
    violations.push({
      ruleId: 'opening_scene_setting',
      ruleName: '开头纯写景无人物',
      message: `前200字全是环境/背景描写，${!hasPerson ? '没有出现人物' : '没有人物动作/感官'}，读者3秒划走`,
      severity: 'error',
      suggestion: '不要先写山多大、天多高、宗门多气派。读者不关心这个。第一句必须砸在人身上：要么疼、要么响、要么有人说话、要么血溅出来。等读者代入主角了，再慢慢写环境不迟。' +
        '\n反面："青云山脉连绵起伏，巍峨壮丽，常年云雾缭绕，宛如仙境。"' +
        '\n正面："疼。李火旺睁开眼，后背硌在硬泥地上，一股子霉味往鼻子里钻。"',
    });
  }
}

/** 检查项26：假动作/标签化反应检测（V3.1客观测试新增）
 * "嘴角露出微笑"、"眼中闪过一丝寒光"、"紧紧握着拳头"这种标签化假动作，不是真生理反应
 */
function checkFakeReactions(
  text: string,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  const fakeReactions = [
    { pattern: /嘴角[微不]?露出[一几]?丝?[微]?(笑|冷笑|笑容|笑意|微笑|弧度)/g, label: '嘴角微笑' },
    { pattern: /眼中闪过[一几]?丝?(寒|冷|杀|不|欣|赞|异|讶|惊|诧|疑)(光|意|色|芒)/g, label: '眼中闪过X光' },
    { pattern: /[紧狠]?[紧狠]地握[住着]拳头/g, label: '紧握拳头' },
    { pattern: /心中[暗暗]?(想|道|说|发誓|决定|冷笑|得意|一惊|一动|一凛|一喜|怒)/g, label: '心中XX' },
    { pattern: /脸上露出[一几]?丝?(笑容|微笑|冷笑|惊讶|疑惑|不屑|欣慰|满意|复杂)(的表情|之色)?/g, label: '脸上露出表情' },
    { pattern: /不由得[露现浮]出/g, label: '不由得露出' },
    { pattern: /[缓缓缓]?[缓]?地(说|道|开口|回答|说道)/g, label: '缓缓地说' },
    { pattern: /[语气|眼神|目光][中里][充满带闪]着/g, label: '语气/眼神中充满' },
    { pattern: /[不]由[自主得]?地/g, label: '不由自主' },
    { pattern: /[上下]打量[了]?[一]?[番眼]?/g, label: '打量一番' },
  ];

  let total = 0;
  const found: string[] = [];
  for (const fr of fakeReactions) {
    const matches = text.match(fr.pattern);
    if (matches) {
      total += matches.length;
      found.push(fr.label);
    }
  }

  const totalChars = text.replace(/\s/g, '').length;
  const density = totalChars > 0 ? (total / totalChars) * 1000 : 0;

  if (total >= (thresholds.fakeReactionCountMin ?? 3) || density > (thresholds.fakeReactionDensityMax ?? 2)) {
      violations.push({
      ruleId: 'fake_reactions',
      ruleName: '标签化假反应',
      message: `文中出现${total}个标签化假动作（${[...new Set(found)].slice(0,3).join('、')}），千字${density.toFixed(1)}个，这是告诉读者情绪，不是让读者感受到情绪`,
      severity: 'error',
      suggestion: '不要写"他嘴角露出冷笑"，写他具体做了什么：他把烟按灭在桌上，烟灰弹在对方脸上，没说话。' +
        '不要写"眼中闪过一丝寒光"，写具体的生理反应：他瞳孔缩了一下，指节捏得发白。' +
        '情绪可"显"可"示"：写动作/对话为主，也可口语化直接点名（"心中暗暗发誓"→"他咬牙：这次必须扛住"）。禁止书面总结式情绪句。',
    });
  }
}

/** 检查项23：重复句子/段落检测（V3.1读者视角校准）
 * 连续重复或高度相似的句子/段落是严重低级错误
 */
function checkRepetition(
  text: string,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(p => p.length > (thresholds.repetitionMinParaLen ?? 8));
  
  // 检查完全重复的段落
  const seen = new Map<string, number>();
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (seen.has(p)) {
      violations.push({
        ruleId: 'repetition',
        ruleName: '重复段落',
        message: `第${i+1}段和第${seen.get(p)!+1}段完全重复，这是严重错误`,
        severity: 'error',
        suggestion: '删除重复段落，检查是不是复制粘贴错误。读者看到重复内容会直接出戏，甚至以为是AI生成的垃圾。',
      });
    } else {
      seen.set(p, i);
    }
  }

  // 检查高度相似的句子（连续两句相同率>70%）
  const sentences: string[] = [];
  const sentenceRegex = /[^。！？!?\n]+[。！？!?]?/g;
  let m: RegExpExecArray | null;
  while ((m = sentenceRegex.exec(text)) !== null) {
    const s = m[0].trim();
    if (s.length > (thresholds.repetitionMinSentLen ?? 10)) sentences.push(s);
  }
  
  for (let i = 1; i < sentences.length; i++) {
    const prev = sentences[i-1];
    const curr = sentences[i];
    // 简单相似度：相同字符数/总字符数
    let sameChars = 0;
    const minLen = Math.min(prev.length, curr.length);
    for (let j = 0; j < minLen; j++) {
      if (prev[j] === curr[j]) sameChars++;
    }
    const similarity = sameChars / Math.max(prev.length, curr.length);
    if (similarity > (thresholds.repetitionSimilarityMax ?? 0.75) && prev.length > (thresholds.repetitionMinSentPairLen ?? 15) && curr.length > (thresholds.repetitionMinSentPairLen ?? 15)) {
      violations.push({
        ruleId: 'repetition_sentence',
        ruleName: '句子重复啰嗦',
        message: `连续两句高度相似（相似度${(similarity*100).toFixed(0)}%），内容在重复`,
        severity: 'warning',
        suggestion: '删掉其中一句，或者把两句话合并成一句推进信息。不要一句话翻来覆去说。',
      });
      break; // 只报第一个
    }
  }
}

// ===== V3.1实战新增检测器（6题材实战发现）=====

/** 嗅觉/味觉关键词 */
const SMELL_TASTE_WORDS = [
  // 嗅觉
  '味道', '气味', '闻到', '嗅', '香', '臭', '腥', '腐', '焦', '糊',
  '铁锈味', '血腥味', '甜味', '苦味', '酸味', '辣味', '咸味',
  '兰花香', '桂花香', '酒香', '药味', '硝烟味', '硝烟', '汽油味',
  '霉味', '潮味', '泥土味', '金属味', '硫磺味', '檀香味', '脂粉味',
  '烟味', '汗味', '体香', '奶香', '血腥味', '焦糊味', '刺鼻',
  // 味觉
  '嘴里发苦', '舌尖', '甜', '苦', '咸', '涩', '辣', '酸', '腥',
  '嘴里发涩', '回甘', '辛辣', '咸腥', '满嘴', '入口', '嚼', '咽',
];

/** 触觉关键词（除了视觉和听觉的身体感知） */
const TOUCH_WORDS = [
  '烫', '凉', '冷', '冰', '热', '温', '暖', '疼', '痛', '麻', '痒',
  '硬', '软', '黏', '滑', '糙', '涩', '湿', '干', '紧', '松',
  '震', '抖', '颤', '晃', '压', '顶', '刺', '割', '扎', '勒',
  '指尖', '掌心', '后背', '脊背', '后颈', '皮肤', '毛孔',
  '鸡皮疙瘩', '汗毛竖起', '冷汗', '汗水', '温度', '质感',
];

/** 检查项18：五感平衡检测 */
function checkSensoryBalance(
  text: string,
  _stats: TextStats,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  if (text.length < (thresholds.sensoryBalanceMinChars ?? 500)) return; // 短章节不检测

  // 统计五感激活情况
  const hasVision = /(看|望|盯|瞧|见|光|色|亮|暗|黑|白|红|影|画面|映入|眼前)/.test(text);
  const hasHearing = /(听|响|声|音|静|喊|叫|说|问|答|咚|咔|砰|嗡|哗|嘶)/.test(text);
  const hasSmellTaste = SMELL_TASTE_WORDS.some((w) => text.includes(w));
  const hasTouch = TOUCH_WORDS.some((w) => text.includes(w));

  const senses = [hasVision, hasHearing, hasSmellTaste, hasTouch].filter(Boolean).length;
  const hasBodySense = hasSmellTaste || hasTouch;

  // 少于3种感官
  if (senses < (thresholds.sensoryBalanceMinSenses ?? 3)) {
    const missing: string[] = [];
    if (!hasSmellTaste) missing.push('嗅觉/味觉');
    if (!hasTouch) missing.push('触觉/温度');
    violations.push({
      ruleId: 'sensory_balance',
      ruleName: '五感失衡',
      message: `当前只激活了${senses}种感官${missing.length ? '，缺少：' + missing.join('、') : ''}，沉浸感不足`,
      severity: 'info',
      suggestion: '除了视觉和听觉，至少加入一种嗅觉/味觉（什么味道？铁锈？甜？苦？）或触觉/温度（烫？凉？麻？疼？），沉浸感立刻提升。恐怖/悬疑场景必须有触觉或嗅觉。',
    });
  }

  // 超过800字的场景如果只有视觉+听觉，没有触觉/嗅觉
  if (text.length > (thresholds.sensoryBalanceLongChars ?? 800) && !hasBodySense) {
    violations.push({
      ruleId: 'sensory_balance',
      ruleName: '缺少身体感官',
      message: '章节超过800字但没有任何嗅觉/味觉/触觉/温度描写，像在看监控录像，没有代入感',
      severity: 'warning',
      suggestion: '加入具体的身体感知：空气是什么温度？什么味道？手里的东西是什么质感？后颈有没有发凉？皮肤有没有起鸡皮疙瘩？读者通过主角的身体"在场"。',
    });
  }
}

/** 检查项19：钩子具体性检测 */
function checkHookConcreteness(
  text: string,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  if (text.length < (thresholds.hookConcretenessMinChars ?? 500)) return;

  const tail = text.substring(Math.max(0, text.length - (thresholds.hookConcretenessZoneWindow ?? 200)));

  // 找最后一句话
  const sentenceEndRegex = /[。！？!?…]+[^。！？!?…]*$/;
  const endMatch = tail.match(sentenceEndRegex);
  const lastChunk = (endMatch ? endMatch[0] : tail).replace(/^[\s\n]+/, '');
  const lastSentence = lastChunk.replace(/[。！？!?…\s]+$/, '').trim();

  // 最后一句是"像XX"比喻句
  if (/^(像|如|仿佛|好似|就像|如同)/.test(lastSentence) ||
      (lastSentence.includes('像') && lastSentence.length < (thresholds.hookConcretenessSimileLenMax ?? 20))) {
    violations.push({
      ruleId: 'hook_concreteness',
      ruleName: '钩子用抽象比喻收尾',
      message: `章末最后一句"${lastSentence}"是比喻句收尾，太抽象，读者没有具体画面`,
      severity: 'info',
      suggestion: '好钩子是具体的人/物/事/声音/动作，不是比喻。把"像心跳"改成"咚。咚。咚。声音是从隔壁传来的。"把"像地狱"改成"他低头，看见自己的影子多了一只手。"',
    });
  }
}

/** 检查项20：连续比喻检测 */
function checkSimileDensity(
  text: string,
  thresholds: Thresholds,
  violations: RuleViolation[]
): void {
  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > (thresholds.simileParaMinLen ?? 20));
  let totalSimiles = 0;

  for (const para of paragraphs) {
    const matches = para.match(/像[^，。！？]{2,15}[,，。！？]/g) || [];
    const matches2 = para.match(/仿佛[^，。！？]{2,15}[,，。！？]/g) || [];
    // 负向预查：排除"如"作连词的复合词（如今/如果/如何/如期/如实/如此/如愿…），只保留真比喻（如刀割/如潮水）。
    // 否则"如今的局面，"会被误判为连续比喻、滥报 simile_density error。
    const matches3 = para.match(/如(?!今|果|何|期|实|愿|此|意|常|下|故|初|是|数|约)[^，。！？]{2,10}[,，。！？]/g) || [];
    const paraSimiles = matches.length + matches2.length + matches3.length;
    totalSimiles += paraSimiles;

    if (paraSimiles >= (thresholds.similePerParaMax ?? 2) && para.length < (thresholds.simileParaMaxLen ?? 200)) {
      violations.push({
        ruleId: 'simile_density',
        ruleName: '连续比喻过密',
        message: `同一段落内出现${paraSimiles}个"像/仿佛/如"比喻，描写密度过高`,
        severity: 'error',
        suggestion: '比喻不要连用。网文节奏快，最好的描写是直接写具体细节，不是写"像什么"。"像被铁钳夹住"不如直接写"指骨在响"，"像潮水一样"不如直接写"凉意在脊背炸开"。',
      });
    }
  }

  // 千字比喻密度（V3.1读者视角校准）
  const totalChars = text.replace(/\s/g, '').length;
  const density = totalChars > 0 ? (totalSimiles / totalChars) * 1000 : 0;
  if (density > (thresholds.simileDensityMax ?? 5)) {
    violations.push({
      ruleId: 'simile_density_global',
      ruleName: '比喻过多',
      message: `全文比喻密度千字${density.toFixed(1)}个，超过5个/千字`,
      severity: 'info',
      suggestion: '网文是快节奏叙事，不是散文。把"像XX一样"的比喻砍掉一半，换成直接的动作/生理反应/具体细节，力量感会强很多。',
    });
  }
}

/** 不必要英文词（常见英文夹词，非专有名词） */
const UNNECESSARY_ENGLISH = [
  'drunk', 'ok', 'OK', 'Okay', 'okay', 'yes', 'no', 'sorry', 'hello',
  'hi', 'hey', 'bye', 'good', 'bad', 'cool', 'nice',
];

/** 专有名词白名单（允许出现的英文） */
const ENGLISH_WHITELIST = [
  'APP', 'App', 'app', 'AI', 'CP', 'DNA', 'GPS', 'KTV', 'PPT', 'PS',
  'VIP', 'WiFi', 'Wi-Fi', 'USB', 'GDP', 'ICU', 'ID', 'IP', 'IT',
  'OK', 'OKR', 'PC', 'PE', 'PS', 'P2P', 'SUV', 'TV', 'UI', 'UFO',
  'V信', 'X光', 'B超', 'O型血', 'A股', 'B股',
];

/** 检查项21：不必要英文检测 */
function checkUnnecessaryEnglish(
  text: string,
  violations: RuleViolation[]
): void {
  for (const word of UNNECESSARY_ENGLISH) {
    // 检查单词边界（避免匹配到中文里的偶然字符组合）
    const regex = new RegExp(`(?:^|[\\s，。！？!?…“「」『』、])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s，。！？!?…“「」『』、]|$)`);
    if (regex.test(text) && !ENGLISH_WHITELIST.includes(word)) {
      violations.push({
        ruleId: 'unnecessary_english',
        ruleName: '不必要英文词',
        message: `中文网文中出现了非必要的英文词"${word}"，影响沉浸感`,
        severity: 'info',
        suggestion: '把英文换成中文表达：drunk→喝醉的/醉醺醺的，ok→好的/行，sorry→对不起/抱歉，cool→帅/酷（口语可用但书面建议避免）。',
      });
      break;
    }
  }
}
