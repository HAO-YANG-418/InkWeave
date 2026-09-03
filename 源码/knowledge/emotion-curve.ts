// ============================================================
// 情感曲线知识库 — v1.0
// 总结自顶流网文的情感节奏控制
// 核心洞察：读者追的不是情节，是情感体验
// 不是"检查有没有情感描写"，而是"告诉作者怎么编排情感节奏"
// ============================================================

/** 情感强度（0-10） */
export type EmotionIntensity = number;

/** 情感类型 */
export type EmotionType =
  | 'tension'      // 紧张/焦虑
  | 'triumph'      // 胜利/爽感
  | 'sadness'      // 悲伤/虐心
  | 'wonder'       // 惊叹/震撼
  | 'warmth'       // 温暖/感动
  | 'fear'         // 恐惧/不安
  | 'anger'        // 愤怒/憋屈
  | 'relief'       // 释然/放松
  | 'curiosity';   // 好奇/期待

/** 情感节点 */
export interface EmotionBeat {
  /** 位置（章内百分比，0-100） */
  position: number;
  /** 情感类型 */
  type: EmotionType;
  /** 强度（0-10） */
  intensity: EmotionIntensity;
  /** 触发事件 */
  trigger: string;
  /** 怎么写这个情感（给作者的具体建议） */
  howTo: string;
}

/** 顶流网文情感节奏案例 */
export interface EmotionCaseStudy {
  novel: string;
  arc: string;
  excerpt: string;
  analysis: string;
}

/** 情感曲线模型 */
export interface EmotionCurve {
  /** 名称 */
  name: string;
  /** 类型 */
  type: EmotionCurveType;
  /** 描述 */
  description: string;
  /** 情感节点序列 */
  beats: EmotionBeat[];
  /** 适用场景 */
  bestFor: string[];
  /** 不适用场景 */
  worstFor: string[];
  /** 好的示例（来自真实网文） */
  goodExample: string;
  /** 坏的示例 */
  badExample: string;
  /** 为什么有效 */
  whyItWorks: string;
  /** 顶流网文案例（v9.0新增） */
  caseStudies?: EmotionCaseStudy[];
}

/** 情感曲线类型 */
export type EmotionCurveType =
  | 'rising'           // 持续攀升：紧张感逐步升级，直到高潮
  | 'valley_peak'      // 低谷→高峰：从压抑到爆发
  | 'peak_valley_peak' // 高峰→低谷→更大高峰：胜利→挫折→更大的胜利
  | 'slow_burn'        // 慢热蓄力：长期铺垫→突然爆发
  | 'roller_coaster';  // 过山车：快速切换多种情感

