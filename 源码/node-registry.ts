// ============================================================
// GWE V2.0 - 节点注册表
// 内置所有19个节点定义，支持动态注册选项(.kb文件加载)
// ============================================================

import type {
  NodeDefinition,
  NodeId,
  NodeCategory,
  OptionId,
  NodeOptionKB,
} from './types';
import { logWarn } from './logger';

// ============================================================
// 内置22个节点定义（V3新增3个追读力节点）
// 分类：12个style、2个vocab、6个rule、2个ai
// ============================================================

const BUILTIN_NODES: NodeDefinition[] = [
  // ========== 风格类 (style) - 12个 ==========
  {
    id: 'node_sentence_rhythm',
    name: '句子节奏',
    category: 'style',
    description: '控制句子长短节奏，影响阅读呼吸感',
    required: true,
    defaultOptionId: 'opt_rhythm_mixed',
    options: [
      'opt_rhythm_short',      // 短句为主（快节奏，适合战斗/紧张）
      'opt_rhythm_medium',     // 长短适中（通用）
      'opt_rhythm_long',       // 长句为主（慢节奏，适合描写/抒情）
      'opt_rhythm_mixed',      // 长短交错（戏剧化，适合情绪起伏）
    ],
  },
  {
    id: 'node_paragraph_density',
    name: '段落密度',
    category: 'style',
    description: '控制段落长度和分段频率',
    required: true,
    defaultOptionId: 'opt_dense_medium',
    options: [
      'opt_dense_high',        // 高密度（短段快节奏，适合爽文/战斗）
      'opt_dense_medium',      // 标准密度（适中段落，默认）
      'opt_dense_low',         // 低密度（长段慢节奏，适合传统文学）
    ],
  },
  {
    id: 'node_dialogue_style',
    name: '对话风格',
    category: 'style',
    description: '控制对话表达方式和穿插动作',
    required: true,
    defaultOptionId: 'opt_dialogue_natural',
    options: [
      'opt_dialogue_natural',  // 自然对话（适度动作穿插，默认）
      'opt_dialogue_concise',  // 精炼对话（简洁有力，少废话）
      'opt_dialogue_stylized', // 风格化对话（符合角色人设，有辨识度）
      'opt_dialogue_verbose',  // 絮叨风格（对话带大量心理/旁白）
    ],
  },
  {
    id: 'node_description_style',
    name: '描写风格',
    category: 'style',
    description: '控制环境/人物描写的详略和方式',
    required: true,
    defaultOptionId: 'opt_desc_sensory',
    options: [
      'opt_desc_sensory',      // 感官密集（五感多通道并进，默认）
      'opt_desc_minimal',      // 白描极简（只给关键信息，留白）
      'opt_desc_poetic',       // 诗意画面（意境优先，意象优美）
      'opt_desc_clinical',     // 冷硬写实（客观精确，不带情感色彩）
    ],
  },
  {
    id: 'node_battle_style',
    name: '战斗风格',
    category: 'style',
    description: '战斗/动作场景的写作风格',
    required: false,
    defaultOptionId: 'opt_battle_detail',
    options: [
      'opt_battle_detail',     // 重细节拆招（一招一式清晰拆解，默认）
      'opt_battle_atmosphere', // 氛围流（侧重压迫感和临场氛围）
      'opt_battle_result',     // 结果导向（快节奏推进，不写过程细节）
      'opt_battle_psychological', // 心理流（侧重战斗中的心理博弈）
    ],
  },
  {
    id: 'node_emotion_style',
    name: '情感表达',
    category: 'style',
    description: '情感描写的表达方式',
    required: true,
    defaultOptionId: 'opt_emotion_both',
    options: [
      'opt_emotion_show',      // 以动写情（身体反应+动作，Show don't tell）
      'opt_emotion_tell',      // 直抒胸臆（直接写心理和情绪）
      'opt_emotion_both',      // 内外结合（动作描写+内心独白，默认）
    ],
  },
  {
    id: 'node_tone',
    name: '整体基调',
    category: 'style',
    description: '作品整体语气和氛围',
    required: true,
    defaultOptionId: 'opt_tone_colloquial',
    options: [
      'opt_tone_classical',    // 唯美古风（古雅用词，古典韵味）
      'opt_tone_colloquial',   // 口语白话（接地气，现代口语感，默认）
      'opt_tone_serious',      // 严肃正剧（沉稳厚重）
      'opt_tone_cold',         // 冷峻克制（冷硬内敛，不煽情）
      'opt_tone_playful',      // 俏皮轻松（幽默活泼，有网感）
      'opt_tone_folksy',       // 乡土市井（接地气，烟火气浓）
      'opt_tone_badass',       // 硬核爽利（霸气硬朗，力量感强）
    ],
  },
  {
    id: 'node_platform',
    name: '目标平台',
    category: 'style',
    description: '针对不同平台的适配优化',
    required: true,
    defaultOptionId: 'opt_platform_generic',
    options: [
      'opt_platform_qidian',   // 起点中文网
      'opt_platform_tomato',   // 番茄小说
      'opt_platform_jinjiang', // 晋江文学城
      'opt_platform_feilu',    // 飞卢小说
      'opt_platform_qimao',    // 七猫小说
      'opt_platform_newmedia', // 新媒体/公众号
      'opt_platform_generic',  // 通用平台（默认）
    ],
  },
  {
    id: 'node_info_density',
    name: '信息密度',
    category: 'style',
    description: '世界观/设定信息的铺陈密度',
    required: true,
    defaultOptionId: 'opt_info_balanced',
    options: [
      'opt_info_fast',         // 快节奏（信息推进快，少铺垫）
      'opt_info_balanced',     // 均衡（设定随剧情自然交代，默认）
      'opt_info_leisurely',    // 慢节奏（从容铺陈，世界观细腻）
    ],
  },
  {
    id: 'node_payoff_frequency',
    name: '爽点频率',
    category: 'style',
    description: '小高潮/爽点出现的频率',
    required: true,
    defaultOptionId: 'opt_payoff_every_chapter',
    options: [
      'opt_payoff_every_chapter', // 每章爽点（每章至少1个小高潮，默认）
      'opt_payoff_every_3',       // 每3章爽点（铺垫后集中爆发）
      'opt_payoff_sparse',        // 稀疏爽点（慢热大后期爆发）
    ],
  },
  {
    id: 'node_pov',
    name: '叙事视角',
    category: 'style',
    description: '叙事人称和视角限制',
    required: true,
    defaultOptionId: 'opt_pov_limited_third_past',
    options: [
      'opt_pov_first_past',           // 第一人称过去时
      'opt_pov_first_present',        // 第一人称现在时
      'opt_pov_limited_third_past',   // 第三人称有限过去时（跟随主角，默认）
      'opt_pov_limited_third_present',// 第三人称有限现在时
      'opt_pov_omniscient_third_past',// 第三人称全知过去时（上帝视角）
      'opt_pov_omniscient_third_present',// 第三人称全知现在时
    ],
  },
  {
    id: 'node_rhetoric',
    name: '修辞偏好',
    category: 'style',
    description: '修辞手法使用偏好',
    required: false,
    defaultOptionId: 'opt_rhetoric_plain',
    options: [
      'opt_rhetoric_metaphor', // 善用比喻（关键处用比喻/通感）
      'opt_rhetoric_plain',    // 朴素无华（几乎不用修辞，默认）
      'opt_rhetoric_ornate',   // 华丽铺陈（大量排比/对偶/夸张）
      'opt_rhetoric_sketch',   // 白描勾勒（用最简笔触点染）
    ],
  },

  // ========== 词库类 (vocab) - 2个 ==========
  {
    id: 'node_vocab_sensory',
    name: '题材词库',
    category: 'vocab',
    description: '按题材加载专属词汇（世界观/身体/动作/感官词汇扩展）',
    required: false,
    defaultOptionId: 'opt_vocab_generic',
    options: [
      'opt_vocab_xianxia',     // 玄幻修仙
      'opt_vocab_urban',       // 都市现代
      'opt_vocab_scifi',       // 科幻未来
      'opt_vocab_mystery',     // 悬疑推理
      'opt_vocab_fantasy',     // 西方奇幻
      'opt_vocab_historical',  // 历史古风
      'opt_vocab_esports',     // 电竞游戏
      'opt_vocab_daily',       // 日常治愈
      'opt_vocab_horror',      // 恐怖灵异
      'opt_vocab_military',    // 军事战争
      'opt_vocab_generic',     // 通用词库（默认）
    ],
  },
  {
    id: 'node_vocab_filler',
    name: '填充词管控',
    category: 'vocab',
    description: '禁用/控制填充词和冗余表达',
    required: false,
    defaultOptionId: 'opt_filler_standard',
    options: [
      'opt_filler_strict',     // 严格（禁用绝大多数填充词）
      'opt_filler_standard',   // 标准（控制常用填充词，默认）
      'opt_filler_relaxed',    // 宽松（少量填充词可接受）
      'opt_filler_webnovel',   // 网文模式（保留部分网文常用表达）
    ],
  },

  // ========== 规则类 (rule) - 3个 ==========
  {
    id: 'node_target_length',
    name: '目标字数',
    category: 'rule',
    description: '单章/单次生成的目标字数',
    required: true,
    defaultOptionId: 'opt_length_2800',
    options: [
      'opt_length_1500',       // 1500字左右（短章）
      'opt_length_2200',       // 2200字左右（标准章节）
      'opt_length_2800',       // 2800字左右（默认）
      'opt_length_3000',       // 3000字左右（长章节）
      'opt_length_4000',       // 4000字以上（大章）
      'opt_length_custom',     // 自定义字数
    ],
  },
  {
    id: 'node_anchor_density',
    name: '锚点密度',
    category: 'rule',
    description: '身体锚点（身体反应）的密度要求',
    required: true,
    defaultOptionId: 'opt_anchor_standard',
    options: [
      'opt_anchor_sparse',     // 稀疏锚点（500字以上1个）
      'opt_anchor_standard',   // 标准锚点（300-500字1个，默认）
      'opt_anchor_dense',      // 密集锚点（200字左右1个）
      'opt_anchor_extreme',    // 极高密度（几乎每段都有）
    ],
  },
  {
    id: 'node_strictness',
    name: '检测严格度',
    category: 'rule',
    description: '规则检测的严格程度',
    required: true,
    defaultOptionId: 'opt_strict_standard',
    options: [
      'opt_strict_lenient',    // 宽松模式（只报严重问题）
      'opt_strict_standard',   // 标准模式（默认）
      'opt_strict_strict',     // 严格模式（所有问题都报）
    ],
  },

  // ========== 追读力类 (hook) - 3个 V3新增 ==========
  {
    id: 'node_opening_impact',
    name: '开头冲击力',
    category: 'rule',
    description: '控制开头感官轰炸强度，决定读者0.5秒内是否被拽进场景',
    required: true,
    defaultOptionId: 'opt_opening_strong',
    options: [
      'opt_opening_weak',      // 平和切入（慢热，环境描写开头）
      'opt_opening_medium',    // 中等冲击（动作/声音切入，默认）
      'opt_opening_strong',    // 感官轰炸（疼/冷/烫/响第一句，强追读）
    ],
  },
  {
    id: 'node_twist_frequency',
    name: '反咬频率',
    category: 'rule',
    description: '信息反咬/反转密度，每多少字颠覆一次读者预期',
    required: true,
    defaultOptionId: 'opt_twist_standard',
    options: [
      'opt_twist_sparse',     // 稀疏（800字+一次反转，慢热文）
      'opt_twist_standard',   // 标准（300-400字一次反咬，默认）
      'opt_twist_dense',      // 密集（200-250字一次反转，爽文/悬疑）
    ],
  },
  {
    id: 'node_ending_hook',
    name: '章末钩子强度',
    category: 'rule',
    description: '章末钩子强度，决定读者翻下一章的欲望',
    required: true,
    defaultOptionId: 'opt_hook_break',
    options: [
      'opt_hook_soft',        // 平和收束（情绪落点，自然收尾）
      'opt_hook_suspense',    // 悬念钩子（未解问题，默认）
      'opt_hook_break',       // 断裂钩子（新信息颠覆，骂娘断章）
    ],
  },

  // ========== AI类 (ai) - 2个 ==========
  {
    id: 'node_ai_creativity',
    name: 'AI创造度',
    category: 'ai',
    description: '控制AI生成时的创造性/温度',
    required: true,
    defaultOptionId: 'opt_ai_balanced',
    options: [
      'opt_ai_conservative',   // 保守模式（temperature低，严格按上下文）
      'opt_ai_balanced',       // 均衡模式（默认）
      'opt_ai_adventurous',    // 放飞模式（temperature高，允许发散）
    ],
  },
  {
    id: 'node_ai_continue_length',
    name: '续写长度',
    category: 'ai',
    description: 'AI单次续写的目标长度',
    required: false,
    defaultOptionId: 'opt_ai_medium',
    options: [
      'opt_ai_short',          // 短续写（约500字）
      'opt_ai_medium',         // 中等续写（约1000-1500字，默认）
      'opt_ai_long',           // 长续写（约2000-3000字）
      'opt_ai_xtra_long',      // 超长续写（4000字以上）
    ],
  },
];

