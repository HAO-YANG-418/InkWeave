/**
 * InkWeave 项目配置读取工具 v4.9
 *
 * 所有 CLI 工具通过本模块读取当前项目配置，
 * 获取项目路径、章节目录等，无需硬编码路径。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 编译后位于 dist/检测工具/，源码中位于 检测工具/，两种情况下都需回到项目根目录
const ROOT = __dirname.includes('dist') ? path.resolve(__dirname, '..', '..') : path.resolve(__dirname, '..');

export interface ProjectEntry {
  name: string;
  path: string;
  createdAt: string;
  /** 主角名（per-work）：接 kb 配置，消 hardcoded；CLI 树检测主角私心时从此读取，缺省用检测层默认 '林深' */
  protagonistName?: string;
  /** per-work 质感词排除：如 裂日 的「凉」是核心概念词（克制残频武器），非均匀腔信号，CLI 树 texture_variety 检测时跳过。CLI 树不读 KB，故放 project.json 而非 KB 节点。 */
  excludedTextureWords?: string[];
}

export interface ProjectConfig {
  activeProject: string | null;
  projects: Record<string, ProjectEntry>;
}

const CONFIG_FILE = path.join(ROOT, '.inkweave', 'project.json');

let _configCache: ProjectConfig | null = null;

export function readProjectConfig(): ProjectConfig {
  if (_configCache) return _configCache;
  if (!fs.existsSync(CONFIG_FILE)) {
    _configCache = { activeProject: null, projects: {} };
    return _configCache;
  }
  const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  _configCache = { activeProject: raw.activeProject ?? null, projects: raw.projects ?? {} };
  return _configCache;
}

export function getActiveProject(): ProjectEntry | null {
  const config = readProjectConfig();
  if (!config.activeProject) return null;
  return config.projects[config.activeProject] || null;
}

export function getProjectPath(projectName?: string): string {
  const config = readProjectConfig();
  const name = projectName || config.activeProject;
  if (!name) throw new Error('没有活跃项目。请先运行 init-project.ts 或设置 activeProject');
  const project = config.projects[name];
  if (!project) throw new Error(`项目 "${name}" 不存在。可用项目：${Object.keys(config.projects).join(', ') || '无'}`);
  return path.join(ROOT, project.path);
}

export function resolveChapterPath(chapterFile: string, projectName?: string): string {
  if (path.isAbsolute(chapterFile)) return chapterFile;
  const projectPath = getProjectPath(projectName);
  const chaptersDir = path.join(projectPath, '章节');
  // 如果传入的是完整路径（含"章节/"前缀），直接拼接
  if (chapterFile.startsWith('章节/') || chapterFile.startsWith('章节\\')) {
    return path.join(projectPath, chapterFile);
  }
  // 如果是纯文件名，从章节目录查找
  const directPath = path.join(chaptersDir, chapterFile);
  if (fs.existsSync(directPath)) return directPath;
  // 尝试模糊匹配
  if (fs.existsSync(chaptersDir)) {
    const files = fs.readdirSync(chaptersDir);
    for (const f of files) {
      if (f.includes(chapterFile.replace(/\.md$/, ''))) {
        return path.join(chaptersDir, f);
      }
    }
  }
  return directPath;
}

export function resolveProjectRelative(relativePath: string, projectName?: string): string {
  const projectPath = getProjectPath(projectName);
  return path.join(projectPath, relativePath);
}

export function listProjects(): ProjectEntry[] {
  const config = readProjectConfig();
  return Object.values(config.projects);
}

export function clearCache(): void {
  _configCache = null;
}