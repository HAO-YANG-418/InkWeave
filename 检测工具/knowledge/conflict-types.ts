// ============================================================
// 冲突类型定义知识库 — v10.0
// 定义6种冲突类型及其检测信号、解决方式
// ConflictDiversityCheck 读取这份知识来追踪冲突多样性
// ============================================================

/** 冲突类型 */
export type ConflictType =
  | 'external_combat'          // 外部战斗冲突
  | 'internal_psychological'   // 内部心理冲突
  | 'interpersonal'            // 人际关系冲突
  | 'informational_cognitive'  // 信息/认知冲突
  | 'moral_choice'             // 道德/选择冲突
  | 'social_power';            // 社会/权力冲突

/** 冲突解决方式 */
export type ConflictResolution =
  | 'force'         // 靠更强力量获胜
  | 'intelligence'  // 智取
  | 'persuasion'    // 说服
  | 'luck'          // 运气/巧合
  | 'sacrifice'     // 付出代价
  | 'unresolved';   // 未解决

/** 冲突类型定义 */
export interface ConflictTypeDef {
  /** 类型ID */
  type: ConflictType;
  /** 中文名 */
  name: string;
  /** 定义 */
  definition: string;
  /** 典型场景 */
  typicalScenes: string[];
  /** 触发信号（规则兜底用） */
  triggerSignals: string[];
  /** 排除信号 — 出现这些词时降低本类型得分 */
  suppressSignals: string[];
  /** 建议的解决方式 */
  suggestedResolutions: ConflictResolution[];
  /** 不适合的解决方式 */
  badResolutions: ConflictResolution[];
}

/** 6种冲突类型定义 */
export const CONFLICT_TYPES: ConflictTypeDef[] = [
  {
    type: 'external_combat',
    name: '外部战斗冲突',
    definition: '主角与敌人/怪物/环境进行物理对抗',
    typicalScenes: ['打斗', '追杀', '逃亡', '闯关', '比武', '斗法'],
    triggerSignals: ['厮杀', '轰', '斩', '击杀', '交锋', '搏杀', '格挡', '闪避', '刺出', '挥剑', '劈', '爆裂', '冲击', '碾碎', '贯穿', '击飞', '拍飞', '撞飞', '轰然倒地', '吐血', '崩裂', '撞击', '咆哮', '翻滚', '拔剑', '冲上去', '怒吼', '嘶吼', '刺入', '砍', '挡住', '躲开'],
    suppressSignals: ['交谈', '调查', '推理', '分析', '思考', '回忆', '地图', '统计', '讨论', '商量', '询问', '解释', '讲述', '汇报', '研究', '犹豫', '挣扎', '恐惧', '害怕', '怀疑', '纠结'],
    suggestedResolutions: ['force', 'intelligence', 'sacrifice'],
    badResolutions: ['persuasion', 'luck'],
  },
  {
    type: 'internal_psychological',
    name: '内部心理冲突',
    definition: '主角内心的矛盾、恐惧、犹豫、自我怀疑',
    typicalScenes: ['道德困境', '自我怀疑', '创伤后应激', '信念动摇', '恐惧克服'],
    triggerSignals: ['犹豫', '矛盾', '挣扎', '恐惧', '害怕', '不敢', '怀疑', '动摇', '纠结', '内心', '心魔', '执念', '放不下', '该不该', '抉择', '放手', '不甘', '踌躇', '彷徨', '天人交战', '自我怀疑'],
    suppressSignals: ['厮杀', '交锋', '搏杀', '格挡', '闪避', '击飞', '拍飞', '轰然倒地', '吐血', '崩裂', '交谈', '调查', '地图', '统计'],
    suggestedResolutions: ['intelligence', 'sacrifice', 'persuasion'],
    badResolutions: ['force', 'luck'],
  },
  {
    type: 'interpersonal',
    name: '人际关系冲突',
    definition: '主角与盟友/恋人/师门之间的张力',
    typicalScenes: ['误会', '背叛', '立场分歧', '三角关系', '信任危机'],
    triggerSignals: ['误会', '背叛', '不信任', '争执', '分歧', '决裂', '翻脸', '疏远', '冷战', '吃醋', '嫉妒', '怨恨', '你为什么', '为什么不', '你到底', '质问', '指责'],
    suppressSignals: ['厮杀', '交锋', '搏杀', '格挡', '闪避', '击飞', '拍飞', '轰然倒地', '吐血', '崩裂'],
    suggestedResolutions: ['persuasion', 'intelligence', 'sacrifice'],
    badResolutions: ['force', 'luck'],
  },
  {
    type: 'informational_cognitive',
    name: '信息/认知冲突',
    definition: '主角知道的信息与实际情况有差距，或认知被颠覆',
    typicalScenes: ['被欺骗', '发现真相', '认知颠覆', '识破伪装', '揭露阴谋'],
    triggerSignals: ['真相', '秘密', '谎言', '欺骗', '伪装', '隐藏', '幕后', '揭穿', '真相大白', '骗局', '识破', '被蒙蔽', '假象', '瞒天过海', '揭露', '拆穿', '伪装被'],
    suppressSignals: ['厮杀', '交锋', '搏杀', '格挡', '闪避', '击飞', '拍飞', '轰然倒地', '吐血', '崩裂'],
    suggestedResolutions: ['intelligence', 'persuasion', 'sacrifice'],
    badResolutions: ['force', 'luck'],
  },
  {
    type: 'moral_choice',
    name: '道德/选择冲突',
    definition: '主角必须在两个都有代价的选项中抉择',
    typicalScenes: ['牺牲一人救更多人', '遵守规则vs打破规则', '道义vs利益'],
    triggerSignals: ['选择', '抉择', '两难', '牺牲', '代价', '值得', '不应该', '必须', '只能', '要么', '为了', '活下去', '活下去的代价'],
    suppressSignals: ['厮杀', '交锋', '搏杀', '格挡', '闪避', '击飞', '拍飞', '轰然倒地', '吐血', '崩裂', '交谈', '调查', '地图', '统计'],
    suggestedResolutions: ['sacrifice', 'intelligence', 'persuasion'],
    badResolutions: ['force', 'luck'],
  },
  {
    type: 'social_power',
    name: '社会/权力冲突',
    definition: '主角与权力结构、社会规则、阶级壁垒对抗',
    typicalScenes: ['被诬陷', '权力斗争', '阶级跨越', '挑战权威', '体制压迫'],
    triggerSignals: ['权力', '地位', '阶级', '权威', '规矩', '律法', '宗门', '朝廷', '势力', '压迫', '不公', '诬陷', '栽赃', '长老会', '真传弟子', '外门', '内门', '等级'],
    suppressSignals: ['厮杀', '交锋', '搏杀', '格挡', '闪避', '击飞', '拍飞', '轰然倒地', '吐血', '崩裂'],
    suggestedResolutions: ['intelligence', 'persuasion', 'force', 'sacrifice'],
    badResolutions: ['luck'],
  },
];

