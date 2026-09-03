// ============================================================
// 章类型定义知识库 — v10.0
// 定义7种章功能类型及其检测规则、间隔要求
// ChapterTypeTracker 读取这份知识来追踪和推荐章类型轮换
// ============================================================

/** 章功能类型 */
export type ChapterFunctionType =
  | 'battle'       // 战斗章
  | 'reward'       // 收获章
  | 'setup'        // 铺垫章
  | 'conflict'     // 冲突章
  | 'payoff'       // 爽点章
  | 'suspense'     // 悬念章
  | 'transition';  // 过渡章

/** 章类型定义 */
export interface ChapterTypeDef {
  /** 类型ID */
  type: ChapterFunctionType;
  /** 中文名 */
  name: string;
  /** 功能描述 */
  function: string;
  /** 情感效果 */
  emotion: string;
  /** 最小间隔（章数） */
  minInterval: number;
  /** 触发关键词（规则兜底用） */
  triggerKeywords: string[];
  /** 排除关键词 — 出现这些词时降低本类型得分 */
  suppressKeywords: string[];
  /** 不适合的场景 */
  worstFor: string[];
  /** 推荐的后续类型 */
  recommendedNext: ChapterFunctionType[];
}

/** 7种章类型定义 */
export const CHAPTER_TYPES: ChapterTypeDef[] = [
  {
    type: 'battle',
    name: '战斗章',
    function: '推进外部冲突，展示主角实力，提供紧张感和视觉冲击',
    emotion: '紧张/热血',
    minInterval: 2,
    triggerKeywords: ['厮杀', '轰', '斩', '击杀', '交锋', '搏杀', '格挡', '闪避', '刺出', '挥剑', '劈', '爆裂', '冲击', '碾碎', '贯穿', '击飞', '拍飞', '撞飞', '轰然倒地', '吐血', '崩裂', '撞击', '咆哮', '翻滚', '拔剑', '冲上去', '怒吼', '嘶吼', '刺入', '砍', '挡住', '躲开'],
    suppressKeywords: ['交谈', '调查', '推理', '分析', '思考', '回忆', '疑问', '秘密', '线索', '地图', '统计', '讨论', '商量', '询问', '解释', '讲述', '汇报', '研究'],
    worstFor: ['日常过渡', '世界观展开', '角色内心深化'],
    recommendedNext: ['reward', 'setup', 'transition'],
  },
  {
    type: 'reward',
    name: '收获章',
    function: '获得新能力/资源/信息，让读者获得满足感和期待',
    emotion: '满足/期待',
    minInterval: 3,
    triggerKeywords: ['突破', '获得', '收获', '提升', '领悟', '吸收', '吞噬', '融合', '炼化', '晋级', '晋升', '进阶', '宝物', '传承', '机缘', '奖励', '兽核', '战利品', '疗伤', '封印松动', '经脉', '境界'],
    suppressKeywords: ['厮杀', '交锋', '搏杀', '格挡', '闪避', '击飞', '拍飞', '轰然倒地'],
    worstFor: ['高潮前', '紧张氛围中'],
    recommendedNext: ['setup', 'conflict', 'suspense'],
  },
  {
    type: 'setup',
    name: '铺垫章',
    function: '埋设伏笔，建立角色关系，展开世界观，制造好奇',
    emotion: '好奇/沉浸',
    minInterval: 2,
    triggerKeywords: ['注意到', '注意', '观察', '交谈', '了解', '调查', '研究', '探索', '回忆', '想起', '线索', '秘密', '疑问', '奇怪', '异常', '地图', '标记', '统计', '分析', '推理', '规律', '怀疑', '背后', '暗中', '跟踪', '记录', '探查', '搜集', '梳理'],
    suppressKeywords: ['厮杀', '交锋', '搏杀', '格挡', '闪避', '击飞', '拍飞', '轰然倒地', '吐血', '崩裂'],
    worstFor: ['爽点章', '高潮章'],
    recommendedNext: ['conflict', 'battle', 'suspense'],
  },
  {
    type: 'conflict',
    name: '冲突章',
    function: '引爆矛盾，制造危机，打破平衡，推动剧情转折',
    emotion: '紧张/不安',
    minInterval: 2,
    triggerKeywords: ['冲突', '矛盾', '爆发', '翻脸', '背叛', '误会', '争执', '对峙', '威胁', '逼迫', '困境', '危机', '陷害', '挑衅', '挑战', '质问', '揭穿', '摊牌', '反目'],
    suppressKeywords: ['交谈', '调查', '推理', '分析', '思考', '回忆', '地图', '统计', '突破', '觉醒', '领悟', '吸收', '炼化', '传承', '宝物', '奖励', '经脉', '境界', '晋级', '晋升', '机缘', '疗伤', '融合', '吞噬'],
    worstFor: ['日常过渡', '收获章'],
    recommendedNext: ['payoff', 'battle', 'suspense'],
  },
  {
    type: 'payoff',
    name: '爽点章',
    function: '打脸、逆袭、突破，释放积累的情绪，给读者爽感',
    emotion: '爽/释放',
    minInterval: 3,
    triggerKeywords: ['反杀', '打脸', '震惊', '逆转', '翻盘', '碾压', '秒杀', '震碎', '亮出', '暴露', '揭穿', '反击', '爆发', '一举', '不可能', '怎么可能', '你——', '跪倒', '不可思议'],
    suppressKeywords: ['交谈', '调查', '推理', '分析', '思考', '回忆', '地图', '统计'],
    worstFor: ['铺垫章', '过渡章'],
    recommendedNext: ['reward', 'setup', 'transition'],
  },
  {
    type: 'suspense',
    name: '悬念章',
    function: '揭示部分真相，抛出更大的谜团，维持追读动力',
    emotion: '好奇/追读冲动',
    minInterval: 2,
    triggerKeywords: ['真相', '秘密', '谜团', '答案', '不可思议', '震惊', '揭示', '揭晓', '隐藏', '幕后', '真相大白', '谜底', '恍然大悟', '幕后黑手', '细思极恐', '揭开', '谜底揭晓'],
    suppressKeywords: ['厮杀', '交锋', '搏杀', '格挡', '闪避', '击飞', '拍飞', '轰然倒地'],
    worstFor: ['战斗章', '爽点章'],
    recommendedNext: ['setup', 'conflict', 'transition'],
  },
  {
    type: 'transition',
    name: '过渡章',
    function: '连接两个大场景/阶段，日常/旅行/修炼，调节节奏',
    emotion: '松弛/沉浸',
    minInterval: 1,
    triggerKeywords: ['路上', '回到', '几天后', '第二天', '时间', '修炼', '日常', '闲聊', '休息', '准备', '计划', '整理', '消化', '晨光', '傍晚', '雨', '雾', '吃饭', '疗伤', '包扎'],
    suppressKeywords: ['厮杀', '交锋', '搏杀', '格挡', '闪避', '击飞', '拍飞', '轰然倒地', '吐血', '崩裂', '碾压', '秒杀'],
    worstFor: ['高潮章', '爽点章'],
    recommendedNext: ['setup', 'conflict', 'battle'],
  },
];

