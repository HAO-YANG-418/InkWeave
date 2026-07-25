// ============================================================
// 问题滚动循环知识库 — v1.0
// 总结自顶流网文的章节驱动力模式
// 核心洞察：每一章都是一个"问题→部分答案→新问题"的循环
// 不是"检查有没有悬念"，而是"告诉作者怎么制造悬念链"
// ============================================================

/** 问题类型 */
export type QuestionType =
  | 'what'       // 发生了什么？（信息缺口）
  | 'why'        // 为什么这样？（动机缺口）
  | 'how'        // 怎么做到？（方法缺口）
  | 'who'        // 是谁？（身份缺口）
  | 'what_if';   // 如果……会怎样？（假设缺口）

/** 单个问题节点 */
export interface QuestionNode {
  /** 问题本身 */
  question: string;
  /** 问题类型 */
  type: QuestionType;
  /** 这个问题的紧急程度（1-10，越高越紧急） */
  urgency: number;
  /** 答案（部分或完整） */
  answer: string;
  /** 答案的完整度（0-1，0=完全没答，0.5=部分回答，1=完全回答） */
  answerCompleteness: number;
  /** 这个答案引发了哪些新问题 */
  spawnsQuestions: string[];
}

/** 顶流网文悬念链案例 */
export interface QuestionCaseStudy {
  novel: string;
  arc: string;
  excerpt: string;
  analysis: string;
}

/** 问题滚动循环模型 */
export interface QuestionCycle {
  /** 模型名称 */
  name: string;
  /** 类型 */
  type: QuestionCycleType;
  /** 描述 */
  description: string;
  /** 问题链结构 */
  chain: QuestionNode[];
  /** 适用场景 */
  bestFor: string[];
  /** 不适用场景 */
  worstFor: string[];
  /** 好的示例 */
  goodExample: string;
  /** 坏的示例 */
  badExample: string;
  /** 为什么有效 */
  whyItWorks: string;
  /** 顶流网文案例（v9.0新增） */
  caseStudies?: QuestionCaseStudy[];
}

/** 循环模型类型 */
export type QuestionCycleType =
  | 'single_chain'     // 单链：一个问题贯穿全章，逐步深入
  | 'parallel_chains'  // 并行链：多个问题同时运行，交错推进
  | 'spiral';          // 螺旋：同一个问题从不同角度反复追问，每次深入一层

