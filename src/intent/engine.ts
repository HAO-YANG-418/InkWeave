// ============================================================
// 意图引擎 — GWE v6.0 基础智能层
// 核心能力：理解"这一章要做什么"，根据故事状态主动推荐意图
// 这是引擎从"工具"到"思考者"的第一步
// v12.4: 增加章末钩子策略 + 意图深度定制写作引导
// v12.8: 钩子扩展至4种/意图 + 5种通用 + 冷却轮换机制
// ============================================================

import {
  type IntentType,
  type IntentResult,
  type IntentDetection,
  type EmotionalTone,
  type EmotionType,
  type NarrativeStrategy,
  type PacingSuggestion,
  type ChapterContext,
  type IntentEngineConfig,
  DEFAULT_INTENT_CONFIG,
} from './types'

// ============================================================
// v12.8: 钩子轮换追踪器
// 记录每种意图最近使用的钩子，避免短期重复，保证多样性
// ============================================================

interface HookUsageRecord {
  hookName: string
  usedAtChapter: number
}

class HookRotationTracker {
  /** intentType → 最近使用的钩子名称列表（按使用时间倒序） */
  private usage: Map<IntentType, HookUsageRecord[]> = new Map()
  /** 冷却窗口：同一钩子在多少章内不能重复 */
  private static COOLDOWN_WINDOW = 2

  /**
   * 选择一个钩子策略，优先选择最近未用过的
   * 策略：从意图专属钩子(4种) + 通用钩子(5种)中，排除冷却中的，随机选一个
   */
  selectHook(
    intent: IntentType,
    chapterNumber: number,
    intentHooks: EndingHookStrategy[],
    universalHooks: EndingHookStrategy[],
  ): EndingHookStrategy {
    const allHooks = [...intentHooks, ...universalHooks]
    const used = this.usage.get(intent) || []
    const usedNames = new Set(
      used
        .filter(r => chapterNumber - r.usedAtChapter < HookRotationTracker.COOLDOWN_WINDOW)
        .map(r => r.hookName)
    )

    // 优先选择冷却外的钩子
    const available = allHooks.filter(h => !usedNames.has(h.name))
    const pool = available.length > 0 ? available : allHooks
    const selected = pool[Math.floor(Math.random() * pool.length)]

    // 记录使用
    const records = this.usage.get(intent) || []
    records.unshift({ hookName: selected.name, usedAtChapter: chapterNumber })
    // 只保留最近10条记录
    if (records.length > 10) records.length = 10
    this.usage.set(intent, records)

    return selected
  }

  /** 获取指定意图的钩子使用历史（用于调试） */
  getUsageHistory(intent: IntentType): HookUsageRecord[] {
    return this.usage.get(intent) || []
  }

  /** 重置所有记录 */
  reset(): void {
    this.usage.clear()
  }
}

// ============================================================
// v12.1: 意图 → 开头策略映射
// 每种意图类型有对应的最佳开头方式，解决"开头强度弱"问题
// ============================================================

interface OpeningStrategy {
  /** 策略名称 */
  name: string
  /** 推荐的开头方式 */
  style: 'sensory' | 'action' | 'dialogue' | 'in_medias' | 'scene_setting' | 'character_focus'
  /** 具体指导 */
  guidance: string
  /** 示例 */
  example: string
}

const INTENT_OPENING: Record<IntentType, OpeningStrategy[]> = {
  show_growth: [
    { name: '感官锚点', style: 'sensory', guidance: '用具体的身体感受开头——疼痛、温度、触感，让读者立刻进入角色体内', example: '冷。不是温度，是那种从骨头缝里渗出来的寒意。' },
    { name: '动作切入', style: 'action', guidance: '用一个正在进行的动作开头，暗示角色的挣扎状态', example: '他蜷缩在角落里，双手死死攥着膝盖，指节已经发白。' },
  ],
  create_conflict: [
    { name: '对话引爆', style: 'dialogue', guidance: '用一句有冲突的对话开头，直接抛出对立', example: '"这是什么意思？"他把纸拍在桌上，整个议事厅安静了一瞬。' },
    { name: '动作对峙', style: 'action', guidance: '用一个对峙动作开头，制造即刻的紧张感', example: '秦风的手指在桌沿上敲了第三下——那是他压抑怒火的方式。' },
  ],
  advance_plot: [
    { name: '场景定位', style: 'scene_setting', guidance: '用时间/地点坐标快速定位，然后推进事件', example: '天亮的时候，三个人影已经出现在山门外。' },
    { name: '中途切入', style: 'in_medias', guidance: '从事件中间切入，省略铺垫，直接推进', example: '消息比人跑得快。当执法队踏进广场时，整个宗门都知道了。' },
  ],
  plant_foreshadow: [
    { name: '细节锚定', style: 'sensory', guidance: '用看似普通的细节开头，在细节中埋下异常', example: '苏云裳离开时，林渊注意到她腰间挂着一枚玉佩——很普通，但纹路他总觉眼熟。' },
    { name: '日常反差', style: 'scene_setting', guidance: '从日常场景开头，让伏笔在平凡中自然浮现', example: '那天晚上，林渊在废墟里翻到了一块碎片。' },
  ],
  climax: [
    { name: '高压切入', style: 'action', guidance: '用一个正在发生的致命动作开头，不作任何铺垫', example: '第三剑划破了他的左肩。第五剑刺穿了他的右腿。第七剑——' },
    { name: '感官冲击', style: 'sensory', guidance: '用强烈的感官冲击（光、声、冲击波）直接拉入', example: '暗金色的光从他的后背炸开，像一轮太阳从地底升起。' },
  ],
  build_relationship: [
    { name: '对话开场', style: 'dialogue', guidance: '用角色间的对话开头，直接展示关系动态', example: '"你受伤了。"苏云裳的声音从背后传来。' },
    { name: '动作互动', style: 'action', guidance: '用一个互动动作开头，展示关系本质', example: '她走到他身边，不由分说地把药粉按在伤口上。' },
  ],
  reveal_secret: [
    { name: '悬念钩子', style: 'sensory', guidance: '用一个异常感知开头，制造"不对劲"的感觉', example: '那枚玉佩在林渊手心里微微发烫——不是体温，是它自己热的。' },
    { name: '对话揭示', style: 'dialogue', guidance: '用一句揭示性的对话开头，直接抛出信息', example: '"因为剑骨。"苏云裳说，"每一代剑骨觉醒者，都会成为剑阁的弟子。"' },
  ],
  build_atmosphere: [
    { name: '环境沉浸', style: 'scene_setting', guidance: '用具体的环境描写开头，让读者先"站"在场景里', example: '青云宗的后山，有一条没人走的小路。路两旁是密不透风的铁杉林。' },
    { name: '感官铺陈', style: 'sensory', guidance: '用多重感官细节（视觉/听觉/嗅觉）铺陈氛围', example: '空气里有一股铁锈和腐叶混杂的气味，像有什么在泥土深处腐烂。' },
  ],
  emotional_impact: [
    { name: '结果先行', style: 'in_medias', guidance: '先给出情感结果（死亡/失去/背叛），再展开过程', example: '秦风死了。林渊是在第二天早上才知道的。' },
    { name: '沉默冲击', style: 'sensory', guidance: '用沉默和感官细节表达情感，避免直接说"他很难过"', example: '林渊坐在废墟里，后背的剑骨冰冷得像一块死铁。' },
  ],
  world_building: [
    { name: '概念锚定', style: 'scene_setting', guidance: '用一个具体的地标/概念开头，作为世界观入口', example: '墟壁。这面墙在青云宗的后山，却又不属于青云宗。' },
    { name: '体验切入', style: 'sensory', guidance: '通过角色对世界的感知来展示世界观', example: '林渊第一次站在墟壁前时，那些纹路变成了一把剑。' },
  ],
  character_intro: [
    { name: '印象锚定', style: 'action', guidance: '用角色的第一个动作定义其性格', example: '来的人是个少年。他穿着一件洗得发白的灰布袍，腰间挂着一把没有剑鞘的剑。' },
    { name: '对话亮相', style: 'dialogue', guidance: '用一句体现角色个性的对话开场', example: '"你就是林渊？"少年咧嘴一笑，"我是你师兄。从今天起，你跟我。"' },
  ],
  raise_stakes: [
    { name: '危机宣布', style: 'in_medias', guidance: '直接用危机/威胁开头，不作铺垫', example: '通缉令在第三天早上贴满了整个宗门。悬赏金额够买一个人头。' },
    { name: '对话引爆', style: 'dialogue', guidance: '用一句揭露危机的对话开头', example: '"他们疯了。"楚河撕下通缉令，"剑骨是剑阁的根本，他们居然把它定为禁术？"' },
  ],
  resolve_foreshadow: [
    { name: '异常触发', style: 'sensory', guidance: '用一个异常事件触发回收，让读者先感知到"不对劲"', example: '玉佩碎了。不是摔碎的，是苏云裳自己捏碎的。' },
    { name: '对话揭晓', style: 'dialogue', guidance: '用一句揭示真相的对话开头', example: '"我骗了你。"苏云裳说，声音很平静。' },
  ],
  transition: [
    { name: '时间跳跃', style: 'scene_setting', guidance: '用明确的时间坐标快速过渡', example: '从青云宗到剑阁，需要穿过整个苍梧山脉。' },
    { name: '空间切换', style: 'scene_setting', guidance: '用空间变化作为过渡锚点', example: '三日后，剑阁的山门前。' },
  ],
  breather: [
    { name: '轻松切入', style: 'scene_setting', guidance: '用轻松的场景/动作开头，给读者喘息空间', example: '他们在山腰的温泉边扎营。楚河一看到水就跳了进去。' },
    { name: '日常对话', style: 'dialogue', guidance: '用日常对话开头，展示角色另一面', example: '"想什么呢？"楚河从水里冒出头，像一只落汤的野狗。' },
  ],
}

