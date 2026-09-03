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

function main() {
  const onlyUser = process.argv.includes('--user');
  const onlyProject = process.argv.includes('--project');
  if (onlyUser) {
    install(USER_SKILLS, '用户级');
  } else if (onlyProject) {
    install(PROJECT_SKILLS, '项目级');
  } else {
    install(USER_SKILLS, '用户级');
    install(PROJECT_SKILLS, '项目级');
  }
  console.log('\n重启 WorkBuddy 后，输入"写第X章"即可自动加载 inkweave-writer。');
}

main();
