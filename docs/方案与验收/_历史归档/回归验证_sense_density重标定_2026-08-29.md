# 回归验证 · sense_density 重标定（#3）

> 日期：2026-08-29 | 代码方：AI（本会话） | 方案方：屿与雨（独立核真身后拍板 0.045）

## 一、改动真身（2 处，均 0.02 → 0.045）

| 文件 | 位置 | 作用域 |
|---|---|---|
| `源码/types.ts` | `:229` `DEFAULT_THRESHOLDS.senseDensityMin` | profiler / R1_MERGED_CONFIG 路径（源码树自检） |
| `知识库/阈值标定/default.json` | `:13` `"senseDensityMin"` | 真实引擎 mergeConfig 路径（KB_DEFAULT_THRESHOLDS，源码树生成时自检） |

检测器本身 `源码/checks/check-sense-density.ts:20` 未改（早已是 `thresholds.senseDensityMin ?? 0.02`，只换阈值源值）。

## 二、方案方拍板前的两处纠正（代码方核真身发现）

1. **单位陷阱（方案方已自抓，代码方认账）**：原计划 framing "按新中位 59.5 重标定" 是**每千字**单位（59.5 次/千字），而检测器 `density = totalSensory/totalWords` 是 **0–1 比率**，默认 0.02。直接填 59.5 等于要求 5950% → 检测器永不被触发。故采比率值 **0.045（≈45/千字）**。

2. **双源陷阱（代码方补抓，方案方指令"只改 types.ts:229"不成立）**：`mergeConfig`（`config-merger.ts:138`）基 = `KB_DEFAULT_THRESHOLDS`，由 `kb-thresholds.ts` 模块加载时从 `default.json` 灌入；`types.ts:229` 仅在 default.json 缺失时作兜底。`profiler_dual_tree.mts:19-20` 的 R1_MERGED_CONFIG 直取 `DEFAULT_THRESHOLDS`（types.ts:229）。
   → **活跃阈值有两套**：profiler 走 types.ts:229，真实引擎走 default.json:13。只改 types.ts:229 会让 profiler 回归"看起来生效"但生产端仍是死检测器（假阳性验证）。**必须两处同改**。

## 三、验证结果

```
DEFAULT_THRESHOLDS.senseDensityMin (profiler/R1 路径) = 0.045
KB default.json senseDensityMin   (真实引擎路径) = 0.045
两源一致? YES
源码树 sense_density_low 触发章数 = 5 / 47
CLI 树 sense_density_low 触发章数 = 0 / 47（硬编码 0.02，未动）
```

**触发尾章清单（源码树，ratio<4.5%）：**

| 章 | 比率 | 字数 | 档 |
|---|---|---|---|
| ch17 | 3.85% | 2729 | 早期 |
| ch22 | 4.45% | 2855 | 早期 |
| ch41 | 3.80% | 2107 | 38–47 |
| ch44 | 4.07% | 2111 | 38–47 |
| ch45 | 4.25% | 2117 | 38–47 |

- 5/47 ≈ 10.6%，与方案方预估"最稀尾部 ~10–15%"吻合。
- `sense_density_low` 为 **warning 级**，不计入 error。
- 全量 profiler 1–47：CLI error=6（ch32–37）、源码 error=50，与改前一致；**38–47 全 0 error → 零回归**。ch41/44/45 被标 warning 但非 error，不破零 error 判据。

## 四、残留债（如实记，本期不做）

`检测工具/checkers.ts:567-572` CLI 树 `checkSenseDensity` **硬编码 `density < 0.02` 且 `totalWords > 1000` 地板**——是源码树之外的**第三处**独立实现，不吃 types.ts:229 也不吃 default.json。结果：源码树已标 5 章，CLI 树仍 0 章，两树在 `sense_density` 阈值上**仍不一致**（此即 #2 统一工作未覆盖的阈值层残差）。
- 若要彻底一致，需把 `:572` 的 `0.02→0.045` 且 `>1000→>500` 与源码树对齐，但 CLI 侧 `>1000` 地板是 8-28 Y 降噪刻意抬高（避短章误伤），改动属设计决策，超出 #3 范围，交由方案方定。

## 五、结论

- 采 **0.045（≈45/千字）**，仅标最稀尾部 warning，恢复 `sense_density_low` 本意，未淹没有效章。
- 双源（types.ts:229 + default.json:13）已同改同值，生产端与 profiler 端一致，无假阳性验证。
- 零 error 回归；`npm run build` EXIT=0；dist 已同步。
- CLI 树硬编码 0.02 残差债已记录，待方案方决定是否纳入统一。
