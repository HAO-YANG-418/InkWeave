// ============================================================
// GWE V2.0 - 配置合并器
// 7层优先级配置合并：默认值 -> 基础词库 -> 词库节点选项 -> 风格/规则选项阈值/权重
//                   -> 预设包 -> 用户词库 -> 用户阈值覆盖
// ============================================================

import type {
  NodeId,
  OptionId,
  NodeOptionKB,
  Thresholds,
  RadarWeights,
  MergedConfig,
  MergedVocabulary,
  Preset,
  UserOverrides,
  RuleViolation,
} from './types';
import { DEFAULT_THRESHOLDS, DEFAULT_RADAR_WEIGHTS } from './types';
import { getAllNodes, getNodeOption } from './node-registry';

// ============================================================
// 词汇分类标准列表
// ============================================================

const VOCAB_CATEGORIES = [
  'bodyParts',
  'sensoryVerbs',
  'environmentSignals',
  'actionVerbs',
  'fillerPatterns',
  'dialogueTags',
  'worldTerms',
] as const;

// ============================================================
// 基础词库（内置最小词库，第二层）
// ============================================================

export const BASE_VOCAB: Required<NonNullable<NodeOptionKB['vocabulary']>>['add'] = {
  bodyParts: [
    // 短词优先（高频）
    '头', '脸', '眼', '眉', '鼻', '口', '唇', '舌', '齿', '耳',
    '颈', '肩', '臂', '手', '指', '掌', '胸', '背', '腰', '腹',
    '腿', '脚', '膝', '腕', '肘', '喉', '皮肤',
    // 复合词
    '指尖', '手掌', '手背', '手腕', '手臂', '肩膀', '后颈', '脖颈', '脸颊', '额头',
    '眉心', '眉头', '眼角', '瞳孔', '嘴唇', '嘴角', '下颌', '喉咙', '胸口', '心脏',
    '后背', '脊背', '腹部', '膝盖', '脚踝', '脚尖', '脚底', '毛孔', '汗毛', '发丝',
    '耳根', '鼻翼', '牙关', '拳头', '指节', '太阳穴', '掌心', '虎口',
    '颧骨', '眼眶', '锁骨', '脚跟', '脚趾', '肋骨',
  ],
  sensoryVerbs: [
    // 感官动词（基础动作）
    '看', '望', '瞥', '瞪', '盯', '瞄', '凝视', '注视', '扫视', '环顾',
    '听', '闻', '嗅', '尝', '触', '摸', '碰', '感觉', '感到', '觉得',
    '察觉', '感知',
    // 身体反应/感觉
    '发凉', '发麻', '发热', '发紧', '一跳', '一颤', '一缩', '一紧', '一沉', '一凉', '一麻',
    '狂跳', '抽搐', '紧绷', '绷紧', '僵硬', '酸软', '刺痛', '灼烧', '嗡鸣', '轰鸣',
    '扑通', '咯噔', '紧缩', '揪紧', '翻腾', '翻涌', '窒息', '喘息', '颤抖', '战栗',
    '泛起', '发烫', '灼痛', '酸痛', '冰冷', '滚烫', '湿润', '干燥', '松弛',
    '胀痛', '发痒', '收缩', '悸动',
    // 单字感觉词（高频出现在锚点中）
    '凉', '冷', '热', '烫', '痛', '麻', '痒', '酸', '软', '僵', '紧', '沉',
  ],
  environmentSignals: [
    '光线', '阴影', '风', '雨', '雪', '雾', '气味', '声音', '温度', '寒意',
    '暖意', '潮湿', '干燥', '尘土', '光影', '回声', '寂静', '喧闹', '明亮', '昏暗',
    '光', '影', '声', '响', '微光', '强光', '反光', '光斑', '响动', '异响',
    '脚步声', '呼吸声', '心跳声', '水滴声', '风声', '雨声',
    '月光', '阳光', '灯光', '烛火', '雾气', '寒气', '冷气', '热气',
  ],
  actionVerbs: [
    // 基础单字动作
    '走', '跑', '站', '坐', '躺', '蹲', '跳', '冲', '退', '躲',
    '抓', '握', '推', '拉', '拍', '打', '挥', '劈', '刺', '挡',
    '看', '望', '盯', '瞥', '扫', '转', '抬', '低', '点头', '摇头',
    '说', '道', '问', '答', '喊', '叫', '笑', '哭', '叹', '呼',
    '吸', '吞', '咽', '咬', '抿', '张', '闭', '睁', '眯', '皱',
    // 复合动作词
    '转身', '回头', '抬手', '伸手', '握拳', '松开', '握紧', '皱眉', '眨眼',
    '吸气', '呼气', '屏息', '咳嗽', '叹息', '颤抖', '后退', '前进', '停下', '跨出',
    '扶', '撑', '按', '捏', '踢', '撞', '闪', '避', '仰起', '低下',
    '凑近', '退开', '侧身', '蜷缩', '舒展', '抱紧', '推开', '攥紧', '摩挲', '擦拭',
    '迈', '踏', '跪',
  ],
  fillerPatterns: [
    '不由得', '忍不住', '不禁', '竟然', '居然', '似乎', '好像', '仿佛', '大概',
    '也许', '可能', '应该', '其实', '事实上', '实际上', '说实话', '老实说',
    '怎么说呢', '不得不说', '众所周知', '毫无疑问', '显而易见',
    '非常', '十分', '极其', '很', '有点', '有些',
  ],
  dialogueTags: [
    '道', '说', '问', '答', '喊', '叫', '冷声道', '沉声道', '笑道', '怒道',
    '低声道', '高声道', '厉声道', '淡淡道', '缓缓道', '轻声道', '吼道',
    '低语', '呢喃', '嘟囔',
  ],
  worldTerms: [],
};

