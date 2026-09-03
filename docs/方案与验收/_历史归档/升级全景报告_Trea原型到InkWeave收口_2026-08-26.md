# 升级全景报告 · 从 Trea 原型到 InkWeave 收口（2026-08-19 ~ 08-26）

> 编制日期：2026-08-26｜编制方：方案方（基于项目记忆 + 跨会话历史检索 + 磁盘真身核对）
> 说明：用户要求"从之前 trea 到现在升级的完整详细报告"。经跨会话检索与项目记忆核对，**"Trea" 指 AI 视频剪辑工具（剪映插件 clip-assistant）的原型阶段，与 InkWeave 写作引擎是两条独立产品线**。本报告按"近期两条产品线的工程演进全景"解读；若你仅要 InkWeave 线，§3 即为完整闭环报告，可独立成立。

---

## 0. 范围与两条线总览

| 产品线 | 性质 | 本周期关键节点 | 状态 |
|---|---|---|---|
| **Trea / AI 视频剪辑工具**（clip-assistant，剪映插件） | 工具为核心、卖课为下游变现 | 08-23 PRD 评审 + 准备 Trea 原型 | 原型准备中，"sync later" 未续 |
| **InkWeave 写作引擎**（《裂日》测验载体） | 提升写作引擎 skill 能力 | D1–D6 修复 → 双树架构真相 → 三件老活 → ③KB 标定/2E → ①-C D-SMOOTH → A/B 量化 → 治本三组 → 反向闭环 v1 | **08-26 正式收口** |

贯穿全程的协作铁律：**代码方动手 + 方案方独立 fact-check、改前核真身、改后逐字钉死、不盲信口述/summary**（本周期多次救场，详见 §5）。

---

## 1. 第一条线：Trea / AI 视频剪辑工具原型（2026-08-23）

来源：跨会话检索到 `Clip-assistant PRD review`（2026-08-23 20:25），目的为"评审方案设计、准备 Trea 原型化"。

- **产品定位**：工具本身（非课程），定位"导演+剪辑老师"，下游变现渠道为卖课；MVP 范围 P1。
- **PRD 评审发现的 4 个硬问题**：
  1. 素材来源可验证性（source verification）缺失；
  2. 剪映 JSON 风险被低估（JianYing JSON 导入/导出不确定性）；
  3. "创意导演"语义层缺口解释不充分（creative director 在自动剪辑中的语义鸿沟）；
  4. 知识引擎工作量估算缺失。
- **遗漏项**：原 PRD 缺变现（monetization）章节。
- **用户授权动作**：AI 直接 patch 方案，5 项——新增变现章节、素材可验证性降级、JSON 风险降级、创意导演细化、知识引擎工作量补全。
- **待续状态**：记录"sync Trea work later"——截至本报告，**Trea 线未在本周期继续推进**，无代码/实测产物。

> 注：本线数据较薄（仅一次 PRD 评审会话），与 InkWeave 线无代码/架构耦合，属独立产品方向。

---

## 2. 第二条线总览：InkWeave 升级时间轴