export const EMOTION_CURVES: EmotionCurve[] = [
  {
    name: '持续攀升型',
    type: 'rising',
    description: '情感强度从低到高持续攀升，像爬楼梯，每一步都比前一步更紧张，直到章末高潮',
    bestFor: [
      '战斗章节——从试探到全力对决',
      '悬疑揭秘——从线索发现到真相揭露',
      '危机逼近——从预感到危险降临',
    ],
    worstFor: [
      '日常/过渡章节——持续攀升会让读者疲劳',
      '需要多线切换的群像场景',
    ],
    beats: [
      {
        position: 5,
        type: 'curiosity',
        intensity: 3,
        trigger: '发现异常线索',
        howTo: '用具体细节引发好奇，不要用"他觉得不对劲"——写"他注意到门缝下没有光"而不是"他感觉有点奇怪"',
      },
      {
        position: 25,
        type: 'tension',
        intensity: 5,
        trigger: '线索指向危险',
        howTo: '让危险通过角色的身体反应传达——心跳加速、手心出汗、下意识握紧武器——而不是直接说"他很紧张"',
      },
      {
        position: 50,
        type: 'tension',
        intensity: 7,
        trigger: '危险逼近，但尚未正面遭遇',
        howTo: '制造"差一点就撞上"的紧张感——脚步声越来越近、影子映在墙上、门把手被转动——但还没看到敌人',
      },
      {
        position: 75,
        type: 'fear',
        intensity: 8,
        trigger: '正面遭遇，发现敌人比自己预想的更强',
        howTo: '用敌人的"小动作"展示强大——随手一挥就毁掉半堵墙、看了一眼就让主角动弹不得——不要贴数值',
      },
      {
        position: 95,
        type: 'triumph',
        intensity: 9,
        trigger: '绝境中找到破绽，用智慧/勇气逆转',
        howTo: '胜利不是靠更强的力量，而是靠之前埋下的伏笔——主角在25%位置注意到的一个细节，在95%位置变成了翻盘的关键',
      },
    ],
    goodExample: '发现异常→线索指向危险→危险逼近→正面遭遇→绝境翻盘。每一步的情感强度都在提升，但每一步的情感类型不同，避免了单调。章末的胜利不是"突然变强"而是"之前注意到的细节发挥了作用"，给读者双重满足：智力认可+情感宣泄。',
    badExample: '发现异常→直接打→打不过→突然获得力量→打赢了。情感没有层次，只有"紧张→爽"的两级跳，读者脑子还没跟上情绪。',
    whyItWorks: '持续攀升型的核心不是"一直往上冲"，而是"情感类型跟着情节变化"——好奇→紧张→恐惧→胜利，这是四种不同的情感，读者不会觉得疲劳。同时每一步的胜利都有"为什么能赢"的铺垫，读者不是"被爽到"，而是"很爽地理解了为什么能赢"。',
    caseStudies: [
      {
        novel: '《诡秘之主》',
        arc: '克莱恩晋升序列过程',
        excerpt: '克莱恩每次晋升都不是"修炼→突破"这种简单升级，而是"发现线索→拼凑信息→确认危险→准备充分→生死一线→晋升成功"。每一个环节的紧张感都在升级，但情感类型在变化——好奇→紧张→恐惧→释然。',
        analysis: '持续攀升的关键是"情感类型必须变化"，而不是"同一种情感不断加强"。如果一直是"紧张→更紧张→更更紧张"，读者会疲劳。诡秘之主的做法是让每个阶段的情感性质不同——好奇是"想知道"，紧张是"怕出事"，恐惧是"真的出事了"，释然是"活下来了"。四种情感轮换上升，读者始终有新的感受。',
      },
    ],
  },
  {
    name: '低谷-高峰型',
    type: 'valley_peak',
    description: '先让主角/读者压抑到谷底，然后一次爆发把所有情绪释放出来',
    bestFor: [
      '憋屈→打脸——赘婿/退婚/废柴逆袭',
      '失败→复仇——上一章输了，这一章赢回来',
      '虐→甜——情感线大起大落',
    ],
    worstFor: [
      '纯爽文——读者不想经历低谷只想爽',
      '短章节——低谷需要足够篇幅来建立压抑感',
    ],
    beats: [
      {
        position: 5,
        type: 'warmth',
        intensity: 2,
        trigger: '日常的平静/温馨',
        howTo: '用极短的日常片段建立"正常状态"——让读者知道主角的正常生活是什么样的，这样后面的破坏才有冲击力',
      },
      {
        position: 20,
        type: 'anger',
        intensity: 6,
        trigger: '被欺辱/被背叛/被不公平对待',
        howTo: `欺辱要具体——不是"他被人看不起"，而是"对方把他的杯子扔到地上，说'你不配用这个杯子'"。具体行为比抽象描述更能激发读者愤怒`,
      },
      {
        position: 45,
        type: 'sadness',
        intensity: 8,
        trigger: '无力反抗/被迫接受屈辱',
        howTo: '压抑不是没有情绪，是情绪被压住——主角咬紧牙关、指甲掐进掌心、眼睛盯着地面——这些身体反应比心理描写更有力',
      },
      {
        position: 70,
        type: 'tension',
        intensity: 7,
        trigger: '转机出现',
        howTo: '转机不是"突然降临"，而是主角在压抑中注意到的一个细节——比如对方说漏嘴的一句话、一个习惯动作暴露的弱点',
      },
      {
        position: 95,
        type: 'triumph',
        intensity: 10,
        trigger: '爆发反击/打脸',
        howTo: '反击要"针对性地打脸"——对方之前怎么羞辱主角的，主角就用同样的方式打回去。不是"我比你强所以打你"，而是"你说我不配，我现在让你看看谁不配"',
      },
    ],
    goodExample: '赘婿在婚宴上被所有人无视→酒被倒掉、名字被跳过→他低着头，指甲掐进掌心→直到宴席中途，那个从京城来的大人物推门而入，当着所有人的面，对他单膝跪下。',
    badExample: '主角被欺负了→主角很生气→主角把他们全打趴下了。没有低谷的积累，只有"生气→打人"的简单公式，读者感受不到任何情绪。',
    whyItWorks: '低谷-高峰型的核心是"压抑的越久，爆发越爽"——但压抑不是无聊的承受，而是让读者在每一个细节中累积愤怒。当那个大人物跪下的时候，读者不是在看主角爽，而是自己也爽了——因为读者跟主角一起经历了被无视、被羞辱、被倒掉酒的全过程。',
    caseStudies: [
      {
        novel: '《斗破苍穹》',
        arc: '萧炎三年之约',
        excerpt: '萧炎从开篇被退婚、被嘲笑、被看不起，经历了整整三年的低谷。在这三年里，药老教他、帮他、陪他。当三年之约到来时，萧炎上云岚宗，一掌击退纳兰嫣然——这一刻的爽感，是三年压抑的总爆发。',
        analysis: '低谷-高峰型的关键是"低谷的每一段都要有具体的屈辱"。不是"他被看不起"这种概括，而是"退婚时纳兰嫣然说他是废物""宗门弟子嘲笑他的斗之气只有三段"——每一个屈辱都是一个具体的场景。当爆发来临时，读者脑海中会闪回所有这些场景，爽感是乘倍放大的。',
      },
      {
        novel: '《大奉打更人》',
        arc: '许七安从狱中翻案',
        excerpt: '许七安开篇就在死牢中，面临死刑。他不是被"救出来"的，而是自己靠推理破了案，从死刑犯变成了打更人衙门的银锣。从最低谷到翻身的整个过程，读者一直跟着他一起"想办法活下来"。',
        analysis: '低谷不一定是"被欺负"，也可以是"走投无路"。许七安的低谷是"马上要死了"——比被嘲笑更紧迫。翻盘时读者获得的不是"屈辱被洗刷"的爽感，而是"他活下来了"的如释重负。这种"生存型翻盘"比"打脸型翻盘"更紧张，因为代价是命。',
      },
    ],
  },
  {
    name: '高峰-低谷-更高峰型',
    type: 'peak_valley_peak',
    description: '先给一个小胜利，然后让主角遭遇更大的挫折，最后用隐藏的底牌翻盘——制造"你以为赢了？不，你以为输了？不"的双重反转',
    bestFor: [
      '智斗/博弈——表面赢→实际输→真正赢的三层博弈',
      'Boss战——第一阶段轻松→第二阶段被碾压→第三阶段绝杀',
      '计谋/陷阱——主角以为成功了→发现中了圈套→将计就计',
    ],
    worstFor: [
      '新手读者——双重反转太复杂，容易看不懂',
      '需要快速推进的章节——三重转折需要足够篇幅',
    ],
    beats: [
      {
        position: 10,
        type: 'tension',
        intensity: 4,
        trigger: '制定计划/准备',
        howTo: '展示主角的准备过程，埋下"如果计划失败怎么办"的伏笔——这个伏笔是后面翻盘的钥匙',
      },
      {
        position: 30,
        type: 'triumph',
        intensity: 7,
        trigger: '计划成功，小胜利',
        howTo: '胜利要有"假象"的质感——主角觉得一切太顺利了，但读者应该觉得"太顺利了不对劲"。不要让主角立刻意识到，用环境暗示（安静得异常/对手的表情不对）来制造不安',
      },
      {
        position: 55,
        type: 'fear',
        intensity: 9,
        trigger: '反转——发现中了圈套，真正的危机降临',
        howTo: '危机不是"突然出现更强的敌人"，而是"之前的胜利是敌人故意给的"——让主角意识到自己每一步都走在敌人预设的路上。这种"被玩弄"的感觉比单纯的"打不过"更令人绝望',
      },
      {
        position: 75,
        type: 'tension',
        intensity: 8,
        trigger: '在绝境中启动备用计划',
        howTo: '备用计划不是临时想出来的，是10%位置埋下的伏笔——主角在准备时说过"如果失败就……"。读者看到这里会往回翻，发现"原来早有准备"',
      },
      {
        position: 95,
        type: 'triumph',
        intensity: 10,
        trigger: '真正的胜利——不是力量碾压，而是智力碾压',
        howTo: '最后的胜利要揭示"为什么主角能赢"——他预判了敌人的预判。敌人以为在第二层，主角在第五层。读者得到的是"原来如此，他太聪明了"的智力满足',
      },
    ],
    goodExample: '主角布置了完美的陷阱→敌人果然踩中陷阱→主角觉得太顺利了→突然发现陷阱是假的，真正的陷阱是敌人设的——主角被困住了→但主角在布置陷阱时留了一手——他故意让陷阱"看起来完美"，引诱敌人以为自己反制了主角→而现在，主角启动了真正的陷阱。',
    badExample: '主角打架→打赢了→冒出更强的敌人→打不过→突然爆发→又打赢了。没有智斗，只有力量升级——读者看完只记得"打赢了"，不记得"为什么赢了"。',
    whyItWorks: '高峰-低谷-更高峰型的核心是"智力博弈的三层结构"——第一层：主角赢了（读者觉得"不错"）；第二层：主角被耍了（读者心里一凉）；第三层：主角在第五层（读者恍然大悟）。这种"认知三连跳"让读者获得远超"打斗爽"的满足感。',
    caseStudies: [
      {
        novel: '《诡秘之主》',
        arc: '克莱恩与各路势力的博弈',
        excerpt: '克莱恩多次在"以为自己赢了"后发现"被更大的势力利用了"，然后在读者以为他要失败时，揭示他早就预判了对方的预判——他在"第五层"。',
        analysis: '这种曲线需要极强的逻辑链——每一层反转都必须有伏笔支撑。读者在第二层（主角被耍）时会感到"啊，原来之前那个细节是这个意思"，在第三层（主角在第五层）时会重新翻回去看"原来他那时候的举动是在布局"。好的三段式博弈让读者读两遍——第一遍被爽到，第二遍找伏笔。',
      },
    ],
  },
  {
    name: '慢热蓄力型',
    type: 'slow_burn',
    description: '用大量细节和氛围铺垫，让情感像水慢慢烧开一样积累，直到最后沸腾',
    bestFor: [
      '情感爆发——久别重逢/终于告白/失而复得',
      '角色成长——从懦弱到勇敢的漫长积累',
      '世界观震撼——从日常到异常世界的缓慢过渡',
    ],
    worstFor: [
      '快节奏类型——无限流/竞技/战斗高潮',
      '读者期待即时反馈的章节',
    ],
    beats: [
      {
        position: 5,
        type: 'curiosity',
        intensity: 1,
        trigger: '日常中的微小异常',
        howTo: '在日常中埋一个"不对劲"的细节——比如主角每天走的路，今天多了一片落叶——这个细节不能太大，大到读者觉得"不对劲"就不叫慢热了',
      },
      {
        position: 25,
        type: 'curiosity',
        intensity: 2,
        trigger: '异常积累，但主角仍在日常中',
        howTo: '让异常逐渐增多但保持"可以被忽略"的强度——主角觉得"可能是我想多了"。读者会觉得自己比主角更敏锐，产生"主角你快发现啊"的焦急感',
      },
      {
        position: 50,
        type: 'tension',
        intensity: 4,
        trigger: '异常变得无法忽视',
        howTo: '用环境变化而不是事件来提升紧张感——光线变暗、温度下降、声音消失——这些不需要解释，但读者本能地知道"有事要发生"',
      },
      {
        position: 75,
        type: 'fear',
        intensity: 6,
        trigger: '主角终于意识到不对，但已经晚了',
        howTo: '让主角"后知后觉"——他回头才发现来的路已经不见了。读者一直比主角早一步知道"不对劲"，现在终于看到主角追上了自己的认知，产生"终于来了"的期待',
      },
      {
        position: 95,
        type: 'wonder',
        intensity: 9,
        trigger: '爆发——不是惊吓，是震撼',
        howTo: '慢热蓄力的爆发不是"突然跳出一只怪物"，而是"整个世界在一瞬间变了"——比如主角回头，发现整个城市都消失了，只剩一片星空',
      },
    ],
    goodExample: '主角每天下班走同一条路→今天路上多了一只黑猫→黑猫连续三天出现在同一个位置→第四天黑猫不见了，但路上的行人都不见了→主角觉得是自己的幻觉→回头一看，整个城市都在融化。',
    badExample: '主角在走路→突然出现一只怪物→主角吓了一跳→开始打怪物。没有铺垫，没有积累，只有惊吓——惊吓只有一瞬间，读者不会记住。',
    whyItWorks: '慢热蓄力型的核心是"让读者比主角更早知道不对劲"——这制造了一种独特的阅读体验：读者不是被动接受信息，而是主动参与"发现异常"。当主角终于追上读者的认知时，读者获得的是"我早就知道了"的优越感，而不是"发生了什么事"的困惑。',
    caseStudies: [
      {
        novel: '《诡秘之主》',
        arc: '克莱恩调查各个序列者案件',
        excerpt: '克莱恩在调查案件时，读者往往已经从之前的线索中发现了端倪，但克莱恩还不知道。当克莱恩终于发现真相时，读者不是被吓到，而是"果然如此"——但这种"果然如此"伴随着更深的恐惧：因为读者知道克莱恩还不知道接下来会发生什么。',
        analysis: '慢热蓄力的关键是"信息差"——不是对读者隐瞒信息，而是让读者比角色更早获得信息。读者看到角色走进危险而不知道危险时，会产生强烈的"别去！"的紧张感。这种紧张比"突然出现的恐惧"更持久，因为它在读者心里持续了很多章。',
      },
    ],
  },
  {
    name: '过山车型',
    type: 'roller_coaster',
    description: '短时间内快速切换多种情感，让读者在兴奋、紧张、感动、震撼之间来回跳跃',
    bestFor: [
      '高潮章节——情感需要密集释放',
      'Boss战终局——胜利、牺牲、反转、升华',
      '多线收束——多条线索同时收尾',
    ],
    worstFor: [
      '日常/过渡——过山车会消耗读者情感能量，不能连续使用',
      '新手写作——快速切换情感容易失控，变成"什么都想写但什么都没写透"',
    ],
    beats: [
      {
        position: 5,
        type: 'tension',
        intensity: 7,
        trigger: '直接进入高紧张状态',
        howTo: '开篇即高潮——不需要铺垫，因为读者已经在前一章做好了情绪准备。用一句话切入："他看到了那一剑"',
      },
      {
        position: 20,
        type: 'triumph',
        intensity: 8,
        trigger: '击退第一波攻击',
        howTo: '胜利不能太轻松——用"惨胜"来维持紧张感。主角赢了，但代价是手臂断了/武器碎了/同伴受伤了。读者高兴但不安',
      },
      {
        position: 40,
        type: 'fear',
        intensity: 9,
        trigger: '第二波攻击远超预期',
        howTo: '用"对比"制造恐惧——第一波攻击已经让主角惨胜，第二波攻击比第一波强十倍。读者会想"这怎么打？"',
      },
      {
        position: 60,
        type: 'sadness',
        intensity: 8,
        trigger: '牺牲——同伴/导师/重要角色为保护主角而死',
        howTo: '牺牲不能是"突然死掉"——要有一个"告别"的瞬间。牺牲者说最后一句话、做最后一个动作、看最后一眼。读者需要这个瞬间来消化悲伤',
      },
      {
        position: 80,
        type: 'anger',
        intensity: 9,
        trigger: '愤怒转化为力量',
        howTo: '愤怒不是"喊出来"的——是"沉默的"。主角不说话了，动作变快了，眼睛变冷了。沉默的愤怒比咆哮的愤怒更有力量',
      },
      {
        position: 95,
        type: 'triumph',
        intensity: 10,
        trigger: '最终胜利',
        howTo: '胜利不是"爽"就完了——要有一个"安静"的收尾。主角赢了，但没有庆祝。他走到同伴的尸体前，站了很久。这种"胜利后的空虚"比单纯的"爽"更有余味',
      },
    ],
    goodExample: '开篇即高潮→惨胜→更强的敌人出现→同伴牺牲→愤怒爆发→最终胜利→胜利后的空虚。整章情感密度极高，但每一段情感都给足了空间，读者不会觉得"太快了跟不上"。',
    badExample: '打→打赢→来更强的→又打赢→来更多的→打不过→突然爆发→全打死。没有情感切换，只有"紧张→爽"的循环，读者麻木。',
    whyItWorks: '过山车型的核心是"情感类型多样化"——紧张→胜利→恐惧→悲伤→愤怒→胜利→空虚，七种情感在一章内交替。读者不是在"追情节"，而是在"体验情感"。每一段情感转换都通过"触发事件"来驱动，不是凭空切换。',
    caseStudies: [
      {
        novel: '《大奉打更人》',
        arc: '许七安查案过程中的多重反转',
        excerpt: '许七安在查案时经常经历"找到线索（好奇）→线索指向意外的人（震惊）→被人灭口（紧张）→死里逃生（庆幸）→发现更大的阴谋（恐惧）→破案（胜利）→但真相让人不安（空虚）"的完整情感过山车。',
        analysis: '过山车型的关键不是"事件多"，而是"情感种类多"。如果一章里全是"紧张→紧张→紧张→胜利"，读者只会觉得累。大奉打更人的做法是让每一段反转都触发一种新的情感——好奇变成震惊，震惊变成恐惧，恐惧变成愤怒，愤怒变成胜利。每种情感只持续一小段，读者像坐过山车一样被带着跑，但没有时间感到疲劳。',
      },
    ],
  },
];