// ============================================================
// 核心合并函数
// ============================================================

export interface MergeOptions {
  /** 节点选择集 */
  selections: Record<NodeId, OptionId>;
  /** 已加载的选项KB数据 */
  loadedOptions: Map<OptionId, NodeOptionKB>;
  /** 预设包（可选） */
  preset?: Preset | null;
  /** 用户自定义覆盖 */
  userOverrides?: UserOverrides;
  /** 从文件加载的基础词库（覆盖硬编码BASE_VOCAB） */
  baseVocabOverride?: Required<NonNullable<NodeOptionKB['vocabulary']>>['add'] | null;
}

/**
 * 合并所有配置层，生成最终运行时配置
 * 优先级（从低到高）：
 *   1. 引擎内置默认值
 *   2. 基础词库
 *   3. 词库类节点选项（vocab.add追加，vocab.remove删除）
 *   4. 风格/规则节点选项的threshold_overrides和radar_weights
 *   5. 预设包extra_vocab和extra_prompt
 *   6. 用户自定义词库追加
 *   7. 用户自定义阈值覆盖
 */
export function mergeConfig(options: MergeOptions): MergedConfig {
  const { selections, loadedOptions, preset, userOverrides, baseVocabOverride } = options;

  // ---- 第1层：默认值 ----
  let thresholds: Thresholds = { ...DEFAULT_THRESHOLDS };
  let radarWeights: RadarWeights = { ...DEFAULT_RADAR_WEIGHTS };

  // ---- 初始化词汇表（第2层基础词库将在下面合并）----
  const vocabulary = createEmptyVocabulary();

  const systemPrompts: string[] = [];
  const constraints: string[] = [];
  const examples: Array<{ text: string; note?: string }> = [];
  const extraRules: Array<{ id: string; name: string; description: string; severity: 'error' | 'warning' | 'info'; pattern?: string; check?: (text: string) => RuleViolation | null; injectToPrompt?: boolean }> = [];
  const disabledChecks = new Set<string>();
  const enabledChecks = new Set<string>();

  // ---- 第2层：合并基础词库 ----
  // 先合并硬编码内置词库（保底），再合并从base-vocab.json加载的外部基础词库
  mergeVocabAdd(vocabulary, BASE_VOCAB);
  if (baseVocabOverride) {
    mergeVocabAdd(vocabulary, baseVocabOverride);
  }

  // ---- 收集所有选中的选项KB，按节点顺序处理 ----
  const allNodes = getAllNodes();
  const selectedKBs: NodeOptionKB[] = [];

  for (const node of allNodes) {
    const optionId = selections[node.id];
    if (!optionId) continue;

    // 优先从传入的loadedOptions中取，否则从全局注册表取
    let kb = loadedOptions.get(optionId);
    if (!kb) {
      kb = getNodeOption(optionId);
    }
    if (kb) {
      selectedKBs.push(kb);
    }
  }

  // ---- 第3层：词库类节点选项（vocab类节点先处理词库增删）----
  for (const kb of selectedKBs) {
    const nodeDef = allNodes.find((n) => n.id === kb.node_id);
    if (!nodeDef) continue;

    if (kb.vocabulary) {
      if (kb.vocabulary.add) {
        mergeVocabAdd(vocabulary, kb.vocabulary.add);
      }
      if (kb.vocabulary.remove) {
        mergeVocabRemove(vocabulary, kb.vocabulary.remove);
      }
    }
  }

  // ---- 第4层：风格/规则节点选项的threshold_overrides和radar_weights ----
  // 按节点顺序处理，后面的覆盖前面的，radar_weights乘法叠加
  for (const kb of selectedKBs) {
    const nodeDef = allNodes.find((n) => n.id === kb.node_id);
    if (!nodeDef) continue;

    // 阈值覆盖（直接覆盖）
    if (kb.threshold_overrides) {
      thresholds = { ...thresholds, ...kb.threshold_overrides };
    }

    // 雷达权重（乘法叠加）
    if (kb.radar_weights) {
      radarWeights = multiplyRadarWeights(radarWeights, kb.radar_weights);
    }

    // 启用/禁用检测项
    if (kb.checks) {
      kb.checks.disable?.forEach((c) => disabledChecks.add(c));
      kb.checks.enable?.forEach((c) => enabledChecks.add(c));
    }

    // 收集system_prompt、constraints、examples（后续拼装时用）
    if (kb.system_prompt) {
      systemPrompts.push(kb.system_prompt);
    }
    if (kb.constraints) {
      constraints.push(...kb.constraints);
    }
    if (kb.examples) {
      examples.push(...kb.examples);
    }
  }

  // ---- 第5层：预设包 ----
  if (preset) {
    if (preset.extra_vocab) {
      if (preset.extra_vocab.add) {
        mergeVocabAdd(vocabulary, preset.extra_vocab.add);
      }
      if (preset.extra_vocab.remove) {
        mergeVocabRemove(vocabulary, preset.extra_vocab.remove);
      }
    }
    if (preset.extra_constraints) {
      constraints.push(...preset.extra_constraints);
    }
    if (preset.extra_rules) {
      extraRules.push(...preset.extra_rules);
    }
    // 预设的阈值覆盖
    if (preset.threshold_overrides) {
      thresholds = { ...thresholds, ...preset.threshold_overrides };
    }
    // extra_prompt在prompt-builder中使用，这里不处理
  }

  // ---- 第6层：用户自定义词库追加 ----
  if (userOverrides?.vocab) {
    if (userOverrides.vocab.add) {
      mergeVocabAdd(vocabulary, userOverrides.vocab.add);
    }
    if (userOverrides.vocab.remove) {
      mergeVocabRemove(vocabulary, userOverrides.vocab.remove);
    }
  }

  // ---- 第7层：用户自定义阈值覆盖 ----
  if (userOverrides?.thresholds) {
    thresholds = { ...thresholds, ...userOverrides.thresholds };
  }

  // 用户自定义规则
  if (userOverrides?.rules) {
    extraRules.push(...userOverrides.rules);
  }

  return {
    thresholds,
    radarWeights,
    vocabulary,
    systemPrompts,
    constraints,
    examples,
    extraRules,
    disabledChecks,
    enabledChecks,
  };
}

