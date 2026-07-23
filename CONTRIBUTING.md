# Contributing to InkWeave

感谢你对 InkWeave（墨织）的关注！我们欢迎所有形式的贡献。

## 如何贡献

### 报告 Bug

如果你发现了 bug，请在 GitHub Issues 中提交，并包含以下信息：

- 你的 Node.js 版本和操作系统
- InkWeave 版本
- 复现步骤
- 期望行为 vs 实际行为
- 相关的章节文本（如果涉及检测结果）

### 提交功能建议

欢迎提交功能建议！请描述：

- 你想解决什么问题
- 你期望的功能是什么样的
- 为什么这个功能对网文作者有帮助

### 贡献代码

1. Fork 本仓库
2. 创建你的特性分支：`git checkout -b feat/amazing-feature`
3. 提交你的改动：`git commit -m 'feat: add amazing feature'`
4. 推送到分支：`git push origin feat/amazing-feature`
5. 提交 Pull Request

### 贡献网文知识

InkWeave 的知识库（KB）是引擎的核心。你可以贡献：

- **新的题材预设**：如果你熟悉某个平台或题材的写作风格，可以提交预设文件
- **新的检测规则**：如果你发现了网文写作中常见的质量模式
- **词汇库扩展**：填充词、感官词、套路词等

### 开发指南

```bash
# 安装依赖
npm install

# 开发模式（热更新）
npm run dev

# 运行测试
npm test

# 测试一个章节
npm run check -- 你的章节.txt
```

### Commit 规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/)：

- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档更新
- `refactor:` 代码重构
- `test:` 测试相关
- `chore:` 构建/工具相关

### 代码风格

- TypeScript 严格模式
- 所有公开 API 必须有 JSDoc 注释
- 新模块必须有对应的单元测试

## 许可证

贡献的代码将采用 MIT 许可证。