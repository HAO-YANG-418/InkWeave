# InkWeave — 墨织 · 网文写作智能引擎

> 「以墨为线，编织故事。」

**InkWeave**（墨织）是一个专为中文网文打造的**写作智能引擎**。它不只是帮你写——它理解网文的节奏、爽点和读者心理，在生成每一段文字的同时自动进行质量把控，让你写出来的东西自带追读力。

[![npm version](https://img.shields.io/npm/v/inkweave)](https://www.npmjs.com/package/inkweave)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 它做什么？

InkWeave 是一个**规则引擎 + LLM 双驱动**的写作系统：

```
你的大纲/想法 → InkWeave 写作引擎 → 高质量章节
                      ↑
              规则引擎自动质检
              （7维雷达 + 35规则 + 跨章追踪）
```

**核心能力：**

- **智能写作**：对接 OpenAI 兼容 API（DeepSeek、GPT、Claude 等），根据大纲、前文、预设风格自动生成章节
- **实时质检**：生成过程中自动检测——身体锚点够不够？节奏对不对？句式有没有变化？AI 水文有没有混进来？
- **跨章记忆**：追踪全书上下文，检测开头/结尾模式重复，伏笔超期提醒，场景自然衔接
- **风格定制**：22个配置节点 × 18个内置预设，覆盖起点/番茄/七猫/晋江/飞卢等主流平台和仙侠/都市/科幻等11种题材

---

## 和纯 AI 写作有什么不同？

| | InkWeave | 纯 AI 写作 |
|---|---|---|
| **写作方式** | 引擎驱动 + 规则质检，多轮迭代 | 一次性生成，质量随缘 |
| **网文理解** | 内建35条网文专属规则，懂"爽点"是什么 | 需要你写 prompt 教它 |
| **质量保证** | 每段生成后自动评分，不达标自动重写 | 大模型黑盒，不知道好坏 |
| **一致性** | 跨章追踪，不会写出矛盾的设定 | 经常忘了前面写过什么 |
| **成本** | 规则层免费，仅 LLM 调用按量付费 | 按 token 计费 |

> **InkWeave 不是替代 AI，而是给 AI 装上了一个懂网文的"大脑"。**

---

## 快速开始

### 30秒体验

打开 [在线 Demo](https://hao-yang-418.github.io/inkweave)，粘贴你的章节，立刻看到引擎分析结果。

### CLI 命令行

```bash
npm install -g inkweave

# 检测一个章节
inkweave check chapter.txt

# 批量检测
inkweave check chapter*.txt --json > report.json
```

### 接入 LLM 写作

```typescript
import { createEngineWithKB, OpenAICompatibleProvider } from 'inkweave';

const provider = new OpenAICompatibleProvider({
  apiKey: 'your-api-key',
  baseURL: 'https://api.deepseek.com',
  model: 'deepseek-chat',
});

const { engine } = createEngineWithKB(provider);

// 选择预设（番茄 + 都市题材）
engine.selectPreset('preset_urban_tomato');

// 流式生成章节
const stream = await engine.writeChapter({
  outline: '主角获得系统，第一次使用就遇到危机',
  previousChapter: '...',
  onDelta: (text) => process.stdout.write(text),
});
```

### 跨章写作管理

```typescript
const ctx = engine.getBookContext();

// 逐章添加，引擎自动追踪
ctx.addChapter(chapter1);
ctx.addChapter(chapter2);
ctx.addChapter(chapter3);

// 写第4章时，引擎会自动检测：
const warnings = ctx.getCrossChapterWarnings();
// → ["最近3章连续使用单字感官开头，本章建议换对话/动作开头"]
// → ["重要伏笔'剑骨封印'在第3章埋设，已过5章未回收"]

// 继续生成第4章，引擎会自动注入这些警告到 prompt 中
const chapter4 = await engine.writeChapter({
  outline: '主角发现剑骨封印的秘密',
  previousChapter: chapter3,
  onDelta: (text) => process.stdout.write(text),
});
```

---

## 引擎内置的网文知识体系

### 7维写作雷达

| 维度 | 引擎关注什么 | 如何影响生成 |
|------|-------------|------------|
| **身体反应** | 读者有没有"感受到痛"？ | 锚点密度不足 → 自动增加身体描写 |
| **感官信号** | 五感有没有被调动？ | 视觉占比过高 → 引导加入触觉/听觉 |
| **动作推进** | 故事有没有在动？ | 静态描写过多 → 引导加入动作冲突 |
| **情绪张力** | 有没有让人心跳加速？ | 情绪平缓 → 自动加入反差/紧迫感 |
| **信息推进** | 有没有在给新信息？ | 信息密度低 → 引导加入新设定/新悬念 |
| **转折密度** | 有没有意外？ | 过于平铺直叙 → 引导加入反转 |
| **章末钩子** | 读者会不会点下一章？ | 结尾平淡 → 自动生成断裂式钩子 |

### 身体锚点三级质量体系

不是所有身体反应都叫"爽点"。引擎对三种锚点区别对待：

| 等级 | 权重 | 示例 | 写作效果 |
|------|------|------|---------|
| 套路反应 | ×0.2 | 瞳孔一缩、倒吸一口凉气 | 读者免疫，几乎无效 |
| 普通反应 | ×1.0 | 心跳加速、手心出汗 | 基础效果 |
| 高质量生理反应 | ×1.8 | 胃猛地一缩、后颈发麻 | 读者感同身受 |

引擎在生成时会主动避开套路反应，优先使用高质量生理锚点。

### 9项专项检测

| 检测项 | 解决什么问题 |
|--------|------------|
| 角色台词辨识度 | 所有角色说话一个调调 → 自动区分语癖 |
| 动作点名册 | 反复"点了点头""摇了摇头" → 引导动作多样化 |
| 感官密度 | 只有视觉描写 → 自动加入触觉/听觉/嗅觉 |
| 句群波形 | 连续10句长度相同 → 引导长短句交替 |
| 数据锚点 | "数万人""无尽的力量" → 引导具体数字 |
| 感叹号配额 | 一段超过3个感叹号 → 限制情绪廉价化 |
| 禁用字检测 | "呢""吧""吗"句尾滥用 → 自动修正 |
| 不是X是Y模式 | 否定揭示句式过度 → 引导换句式 |
| 逗号链 | 单句超过8个逗号 → 引导断句 |

---

## 评分说明

| 分数 | 等级 | 说明 |
|------|------|------|
| ≥90 | 🏆 优秀 | 对标一线热门网文，追读力极强 |
| ≥85 | ✅ 良好 | 达到发布标准，读者留存率高 |
| ≥75 | ⚠ 及格 | 有明显问题，需要修改 |
| ≥60 | ⚠ 较差 | 较多问题，建议重写关键段落 |
| <60 | ✗ 不达标 | 质量不合格，读者会直接划走 |

---

## 对比测试

用 InkWeave 对三类文本盲测：

| 文本类型 | 字数 | 得分 | 说明 |
|---------|------|------|------|
| 引擎生成风格 | 388字 | **84.7** | 首句"疼。"1字切入，全程高密度信息 |
| 经典套路开头 | 372字 | **84.4** | 系统流开局，中规中矩 |
| AI水文 | 391字 | **57** | 成语堆砌、写景空洞、比喻过密 |

---

## 架构

```
inkweave/
├── src/
│   ├── index.ts              # 统一出口
│   ├── types.ts              # 类型定义 + 默认阈值/权重
│   ├── gwe-engine.ts         # 引擎主类（写作+检测）
│   ├── checker.ts            # 35项规则检测器
│   ├── radar.ts              # 7维雷达评分
│   ├── anchor-detector.ts    # 身体锚点检测（三级质量分级）
│   ├── filler-words.ts       # 填充词检测
│   ├── config-merger.ts      # 配置合并器
│   ├── node-registry.ts      # 22个节点注册表
│   ├── validator.ts          # 冲突/依赖验证
│   ├── prompt-builder.ts     # LLM提示词构建（注入网文知识）
│   ├── llm-provider.ts       # LLM抽象层（OpenAI兼容/Mock）
│   ├── kb-loader.ts          # 知识库加载
│   ├── book-context.ts       # 全书上下文 + 跨章分析
│   ├── book-checker.ts       # 全书批量检测
│   ├── cli.ts                # 命令行工具
│   ├── checks/               # v3.4 专项检测模块（9项）
│   └── kb/                   # 知识库数据
│       ├── nodes/            # 22个节点 × 选项KB
│       ├── presets/          # 18个内置预设
│       ├── base-vocab.json
│       ├── base-fillers.json
│       └── base-prompt.ts
└── dist/                     # 构建产物
```

---

## 路线图

InkWeave 正在从**写作引擎**进化为**写作智能体**：

| 阶段 | 方向 | 状态 |
|------|------|------|
| v3.4 | 写作引擎 + 专项检测 + 跨章分析 | ✅ 已发布 |
| v3.5 | 检测器注册表（开关控制、优先级调度） | ✅ 已发布 |
| v4.0 | 智能建议引擎（自动生成修改方案） | 🚧 开发中 |
| v5.0 | 写作风格学习（从历史章节学习偏好） | 🔬 研究中 |
| v6.0 | 叙事策略引擎（章节类型识别、冲突追踪） | 🔬 研究中 |

> 对路线图感兴趣？**Star & Watch** 这个仓库，第一时间获取更新。

---

## 贡献

欢迎提交 Issue 和 PR。如果你有好的写作规则、题材预设或 LLM 调优经验，欢迎贡献。

## License

MIT