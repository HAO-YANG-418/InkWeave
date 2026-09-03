# InkWeave 联合推进方案（WorkBuddy × trea）

> 起草：WorkBuddy ｜ 执行：WorkBuddy + trea ｜ 状态：待你（屿与雨）拍板后开工
> 配套详细步骤文件：`InkWeave_后续方案_#2到#5.md`（本文件只补「谁做 / 谁验 / 何时同步」）

---

## 0. 本轮已完成的清理（网页已剔除，软件保留）

按你「单纯的网页删了、软件别删」的指令，已落地：

| 项 | 动作 | 说明 |
|---|---|---|
| `inkweave-web.js`（Node HTTP 服务，浏览器开面板） | **已删** | 这就是「纯网页」本体 |
| `dist/`（编译产物） | 曾删，已**还原** | 它是引擎编译产物（CLI 跑的也是它），属软件，不是网页；还原后引擎照常工作 |
| `package.json` | 改 | 删 `inkweave-web` bin + `web` 脚本；`dist/` 脚本改回 `npx tsx` 源码直跑 |
| `inkweave.mjs`（CLI） | 改 | 删 `web` 子命令分支（死代码），其余引擎命令全保留 |
| `SKILL.md` / `install.bat` | 改 | 删 `inkweave-web` / 网页界面 / 网页壳 等文档与安装广告 |

**已验证**：`node inkweave.mjs` 只剩引擎命令；`node inkweave.mjs check 第14章 溯源.md --project 裂日` 实测 **99/100 A级** 通过。引擎零受损。

**保留不删（软件/交付物，非网页）**：`检测工具/*.ts`、`源码/*`、`知识库/`、`项目_裂日/`、`交付物/*.html`（4 份静态报告）、父目录各 `*-plan/*.html` 分析文档。
> 若你认为那 4 份 `交付物/*.html` 也属「网页」，说一声我立刻删。

---

## 1. 协作机制（怎么一起推）

- **trea = 实现方**：在 `InkWeave/` 里改代码（#2/#3/#4 的代码落点），每步先备份、附**实测命令 + 真实输出**。
- **WorkBuddy = 验收方 + 度量方 + 协调方**：独立核验 trea 的改动是否真生效（不看「done」，看跑出来的结果），并负责 #5 效果度量与卖课弹药，同时起草/同步本方案。
- **同步方式**：你（屿与雨）是桥——把本文件 + trea 的产出贴给对方；两人都改 `InkWeave/`，**不碰对方已认领的文件**避免冲突（见下表）。
- **硬纪律（沿用交叉评审教训）**：任何「完成」必须附 `实测命令 + 真实输出`；禁止只写文档不写代码；每步先备份（命名 `InkWeave_backup_YYYYMMDD_HHMM`）。

---

## 2. 任务分工表（#2 → #5）

| 序 | 任务 | 杠杆 | **实现方** | **验收方** | 依赖 | 改动文件（避免冲突） |
|---|---|---|---|---|---|---|
| #2 | 反向闭环升级为「生成端硬约束」 | 高·直接提升写得好的概率 | **trea** | WorkBuddy | 无（CLI 形态先做） | `检测工具/pre-analysis.ts`、`检测工具/checkers.ts` |
| #4 | 打包成浏览器模块进 Storyvein | 高·终局对接形态 | **trea** | WorkBuddy | 建议 #2 在 CLI 稳后再 port | Storyvein `src/engine/inkweave/`（**新增独立目录，不动现有 gwe**） |
| #3 | 轻量模式验证 + 接知识库配方 | 中·非技术用户可用 | **trea** | WorkBuddy | 依赖 #1（已做）、#2 补禁忌 | `检测工具/quick-write.ts` |
| #5 | 效果度量（卖课弹药） | 低·但变现必需 | **WorkBuddy** | 你 / 读者盲评 | 依赖 #2/#4 出可对比版本 | 新建 `InkWeave_效果度量报告.md` + 生成 A/B 文 |

**执行顺序建议**：#2（CLI 先做）→ #4（port 进 Storyvein）→ #3（顺带补禁忌）→ #5（最后出证据）。

---

## 3. 各任务要点（细节见 `InkWeave_后续方案_#2到#5.md`）

### #2 反向闭环硬约束（trea 实现）
- `pre-analysis.ts` 的 `injectFingerprint`：补**反例原句 + 正例模板 + sense_density 禁忌**，并把 step0 配方与禁忌合并成单段「本章风格契约」。
- `checkers.ts` 新增 `crossChapterRepeat`（warning 级）：相邻 2 章同构句式复发即标。
- 验收：跑 `pre-analysis 16` 输出含反例/正例/感官强制；造复刻短文→检测器报 warning。

### #4 打包进 Storyvein（trea 实现）
- 拆**纯函数核心**：`checkChapter(text, stats, options)` 不依赖 `fs`，知识库/预设由调用方注入。
- 新建 `src/engine/inkweave/`：`checker.ts`(浏览器版) / `preset-loader.ts` / `style-recipe.ts` / `index.ts`。
- 接 `writingEngineBridge.ts`：编辑器 onChange 防抖跑检测→侧栏实时标红 + 风格配方卡。
- 验收：浏览器环境 import 后对字符串跑检测，返回与 CLI 一致的 violations；预设 `都市异能-番茄V3.1追读版` 触觉≥视觉约束生效。
- **红线**：不动 Storyvein 现有 `gwe/` 引擎，新增独立 `inkweave/` 子目录。

> **〔2026-08-18 勘误〕**：trea 评审曾把 #4 标为「阻塞 / Storyvein 不存在」。经实测，那是**查错路径**——他查的是 `写作引擎产品\Storyvein\`（空壳），真实项目在 `写作软件\Storyvein\`，内含完整 `src/engine/gwe/`、`writingEngineBridge.ts`、`styleEngine.ts`。#4 **不阻塞**，按本方案推进即可，目标路径写 `写作软件/Storyvein/src/engine/inkweave/`（`Storyvein` 即真实项目名）。

### #3 轻量模式（trea 实现）
- `quick-write.ts` 接入 step0 风格配方（现只接了 verbStacking/dashes/notXButY，缺预设/多样性）。
- 验收：跑 `inkweave quick 16 3000 --project 裂日` 正常且简报含「风格配方」段；3 章跑通。

### #5 效果度量（WorkBuddy 实现）
- 选 5 个固定提纲（高潮/过渡/日常/战斗/揭秘）；A 版（旧 v4.5.3 逻辑）vs B 版（新 v4.8）生成。
- 盲评 10 人/agent，4 维度（多样性/可读性/疲劳度/雷同感）1-5 分；出均值对比。
- 交付 `InkWeave_效果度量报告.md`：含 5 章 A/B 全文 + 10 份评分 + 结论（诚实标注「趋势证据」非统计显著）。

---

## 4. 里程碑与下一步

1. **你拍板** → 本方案是否照此执行（尤其 #4 红线、#5 样本量）。
2. **trea 开工 #2** → 完成后把 `pre-analysis.ts`/`checkers.ts` 改动 + 实测输出贴回，WorkBuddy 核验。
3. **#2 稳后 trea 开 #4** → port 进 Storyvein，WorkBuddy 验浏览器内检测一致。
4. **WorkBuddy 并行攒 #5** → 等 #2/#4 出可对比版本后跑盲评，出卖课证据。

> 备注：I（WorkBuddy）无法直接调用 trea，所以本文件就是给 trea 的「任务书 + 纪律」——你贴给他即可；他执行、你转我验收，闭环不重不漏。
