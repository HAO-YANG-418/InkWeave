#!/usr/bin/env node
/**
 * InkWeave CLI v4.9
 * 
 * 用法：
 *   inkweave check <章节文件> [--target 3000] [--save-fingerprint] [--fix]
 *   inkweave check-all <章节目录> [--parallel] [--fix-report]
 *   inkweave pre-analysis <章节号> <目标字数> [--project <项目名>]
 *   inkweave auto-pipeline <章节号> <目标字数> [--project <项目名>]
 *   inkweave quick-write <章节号> <目标字数> [--project <项目名>]
 *   inkweave verify-gates
 *   inkweave compile-kb
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist', '检测工具');

const commands = {
  check:           path.join(distDir, 'check-chapter.js'),
  'check-all':     path.join(distDir, 'check-all.js'),
  'pre-analysis':  path.join(distDir, 'pre-analysis.js'),
  'auto-pipeline': path.join(distDir, 'auto-pipeline.js'),
  'quick-write':   path.join(distDir, 'quick-write.js'),
  'verify-gates':  path.join(distDir, 'verify-gates.js'),
};

function run(cmd, args) {
  const script = commands[cmd];
  if (!script) {
    console.error(`未知命令: ${cmd}`);
    console.error('可用命令: check, check-all, pre-analysis, auto-pipeline, quick-write, verify-gates, compile-kb');
    process.exit(1);
  }
  if (!fs.existsSync(script)) {
    console.error(`编译产物不存在: ${script}`);
    console.error('请先运行 npm run build');
    process.exit(1);
  }
  const child = spawn('node', [script, ...args], { stdio: 'inherit' });
  child.on('exit', code => process.exit(code ?? 0));
}

const [,, cmd, ...args] = process.argv;
if (!cmd) {
  console.log('InkWeave 写作引擎 v4.9');
  console.log('');
  console.log('用法:');
  console.log('  inkweave check <章节> [--target 3000] [--save-fingerprint] [--fix]    单章检测');
  console.log('  inkweave check-all <目录> [--parallel] [--fix-report]                  全卷检测');
  console.log('  inkweave pre-analysis <章节号> <目标字数> [--project <项目名>]        写前分析');
  console.log('  inkweave auto-pipeline <章节号> <目标字数> [--project <项目名>]       全链路自动化');
  console.log('  inkweave quick-write <章节号> <目标字数> [--project <项目名>]         轻量快写');
  console.log('  inkweave verify-gates                                                门禁验证');
  console.log('  inkweave compile-kb                                                  编译知识库');
  process.exit(0);
}

if (cmd === 'compile-kb') {
  const kbScript = path.join(__dirname, 'dist', '源码', 'compile-kb.js');
  if (!fs.existsSync(kbScript)) {
    console.error(`编译产物不存在: ${kbScript}`);
    process.exit(1);
  }
  const child = spawn('node', [kbScript], { stdio: 'inherit' });
  child.on('exit', code => process.exit(code ?? 0));
} else {
  run(cmd, args);
}