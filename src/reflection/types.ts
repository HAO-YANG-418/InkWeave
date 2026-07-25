// ============================================================
// 自我反思模块类型定义 — GWE v6.0 基础智能层
// 让引擎写完内容后自我评估，发现问题自动重写
// ============================================================

import type { IntentResult } from '../intent/types'

/** 反思配置 */
export interface ReflectionConfig {
  /** 质量门槛：低于此分数自动重写 */
  qualityGate: number
  /** 最大自动重写次数 */
  maxAutoRewrite: number
  /** 每次重写的最低改进幅度 */
  minImprovement: number
  /** 是否启用自动重写 */
  autoRewrite: boolean
}

export const DEFAULT_REFLECTION_CONFIG: ReflectionConfig = {
  qualityGate: 0.7,
  maxAutoRewrite: 3,
  minImprovement: 0.05,
  autoRewrite: true,
}

/** 质量关注点 */
export interface QualityConcern {
  /** 关注维度 */
  dimension: QualityDimension
  /** 严重程度 0-1 */
  severity: number
  /** 具体问题描述 */
  description: string
  /** 位置（段落/句子索引） */
  location?: string
  /** 改进建议 */
  suggestion: string
}

export type QualityDimension =
  | 'intent_alignment'   // 意图对齐
  | 'emotional_impact'   // 情感冲击力
  | 'pacing'             // 节奏控制
  | 'character_voice'    // 角色声音一致性
  | 'opening_strength'   // 开头力度
  | 'ending_hook'        // 结尾钩子
  | 'information_density' // 信息密度
  | 'sensory_richness'   // 感官丰富度
  | 'dialogue_quality'   // 对话质量
  | 'prose_quality'      // 文字质量
  | 'continuity'         // 连续性
  | 'originality'        // 原创性/套路化

/** 反思结果 */
export interface ReflectionResult {
  /** 总体质量分 0-1 */
  overallScore: number
  /** 是否通过质量门槛 */
  passed: boolean
  /** 各维度评分 */
  dimensionScores: Record<QualityDimension, number>
  /** 质量关注点（按严重程度降序） */
  concerns: QualityConcern[]
  /** 内容亮点 */
  highlights: string[]
  /** 反思摘要 */
  summary: string
  /** 重写建议（如果未通过） */
  rewriteInstructions?: string
  /** 反思轮次 */
  round: number
  /** 与上一轮相比的改进幅度 */
  improvement?: number
}

/** 反思记录（用于学习） */
export interface ReflectionRecord {
  timestamp: number
  chapterNumber: number
  intent: string
  originalScore: number
  finalScore: number
  rounds: number
  keyConcerns: QualityConcern[]
  lessons: string[]
}

/** 内容评估输入 */
export interface ReflectionInput {
  /** 生成的内容 */
  content: string
  /** 本章意图 */
  intent: IntentResult
  /** 章节编号 */
  chapterNumber: number
  /** 章节标题 */
  chapterTitle: string
  /** 前一章内容（用于连续性检查） */
  previousContent?: string
  /** 用户设定的风格配置 */
  styleConfig?: Record<string, unknown>
}