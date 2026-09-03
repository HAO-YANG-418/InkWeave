# InkWeave v2 · ①-C D-SMOOTH 语义顺滑层方案

> 文档性质：方案方交付物（写 .md，不碰 .ts）。代码方拍板后动手。
> 关联：①-C = 三件待办中"LLM 语义层 D-SMOOTH（语义顺滑/perplexity）"。
> 前序已闭环：R4 字数门禁 / R3 接线 / ①-B 升 error 逼自纠 / R1 CLI 接生成时树 / ② 反向闭环接生成循环。
> 本方案事实基线：2026-08-24 实地核真实代码（非记忆推断）。

---

## 0. 为什么是 ①-C 而不是 ③（拍板依据）

用户授权"哪个好就按哪个来"。实地核代码后拍板 ①-C，理由：

| 维度 | ①-C D-SMOOTH | ③ KB 阈值标定 |
|---|---|---|
| 前置条件 | LLM 通道已存在（`llm-helper.ts`）、检测器注册表已存在（`checks/index.ts` + `checker-registry.ts`）、自纠闭环已存在（`reflection/engine.ts`）。**前置全绿，可立即开干**。 | 无数值型阈值文件（KB 是定性手册+题材预设）；无现成"各章体检数值表"（`裂日-第一卷质量报告/` 空）。**输入数据尚未生产，是两阶段任务**。 |
| 依赖外部数据 | 否。纯代码层新增。 | 是。须先生产双树体检表，否则标定无据。 |
| 闭环收益 | 直接进 `reflection` 自纠，逼生成侧写得更顺。 | 调参优化，依赖 ①-C + 双树体检表才有标定依据。 |
| 给 ③ 的反哺 | ①-C 落地后顺手产出"顺滑度维度实测数据"，正是 ③ 标定所需输入之一。 | 不反哺 ①-C。 |

**结论**：①-C 前置干净、不卡外部、能直接闭环；③ 顺序上应排在 ①-C + 双树体检表之后。先干 ①-C。

---

## 1. 定位：D-SMOOTH 解决什么、不解决什么

**已存在的 `检测工具/semantic-check.ts`（v5.1，297 行）** 解决的是**长程一致性**：
- 角色性格/立场/能力漂移（OOC）、设定逻辑矛盾、因果断链、伏笔逻辑漏洞。
- 全部 warning 级、降级安全、可插拔 LLM。
- **它不覆盖"单章内句式顺滑度 / 困惑度（perplexity）"**——那是另一种 AI 味来源（机械排比、重复衔接词、句式单调导致的阅读卡顿）。

**D-SMOOTH 补的是"单章内语义顺滑度"这一层**：
- 检测 AI 味的"顺滑度"维度：句式节奏单调、衔接词堆砌、同构反复、困惑度偏高的表达。
- 走 `源码/checks/` 生成时套件（与 R3 升 error 逼自纠同一棵树），不是 `检测工具/` 验收树。
- 与 `semantic-check.ts` 职责正交：**D-SMOOTH = 单章内顺滑度；semantic-check = 跨章一致性**。两者并存不冲突。

> 关键纠偏（来自历史记忆）：早年"①-C"曾被设想为"LLM 层唯一新增"，并认为正则层已冗余。实地核后修正——正则层（checks/ 内 13 个）仍全是规则型，无 LLM 语义顺滑检测器；D-SMOOTH 是**全新新增**，挂在 `源码/checks/` 套件，接 `reflection` 闭环。

---

## 2. 落点（实地核到的真实接口）

### 2.1 新增文件
- `源码/checks/check-semantic-smoothness.ts`
  - 导出 `checkSemanticSmoothness(params: CheckParams): RuleViolation[]`
  - 内部：若 `hasLLM(llm)` 为假 → 直接返回 `[]`（降级安全，不阻断门禁）。
  - LLM 调用复用 `llm-helper.ts` 三件套（已核真身）：
    - `llmJson<T>(llm, messages, options?)` — `源码/llm-helper.ts:115`，`llm=null` 自动返 `null`。
    - `llmText(llm, messages, options?)` — `:172`。
    - `hasLLM(llm)` — `:195`，判通道是否可用。
  - LLM 输入：截断后的本章文本（对齐 `semantic-check.ts` 的"设定/上章/本章均截断，避免爆 token"原则）。
  - LLM 输出：JSON（`llmJson` 已强制 JSON + 解析失败安全降级），结构见 §3.3。

