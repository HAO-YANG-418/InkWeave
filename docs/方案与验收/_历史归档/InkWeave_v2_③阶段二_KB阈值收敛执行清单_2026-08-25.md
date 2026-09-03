# InkWeave v2 ③阶段二 KB阈值收敛执行清单（2026-08-25）

> 方案方交付物（写 .md，不碰 .ts）。本清单所有路径/行号/魔法数均经实地核真实代码，非记忆推断。
> 拍板：落点 A（KB 作单一标定源）；2E（49 内联 inline 魔法数收编）拆为独立一轮，不在本清单动手范围。
> 前置：③ 阶段一已收口，health-matrix.json（26 章实测矩阵）在手。

## 0. 范围与分工
- 本清单覆盖 **2A–2D**：① 扩展 `Thresholds` 类型；② 8 处 `checks/*.ts` 改读；③ 反推默认值；④ 落点 A（KB 数值文件 + loader）。
- 分工：助手=方案方写本清单；**用户=代码方据清单改 `.ts` 后独立 fact-check**（本会话助手不碰 .ts）。

## 1. 前置核查结论（已实地核，本清单依赖）
### 1.1 `Thresholds` 全字段（源码/types.ts:102-139）
共 **21 字段**：19 必填（minAnchors/anchorsPerWords/maxAnchorGap/maxFillerSentences/maxFillerWords/maxDashCount/maxEllipsisCount/maxParagraphLength/targetParagraphLength/minParagraphCount/maxDialogueContinuous/maxDialogueTagRepeat/maxSentenceLength/targetSentenceLength/shortSentenceRatio/maxExpositionContinuous/infoPointsPerThousand/minSensoryTypes/sightRatio）+ 2 可选（notShiErrorMin?/maxSmoothnessViolations?）。**无 wordCount**（D4 在 checker.ts:57-58 的 targetWords 参数）。命名全 camelCase——新增字段须同风格。
### 1.2 `知识库/` 结构
`知识库/数据|节点|预设` 全散文文档；数值阈值真身在 `源码/kb/nodes/*.kb.json` 的 `threshold_overrides`（`config-merger.ts:194` 第4层已并到 MergedConfig.thresholds）。落点 A 新建全局默认文件，不入节点粒度。
### 1.3 8 处 check 改读管道已存在（零签名改动）
`checker.ts:246-264` 直接调 `checkSenseDensity(text, stats, thresholds, vocabulary, violations)` 等；`checker-registry.ts:82` runAllChecks 也传 thresholds。8 文件签名均已收 `thresholds`（6 个用 `_thresholds` 占位未读：comma-chain/exclamation/forbidden-char/sentence-waveform/character-voice/action-rollcall；2 个 data-anchor/sense-density 收 `thresholds` 但魔法数仍硬编码）。→ 改读 = 内部魔法数换 `thresholds.xxx ?? 默认`，并把 `_thresholds` 改名 `thresholds`。
### 1.4 真实分布（health-matrix.json 26章，决定 2C 方法）
| ruleId | 命中章 | error | warning | info |
|---|---|---|---|---|
| comma_chain | 16 | 0 | 4 | 58 |
| data_anchor | 26 | 0 | 0 | 52 |
| exclamation_quota | 0 | 0 | 0 | 0 |
| forbidden_char | 10 | 0 | 1 | 10 |
| sentence_waveform | 2 | 0 | 0 | 4 |
| sense_density | 21 | 0 | 20 | 19 |
| character_voice | 14 | 0 | 14 | 0 |
| action_rollcall | 1 | 0 | 1 | 0 |
**关键**：8 ruleId 实测 **error 级全 0**。原 ③ 文档 §3.1「error 取达标章上界」方法不成立（无 error 样本）→ 2C 改为 relocate 现有 warning/info 魔法数（行为零变化），升 error 是独立产品决策（见 §4 注记）。