// ============================================================
// v12.8: 意图 → 章末钩子策略（扩展至4种/意图 + 5种通用钩子）
// 每种意图类型有4种对应的最佳结尾方式 + 5种跨意图通用钩子
// 解决"ending_hook弱"和"钩子多样性不足"问题
// ============================================================

interface EndingHookStrategy {
  /** 钩子类型名称 */
  name: string
  /** 具体指导 */
  guidance: string
  /** 示例 */
  example: string
  /** 禁止的结尾方式 */
  avoid: string
}

// ============================================================
// 跨意图通用钩子 — 适用于任何意图类型，作为兜底多样性
// ============================================================
const UNIVERSAL_ENDING_HOOKS: EndingHookStrategy[] = [
  {
    name: '反转收尾',
    guidance: '在章末制造认知反转——让读者以为的A变成B，推翻前文建立的预期',
    example: '"你赢了。"赵无极说。林渊还没来得及松一口气，就听到了下一句——"但你赢的不是我。是它。"赵无极指向了他后背的剑骨。',
    avoid: '反转不能毫无铺垫，必须有前文伏笔支撑；反转后不要立即解释'
  },
  {
    name: '对话暴击',
    guidance: '用一句简短的对话收尾，这句话必须颠覆认知、揭示真相、或制造强烈情感冲击',
    example: '"你父亲还活着。"\n\n五个字。林渊手里的剑掉在了地上。',
    avoid: '对话不能是日常寒暄或信息交代，必须是"一句话改变一切"级别的对话'
  },
  {
    name: '视觉定格',
    guidance: '用一个极具画面感的瞬间定格收尾，像电影镜头突然静止，让画面留在读者脑海中',
    example: '月光下，苏云裳站在废墟边缘，白色的衣袍被风吹起。她回头看了一眼林渊，嘴角有一丝他从未见过的笑——不是温柔，是告别。',
    avoid: '视觉定格必须有情感重量或叙事意义，不能是纯粹的风景描写'
  },
  {
    name: '数字钩子',
    guidance: '用具体数字制造紧迫感或冲击力——倒计时、数量变化、等级差距',
    example: '通缉令上只有一行字：剑骨觉醒者，悬赏一万灵石。下面还有一行小字——已有三十七人接令。',
    avoid: '数字必须具体可感，不能用"很多""无数"代替；数字必须推动剧情'
  },
  {
    name: '视角切换',
    guidance: '在章末突然切换到另一个角色或势力的视角，展示他们正在做的事，制造平行叙事张力',
    example: '同一时刻，三百里外的剑阁大殿。\n\n第七席的座位上，一个黑衣人缓缓摘下了兜帽。他面前的桌上，摊着一张林渊的画像。画像上，剑骨的位置被红笔圈了三个圈。',
    avoid: '视角切换不能是无关角色的闲笔，新视角必须与主线直接相关'
  },
]

