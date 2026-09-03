// ============================================================
// 记忆提取与检索规则 — 定义"写完一章该记什么""写的时候该找什么"
// 长期记忆系统读取这份知识来自动提取和检索记忆
// ============================================================

import type { MemoryType } from '../memory/types';

// === 记忆提取规则 ===

/** 单种记忆类型的提取规则 */
export interface MemoryExtractionRule {
  /** 记忆类型 */
  type: MemoryType;
  /** 中文名 */
  name: string;
  /** 什么时候自动提取（触发信号） */
  triggers: string[];
  /** 存储格式（摘要模板） */
  storageFormat: string;
  /** 重要性默认值 0-1 */
  defaultImportance: number;
  /** 什么时候检索（写作场景） */
  retrievalScenarios: string[];
  /** 保留策略 */
  retention: 'permanent' | 'long_term' | 'medium_term' | 'short_term';
  /** 检索时的关联标签 */
  tags: string[];
}

// === 9种记忆类型的提取规则 ===

export const MEMORY_EXTRACTION_RULES: MemoryExtractionRule[] = [

  // 1. 角色状态
  {
    type: 'character_pattern',
    name: '角色状态',
    triggers: [
      '角色受伤/中毒/虚弱',
      '角色突破/升级/获得新能力',
      '角色关系变化（结盟/反目/恋爱/背叛）',
      '角色获得/失去重要物品',
      '角色身份揭露/变化',
      '角色做出重大决定',
    ],
    storageFormat: '{角色名}：{状态变化描述}（第{N}章）',
    defaultImportance: 0.7,
    retrievalScenarios: [
      '该角色再次出场时',
      '涉及该角色能力的场景',
      '涉及该角色关系的对话',
      '一致性检查时核对状态',
    ],
    retention: 'permanent',
    tags: ['角色', '状态', '能力', '关系'],
  },

  // 2. 情节事件
  {
    type: 'plot_pattern',
    name: '情节事件',
    triggers: [
      '发生战斗/冲突',
      '有人死亡/重伤',
      '发现重要线索/秘密',
      '达成协议/结盟',
      '势力格局变化',
      '主角做出影响后续的决定',
    ],
    storageFormat: '{事件一句话描述}（第{N}章，涉及：{角色}）→ 后果：{影响}',
    defaultImportance: 0.8,
    retrievalScenarios: [
      '推进相关情节线时',
      '回顾前因后果时',
      '一致性检查时核对因果链',
      '生成大纲时参考已有事件',
    ],
    retention: 'permanent',
    tags: ['事件', '冲突', '转折', '决定'],
  },

  // 3. 对话关键
  {
    type: 'dialogue_pattern',
    name: '对话关键信息',
    triggers: [
      '角色做出承诺/威胁',
      '角色透露秘密/计划',
      '角色之间的约定',
      '角色说出关键台词（伏笔性质）',
      '角色表达核心信念/价值观',
    ],
    storageFormat: '{说话人}对{对象}说：{关键内容}（第{N}章，语境：{场景}）',
    defaultImportance: 0.6,
    retrievalScenarios: [
      '该角色再次涉及相关话题时',
      '检查承诺是否兑现',
      '检查角色是否言行一致',
      '需要回引前文台词时',
    ],
    retention: 'long_term',
    tags: ['对话', '承诺', '秘密', '台词'],
  },

  // 4. 伏笔线索
  {
    type: 'foreshadow_pattern',
    name: '伏笔线索',
    triggers: [
      '出现"秘密""隐藏""暗示""诡异""不详""谜团""线索"等词',
      '角色说"以后你就知道了""到时再说"',
      '出现未解释的异常现象',
      '角色对某事表现出异常反应但未解释原因',
      '出现神秘物品/符号/人物',
      '叙事者暗示但未明说的事',
    ],
    storageFormat: '伏笔：{一句话描述}（埋设于第{N}章，预计回收窗口：第{N+5}-{N+15}章）',
    defaultImportance: 0.7,
    retrievalScenarios: [
      '写新章节时检查是否有伏笔到了回收窗口',
      '相关情节推进时检查是否可以回收',
      '生成大纲时确保伏笔被规划回收',
      '一致性检查时统计活跃伏笔数量',
    ],
    retention: 'permanent',
    tags: ['伏笔', '悬念', '未解', '线索'],
  },

  // 5. 场景模式
  {
    type: 'scene_pattern',
    name: '场景描写模式',
    triggers: [
      '使用了特定的环境描写套路',
      '战斗/对话/情感场景的固定写法',
      '反复出现的场景结构（如每次修炼都写一样的流程）',
    ],
    storageFormat: '场景模式：{模式描述}（首次出现第{N}章，已使用{M}次）',
    defaultImportance: 0.4,
    retrievalScenarios: [
      '冷却系统检测重复写法时',
      '生成相似场景时避免雷同',
      '风格分析时统计常用模式',
    ],
    retention: 'medium_term',
    tags: ['场景', '描写', '模式', '重复'],
  },

  // 6. 用户偏好
  {
    type: 'user_preference',
    name: '用户写作偏好',
    triggers: [
      '用户多次接受某类建议',
      '用户多次拒绝某类建议',
      '用户反复修改某种写法',
      '用户明确表达喜好（如"不要写XX"）',
      '用户常用某种叙事手法',
    ],
    storageFormat: '偏好：{偏好类型} - {具体描述}（频次：{N}次）',
    defaultImportance: 0.8,
    retrievalScenarios: [
      '生成建议时参考用户偏好',
      '生成内容时匹配用户风格',
      '质量评估时考虑用户标准',
    ],
    retention: 'permanent',
    tags: ['偏好', '风格', '习惯'],
  },

  // 7. 风格技法
  {
    type: 'style_technique',
    name: '风格技法',
    triggers: [
      '用户使用了独特的句式/修辞',
      '用户有标志性的描写手法',
      '用户的对话风格特征',
      '用户的节奏控制习惯',
    ],
    storageFormat: '技法：{技法描述}（使用频次：{N}次，首次第{M}章）',
    defaultImportance: 0.5,
    retrievalScenarios: [
      '风格注入时保持一致性',
      '续写时匹配作者笔触',
      '生成建议时推荐作者擅长的技法',
    ],
    retention: 'permanent',
    tags: ['风格', '技法', '句式', '修辞'],
  },

  // 8. 世界观规则
  {
    type: 'world_rule',
    name: '世界观规则',
    triggers: [
      '展示新的修炼体系/能力体系规则',
      '介绍势力/组织/国家关系',
      '揭示历史/传说/神话',
      '建立地理/空间规则',
      '设定物品/道具的功能和限制',
      '社会规则/阶级/法律',
    ],
    storageFormat: '世界观：{规则描述}（首次出现第{N}章）',
    defaultImportance: 0.9,
    retrievalScenarios: [
      '写作时确保不违反已有设定',
      '涉及相关设定时自然引用',
      '一致性检查时核对',
      '新角色/新场景设计时参考',
    ],
    retention: 'permanent',
    tags: ['世界观', '设定', '规则', '体系'],
  },

  // 9. 情感节拍
  {
    type: 'emotional_beat',
    name: '情感节拍',
    triggers: [
      '章节的情绪基调确定',
      '情绪强度发生显著变化',
      '角色经历重大情感事件',
      '章节间情绪转换',
    ],
    storageFormat: '节拍：第{N}章 情绪={类型} 强度={0-1}（{简述原因}）',
    defaultImportance: 0.5,
    retrievalScenarios: [
      '控制节奏避免情绪单调（连续3章同情绪则提醒）',
      '规划情绪曲线时参考历史节拍',
      '生成内容时匹配当前情绪基调',
    ],
    retention: 'medium_term',
    tags: ['情绪', '节奏', '基调'],
  },
];