## 2. 2A 扩展 `Thresholds` 类型（源码/types.ts）
### 2.1 接口（types.ts:102-139，notShiErrorMin? 之后）加 16 可选字段：
| 字段 | 类型 | 默认 | 来源 check:行 |
|---|---|---|---|
| commaChainRatioWarn? | number | 3.2 | check-comma-chain.ts:23 |
| commaChainLongMax? | number | 8 | check-comma-chain.ts:38 |
| dataAnchorDensityMax? | number | 5 | check-data-anchor.ts:22 |
| dataAnchorDensityMin? | number | 0.5 | check-data-anchor.ts:33 |
| exclamationWarnThreshold? | number | 10 | check-exclamation-quota.ts:18 |
| exclamationInfoThreshold? | number | 5 | check-exclamation-quota.ts:26 |
| forbiddenCharWarnCount? | number | 5 | check-forbidden-char.ts:37 |
| sentenceWaveStdDevMin? | number | 5 | check-sentence-waveform.ts:26 |
| sentenceWaveMeanMin? | number | 10 | check-sentence-waveform.ts:26 |
| sentenceWaveSameRunMax? | number | 5 | check-sentence-waveform.ts:42 |
| senseDensityMin? | number | 0.02 | check-sense-density.ts:20 |
| senseBalanceRatioMax? | number | 5 | check-sense-density.ts:33 |
| characterVoiceSkipRatio? | number | 0.05 | check-character-voice.ts:15 |
| characterVoiceTagMin? | number | 3 | check-character-voice.ts:20 |
| characterVoiceRatioMax? | number | 0.15 | check-character-voice.ts:20 |
| actionRollcallRepeatMax? | number | 5 | check-action-rollcall.ts:27 |

### 2.2 DEFAULT_THRESHOLDS（types.ts:141-162，maxSmoothnessViolations:3 之后）加同名字段默认值
默认值 = 上表「默认」列（即原硬编码魔法数），全部 `?? default` 兜底，**行为不变**。

## 3. 2B 8 处 check 改读（零签名改动，逐文件 old→new）
> 通用：6 个 `_thresholds` 占位文件先把参数名 `_thresholds` 改为 `thresholds`（data-anchor/sense-density 已是 `thresholds`，不改名）。

| 文件 | 行 | 原 | 改 |
|---|---|---|---|
| check-comma-chain.ts | 23 | `if (ratio > 3.2) {` | `if (ratio > (thresholds.commaChainRatioWarn ?? 3.2)) {` |
| check-comma-chain.ts | 38 | `if (commas >= 8) {` | `if (commas >= (thresholds.commaChainLongMax ?? 8)) {` |
| check-data-anchor.ts | 22 | `if (density > 5) {` | `if (density > (thresholds.dataAnchorDensityMax ?? 5)) {` |
| check-data-anchor.ts | 33 | `if (density < 0.5 && stats.totalWords > 2000) {` | `if (density < (thresholds.dataAnchorDensityMin ?? 0.5) && stats.totalWords > 2000) {` |
| check-exclamation-quota.ts | 18 | `if (exclamationCount > 10) {` | `if (exclamationCount > (thresholds.exclamationWarnThreshold ?? 10)) {` |
| check-exclamation-quota.ts | 26 | `else if (exclamationCount > 5) {` | `else if (exclamationCount > (thresholds.exclamationInfoThreshold ?? 5)) {` |
| check-forbidden-char.ts | 37 | `severity: count > 5 ? 'warning' : 'info',` | `severity: count > (thresholds.forbiddenCharWarnCount ?? 5) ? 'warning' : 'info',` |
| check-sentence-waveform.ts | 26 | `if (stdDev < 5 && mean > 10) {` | `if (stdDev < (thresholds.sentenceWaveStdDevMin ?? 5) && mean > (thresholds.sentenceWaveMeanMin ?? 10)) {` |
| check-sentence-waveform.ts | 42 | `if (sameRun >= 5) {` | `if (sameRun >= (thresholds.sentenceWaveSameRunMax ?? 5)) {` |
| check-sense-density.ts | 20 | `if (density < 0.02 && stats.totalWords > 500) {` | `if (density < (thresholds.senseDensityMin ?? 0.02) && stats.totalWords > 500) {` |
| check-sense-density.ts | 33 | `if (maxSense > 0 && minSense > 0 && maxSense / minSense > 5) {` | `... && maxSense / minSense > (thresholds.senseBalanceRatioMax ?? 5)) {` |
| check-character-voice.ts | 15 | `if (stats.dialogueRatio < 0.05) return;` | `if (stats.dialogueRatio < (thresholds.characterVoiceSkipRatio ?? 0.05)) return;` |
| check-character-voice.ts | 20 | `if (tagCount < 3 && stats.dialogueRatio > 0.15) {` | `if (tagCount < (thresholds.characterVoiceTagMin ?? 3) && stats.dialogueRatio > (thresholds.characterVoiceRatioMax ?? 0.15)) {` |
| check-action-rollcall.ts | 27 | `if (count >= 5) repeated.push(` | `if (count >= (thresholds.actionRollcallRepeatMax ?? 5)) repeated.push(` |