### 2.2 注册（两处，已核真身）
- `源码/checks/index.ts:23` 后追加一行：`export { checkSemanticSmoothness } from './check-semantic-smoothness';`
- `源码/checks/checker-registry.ts`：`CheckEntry = { id, name, priority, fn }`（`checker-registry.ts:11`）。**注：此为方案阶段设想；实际落地采用方案 B，D-SMOOTH 不经 `registerCheck` 同步注册（grep `checker-registry.ts` 零命中），而是由 `reflectAsync` 直接 `await checkSemanticSmoothness` 调用，见 §2.4。priority 字符串枚举说明见 §4。**
  - `CheckFn` 签名（已核）：`(params: CheckParams) => RuleViolation[]`（`checker-registry.ts:19`）。
  - `CheckParams`（已核全字段）：`{ text, stats: TextStats, thresholds: Thresholds, vocabulary: MergedVocabulary, violations: RuleViolation[] }`（`checker-registry.ts:20-25`）。

### 2.3 阈值接口（走 Thresholds 传参，不硬编码）
- `Thresholds` 定义在 `源码/types.ts:102`，末字段为 `notShiErrorMin?`（方案 B 口径）。
- **新增字段**：`maxSmoothnessViolations?: number`（每章允许的顺滑度违规上限，超则报 error 逼自纠；默认建议 3，对齐 notShiErrorMin 方案 B 口径）。
- `DEFAULT_THRESHOLDS`（`源码/types.ts:152` 起）同步补默认值。
- 检测器签名 `checkSemanticSmoothness(text, llm, thresholds?)`：从第三个参数 `thresholds?.maxSmoothnessViolations` 读取（**不**走同步 `CheckFn(params: CheckParams)`，因 LLM 异步）；`reflectAsync` 调用处未传 thresholds 时回退 `DEFAULT_THRESHOLDS.maxSmoothnessViolations`（默认 3），不写死。

### 2.4 自纠闭环（落地采用方案 B：reflectAsync 内 await 挂接）
- `reflection/engine.ts:476`：`passed = overallScore >= qualityGate && !hasCheckerError`
- `:489-490`：`!passed` → `generateRewriteInstructions(concerns)` → `:513-535` 循环重写（受 `maxAutoRewrite` 限）。
- **真实约束（落地实测，推翻原"零改动"假设）**：`check()`/`checkContent`/`runChecker` 整条是**同步**的（`writing/engine.ts:302` 同步签名；`orchestrator.runChecker:625` 同步调），而 D-SMOOTH 的 LLM 调用必须 `await`——**塞不进同步 check() 链**。原方案"reflection 零改动消费同步 violation"不成立。
- **方案 B 落点（已落地）**：D-SMOOTH 在 `reflection/engine.ts` 的 `reflectAsync`（:569，async）内 `await checkSemanticSmoothness(input.content, this.llm)`，结果并入 `mergedViolations`（= 传入 `checkerViolations` + D-SMOOTH 结果），经既有 `hasCheckerError`（:610-623，混合分支）逻辑逼生成自纠。**不改 check()/runChecker 同步链（R3 零回归），不碰 `autoRefine` 同步分支（`autoRefineAsync`→`reflectAsync` 已覆盖）**。

---

## 3. 接口契约（写死真实字段，禁止凭记忆）