const INTENT_ENDING_HOOKS: Record<IntentType, EndingHookStrategy[]> = {
  climax: [
    {
      name: '胜负未分',
      guidance: '在高潮最激烈处戛然而止，不给明确结果，制造"必须翻下一章"的冲动',
      example: '第七剑落下的瞬间，林渊看到了一道光——不是敌人的剑光，是来自自己后背的。那道暗金色的光，正在撕裂他的脊椎。',
      avoid: '不要在章末给出明确的胜负结果，保留悬念'
    },
    {
      name: '代价揭示',
      guidance: '在胜利的同时揭示隐藏的代价，让胜利变成新的危机的开始',
      example: '他赢了。但当他低头看自己的手时，剑骨上的裂纹——又多了三道。最深的那道，已经裂到了掌心。',
      avoid: '不要让胜利过于轻松，必须付出代价'
    },
    {
      name: '绝境反击',
      guidance: '在看似必败的局面中，用一个出其不意的反击动作收尾，让读者看到翻盘希望',
      example: '所有人都以为林渊死了。直到废墟深处传来一声闷响——像心跳。第二声。第三声。然后，一道暗金色的光柱从碎石中冲天而起。',
      avoid: '绝境反击不能靠"主角光环"凭空翻盘，必须有前文铺垫的底牌'
    },
    {
      name: '第三方介入',
      guidance: '在战斗白热化时，第三方势力突然出现，打破平衡，改写局面',
      example: '赵无极的剑距离林渊的咽喉只剩三寸。\n\n然后，剑停了。不是赵无极收手——是一只手，从虚空中伸出，捏住了剑尖。那只手的主人从黑暗中走出来，说了一句话让赵无极脸色大变。',
      avoid: '第三方介入必须有合理动机和伏笔，不能是"天降神兵"'
    },
  ],
  advance_plot: [
    {
      name: '下一步悬念',
      guidance: '在完成当前事件后，立即抛出下一步的障碍或未知，让读者想知道"然后呢"',
      example: '门开了。但门后站着的，不是他等的那个人。',
      avoid: '不要以"他/她出发了"或"一切准备就绪"这种平淡的结束收尾'
    },
    {
      name: '信息差钩子',
      guidance: '让读者知道角色不知道的事，或者让角色知道读者不知道的事，制造信息差张力',
      example: '林渊没有注意到，在他转身的瞬间，那枚玉佩——又亮了一下。',
      avoid: '不要把所有信息都在章末交代清楚，留一手'
    },
    {
      name: '意外来客',
      guidance: '在事件推进的关键节点，一个意料之外的角色出现，打乱所有计划',
      example: '三人正要出发，山门外忽然传来一阵马蹄声。不是一匹——是十几匹。楚河的脸色变了："是剑阁的执法队。他们比我们预计的早到了三天。"',
      avoid: '意外来客不能是无关路人，必须是能推动剧情的关键角色'
    },
    {
      name: '时间紧迫',
      guidance: '用一个紧迫的时间限制收尾，压缩角色的决策空间，制造焦虑感',
      example: '"你们只有三天。"传令的人说完就消失了。林渊看着手里的令牌，上面的数字正在跳动——不是三天，是两天零十一个时辰。',
      avoid: '时间限制必须具体，不能用"时间不多了"这种模糊表述'
    },
  ],
  reveal_secret: [
    {
      name: '更大谜团',
      guidance: '在揭示一个秘密后，立即暗示还有更大的秘密，让揭示成为新谜团的起点',
      example: '"剑骨是钥匙。"苏云裳说。但她没有说的是——钥匙，不止一把。',
      avoid: '不要让揭示成为终点，揭示应该是新线索的起点'
    },
    {
      name: '认知冲击延宕',
      guidance: '揭示真相后，不立即解释，而是展示角色/世界的反应，让冲击力发酵',
      example: '没有人说话。整个剑阁的大殿里，只有风穿过穹顶裂缝的声音。三百年来，这是第一次。',
      avoid: '不要在揭示后立即进入大段解释或对话'
    },
    {
      name: '真相碎片',
      guidance: '只揭示真相的一个碎片，让读者拼凑出一部分但又不完整，保持求知欲',
      example: '那页古籍上只有半句话："剑骨不灭，墟壁不——"后面被撕掉了。但林渊注意到，撕痕很新。有人在他之前来过。',
      avoid: '碎片不能是完全无关的边角料，必须是核心真相的关键拼图'
    },
    {
      name: '信任崩塌',
      guidance: '揭示真相的同时，摧毁角色之间的信任关系，让信息的揭示带来人际危机',
      example: '"你早就知道。"林渊看着苏云裳，声音很轻，"你从一开始就知道剑骨会吞噬宿主。"苏云裳没有否认。她只是低下了头——那是她第一次在林渊面前低头。',
      avoid: '信任崩塌必须有具体的事件支撑，不能是角色突然翻脸'
    },
  ],
  create_conflict: [
    {
      name: '冲突升级预告',
      guidance: '在当前冲突的高点结束，暗示冲突将升级到更高层面',
      example: '"你走吧。"他说，手已经按在了剑柄上。对方没有动。谁都知道，这一走，下次见面就是生死。',
      avoid: '不要在冲突刚刚缓和时就结束，要在冲突最烈时收尾'
    },
    {
      name: '立场固化',
      guidance: '用一句对话或一个动作，让双方立场不可逆转地固化',
      example: '"从今天起，你是剑阁的敌人。"楚河说这话的时候，没有看他的眼睛。',
      avoid: '不要让冲突轻易化解，章末是固化矛盾的时刻'
    },
    {
      name: '宣战仪式',
      guidance: '用一个具有仪式感的动作或宣言收尾，让冲突从暗斗升级为明争',
      example: '林渊从腰间解下青云宗的令牌，放在石桌上。然后他拔出剑，一剑斩断了令牌。\n\n"从此刻起，我不再是青云宗的弟子。我是剑骨觉醒者。"',
      avoid: '宣战不能是空洞的狠话，必须有具体的、不可逆的行动'
    },
    {
      name: '同盟破裂',
      guidance: '在章末让一个看似牢固的同盟关系出现裂痕，制造"谁才是真正的朋友"的悬念',
      example: '楚河站在了对面。\n\n"对不起。"他说，剑已经拔了出来，"剑阁给了我一个无法拒绝的条件。"林渊看着这个叫了自己三年师兄的人，忽然笑了。',
      avoid: '同盟破裂必须有合理的动机铺垫，不能是突然背叛'
    },
  ],
  build_relationship: [
    {
      name: '关系微妙变化',
      guidance: '用一个微小的动作或一句话，暗示关系发生了不可逆的变化',
      example: '她松开了手。但林渊注意到，她的指尖在他手腕上多停了一秒——比平时多了一秒。',
      avoid: '不要用直白的告白或宣言收尾，关系变化要用细节暗示'
    },
    {
      name: '未说出口的话',
      guidance: '让角色有话想说但没说出口，把情感张力留给读者回味',
      example: '苏云裳张了张嘴。最后，她只是把药瓶放在桌上，转身走了出去。门关上的声音很轻。',
      avoid: '不要让角色把话说完，留白比直白更有力'
    },
    {
      name: '信任试探',
      guidance: '用一个试探性的动作或问题收尾，让读者看到关系中的不确定性和张力',
      example: '"如果有一天，我站在了你的对面——"苏云裳没有说完。林渊也没有回答。他只是把剑递给了她，剑柄朝外。',
      avoid: '试探不能是直白的"你信不信我"，要用行动而非言语'
    },
    {
      name: '牺牲暗示',
      guidance: '让一个角色为另一个角色做出牺牲（或准备牺牲），暗示关系的深度',
      example: '苏云裳解下了腰间的玉佩。那是她父亲留给她的唯一遗物。她把它放在林渊手心，然后合上了他的手指。"带着它。比我有用。"',
      avoid: '牺牲不能是廉价的自我感动，必须有具体的代价和情感重量'
    },
  ],
  show_growth: [
    {
      name: '新能力试炼',
      guidance: '成长完成后，立即展示新能力面对的新挑战，让读者看到成长的代价和可能',
      example: '剑骨亮了。比以前更亮，更稳定。但林渊能感觉到，它的光，正在吸引什么东西——从墟壁深处。',
      avoid: '不要以"他变强了"这种总结性语句收尾'
    },
    {
      name: '成长代价显现',
      guidance: '展示成长带来的副作用或代价，让成长不是免费的午餐',
      example: '突破了。但当他内视剑骨时，看到了一个他之前从未注意到的东西——一道极细的、几乎看不见的裂缝。',
      avoid: '成长不能是纯粹的正面，必须有隐藏代价'
    },
    {
      name: '极限突破',
      guidance: '在绝境中突破极限，用一个极具冲击力的画面收尾，展示突破的震撼',
      example: '第七块剑骨亮了。\n\n不是一块一块亮——是七块同时。暗金色的光从林渊的脊椎炸开，在夜空中投影出一把完整的剑。方圆十里，所有人都看到了那把剑。',
      avoid: '突破不能过于轻松，必须有足够的困境铺垫和代价'
    },
    {
      name: '能力反噬',
      guidance: '新能力在展现威力的同时反噬宿主，让成长变成双刃剑',
      example: '林渊挥出了那一剑。剑气纵横三十丈，将赵无极逼退。但当他收回剑势时，右手已经失去了知觉——剑骨的力量，正在蚕食他的经脉。',
      avoid: '反噬必须有具体的表现和后果，不能只是"感觉有点累"'
    },
  ],
  plant_foreshadow: [
    {
      name: '异常细节',
      guidance: '用一个看似普通但暗藏玄机的细节收尾，让细心的读者察觉到不对劲',
      example: '那天晚上，林渊在整理剑谱时，发现有一页的页码是重复的。他翻过去，没在意。',
      avoid: '不要用"他隐隐觉得不安"这种模糊的预感收尾，要用具体细节'
    },
    {
      name: '角色异常反应',
      guidance: '让某个角色做出不符合其性格的微小举动，暗示背后有隐情',
      example: '楚河收剑的动作很慢。他平时从不这样。',
      avoid: '不要让异常过于明显，要保持"可被忽略但回头才发现关键"的尺度'
    },
    {
      name: '规则异常',
      guidance: '让世界规则出现一个微小的异常，暗示世界观有隐藏的层面',
      example: '林渊在墟壁前站了一炷香。那些金色的纹路一直在流动——但有一道纹路，逆着方向在走。只有一道。',
      avoid: '异常不能太明显（否则角色应该立刻察觉），也不能太隐蔽（否则读者注意不到）'
    },
    {
      name: '物品异常',
      guidance: '让一个普通物品表现出不普通的属性，暗示它有隐藏的来历或功能',
      example: '那块碎片很普通——青灰色的石料，边缘粗糙。但林渊把它握在手里的时候，剑骨的温度升高了。不是灼热，是温热。像在回应。',
      avoid: '异常物品必须有后续回收计划，不能是"捡到一件宝贝但后面忘了"'
    },
  ],
  resolve_foreshadow: [
    {
      name: '连锁反应',
      guidance: '伏笔回收后，立即展示回收带来的连锁影响，让回收不是终点而是新起点',
      example: '玉佩碎了。与此同时，远在三百里外的剑阁大殿里，那面墙——裂开了一道缝。',
      avoid: '不要让伏笔回收变成"果然如此"的简单解释，要有冲击力'
    },
    {
      name: '部分回收',
      guidance: '只回收伏笔的一部分，保留更高层次的谜团',
      example: '"你以为剑骨是祝福？"苏云裳说，"它是一道封印。而封印的——"她没有说完。',
      avoid: '不要一次性回收全部伏笔，要留有余地'
    },
    {
      name: '代价兑现',
      guidance: '回收伏笔时，让之前埋下的代价/风险在这一刻兑现，制造"原来如此"的震撼',
      example: '林渊终于明白了。为什么每次使用剑骨后，他都觉得身体越来越冷。不是因为消耗——是因为剑骨在吸他的血。每一剑，都在吸。',
      avoid: '代价兑现必须有前文的具体伏笔支撑，不能凭空出现'
    },
    {
      name: '新线索',
      guidance: '在回收伏笔的同时，给出一个指向更高层次谜团的新线索',
      example: '那枚玉佩确实是他父亲的遗物。但玉佩背面刻着的名字——不是他父亲的名字。是另一个人的。一个林渊从未听说过的人。',
      avoid: '新线索必须有明确的方向感，不能是模糊的"还有更多秘密"'
    },
  ],
  build_atmosphere: [
    {
      name: '环境预示',
      guidance: '用环境变化暗示即将发生的事，让氛围成为预言',
      example: '风停了。整个后山，安静得像一座坟墓。铁杉林里，连虫鸣都消失了。',
      avoid: '不要直接说"气氛很紧张"，要用环境变化来传达'
    },
    {
      name: '感官异常',
      guidance: '用一个异常的感官细节收尾，制造不安感',
      example: '空气里开始有了一股味道。很淡，像是铁锈，又像是——血。',
      avoid: '不要让氛围营造变成纯粹的景物描写，要有叙事功能'
    },
    {
      name: '时间异常',
      guidance: '让时间感知出现异常——太快、太慢、或停滞，暗示有什么力量在影响现实',
      example: '林渊看了一眼沙漏。上面的沙子还在流。但他数到六十的时候，沙漏里的沙子一粒都没有落下。时间，停在了午夜。',
      avoid: '时间异常必须有世界观层面的解释，不能是随意设定'
    },
    {
      name: '空间异常',
      guidance: '让空间出现不符合常理的变化，暗示角色进入了不正常的领域',
      example: '他们走了半个时辰，但周围的铁杉林看起来和刚才一模一样。楚河在一棵树上做了记号，又走了半个时辰——那棵做了记号的树，出现在前方。',
      avoid: '空间异常必须与故事核心设定相关，不能是无关的灵异现象'
    },
  ],
  emotional_impact: [
    {
      name: '情感余韵',
      guidance: '在情感高潮后，用沉默和细节延续情感冲击，让读者有时间消化',
      example: '秦风死了。林渊在废墟里坐了一整夜。天亮的时候，他把秦风的剑——那把没有剑鞘的剑——插在了废墟最高的地方。',
      avoid: '不要在情感高潮后立即转换场景或话题'
    },
    {
      name: '未完成的告别',
      guidance: '让告别变得不完整，留下一句没说完的话或一个没完成的动作',
      example: '"其实我一直想告诉你——"秦风的声音断了。他的手还伸在半空中，像是要抓住什么东西。',
      avoid: '不要让告别过于完整和圆满，留白更有力量'
    },
    {
      name: '物是人非',
      guidance: '用一个熟悉的场景/物品在情感冲击后的变化，让读者感受到"一切都变了"',
      example: '石室还是那个石室。裂缝还在，碎石还在。但林渊坐下去的时候，发现那个位置——秦风以前总坐的位置——已经空了。以后也永远是空的。',
      avoid: '不要过度煽情，用具体的细节和沉默来表达比直接抒情更有力'
    },
    {
      name: '情感反转',
      guidance: '在情感高潮处突然反转——从悲伤到愤怒、从绝望到希望、从爱到恨',
      example: '林渊跪在废墟里，眼泪已经干了。然后他看到了秦风留下的那封信。信上只有一行字。\n\n读完那行字后，林渊的眼泪变成了笑。不是悲伤的笑——是愤怒的笑。',
      avoid: '情感反转必须有具体的事件触发，不能是角色突然"想通了"'
    },
  ],
  world_building: [
    {
      name: '新疑问',
      guidance: '在展示世界观后，立即抛出一个新疑问，让世界观展示成为探索的起点',
      example: '这就是墟壁的真相。但林渊看着那些金色的纹路，忽然想到一个问题：如果墟壁是一面墙，那墙的另一面——是什么？',
      avoid: '不要让世界观展示变成百科全书式的"设定介绍"收尾'
    },
    {
      name: '规则暗示',
      guidance: '用一条新规则的暗示收尾，让读者对世界有更深的理解和更多疑问',
      example: '那天晚上，林渊在剑阁的古籍里找到了一句话：剑骨不灭，墟壁不倒。但这句话的下一页——被撕掉了。',
      avoid: '不要一次性揭示完整的世界规则'
    },
    {
      name: '历史回声',
      guidance: '用一个历史事件或传说与当前事件的呼应收尾，暗示"历史正在重演"',
      example: '林渊翻到古籍的最后一页。上面画着一个人——后背有金色的纹路，和剑骨一模一样。画像下面写着三个字：第一代。\n\n三千年前的第一代剑骨觉醒者，长得和林渊一模一样。',
      avoid: '历史呼应必须有实质性的联系，不能是"冥冥之中自有天意"的模糊暗示'
    },
    {
      name: '边界模糊',
      guidance: '让世界观的边界变得模糊，暗示"已知的世界只是冰山一角"',
      example: '苏云裳指着地图的边缘："剑阁、青云宗、苍梧山脉——这些都在墟壁的这一侧。但墟壁……有多高？没有人知道。因为没有人去过另一侧，或者说——去过的人，都没有回来。"',
      avoid: '边界模糊必须有具体的线索支撑，不能是"这个世界很大"的空话'
    },
  ],
  character_intro: [
    {
      name: '变数预告',
      guidance: '新角色登场后，立即暗示他/她将给故事带来什么变数',
      example: '来的人是个少年。他看了一眼林渊，又看了一眼剑骨，然后说了一句让所有人都愣住的话："你的剑骨，和我的一样。"',
      avoid: '不要以"新角色出现了"这种平淡的收尾，要有冲击力'
    },
    {
      name: '隐藏动机',
      guidance: '用一个小动作或一句话暗示新角色有隐藏动机',
      example: '少年笑着伸出手。林渊握住了。但在他没有看到的瞬间，少年的眼神——变了一瞬。',
      avoid: '不要让新角色的动机过于透明'
    },
    {
      name: '实力展示',
      guidance: '用一个小范围的实力展示收尾，让读者对新角色的实力产生敬畏和好奇',
      example: '少年没有拔剑。他只是伸出一根手指，在石桌上轻轻一划。石桌无声地裂成了两半——切面光滑如镜，不是蛮力，是剑气。\n\n"我叫楚河。"少年咧嘴一笑，"剑阁第三席。"',
      avoid: '实力展示不能喧宾夺主，新角色的实力不能碾压主角到无解'
    },
    {
      name: '身份谜团',
      guidance: '在新角色登场后，抛出一个关于其身份的谜团，让读者产生探究欲',
      example: '少年走到林渊面前，忽然皱起了眉。他盯着林渊后背的剑骨看了很久，然后说了一句奇怪的话："你的剑骨……不完整。"\n\n"什么意思？"\n\n"因为另一半——在我这里。"',
      avoid: '身份谜团必须有后续计划，不能是"故弄玄虚"'
    },
  ],
  raise_stakes: [
    {
      name: '倒计时',
      guidance: '用具体的时间限制制造紧迫感，让读者知道"时间不多了"',
      example: '三天。通缉令上说，三天后——剑阁的执法队会亲自来。',
      avoid: '不要用模糊的"危机即将来临"，要用具体数字'
    },
    {
      name: '代价可视化',
      guidance: '让失败代价变得具体可感，不仅仅是"会死"，而是"怎么死"',
      example: '林渊在剑阁的档案里看到了上一任剑骨觉醒者的结局。档案上只有一行字：第一百三十七次实验，失败。样本已销毁。',
      avoid: '不要让代价停留在抽象层面'
    },
    {
      name: '众叛亲离',
      guidance: '在章末展示角色正在失去支持，同盟瓦解，孤立感加剧',
      example: '林渊站在广场上，周围是青云宗的所有弟子。但没有一个人看他。所有人都低着头，像在躲避什么——不是躲避他，是躲避站在他身后的那个人。\n\n他回头。苏云裳已经不见了。',
      avoid: '众叛亲离必须有合理的剧情推动，不能是角色突然被孤立'
    },
    {
      name: '逃无可逃',
      guidance: '在章末将所有退路堵死，让角色和读者都意识到"没有退路了"',
      example: '林渊检查了所有的出口。前门被剑阁封锁了，后山的密道被塌方堵死了，传讯符被阵法屏蔽了。\n\n他站在石室中央，忽然笑了。\n\n"那就……不逃了。"',
      avoid: '退路被堵必须有具体的描写，不能是"他发现自己无路可退"一笔带过'
    },
  ],
  transition: [
    {
      name: '新场景钩子',
      guidance: '在过渡结束时，用新场景的一个疑问或异常钩住读者',
      example: '三日后，剑阁的山门前。林渊站在台阶上，看到了一个他从未见过的标记——刻在山门石柱上，像是某种古老的封印。',
      avoid: '不要以"他们到达了目的地"这种平淡的结束收尾'
    },
    {
      name: '时空锚点+悬念',
      guidance: '用明确的时间/空间锚点定位，同时抛出一个悬念',
      example: '从青云宗到剑阁，快马三天。但林渊只用了两天。他赶到的时候，剑阁的山门——是开着的。',
      avoid: '过渡不能只是过渡，要同时推进剧情'
    },
    {
      name: '途中遭遇',
      guidance: '在过渡途中遇到意外事件，让旅途本身变成有叙事价值的段落',
      example: '他们在苍梧山脉的第三天，遇到了一队人。不是剑阁的执法队——是另一队。穿着和剑阁一模一样的衣服，但胸口的徽章是倒过来的。\n\n楚河的脸色变了。"是剑阁的叛逃者。"',
      avoid: '途中遭遇不能是无关的支线，必须与主线产生关联'
    },
    {
      name: '目的地异常',
      guidance: '到达目的地时，发现目的地与预期完全不同，制造落差感',
      example: '剑阁的山门终于出现在眼前。但林渊看到的，不是传说中的万剑朝宗——是残垣断壁。山门上的剑阁牌匾被劈成了两半，上面还残留着暗金色的剑痕。\n\n剑骨留下的剑痕。',
      avoid: '目的地异常必须有合理的解释，不能是为了制造悬念而随意破坏设定'
    },
  ],
  breather: [
    {
      name: '暗流涌动',
      guidance: '在轻松的表面下，埋入不安的暗流，让读者知道平静不会持久',
      example: '他们在温泉边扎营。楚河在水里闹腾，苏云裳在火边烤鱼。一切都很好。直到林渊看到——水面下，有什么东西在发光。',
      avoid: '不要让缓冲章节变成纯粹的日常，要有叙事推进'
    },
    {
      name: '平静中的预兆',
      guidance: '用一个与当前轻松氛围形成反差的细节收尾',
      example: '那晚的星空很美。楚河数着星星睡着了。苏云裳在火边低声哼着歌。林渊也很放松——直到他摸到剑骨，发现它在微微发烫。',
      avoid: '不要以"他们度过了愉快的一天"这种平淡收尾'
    },
    {
      name: '日常崩塌',
      guidance: '让一个日常的、轻松的时刻被突如其来的危机打破，制造反差冲击',
      example: '楚河正在烤第二串鱼。火堆上的油脂滴在木炭上，发出滋滋的响声。\n\n然后，滋滋声停了。不是因为火灭了——是因为周围的虫鸣、鸟叫、风声，全部在同一瞬间消失了。\n\n楚河放下鱼，手按在了剑柄上。',
      avoid: '日常崩塌的危机必须与主线相关，不能是随机的遭遇战'
    },
    {
      name: '角色裂痕',
      guidance: '在轻松的氛围中，让角色之间浮现出之前被掩盖的裂痕或秘密',
      example: '楚河已经睡了。苏云裳坐在火边，看着林渊。\n\n"你从来没有问过我，为什么是我来青云宗找你。"她说。\n\n"为什么？"林渊问。\n\n苏云裳沉默了很久，久到林渊以为她不会回答了。然后她说："因为我是被派来杀你的。"',
      avoid: '角色裂痕必须有前文铺垫，不能是突然的性格崩坏'
    },
  ],
}