export const QUESTION_CYCLE_MODELS: QuestionCycle[] = [
  {
    name: '单链滚动',
    type: 'single_chain',
    description: '一个核心问题贯穿全章，每次回答都只给部分答案，同时引出更深的问题',
    bestFor: [
      '悬疑/推理——一个谜团逐步展开',
      '探索/发现——主角一步步接近真相',
      '修炼/成长——如何突破当前瓶颈',
    ],
    worstFor: [
      '群像剧——多个角色各有各的问题，单链无法覆盖',
      '快节奏战斗——问题链需要时间铺陈，不适合纯动作场景',
    ],
    chain: [
      {
        question: '这个奇怪的现象是什么？',
        type: 'what',
        urgency: 7,
        answer: '一种只在特定条件下触发的古禁制，已经沉寂了数百年',
        answerCompleteness: 0.6,
        spawnsQuestions: ['为什么现在突然触发？', '触发条件是什么？', '谁设下的？'],
      },
      {
        question: '为什么现在突然触发？',
        type: 'why',
        urgency: 8,
        answer: '因为主角身上携带的某样东西——但主角自己不知道',
        answerCompleteness: 0.4,
        spawnsQuestions: ['主角身上有什么？', '这个东西是什么时候到主角身上的？', '设下禁制的人想干什么？'],
      },
      {
        question: '设下禁制的人想干什么？',
        type: 'why',
        urgency: 9,
        answer: '这是古代某位大能的"投名状"——禁制被触发意味着他选中了继承人',
        answerCompleteness: 0.7,
        spawnsQuestions: ['继承什么？', '代价是什么？', '有没有其他候选者？'],
      },
    ],
    goodExample: '墙壁上出现了从未见过的符文——不是灵力驱动的，而是血。主角伸手触碰，符文瞬间爬上他的手臂。他没有感到疼痛，但他听到了一个声音——不是声音，是直接出现在脑海里的念头：你终于来了。',
    badExample: '主角发现了一件宝物。他拿到了宝物，升级了，然后继续前进。下一章又发现了一件宝物，又升级了，继续前进。',
    whyItWorks: '单链滚动的核心是"回答即升级"——每个答案不是终点，而是新的起点。读者不会因为"得到了答案"而满足，而是因为"答案带来了更大的问题"而更想追下去。',
    caseStudies: [
      {
        novel: '《诡秘之主》',
        arc: '克莱恩追查"真实造物主"线索',
        excerpt: '克莱恩发现一个异常→追查发现是一个邪教→追查邪教发现他们崇拜"真实造物主"→追查"真实造物主"发现涉及序列0→追查序列0发现涉及更古老的存在。每一次"找到答案"都直接引出一个更大的问题。',
        analysis: '单链滚动的关键是"答案必须比问题更大"。如果读者问"这是什么"，答案不能是"一种XX"，而应该是"一种XX，但它为什么会XX？"——答案本身包含一个新问题。诡秘之主的每次调查都是"我以为找到答案了，但答案比问题更可怕"的循环。',
      },
      {
        novel: '《凡人修仙传》',
        arc: '韩立追查各种功法和法宝来历',
        excerpt: '韩立获得一件法宝→追查来历发现是上古修士的遗物→追查上古修士发现涉及一场大战→追查大战发现牵涉更古老的秘辛。每次"得到"都不只是"得到"，而是"卷入了更大的谜团"。',
        analysis: '单链不一定要悬疑，修仙文也可以用。关键是"每次获得都带来新的未知"。韩立获得法宝时的喜悦很快被"这东西的来历不简单"取代——读者从"他变强了"的爽感无缝切换到"他又卷进什么了"的紧张感，追读动力不断档。',
      },
    ],
  },
  {
    name: '并行链跳动',
    type: 'parallel_chains',
    description: '2-3条问题线同时运行，一章内在不同问题线之间跳动，制造多线悬念',
    bestFor: [
      '群像剧/多线叙事——每个角色有自己的问题链',
      '政斗/权谋——多条暗线同时推进',
      '战斗+心理——战斗线+人物心结线并行',
    ],
    worstFor: [
      '单一主角的第一人称——视角受限无法展示多线',
      '短章节——并行链需要足够的空间来切换',
    ],
    chain: [
      {
        question: '【A线】主角能赢下这场战斗吗？',
        type: 'what_if',
        urgency: 8,
        answer: '赢是赢了，但赢得太轻松——对手在故意放水',
        answerCompleteness: 0.5,
        spawnsQuestions: ['为什么放水？', '放水对他有什么好处？'],
      },
      {
        question: '【B线】失踪的同伴去了哪里？',
        type: 'what',
        urgency: 6,
        answer: '同伴留在地上的一行字——但不是求救，是警告"别来找我"',
        answerCompleteness: 0.3,
        spawnsQuestions: ['他为什么警告不要来找？', '他遇到了什么？', '他是自愿离开的吗？'],
      },
      {
        question: '【C线】那位神秘人究竟是谁？',
        type: 'who',
        urgency: 7,
        answer: '神秘人脱下了斗篷——主角不认识这张脸，但系统面板上显示的ID让主角瞳孔骤缩',
        answerCompleteness: 0.4,
        spawnsQuestions: ['系统面板上显示的是谁？', '为什么主角反应这么大？', '这个人跟主角有什么渊源？'],
      },
    ],
    goodExample: '战场上的主角还在喘息，视角切到地牢——失踪的同伴正在墙上刻字，不是求救信号，是连续三个"不要来"。视角再切回战场，主角发现对手的剑法有一处破绽——但破绽是故意的。',
    badExample: '先写主角打架，打完再写同伴失踪，写完再写神秘人——三条线各自独立，没有交织，没有悬念叠加。',
    whyItWorks: '并行链的核心是"交错制造悬念叠加"——读者在A线最紧张时被切到B线，B线最紧张时被切回A线。悬念不是加的，是乘的。三条线的悬念在读者脑子里同时存在，制造了远超单线的追读压力。',
    caseStudies: [
      {
        novel: '《诡秘之主》',
        arc: '克莱恩同时处理个人生活/塔罗会/调查案件',
        excerpt: '克莱恩同时有三条线在跑：A线——他自己的序列晋升（如何安全晋升？）；B线——塔罗会成员各自的故事（"太阳"在干什么？"星星"遇到了什么？）；C线——他正在调查的案子（凶手是谁？）。三条线交替推进，读者永远在等某一条线的更新。',
        analysis: '并行链的精髓是"切换时机"。不是每隔3章轮换一次，而是在A线到达最紧张处时突然切到B线——读者急着想知道A线的结果，但B线也在推进。这种"同时追三条线"的阅读体验比单线更累，但也更让人上瘾——因为读者总有一条线在"最紧张"状态。',
      },
      {
        novel: '《大奉打更人》',
        arc: '许七安同时处理案件/朝堂/修炼',
        excerpt: '许七安有三条并行线：A线——查案（谁干的？为什么？）；B线——朝堂斗争（谁在针对他？他该站谁的队？）；C线——自身修炼（怎么变强？怎么应对即将到来的危机？）。三条线交织在一起，每个事件的解决都牵动其他线。',
        analysis: '并行链不一定要三条完全独立——最好的并行链是"三条线最终交汇"。许七安查的案子牵出朝堂的阴谋，朝堂的阴谋又和某个修炼资源有关。读者在追读时一直在猜"这三条线什么时候会撞在一起"——当它们最终交汇时，爽感是爆炸性的。',
      },
    ],
  },
  {
    name: '螺旋追问',
    type: 'spiral',
    description: '同一个问题从不同角度反复追问，每绕一圈，答案深入一层，直到核心真相',
    bestFor: [
      '心理/情感——层层剥开角色的内心',
      '世界观揭露——从表面规则到深层真相',
      '悬疑真相——从现象到本质的逐步逼近',
    ],
    worstFor: [
      '动作/战斗——螺旋追问节奏太慢，不适合快节奏',
      '需要快速推进的过渡章节',
    ],
    chain: [
      {
        question: '这个世界的规则是什么？',
        type: 'what',
        urgency: 5,
        answer: '表面规则：灵力决定了等级，等级决定了一切',
        answerCompleteness: 0.3,
        spawnsQuestions: ['这个规则是谁定的？', '有没有例外？'],
      },
      {
        question: '有没有例外？',
        type: 'what_if',
        urgency: 6,
        answer: '主角发现了一个"零灵力"的人——但这个人比任何人都强',
        answerCompleteness: 0.5,
        spawnsQuestions: ['没有灵力怎么变强？', '灵力体系是骗局吗？'],
      },
      {
        question: '灵力体系是骗局吗？',
        type: 'what',
        urgency: 9,
        answer: '不是骗局，是监狱——灵力系统是古代强者设计的控制工具，修炼灵力的人都在被"抽取"',
        answerCompleteness: 0.8,
        spawnsQuestions: ['谁在抽取？', '抽取的灵力用在了哪里？', '知道真相的人为什么不说？'],
      },
    ],
    goodExample: '第一次：主角被告知"灵力决定一切"。第二次：主角发现一个零灵力的人轻松击败了高阶修士。第三次：主角追问零灵力者，得到的回答是"不是没有灵力，是灵力被抽走了"。第四次：主角发现整个世界的灵力都在流向一个地方——一个叫"墟"的地方。',
    badExample: '第一章：主角发现了世界的秘密。第二章：主角已经知道了全部真相，开始打怪。第三章：继续打怪。',
    whyItWorks: '螺旋追问的核心是"你以为你知道了，其实你只知道一层"——每一次揭露不是推翻之前的认知，而是增加一层新的理解。读者在每一层都觉得自己"终于懂了"，但下一层又让他们"原来我根本没懂"——这种认知迭代的快感远超一次性揭秘。',
    caseStudies: [
      {
        novel: '《诡秘之主》',
        arc: '克莱恩对"愚者"身份的逐层理解',
        excerpt: '第一层：克莱恩以为"愚者"只是一个塔罗会的主人。第二层：发现"愚者"和灰雾有关。第三层：灰雾和序列途径有关。第四层：序列途径和最初的造物主有关。每一层理解都没有推翻前一层，而是让前一层"变得更深"。',
        analysis: '螺旋追问的关键是"每一层都不否定前一层，而是让前一层获得新含义"。读者回头看第一章时，会发现"原来那时候的描述是这个意思"——但这个"原来"不是"被耍了"，而是"理解更深了"。这种层层递进的认知迭代，让读者获得的是智力层面的满足感，远超"突然揭秘"的一时爽。',
      },
      {
        novel: '《遮天》',
        arc: '叶凡对"九龙拉棺"真相的逐层揭示',
        excerpt: '第一层：九龙拉棺是什么？第二层：棺中有什么？第三层：棺的来历是什么？第四层：为什么要拉棺？每一层答案都不是最终答案，而是通向更深的问题。但每一层都不是"被推翻"，而是在更大的背景下重新理解。',
        analysis: '螺旋追问在玄幻文中同样适用。关键是不急着给终极答案，而是每次揭示都"看起来像是最终答案"，但读者隐约觉得"还有什么没说"。这种"隐约觉得不对"的感觉就是螺旋的驱动力——读者一直在等"真正的答案"，但每一层都让他们觉得"可能还有更深"。',
      },
    ],
  },
];