/** 默认配置 */
export const DEFAULT_CONFLICT_CONFIG = {
  /** 滑动窗口大小 */
  windowSize: 5,
  /** 窗口内最少冲突类型数 */
  minConflictTypes: 3,
  /** 同类型连续最大容忍数 */
  maxConsecutiveSame: 2,
  /** 同解决方式连续最大容忍数 */
  maxConsecutiveSameResolution: 2,
};

/** 获取冲突类型定义 */
export function getConflictTypeDef(type: ConflictType): ConflictTypeDef | undefined {
  return CONFLICT_TYPES.find(t => t.type === type);
}

/** 获取冲突类型名称 */
export function getConflictTypeName(type: ConflictType): string {
  return getConflictTypeDef(type)?.name || type;
}

/** 获取解决方式名称 */
export function getResolutionName(resolution: ConflictResolution): string {
  const names: Record<ConflictResolution, string> = {
    force: '靠更强力量获胜',
    intelligence: '智取',
    persuasion: '说服',
    luck: '运气/巧合',
    sacrifice: '付出代价',
    unresolved: '未解决',
  };
  return names[resolution] || resolution;
}

/** LLM Prompt：让LLM分析章节的冲突类型 */
export function generateConflictAnalysisPrompt(content: string): string {
  return `分析以下章节内容，提取冲突信息。

冲突类型定义：
${CONFLICT_TYPES.map(t => `- ${t.type}（${t.name}）：${t.definition}。典型场景：${t.typicalScenes.join('、')}`).join('\n')}

解决方式定义：
- force：靠更强力量获胜
- intelligence：智取（利用信息差、环境、规则）
- persuasion：说服（改变对方想法）
- luck：运气/巧合
- sacrifice：付出代价（牺牲某物换取胜利）
- unresolved：未解决

判断依据：
1. 本章的核心冲突是什么？
2. 冲突双方是谁？
3. 冲突如何解决的（如果解决了的话）？

请只返回一个JSON：
{"primaryConflict": "类型ID", "secondaryConflicts": ["类型ID"], "resolution": "解决方式ID", "confidence": 0.0-1.0}

章节内容（前2000字）：
${content.slice(0, 2000)}`;
}
