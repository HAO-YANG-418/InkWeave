# InkWeave v2 ③ KB 阈值标定方案（2026-08-25）

> 方案方交付物（写 .md，不碰 .ts）。本方案所有落点/字段/行号均经实地核真实代码，非记忆推断。
> 前置：①-C（D-SMOOTH 语义顺滑层）已落地并 fact-check 全绿，其顺滑违规数是本方案阶段一矩阵的关键维度之一。

## 0. 总目标

把散落在 `源码/checks/*.ts` 的**硬编码魔法数字阈值**收敛成 `知识库/` 下的**数值标定层**，让 KB 从「定性手册」长出「定量标定」能力。分两阶段：

- **阶段一（造输入）**：双树体检导出器——把已写章节过**生成时树 + CLI 树**，导出每章数值矩阵。这是阶段二能「标定有据」的硬前置。
- **阶段二（标定）**：用阶段一实测分布反推默认阈值，扩展 `Thresholds` 类型、让 8 处硬编码 check 改读 `Thresholds`，默认值收敛到 `知识库/` 数值文件。

---

## 1. 事实基线（实地核，非记忆）

### 1.1 双树现状与桥接真身

| 项 | 真实状态 | 实地锚点 |
|---|---|---|
| 生成时树 | `源码/checker.ts` 的 `check()` 跑**两类**：(a) `源码/checks/*.ts` 12 个具名检测器（registerCheck 注册）；(b) **内联 40+ 阈值字段检查**（grep 实锤 49 个 `ruleId:`，例 `min_anchors`/`max_paragraph_length`/`sight_ratio`/`cliche_reaction`/`golden_300`/`word_count_short`/`twist_gap` 等）。**阶段二标定基数 = ~49 全集，非 12**。见 §1.4 | `检测工具/check-chapter.ts:29` `import { check as runSourceTreeCheckRaw } from '../源码/checker.js'` |
| CLI 树 | `检测工具/checkers.ts` 内联重实现（与生成时树**同名不同实现**） | `检测工具/checkers.ts:210-234` 注册 `comma_chain/sense_density/data_anchor/anchor_density/word_count/not_shi_pattern` 等 |
| **双树桥接已存在** | `check-chapter.ts` 已 merge 双树 | `检测工具/check-chapter.ts:49` `runSourceTreeCheck(text, targetWords)` + `:172` `[...cliViolations, ...runSourceTreeCheck(text, targetWords)]` |
| 桥接用的 config | `R1_MERGED_CONFIG`（读 `DEFAULT_THRESHOLDS`，`disabledChecks: new Set()` 空——不跳过任何检测器） | `检测工具/check-chapter.ts:35-48` |
| **D-SMOOTH 不在 check() 链路** | ①-C 经 `reflectAsync` await，未走 `registerCheck`/`check()` | 阶段一导出器须**单独 `await checkSemanticSmoothness`** 取顺滑违规数 |
| **check-all.ts 仅 CLI 单树** | 未桥接双树（只调 `checkChapter`/`checkChaptersAsync`） | `检测工具/check-all.ts:20,403,438` |
| 数值维度来源 A | `computeTextStats` 产出 | `源码/checks/text-stats.ts:12` → `totalWords/avgParagraphLength/sentenceCount/avgSentenceLength/shortSentenceRatio/dialogueRatio/sensoryMentions` |
| 数值维度来源 B | `checkers.ts` 的 `Stats` 类型 | `检测工具/checkers.ts:47-50` `anchorCount/sensoryMentions/fillerCount/dialogueRatio` + `:79` `conceptPacing` |

### 1.2 硬编码阈值散落真身（阶段二待收敛，8 处）

grep 实地核到（`源码/checks/`）：

| 文件 | 硬编码魔法数 | 行号 |
|---|---|---|
| `check-comma-chain.ts` | `ratio > 3.2`（逗号/句号比 warning）、`commas >= 8`（长句） | `:23`、`:38` |
| `check-data-anchor.ts` | `density > 5`（error）、`density < 0.5 && totalWords > 2000`（warning） | `:22`、`:33` |
| `check-exclamation-quota.ts` | `exclamationCount > 10`（error）、`> 5`（warning） | `:18`、`:26` |
| `check-forbidden-char.ts` | `count > 5 ? 'warning' : 'info'` | `:37` |
| `check-sentence-waveform.ts` | `stdDev < 5 && mean > 10`、`diff < 3`、`sameRun >= 5` | `:26`、`:40`、`:42` |
| `check-sense-density.ts` | `density < 0.02 && totalWords > 500`（error）、`maxSense/minSense > 5`（warning） | `:20`、`:33` |
| `check-character-voice.ts` | `dialogueRatio < 0.05`（跳过）、`tagCount < 3 && dialogueRatio > 0.15` | `:15`、`:20` |
| `check-action-rollcall.ts` | `count >= 5`（动词重复点名） | `:27` |

