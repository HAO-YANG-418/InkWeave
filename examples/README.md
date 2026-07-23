# InkWeave 示例

这个目录包含 InkWeave 引擎的示例文本，你可以用它们来测试引擎的检测能力。

## 示例文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `miner-style.txt` | 高质量网文 | 高密度信息 + 强身体锚点，引擎得分 ~85 |
| `cliche-opening.txt` | 经典套路 | 中规中矩的系统流开局，有一些套路用语 |
| `ai-slop-scenery.txt` | AI 水文 | 成语堆砌 + 空洞写景 + 比喻过密，引擎得分 <60 |
| `test-book.txt` | 多章节 | 用于测试跨章分析功能的多章本书籍 |

## 使用方法

```bash
# 检测单个文件
npx inkweave check examples/miner-style.txt

# 批量检测
npx inkweave check examples/*.txt --json > report.json
```

## 预期结果

- `miner-style.txt` 应该得到 **≥80 分**，违规项少
- `cliche-opening.txt` 应该得到 **75-85 分**，有少量警告
- `ai-slop-scenery.txt` 应该得到 **<60 分**，有大量违规项（成语堆砌、写景开头、比喻过密等）