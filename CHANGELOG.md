# Changelog

All notable changes to InkWeave will be documented in this file.

---

## [3.5.0] - 2026-07

### Added
- 检测器注册表（Checker Registry）：支持独立开关控制、优先级调度、自定义阈值
- 9项专项检测模块全部可插拔

## [3.4.0] - 2026-07

### Added
- 9项专项检测模块：角色台词辨识度、动作点名册、感官密度、句群波形、数据锚点、感叹号配额、禁用字检测、不是X是Y模式、逗号链
- 全书上下文（BookContext）：跨章分析、开头/结尾模式检测、伏笔超期追踪、场景衔接
- 全书批量检测（BookChecker）

### Changed
- 重构检测模块为可插拔架构
- 优化 prompt builder，注入更多网文知识

## [3.3.0] - 2026-06

### Added
- 全书上下文（BookContext）多章分析
- 跨章警告系统

## [3.2.0] - 2026-06

### Added
- 身体锚点三级质量分级体系
- 7维写作雷达评分
- 35项网文质量规则

## [3.0.0] - 2026-05

### Added
- 核心写作引擎：LLM 驱动的章节生成
- 22个配置节点 + 18个内置预设
- Prompt Builder：自动注入网文知识
- OpenAI 兼容 LLM Provider
- CLI 命令行工具
- 浏览器端运行支持