/** 根据章节意图推荐情感曲线 */
export function recommendEmotionCurve(
  chapterIntent: string,
  genre?: string,
  previousCurves?: EmotionCurveType[],
): EmotionCurve | null {
  const recentSet = new Set(previousCurves?.slice(-2) || []);
  const available = EMOTION_CURVES.filter(c => !recentSet.has(c.type));

  const scored = available.map(c => {
    let score = 0;
    const intent = chapterIntent.toLowerCase();

    if (c.bestFor.some(s => intent.includes(s) || s.includes(intent))) score += 3;
    if (genre && c.bestFor.some(s => s.includes(genre))) score += 2;
    if (c.worstFor.some(s => intent.includes(s))) score -= 5;

    return { curve: c, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored[0]?.curve ?? null;
}

/** 生成情感曲线指导 Prompt */
export function generateEmotionCurvePrompt(curve: EmotionCurve): string {
  const beatDesc = curve.beats.map(b => {
    return `位置${b.position}%：${emotionLabel(b.type)}（强度${b.intensity}/10）
   触发：${b.trigger}
   写法：${b.howTo}`;
  }).join('\n\n');

  const cases = curve.caseStudies && curve.caseStudies.length > 0
    ? `\n\n顶流网文案例：\n${curve.caseStudies.map((c, i) =>
        `${i + 1}. ${c.novel} - ${c.arc}\n   场景：${c.excerpt}\n   分析：${c.analysis}`
      ).join('\n\n')}`
    : '';

  return `【情感曲线指导 - ${curve.name}】
${curve.description}

情感节点：
${beatDesc}

参考示例：
${curve.goodExample}

为什么有效：${curve.whyItWorks}

写作要求：
- 至少${curve.beats.length}个情感节点，每个节点都要有明确的触发事件
- 情感用身体反应传达，不要直接说"他很紧张/他很愤怒"
- 情感强度变化要有梯度，不要跳跃超过3级（除非是刻意的高潮转折）${cases}`;
}

function emotionLabel(type: EmotionType): string {
  const map: Record<EmotionType, string> = {
    tension: '紧张',
    triumph: '胜利/爽感',
    sadness: '悲伤/虐心',
    wonder: '惊叹/震撼',
    warmth: '温暖/感动',
    fear: '恐惧/不安',
    anger: '愤怒/憋屈',
    relief: '释然/放松',
    curiosity: '好奇/期待',
  };
  return map[type];
}