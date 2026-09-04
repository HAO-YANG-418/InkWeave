/**
 * InkWeave skill 安装器
 * ============================================================
 * 把仓库内的可分发 skill（skill/inkweave-writer/）复制到 WorkBuddy 的
 * 可加载目录（.workbuddy/skills/），使其被自动发现并加载。
 *
 * 用法：
 *   npx tsx scripts/install-skill.ts            # 装到 项目级 + 用户级
 *   npx tsx scripts/install-skill.ts --user     # 仅用户级（任意项目可用）
 *   npx tsx scripts/install-skill.ts --project  # 仅项目级（打开本仓库时可用）
 *
 * 注意：只复制 skill/ 目录，不触碰 .workbuddy/memory（记忆保持私有）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'skill', 'inkweave-writer');
const USER_SKILLS = path.join(homedir(), '.workbuddy', 'skills');
const PROJECT_SKILLS = path.join(REPO, '.workbuddy', 'skills');

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function install(dest: string, label: string): void {
  if (!fs.existsSync(SRC)) {
    console.error(`源 skill 不存在：${SRC}`);
    process.exit(1);
  }
  const target = path.join(dest, 'inkweave-writer');
  copyDir(SRC, target);
  console.log(`✅ 已安装到 ${label}：${target}`);
}

/**
 * 向上扫描从仓库根到文件系统根的所有 .workbuddy/skills 目录。
 * 同时覆盖：仓库内项目级（REPO/.workbuddy）与打开仓库的「工作区根」级
 * （如 写作引擎产品/.workbuddy，仓库是子目录时最容易漏装、导致「装了却没生效」）。
 */
function collectWorkbuddySkillsDirs(): { dir: string; label: string }[] {
  const found: { dir: string; label: string }[] = [];
  let cur = REPO;
  const seen = new Set<string>();
  while (true) {
    const wb = path.join(cur, '.workbuddy', 'skills');
    const key = path.resolve(wb);
    if (!seen.has(key)) {
      seen.add(key);
      if (fs.existsSync(wb)) {
        const label = cur === REPO ? '项目级' : `工作区级(${path.basename(cur)})`;
        found.push({ dir: wb, label });
      }
    }
    const parent = path.dirname(cur);
    if (parent === cur) break; // 到文件系统根
    cur = parent;
  }
  return found;
}

function main() {
  const onlyUser = process.argv.includes('--user');
  const onlyProject = process.argv.includes('--project');
  if (onlyUser) {
    install(USER_SKILLS, '用户级');
  } else if (onlyProject) {
    install(PROJECT_SKILLS, '项目级');
  } else {
    install(USER_SKILLS, '用户级');
    // 向上扫描所有 .workbuddy/skills，杜绝「装了却没生效」的漏装
    const dirs = collectWorkbuddySkillsDirs();
    if (dirs.length === 0) {
      // 仓库内尚无 .workbuddy，回退到默认项目级
      install(PROJECT_SKILLS, '项目级');
    } else {
      for (const { dir, label } of dirs) install(dir, label);
    }
  }
  console.log('\n重启 WorkBuddy 后，输入"写第X章"即可自动加载 inkweave-writer。');
}

main();
