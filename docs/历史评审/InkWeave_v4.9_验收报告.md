# InkWeave v4.9 验收报告（反向闭环 #2 完整版）

> 验收方：WorkBuddy（独立核验）　|　日期：2026-08-18
> 结论：**#2 反向闭环已完整接线并验证通过**（生成端硬化 + 检测端接线 + 白名单 bug 修复 + 编译 + CLI 生效全部完成）

---

## 〇、背景

trea 交付的 v4.9 只做了一半：生成端 prompt 硬化（反例/正例/感官契约）已落地，但两个新检测器
`checkCrossChapterRepeat`（跨章重复句式）、`checkSenseDensityWithPrev`（感官闭环升级）只是**定义**在
`checkers.ts` 里，**全仓零调用点**——检测流水线根本没接它们（死代码）。本验收报告原判定为"部分通过"。

本次由 WorkBuddy 直接接手，把 trea 没接完的部分补齐并实测。

---

## 一、本次实际改动清单

### 1. `检测工具/check-chapter.ts`
- **新增 `loadPrevChapterFingerprint(projectName, chapterName)`**：从上一章 `.fingerprint.json` 提取
  `verbStackingVerbs`（排比动词字符串）+ `senseError`（errors 是否含 `sense_` 开头）。
- **单章检测接入反向闭环**：得到 `violations` 后，若 `--project` 存在，调用
  `checkCrossChapterRepeat(text, stats, prev.verbStacking)`（复发即标 warning）；
  若 `prev.senseError`，调用 `checkSenseDensityWithPrev(stats, true)` 并将升级后的 sense 违规替换原 warning。
- **`assertGate` 改用 `finalViolations`**（门禁基于合并后的全部违规）。
- **fingerprint 保存新增 `verbStackingVerbs` 字段**：从 `style_stacking_verb` 的
  `fixes[].description` 解析排比动词字符串（如 `"穿过"`），供下一章跨章检测器复用；
  旧的 `verbStacking`（message+severity）保留，兼容 pre-analysis 生成端读取。

### 2. `检测工具/checkers.ts`
- **修复 `checkCrossChapterRepeat` 白名单减法 bug**：
  原代码 `narrativeMatches = matches.length - dialogueMatches` 是错的——`matches` 只在
  `narrativeText`（纯叙述段）里匹配，`dialogueMatches` 是 dialogue/mixed 段的额外命中，相减会漏检甚至归零。
  修复后 `narrativeText` 仅取叙述段、天然排除对话，直接 `narrativeMatches = matches.length`，
  既修 bug 又保留"对话同构不标记"的白名单语义。

### 3. 编译与版本
- `npx tsc` 编译零错误，`dist/检测工具/check-chapter.js` 已含 `loadPrevChapterFingerprint`。
- `inkweave.mjs` 版本字符串 + `checkers.ts` 所有检测报告横幅统一为 **v4.9**。

> 关键修复点：此前 CLI 入口 `inkweave.mjs` 调用的是 `dist/检测工具/*.js`（旧编译版），
> 源码改动不会自动生效。已通过重编 `dist` 让 CLI 走新版（符合"编译后软件"定位）。

---

## 二、实测证据

### 证据 A：单元测试（构造段落，验证函数逻辑）
- `checkCrossChapterRepeat`：叙述段含 3 次"穿过X，"、对话段含 3 次"穿过X，" →
  **返回 1 条 cross_chapter_repeat / warning**。
  证明修复后对话段不计入、叙述段正确计数（旧 bug 会算成 3−3=0 不触发）。
- `checkSenseDensityWithPrev(stats, true)`：基础 `sense_tactile_below_visual` 为 warning →
  **升级为 error 且 message 含"升级"**；`(stats, false)` 不升级（保持 warning）。

### 证据 B：集成测试（经 CLI `inkweave.mjs check`，真实流程）
用复刻上章排比 + 视觉>触觉 的测试章节（已清理）：
```
### 警告 #1：跨章重复句式
### 错误 #2：感官密度
> 触觉(2) < 视觉(25)，违反预设"触觉≥视觉"约束。……（上章已触发感官密度 error，本章复发升级为硬阻断）
```
- **跨章重复句式**（cross_chapter_repeat）真实触发 ✓
- **感官密度升级为 error**（消息明确"上章已触发…升级为硬阻断"）✓
- 报告横幅显示 `InkWeave v4.9` ✓

### 证据 C：编译验证
`dist/检测工具/check-chapter.js` 含 `loadPrevChapterFingerprint`（grep 命中 2 处）✓

---

## 三、回归说明（重要，非 bug）

回归第14章（`--project 裂日`）结果：**评分 85/B，但门禁 exit=1（1 处 error）**。
原因是第14章自身 `触觉(35) < 视觉(68)` 的感官失衡，叠加第13章指纹标记了感官 error，
被闭环**升级为硬阻断**。

澄清：这**不是回归 bug，是闭环正确工作的体现**。
- 第13章用 v4.9 重测：评分 59/D，含 3 个 error（含感官失衡 `触觉5<视觉78`）——**第13章真实有感官 error**。
- 第14章继续视觉过度主导、触觉不足，闭环把"复发"后果加重，符合 #2 设计目标
  （"上章有错→下章复发加重"）。在 v4.8 时代这只是 warning（容忍），v4.9 闭环让复发变阻断。

> 处置建议（可选，超出 #2 范围，由屿与雨决定）：若要第14章重新"通过"，需在章节内容里
> 补足触觉/听觉/嗅觉描写（使非视觉感官压过视觉），而非改引擎。引擎行为正确，不动。

---

## 四、最终结论

| 项 | 状态 |
|---|---|
| #2 生成端 prompt 硬化（反例/正例/感官契约） | ✅ trea 已完成，实测渲染正常 |
| #2 检测端接线（跨章重复 + 感官升级） | ✅ 本次补齐，经 CLI 实测双触发 |
| 白名单减法 bug | ✅ 本次修复并单元验证 |
| 编译 dist + CLI 生效 | ✅ tsc 零错误，横幅 v4.9 |
| #3 轻量模式接 step0 配方 | ✅ 此前已通过（quick-write 接线） |

**#2 判定：完整通过。** 与 trea 版本相比，补齐了"检测流水线接线"+"白名单 bug 修复"两块，
使反向闭环从"写了函数"变成"真正在每次检测时运行"。

---

## 五、后续可推进

- #4 打包进 Storyvein：目标路径 `写作软件/Storyvein/src/engine/inkweave/`（真实项目，非空壳）。
- #5 效果度量：A 版基线 `InkWeave_v4.8_改前基线_A版` 已留；待 #4 或任意可对比版本产出后跑盲评。