// === 伏笔生命周期管理 ===

export interface ForeshadowLifecycleRule {
  /** 伏笔重要性级别 */
  level: 'major' | 'minor' | 'background';
  /** 建议回收窗口（章节数） */
  payoffWindow: { min: number; max: number };
  /** 超期警告（超过多少章未回收） */
  overdueWarning: number;
  /** 最大活跃伏笔数 */
  maxActive: number;
}

export const FORESHADOW_LIFECYCLE: ForeshadowLifecycleRule[] = [
  {
    level: 'major',
    payoffWindow: { min: 10, max: 30 },
    overdueWarning: 40,
    maxActive: 5,
  },
  {
    level: 'minor',
    payoffWindow: { min: 3, max: 10 },
    overdueWarning: 15,
    maxActive: 10,
  },
  {
    level: 'background',
    payoffWindow: { min: 5, max: 20 },
    overdueWarning: 25,
    maxActive: 8,
  },
];

// === 遗忘规则 ===

export interface ForgettingRule {
  /** 记忆保留策略 */
  retention: 'permanent' | 'long_term' | 'medium_term' | 'short_term';
  /** 基础保留天数 */
  baseDays: number;
  /** 重要性权重 */
  importanceWeight: number;
  /** 访问频率权重 */
  accessWeight: number;
  /** 时间衰减权重 */
  timeDecayWeight: number;
  /** 遗忘阈值（低于此值则遗忘） */
  forgetThreshold: number;
}

