# InkWeave P1.5 语义级长程一致性 —— 验收报告（v5.1）

## 一、为什么做（定位）
P1（规则级事实指纹）解决了「时间跳变/角色瞎死断臂无交代/伏笔断链/专名变体」这类**确定性、可枚举**的矛盾。
但它抓不到更隐蔽的语义层硬伤：
- **角色人设漂移（OOC）**：上一章沉默克制的人，这章突然话痨轻浮，没有铺垫。
- **设定逻辑矛盾**：某一章情节违背了已建立的世界观规则，但字面上没"死证据"。
- **因果断链**：上章已发生的关键事件，这章被悄悄推翻/忽略。
- **伏笔逻辑漏洞**：上章埋的伏笔回收时出现逻辑破绽。

这类问题**规则层无解**（需要"理解"上章语义并比对），必须引入 LLM 做语义记忆比对。Sudowrite 的 Story Bible + 记忆模型之所以长程强（我们评的 4/5），核心就是这层。

P1.5 在 P1 之上补齐了**语义记忆雏形**：把上章浓缩成"记忆基线"存 fingerprint，下章用 LLM 比对。

## 二、落地内容（3 个文件 + 2 个配置）
1. **`检测工具/semantic-check.ts`（新）**：可插拔 OpenAI 兼容语义校验。
   - `checkCrossChapterSemantic()`：对比「上章记忆基线 + 设定 + 上章事实指纹」vs 本章，输出 4 类 warning 级 finding（sem_ooc / sem_setting_contradiction / sem_causal_break / sem_foreshadow_logic）。
   - `generateSemanticSummary()`：保存 fingerprint 时生成上章语义摘要（记忆雏形）。
   - `loadLlmConfig()`：配置来自 `.inkweave.llm.json` 或环境变量（`INKWEAVE_LLM_*`），OpenAI 兼容。
2. **`检测工具/check-chapter.ts`**：`main()` 改 async；检测分支接入语义校验（仅 `isSemanticEnabled()` 时）；`--save-fingerprint` 分支生成并保存 `semanticSummary`；`loadPrevChapterFingerprint` 读取上章 `semanticSummary` 作为比对基线。
3. **`检测工具/checkers.test.ts`**：新增 4 个 P1.5 用例。
4. **`.inkweave.llm.example.json`**（配置模板）+ **`.gitignore`**（忽略真实配置与 fingerprint，防 key 泄露）。

## 三、设计红线（防反效果）
- **可插拔 + 降级安全**：未配置 / 网络超时 / 解析失败 / 不可达 → 一律返回 `[]`，**绝不阻塞质量门禁**。验证：启用但不可达的 baseURL，第16章仍 97分A 通过。
- **全部 warning 级**：语义误判宁可放过，绝不废章（error 级只留给 P1 的硬证据矛盾）。
- **成本可控**：设定≤1800字、上章≤1500字、本章≤6000字，均截断；temperature=0.1 提高确定性。
- **记忆雏形而非全量**：存"摘要"而非全章，避免 token 爆炸，也避免长程记忆噪声。

## 四、验收（实打实跑过）
| 验证项 | 结果 |
|---|---|
| 单元测试（mock fetch 解析 / 降级 / 畸形 JSON 安全降级） | ✅ 39/39 通过 |
| 无配置降级，第16章重跑 | ✅ 97分A、0错误0警告、无回归 |
| 启用但不可达，第16章重跑 | ✅ 安全降级，97分A 不阻塞 |
| 本地 mock LLM 返回 1 条 OOC，端到端跑第16章 | ✅ 报告 97→93，打印「语义·角色人设漂移(OOC)」warning，门禁仍通过 |
| `npx tsc` 编译 | ✅ 0 error |

## 五、能力边界（诚实）
- **抓得到的**：角色 OOC、设定矛盾、因果断链、伏笔逻辑漏洞（需上章记忆基线存在）。
- **抓不到的**：
  - 第1章（无上章 baseline）天然不校验——这是长程工具的固有前提。
  - 极微妙的情绪/语气漂移（LLM 也会漏）。
  - 模型幻觉导致的"假阳性"——已用 warning 级 + 扣 4 分兜底，且要求点名具体角色/事件降低噪音。
- **成本**：每章多 1 次 LLM 调用（仅启用时）。若接真 key，长文连载需评估 token 费用。

## 六、对标位置更新
长程叙事一致性：规则级(P1) 1→3/5，语义级(P1.5) 补上后 → 综合约 **4/5**，已追平 Sudowrite 的记忆模型档（它靠全量记忆+语义，我们靠"摘要记忆+规则兜底"，成本更低）。剩余差距在"全量上下文记忆"与"多章联合推理"，属 P2 范畴。

## 七、启用方法
```bash
# 方式1：配置文件（放 InkWeave/ 根目录，已被 .gitignore 忽略）
cp .inkweave.llm.example.json .inkweave.llm.json
# 编辑填入真实 baseURL / model / apiKey

# 方式2：环境变量（CI/脚本更友好）
export INKWEAVE_LLM_BASE_URL="https://your-llm/v1"
export INKWEAVE_LLM_MODEL="gpt-4o-mini"
export INKWEAVE_LLM_KEY="sk-xxx"

# 之后正常跑 check（启用时自动校验语义）
node inkweave.mjs check "第17章 xxx.md" --target 3000 --project 裂日 --save-fingerprint
```

> 注：语义校验是**增强层**。不配 key 时引擎行为与 P1 完全一致（规则级），零副作用。