// ============================================================
// 意图 → 策略映射表（人类写作经验的结构化）
// ============================================================

const INTENT_STRATEGIES: Record<IntentType, NarrativeStrategy[]> = {
  advance_plot: [
    {
      name: '因果链推进',
      description: '用"因为A所以B但C"的因果链驱动剧情，每个事件都产生后果',
      bestFor: ['advance_plot'],
      tactics: ['每段结尾制造微小悬念', '事件之间必须有因果而非并列', '控制信息量：每次只揭示一层'],
    },
    {
      name: '目标驱动',
      description: '角色有明确目标，读者跟随角色视角一步步接近目标',
      bestFor: ['advance_plot'],
      tactics: ['明确角色当前目标', '设置障碍和代价', '用"差一点就成功"制造张力'],
    },
  ],
  reveal_secret: [
    {
      name: '三阶段揭示',
      description: '分三次逐步揭示秘密：暗示→部分揭露→完全揭露',
      bestFor: ['reveal_secret'],
      tactics: ['第一阶段：用细节暗示，让细心的读者察觉', '第二阶段：揭示部分真相，引发更多疑问', '第三阶段：完全揭露，但保留更高层次的谜团'],
    },
    {
      name: '反转式揭示',
      description: '先建立读者预期，再推翻，制造认知冲击',
      bestFor: ['reveal_secret'],
      tactics: ['前半段强化读者现有认知', '在关键节点抛出相反证据', '给出合理解释，让反转可信'],
    },
  ],
  build_relationship: [
    {
      name: '冲突→理解→羁绊',
      description: '通过冲突建立关系，通过理解深化关系',
      bestFor: ['build_relationship'],
      tactics: ['用具体事件而非对话直接表达关系变化', '展示而非告知：用行动证明关系', '小细节比大场面更有说服力'],
    },
  ],
  create_conflict: [
    {
      name: '利益冲突法',
      description: '两个角色的目标互斥，必须有人让步',
      bestFor: ['create_conflict'],
      tactics: ['明确双方各自的合理动机', '不要让任何一方完全正确或完全错误', '冲突升级要有层次：言语→行动→决裂'],
    },
  ],
  show_growth: [
    {
      name: '代价成长法',
      description: '成长必须付出代价，代价越大成长越可信',
      bestFor: ['show_growth'],
      tactics: ['设定明确的成长前状态', '通过失败/失去触发成长', '成长后立即用新能力解决旧难题'],
    },
  ],
  build_atmosphere: [
    {
      name: '五感沉浸',
      description: '通过五感细节让读者身临其境',
      bestFor: ['build_atmosphere'],
      tactics: ['开场用感官锚点定位', '情绪基调决定感官选择', '用环境变化暗示情绪变化'],
    },
  ],
  plant_foreshadow: [
    {
      name: '不经意埋设法',
      description: '伏笔藏在看似无关的细节中，避免刻意',
      bestFor: ['plant_foreshadow'],
      tactics: ['用日常场景隐藏伏笔', '让伏笔在当下有表面功能', '每个伏笔标注回收计划'],
    },
  ],
  resolve_foreshadow: [
    {
      name: '延迟满足法',
      description: '回收伏笔时先制造困惑，再给出解释',
      bestFor: ['resolve_foreshadow'],
      tactics: ['先展示结果（异常现象）', '再揭示原因（伏笔回收）', '回收后立即产生新的影响'],
    },
  ],
  transition: [
    {
      name: '锚点衔接',
      description: '用具体可感知的锚点（时间/空间/感官）衔接场景',
      bestFor: ['transition'],
      tactics: ['用时间锚点明确过渡', '场景切换必须有明确的视觉或听觉线索', '过渡段不宜超过200字'],
    },
  ],
  climax: [
    {
      name: '压力递增法',
      description: '危机层层加码，直到最后一刻才释放',
      bestFor: ['climax'],
      tactics: ['短句加速节奏', '减少描写，增加行动和对话', '每次"差一点成功"都让压力更大', '高潮释放后给读者喘息空间'],
    },
  ],
  emotional_impact: [
    {
      name: '共鸣放大法',
      description: '通过细节积累情绪，在关键时刻引爆',
      bestFor: ['emotional_impact'],
      tactics: ['情绪需要铺垫，不能突然爆发', '用具体细节代替抽象形容词', '情绪爆发后给读者消化时间'],
    },
  ],
  world_building: [
    {
      name: '体验式展开',
      description: '通过角色体验展示世界观，而非角色旁白解说',
      bestFor: ['world_building'],
      tactics: ['每次只展示世界观的一个侧面', '用角色的困惑和发现驱动展开', '避免"百科全书式"的直接说明'],
    },
  ],
  character_intro: [
    {
      name: '印象锚定法',
      description: '用3个具体细节（外貌/动作/语言）锚定角色印象',
      bestFor: ['character_intro'],
      tactics: ['第一个动作定义角色性格', '对话风格独特且一致', '不一次性交代所有信息'],
    },
  ],
  raise_stakes: [
    {
      name: '赌注升级法',
      description: '让失败代价从"损失"升级到"毁灭"',
      bestFor: ['raise_stakes'],
      tactics: ['明确当前赌注', '用具体后果替代抽象威胁', '赌注升级要有触发事件'],
    },
  ],
  breather: [
    {
      name: '温度调节法',
      description: '在高强度后提供情感调节，但保持叙事推进',
      bestFor: ['breather'],
      tactics: ['用日常互动展示角色另一面', '在轻松中埋下下一轮冲突的种子', '缓冲章节不超过全书的10%'],
    },
  ],
}