> 注：`data-anchor:33` 的 `totalWords > 2000` 与 `sense-density:20` 的 `totalWords > 500` 为字数地板常量，本清单**保留字面量**（后续可单独标定，非本步范围）。

## 4. 2C 反推默认值（基于 §1.4 矩阵）
- **方法修正**：因 8 ruleId 实测 error 全 0，本步**不重新定 error 阈值**，仅把现有 warning/info 魔法数 relocate 进 DEFAULT_THRESHOLDS（§2.2 默认值 = 原魔法数，行为零变化）。
- **升 error 决策点（不在本清单动手）**：若产品要求某检查升 error（如 comma_chain 严重「一逗到底」、sense_density 过低），须单独拍板并据矩阵定义 error 边界——列为产品决策，非机械标定。
- **exclamation_quota 实测 0 命中**：默认值保留 10/5（与现状一致），待更多感叹号样本再标。
- **落点 A 生效路径**：DEFAULT_THRESHOLDS 仍硬编码为回退；`知识库/阈值标定/default.json` 可覆盖其中任意字段（见 §5），实现「KB 优先、硬编码兜底」。

## 5. 2D 落点 A：KB 作单一标定源
### 5.1 新建 `知识库/阈值标定/default.json`
结构：`{ "thresholds": { "senseDensityMin": 0.02, "commaChainRatioWarn": 3.2, ...16 字段 } }`（仅含本清单新增 16 字段；DEFAULT_THRESHOLDS 仍硬编码为回退）。

### 5.2 加载器 `源码/kb-thresholds.ts`（新建）
导出 `async function loadDefaultThresholds(): Promise<Thresholds>`：读 `知识库/阈值标定/default.json`（相对引擎根或配置目录），best-effort 深合并到 `DEFAULT_THRESHOLDS`；缺文件 / JSON 解析失败 → 返回 `DEFAULT_THRESHOLDS`。

### 5.3 接线（唯一侵入点）
`mergeConfig` 首调点在 `源码/gwe-engine.ts:750`（`this.merged = mergeConfig({...})`）。改为：先 `const base = await loadDefaultThresholds();`，再把 `mergeConfig` 第1层 `let thresholds = { ...DEFAULT_THRESHOLDS }`（config-merger.ts:134）替换为 `{ ...base }`。无 LLM / 无文件时降级回退，零回归。
> cli 入口（检测工具/checkers.ts 等独立调用 mergeConfig 处）若另起阈值，同样接 base——代码方核 `grep mergeConfig(` 全调用点统一注入。

### 5.4 验证
- `tsc --noEmit` 过滤改动文件 = 0 错。
- 改 default.json 某值（如 senseDensityMin→0.05）→ 重跑 `检测工具/health-report.ts` 矩阵应反映该检查阈值变化。
- 删 default.json → 回退 DEFAULT_THRESHOLDS（矩阵与阶段一基线一致）。

## 6. 2E 扩面（独立一轮，不在本清单动手）
49 内联 ruleId 中，除本清单 8 个 `checks/*.ts` 外，大量 **inline function 签名 `(text, violations)` 不收 thresholds、魔法数硬编码函数体**：golden_300 / opening_impact / opening_too_long / opening_weak_adverbial / twist_gap / ending_* / cliché_phrases / fake_reactions / sensory_balance / hook_concreteness / simile_density / unnecessary_english 等（checker.ts 内联，grep `ruleId:` 实锤 49）。收编须给这些 inline function 加 `thresholds` 参数（同步改 checker.ts 调用点签名），工作量大、回归面宽，单列「阶段二·扩面」轮次。

## 7. 验证门禁（动手后）
- tsc 过滤改动文件 = 0 错。
- 复用 `检测工具/health-report.ts` 重跑 26 章 → 矩阵 violationCounts 与阶段一基线比对（仅口径变化，应无意外 error 新增）。
- 代码方独立 fact-check（照例「你已核的我要实地核一遍再信」）。

## 8. 偏差注记
- 原 ③ 文档 §3.1「error 取达标章上界」因实测 8 ruleId error 全 0 不成立，已修正为 relocate（见 §1.4 / §4）。
- ③ 文档 §3.2 建议的 snake 风字段名（commaRatioMax 等）→ 实测 Thresholds 全 camelCase，已统一改 camelCase。
- 早年记「字数字段在 MergedConfig.wordCount（:299）」已证误并改 MEMORY.md（见阶段二前置核查日志 2026-08-25）。