### 3.1 RuleViolation（真实定义，`源码/types.ts:341`）
```ts
export interface RuleViolation {
  ruleId: string;            // 如 'semantic-smoothness'
  ruleName: string;          // 如 '语义顺滑度'
  message: string;           // 人类可读问题描述
  severity: 'error' | 'warning' | 'info';   // 注：字符串枚举，非 number
  position?: { from: number; to: number };
  suggestion?: string;
}
```
> 纠偏：早期曾在另一文件 `reflection/types.ts:50` 看到 `severity: number`，那是 reflection 内部另一套，与 `checks` 套件的 `RuleViolation`（`types.ts:341`）**不混用**。D-SMOOTH 用 `types.ts:341` 这版。

### 3.2 CheckParams（真实，`checker-registry.ts:20-25`）
```ts
export interface CheckParams {
  text: string;
  stats: TextStats;
  thresholds: Thresholds;
  vocabulary: MergedVocabulary;
  violations: RuleViolation[];
}
```

> 注：D-SMOOTH **不**走同步 `CheckFn(params: CheckParams)` 签名（LLM 异步塞不进同步 check() 链），而是独立 async 函数 `checkSemanticSmoothness(text, llm, thresholds?): Promise<RuleViolation[]>`，由 `reflectAsync` 直接 await 调用。