> **已读 `Thresholds` 的两处（不需收敛，验证模式正确）**：`check-not-shi-pattern.ts:24` `thresholds.notShiErrorMin ?? 3`（方案 B）；`check-semantic-smoothness.ts:72` `thresholds?.maxSmoothnessViolations ?? DEFAULT_MAX_SMOOTHNESS`（①-C）。这证明 `Thresholds` 传参模式可行，阶段二照此扩展即可。

### 1.3 KB 现状（标定落点）

- `知识库/数据/`：定性手册（`情节规则.md`/`情感曲线.md` 等）+ `知识库/预设/`：10 个题材预设（玄幻修仙-起点V3.1 等）。
- **无任何数值型阈值文件**；检测器阈值硬编码在 `源码/checks/*.ts`（见 1.2）。
- `检测工具/knowledge/` 现有 `chapter-types.ts`/`conflict-types.ts`（定性类型，非数值）。

---

### 1.4 生成时树内联阈值检查真身（阶段二标定基数，2026-08-25 代码方核到）

`源码/checker.ts` 的 `check()` 除调 `源码/checks/*.ts` 的 12 个具名检测器外，**还内联跑了 49 个 `ruleId:` 阈值字段检查**（grep 实锤 `rg -c "ruleId:/" 源码/checker.ts` = 49）。这是 2026-08-25 代码方落阶段一时发现的真实基数——原 §1.1「生成时树 = checks/*.ts（12 个）」严重低估，已更正。

实测 `检测工具/health-matrix.json`（26 章）捕获的 **39 个 distinct ruleId** 全集（归一映射后）：

- **生成时树内联阈值类**：`min_anchors` / `anchors_per_words` / `max_anchor_gap` / `max_filler_words` / `max_dash_count` / `max_paragraph_length` / `max_sentence_length` / `sight_ratio` / `opening_no_body` / `opening_too_long` / `opening_weak_adverbial` / `cliche_reaction` / `simile_density` / `simile_density_global` / `twist_gap` / `golden_300` / `fake_hook` / `cliché_phrases` / `fake_reactions` / `sensory_balance` / `hook_concreteness` / `unnecessary_english` / `word_count_short` / `word_count_below` / `short_sentence_fragment` / `short_sentence_ratio`
- **具名检测器类**（checks/*.ts）：`comma_chain` / `sense_density` / `data_anchor` / `sentence_waveform` / `forbidden_char` / `character_voice` / `action_rollcall` / `exclamation_quota` / `not_shi_pattern` / `fragmented_sentences`
- **CLI 树独有**：`dialogue_overload_moderate` / `dialogue_overload_severe` / `dialogue_conflict` / `max_dialogue_continuous` / `emotion_arc` / `texture_variety` / `style_stacking_de` / `style_stacking_name` / `style_stacking_verb` / `reader_burden_para` / `scene_count_moderate`

> **阶段二标定基数**：以本矩阵实测 distinct ruleId 全集（39+，潜在 ~49）为标定对象，而非仅 §1.2 列的 8 处硬编码。§1.2 的 8 处是「散落魔法数最集中」的代表，标定时应覆盖**全 ruleId**。
> **双树同 key 去重**：`not_shi_pattern` / `word_count_short` 等两树同 key 已在 `mergeViolationCounts` 自动合并；但「同章同逻辑被两树各计一次」的潜在重复，是阶段二标定时的去重决策点（非阶段一 bug）。


## 2. 阶段一：双树体检导出器

### 2.1 落点（待代码方核后确认具体文件名）

新建 `检测工具/health-report.ts`（独立 CLI，不污染 `check-all.ts` 单树逻辑），或扩展 `check-chapter.ts` 的跨章模式。推荐**独立新脚本**，因 `check-all.ts` 当前仅 CLI 单树、改动面大。

### 2.2 复用真身（不重造）

```
对每章 .md：
  text = 读文件
  // 生成时树（已桥接在 check-chapter.ts，复用其 runSourceTreeCheck）
  sourceViolations = runSourceTreeCheck(text, targetWords)   // 检测工具/check-chapter.ts:49
  // CLI 树
  { stats, violations: cliViolations } = checkChapter(text, targetWords)  // 检测工具/checkers.ts
  // 数值维度
  ts = computeTextStats(text)   // 源码/checks/text-stats.ts:12
  // D-SMOOTH 单独 await（不在 check() 链路）
  smoothness = await checkSemanticSmoothness(text, llm)  // 源码/checks/check-semantic-smoothness.ts
```

### 2.3 输出 schema（每章数值矩阵，JSON）

```jsonc
{
  "chapter": "第N章",
  "wordCount": 3050,
  "dialogueRatio": 0.62,
  "sensoryMentions": { "视觉": 12, "听觉": 3, "触觉": 1 },
  "anchorCount": 8,
  "fillerCount": 2,
  "violationCounts": {
    "comma_chain":        { "error": 0, "warning": 2, "info": 0 },
    "sense_density":      { "error": 1, "warning": 0, "info": 0 },
    "not_shi_pattern":    { "error": 0, "warning": 1, "info": 0 },
    "data_anchor":        { "error": 0, "warning": 1, "info": 0 },
    "exclamation_quota":  { "error": 0, "warning": 0, "info": 0 },
    "sentence_waveform":  { "error": 0, "warning": 1, "info": 0 },
    "forbidden_char":     { "error": 0, "warning": 0, "info": 1 },
    "character_voice":    { "error": 0, "warning": 0, "info": 0 },
    "action_rollcall":    { "error": 0, "warning": 0, "info": 0 }
  },
  "smoothness": { "error": 1, "warning": 2, "info": 0 },
  "sourceTreeTotal": 6,
  "cliTreeTotal": 4
}
```

> ruleId 命名以双树实际产出为准（CLI 树 `检测工具/checkers.ts:210-234` 用 `comma_chain/sense_density/...`，生成时树 `源码/checks/checker-registry.ts` 用 `semantic_smoothness` 等）。导出器须做 ruleId 归一映射，避免双树同名不同实现的重复计数——**具体映射表待代码方核后填**。

### 2.4 输出落点

扫描章节目录 → 输出 `health-matrix.json`（单文件，含全部章节数组）+ 可选 `--csv` 平面表。落点建议 `检测工具/knowledge/` 或项目根 `reports/`（待代码方核确认，不臆造目录）。

---

## 3. 阶段二：阈值收敛标定

### 3.1 反推默认阈值

用阶段一 `health-matrix.json` 的实测分布（各章 violationCounts + 数值维度），按以下原则反推 `DEFAULT_THRESHOLDS`：
- **error 级阈值**：取「能通过门禁的章」分布的上界（即大多数达标章不会触发的临界点）。
- **warning 级阈值**：取分布均值 ± 1σ。
- **对齐既有契约**：`notShiErrorMin=3`（方案 B）、`maxSmoothnessViolations=3`（①-C）保持不动，作为标定基准锚。

### 3.2 扩展 `Thresholds` 类型（`源码/types.ts`）

在现有字段（`anchorMin`/`fillerMax`/段落/对话/句长/信息密度/五感/`notShiErrorMin`/`maxSmoothnessViolations`）基础上新增（**具体字段名待代码方核 `Thresholds` 全字段后定**，以下为建议）：

```
commaRatioMax?: number        // <- check-comma-chain.ts:23 的 3.2
senseDensityMin?: number      // <- check-sense-density.ts:20 的 0.02
dataAnchorDensityMax?: number // <- check-data-anchor.ts:22 的 5
dataAnchorDensityMin?: number // <- check-data-anchor.ts:33 的 0.5
exclamationMax?: number       // <- check-exclamation-quota.ts:18 的 10
sentenceWaveStdDevMin?: number// <- check-sentence-waveform.ts:26 的 5
forbiddenCharWarn?: number    // <- check-forbidden-char.ts:37 的 5
actionRollcallMin?: number    // <- check-action-rollcall.ts:27 的 5
```

### 3.3 8 处 check 改读 `Thresholds`

逐文件将硬编码魔法数替换为 `thresholds.xxx ?? 原默认值`（与 `not-shi`/`semantic-smoothness` 同模式），消除散落硬编码。

### 3.4 默认值收敛到 `知识库/`

将反推后的数值写入 `知识库/` 下数值文件（建议 `知识库/数据/thresholds.json` 或新建 `知识库/阈值标定/default.json`，**路径待代码方核 `知识库/` 结构后定**）。加载逻辑：`DEFAULT_THRESHOLDS` 优先读 `知识库/` 数值文件、缺省回退硬编码——让 KB 成为单一标定源。

---

## 4. 接口契约（真实字段，防记忆偏差）

- `computeTextStats(text): TextStats`（`源码/checks/text-stats.ts:12`）→ `totalWords/avgParagraphLength/sentenceCount/avgSentenceLength/shortSentenceRatio/dialogueRatio/sensoryMentions`。
- `Violation`（`源码/types.ts:341`）= `{ ruleId, ruleName, message, severity: 'error'|'warning'|'info', position?, suggestion? }`（severity 字符串枚举，非 number）。
- `runSourceTreeCheck(text, targetWords?): Violation[]`（`检测工具/check-chapter.ts:49`），内部调 `源码/checker.ts` 的 `check()`，用 `R1_MERGED_CONFIG`。
- `checkChapter(text, targetWords?)`（`检测工具/checkers.ts`）→ `{ stats: Stats, violations: Violation[] }`。
- `checkSemanticSmoothness(text, llm, thresholds?)`（`源码/checks/check-semantic-smoothness.ts`）→ `RuleViolation[]`，`hasLLM(llm)` 假静默返 `[]`，须 `await`。
- `Thresholds`（`源码/types.ts:102` 起）末字段 `notShiErrorMin?`/`maxSmoothnessViolations?`；新增字段见 §3.2。

---

## 5. 与既有能力衔接

- **①-C**：D-SMOOTH 顺滑违规数是矩阵 `smoothness` 维度，阶段二标定 `maxSmoothnessViolations` 默认值时有实测依据。
- **R1**：`runSourceTreeCheck` 已用 `R1_MERGED_CONFIG` 桥接双树，阶段一直接复用，零回归。
- **②**：反向闭环注入的 taboo 不影响体检数值（体检只读章节文本），互不影响。

---

## 6. 风险与降级

- **双树同名不同实现**：CLI 树与生成时树对同逻辑（如 sense_density）阈值可能不一致，导出器须做 ruleId 归一映射，否则阶段二标定会被重复/冲突数据污染。**映射表是阶段一的关键交付**，待代码方核双树 ruleId 真身后填。
- **D-SMOOTH 须 await**：导出器是 async 脚本，不能用同步 `runSourceTreeCheck` 一把梭——漏掉 `await checkSemanticSmoothness` 会导致 `smoothness` 维度恒为 `[]`。
- **无 LLM 降级**：`checkSemanticSmoothness` 在 `hasLLM` 假时返 `[]`（阶段一矩阵 `smoothness` 全 0 属正常，非 bug）；标定 `maxSmoothnessViolations` 时须区分「无 LLM 未测」与「有 LLM 实测」。
- **章节缺 `targetWords`**：`runSourceTreeCheck`/`checkChapter` 的 `targetWords` 影响字数类判定，导出器须传项目真实 target（如 3000），否则字数维度失真。

---

## 7. 待办清单（代码方核点已标）

- [ ] 核 `检测工具/check-chapter.ts` 的 `runSourceTreeCheck` 真实返回 + `R1_MERGED_CONFIG` 是否含 D-SMOOTH（结论：不含，须单独 await）
- [ ] 核双树 ruleId 真身，建归一映射表（阶段一关键）
- [ ] 核 `知识库/` 结构，定数值文件落点（§3.4）
- [ ] 核 `Thresholds` 全字段，定 §3.2 新增字段名
- [ ] 阶段一：新建 `检测工具/health-report.ts` + 输出 `health-matrix.json`
- [ ] 阶段一：编译零新错 + 跑《裂日》已写章导出验证
- [ ] 阶段二：从矩阵反推默认阈值 + 扩展 `Thresholds` + 8 处 check 改读 + 收敛到 `知识库/`
- [ ] 回方案方 fact-check

---

## 8. 偏差注记（与早年记忆对照）

- 早年记「①-C 是 LLM 层唯一新增、正则层已冗余」——已更正（见 ①-C 方案文档）。本方案再次确认：①-C 落地后 `源码/checks/` 仍 12 个规则型检测器 + 1 个 LLM 型（D-SMOOTH），正则层远未冗余，阶段二收敛的是**规则层硬编码阈值**，与 LLM 层正交。
- 早年记「CLI 验收树缺去 AI 味/钩子/感官真问题视图」——本方案确认：CLI 树（`checkers.ts`）与生成时树（`checks/*`）是同逻辑双实现，体检矩阵须合并双树才能看到全貌；单独看任一树都会漏维度。
- **2026-08-25 代码方核到、方案方已更正**：§1.1 原写「生成时树 = 源码/checks/*.ts（12 个检测器）」严重低估——`源码/checker.ts` 的 `check()` 还内联跑了 49 个 `ruleId:` 阈值字段检查（grep 实锤）。阶段二标定基数须按 `health-matrix.json` 实测 ~49 全集，而非 12。此发现源于代码方落阶段一实跑，已据真实代码修正 §1.1 + 新增 §1.4。