/** 默认配置 */
export const DEFAULT_CHAPTER_TYPE_CONFIG = {
  /** 连续同类型最大容忍数 */
  maxConsecutiveSameType: 2,
  /** 滑动窗口大小（章数） */
  slidingWindowSize: 8,
  /** 窗口内同类型最大占比 */
  maxTypeRatio: 0.5,
};

/** 获取类型定义 */
export function getChapterTypeDef(type: ChapterFunctionType): ChapterTypeDef | undefined {
  return CHAPTER_TYPES.find(t => t.type === type);
}

/** 获取类型名称 */
export function getChapterTypeName(type: ChapterFunctionType): string {
  return getChapterTypeDef(type)?.name || type;
}

/** 获取类型的推荐后续 */
export function getRecommendedNext(type: ChapterFunctionType): ChapterFunctionType[] {
  return getChapterTypeDef(type)?.recommendedNext || [];
}

/** 获取类型最小间隔 */
export function getMinInterval(type: ChapterFunctionType): number {
  return getChapterTypeDef(type)?.minInterval || 1;
}

/** LLM Prompt：让LLM判断章类型 */
export function generateChapterTypePrompt(content: string): string {
  return `分析以下章节内容，判断它的功能类型。

章节类型定义：
${CHAPTER_TYPES.map(t => `- ${t.type}（${t.name}）：${t.function}。情感效果：${t.emotion}`).join('\n')}

【关键区分规则 — 必须遵守】
1. reward（收获章）vs conflict（冲突章）：
   - 收获章的核心是"获得"：获得能力、突破境界、获取宝物、领悟传承、吸收能量。主角在变强/变富。
   - 冲突章的核心是"对抗"：人与人之间的矛盾、背叛、争执、对峙、威胁、陷害。主角在与人斗。
   - 修炼突破、觉醒能力、炼化宝物 → 永远是reward，不是conflict。即使过程中有内心挣扎。
   - 典型误判：主角在觉醒/突破时感到痛苦或挣扎 → 这仍是reward（获得新能力），不是conflict。

2. battle（战斗章）vs payoff（爽点章）：
   - 战斗章：有来有回的战斗过程，势均力敌的对抗，以战斗描写为主体。
   - 爽点章：强势碾压、秒杀、打脸，以读者爽感为主体，战斗过程简短。

3. setup（铺垫章）vs suspense（悬念章）：
   - 铺垫章：埋设伏笔、建立关系、展开世界观，读者情绪是"好奇/沉浸"。
   - 悬念章：揭示部分真相同时抛出更大谜团，读者情绪是"震惊/追读冲动"。

判断依据：
1. 这章的核心事件是什么？（战斗/获得/冲突/铺垫/爽点/悬念/过渡）
2. 读者的主要情感体验是什么？
3. 这章在剧情推进中的作用是什么？

请只返回一个JSON：
{"type": "类型ID", "confidence": 0.0-1.0, "reason": "一句话理由（需说明核心事件）"}

章节内容（前2000字）：
${content.slice(0, 2000)}`;
}
