/**
 * 闭关回归校验器（反向闭环方案 §3.2 / 风险约束 §6②）
 *
 * 直接吃两份 health-matrix.json（current vs baseline）做逐 ruleId diff，
 * 不复跑双树检测（避免复刻 health-report 逻辑导致分叉）。
 * 矩阵缺失（baseline/current 缺失或非法）→ exit 2 硬失败（CLI 校验器正确行为，非"优雅降级"）。
 *
 * 用法：
 *   npx tsx 检测工具/verify-regression.ts --baseline <baseline.json> [--current <current.json>]
 *   npx tsx 检测工具/verify-regression.ts <baseline.json>            # current 默认 检测工具/health-matrix.json
 *
 * 退出码：
 *   0 = 无 error 级回归（可放心接受铁则/检测器改动）
 *   1 = 检测到 error 级回归（有 ruleId 的 error 总数不降反升）
 *   2 = 参数/文件错误（baseline 或 current 缺失/非法）
 */

import * as fs from 'fs';

interface SeverityCount { error: number; warning: number; info: number; }
interface MatrixChapter { chapter: string; violationCounts?: Record<string, SeverityCount>; [k: string]: any; }

function aggregate(matrix: MatrixChapter[]): Record<string, SeverityCount> {
  const agg: Record<string, SeverityCount> = {};
  for (const ch of matrix) {
    const vc = ch.violationCounts || {};
    for (const [ruleId, sc] of Object.entries(vc)) {
      if (!agg[ruleId]) agg[ruleId] = { error: 0, warning: 0, info: 0 };
      agg[ruleId].error += sc.error || 0;
      agg[ruleId].warning += sc.warning || 0;
      agg[ruleId].info += sc.info || 0;
    }
  }
  return agg;
}

function fmt(sc: SeverityCount): string {
  return `${sc.error}/${sc.warning}/${sc.info}`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function main(): void {
  const args = process.argv.slice(2);
  let baseline: string | undefined;
  let current = '检测工具/health-matrix.json';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--baseline' && i + 1 < args.length) { baseline = args[i + 1]; i++; }
    else if (args[i] === '--current' && i + 1 < args.length) { current = args[i + 1]; i++; }
    else if (!args[i].startsWith('--') && !baseline) { baseline = args[i]; }
  }

  if (!baseline) {
    console.error('usage: npx tsx 检测工具/verify-regression.ts --baseline <baseline.json> [--current <current.json>]');
    process.exit(2);
  }
  if (!fs.existsSync(baseline)) { console.error('baseline not found: ' + baseline); process.exit(2); }
  if (!fs.existsSync(current)) { console.error('current not found: ' + current); process.exit(2); }

  let baseMatrix: MatrixChapter[];
  let curMatrix: MatrixChapter[];
  try {
    baseMatrix = JSON.parse(fs.readFileSync(baseline, 'utf-8'));
    curMatrix = JSON.parse(fs.readFileSync(current, 'utf-8'));
  } catch (e) {
    console.error('failed to parse matrix JSON: ' + (e as Error).message);
    process.exit(2);
  }
  if (!Array.isArray(baseMatrix) || !Array.isArray(curMatrix)) {
    console.error('matrix JSON must be an array of ChapterHealth');
    process.exit(2);
  }

  const baseAgg = aggregate(baseMatrix);
  const curAgg = aggregate(curMatrix);
  const ruleIds = Array.from(new Set([...Object.keys(baseAgg), ...Object.keys(curAgg)])).sort();

  const W = 30;
  console.log(`[verify-regression] baseline=${baseline} (${baseMatrix.length} chapters)  current=${current} (${curMatrix.length} chapters)`);
  console.log(pad('ruleId', W) + ' | base(E/W/I) | cur(E/W/I) | Δ(E/W/I)  | trend');
  console.log('-'.repeat(W + 42));

  let regressions = 0;
  let baseTotalErr = 0;
  let curTotalErr = 0;

  for (const rid of ruleIds) {
    const b = baseAgg[rid] || { error: 0, warning: 0, info: 0 };
    const c = curAgg[rid] || { error: 0, warning: 0, info: 0 };
    const dE = c.error - b.error;
    const dW = c.warning - b.warning;
    const dI = c.info - b.info;
    baseTotalErr += b.error;
    curTotalErr += c.error;

    let trend = '—';
    if (c.error > b.error) { trend = '↑ REGRESSION(error)'; regressions++; }
    else if (dE < 0) { trend = '↓ improved'; }
    else if (dE === 0 && (dW < 0 || dI < 0)) { trend = '↓ improved(mild)'; }
    else if (dE === 0 && (dW > 0 || dI > 0)) { trend = '↑ worsened(non-error)'; }

    const dStr = `${dE >= 0 ? '+' : ''}${dE}/${dW >= 0 ? '+' : ''}${dW}/${dI >= 0 ? '+' : ''}${dI}`;
    console.log(pad(rid, W) + ' | ' + pad(fmt(b), 11) + ' | ' + pad(fmt(c), 11) + ' | ' + pad(dStr, 9) + ' | ' + trend);
  }

  console.log('-'.repeat(W + 42));
  console.log(`summary: total errors  base=${baseTotalErr}  current=${curTotalErr}  (Δ${curTotalErr - baseTotalErr >= 0 ? '+' : ''}${curTotalErr - baseTotalErr})`);
  console.log(`summary: ruleIds=${ruleIds.length}  regressions(error↑)=${regressions}`);

  if (regressions > 0) {
    console.log(`exit: 1 (REGRESSION detected — 存在 error 级不降反升项，勿接受本次铁则/检测器改动)`);
    process.exit(1);
  } else {
    console.log(`exit: 0 (no error-level regression — 可接受本次改动)`);
    process.exit(0);
  }
}

main();
