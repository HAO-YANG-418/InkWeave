/**
 * 写前分析脚本 v4.9
 * 自动化6步写前分析流程中的机械部分，输出结构化模板供LLM填写
 * 用法：npx tsx 检测工具/pre-analysis.ts <章节号> [目标字数] [--project <项目名>]
 * 示例：npx tsx 检测工具/pre-analysis.ts 13 3000 --project 裂日
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getProjectPath, resolveProjectRelative } from './project-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let PROJECT_PATH = '';

export function resolveProjectDir(projectName?: string): void {
  PROJECT_PATH = getProjectPath(projectName);
}

function chapterDir(): string {
  return path.join(PROJECT_PATH, '章节');
}

function outlineFile(): string {
  return path.join(PROJECT_PATH, '大纲');
}

function foreshadowFile(): string {
  return path.join(PROJECT_PATH, '伏笔', '伏笔追踪表.md');
}

function intentStrategyFile(): string {
  return path.join(PROJECT_PATH, '详细规则', '意图策略.md');
}

// ============================================================
// 工具函数
// ============================================================

function readFileSafe(filePath: string): string {
  try { return fs.readFileSync(filePath, 'utf-8'); }
  catch { return ''; }
}

function listChapters(): { num: number; name: string; file: string }[] {
  const dir = chapterDir();
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && /^第\d+章/.test(f));
  return files.map(f => {
    const match = f.match(/^第(\d+)章\s*(.+)\.md$/);
    return { num: parseInt(match![1]), name: match![2], file: f };
  }).sort((a, b) => a.num - b.num);
}

function countWords(text: string): number {
  return text.replace(/\s+/g, '').replace(/[^\u4e00-\u9fff\w]/g, '').length;
}

function extractParagraphs(text: string): string[] {
  return text.split(/\n\n+/).filter(p => p.trim().length > 0);
}

// ============================================================
// 第0步：风格配方（读取书籍配置+预设，注入每章生成约束）
// ============================================================

function loadBookConfig(): { preset: string; nodes: { node: string; option: string }[] } {
  const bookDir = path.join(PROJECT_PATH, '书籍配置');
  let configFile = '';
  if (fs.existsSync(bookDir)) {
    const cf = fs.readdirSync(bookDir).filter(f => f.endsWith('.config.md'));
    const projBase = path.basename(PROJECT_PATH).replace(/^项目_/, '');
    configFile = path.join(bookDir, cf.find(f => f === `${projBase}.config.md`) || cf[0]);
  }
  const raw = readFileSafe(configFile);
  const presetMatch = raw.match(/\*\*预设\*\*[：:]\s*`([^`]+)`/);
  const preset = presetMatch ? presetMatch[1].trim() : '';
  const nodes: { node: string; option: string }[] = [];
  for (const line of raw.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
    if (cells.length >= 2 && cells[0] !== '节点' && !/^[-: ]+$/.test(cells[0])) {
      nodes.push({ node: cells[0], option: cells[1].replace(/`/g, '') });
    }
  }
  return { preset, nodes };
}

function extractSection(raw: string, title: string): string {
  const re = new RegExp(`##\\s*${title}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'm');
  const m = raw.match(re);
  return m ? m[1].trim() : '';
}

function loadPreset(presetName: string): { core: string; constraints: string; vocabPath: string } {
  if (!presetName) return { core: '', constraints: '', vocabPath: '' };
  const presetDir = path.resolve(PROJECT_PATH, '..', '知识库', '预设');
  let presetFile = path.join(presetDir, `${presetName}.md`);
  if (!fs.existsSync(presetFile)) {
    // 容错：配置里的预设名可能带"调校版"等后缀，实际文件名不含
    const base = presetName.replace(/[（(][^（(]*$/, '').trim();
    const match = fs.readdirSync(presetDir).find(f => f.startsWith(base) && f.endsWith('.md'));
    if (match) presetFile = path.join(presetDir, match);
  }
  const raw = readFileSafe(presetFile);
  return {
    core: extractSection(raw, '核心指令').slice(0, 700),
    constraints: extractSection(raw, '约束规则'),
    vocabPath: raw.includes('专属词汇') ? `知识库/预设/${presetName}.md → 专属词汇` : '',
  };
}

export function step0StyleRecipe(chapterNum: number): string {
  const cfg = loadBookConfig();
  const preset = cfg.preset || '（未绑定预设，使用通用默认）';
  const p = loadPreset(cfg.preset);

  // 章号轮换：对抗"堆砌递进体"单调 + P0 去均匀腔（五感皆可主导，制造章节起伏）
  const allSenses = ['视觉', '听觉', '触觉', '嗅觉', '味觉'];
  const dominantSense = allSenses[chapterNum % 5];
  const rhetoricVariant = (chapterNum % 2 === 0)
    ? '允许2处非常规修辞（比喻/通感）作变奏，让画面更活'
    : '修辞从简，以精准名词动词撑画面（不是禁用修辞——该用就用，别为"简"把话说含糊）';
  const shotFocus = ['动作', '环境', '心理'][chapterNum % 3];

  let output = `## 第0步：风格配方（预设驱动 · 本章多样性）

### 本书预设：${preset}
${p.core || '（预设核心指令为空，请在生成指令.md 铁则基础上写作）'}

### 预设硬约束快照（生成时逐条遵守）：
- 感官基调起伏（P0 去均匀腔）：本章基调感官 = **${dominantSense}**，该感官可主导分布（占比可>45%），制造章节间起伏；但每场景仍需穿插≥1处非基调感官（防单一霸权），且跨章基调不连续同型（已自动轮换）。
- 锚点密度：身体/具体锚点是**参考值不是计数任务**——人物在场就该有动作和身体反应，别为凑数硬塞"他攥紧拳头"（检测器仅对明显稀松给 warning，生成端不用数）
- 数据锚点：适中（不过密不过疏）
- 修辞风格：以精准名词动词为主（这是**表达习惯不是禁令**——比喻/通感该用就用，禁的是堆砌形容词和华丽辞藻堆氛围）；信息密度：每章要有实实在在的新信息推进（设定/伏笔/关系变化都算），**不要为凑指标硬塞无关信息**

### 本章多样性指令（章号自动轮换，防堆砌）：
- 本章感官基调：**${dominantSense}**（可主导分布；非基调感官每场景至少1处点缀，避免单一霸权）
- 动词多样性（防排比误伤）：主导感官用**多样动词**表达，别让同一说法反复出现。示例——听觉：听见/听到/传来/响起/捕捉到/耳边是/风里裹着；触觉：触到/摸到/感到/皮肤记着/掌心发紧；嗅觉：闻到/飘来/钻进鼻腔/空气里都是。同类排比至多2处，多余处换为动作/环境句式（这是**防单调的提醒，不是硬禁令**——读着顺就保留）。
- 质感多样性（P0 防均匀腔）：身体/材质感受词随场景轮换，禁止"凉/麻/颤"循环成套路；不同情绪匹配不同质感词库。
- 修辞变奏：${rhetoricVariant}
- 镜头侧重轮换：**${shotFocus}**（与上章不同型，防连续同型镜头）

### 已选节点（风格锚，详见各节点选项文件）：
`;
  if (cfg.nodes.length > 0) {
    output += '| 节点 | 选项 |\n|------|------|\n';
    for (const n of cfg.nodes) output += `| ${n.node} | ${n.option} |\n`;
  } else {
    output += '（未解析到节点选择，请检查书籍配置）\n';
  }
  if (p.constraints) output += `\n### 预设专属约束（必须遵守）：\n${p.constraints}\n`;
  if (p.vocabPath) output += `\n### 专属词汇：加载 ${p.vocabPath}（写作时优先使用本书术语）\n`;
  output += `\n**门禁#0**：预设核心指令与硬约束快照必须读完，未读禁止进入第1步。\n`;
  return output;
}

// ============================================================
// 第1步：意图分析（读取规则文件，输出模板）
// ============================================================

function step1IntentAnalysis(chapterNum: number): string {
  const strategyFile = intentStrategyFile();
  const strategy = readFileSafe(strategyFile);
  const hasStrategy = strategy.length > 0;

  return `## 第1步：意图分析

${hasStrategy ? `已加载意图策略文件（${strategyFile}）` : '⚠️ 意图策略文件未找到，请手动分析'}

请确认本章意图：

\`\`\`
意图：[战斗/冲突/铺垫/收获/爽点/悬念/过渡]
情绪基调：[XX%]
节奏：[短句/混合/长句]
禁止模板：[从意图策略中提取]
开头策略：[2选1，不重复上章]
钩子策略：[意图专属钩子4选1，不重复上3章]
\`\`\`

### 上3章意图参考（防重复）：
${getRecentIntents(chapterNum)}
`;
}

function getRecentIntents(chapterNum: number): string {
  const dir = chapterDir();
  const lines: string[] = [];
  for (let i = Math.max(1, chapterNum - 3); i < chapterNum; i++) {
    const files = fs.readdirSync(dir);
    const matches = files.filter(f => f.startsWith(`第${i}章`) && f.endsWith('.fingerprint.json'));
    if (matches.length > 0) {
      try {
        const fp = JSON.parse(fs.readFileSync(path.join(dir, matches[0]), 'utf-8'));
        lines.push(`- 第${i}章：开头策略=${fp.openingStrategy || '未知'}，钩子=${fp.hookStrategy || '未知'}`);
      } catch {
        lines.push(`- 第${i}章：无指纹数据`);
      }
    } else {
      lines.push(`- 第${i}章：无指纹数据`);
    }
  }
  return lines.join('\n') || '(无上章数据)';
}

// ============================================================
// 第2步：冷却检测（读取冷却模式库，标记已用模式）
// ============================================================

function step2CoolingCheck(chapterNum: number): string {
  const coolingFile = path.resolve(PROJECT_PATH, '..', '知识库', '数据', '冷却模式库.md');
  const coolingData = readFileSafe(coolingFile);
  const hasCooling = coolingData.length > 0;

  const dir = chapterDir();
  const usedPatterns: string[] = [];
  for (let i = Math.max(1, chapterNum - 3); i < chapterNum; i++) {
    const files = fs.readdirSync(dir);
    const matches = files.filter(f => f.startsWith(`第${i}章`) && f.endsWith('.fingerprint.json'));
    if (matches.length > 0) {
      try {
        const fp = JSON.parse(fs.readFileSync(path.join(dir, matches[0]), 'utf-8'));
        if (fp.coolingPatterns) usedPatterns.push(...fp.coolingPatterns);
      } catch {}
    }
  }

  return `## 第2步：冷却检测

${hasCooling ? `已加载冷却模式库（${coolingFile}）` : '⚠️ 冷却模式库未找到，请手动对照'}

### 上3章已用模式（自动提取）：
${usedPatterns.length > 0 ? usedPatterns.map(p => `- ${p}`).join('\n') : '(无指纹数据，请手动对照)'}

### 冷却清单（请逐项填写）：

\`\`\`
## 冷却清单
- 禁用开篇模式（5章冷却）：[列出]
- 禁用战斗描写（3章冷却）：[列出]
- 禁用情绪陈词（3章冷却）：[列出]
- 禁用转折信号（2-3章冷却）：[列出]
- 禁用对手原型（8章冷却）：[列出]
- 禁用效果修饰（3章冷却）：[列出]
- 禁用对话套路（4-5章冷却）：[列出]
- 禁用心理描写（3章冷却）：[列出]
- 禁用环境描写（3-4章冷却）：[列出]
- 禁用情节模板（8-12章冷却）：[列出]
\`\`\`

**门禁#2**：冷却清单不能为空。空清单=未加载，禁止进入生成。
`;
}

// ============================================================
// 第3步：前文衔接（自动读取上3章+伏笔表）
// ============================================================

function step3Continuity(chapterNum: number): string {
  const chapters = listChapters();
  const recentChapters = chapters.filter(c => c.num < chapterNum).slice(-3);

  let output = `## 第3步：前文衔接

### 上3章基本信息（自动提取）：
`;

  for (const ch of recentChapters) {
    const text = readFileSafe(path.join(chapterDir(), ch.file));
    const wordCount = countWords(text);
    const paragraphs = extractParagraphs(text);
    const lastPara = paragraphs[paragraphs.length - 1] || '';

    output += `- **第${ch.num}章 ${ch.name}**：${wordCount}字，末段="${lastPara.slice(0, 80)}..."\n`;
  }

  // 收束模式轮换
  const closureModes = ['手→物', '眼→光', '脚→地', '骨→热', '剑→血'];
  const lastModeIdx = (chapterNum - 2) % closureModes.length;
  const nextModeIdx = (chapterNum - 1) % closureModes.length;

  output += `
### 收束模式轮换（自动计算）：
- 上章用：${closureModes[lastModeIdx]}
- 本章用：**${closureModes[nextModeIdx]}**

### 伏笔追踪（从伏笔表读取）：
`;

  const foreshadow = readFileSafe(foreshadowFile());
  if (foreshadow) {
    // 提取到期伏笔
    const lines = foreshadow.split('\n');
    const dueLines = lines.filter(l => l.includes(`Ch${chapterNum}`) || l.includes(`第${chapterNum}章`));
    output += dueLines.length > 0 ? dueLines.join('\n') : '(未找到本章到期伏笔，请手动确认)';
  } else {
    output += '⚠️ 伏笔追踪表未找到';
  }

  output += `

### 请手动填写：
\`\`\`
- 未解决冲突：[列出需要本章推进的冲突]
- 角色状态：[各角色当前位置、身体状态、情绪状态]
\`\`\`
`;
  return output;
}

// ============================================================
// 第4步：镜头链规划模板
// ============================================================

function step4ShotChain(chapterNum: number, targetWords: number): string {
  const outlineDir = outlineFile();
  let outline = '';
  // 查找大纲目录下的 .md 文件
  if (fs.existsSync(outlineDir)) {
    const outlineFiles = fs.readdirSync(outlineDir).filter(f => f.endsWith('.md'));
    if (outlineFiles.length > 0) {
      outline = readFileSafe(path.join(outlineDir, outlineFiles[0]));
    }
  }

  let chapterOutline = '';

  if (outline) {
    const lines = outline.split('\n');
    let inChapter = false;
    for (const line of lines) {
      if (line.includes(`第${chapterNum}章`) || line.includes(`Ch${chapterNum}`)) {
        inChapter = true;
        chapterOutline += line + '\n';
      } else if (inChapter) {
        if (line.includes(`第${chapterNum + 1}章`) || line.includes(`Ch${chapterNum + 1}`) || line.match(/^#{1,3}\s/)) {
          break;
        }
        chapterOutline += line + '\n';
      }
    }
  }

  return `## 第4步：镜头链规划

### 大纲参考（自动提取）：
\`\`\`
${chapterOutline.trim() || '(未找到本章大纲，请手动查阅)'}
\`\`\`

### 镜头链表格（请填写，4-6场景）：

| 场景 | 镜头类型 | 字数 | 核心任务 |
|------|---------|------|---------|
| 1. [场景名] | [移动/触摸/信息/压力/对话/收束] | XXX | [一句话描述] |
| 2. [场景名] | [镜头类型] | XXX | [核心任务] |
| 3. [场景名] | [镜头类型] | XXX | [核心任务] |
| 4. [场景名] | [镜头类型] | XXX | [核心任务] |
| 5. [场景名] | [镜头类型] | XXX | [核心任务] |
| 6. [场景名] | [镜头类型] | XXX | [核心任务] |

总预估字数：____（目标：${targetWords}，目标±10%：${Math.floor(targetWords * 0.9)}-${Math.ceil(targetWords * 1.1)}）

### 第4.5步：规划自检

| # | 检查项 | 阈值 | 状态 |
|---|--------|------|------|
| 1 | 场景数量 | 4-6个 | [ ] |
| 2 | 对话场景占比 | ≤2个对话镜头 | [ ] |
| 3 | 字数预估 | 目标±10% | [ ] |
| 4 | 镜头类型多样性 | ≥3种镜头类型 | [ ] |

**门禁**：4项全部 ✅ → 进入第5步。任一 ❌ → 调整规划后重新自检。
`;
}

// ============================================================
// 第5步：生成简报模板
// ============================================================

function step5Brief(): string {
  return `## 第5步：生成简报

汇总以上分析，填入生成指令的「本章简报」区域：

\`\`\`
- 本章意图：[类型] | 情绪：[XX%] | 节奏：[...]
- 核心冲突：[从哪到哪]
- 开头策略：[...]
- 钩子策略：[...]
- 禁用：[冷却清单摘要]
- 收束模式：[本章用X]
- 到期伏笔：[...]
- 外部压力：[...]
\`\`\`
`;
}

// ============================================================
// 第6步：规则加载门禁
// ============================================================

function step6Gates(chapterNum: number): string {
  return `## 第6步：规则加载门禁（生成前强制执行）

| # | 门禁项 | 加载来源 | 状态 |
|---|--------|---------|------|
| 1 | 意图策略 | 详细规则/意图策略.md | [ ] |
| 2 | 冷却清单 | 知识库/数据/冷却模式库.md | [ ] |
| 3 | 镜头链规划 | 本章第4步输出 | [ ] |
| 4 | 镜头链参考 | 详细规则/镜头链.md | [ ] |
| 5 | 预设约束 | 书籍配置/裂日.config.md | [ ] |
| 6 | 前文衔接 | 上3章正文 | [ ] |
| 7 | 反思标准 | 知识库/数据/反思评估标准.md | [ ] |
| 8 | 节奏预热 | 生成指令.md 第〇步 | [ ] |

**门禁通过条件**：8项全部 ✓ → 进入生成。任一 ✗ → 补充加载该项后重新检查。
`;
}

// ============================================================
// 质量指纹注入（从上一章fingerprint提取）
// ============================================================

// ============================================================
// 档1 · 全局矩阵驱动注入（反向闭环 §3.1）
// 读 health-matrix.json 聚合全书违规分布，生成"全书级避雷清单"，
// 与上章单点 reactive（injectFingerprint 七类硬约束）互补去重。
// 风险约束（反向闭环方案 §6）：聚合字段须对齐 health-report.ts:108/:191 真实结构
// —— 顶层 ChapterHealth[]，每章 violationCounts: Record<ruleId, {error,warning,info}>，
// 键名经 normalizeRuleId（RULE_ID_MAP）归一化。
// 优雅降级：矩阵文件不存在/解析失败 → 返回空，不阻断生成。
// ============================================================

interface MatrixSeverityCount { error: number; warning: number; info: number; }
interface MatrixChapter { chapter: string; violationCounts?: Record<string, MatrixSeverityCount>; [k: string]: any; }

// 全局清单跳过的"已被上章单点 reactive 确定为硬约束"类别（避免信号重复压垮 LLM）
// 对应 RULE_ID_MAP 归一化键：comma_chain / forbidden_char / not_shi_pattern / sense_density
const REACTIVE_HARDSET = new Set<string>([
  'comma_chain',        // 逗号链（确定性违规，injectFingerprint 已管）
  'forbidden_char',     // 破折号（确定性违规，injectFingerprint 已管）
  'not_shi_pattern',    // 不是X是Y（确定性违规，injectFingerprint 已管）
  'sense_density',      // 感官失衡（v4.9 硬约束，injectFingerprint 已管）
]);

const BOOKWIDE_MAX = 5;

// 全书高发项的"可操作避雷提示"（仅提示，不改铁则硬值）
const BOOKWIDE_AVOID_HINTS: Record<string, string> = {
  word_count_short: '全书"短而空"高发 → 本章务必充实：每镜头补场景细节/对话/内心活动/感官，禁止薄写。',
  word_count_below: '全书字数偏低 → 本章朝目标字数推进，镜头链写满。',
  word_count_long: '全书章节偏长 → 本章注意裁剪冗余，保持节奏。',
  data_anchor: '全书数据/事实锚点失衡 → 本章关键设定给具体数值/名称锚定，避免空泛。',
  sentence_waveform: '全书句波单一 → 本章长短句轮换，避免同一句式反复。',
  character_voice: '全书角色声口混淆 → 本章不同角色用词/语气明显区分。',
  action_rollcall: '全书动作点名过多 → 本章减少"谁做了什么"的罗列感。',
  exclamation_quota: '全书感叹号过量 → 本章克制感叹，情绪靠描写传递。',
  golden_300: '全书开篇 300 字钩子弱 → 本章开头直接抛冲突/悬念。',
  twist_gap: '全书转折密度不足 → 本章至少一处认知翻转。',
  ending_hook: '全书结尾钩子弱 → 本章收尾留悬念拉回读。',
  opening_impact: '全书开场冲击不足 → 本章首句砸下强事件。',
  dialogue_ratio: '全书对话占比失衡 → 本章对话与叙述交替，不连篇对话。',
  monologue_ratio: '全书独白占比失衡 → 本章减少内心独白堆砌。',
  sensory_coverage: '全书感官覆盖不足 → 本章多感官穿插。',
  sensory_balance: '全书感官失衡 → 本章非视觉感官也补上。',
  fragmented_sentences: '全书碎句过多 → 本章适度合并短句，保连贯。',
};

export function readHealthMatrix(matrixPath?: string): { ruleId: string; error: number; warning: number; info: number; weight: number }[] {
  const p = matrixPath || '检测工具/health-matrix.json';
  if (!fs.existsSync(p)) return [];
  try {
    const matrix = JSON.parse(fs.readFileSync(p, 'utf-8')) as MatrixChapter[];
    if (!Array.isArray(matrix)) return [];
    const agg: Record<string, MatrixSeverityCount> = {};
    for (const ch of matrix) {
      const vc = ch.violationCounts || {};
      for (const [ruleId, sc] of Object.entries(vc)) {
        if (!agg[ruleId]) agg[ruleId] = { error: 0, warning: 0, info: 0 };
        agg[ruleId].error += sc.error || 0;
        agg[ruleId].warning += sc.warning || 0;
        agg[ruleId].info += sc.info || 0;
      }
    }
    const result = Object.entries(agg).map(([ruleId, sc]) => ({
      ruleId,
      error: sc.error,
      warning: sc.warning,
      info: sc.info,
      weight: sc.error * 3 + sc.warning * 1, // 加权：error×3 + warning×1（反向闭环方案 §3.1）
    }));
    result.sort((a, b) => b.weight - a.weight);
    return result;
  } catch (e) {
    return [];
  }
}

export function buildBookWideAvoidList(): string {
  const ranked = readHealthMatrix().filter(x => !REACTIVE_HARDSET.has(x.ruleId));
  if (ranked.length === 0) return '';
  const top = ranked.slice(0, BOOKWIDE_MAX);
  let block = `\n### 全书级避雷清单（统计驱动，全局常犯补充）\n\n`;
  block += `> 以下为全书违规分布中最高发、且未被上章单点 reactive 覆盖的项。仅作提示，不改铁则硬值。\n\n`;
  for (const item of top) {
    const hint = BOOKWIDE_AVOID_HINTS[item.ruleId] ||
      `本书"${item.ruleId}"类违规全书累计 ${item.error} error / ${item.warning} warning → 本章针对性规避，保持该维度质量。`;
    block += `- **${item.ruleId}**（全书 ${item.error}error/${item.warning}warning）：${hint}\n`;
  }
  block += '\n';
  return block;
}

function injectFingerprint(chapterNum: number): string {
  const prevChapter = chapterNum - 1;
  const dir = chapterDir();
  if (!fs.existsSync(dir)) return `## 质量指纹注入\n\n⚠️ 章节目录不存在：${dir}\n`;
  const files = fs.readdirSync(dir);
  const matches = files.filter(f => f.startsWith(`第${prevChapter}章`) && f.endsWith('.fingerprint.json'));

  if (matches.length === 0) {
    return `## 质量指纹注入

⚠️ 第${prevChapter}章无指纹文件。请先运行：
\`npx tsx 检测工具/check-chapter.ts ${prevChapter} --save-fingerprint\`
`;
  }

  try {
    const fp = JSON.parse(fs.readFileSync(path.join(dir, matches[0]), 'utf-8'));
    const errorCount = Array.isArray(fp.errors) ? fp.errors.length : (fp.errors || 0);
    const warningCount = Array.isArray(fp.warnings) ? fp.warnings.length : (fp.warnings || 0);
    const dashes = fp.dashes ?? 0;
    const notXButY = fp.notXButY ?? 0;
    const commaRatio = fp.commaChainRatio ?? 0;
    const violations = fp.rawViolations || [];
    const stylePatterns = fp.stylePatterns || {};

    let output = `## 质量指纹注入（第${prevChapter}章 → 第${chapterNum}章）

### 上一章检测结果：
- Error：${errorCount} | Warning：${warningCount}
- 破折号：${dashes} | "不是X是Y"：${notXButY} | 逗号/句号比：${commaRatio || '未知'}
- 字数：${fp.wordCount || '未知'} / 目标${fp.targetWords || '未知'}

### 本章禁忌（硬约束，生成时逐条检查）：

`;

    // 优先级1：排比堆叠（风格多样性 — 核心问题）
    // v4.9 升级：附反例原句 + 正例模板
    if (stylePatterns.verbStacking && stylePatterns.verbStacking.length > 0) {
      const verbMsgs = stylePatterns.verbStacking.map((v: any) => v.message);
      output += `**🔴 排比堆叠（最高优先级）**\n`;
      output += `- 上章检测到：${verbMsgs.join('；')}\n`;

      // 提取反例原句（从 rawViolations 中匹配 style_stacking_verb）
      const verbViolation = violations.find((v: any) => v.ruleId === 'style_stacking_verb');
      if (verbViolation && verbViolation.fixes) {
        output += `- 反例（上章原文）：\n`;
        for (const fix of verbViolation.fixes.slice(0, 2)) {
          const sample = fix.before.length > 30 ? fix.before.substring(0, 30) + '…' : fix.before;
          output += `  ✗ ${sample}\n`;
        }
      }
      // 正例模板
      output += `- 正例（本章替代写法）：\n`;
      output += `  ✓ 分镜式：先写动作落点换句号，再写环境回应换句号，最后给一次感官收束。\n`;
      output += `  ✓ 示例："他伸手按住裂痕。墙壁传来低沉的嗡鸣。掌心里骨头在升温。"（非排比3句）\n`;
      output += `- 本章硬约束：每场景至多1处排比。超过1处换句型。\n\n`;
    }

    if (stylePatterns.nameStacking && stylePatterns.nameStacking.length > 0) {
      const nameMsgs = stylePatterns.nameStacking.map((v: any) => v.message);
      output += `**🟡 段落开头重复**\n`;
      output += `- 上章检测到：${nameMsgs.join('；')}\n`;
      output += `- 正例：动作起头→感官起头→环境起头→对话起头，轮换开头方式。\n`;
      output += `- 本章硬约束：禁止连续3段同一主角名开头。\n\n`;
    }

    if (stylePatterns.deDensity && stylePatterns.deDensity.length > 0) {
      output += `**🟡 "的"字堆砌**\n`;
      output += `- 上章检测到${stylePatterns.deDensity.length}段"的"字密度过高\n`;
      output += `- 正例：拆"X的Y"为独立短句或动作描写——"林深掌心里裂开的缝"→"林深掌心裂开一道缝"。\n`;
      output += `- 本章硬约束：每3个"的"至少换一次句式。\n\n`;
    }

    // 优先级1.5：感官密度（v4.9 新增）——从"其他参考"升级为独立禁忌
    const senseViolation = violations.find((v: any) => v.ruleId === 'sense_density_balance');
    if (senseViolation) {
      const dominantSense = ['视觉', '听觉', '触觉', '嗅觉', '味觉'][chapterNum % 5];
      output += `**🔴 感官密度失衡（v4.9 硬约束）**\n`;
      output += `- ${senseViolation.message}\n`;
      output += `- 正例：每场景至少穿插1次非视觉感官——听觉（环境音/呼吸声）、触觉（温度/材质/震动）、嗅觉（焦味/腥味/粉末味）。\n`;
      output += `- 本章感官基调 = ${dominantSense}（可主导分布）；每场景至少1处非基调感官。视觉占比不强制≤45%，但单一感官不可全程霸权。\n\n`;
    }

    // 优先级2：确定性违规（破折号/不是X是Y/逗号链）
    let hasHardConstraint = false;
    if (dashes > 0) {
      if (!hasHardConstraint) { output += `**🔴 确定性违规**\n`; hasHardConstraint = true; }
      output += `- 上章有${dashes}处破折号 → 本章铁则十二强化：破折号每章≤2处作节奏破格（情绪陡转/对话截断），超出的第3处起用逗号替代（认知翻转用逗号，对话中断用动作打断）。\n`;
    }
    if (notXButY > 0) {
      if (!hasHardConstraint) { output += `**🔴 确定性违规**\n`; hasHardConstraint = true; }
      output += `- 上章有${notXButY}处"不是X是Y" → 本章禁止该句式。正例：直接写Y的具体表现，跳过"不是X"绕弯。\n`;
    }
    if (commaRatio > 5.0) {
      if (!hasHardConstraint) { output += `**🟡 逗号链**\n`; hasHardConstraint = true; }
      output += `- 上章逗号/句号比${commaRatio}偏高 → 本章只禁"一逗到底"（一口气连写不换气）；读着顺的连写保留，严禁为压低逗句比把句子剁碎。\n`;
    }
    if (hasHardConstraint) output += '\n';

    // 优先级3：其他违规参考（排除已单独处理的 sense_density）
    const otherViolations = violations.filter((v: any) => {
      const id = v.ruleId || '';
      return !id.startsWith('style_stacking') &&
             id !== 'forbidden_char' &&
             id !== 'not_shi_pattern' &&
             id !== 'comma_chain' &&
             id !== 'comma_chain_long' &&
             id !== 'sense_density_balance';
    });
    if (otherViolations.length > 0) {
      output += `**🔵 其他参考**\n`;
      for (const v of otherViolations.slice(0, 5)) {
        output += `- ${v.severity === 'error' ? '❌' : '⚠️'} ${v.ruleName}：${v.message}\n`;
      }
      output += '\n';
    }

    // P1（v5.0）：长程事实约束 —— 从上章 facts 注入待回收伏笔 + 出场角色，防悬念链断裂
    const prevFacts = fp.facts;
    if (prevFacts) {
      const pending = Array.isArray(prevFacts.pendingForeshadow) ? prevFacts.pendingForeshadow : [];
      const chars = Array.isArray(prevFacts.characters) ? prevFacts.characters.filter((c: any) => c.present) : [];
      let factBlock = '**🟢 长程事实约束（v5.0 新增）**\n';
      let hasFact = false;
      if (pending.length > 0) {
        factBlock += `- 上章埋下 ${pending.length} 处未回收伏笔/悬念，本章**至少回收或延续一条**（如结尾回扣其中一个悬念，或埋新伏笔替代）：\n`;
        for (const p of pending.slice(0, 3)) {
          factBlock += `  · ……${p}……\n`;
        }
        hasFact = true;
      }
      if (chars.length > 0) {
        factBlock += `- 上章出场角色（本章需保持状态连续，勿无交代突变）：${chars.map((c: any) => c.name).join('、')}\n`;
        hasFact = true;
      }
      if (prevFacts.timeAnchors && prevFacts.timeAnchors.length > 0) {
        factBlock += `- 上章时间锚：${prevFacts.timeAnchors.slice(0, 4).join('、')}（本章时间推进需有过渡交代）\n`;
        hasFact = true;
      }
      if (hasFact) output += factBlock + '\n';
    }

    if (errorCount === 0 && warningCount === 0 && dashes === 0 && notXButY === 0 && commaRatio <= 3.0) {
      output += `✅ 上章无关键违规，本章维持标准约束。\n`;
    }

    // 档1（反向闭环 §3.1）：合并全局矩阵驱动的全书级避雷清单
    // 与上章单点 reactive 互补去重（REACTIVE_HARDSET 跳过），拼入同一契约段（呼应 :619 单一契约）
    output += buildBookWideAvoidList();

    return output;
  } catch (e) {
    return `## 质量指纹注入\n\n⚠️ 指纹文件读取失败：${e}\n`;
  }
}

// ============================================================
// 主流程
// ============================================================

function main() {
  const args = process.argv.slice(2);
  let projectName: string | undefined;

  // Parse --project
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && i + 1 < args.length) {
      projectName = args[i + 1];
      args.splice(i, 2);
      break;
    }
  }

  const chapterNum = parseInt(args[0]);
  const targetWords = parseInt(args[1]) || 3000;

  if (!chapterNum || chapterNum < 1) {
    console.log('用法：npx tsx 检测工具/pre-analysis.ts <章节号> [目标字数] [--project <项目名>]');
    console.log('示例：npx tsx 检测工具/pre-analysis.ts 13 3000 --project 裂日');
    process.exit(1);
  }

  // 解析项目路径
  resolveProjectDir(projectName);

  console.log('╔══════════════════════════════════════╗');
  console.log(`║   写前分析 v5.0 — 第${chapterNum}章         ║`);
  console.log(`║   目标字数：${targetWords}                    ║`);
  console.log(`║   项目路径：${PROJECT_PATH}                    ║`);
  console.log('╚══════════════════════════════════════╝\n');

  // 第0步：合并风格契约（预设配方 + 上章指纹禁忌 → 单一段落，避免信号分裂）
  console.log('## 第0步：本章风格契约（预设配方 + 上章指纹禁忌合并）\n');
  console.log('> 以下为本章生成前必须读完的硬约束。上半部分 = 预设 + 多样性轮换，下半部分 = 上章检测到的具体问题（含反例/正例），合并为单一契约避免 LLM 只看一段。\n');
  console.log(step0StyleRecipe(chapterNum));
  console.log(injectFingerprint(chapterNum));
  console.log('---\n*门禁#0*：以上风格契约全部读完并理解后，方可进入第1步。\n');

  // 第1步：意图分析
  console.log(step1IntentAnalysis(chapterNum));

  // 第2步：冷却检测
  console.log(step2CoolingCheck(chapterNum));

  // 第3步：前文衔接
  console.log(step3Continuity(chapterNum));

  // 第4步：镜头链规划
  console.log(step4ShotChain(chapterNum, targetWords));

  // 第5步：生成简报
  console.log(step5Brief());

  // 第6步：门禁
  console.log(step6Gates(chapterNum));

  console.log('═══════════════════════════════════════');
  console.log('写前分析模板生成完毕。请按步骤填写 [ ] 标记项。');
  console.log('全部通过后，将本章简报填入生成指令.md 的「本章简报」区域。');
  console.log('═══════════════════════════════════════');
}

// 仅当直接运行时执行 main()，import 时不触发
const isMain = process.argv[1] && (process.argv[1].endsWith('pre-analysis.ts') || process.argv[1].endsWith('pre-analysis.js'));
if (isMain) main();