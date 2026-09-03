// ============================================================
// KB 阈值标定源加载器（③ 阶段二 落点 A）
// 读取 知识库/阈值标定/default.json，best-effort 合并到 DEFAULT_THRESHOLDS，
// 使「知识库/阈值标定」成为阈值单一标定源（KB 优先、硬编码兜底）。
//
// 设计说明：
// - 同步读取 + 进程内缓存一次（阈值生命周期 = 进程），零异步侵入，
//   因此 mergeConfig（同步函数）与各调用点无需改签名，零回归。
// - 与执行清单 §5.3「async await 注入」的差异：清单原建议把加载放在
//   gwe-engine.ts:750 处 await 注入 base；本实现改为在 config-merger.ts
//   模块加载时一次性 seed（KB_DEFAULT_THRESHOLDS），覆盖 mergeConfig 全部调用方
//   （含 CLI 检测工具/checkers.ts），侵入更小、覆盖面更全。目标（KB 优先、
//   硬编码兜底、可被 default.json 覆盖）完全一致。
// ============================================================

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { Thresholds } from './types';
import { DEFAULT_THRESHOLDS } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 候选路径：相对本模块（源码/）→ 知识库/阈值标定/default.json；并附 cwd 兜底
const CANDIDATE_PATHS: string[] = [
  resolve(__dirname, '../知识库/阈值标定/default.json'),
  resolve(process.cwd(), '知识库/阈值标定/default.json'),
  resolve(process.cwd(), 'InkWeave/知识库/阈值标定/default.json'),
];

function deepMergeThresholds(base: Thresholds, override: Partial<Thresholds>): Thresholds {
  const merged = { ...base } as unknown as Record<string, unknown>;
  for (const key of Object.keys(override) as (keyof Thresholds)[]) {
    const v = override[key];
    if (v !== undefined && v !== null) {
      merged[key as string] = v as unknown;
    }
  }
  return merged as unknown as Thresholds;
}

let cached: Thresholds | null = null;

/**
 * 读取 KB 默认阈值文件，best-effort 合并到 DEFAULT_THRESHOLDS。
 * - 文件存在且合法：KB 值覆盖 DEFAULT_THRESHOLDS 同名字段（KB 优先）。
 * - 文件缺失 / JSON 解析失败 / 字段非法：返回 DEFAULT_THRESHOLDS（硬编码兜底，零回归）。
 * 进程内仅读取一次（阈值生命周期 = 进程），结果缓存。
 */
export function loadKbDefaultThresholds(): Thresholds {
  if (cached) return cached;
  let result: Thresholds = { ...DEFAULT_THRESHOLDS };
  const filePath = CANDIDATE_PATHS.find((p) => existsSync(p));
  if (filePath) {
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf8')) as { thresholds?: Partial<Thresholds> };
      const override = raw?.thresholds;
      if (override && typeof override === 'object') {
        result = deepMergeThresholds(result, override);
      }
    } catch {
      // 降级：保留 DEFAULT_THRESHOLDS（硬编码兜底，零回归）
      result = { ...DEFAULT_THRESHOLDS };
    }
  }
  cached = result;
  return result;
}
