/**
 * InkWeave 知识库编译脚本 v4.0
 * 
 * 从 源码/kb/nodes/ 下的 .kb.json 文件生成 知识库/节点/ 下的 .md 文件。
 * 同时自动更新 知识库/节点/索引.md。
 * 
 * 用法：npx tsx 源码/compile-kb.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// Node ID → 中文节点名 映射
// ============================================================

const NODE_NAMES: Record<string, string> = {
  'node_ai_continue_length': 'AI续写长度',
  'node_ai_creativity': 'AI创意度',
  'node_anchor_density': '锚点密度',
  'node_battle_style': '战斗风格',
  'node_description_style': '描写风格',
  'node_dialogue_style': '对话风格',
  'node_emotion_style': '情感表达',
  'node_ending_hook': '章末钩子',
  'node_info_density': '信息密度',
  'node_opening_impact': '开头冲击力',
  'node_paragraph_density': '段落密度',
  'node_payoff_frequency': '爽点频率',
  'node_platform': '平台适配',
  'node_pov': '视角',
  'node_rhetoric': '修辞风格',
  'node_sentence_rhythm': '句式节奏',
  'node_strictness': '严格度',
  'node_target_length': '目标字数',
  'node_tone': '语调',
  'node_twist_frequency': '转折频率',
  'node_vocab_filler': '填充词',
  'node_vocab_sensory': '感官词汇',
};

// 节点简短描述
const NODE_DESCRIPTIONS: Record<string, string> = {
  'node_ai_continue_length': '控制AI续写的长度',
  'node_ai_creativity': '控制AI的创意发散程度',
  'node_anchor_density': '控制身体锚点和感官锚点的密度',
  'node_battle_style': '控制战斗场面的描写方式',
  'node_description_style': '控制环境描写的风格和密度',
  'node_dialogue_style': '控制对话的风格和长度',
  'node_emotion_style': '控制情感的表达方式（展示vs告知）',
  'node_ending_hook': '控制章末钩子的类型和强度',
  'node_info_density': '控制信息推进速度',
  'node_opening_impact': '控制每章开头的冲击力',
  'node_paragraph_density': '控制段落的信息密度和长度',
  'node_payoff_frequency': '控制爽点/反转的出现频率',
  'node_platform': '适配不同网文平台的读者偏好',
  'node_pov': '控制叙事视角',
  'node_rhetoric': '控制修辞手法的使用密度',
  'node_sentence_rhythm': '控制句子的长短节奏和断句方式',
  'node_strictness': '控制规则执行的严格程度',
  'node_target_length': '控制每章目标字数',
  'node_tone': '控制整体语调风格',
  'node_twist_frequency': '控制剧情转折的频率',
  'node_vocab_filler': '控制填充词/弱动词的使用限制',
  'node_vocab_sensory': '控制感官词汇的风格偏好',
};

// ============================================================
// 类型定义
// ============================================================

interface KbJson {
  kb_version: string;
  node_id: string;
  option_id: string;
  option_name: string;
  option_description: string;
  system_prompt: string;
  constraints: string[];
  threshold_overrides?: Record<string, number>;
  radar_weights?: Record<string, number>;
  conflicts: string[];
  examples: { text: string; note: string }[];
  requires: string[];
}

// ============================================================
// .md 生成
// ============================================================

function generateMd(json: KbJson): string {
  const nodeName = NODE_NAMES[json.node_id] || json.node_id;
  const lines: string[] = [];

  // 标题
  lines.push(`# ${json.option_name}`);
  lines.push('');

  // 描述 blockquote
  lines.push(`> ${json.option_description}`);
  lines.push(`> 所属节点：${nodeName}`);
  lines.push('');

  // 教学指令
  if (json.system_prompt) {
    lines.push('## 教学指令');
    lines.push('');
    // system_prompt 中的 \n 转为实际换行，单 \n 转为双换行（段落分隔）
    const paragraphs = json.system_prompt.split('\n').filter(p => p.trim());
    for (const p of paragraphs) {
      lines.push(p);
      lines.push('');
    }
  }

  // 约束规则
  if (json.constraints && json.constraints.length > 0) {
    lines.push('### 约束规则');
    lines.push('');
    for (const c of json.constraints) {
      lines.push(`- ${c}`);
    }
    lines.push('');
  }

  // 数值参数
  if (json.threshold_overrides && Object.keys(json.threshold_overrides).length > 0) {
    lines.push('### 数值参数');
    lines.push('');
    lines.push('| 参数 | 值 |');
    lines.push('|------|-----|');
    for (const [key, value] of Object.entries(json.threshold_overrides)) {
      lines.push(`| ${key} | ${value} |`);
    }
    lines.push('');
  }

  // 维度权重
  if (json.radar_weights && Object.keys(json.radar_weights).length > 0) {
    lines.push('### 维度权重');
    lines.push('');
    lines.push('| 维度 | 权重 |');
    lines.push('|------|------|');
    for (const [key, value] of Object.entries(json.radar_weights)) {
      lines.push(`| ${key} | ${value} |`);
    }
    lines.push('');
  }

  // 冲突选项
  if (json.conflicts && json.conflicts.length > 0) {
    lines.push('### 冲突选项');
    lines.push('');
    for (const c of json.conflicts) {
      lines.push(`- ${c}`);
    }
    lines.push('');
  }

  // 范例
  if (json.examples && json.examples.length > 0) {
    lines.push('### 范例');
    lines.push('');
    for (const ex of json.examples) {
      lines.push(`**标注**：${ex.note}`);
      lines.push('');
      lines.push('```');
      lines.push(ex.text);
      lines.push('```');
      lines.push('');
    }
  }

  // 页脚
  lines.push('---');
  lines.push(`*选项ID: ${json.option_id} | 节点: ${json.node_id} | KB版本: ${json.kb_version}*`);

  return lines.join('\n');
}

// ============================================================
// 索引.md 生成
// ============================================================

interface OptionInfo {
  name: string;
  file: string;
}

function generateIndex(nodeOptions: Map<string, OptionInfo[]>): string {
  const lines: string[] = [];
  lines.push('# 知识库节点索引');
  lines.push('');
  lines.push(`共 ${nodeOptions.size} 个节点，${Array.from(nodeOptions.values()).reduce((s, o) => s + o.length, 0)} 个选项。`);
  lines.push('');
  lines.push('## 节点列表');
  lines.push('');

  // 按节点名排序
  const sortedNodes = Array.from(nodeOptions.entries()).sort((a, b) => a[0].localeCompare(b[0], 'zh'));

  for (const [nodeName, options] of sortedNodes) {
    // 找到对应的 node_id
    const nodeId = Object.entries(NODE_NAMES).find(([, name]) => name === nodeName)?.[0] || '';
    const desc = nodeId ? NODE_DESCRIPTIONS[nodeId] || '' : '';

    lines.push(`### ${nodeName}`);
    lines.push('');
    if (desc) {
      lines.push(`> ${desc}`);
      lines.push('');
    }
    lines.push('| 选项 | 文件 |');
    lines.push('|------|------|');
    for (const opt of options) {
      const encoded = encodeURIComponent(opt.file);
      lines.push(`| ${opt.name} | [${opt.file}](${nodeName}/${encoded}) |`);
    }
    lines.push('');
  }

  // 按意图推荐
  lines.push('## 按意图推荐');
  lines.push('');
  lines.push('| 写作意图 | 推荐节点配置 |');
  lines.push('|----------|-------------|');
  lines.push('| 高潮战斗 | 句式节奏:短句爆发 + 战斗风格:重氛围 + 转折频率:密集 |');
  lines.push('| 日常过渡 | 句式节奏:长短交错 + 信息密度:悠闲 + 爽点频率:稀疏 |');
  lines.push('| 揭示真相 | 信息密度:快速 + 转折频率:密集 + 章末钩子:断裂钩子 |');
  lines.push('| 情感冲击 | 情感表达:展示 + 描写风格:诗意 + 修辞风格:隐喻为主 |');
  lines.push('| 对话推进 | 对话风格:简洁 + 语调:冷峻 + 填充词:严格 |');
  lines.push('| 世界构建 | 信息密度:快速 + 描写风格:感官轰炸 + 锚点密度:极高 |');
  lines.push('');

  return lines.join('\n');
}

// ============================================================
// 入口
// ============================================================

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const kbDir = path.join(rootDir, '源码', 'kb', 'nodes');
  const outputDir = path.join(rootDir, '知识库', '节点');

  if (!fs.existsSync(kbDir)) {
    console.error(`源目录不存在：${kbDir}`);
    process.exit(1);
  }

  let totalGenerated = 0;
  const nodeOptions = new Map<string, OptionInfo[]>();

  // 遍历所有节点目录
  const nodeDirs = fs.readdirSync(kbDir).filter(d => {
    const stat = fs.statSync(path.join(kbDir, d));
    return stat.isDirectory();
  });

  for (const nodeDir of nodeDirs) {
    const nodePath = path.join(kbDir, nodeDir);
    const nodeName = NODE_NAMES[nodeDir];
    if (!nodeName) {
      console.warn(`⚠ 未知节点 ${nodeDir}，跳过`);
      continue;
    }

    const outputNodeDir = path.join(outputDir, nodeName);
    if (!fs.existsSync(outputNodeDir)) {
      fs.mkdirSync(outputNodeDir, { recursive: true });
    }

    const options: OptionInfo[] = [];
    const expectedFiles = new Set<string>();

    // 遍历 .kb.json 文件
    const jsonFiles = fs.readdirSync(nodePath).filter(f => f.endsWith('.kb.json'));
    for (const file of jsonFiles) {
      const filePath = path.join(nodePath, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const json: KbJson = JSON.parse(raw);

      const md = generateMd(json);
      const safeName = json.option_name.replace(/[/\\:*?"<>|]/g, '-');
      const outputFile = path.join(outputNodeDir, `${safeName}.md`);
      fs.writeFileSync(outputFile, md, 'utf-8');

      expectedFiles.add(`${safeName}.md`);
      options.push({ name: json.option_name, file: `${safeName}.md` });
      totalGenerated++;
    }

    // 【2026-09-04 修复】清理孤儿 .md：option_name 改名后旧文件不会被覆盖，
    // 会永久残留并误导读者（例：把 opt_length_2200 改名后，"2200字标准（默认）.md"
    // 仍写着 2200 字，与 2800 硬地板直接冲突）。生成后删除本节点目录中
    // 不属于本轮产物、且非人工维护文件的 .md。
    const MANUAL_KEEP = new Set(['README.md', '索引.md']);
    const existing = fs.readdirSync(outputNodeDir).filter(f => f.endsWith('.md'));
    const orphans = existing.filter(f => !expectedFiles.has(f) && !MANUAL_KEEP.has(f));
    for (const orphan of orphans) {
      fs.unlinkSync(path.join(outputNodeDir, orphan));
      console.log(`🧹 清理孤儿文件：${nodeName}/${orphan}`);
    }

    if (options.length > 0) {
      nodeOptions.set(nodeName, options);
    }
  }

  // 生成索引
  const indexMd = generateIndex(nodeOptions);
  const indexFile = path.join(outputDir, '索引.md');
  fs.writeFileSync(indexFile, indexMd, 'utf-8');

  console.log(`✅ 编译完成：${totalGenerated} 个选项 .md → 知识库/节点/`);
  console.log(`✅ 索引已更新：知识库/节点/索引.md (${nodeOptions.size} 个节点)`);
}

main();