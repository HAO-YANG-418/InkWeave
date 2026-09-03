/**
 * InkWeave 项目初始化工具 v4.7
 *
 * 用法：npx tsx 检测工具/init-project.ts <项目名称> [--activate]
 *   --activate  初始化后设为当前活跃项目
 *
 * 生成标准项目目录结构，注册到 .inkweave/project.json。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ============================================================
// 项目配置类型
// ============================================================

interface ProjectEntry {
  name: string;
  path: string;
  createdAt: string;
}

interface ProjectConfig {
  activeProject: string | null;
  projects: Record<string, ProjectEntry>;
}

// ============================================================
// 标准目录结构
// ============================================================

const STANDARD_DIRS = [
  '大纲',
  '设定',
  '伏笔',
  '审稿',
  '章节',
  '技法',
  '详细规则',
  '书籍配置',
];

// ============================================================
// 配置读写
// ============================================================

const INKWEAVE_DIR = path.join(ROOT, '.inkweave');
const CONFIG_FILE = path.join(INKWEAVE_DIR, 'project.json');

function readConfig(): ProjectConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    return { activeProject: null, projects: {} };
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
}

function writeConfig(config: ProjectConfig): void {
  if (!fs.existsSync(INKWEAVE_DIR)) {
    fs.mkdirSync(INKWEAVE_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

// ============================================================
// 主逻辑
// ============================================================

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('InkWeave 项目初始化工具');
    console.log('');
    console.log('用法：');
    console.log('  npx tsx 检测工具/init-project.ts <项目名称> [--activate]');
    console.log('');
    console.log('选项：');
    console.log('  --activate  初始化后设为当前活跃项目');
    console.log('');
    console.log('示例：');
    console.log('  npx tsx 检测工具/init-project.ts 荒古纪元 --activate');
    console.log('  npx tsx 检测工具/init-project.ts 裂日');
    process.exit(0);
  }

  const projectName = args[0];
  const activate = args.includes('--activate');

  // 项目名合法性检查
  if (!/^[\u4e00-\u9fff\w\-]+$/.test(projectName)) {
    console.error('❌ 项目名称只能包含中文、英文、数字、下划线和连字符');
    process.exit(1);
  }

  const config = readConfig();

  // 检查是否已存在
  if (config.projects[projectName]) {
    console.error(`❌ 项目 "${projectName}" 已存在（路径：${config.projects[projectName].path}）`);
    console.log('   如需重新初始化，请先删除 .inkweave/project.json 中的对应条目');
    process.exit(1);
  }

  const projectDirName = `项目_${projectName}`;
  const projectPath = path.join(ROOT, projectDirName);

  if (fs.existsSync(projectPath)) {
    console.error(`❌ 目录已存在：${projectDirName}`);
    console.log('   如果这是已有项目，请手动在 .inkweave/project.json 中注册');
    process.exit(1);
  }

  // 创建目录结构
  console.log(`📁 创建项目：${projectName}`);
  console.log(`   路径：${projectDirName}/`);
  console.log('');

  fs.mkdirSync(projectPath, { recursive: true });

  for (const dir of STANDARD_DIRS) {
    const dirPath = path.join(projectPath, dir);
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`   ✓ ${dir}/`);
  }

  // 注册到配置
  config.projects[projectName] = {
    name: projectName,
    path: projectDirName,
    createdAt: new Date().toISOString(),
  };

  if (activate || config.activeProject === null) {
    config.activeProject = projectName;
    console.log('');
    console.log(`⭐ 已设为活跃项目：${projectName}`);
  }

  writeConfig(config);

  console.log('');
  console.log('✅ 项目初始化完成');
  console.log('');
  console.log('下一步：');
  console.log(`  1. 在大纲创作院中执行「生成大纲」→ 步骤0选择风格预设`);
  console.log(`  2. 写章时，写作工坊会自动加载 ${projectDirName}/ 下的配置`);
  console.log(`  3. 或运行：npx tsx 检测工具/check-chapter.ts --project ${projectName} <章节路径>`);

  if (!activate) {
    console.log('');
    console.log(`💡 提示：当前活跃项目为 "${config.activeProject}"，切换项目请编辑 .inkweave/project.json`);
  }
}

main();