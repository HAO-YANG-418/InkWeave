---
name: "inkweave-writer"
description: "InkWeave网文写作引擎。触发词：写章、续写、审稿、重写、第X章、写小说、生成大纲、生成设定。"
---

# InkWeave 写作引擎 v4.8

## 能力总览

| 能力 | 命令 | 用途 |
|------|------|------|
| 单章检测 | `inkweave check` | 19项检测器（含排比堆叠），支持 --fix 自动修复 / --save-fingerprint 指纹保存 |
| 全卷检测 | `inkweave check-all` | 跨章盲区检测 + --fix-report 修复建议 |
| 写前分析 | `inkweave pre-analysis` | 自动化6步流程：指纹注入 + 本章禁忌 + 冷却检测 + 前文衔接 + 镜头链模板 + 门禁清单 |
| 轻量快写 | `inkweave quick-write` | 跳过详细推演，仅跑3条关键门禁，输出最小简报（面向非技术用户） |
| 全链路自动化 | `inkweave auto-pipeline` | 一键串联：检测→保存指纹→下一章写前分析 |
| 门禁验证 | `inkweave verify-gates` | 5项大纲门禁自动化验证（冷却/伏笔/章类型/冲突/钩子） |
| 知识库编译 | `inkweave compile-kb` | .kb.json → .md 自动编译 |

## v4.8 变更

- **反向闭环管道**：fingerprint warning → 下章"本章禁忌"硬约束，排比堆叠/段落开头/确定性违规三级优先级
- **风格多样性检测**：新增 checkStyleStacking 检测器（排比堆叠/的密度/段落开头重复），填补检测盲区
- **生成指令铁则十六/十七**：排比上限 + 的的去重，各含3条 ✔✘ 示例
- **轻量快写模式**：quick-write 跳过详细推演，仅跑3条关键门禁，降低非技术用户上手门槛
- **一键安装**：`install.bat` 双击安装，无需手动配置 Node.js 路径

## 版本演进

| 版本 | 关键能力 |
|------|---------|
| v4.3 | 三阶段分离、检测工具 CLI 编译、大纲/设定门禁 |
| v4.4 | CLI 打包（npm link）、prebuild 钩子 |
| v4.5 | --fix 自动修复、--save-fingerprint 指纹保存 |
| v4.5.2 | Self-Refine 机制（验证无效）、质量指纹提取器 |
| v4.5.3 | 第一轮指纹保存、Self-Refine 根因确认 |
| v4.8 | 反向闭环管道、风格多样性检测（排比堆叠）、轻量快写模式 |
| v4.7 | 多项目架构、单元测试、报告可读性、CLI --project 参数 |

---

你是 InkWeave 通用网文写作引擎。根据任务类型，自动路由到对应模块：

| 模块 | 路径 | 职责 |
|------|------|------|
| **InkWeave写作工坊** | `InkWeave写作工坊/SKILL.md` | 写作循环、按书籍配置加载节点、铁则禁令、审稿 |
| **InkWeave大纲创作院** | `InkWeave大纲创作院/SKILL.md` | 大纲15步、质量门禁、五维评分 |
| **InkWeave设定工坊** | `InkWeave设定工坊/SKILL.md` | 世界观5步、原创性隔离、角色模板 |

**路由规则**：
- 写章、续写、审稿、重写、修改第X章、继续写、切换预设 → 加载 **InkWeave写作工坊**
- 生成大纲、大纲评分、大纲修复 → 加载 **InkWeave大纲创作院**
- 生成设定、创建角色、设定评分、设定修复 → 加载 **InkWeave设定工坊**
- 复合任务（如"从设定到写章"）→ 按顺序加载：设定工坊 → 大纲创作院 → 写作工坊

**检测工具**（独立于写作流程，可随时调用）：
- 写完一章 → `inkweave check <章节> --target <字数> --save-fingerprint --project <项目名>`
- 全链路自动化 → `inkweave auto-pipeline <当前章号> <字数> --project <项目名>`（一键检测+指纹+下章分析）
- 全卷检测 → `inkweave check-all <章节目录> --fix-report`
- 门禁验证 → `inkweave verify-gates`
- 写前分析 → `inkweave pre-analysis <章节号> <目标字数> --project <项目名>`
- 轻量快写 → `inkweave quick-write <章节号> <目标字数> --project <项目名>`

**首次使用**：双击 `install.bat` 一键安装，然后加载对应模块的 SKILL.md 获取完整指令。

---

## 文件结构

```
InkWeave/
├── SKILL.md                          # 本文件（索引入口）
├── InkWeave写作工坊/SKILL.md         # 写作引擎
├── InkWeave大纲创作院/SKILL.md       # 大纲生成
├── InkWeave设定工坊/SKILL.md         # 世界设定与角色
├── 检测工具/                          # 精确算法检测（9个TS文件）
│   ├── check-chapter.ts              # 单章检测（--fix/--save-fingerprint/--cross）
│   ├── check-all.ts                  # 全卷检测（--fix-report）
│   ├── checkers.ts                   # 共享检测逻辑（18项检测器）
│   ├── pre-analysis.ts               # 写前分析脚本（v4.8）
│   ├── auto-pipeline.ts              # 全链路自动化（v4.8）
│   ├── quick-write.ts                # 轻量快写模式（v4.8）
│   ├── extract-fingerprint.ts        # 指纹提取器
│   ├── verify-gates.ts               # 门禁验证
│   └── knowledge/                    # 门禁知识数据
├── 源码/                              # 引擎源码（仅保留接入模块）
│   ├── checks/                       # 13项检测器实现
│   ├── cooling/                      # 冷却系统
│   ├── writing/                      # 写作编排器
│   ├── kb/                           # 知识库节点（.kb.json）
│   ├── knowledge/                    # 冷却模式库
│   ├── intent/ / reflection/ / memory/ / planning/ / learning/
│   └── _archive/                     # 未接入子系统（anti-pattern/creative/super/technique）
├── 知识库/
│   ├── 节点/                          # 22个节点×95个选项
│   ├── 预设/                          # 17个风格预设
│   └── 数据/                          # 10个通用知识库（冷却模式库/反思标准/叙事策略等）
├── dist/                              # 编译输出（npm run build）
├── .inkweave/project.json             # 项目配置（活跃项目 + 路径映射）
├── 项目_裂日/                          # 实战验证项目（裂日小说）
│   ├── 大纲/ / 设定/ / 伏笔/ / 审稿/
│   ├── 章节/ / 技法/ / 详细规则/ / 书籍配置/
├── 交付物/                             # 报告与文档
│   ├── InkWeave-Skill能力矩阵/
│   └── 引擎优化方案/
```