### 3.3 LLM 输出契约（D-SMOOTH 专用 JSON schema，已落地对齐）
```json
{
  "violations": [
    { "quote": "<不顺的原文片段>",
      "issue": "<为什么不顺滑（拗口/句式重复/逻辑跳跃…）>",
      "suggestion": "<改写建议>" }
  ]
}
```
- LLM 返回 `null` 或解析失败 → 安全降级返 `[]`，不报错、不阻断。`llmJson` 自带 `extractJSON`（支持 ```json 代码块与裸 JSON）+ 重试2次。

### 3.4 severity 策略（对齐历史拍板口径）
- 单章 D-SMOOTH 返回 `violations.length <= maxSmoothnessViolations`（默认 3）→ 不报 error。
- 超出部分：前 `maxSmoothnessViolations` 条给 `warning`，超出条给 `error`（逼自纠）。
- 无 LLM 配置（`hasLLM` 假）→ 返 `[]`，整层静默跳过（与 `semantic-check.ts` 降级原则一致）。

---

## 4. 优先级（priority）落点

> **方案偏差校正（2026-08-24 代码方独立复验后修正）**：原写"开干前核 `checker-registry.ts` 的 priority 分布定 D-SMOOTH 的优先级**数值**"——**错**。`CheckEntry.priority` 是**字符串枚举**（`'core' | 'quality' | 'release' | 'migrated'`，`checker-registry.ts:15`），不是数字。`priorityOrder`（:31-36）= core=0 < quality=1 < release=2 < migrated=3。`runAllChecks`（:68-90）按 priority 排序后顺序跑，每个 entry 失败被 try/catch 静默降级（:84-86）。下文已按真实类型修正。

`checker-registry.ts` 的 `CheckEntry.priority` 决定执行顺序（字符串枚举，非数字）。实测现有 13 个检测器里 `sense-density`/`not-shi-pattern`/`comma-chain` 等质量类归 `quality`（或 `core`）。建议：
- D-SMOOTH 是"单章顺滑度"，性质与 `sense-density`（感官密度）同类，都属生成质量维度 → **定 `priority: 'quality'`** 最合理（与现有质量类检测器同批跑，顺序无强依赖）。
- 参照 `semantic-check.ts` 设计："增强层，不是规则层，warning 级、降级安全"——但 D-SMOOTH 超出 `maxSmoothnessViolations` 部分给 `error` 逼自纠（见 §3.4），与纯 warning 的 semantic-check 不同。
- 注册调用设想：`registerCheck({ id: 'semantic_smoothness', name: '语义顺滑度', fn: checkSemanticSmoothness, priority: 'quality' })`。**实际落地采用方案 B，不经此同步注册**——D-SMOOTH 是 async 增强层，由 `reflectAsync` 直接 `await` 调用（见 §2.4），与 `semantic-check.ts` 在 `检测工具/` 侧独立挂接的定位一致。

---

## 5. 与 ③ 的衔接（关键）

①-C 落地后，D-SMOOTH 会在每次生成时产出"顺滑度违规数"——这本身就是 ③（KB 阈值标定）所需的**实测维度之一**：
- ③ 标定 `maxSmoothnessViolations` 默认值，正应基于"十章实战跑 D-SMOOTH 后的违规分布"来定，而非拍脑袋。
- 故执行顺序：**①-C 落地 → 跑十章取顺滑度实测 → ③ 据此标定阈值**。
- ③ 的另一输入"双树体检表"（各章规则层数值）目前缺失，须另行生产（不在本方案范围，列为 ③ 前置）。

---

## 6. 验收（代码方落地后，方案方 fact-check）

| 项 | 核法 | 通过标准 |
|---|---|---|
| 新文件真身 | 读 `源码/checks/check-semantic-smoothness.ts` | 导出 async `checkSemanticSmoothness(text, llm, thresholds?): Promise<RuleViolation[]>`，含 `hasLLM` 降级分支（llm=null→[]） |
| 注册真身 | 读 `checks/index.ts` | `check-semantic-smoothness` 在 index.ts export；**不经 `checker-registry` 同步 `registerChecks` 数组**（那是 check() 同步链，D-SMOOTH 是 async 增强层挂 reflectAsync，与 semantic-check 定位一致） |
| LLM 复用真身 | grep `llmJson\|llmText\|hasLLM` 于新文件 | 引自 `llm-helper`，非新造通道 |
| 阈值传参真身 | 读 `types.ts` Thresholds + DEFAULT_THRESHOLDS | 新增 `maxSmoothnessViolations?` 且两处同步 |
| 闭环真身 | 读 `reflection/engine.ts` | 原"零改动"假设不成立（check() 同步链塞不进 LLM 异步）；**落地采用方案 B：reflectAsync 内 await D-SMOOTH 并入 mergedViolations，经 hasCheckerError 逼自纠** |
| 冒烟 | 新增 `检测工具/d_smooth_smoke.ts` | 无 LLM 配置→返 `[]`；有 mock LLM（name≠'mock'）→超阈值报 error、未超全 warning；编译零新错 |
| 文档对齐 | 本方案 §2/§3 与真实代码三处一致 | 无死通道表述、无行号漂移 |

---

## 7. 风险与对策

1. **LLM 成本/延迟**：截断文本 + `maxTokens` 限幅（复用 `llmJson` 默认）；无配置静默跳过。
2. **语义误判废章**：severity 策略保底——超阈值才 error，且 `reflection` 有 `maxAutoRewrite` 上限防死循环。
3. **与 semantic-check 重复烧 token**：职责正交（单章顺滑 vs 跨章一致），且 D-SMOOTH 在生成时树、semantic-check 在验收树，不在同一次调用。
4. **历史 tsc 债务**：`../technique/*`、`../anti-pattern/*` 在 `_archive` 移走后仍有残留 import 报错，与本次无关；fact-check 用 grep 过滤确认改动文件零新错。

---

## 8. 待代码方拍板后执行清单（占位，拍板后填真实行号）

- [ ] 新增 `源码/checks/check-semantic-smoothness.ts`
- [ ] `源码/checks/index.ts` 追加 export
- [ ] `源码/checks/checker-registry.ts` 注册 + `priority: 'quality'`（字符串枚举，非数字）
- [ ] `源码/types.ts` Thresholds + DEFAULT_THRESHOLDS 加 `maxSmoothnessViolations?`
- [x] 冒烟脚本 `检测工具/d_smooth_smoke.ts`（已落地，11 项断言全绿）
- [ ] 编译 + 冒烟全绿
- [ ] 回方案方 fact-check

> **方案偏差已校正**（2026-08-24 代码方独立复验）：原 §4/§8 写"定 priority **数值**"——实测 `CheckEntry.priority` 是字符串枚举 `'core'|'quality'|'release'|'migrated'`（checker-registry.ts:15），非数字。D-SMOOTH 落 `priority: 'quality'`。其余契约（RuleViolation 字符串枚举 / llmJson 降级 / CheckParams 含 thresholds / checks/index.ts 具名 export）经复验全部属实零偏差。