// ============================================================
// 注册表内部状态
// ============================================================

/** 节点定义映射表 */
const nodes: Map<NodeId, NodeDefinition> = new Map();

/** 已加载的节点选项(.kb文件数据)映射表 */
const options: Map<OptionId, NodeOptionKB> = new Map();

// 初始化：注册所有内置节点
BUILTIN_NODES.forEach((node) => {
  nodes.set(node.id, node);
});

// ============================================================
// 公开API
// ============================================================

/**
 * 注册一个新节点（通常用于插件扩展）
 * @param def 节点定义
 * @throws 如果节点ID已存在则抛出错误
 */
export function registerNode(def: NodeDefinition): void {
  if (nodes.has(def.id)) {
    throw new Error(`[node-registry] 节点 "${def.id}" 已存在，无法重复注册`);
  }
  nodes.set(def.id, def);
}

/**
 * 注册一个节点选项（从.kb.json文件加载）
 * @param kb 选项KB数据
 * @throws 如果选项所属节点不存在则抛出错误
 */
export function registerNodeOption(kb: NodeOptionKB): void {
  const node = nodes.get(kb.node_id);
  if (!node) {
    throw new Error(
      `[node-registry] 选项 "${kb.option_id}" 所属节点 "${kb.node_id}" 不存在`
    );
  }
  // 验证option_id是否在节点的options列表中
  if (!node.options.includes(kb.option_id)) {
    logWarn('NodeRegistry', `选项 "${kb.option_id}" 未在节点 "${kb.node_id}" 的预定义列表中，可能为自定义选项`);
  }
  options.set(kb.option_id, kb);
}

