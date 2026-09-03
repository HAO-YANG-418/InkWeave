# 检测侧新规则方案 · 去 AI 味 & 空洞度（2026-08-22）

> **给代码方落地（.ts）**。方案方只出方案，不动源码。
> 依据：调研报告 `InkWeave_调研报告_优秀网文范式与AI味特征全集_2026-08-22.md` + 实证基线 `InkWeave_实证体检_十章AI味基线_2026-08-22.md` + 源头治理方案 2.2。

---

## 0. 设计原则（来自实证的关键校正）
1. **单靠正则打不尽 AI 味**：实战十章在可计算维度（连接词 0.9/千字、模板句 1.1/千字、句长方差 15.6 健康）均不重。用户主观「AI 味明显」指向**模型层特征**（perplexity 低、semantic_smoothness 高=逻辑过顺）。→ 检测器必须**双轨**：正则层（浅信号）+ **LLM 层（深层特征，治本）**。
2. **阈值必须中文网文语料标定**，不能照搬英文/火山数据（中文 slStd 天然 15+、3-gram 重复天然 30%+，直接套会误杀）。
3. **只注入 warning，不注入 error**：AI 味/空洞 warning 经反向闭环进下章禁忌；error 仍走写后门禁（废章重写）。

---

## 1. 正则层 `check-ai-flavored-regex.ts`（浅信号，低风险先上）
| 维度 | 计算 | warning | error | 实证基线 |
|------|------|---------|-------|---------|
| transition_density 连接词/千字 | 连接词表命中/千字 | >6 | >10 | 均值 0.9（极轻） |
| cliche_density 模板句/千字 | 模板情绪句表命中/千字 | >8 | >14 | 均值 1.1（极轻） |
| repetition_3gram 3-gram重复% | 需**排除专有名词**后算 | >20% | >30% | 34.9%含实体（需去实体重算） |
| punctuation_cv 标点节奏CV | 标点间隔变异系数 | <0.30 | <0.20 | 0.36–0.43（略低） |
| dialogue_ratio 对白% | 引号内字数占比 | <5 或 >65 | <3 或 >75 | 11–26%（正常） |

- 连接词表/模板句表：见调研报告 2.2 节（此外/然而/值得一提的是…；眉头紧锁/深吸一口气…）。
- 复用现有：`check-not-shi-pattern`（notX）、排比、破折号、碎句、比喻（均在 `检测工具/checkers.ts` 已有）。

## 2. LLM 层 `check-ai-flavored-llm.ts`（**治本关键**）
调用 InkWeave 生成模型（同 pre-analysis 用的模型通道）对本章计算深层特征：
- **perplexity**：模型对文本逐 token 对数似然均值。越低越可预测=越 AI。英文基准人类 20–50 / AI 5–10，**中文需标定**。
- **semantic_smoothness**：相邻句 embedding 余弦相似度，>0.92 高风险（人类有思维跳跃）。
- **burstiness**（句长方差）：虽可本地算，但结合 perplexity 联合判更稳。
- 输出 `ai_flavor_score` 0–100：>70 高风险（对齐朱雀），>50 warning，≤50 正常。
- 实现：复用引擎现有 LLM / embedding 调用通道（prompt-builder / pre-analysis 已用）。

## 3. 空洞度 `check-emptiness.ts`（治「写空」）
- 本地近似：概括句占比（无具体名词/动作动词、纯形容词/副词堆砌句）、设定解释类占比。
- 更强（LLM 层）：让模型评估「每屏新信息量」——每段是否推进了情节/人物/伏笔（三不沾=empty）。
- 阈值：概括句占比 >30% warning / >45% error；或 LLM 评信息密度低于阈值 warning。
- 注：实证发现 5 章字数<2700 但感官密度不低 → 「写空」更可能是**情节信息密度不足**，非感官词缺失，故空洞度必须含信息层评估，不能只数感官词。

## 4. 接入主流程 & 反向闭环
- 在 `检测工具/checkers.ts` 主流程尾端（现有 fingerprint 产出后）调用上述 checker，汇总 warning/error。
- warning（非 error）提取 Top3 `ruleId` → 经上轮 `warning-feedback.ts` 注入下一章「本章禁忌」（**接第 1115 行已有跨章通道**，不另起炉灶）。
- error 走现有写后门禁（废章重写）。

## 5. 代码树与文件
- 新增：`检测工具/checks/check-ai-flavored-regex.ts`、`check-ai-flavored-llm.ts`、`check-emptiness.ts`
- 修改：`检测工具/checkers.ts` 主流程尾端接入 + 类型补充
- 复用：现有 LLM 通道 / 第 1115 行跨章通道 / `warning-feedback` 模块

## 6. 阈值标定计划（必须，否则误杀）
- 收集 30+ 中文头部网文章节 + 30+ AI 生成网文章节，跑双轨特征，ROC 标定阈值。
- 以实证十章为「治理前基线」，生成铁则（十九/二十）落地后重跑对比，看 ai_flavor_score 是否下降。

## 7. 落地顺序（给代码方）
1. 正则层 `check-ai-flavored-regex.ts`（低风险，先上，拿浅信号）
2. 反向闭环接通 `warning-feedback`（让正则 warning 注入下章禁忌）
3. LLM 层 `check-ai-flavored-llm.ts`（需模型通道，核心治本）
4. 空洞度 `check-emptiness.ts`（结合 LLM）
5. 阈值标定（中文语料）

> ⚠️ 本文件为**方案**，待用户（代码方）逐项落地。方案方不碰 .ts。