// ============================================================
// 意图 → 情绪映射
// ============================================================

const INTENT_EMOTION_MAP: Record<IntentType, { primary: EmotionType; secondary: EmotionType[]; intensity: number; valence: number }> = {
  advance_plot:     { primary: 'curiosity',   secondary: ['tension', 'hope'],       intensity: 0.6, valence: 0.2 },
  reveal_secret:    { primary: 'awe',         secondary: ['curiosity', 'suspense'], intensity: 0.8, valence: 0.0 },
  build_relationship: { primary: 'warmth',    secondary: ['hope', 'satisfaction'],  intensity: 0.5, valence: 0.6 },
  create_conflict:  { primary: 'tension',     secondary: ['anger', 'fear'],         intensity: 0.7, valence: -0.4 },
  show_growth:      { primary: 'satisfaction',secondary: ['hope', 'awe'],           intensity: 0.6, valence: 0.7 },
  build_atmosphere: { primary: 'awe',         secondary: ['curiosity', 'neutral'],  intensity: 0.4, valence: 0.1 },
  plant_foreshadow: { primary: 'curiosity',   secondary: ['suspense', 'neutral'],   intensity: 0.3, valence: 0.0 },
  resolve_foreshadow:{ primary: 'satisfaction',secondary: ['awe', 'curiosity'],     intensity: 0.7, valence: 0.5 },
  transition:       { primary: 'neutral',     secondary: ['curiosity'],             intensity: 0.3, valence: 0.0 },
  climax:           { primary: 'tension',     secondary: ['fear', 'despair', 'hope'], intensity: 0.95, valence: -0.3 },
  emotional_impact: { primary: 'sadness',     secondary: ['awe', 'warmth'],         intensity: 0.9, valence: -0.5 },
  world_building:   { primary: 'awe',         secondary: ['curiosity', 'neutral'],  intensity: 0.5, valence: 0.3 },
  character_intro:  { primary: 'curiosity',   secondary: ['neutral', 'hope'],       intensity: 0.4, valence: 0.2 },
  raise_stakes:     { primary: 'fear',        secondary: ['tension', 'despair'],    intensity: 0.8, valence: -0.6 },
  breather:         { primary: 'warmth',      secondary: ['satisfaction', 'hope'],  intensity: 0.3, valence: 0.5 },
}