/**
 * 获取节点定义
 * @param id 节点ID
 */
export function getNode(id: NodeId): NodeDefinition | undefined {
  return nodes.get(id);
}

/**
 * 获取已加载的节点选项KB数据
 * @param optionId 选项ID
 */
export function getNodeOption(optionId: OptionId): NodeOptionKB | undefined {
  return options.get(optionId);
}

/**
 * 获取所有已注册的节点定义
 * @param category 可选分类过滤
 */
export function getAllNodes(category?: NodeCategory): NodeDefinition[] {
  const all = Array.from(nodes.values());
  if (category) {
    return all.filter((n) => n.category === category);
  }
  return all;
}

/**
 * 获取所有已注册选项的数量
 */
export function getRegisteredOptionCount(): number {
  return options.size;
}

/**
 * 获取默认选项选择集
 * 对每个必选节点使用defaultOptionId，非必选节点不选
 */
export function getDefaultSelections(): Partial<Record<NodeId, OptionId>> {
  const selections: Partial<Record<NodeId, OptionId>> = {};
  for (const node of nodes.values()) {
    if (node.required) {
      selections[node.id] = node.defaultOptionId;
    }
  }
  return selections;
}

/**
 * 获取完整的默认选择（包括非必选节点，也使用默认值）
 */
export function getDefaultSelectionsFull(): Record<NodeId, OptionId> {
  const selections = {} as Record<NodeId, OptionId>;
  for (const node of nodes.values()) {
    selections[node.id] = node.defaultOptionId;
  }
  return selections;
}

/**
 * 按分类获取节点
 */
export function getNodesByCategory(category: NodeCategory): NodeDefinition[] {
  return getAllNodes(category);
}

/**
 * 验证一个selections对象是否完整（所有必选节点都有选择）
 */
export function validateSelectionsComplete(
  selections: Partial<Record<NodeId, OptionId>>
): { complete: boolean; missingNodes: NodeId[] } {
  const missing: NodeId[] = [];
  for (const node of nodes.values()) {
    if (node.required && !selections[node.id]) {
      missing.push(node.id);
    }
  }
  return { complete: missing.length === 0, missingNodes: missing };
}

/**
 * 重置注册表（主要用于测试）
 */
export function _resetRegistry(): void {
  nodes.clear();
  options.clear();
  BUILTIN_NODES.forEach((node) => nodes.set(node.id, node));
}