---

## 9. 落地记录（2026-08-25，代码方=助手代执行）

### 9.1 实际改动文件
- `源码/types.ts`：2A —— `Thresholds` 接口加 16 可选字段(:102-139 后)；`DEFAULT_THRESHOLDS` 加同名字段默认值(:141-162 后)。
- `源码/checks/check-comma-chain.ts`：2B —— `_thresholds`→`thresholds` + :23/:38 改读。
- `源码/checks/check-data-anchor.ts`：2B —— :22/:33 改读（参数已是 `thresholds`）。
- `源码/checks/check-exclamation-quota.ts`：2B —— `_thresholds`→`thresholds` + :18/:26 改读。
- `源码/checks/check-forbidden-char.ts`：2B —— `_thresholds`→`thresholds` + :37 改读。
- `源码/checks/check-sentence-waveform.ts`：2B —— `_thresholds`→`thresholds` + :26/:42 改读（:40 `if (diff < 3)` 未标定，按范围保留字面量）。
- `源码/checks/check-sense-density.ts`：2B —— :20/:33 改读（参数已是 `thresholds`）。
- `源码/checks/check-character-voice.ts`：2B —— `_thresholds`→`thresholds` + :15/:20 改读。
- `源码/checks/check-action-rollcall.ts`：2B —— `_thresholds`→`thresholds` + :27 改读。
- `源码/kb-thresholds.ts`：2D 新建 —— `loadKbDefaultThresholds()`（同步 best-effort 合并 DEFAULT_THRESHOLDS，回退安全，进程缓存一次）。
- `知识库/阈值标定/default.json`：2D 新建 —— 16 字段，值=原魔法数（KB 作单一标定源）。
- `源码/config-merger.ts`：2D —— 模块加载 `const KB_DEFAULT_THRESHOLDS = loadKbDefaultThresholds()` 替换 mergeConfig 第1层 `{...DEFAULT_THRESHOLDS}`。
- `检测工具/health-report.ts`：2D —— `R1_MERGED_CONFIG.thresholds` 改走 `loadKbDefaultThresholds()`，使体检器也反映 KB 源。

### 9.2 偏离清单 §5.3（主动决策，目标一致）
清单 §5.3 建议 `async loadDefaultThresholds` + 在 `gwe-engine.ts:750` 前 `await` 注入 base（需把 `ensureMerged()` 改 async、7 处同步调用点全改）。实际改为**同步模块加载 seed**（config-merger.ts 模块加载时一次性 seed）→ 覆盖 mergeConfig 全部调用方（含 CLI 检测工具/checkers.ts），侵入更小、覆盖更全、零 async 回归。已在 `kb-thresholds.ts` 头注释声明。若后续坚持 async 注入方案，可另开一轮调整，不影响当前行为。

### 9.3 验证门禁结果（全绿）
1. `npx tsc --noEmit`（项目 tsconfig，窄 include）= **0 类型错误**；广树临时 tsconfig 过滤本任务改动文件 = **0 错**（其余 _archive/writing/engine/cooling/index/kb-loader 报错均为预现存、不在 build include，与本任务无关）。
2. 复用 `检测工具/health-report.ts` 重跑 26 章矩阵，与基线 `health-matrix.json` **逐章逐字段 0 差异**（srcViol/cliViol/violationCounts 全一致）→ 2C relocate 行为零变化坐实。
3. KB 源链路实证：临时改 `default.json` `senseDensityMin` 0.02→0.05，重跑 `sense_density` warning 由 20→22，证 KB 真生效；已还原为 0.02。
4. `mergeConfig` 实跑 seed 正常（senseDensityMin=0.02、commaChainRatioWarn=3.2、actionRollcallRepeatMax=5），无循环/import 错误。

### 9.4 待办
- 用户作独立审查方 fact-check（照例"你已核的我要实地核一遍再信"）。
- 2E 扩面：49 内联 ruleId 中大量 inline function 签名 `(text, violations)` 不收 thresholds（golden_300/opening_impact/twist_gap/ending_*/cliché_phrases/fake_reactions/sensory_balance 等），须改 `checker.ts` 调用点签名 + 给这些 inline function 加 `thresholds` 参数，工作量与回归面单列一轮拍板。