// ============================================================
// 意图 → 节奏映射
// ============================================================

interface IntentPacing {
  sentenceRhythm: PacingSuggestion['sentenceRhythm']
  paragraphDensity: PacingSuggestion['paragraphDensity']
  infoDensity: PacingSuggestion['infoDensity']
  dialogueRatio: number
  descriptionRatio: number
  actionRatio: number
}

const INTENT_PACING_MAP: Record<IntentType, IntentPacing> = {
  advance_plot:      { sentenceRhythm: 'mixed',  paragraphDensity: 'medium',  infoDensity: 'balanced', dialogueRatio: 0.3, descriptionRatio: 0.2, actionRatio: 0.5 },
  reveal_secret:     { sentenceRhythm: 'medium', paragraphDensity: 'medium',  infoDensity: 'high',     dialogueRatio: 0.4, descriptionRatio: 0.2, actionRatio: 0.4 },
  build_relationship:{ sentenceRhythm: 'medium', paragraphDensity: 'medium',  infoDensity: 'balanced', dialogueRatio: 0.5, descriptionRatio: 0.2, actionRatio: 0.3 },
  create_conflict:   { sentenceRhythm: 'short',  paragraphDensity: 'dense',   infoDensity: 'high',     dialogueRatio: 0.4, descriptionRatio: 0.1, actionRatio: 0.5 },
  show_growth:       { sentenceRhythm: 'mixed',  paragraphDensity: 'medium',  infoDensity: 'balanced', dialogueRatio: 0.2, descriptionRatio: 0.3, actionRatio: 0.5 },
  build_atmosphere:  { sentenceRhythm: 'long',   paragraphDensity: 'sparse',  infoDensity: 'low',      dialogueRatio: 0.1, descriptionRatio: 0.7, actionRatio: 0.2 },
  plant_foreshadow:  { sentenceRhythm: 'medium', paragraphDensity: 'medium',  infoDensity: 'balanced', dialogueRatio: 0.3, descriptionRatio: 0.3, actionRatio: 0.4 },
  resolve_foreshadow:{ sentenceRhythm: 'mixed',  paragraphDensity: 'medium',  infoDensity: 'high',     dialogueRatio: 0.3, descriptionRatio: 0.2, actionRatio: 0.5 },
  transition:        { sentenceRhythm: 'medium', paragraphDensity: 'sparse',  infoDensity: 'low',      dialogueRatio: 0.2, descriptionRatio: 0.4, actionRatio: 0.4 },
  climax:            { sentenceRhythm: 'short',  paragraphDensity: 'dense',   infoDensity: 'high',     dialogueRatio: 0.2, descriptionRatio: 0.1, actionRatio: 0.7 },
  emotional_impact:  { sentenceRhythm: 'mixed',  paragraphDensity: 'medium',  infoDensity: 'balanced', dialogueRatio: 0.2, descriptionRatio: 0.5, actionRatio: 0.3 },
  world_building:    { sentenceRhythm: 'long',   paragraphDensity: 'sparse',  infoDensity: 'high',     dialogueRatio: 0.2, descriptionRatio: 0.6, actionRatio: 0.2 },
  character_intro:   { sentenceRhythm: 'medium', paragraphDensity: 'medium',  infoDensity: 'balanced', dialogueRatio: 0.3, descriptionRatio: 0.4, actionRatio: 0.3 },
  raise_stakes:      { sentenceRhythm: 'short',  paragraphDensity: 'dense',   infoDensity: 'high',     dialogueRatio: 0.3, descriptionRatio: 0.1, actionRatio: 0.6 },
  breather:          { sentenceRhythm: 'medium', paragraphDensity: 'sparse',  infoDensity: 'low',      dialogueRatio: 0.5, descriptionRatio: 0.3, actionRatio: 0.2 },
}

// ============================================================
// 意图识别关键词（基于大纲/上下文的启发式检测）
// ============================================================

const INTENT_KEYWORDS: Record<IntentType, string[]> = {
  advance_plot:       ['前往', '出发', '到达', '寻找', '追击', '逃离', '进入', '突破', '推进'],
  reveal_secret:      ['真相', '秘密', '原来', '其实', '发现', '揭开', '揭晓', '答案', '身份'],
  build_relationship: ['对话', '相遇', '重逢', '理解', '信任', '约定', '承诺', '羁绊', '合作'],
  create_conflict:    ['对决', '冲突', '对抗', '背叛', '争执', '挑战', '威胁', '宣战', '拒绝'],
  show_growth:        ['突破', '领悟', '晋升', '觉醒', '修炼', '蜕变', '顿悟', '升级', '突破瓶颈'],
  build_atmosphere:   ['氛围', '环境', '景象', '气息', '压迫', '诡异', '宁静', '荒凉', '宏伟'],
  plant_foreshadow:   ['诡异', '异常', '不对劲', '似乎', '隐约', '莫名', '奇怪', '不对劲'],
  resolve_foreshadow: ['果然', '终于', '原来如此', '难怪', '印证', '浮现', '想起', '回忆'],
  transition:         ['与此同时', '另一方面', '画面一转', '数日后', '镜头切换', '场景转换'],
  climax:             ['决战', '爆发', '全力', '赌上', '拼死', '最后一击', '终极', '绝境', '生死'],
  emotional_impact:   ['泪水', '心痛', '拥抱', '告别', '牺牲', '遗憾', '感动', '哭泣', '颤抖'],
  world_building:     ['传说', '远古', '历史', '法则', '规则', '体系', '世界', '势力', '位面'],
  character_intro:    ['出现', '登场', '走来', '现身', '降临', '露面', '初现', '首秀'],
  raise_stakes:       ['危机', '灾难', '毁灭', '沦陷', '侵蚀', '蔓延', '扩散', '恶化', '倒计时'],
  breather:           ['休息', '日常', '闲谈', '笑', '轻松', '温馨', '休整', '补给', '放松'],
}

// ============================================================
// IntentEngine 主类
// ============================================================

export class IntentEngine {
  private config: IntentEngineConfig
  private hookRotation: HookRotationTracker

  constructor(config?: Partial<IntentEngineConfig>) {
    this.config = { ...DEFAULT_INTENT_CONFIG, ...config }
    this.hookRotation = new HookRotationTracker()
  }

  /**
   * 分析章节意图 — 核心方法
   * 根据上下文（大纲、前文、角色状态、伏笔）推理出当前章节应该做什么
   */
  analyze(context: ChapterContext): IntentResult {
    // 1. 如果用户指定了意图，直接使用
    if (context.userIntent) {
      return this.buildResultForIntent(context.userIntent, context)
    }

    // 2. 基于关键词的启发式检测
    const detections = this.detectIntents(context)

    // 3. 基于故事状态的上下文调整
    const adjusted = this.adjustByStoryState(detections, context)

    // 4. 构建完整结果
    const primary = adjusted[0] || { type: 'advance_plot' as IntentType, confidence: 0.5, evidence: ['默认意图'] }
    const secondary = adjusted.slice(1, this.config.maxIntents)

    const emotionalTone = this.buildEmotionalTone(primary.type)
    const suggestedStrategies = INTENT_STRATEGIES[primary.type] || INTENT_STRATEGIES.advance_plot
    const suggestedPacing = this.buildPacingSuggestion(primary.type)

    return {
      intents: adjusted,
      primary,
      secondary,
      emotionalTone,
      suggestedStrategies,
      suggestedPacing,
      summary: this.buildSummary(primary, secondary, context),
    }
  }