| 日期 | 阶段 | 核心交付 | 真实数据/结论 |
|---|---|---|---|
| 08-19~08-22 | D1–D6 缺陷修复 + 双树架构真相 | 修 `检测工具/checkers.ts`/`pre-analysis.ts`；D2 切方案 B（≥3 error 才硬 ban） | D1–D6 全修；notX error 归零；剩 D4 字数 error 7 |
| 08-22~08-23 | 口径对齐 + 知识库强制一致性 | 铁则十九/二十升级为无条件强制；提炼"三件老活"清单 | 三件老活 = 检测双轨(正则+LLM+空洞度) / 反向闭环 / KB 阈值标定 |
| 08-23 | v2 执行清单立项 | 方向 A 拍板：双树 D2 对齐 + 补字数检查 + 升 error 逼自纠 | 落地顺序 R2→R4→R3→R1→②→①-C→③ |
| 08-24 | R2 收口 fact-check + R3 接线调研 | R2 正则修复验证 tsc 干净；R3 接线发现 orchestrator 不调 checker | 决策延后，先推进 R4 |
| 08-24~08-25 | ①-C D-SMOOTH 语义顺滑层 | 方案 B：`reflectAsync` 内 `await checkSemanticSmoothness` | 冒烟 11/11 通过；tsc 0 错；`maxSmoothnessViolations:3` |
| 08-24~08-25 | ③ KB 阈值标定（阶段一+二） | `health-report.ts` + `health-matrix.json`(26章)；2A–2D（16 字段 camelCase + KB 单一源） | 行为零变化；KB 实证 `sense_density` warning 20→22 |
| 08-25 | ③ 阶段二 2E 扩面 | 13 函数/32 字段外置 + line1638 `simileParaMinLen` 第 33 字段 | tsc 0；矩阵 0 差异；KB 实证 golden_300 8→16 |
| 08-25 | A/B 重生成量化立项 | 核真身：生成入口 `gwe write`、LLM 需真 key(Mock 不可用) | 方案落盘，待拍板 |
| 08-25 | 治本：铁则×检测器自相矛盾实证 | WorkBuddy 自身 AI 重写最烂 6 章 | 违规 200→106（↓47%）、逗号链 45→2（↓96%） |
| 08-25~08-26 | 治本三组（A/B/C） | A 组 .md 9 处软化 + B 组 .ts 13 处软化 + R4 复合门禁 + C 组 CLI 树 D4 #55 空心守卫 | 真实矩阵 `word_count_short` error **20→0** |
| 08-26 | 反向闭环 v1 | reactive（既有）+ 档1 全局矩阵注入 + 档2 回归自动化 + 基线保护约定 | 真实 26 章端到端 `exit 0` |

---

## 3. InkWeave 升级详细报告（闭环主线）

### 3.1 起源与架构真相（08-22~23）
- **双树架构**（2026-08-23 核实）：两套检测器树职责不同——
  - `源码/checks/`（生成时树，经 `checker.ts`）：26 项网文质量套件，已含全套去 AI 味+追读力检测器，但 D2 口径最松（warning/info 级）、**无字数检查**；
  - `检测工具/checkers.ts`（CLI 验收树）：D1–D6 迭代基础套，D2=方案 B、D4 字数<2700=error。**用户实际验收一直用这套**，故长期缺去 AI 味/钩子/感官真问题视图。
- **推论与治本方向**：生成时树全 warning/info → `passed` 恒 true → 生成循环不因 AI 味自纠；"写空"因生成时树无字数检查未被拦。治本 = 让 CLI 验收也走 `源码/checks/` + 双树 D2 对齐 + 补字数检查 + 关键项升 error 逼自纠 + KB 作单一标定源。

### 3.2 三件老活立项（08-23）
用户听不懂让 AI 做主、确认身份错位（本人=代码方），提炼三件老活执行清单，被纠正两处硬错误（路径/行号引用）：
1. **检测双轨**（正则+LLM+空洞度）；
2. **反向闭环**（detector→铁则回流）；
3. **KB 阈值标定**（阈值外置到知识库单一源）。
→ 本周期 ③ 与反向闭环已落地，检测双轨的 LLM 层（①-C）已落、空洞度并入 R4 守卫。

### 3.3 ③ KB 阈值标定 + 2E 扩面（08-24~25）
- **阶段一**：新建 `检测工具/health-report.ts`（本地复刻双树桥接、不 import `check-chapter.ts` 防 main() 副作用），产出 `health-matrix.json`（26 章数值矩阵，含双树 `violationCounts` + 平滑维度）。**关键真实发现**：生成时树 `checker.ts` 的 `check()` 内联跑了 40+ 阈值字段检查（grep `ruleId:` = 49），原"生成时树=12 个检测器"严重低估。
- **阶段二 2A–2D（落点 A：KB 单一标定源）**：`Thresholds` 接口 +16 camelCase 可选字段（含 `commaChainRatioWarn:3.2`/`commaChainLongMax:8` 等）、`DEFAULT_THRESHOLDS` 同值、`知识库/阈值标定/default.json` 新建 16 字段；`config-merger.ts` 模块级同步 seed（偏离原 async 方案，侵入更小、覆盖更全）；`health-report.ts` 改走 `loadKbDefaultThresholds()`。**验证：tsc 0 错 + 矩阵 0 差异 + KB 实证 `sense_density` warning 20→22**。
- **2E 扩面**：13 个质量函数签名加 `thresholds`、31 处魔法数外置、32 字段三文件覆盖；`line1638` `simileParaMinLen:20` 第 33 字段纳入。**验证：tsc 0 + 矩阵 0 差异 + KB 实证 golden_300 告警 8→16**。
- **诚实结论**：③ + ①-C = **零行为变化**（默认值全=原魔法数、生成时树仍 warning/info 不触发重写），文章字节级未变。26 章是旧引擎产物，现有矩阵只是"新检测器对旧文章的透视"。