/** 根据章节意图推荐问题循环模型 */
export function recommendQuestionCycle(
  chapterIntent: string,
  genre?: string,
  previousCycles?: QuestionCycleType[],
): QuestionCycle | null {
  const recentSet = new Set(previousCycles?.slice(-2) || []);
  const available = QUESTION_CYCLE_MODELS.filter(m => !recentSet.has(m.type));

  const scored = available.map(m => {
    let score = 0;
    const intent = chapterIntent.toLowerCase();

    if (m.bestFor.some(s => intent.includes(s) || s.includes(intent))) score += 3;
    if (genre && m.bestFor.some(s => s.includes(genre))) score += 2;
    if (m.worstFor.some(s => intent.includes(s))) score -= 5;

    return { model: m, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored[0]?.model ?? null;
}

/** 生成问题滚动指导 Prompt */
export function generateQuestionCyclePrompt(model: QuestionCycle): string {
  const chainDesc = model.chain.map((node, i) => {
    const step = i + 1;
    return `第${step}步：引发问题——"${node.question}"（${node.urgency >= 8 ? '高紧迫度' : node.urgency >= 5 ? '中紧迫度' : '低紧迫度'}）
   → 部分回答：${node.answer}
   → 引出新问题：${node.spawnsQuestions.join('；')}`;
  }).join('\n\n');

  const cases = model.caseStudies && model.caseStudies.length > 0
    ? `\n\n顶流网文案例：\n${model.caseStudies.map((c, i) =>
        `${i + 1}. ${c.novel} - ${c.arc}\n   场景：${c.excerpt}\n   分析：${c.analysis}`
      ).join('\n\n')}`
    : '';

  return `【问题滚动指导 - ${model.name}】
${model.description}

本章问题链结构：
${chainDesc}

参考示例：
${model.goodExample}

为什么有效：${model.whyItWorks}

写作要求：
- 本章至少包含${model.chain.length}次"问题→回答→新问题"的滚动
- 每次回答都只给部分答案（完整度不超过0.7），必须引出新问题
- 章末必须留下至少1个未解答的问题作为钩子${cases}`;
}

/** 分析一段文本中的问题滚动密度 */
export function analyzeQuestionDensity(text: string): {
  questionCount: number;
  answerCount: number;
  incompleteAnswers: number;
  density: 'low' | 'medium' | 'high';
  suggestion: string;
} {
  const questionMarkers = /[？?]/g;
  const questionCount = (text.match(questionMarkers) || []).length;

  // 粗略估计：每个段落可能包含一个"回答"
  const paragraphs = text.split(/\n{2,}/).length;

  // 检测"不完全回答"模式：不是/而是/实际上/原来/竟
  const incompletePatterns = /不是[^，。？！]{1,20}[，。][^，。？！]{1,8}是|实际上|原来|竟然|没想到|居然/g;
  const incompleteAnswers = (text.match(incompletePatterns) || []).length;

  const density = questionCount >= 5 ? 'high' : questionCount >= 2 ? 'medium' : 'low';
  const suggestion = density === 'low'
    ? '问题密度过低，建议每章至少设置2-3个"问题→回答→新问题"循环'
    : density === 'medium'
    ? '问题密度适中，检查章末是否留有未解答的问题作为钩子'
    : '问题密度充足，注意不要让问题过于密集导致读者疲劳';

  return { questionCount, answerCount: paragraphs, incompleteAnswers, density, suggestion };
}