export const FORGETTING_RULES: ForgettingRule[] = [
  { retention: 'permanent', baseDays: Infinity, importanceWeight: 1.0, accessWeight: 0, timeDecayWeight: 0, forgetThreshold: 0 },
  { retention: 'long_term', baseDays: 90, importanceWeight: 0.7, accessWeight: 0.2, timeDecayWeight: 0.1, forgetThreshold: 0.15 },
  { retention: 'medium_term', baseDays: 30, importanceWeight: 0.5, accessWeight: 0.3, timeDecayWeight: 0.2, forgetThreshold: 0.2 },
  { retention: 'short_term', baseDays: 7, importanceWeight: 0.3, accessWeight: 0.4, timeDecayWeight: 0.3, forgetThreshold: 0.25 },
];

// === 工具函数 ===

/** 按类型获取提取规则 */
export function getRuleByType(type: MemoryType): MemoryExtractionRule | undefined {
  return MEMORY_EXTRACTION_RULES.find(r => r.type === type);
}

/** 获取所有触发词 */
export function getAllTriggers(): string[] {
  const triggers: string[] = [];
  for (const rule of MEMORY_EXTRACTION_RULES) {
    triggers.push(...rule.triggers);
  }
  return [...new Set(triggers)];
}

/** 检测文本中可提取的记忆 */
export function detectExtractableMemories(
  content: string,
  _chapterNumber: number
): Array<{ type: MemoryType; trigger: string; suggestedImportance: number }> {
  const results: Array<{ type: MemoryType; trigger: string; suggestedImportance: number }> = [];
  for (const rule of MEMORY_EXTRACTION_RULES) {
    for (const trigger of rule.triggers) {
      // 简单关键词检测：从trigger中提取关键词
      const keywords = trigger.match(/[\u4e00-\u9fa5]{2,}/g) || [];
      for (const kw of keywords) {
        if (content.includes(kw)) {
          results.push({
            type: rule.type,
            trigger: trigger,
            suggestedImportance: rule.defaultImportance,
          });
          break; // 每种类型只记录一次
        }
      }
    }
  }
  return results;
}

/** 获取伏笔回收建议 */
export function getForeshadowPayoffSuggestion(
  plantedChapter: number,
  currentChapter: number,
  importance: number
): { shouldPayoff: boolean; urgency: 'normal' | 'warning' | 'overdue'; message: string } {
  const gap = currentChapter - plantedChapter;
  const level = importance >= 0.8 ? 'major' : importance >= 0.5 ? 'minor' : 'background';
  const rule = FORESHADOW_LIFECYCLE.find(r => r.level === level)!;

  if (gap >= rule.overdueWarning) {
    return {
      shouldPayoff: true,
      urgency: 'overdue',
      message: `伏笔已超期${gap - rule.overdueWarning}章未回收，建议尽快回收`,
    };
  }
  if (gap >= rule.payoffWindow.max) {
    return {
      shouldPayoff: true,
      urgency: 'warning',
      message: `伏笔已到回收窗口上限（${rule.payoffWindow.max}章），建议在近期章节回收`,
    };
  }
  if (gap >= rule.payoffWindow.min) {
    return {
      shouldPayoff: false,
      urgency: 'normal',
      message: `伏笔进入回收窗口（${rule.payoffWindow.min}-${rule.payoffWindow.max}章），可择机回收`,
    };
  }
  return {
    shouldPayoff: false,
    urgency: 'normal',
    message: `伏笔尚在埋设期，建议第${plantedChapter + rule.payoffWindow.min}章后开始回收`,
  };
}