### 3.4 ①-C D-SMOOTH 语义顺滑层（08-24~25）
- 方案 B（因 `check()`/`runChecker` 整条同步，`await` 塞不进同步链）：`reflectAsync` 内 `await checkSemanticSmoothness(input.content, this.llm)` + try/catch 降级 + `mergedViolations` 并入，`hasCheckerError` 用合并结果，`passed = overallScore >= qualityGate && !hasCheckerError` 端到端打通。
- `Thresholds` 加 `maxSmoothnessViolations?: number`、默认 `3`；冒烟 `d_smooth_smoke.ts` 11 断言全过；tsc 0 错。

### 3.5 A/B 重生成量化 + 治本三组（08-25~26）
**根因定位（不是章节脏，是引擎自己教坏）**：用 WorkBuddy 自身 AI 重写最烂 6 章（不碰生成侧），违规 200→106（↓47%）、逗号链 45→2（↓96%）——证明写法层面质量可量化提升，但引擎自身生成铁则从未改动。三处真身矛盾（代码方独立核全真）：
1. 铁则四在教逗号链（`生成指令.md:90` 等 7+ 处）；
2. 检测器在罚逗号链（`checkers.ts:263/277/292/474`）；
3. 2700 字数闸在罚精炼短文（`checker.ts:58`）。

**治本三组闭环**：
- **A 组（方案方，.md）**：`生成指令.md`(5处) + `技法推荐库.md`(2处) + `玄幻预设`(1处) 逗号串联强制语 → 软上限（可串联+单句≤8/比≤3.0/换拍必句号断）；跨树 grep 旧强制语 **0 命中**。
- **B 组（代码方，.ts/.json）**：13 处 prompt 软化（含 `源码/kb/` 子目录真路径）+ `Thresholds` 加 `minChapterWords?: number`/`DEFAULT:2000`/`default.json:2000` + `checker.ts` R4 改"长度下限+空洞度守卫"（`isHollow = sensoryTotal<3 && anchorCount<3`，修正初版 `||`→`&&` 误判）；tsc 0。
- **C 组 #55（代码方，CLI 树）**：`checkers.ts:1154 checkWordCountTarget` 加空心守卫（CLI 字段名 `visual/auditory/tactile/olfactory/gustatory`）+ 短密→warning/短空→error 分流；`beat_break` 建议语软化；`npm run build` 重建 dist。

**真实端到端实证（08-26，非合成玩具）**：重跑 `health-report.ts` 26 章，与真实基线矩阵 diff——仅 `word_count_short`/`word_count_below` 有 delta：`word_count_short` **error 20→0、warning 0→10**；全书 error **64→44（Δ-20）**、`regressions=0` → **exit 0**。直接坐实 C 组治本：旧 2700 死闸把 20 章精炼短文误判 error，修复后短而密放行（转 warning）、短而空才 error（真实 26 章无短而空→0 error）。

### 3.6 反向闭环 v1（08-26）
- **基线发现**：章间 reactive 闭环已落地（`pre-analysis.ts:429 injectFingerprint` 读上章 `fingerprint.json`，注入七类禁忌，带反例/正例/硬约束）——之前漏记，正式纳入基线。
- **缺口**：A（全局级不读全书矩阵）/ B（回归靠人工）/ C（阈值自适应，暂缓）。
- **档1（全局矩阵注入）**：`readHealthMatrix()`（聚合全书 `violationCounts`，对齐 `health-report.ts:108/191` 真结构，权重 `error×3+warning×1`）+ `buildBookWideAvoidList()`（去重 `REACTIVE_HARDSET` 4 类、取前 5、仅提示不改硬值），注入点 `injectFingerprint` 末尾 `output += ...`。
- **档2（回归自动化）**：新增 `verify-regression.ts`，直接 diff 两份矩阵 JSON（不复跑检测），`--baseline` 必填、`--current` 默认；error 不降反升→exit 1、无回归→exit 0、文件缺失→exit 2。
- **基线保护约定**：`health-report.ts:14-17` 头部加"默认 `--out` 直接覆盖基线快照，非刻意更新须 `--out` 临时文件"，防误覆盖致 delta 失真。
- **真身验证**：档2 合成改善→exit0 / 回归→exit1；档1 备份真实矩阵→替换合成→测→恢复（字节一致）；dist 同步。