// ============================================================
// 辅助函数
// ============================================================

/** 创建空词汇表 */
function createEmptyVocabulary(): MergedVocabulary {
  const vocab: Record<string, Set<string>> = {};
  for (const cat of VOCAB_CATEGORIES) {
    vocab[cat] = new Set<string>();
  }
  return vocab as MergedVocabulary;
}

/** 追加词汇（Set自动去重） */
function mergeVocabAdd(
  target: MergedVocabulary,
  add: Record<string, string[] | undefined>
): void {
  for (const [category, words] of Object.entries(add)) {
    if (!words || !Array.isArray(words)) continue;
    if (!target[category]) {
      target[category] = new Set<string>();
    }
    for (const word of words) {
      if (word && typeof word === 'string') {
        target[category].add(word);
      }
    }
  }
}

/** 删除词汇（从所有分类中移除指定词） */
function mergeVocabRemove(
  target: MergedVocabulary,
  remove: string[]
): void {
  for (const word of remove) {
    for (const cat of Object.keys(target)) {
      target[cat].delete(word);
    }
  }
}

/** 雷达权重乘法叠加 */
function multiplyRadarWeights(
  base: RadarWeights,
  override: Partial<RadarWeights>
): RadarWeights {
  return {
    bodyReaction: override.bodyReaction != null ? base.bodyReaction * override.bodyReaction : base.bodyReaction,
    sensorySignal: override.sensorySignal != null ? base.sensorySignal * override.sensorySignal : base.sensorySignal,
    action: override.action != null ? base.action * override.action : base.action,
    emotion: override.emotion != null ? base.emotion * override.emotion : base.emotion,
    infoAdvance: override.infoAdvance != null ? base.infoAdvance * override.infoAdvance : base.infoAdvance,
    twistFrequency: override.twistFrequency != null ? base.twistFrequency * override.twistFrequency : base.twistFrequency,
    hookStrength: override.hookStrength != null ? base.hookStrength * override.hookStrength : base.hookStrength,
  };
}

/**
 * 深拷贝一个MergedConfig（主要用于测试或快照）
 */
export function cloneMergedConfig(config: MergedConfig): MergedConfig {
  const vocab: Record<string, Set<string>> = {};
  for (const [key, set] of Object.entries(config.vocabulary)) {
    vocab[key] = new Set(set);
  }
  return {
    thresholds: { ...config.thresholds },
    radarWeights: { ...config.radarWeights },
    vocabulary: vocab as MergedVocabulary,
    systemPrompts: [...config.systemPrompts],
    constraints: [...config.constraints],
    examples: config.examples.map((e) => ({ ...e })),
    extraRules: [...config.extraRules],
    disabledChecks: new Set(config.disabledChecks),
    enabledChecks: new Set(config.enabledChecks),
  };
}