  /**
   * 根据用户指定意图构建完整结果
   */
  private buildResultForIntent(intent: IntentType, _context: ChapterContext): IntentResult {
    const detection: IntentDetection = { type: intent, confidence: 1.0, evidence: ['用户指定'] }
    const emotionalTone = this.buildEmotionalTone(intent)
    const suggestedStrategies = INTENT_STRATEGIES[intent] || INTENT_STRATEGIES.advance_plot
    const suggestedPacing = this.buildPacingSuggestion(intent)

    return {
      intents: [detection],
      primary: detection,
      secondary: [],
      emotionalTone,
      suggestedStrategies,
      suggestedPacing,
      summary: `用户指定意图：${this.intentLabel(intent)}。已按此意图配置叙事策略和节奏。`,
    }
  }

  /**
   * 基于关键词检测意图
   */
  private detectIntents(context: ChapterContext): IntentDetection[] {
    const detections: IntentDetection[] = []
    const searchText = [
      context.title,
      context.currentOutline || '',
      context.previousSummary || '',
      context.content || '',
    ].join(' ')

    if (!searchText.trim()) {
      return [{ type: 'advance_plot', confidence: 0.3, evidence: ['无足够上下文，使用默认意图'] }]
    }

    for (const [type, keywords] of Object.entries(INTENT_KEYWORDS)) {
      const matches: string[] = []
      for (const kw of keywords) {
        if (searchText.includes(kw)) {
          matches.push(kw)
        }
      }
      if (matches.length > 0) {
        const confidence = Math.min(0.3 + matches.length * 0.15, 0.9)
        detections.push({
          type: type as IntentType,
          confidence,
          evidence: [`关键词匹配: ${matches.join(', ')}`],
        })
      }
    }

    // 按置信度降序
    detections.sort((a, b) => b.confidence - a.confidence)

    // 如果没有检测到任何意图，给默认
    if (detections.length === 0) {
      detections.push({ type: 'advance_plot', confidence: 0.3, evidence: ['无明确意图信号，默认推进剧情'] })
    }

    return detections.slice(0, this.config.maxIntents)
  }

  /**
   * 基于故事状态调整意图优先级
   * 这是"思考"的核心：不只检测，还要判断故事需要什么
   */
  private adjustByStoryState(detections: IntentDetection[], context: ChapterContext): IntentDetection[] {
    const adjusted = [...detections]

    // 规则1：如果有活跃伏笔且数量>=3，提升 resolve_foreshadow 优先级
    if (context.activeForeshadows && context.activeForeshadows.length >= 3) {
      const resolveIdx = adjusted.findIndex(d => d.type === 'resolve_foreshadow')
      if (resolveIdx > 0) {
        adjusted[resolveIdx].confidence += 0.3
        adjusted[resolveIdx].evidence.push('活跃伏笔过多，建议回收')
      } else {
        adjusted.push({
          type: 'resolve_foreshadow',
          confidence: 0.5,
          evidence: [`有${context.activeForeshadows.length}个活跃伏笔待回收`],
        })
      }
    }

    // 规则2：如果前一章是高潮，降低当前章高潮概率，提升过渡/缓冲
    if (context.previousSummary?.includes('决战') || context.previousSummary?.includes('爆发')) {
      const climaxIdx = adjusted.findIndex(d => d.type === 'climax')
      if (climaxIdx >= 0) {
        adjusted[climaxIdx].confidence *= 0.3
        adjusted[climaxIdx].evidence.push('前一章已是高潮，当前不适合连续高潮')
      }
      adjusted.push({
        type: 'breather',
        confidence: 0.6,
        evidence: ['高潮后需要缓冲章节'],
      })
    }

    // 规则3：如果当前章节编号在整卷末尾（如第9/10章），提升高潮概率
    // （这里简化处理，实际需要Volume信息）
    if (context.chapterNumber % 10 === 0 || context.chapterNumber % 10 === 9) {
      const climaxIdx = adjusted.findIndex(d => d.type === 'climax')
      if (climaxIdx >= 0) {
        adjusted[climaxIdx].confidence += 0.2
        adjusted[climaxIdx].evidence.push('接近卷末，适合高潮')
      }
    }

    // 规则4：如果角色状态中有"重伤/濒死"等关键词，提升 emotional_impact
    if (context.characterStates) {
      const states = Object.values(context.characterStates).join(' ')
      if (states.includes('重伤') || states.includes('濒死') || states.includes('牺牲')) {
        adjusted.push({
          type: 'emotional_impact',
          confidence: 0.7,
          evidence: ['角色处于极端状态，适合情感冲击'],
        })
      }
    }

    // 重新排序
    adjusted.sort((a, b) => b.confidence - a.confidence)
    return adjusted.slice(0, this.config.maxIntents)
  }

  /**
   * 构建情绪基调
   */
  private buildEmotionalTone(intent: IntentType): EmotionalTone {
    const mapped = INTENT_EMOTION_MAP[intent] || INTENT_EMOTION_MAP.advance_plot
    return {
      primary: mapped.primary,
      secondary: mapped.secondary,
      intensity: mapped.intensity,
      valence: mapped.valence,
    }
  }

  /**
   * 构建节奏建议
   */
  private buildPacingSuggestion(intent: IntentType): PacingSuggestion {
    const mapped = INTENT_PACING_MAP[intent] || INTENT_PACING_MAP.advance_plot
    return {
      sentenceRhythm: mapped.sentenceRhythm,
      paragraphDensity: mapped.paragraphDensity,
      infoDensity: mapped.infoDensity,
      dialogueRatio: mapped.dialogueRatio,
      descriptionRatio: mapped.descriptionRatio,
      actionRatio: mapped.actionRatio,
      rationale: this.pacingRationale(intent),
    }
  }

  private pacingRationale(intent: IntentType): string {
    const rationales: Record<IntentType, string> = {
      advance_plot: '剧情推进需要均衡节奏，行动为主，对话为辅',
      reveal_secret: '秘密揭示需要中等节奏，信息密度高，留给读者消化空间',
      build_relationship: '关系构建以对话为主，节奏舒缓但有张力',
      create_conflict: '冲突场景用短句加速，密集段落制造压迫感',
      show_growth: '成长展示需要动静结合，描写内心变化+行动验证',
      build_atmosphere: '氛围营造用长句和丰富描写，放慢节奏让读者沉浸',
      plant_foreshadow: '伏笔埋设需自然融入叙事，节奏均衡不突兀',
      resolve_foreshadow: '伏笔回收节奏先慢后快，揭示时加速',
      transition: '过渡段落精简，快速完成场景切换',
      climax: '高潮用短句和密集行动，最大化冲击力',
      emotional_impact: '情感冲击需要描写细节，节奏放缓让情绪发酵',
      world_building: '世界观展开用长句描写，信息密度高但节奏舒缓',
      character_intro: '角色引入用具体细节锚定印象，节奏适中',
      raise_stakes: '危机升级用短句加速，制造紧迫感',
      breather: '缓冲章节节奏舒缓，对话为主，减轻读者压力',
    }
    return rationales[intent] || rationales.advance_plot
  }

  /**
   * 构建分析摘要
   */
  private buildSummary(
    primary: IntentDetection,
    secondary: IntentDetection[],
    context: ChapterContext,
  ): string {
    const parts: string[] = []
    parts.push(`第${context.chapterNumber}章「${context.title}」`)
    parts.push(`主导意图：${this.intentLabel(primary.type)}（置信度 ${Math.round(primary.confidence * 100)}%）`)

    if (secondary.length > 0) {
      const secLabels = secondary.map(s => this.intentLabel(s.type)).join('、')
      parts.push(`辅助意图：${secLabels}`)
    }

    const strategies = INTENT_STRATEGIES[primary.type]
    if (strategies && strategies.length > 0) {
      parts.push(`推荐策略：${strategies[0].name}`)
    }

    return parts.join(' | ')
  }

  /**
   * 意图类型中文标签
   */
  intentLabel(type: IntentType): string {
    const labels: Record<IntentType, string> = {
      advance_plot: '推进剧情',
      reveal_secret: '揭示秘密',
      build_relationship: '建立关系',
      create_conflict: '制造冲突',
      show_growth: '展示成长',
      build_atmosphere: '营造氛围',
      plant_foreshadow: '埋设伏笔',
      resolve_foreshadow: '回收伏笔',
      transition: '过渡衔接',
      climax: '高潮爆发',
      emotional_impact: '情感冲击',
      world_building: '世界观展开',
      character_intro: '角色引入',
      raise_stakes: '提升赌注',
      breather: '节奏缓冲',
    }
    return labels[type] || type
  }