---

## 4. 关键量化数据

### 4.1 26 章体检基线（新检测器视角，08-25）
- 字数 2129–3544（均 2784），**20/26 < 2700**（`word_count_short`=20 error，即后来 C 组治本消除的 20 个误判）；
- **对话占比仅 1.4%**（严重偏低，列后续治理方向）；
- 总违规 598 = error64 / warning338 / info196；
- Top：`comma_chain`62 / `data_anchor`52 / `sense_density`39 / `simile_density`30(全 error) / `word_count_short`20(error) / `not_shi_pattern`23 / `cliche_reaction`11；最脏第 11 章(41)，最净第 16 章(13)。

### 4.2 治本真实收益（端到端，08-26）
| 指标 | 治本前（旧基线） | 治本后（新代码） | 变化 |
|---|---|---|---|
| `word_count_short` error | 20 | 0 | **−20（消除死闸误判）** |
| `word_count_short` warning | 0 | 10 | 短而密转 warning 放行 |
| 全书 error 总数 | 64 | 44 | **Δ−20** |
| 回归判定 | — | `regressions=0` | exit 0 可放心接受 |

### 4.3 写法层面实证（A/B，WorkBuddy 自身 AI 重写，非引擎自身）
- 6 章违规 200→106（↓47%）、逗号链 45→2（↓96%）。
- **注意**：此数据是"人/AI 按铁则改写法"的示范，证明检测器能分辨好坏；**引擎自身生成侧从未改动**，故其产出仍是坏文——治本三组正是修这个。

---

## 5. 贯穿全程的协作铁律（本周期最大资产）

**"代码方动手 + 方案方独立 fact-check、改前核真身、改后逐字钉死、不盲信口述/summary"** 在 50+ 轮零破防，多次救场：
- summary 曾误述"方案 .md 未落盘/目录仅 2 份/A 组零改动"——均被独立核磁盘推翻；
- 代码方初用根路径 `检测工具/checkers.ts`（错，活跃树在 `InkWeave/` 子目录）致 grep 假阴性"无命中"——改用 `InkWeave/` 前缀真路径后确认已落地；
- 每一次交付（③/①-C/2E/治本三组/反向闭环）都被方案方读真身逐项钉死，无伪造、无漂移。

**已固化进项目记忆的硬约束**：
1. 活跃代码树一律带 `InkWeave/` 前缀，勿信 summary 给的相对根路径；
2. 改长文件前先 `Grep` 确认真实行号，勿凭 Read 窗口推断；
3. KB 值突变实验用 `shell=True` 或显式 node+tsx，还原包进 `try/finally`；
4. 非刻意更新基线必带 `--out` 临时文件。

---

## 6. 留白与后续

- **真实 `health-matrix.json` 仍是旧基线快照（error=20）**：等你**刻意**带默认 `--out` 跑一次 `health-report.ts` 翻成新态（error=0），那刻 C 组治本在基线层正式生效。此前的 `--out` 临时文件约定已守住，不会误覆盖。
- **档3 阈值自适应**：按方案暂缓（防震荡/过拟合，接口已留）。
- **检测双轨 LLM 层**：①-C 已落骨架，但需生成时真 LLM 接入才生效（当前 Mock 不可用）。
- **对话占比治理**（1.4% 太低）：列后续方向，未做。
- **Trea 线**：08-23 PRD 评审后"sync later"未续，无代码/实测产物。

---

## 7. 结论

本周期（08-19~08-26）两条产品线：Trea 视频工具完成 PRD 评审、准备原型（待续）；**InkWeave 写作引擎完成从 D1–D6 修复 → 双树架构真相 → 三件老活 → ③KB 标定/2E → ①-C D-SMOOTH → A/B 量化 → 治本三组 → 反向闭环 v1 的完整升级闭环**，并在真实 26 章上端到端证明治本收益（`word_count_short` error 20→0）。

比单点代码修复更值钱的，是"代码方+方案方"交叉核验的协作铁律全程无破防——它已写进项目记忆，后续任何会话/需求可直接复用，不用重踩坑。