  /**
   * 生成意图驱动的提示词策略
   * 用于注入到 AI 提示词中
   * v12.1: 增加开头策略引导
   * v12.4: 增加章末钩子策略 + 深度叙事结构引导
   */
  generatePromptStrategy(result: IntentResult, chapterNumber?: number): string {
    const lines: string[] = []
    const intent = result.primary.type

    // 一、章节定位
    lines.push(`## 本章定位`)
    lines.push(`- 意图：${this.intentLabel(intent)}`)
    lines.push(`- 情绪基调：${result.emotionalTone.primary}（强度: ${Math.round(result.emotionalTone.intensity * 100)}%）`)
    lines.push(`- 节奏要求：${result.suggestedPacing.rationale}`)
    lines.push(`- 句子节奏：${result.suggestedPacing.sentenceRhythm} | 段落密度：${result.suggestedPacing.paragraphDensity} | 信息密度：${result.suggestedPacing.infoDensity}`)
    lines.push(`- 对话/描写/行动比例：${Math.round(result.suggestedPacing.dialogueRatio * 100)}%/${Math.round(result.suggestedPacing.descriptionRatio * 100)}%/${Math.round(result.suggestedPacing.actionRatio * 100)}%`)

    // 二、开头策略
    const openings = this.getOpeningGuidance(intent)
    if (openings.length > 0) {
      lines.push('')
      lines.push('## 开头策略（必须遵守）')
      lines.push(`- 推荐方式：${openings[0].name}`)
      lines.push(`- 指导：${openings[0].guidance}`)
      lines.push(`- 参考示例："${openings[0].example}"`)
      if (openings.length > 1) {
        lines.push(`- 备选方式：${openings[1].name} — ${openings[1].guidance}`)
      }
    }

    // 三、叙事结构
    const strategies = INTENT_STRATEGIES[intent] || INTENT_STRATEGIES.advance_plot
    if (strategies.length > 0) {
      lines.push('')
      lines.push('## 叙事结构')
      const primaryStrategy = strategies[0]
      lines.push(`- 核心策略：${primaryStrategy.name} — ${primaryStrategy.description}`)
      lines.push('- 关键节点：')
      for (let i = 0; i < primaryStrategy.tactics.length; i++) {
        lines.push(`  ${i + 1}. ${primaryStrategy.tactics[i]}`)
      }
      if (strategies.length > 1) {
        lines.push(`- 辅助策略：${strategies[1].name} — ${strategies[1].description}`)
        for (const t of strategies[1].tactics) {
          lines.push(`  · ${t}`)
        }
      }
    }

    // 四、章末钩子（v12.8 强化 — 轮换选择，保证多样性！）
    const intentHooks = INTENT_ENDING_HOOKS[intent] || INTENT_ENDING_HOOKS.advance_plot
    const chNum = chapterNumber ?? 1
    const selectedHook = this.hookRotation.selectHook(intent, chNum, intentHooks, UNIVERSAL_ENDING_HOOKS)
    lines.push('')
    lines.push(`## 章末钩子（必须遵守 — 最重要！优先级最高！）`)
    lines.push(`- 策略：${selectedHook.name}`)
    lines.push(`- 指导：${selectedHook.guidance}`)
    lines.push(`- 参考示例："${selectedHook.example}"`)
    lines.push(`- 禁止：${selectedHook.avoid}`)
    lines.push('- 章末最后500字是本章最重要的段落，必须让读者产生"必须翻下一章"的冲动')
    lines.push('- 钩子类型必须至少包含以下之一：悬念（未解之谜）/ 危机（新威胁出现）/ 反转（认知颠覆）/ 抉择（两难处境）')
    lines.push('- 禁止的结尾方式：叙事总结、环境描写收尾、内心独白收尾、"他不知道的是……"类万能模板')
    lines.push('- 好钩子示例：冲击性画面、惊人对话、未完成的动作、新角色的突然出现、隐藏信息的部分揭示')

    // 五、五感描写引导（v12.6 新增 — 提升 sensory_richness）
    lines.push('')
    lines.push('## 五感描写要求（必须遵守）')
    lines.push('- 每300字至少切换一次感官类型，不能只用视觉描写')
    lines.push('- 视觉（看到什么）：光影、颜色、形状、运动')
    lines.push('- 听觉（听到什么）：声音大小、远近、质感、节奏、沉默')
    lines.push('- 触觉（感觉到什么）：温度、质地、疼痛、压力、震动')
    lines.push('- 嗅觉（闻到什么）：气味来源、浓淡、变化、联想')
    lines.push('- 味觉（尝到什么）：血、汗、空气、食物、情绪化味觉')
    lines.push('- 关键场景必须同时使用3种以上感官（如：视觉+听觉+触觉）')
    lines.push('- 禁止连续3段以上只用视觉描写')

    // 六、角色声音差异化（v12.10 新增 — 提升 character_voice）
    lines.push('')
    lines.push('## 角色声音差异化（必须遵守 — 提升角色辨识度）')
    lines.push('- 本章中每个出场角色必须有独特的说话方式，读者不看名字就能分辨谁在说话')
    lines.push('- 用以下维度区分角色声音：')
    lines.push('  1. 句式长短：有人只用短句（5-10字），有人爱用长句（20+字）')
    lines.push('  2. 用词偏好：有人用俗语/粗话，有人用书面语/敬语，有人用专业术语')
    lines.push('  3. 语气态度：有人咄咄逼人，有人温吞委婉，有人阴阳怪气')
    lines.push('  4. 对话节奏：有人抢话快，有人沉默后开口，有人喜欢打断别人')
    lines.push('  5. 口头禅/习惯语：每个角色至少有一个标志性表达方式')
    lines.push('- 禁止出现的模式：')
    lines.push('  · 所有角色都用"……"表示沉默或犹豫')
    lines.push('  · 所有角色都用"哼""呵""啧"等语气词')
    lines.push('  · 所有角色对话句式相同（都是"主语+说+内容"）')
    lines.push('  · 对话引导词只用"说""道""问"三种')
    lines.push('- 对话引导词多样化：用"冷哼""低笑""打断""接过话头""沉吟片刻""头也不抬"等代替"说""道"')
    lines.push('- 每章至少有一处：角色"嘴上说的"和"心里想的"不一致，通过潜台词传递真实意图')

    // 七、核心写作法则（v12.14 精简版 — 4条黄金法则）
    lines.push('')
    lines.push('## 核心写作法则（必须遵守）')
    lines.push('【原创性】禁止套路词：嘴角勾起→抿嘴/龇牙；眼中闪过→瞳孔收缩/眯眼；倒吸凉气→气息一滞；脸色大变→血色褪尽。禁止万能修饰词（"恐怖的气势""惊人的力量"），用具体数字和对比替代。')
    lines.push('【情感展现】展现情绪而非告知——禁止"他感到愤怒/悲伤"→ 用身体反应（握拳/发抖）、行为变化（摔东西/沉默）、环境投射（愤怒时觉得周围很吵）。每章至少一个"心跳时刻"：意外发现/关键抉择/关系转折。')
    lines.push('【角色声音】每个角色必须有独特说话方式（句式长短/用词偏好/语气态度至少区分2种）。对话引导词用"冷哼""低笑""打断""沉吟"等替代"说""道""问"。')
lines.push('【信息密度】每段必须推进剧情或提供新信息。禁止连续3段以上纯描写/纯心理/纯说明。砍掉不推进剧情、不展现性格、不制造张力的段落。')

    return lines.join('\n')
  }

  /**
   * v12.1: 获取指定意图的开头策略引导
   */
  getOpeningGuidance(intent: IntentType): OpeningStrategy[] {
    return INTENT_OPENING[intent] || INTENT_OPENING.advance_plot
  }

  /**
   * v12.8: 获取指定意图的章末钩子策略（支持轮换）
   * 返回策略列表，第一个是轮换选中的主策略，后面是备选
   */
  getEndingHookGuidance(intent: IntentType, chapterNumber?: number): EndingHookStrategy[] {
    const intentHooks = INTENT_ENDING_HOOKS[intent] || INTENT_ENDING_HOOKS.advance_plot
    const chNum = chapterNumber ?? 1
    const selected = this.hookRotation.selectHook(intent, chNum, intentHooks, UNIVERSAL_ENDING_HOOKS)
    // 返回选中的钩子 + 所有可用钩子（用于重写时使用不同策略）
    const allHooks = [selected, ...intentHooks.filter(h => h.name !== selected.name), ...UNIVERSAL_ENDING_HOOKS.filter(h => h.name !== selected.name)]
    return allHooks.slice(0, 5)
  }

  /**
   * 获取所有可用的意图类型
   */
  getAllIntentTypes(): IntentType[] {
    return Object.keys(INTENT_STRATEGIES) as IntentType[]
  }

  /**
   * 获取指定意图的所有策略
   */
  getStrategiesFor(intent: IntentType): NarrativeStrategy[] {
    return INTENT_STRATEGIES[intent] || []
  }
}