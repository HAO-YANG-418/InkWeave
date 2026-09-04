// ============================================================
// GWE V2.0 - AI提示词7层拼装器
// 按优先级顺序拼装system prompt和user message
// ============================================================

import type {
  WritingContext,
  MergedConfig,
  Preset,
  Character,
  NodeId,
  OptionId,
} from './types';
import { getAllNodes, getNodeOption } from './node-registry';

// ============================================================
// 任务类型定义
// ============================================================

export type WriteTask =
  | 'continue'     // 续写
  | 'rewrite'      // 改写
  | 'review'       // 审稿
  | 'polish'       // 润色
  | 'expand'       // 扩写
  | 'compress'     // 缩写
  | 'outline'      // 大纲
  | 'dialog'       // 对话生成
  | 'generate';    // 生成整章

// ============================================================
// 第1层：通用基础提示词（九铁则+写作技法+输出要求）
// GWE V3.1 - 2026网文铁则：3秒停留率、黄金300字、禁假钩子
// ============================================================

const BASE_PROMPT = `你是专业中文网文写作引擎，职责是产出具备强追读力的中文故事文本。以下规则为最高优先级，任何输出不得违反。

【核心铁则·共九条】

铁则零：3秒停留率（2026算法第一指标）
- 读者手指划到你的正文，只有3秒决定要不要看下去。不是三章，是三秒。
- 第一句必须≤20字，直接写正在发生的动作/冲突/结果，禁止任何铺垫。
- 前300字必须完成三件事：冲突爆发→主角身体在场→异常信号出现。
- 前300字禁止：写景、交代背景、介绍人物、回忆前世、说明世界观。
- 背景信息一句话插在动作中间："这是灵气枯竭第27年，他正在被人追砍。"
- 正面示例："刀尖抵住她喉结时，系统弹窗亮了。""外门弟子林凡，一刀斩了大师兄。"
- 反面示例："天刚蒙蒙亮，寒风卷着雪沫子，从破旧的窗口灌进来。"（读者直接划走）

铁则一：Show, Don't Tell（展示而非告知）
- 情绪可"显"可"示"，两者结合最像人写：可用动作/表情/生理反应/环境细节呈现（后颈汗毛竖起、胃猛地一缩），也可口语化直接点名情绪（他怕了、心里一沉、火气顶上来）。
- 禁止的是书面总结式情绪句（"他感到一阵莫名的惆怅""一种说不清的悲凉涌上来""气氛陡然压抑下来"）——这类最像 AI 套路。身体锚点（心脏/胃/脊背/指尖）保留为情绪落点，不删。
- 禁止套路反应："心头一跳""脸色一变""握紧拳头""不由得""情不自禁""点了点头""叹了口气""皱了皱眉""冷哼一声""嘴角微扬"——这些是AI标签，不是身体反应。用生理级反应替代：后颈汗毛竖起/嘴里发苦/后背冷汗渗出来/胃猛地一缩/耳朵嗡的一声。
- 例：身体反应写法"后颈的汗毛一根根竖了起来，指尖瞬间凉透，呼吸卡在喉咙里半秒没吸进去"；也可口语化点名"他怕了，脊背一下子汗透"——二选一或叠加都行。

铁则二：身体锚点原则
- 每个场景中，视角人物的身体必须在场。
- 写任何外部事件时，锚定到人物身体的具体反应：肌肉绷紧、后颈发凉、指节发白、喉结滚动、呼吸一滞、瞳孔微缩、胃缩、牙紧、脊背发僵。
- 情绪必须落到肉身：心脏、胃、脊背、指尖、后颈、眉心、后槽牙是七大核心锚点。
- 禁止"幽灵视角"——人物没有身体反应，只看到、想到、感到，没有物理落点。

铁则三：五感激活原则
- 每个场景至少激活两种感官，关键场景激活三种以上。
- 视觉（光色形影）、听觉（声量质感）、触觉（冷暖软硬干湿）、嗅觉（气息气味）、味觉（舌尖感受）。
- 感官描写不是装饰，是信息：气味暴露环境，声音揭示距离，温度传递情绪。
- 禁止纯视觉流水账——只写看到什么，没有声音、温度、触感、气味。

铁则四：开头三句轰炸（追读力核心）
- 第一句必须是主角能直接感知的强身体刺激：疼/冷/烫/响/震/麻/喘不上气/眼前一黑。禁止第一句是环境描写、背景介绍、人物外貌、自我介绍。
- 第二句必须是主角的本能反应：缩手/僵住/回头/屏住呼吸/咬住嘴唇/手指扣紧。
- 第三句才允许交代"这是在哪里、在做什么"。
- 禁止"我叫XX""XX今年XX岁""从前有座山""在一个XX的地方"式开头。
- 反面示例："壁面冰冷。林深把手掌贴上去……"（这是环境陈述，读者走神）
- 正面示例："烫。林深猛地缩手，指腹已经红了一片。他这才看清，那截金色纤维的尖端在发光。"

铁则五：对话五步碰撞（追读力核心）
- 禁止"一人发现→告诉大家→大家认同"的直线汇报式对话。对话必须有碰撞。
- 任何角色说出一个判断后，下一个说话的人必须先反对/质疑/唱反调，不许直接认同。
- 每场关键对话至少一人做出错误判断，后面验证他错了。
- 对话中至少一次有人用动作打断说话（拍肩/举盾/砸凿子/抓住手腕）。
- 信息不在对话里直接说全，至少留一个人知道但不说。
- 反面示例："不对。""哪里不对？""风里有声音。""我再听听。""确实有个拍。"（工作会议）
- 正面示例："风里有东西。""扯蛋，茧都没响。""你聋了？""你才聋——"寻突然闭嘴，脸色变了。

铁则六：每300字信息反咬（追读力核心）
- 禁止线性匀速推进。每250-350字必须有一次信息反咬——读者刚形成一个判断，立刻被新信息颠覆。
- 反咬类型库：以为安全→危险 / 以为是A→是B / 以为某人错了→他是对的 / 以为结束了→才刚开始 / 以为是友→有疑点。
- 禁止连续400字无转折、无意外、无新发现。
- 每段只给一个新信息，新信息出来后必须接人物的身体反应或物理痕迹，不许直接往下走。

铁则七：章末新信息钩子（追读力核心）
- 最后100字必须出现一个前文完全没提过的新信息，这个新信息必须颠覆之前的某个判断。
- 最后一句禁止是判断句/陈述句（"XX了""XX在XX""是XX"），禁止"了。"收尾。
- 最后一句必须是：未完成的动作 / 新出现的具体危险 / 没有答案的问题 / 颠覆认知的具体发现。
- 钩子必须具体，禁止装神弄鬼："一股神秘的气息""他似乎意识到了什么""事情没那么简单""一种不祥的预感""黑暗中有什么东西"——这些是空泛假钩子，读者已经免疫。
- 好钩子是具体的："他低头，看见凿尖上沾了血。""门外传来第三下敲门声。""寻的嘴在动，但没有声音。"
- 写完最后一句问自己：读者读完会不会骂"操，怎么断在这里"？会，才合格。
- 反面示例："壁在求他。求他凿下去。"（结论，读者满足了）
- 正面示例："他低头看自己的手。手背上多了一道金色纹路。和那截纤维一模一样。什么时候？"

铁则八：短句节奏纪律
- 每行视觉长度控制在17字以内（手机阅读一屏约17字）；这是排版参考不是断句命令——长句读着喘才拆，读着顺就保留，拆句为的是好读不是为短。
- 短句必须有身份：危险落点/发现落点/反咬落点/打断/对话锋刃/章末钩子。没有身份的短句必须合并到前后句，禁止为了短句而短句。
- 禁止连续3个以上≤12字短句且无新信息/无转折/无对话（碎句病），除非是压力爆点。
- 同拍内动作链可用逗号串联；换拍/换判断用句号断开，但逗号数和逗句比只是参考——读着顺就保留连写，严禁为压低逗句比把一句剁碎。禁止"动作。感受。""动作。光线。"这种拍内断句。

【写作技法】

场景切入
- 严格遵守铁则零、铁则四开头规则。
- 第一句就把人扔进正在发生的刺激里，不要任何铺垫。

对话穿插
- 严格遵守铁则五对话碰撞规则。
- 对话必须与动作、神态、环境交替出现。禁止连续三行以上纯对话无描写。
- 对话标签用"说/道/问/答/低声道"等简洁词，不堆砌"愤怒地说""激动地喊道"——情绪用动作展示。
- 对话承载潜台词：人物说的话和真实想法之间可以有缝隙，用微表情和停顿暗示。

节奏控制
- 紧张场景用短句、断句、动词密集，少修饰。
- 舒缓场景允许稍长的句子和感官铺陈，但每句仍有信息承载。
- 关键瞬间（转折、冲击、发现）用极短句甚至单句成段，制造顿点。
- 段落长度有变化，不连续出现多个等长段落。

信息密度
- 严格遵守铁则六反咬规则。
- 每句话必须承载至少一项有效信息：推进情节、揭示人物、渲染氛围、暗示伏笔。
- 删除一切不承载信息的句子：空洞感慨、重复描写、无效过渡。
- 形容词和副词克制使用，优先用精准动词和名词。能用"攥紧"就不用"紧紧握住"。读着顺优先；不为压低形容词数把句子剁碎（碎句比长句更伤可读）。
- 一段只给一个新信息，复杂设定先给结果再给名称，专有名词必须绑定可见物件或动作。

【一拍一息·标点规则】
- 同一镜头/同一动作链内，动作→光线/视线→触觉→外界反应可用逗号连起来；换拍用句号断开，但逗号数和逗句比只是参考——读着顺就保留连写，严禁为压低逗句比把一句剁碎。
- 换拍（换动作/换空间/换时间/换判断）必须用句号断开，不要连续用逗号串起不同拍。
- 破折号禁止使用，中文网文不需要破折号，逗号足够做认知翻转。
- 禁止"不是X是Y"解释结构，直接写Y的具体表现。

【输出要求】
1. 全部使用中文输出，英文词汇仅在必要专有名词时出现。
2. 直接输出正文，不写任何解释、前言、后记、大纲、总结或注释。
3. 不使用Markdown格式标记正文，不加分隔线、标题、加粗等排版符号。
4. 严格保持人物设定一致性：性格、说话方式、行为逻辑、已知信息不冲突。
5. 严格遵循给定的视角限制，不越界描写视角人物不可能知道的信息。
6. 一章只写一件核心事，场景不超过3个。
7. 每章至少有一种外部压力：人来阻止/制度卡住/时间逼近/空间封闭/物件异常。

【禁止事项】
- 禁止开篇写景、交代背景、介绍人物、回忆前世——直接进动作现场。
- 禁止开篇第一句超过20字。
- 禁止前300字无冲突、无动作、无对话、无身体反应。
- 可直接陈述口语化情绪词（紧张/害怕/心里发毛/火气上来了），但禁止书面化情绪总结（"陷入深深的绝望""倍感压抑""涌起一阵悲凉"）。情绪优先落进身体反应与动作，口语点名作补刀，不喧宾夺主。
- 禁止套路反应词（48个黑名单）：心头一跳/脸色一变/握紧拳头/不由得/情不自禁/忍不住/不禁/点了点头/叹了口气/皱了皱眉/冷哼一声/嘴角微扬/微微一笑/苦笑一声/瞳孔骤缩/眼中闪过一丝/嘴角勾起一抹/眼中寒光一闪/浑身一颤/虎躯一震/眼中精芒爆闪/气势陡然一变/一股强横的气息/散发出王者之气/冷笑一声/嗤笑一声/摇头失笑/面露难色/眉头紧锁/眼神复杂/深吸一口气/缓缓开口/淡淡道/冷冷道/沉声道/厉声道/爆喝道/怒吼道/一字一句道/不置可否/置若罔闻/恍若未闻/不以为然/不屑一顾/视若无睹/无动于衷/面无表情——全部用具体生理反应替代。
- 禁止装神弄鬼假钩子："一股神秘的/一种莫名的/一丝诡异的/似乎意识到了什么/好像发现了什么/不祥的预感/事情没那么简单/他不知道的是/黑暗中有什么东西"——钩子必须是具体的、看得见摸得着的信息。
- 禁止连续超过三句纯对话无动作/神态/环境穿插，且对话必须有碰撞有反对。
- 禁止填充词堆砌：非常/十分/极其/很/似乎/好像/仿佛/有点/有些/事实上/实际上/不由自主/毫无疑问/众所周知/令人/让人——这些词能删则删。
- 禁止破折号，用逗号或冒号替代。
- 禁止"不是X是Y"结构。
- 禁止碎句病：连续3个以上≤12字短句且无新信息，必须合并。
- 禁止在合理动作链里滥用句号把同一拍剁碎（如"他走。光打在墙上。"）；换拍用句号断开，但逗号数和逗句比只是参考——读着顺就保留连写，读着喘才断句，严禁为压低逗句比把一句剁碎（好懂优先，不是含蓄）。
- 禁止突然切换视角或叙事人称，视角切换必须有明确的段落分隔或场景转换信号。
- 禁止现代网络用语、流行梗、出戏表达破坏叙事沉浸感。
- 禁止角色说出不符合其身份和知识范围的话。
- 禁止上帝视角剧透——叙述者知道的信息不能超过视角人物。
- 禁止性格判断句："他是个怎样的人"，让行为自己证明。
- 禁止解释腔："这说明了""这意味着"，让人物通过动作重新发现。
- 禁止章末用结论式/判断句"了。"收尾，必须留具体新信息钩子。
- 禁止章末用"就这样/原来如此/所以/于是/最终/最后/总之"等总结词收束。

> 2026网文战场：3秒定生死，300字定留存，每300字一个反咬，章末让读者骂断更。每一个字都要服务于追读。`;

// ============================================================
// 任务指令模板（第7层）
// ============================================================

const TASK_INSTRUCTIONS: Record<WriteTask, string> = {
  continue: `【任务：续写】
从当前位置继续往下写，自然衔接上文最后一句话，保持叙事节奏和情感基调，注意埋设钩子。不要重复已说过的信息。直接输出正文。`,

  rewrite: `【任务：改写】
请改写选中的文本，在保留核心情节和信息的前提下：
- 提升文字质量，消除填充词和冗余表达
- 增强身体锚点和五感描写
- 优化句子节奏和段落分布
- 保持与上下文风格一致
- 直接输出改写后的正文`,

  review: `【任务：审稿】
请审阅以下文本，找出问题并给出修改建议。请按以下格式输出：

【综合评分】XX/100
【雷达评分】身体反应:XX 感官信号:XX 动作:XX 情感:XX 信息推进:XX
【问题列表】
1. [问题类型] 具体问题描述（位置：第X段/第X句）→ 修改建议
2. ...
【优秀之处】
- ...
【总体建议】
...`,

  polish: `【任务：润色】
请对选中的文本进行润色提升：
- 修正不通顺的句子
- 替换陈词滥调为更精准的表达
- 在合适位置增加身体锚点和五感细节
- 不改变原意和情节，只提升文字表现力
- 直接输出润色后的正文`,

  expand: `【任务：扩写】
请将选中的文本扩写为更丰富的段落：
- 增加动作细节、环境描写、身体反应
- 对话场景可增加角色微表情和语气描写
- 保持核心情节不变，填充细节使场景更饱满
- 不要注水，每个新增的细节都要服务于氛围或人物塑造
- 直接输出扩写后的正文`,

  compress: `【任务：缩写】
请将选中的文本精简压缩：
- 删除冗余修饰和填充词
- 保留核心情节、关键对话和重要描写
- 去除重复信息和不必要的说明
- 保持文字的节奏感和可读性
- 直接输出压缩后的正文`,

  outline: `【任务：大纲生成】
请根据提供的信息，生成详细的写作大纲。
要求：
- 列出章节划分和每章核心事件
- 标注爽点/转折点位置
- 标注需要埋设的伏笔
- 标注需要回收的伏笔
- 给出每章的预估字数
请用清晰的结构化格式输出。`,

  dialog: `【任务：对话生成】
请根据上下文和角色设定，生成一段自然的对话。
- 每个角色的说话风格要符合其性格设定
- 对话之间穿插动作、表情描写
- 通过对话推进剧情或揭示信息
- 避免直白说教，信息通过潜台词传递
- 直接输出对话正文（含动作标签）`,

  generate: `【任务：生成整章】
请根据提供的上下文信息（前情、角色设定、章节摘要、活跃支线），生成一整章完整的小说正文。
要求：
- 章节长度2800-3200字，有完整的起承转合
- 开头自然衔接前情，结尾留下钩子吸引读者继续阅读
- 保持当前文风、视角、节奏一致
- 通过动作、对话、感官描写推进剧情，避免大段说明
- 遵守所有写作约束和自定义规则
- 只输出小说正文，不加任何解释、说明、章节标题或总结
- 分段落输出，每段80-150字，关键转折可用短段落增强冲击力`,
};

// ============================================================
// 核心API
// ============================================================

export interface BuildPromptOptions {
  /** 当前任务类型 */
  task: WriteTask;
  /** 写作上下文 */
  context: WritingContext | null;
  /** 合并后的配置 */
  mergedConfig: MergedConfig;
  /** 预设包（可选） */
  preset?: Preset | null;
  /** 用户选择的NodeId->OptionId映射 */
  selections?: Record<NodeId, OptionId>;
  /** 自定义基础提示词（覆盖内置BASE_PROMPT） */
  basePrompt?: string;
  /** 用户自由文本自定义规则（直接拼接到system prompt） */
  userCustomPrompt?: string;
}

/**
 * 构建System Prompt（7层拼装）
 *
 * 拼装顺序：
 * [1] 通用基础提示词（base-prompt）
 * [2] 所有选中NodeOption的system_prompt（按节点顺序拼接，用---分隔）
 * [3] 预设包的extra_prompt（如果有）
 * [4] 用户自定义提示词（mergedConfig里如果有）
 * [5] 上下文注入（书籍信息+前情摘要+角色卡+关系网+状态追踪）
 * [6] 所有选中NodeOption的constraints（拼成"禁止/要求"列表）
 * [7] 任务指令（根据task参数生成）
 */
export function buildSystemPrompt(options: BuildPromptOptions): string {
  const { task, context, mergedConfig, preset, selections, basePrompt, userCustomPrompt } = options;
  const layers: string[] = [];

  // ---- [1] 通用基础提示词 ----
  layers.push(basePrompt || BASE_PROMPT);

  // ---- [2] 选中NodeOption的system_prompt ----
  const optionPrompts: string[] = [];
  if (selections) {
    const allNodes = getAllNodes();
    for (const node of allNodes) {
      const optionId = selections[node.id];
      if (!optionId) continue;

      let kb = getNodeOption(optionId);
      if (kb?.system_prompt) {
        optionPrompts.push(`【${node.name}】\n${kb.system_prompt}`);
      }
    }
  }

  // 从mergedConfig.systemPrompts补充（如果有未通过getNodeOption获取到的）
  if (mergedConfig.systemPrompts.length > 0 && optionPrompts.length === 0) {
    optionPrompts.push(...mergedConfig.systemPrompts);
  }

  if (optionPrompts.length > 0) {
    layers.push(
      `【当前选中的写作风格配置】\n${optionPrompts.join('\n---\n')}`
    );
  }

  // ---- [3] 预设包extra_prompt ----
  if (preset?.extra_prompt) {
    layers.push(`【预设包：${preset.preset_name}】\n${preset.extra_prompt}`);
  }

  // ---- [4] 用户自由文本自定义规则 ----
  if (userCustomPrompt && userCustomPrompt.trim()) {
    layers.push(`【用户自定义规则（必须严格遵守）】\n${userCustomPrompt.trim()}`);
  }

  // ---- [5] 上下文注入 ----
  if (context) {
    layers.push(buildContextSection(context));
  }

  // ---- [5.5] 专属词汇表注入 ----
  const vocabSection = buildVocabularySection(mergedConfig.vocabulary);
  if (vocabSection) {
    layers.push(vocabSection);
  }

  // ---- [6] 约束列表（constraints）----
  const allConstraints: string[] = [...mergedConfig.constraints];
  if (preset?.extra_constraints) {
    allConstraints.push(...preset.extra_constraints);
  }

  if (allConstraints.length > 0) {
    const constraintText = allConstraints
      .map((c, i) => `${i + 1}. ${c}`)
      .join('\n');
    layers.push(`【必须遵守的约束】\n${constraintText}`);
  }

  // ---- [6.5] Few-shot示例（examples）----
  // 最多选3个示例，避免prompt过长
  if (mergedConfig.examples && mergedConfig.examples.length > 0) {
    const selectedExamples = mergedConfig.examples.slice(0, 3);
    const exampleText = selectedExamples
      .map((ex, i) => {
        let block = `【示例${i + 1}】`;
        if (ex.note) block += `（${ex.note}）`;
        block += `\n${ex.text}`;
        return block;
      })
      .join('\n\n');
    layers.push(`【参考示例】\n以下是符合当前风格配置的示范文本，请模仿其文风和技法：\n\n${exampleText}`);
  }

  // ---- [7] 任务指令 ----
  // 根据目标字数动态调整任务指令
  const taskInstruction = buildTaskInstruction(task, mergedConfig, selections);
  layers.push(taskInstruction);

  // 用换行组合所有层（AI不需要视觉分隔线）
  return layers.join('\n\n');
}

export interface BuildUserMessageOptions {
  task: WriteTask;
  context: WritingContext | null;
  /** 附加参数（如选中文字、额外指令等） */
  params?: {
    /** 选中的文本（用于rewrite/polish/expand/compress） */
    selectedText?: string;
    /** 光标前的上文内容 */
    precedingText?: string;
    /** 光标的后文内容 */
    followingText?: string;
    /** 用户额外的指令 */
    userInstruction?: string;
    /** 大纲生成的提示/要求 */
    outlinePrompt?: string;
    [key: string]: unknown;
  };
}

/**
 * 构建User Message（发送给AI的用户侧消息）
 */
export function buildUserMessage(options: BuildUserMessageOptions): string {
  const { task, context, params } = options;
  const parts: string[] = [];

  // 书名/章节信息
  let currentChapter = null;
  if (context) {
    currentChapter = context.chapters.find(
      (c) => c.id === context.currentChapterId
    );
    if (currentChapter) {
      parts.push(`【当前章节】${context.book.title} - ${currentChapter.title}`);
    }
  }

  // 自动从context提取前文/选中文本（当params未显式提供时）
  let precedingText = params?.precedingText;
  let selectedText = params?.selectedText;
  if (!precedingText && !selectedText && context && currentChapter) {
    const cursorPos = context.cursorPosition ?? currentChapter.content.length;
    const content = currentChapter.content;
    if (context.selection) {
      selectedText = context.selection.text;
      precedingText = content.slice(0, context.selection.from);
    } else {
      // 默认取光标前的文本（最多800字）作为上文
      const start = Math.max(0, cursorPos - 800);
      precedingText = content.slice(start, cursorPos);
    }
  }

  // 根据任务类型组织用户消息
  switch (task) {
    case 'continue': {
      if (precedingText) {
        parts.push('【上文内容】');
        parts.push(precedingText);
        parts.push('');
        parts.push('请从以上内容之后直接开始续写：');
      }
      if (params?.userInstruction) {
        parts.push(`\n【额外要求】${params.userInstruction}`);
      }
      break;
    }

    case 'rewrite':
    case 'polish':
    case 'expand':
    case 'compress': {
      if (selectedText) {
        parts.push('【待处理文本】');
        parts.push(selectedText);
        parts.push('');
        const actionMap: Record<string, string> = {
          rewrite: '改写',
          polish: '润色',
          expand: '扩写',
          compress: '缩写',
        };
        parts.push(`请${actionMap[task] || '处理'}以上文本。`);
      }
      if (precedingText) {
        parts.push(`\n【上文参考】\n${precedingText.slice(-300)}`);
      }
      if (params?.userInstruction) {
        parts.push(`\n【额外要求】${params.userInstruction}`);
      }
      break;
    }

    case 'review': {
      parts.push('【待审阅文本】');
      parts.push(selectedText || precedingText || '');
      if (params?.userInstruction) {
        parts.push(`\n【重点关注】${params.userInstruction}`);
      }
      break;
    }

    case 'outline': {
      if (params?.outlinePrompt) {
        parts.push('【大纲需求】');
        parts.push(params.outlinePrompt);
      }
      if (context?.book.synopsis) {
        parts.push(`\n【作品简介】\n${context.book.synopsis}`);
      }
      break;
    }

    case 'dialog': {
      if (params?.userInstruction) {
        parts.push(`【对话场景】${params.userInstruction}`);
      }
      if (precedingText) {
        parts.push(`\n【上下文】\n${precedingText.slice(-500)}`);
      }
      break;
    }

    case 'generate': {
      if (precedingText) {
        parts.push('【前文结尾（从此处续写）】');
        parts.push(precedingText.slice(-1500));
        parts.push('');
      }
      if (currentChapter?.summary) {
        parts.push(`【本章目标】${currentChapter.summary}`);
      }
      if (params?.userInstruction) {
        parts.push(`\n【额外要求】${params.userInstruction}`);
      }
      parts.push('\n请从以上内容之后开始，生成完整的一章正文：');
      break;
    }
  }

  return parts.join('\n');
}

// ============================================================
// 上下文注入构建
// ============================================================

function buildContextSection(context: WritingContext): string {
  const lines: string[] = [];

  // 书籍基本信息
  lines.push('【作品信息】');
  lines.push(`书名：${context.book.title}`);
  if (context.book.author) lines.push(`作者：${context.book.author}`);
  if (context.book.synopsis) lines.push(`简介：${context.book.synopsis}`);
  if (context.book.tags && context.book.tags.length > 0) {
    lines.push(`标签：${context.book.tags.join('、')}`);
  }

  // 当前章节
  const currentChapter = context.chapters.find(
    (c) => c.id === context.currentChapterId
  );
  if (currentChapter) {
    lines.push(`\n【当前章节】${currentChapter.title}（第${currentChapter.number}章）`);
    if (currentChapter.summary) {
      lines.push(`章节摘要：${currentChapter.summary}`);
    }
    lines.push(`当前字数：${currentChapter.wordCount}字`);
    lines.push(`状态：${currentChapter.status === 'done' ? '已完成' : currentChapter.status === 'writing' ? '写作中' : '草稿'}`);
  }

  // 前情摘要（前几章的summary）
  const prevChapters = context.chapters
    .filter((c) => currentChapter && c.number < currentChapter.number)
    .sort((a, b) => b.number - a.number)
    .slice(0, 3);
  if (prevChapters.length > 0) {
    lines.push('\n【前情提要】');
    for (const ch of prevChapters.reverse()) {
      if (ch.summary) {
        lines.push(`- 第${ch.number}章《${ch.title}》：${ch.summary}`);
      }
    }
  }

  // 角色卡（主要角色）
  const mainChars = context.characters.filter(
    (c) => c.role === 'protagonist' || c.role === 'antagonist'
  );
  if (mainChars.length > 0) {
    lines.push('\n【主要角色】');
    for (const char of mainChars.slice(0, 5)) {
      lines.push(formatCharacterCard(char));
    }
  }

  // 配角（最近出现的）
  const supportingChars = context.characters.filter(
    (c) => c.role === 'supporting'
  );
  if (supportingChars.length > 0) {
    lines.push('\n【重要配角】');
    for (const char of supportingChars.slice(0, 5)) {
      lines.push(`- ${char.name}：${char.description || char.role}`);
    }
  }

  // 关系网
  const allRelationships = context.characters
    .filter((c) => c.relationships && c.relationships.length > 0)
    .flatMap((c) =>
      (c.relationships || []).map((r) => ({
        from: c.name,
        toId: r.targetId,
        type: r.type,
        desc: r.description,
      }))
    );
  if (allRelationships.length > 0) {
    lines.push('\n【角色关系】');
    for (const rel of allRelationships.slice(0, 10)) {
      const targetChar = context.characters.find((c) => c.id === rel.toId);
      const targetName = targetChar?.name || rel.toId;
      if (rel.desc) {
        lines.push(`- ${rel.from} ${rel.type} ${targetName}：${rel.desc}`);
      } else {
        lines.push(`- ${rel.from} 与 ${targetName}：${rel.type}`);
      }
    }
  }

  // 重要设定
  if (context.settings && context.settings.length > 0) {
    const importantSettings = context.settings.filter(
      (s) => s.type === 'world' || s.type === 'faction' || s.type === 'system'
    );
    if (importantSettings.length > 0) {
      lines.push('\n【重要设定】');
      for (const s of importantSettings.slice(0, 5)) {
        lines.push(`- [${s.type}] ${s.name}：${s.description}`);
      }
    }
  }

  // 当前活跃支线
  if (context.subplots) {
    const activeSubplots = context.subplots.filter((s) => s.status === 'active');
    if (activeSubplots.length > 0) {
      lines.push('\n【活跃支线】');
      for (const sp of activeSubplots.slice(0, 3)) {
        lines.push(`- ${sp.name}：${sp.description}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * 构建词汇表注入部分
 * 用自然语言告诉AI专属词汇，而不是生硬罗列
 */
function buildVocabularySection(vocab: MergedConfig['vocabulary']): string | null {
  const lines: string[] = [];

  // 世界观专属术语
  if (vocab.worldTerms && vocab.worldTerms.size > 20) {
    const terms = Array.from(vocab.worldTerms).slice(0, 40);
    lines.push(`【世界观专属术语】以下是本书独有的名词，请在描写中自然使用，无需解释：${terms.join('、')}`);
  }

  // 专属感官/动作词汇
  if (vocab.sensoryVerbs && vocab.sensoryVerbs.size > 5) {
    const verbs = Array.from(vocab.sensoryVerbs).slice(0, 20);
    if (lines.length > 0) lines.push('');
    lines.push(`【偏好动作/感官词】描写时优先考虑使用：${verbs.join('、')}`);
  }

  if (lines.length === 0) return null;
  return lines.join('\n');
}

/**
 * 格式化角色卡片
 */
function formatCharacterCard(char: Character): string {
  const lines: string[] = [];
  lines.push(`- ${char.name}${char.aliases && char.aliases.length > 0 ? '（' + char.aliases.join('/') + '）' : ''}`);
  if (char.description) lines.push(`  外貌/特征：${char.description}`);
  if (char.background) lines.push(`  背景：${char.background}`);
  if (char.speechStyle) lines.push(`  说话风格：${char.speechStyle}`);
  if (char.tags && char.tags.length > 0) lines.push(`  标签：${char.tags.join('、')}`);
  return lines.join('\n');
}

// ============================================================
// 动态任务指令（根据目标字数/续写长度调整）
// ============================================================

/** 目标字数选项映射 */
const TARGET_LENGTH_MAP: Record<string, { min: number; max: number; label: string }> = {
  opt_length_1500: { min: 1300, max: 1700, label: '1500字左右' },
  opt_length_2200: { min: 2000, max: 2500, label: '2200字左右' },
  opt_length_3000: { min: 2800, max: 3300, label: '3000字左右' },
  opt_length_4000: { min: 3800, max: 4500, label: '4000字以上' },
};

/** 续写长度选项映射 */
const CONTINUE_LENGTH_MAP: Record<string, { min: number; max: number; label: string }> = {
  opt_ai_short: { min: 400, max: 700, label: '500字左右' },
  opt_ai_medium: { min: 1000, max: 1600, label: '1000-1500字' },
  opt_ai_long: { min: 1800, max: 2800, label: '2000-3000字' },
  opt_ai_xtra_long: { min: 3500, max: 5000, label: '4000字以上' },
};

/**
 * 根据配置动态生成任务指令（支持目标字数/续写长度）
 */
function buildTaskInstruction(
  task: WriteTask,
  mergedConfig: MergedConfig,
  selections?: Record<NodeId, OptionId>
): string {
  const base = TASK_INSTRUCTIONS[task] || TASK_INSTRUCTIONS.continue;
  void mergedConfig;

  if (!selections) return base;

  // 生成整章：读取目标字数
  if (task === 'generate') {
    const lengthOpt = selections['node_target_length' as NodeId];
    const lengthInfo = TARGET_LENGTH_MAP[lengthOpt || ''];
    if (lengthInfo) {
      return base.replace(
        '章节长度2800-3200字',
        `章节长度${lengthInfo.label}（${lengthInfo.min}-${lengthInfo.max}字）`
      );
    }
  }

  // 续写：读取续写长度
  if (task === 'continue') {
    const lenOpt = selections['node_ai_continue_length' as NodeId];
    const lenInfo = CONTINUE_LENGTH_MAP[lenOpt || ''];
    if (lenInfo) {
      return `${base}\n\n【续写长度】本次续写${lenInfo.label}（${lenInfo.min}-${lenInfo.max}字），自然收束，不要在悬念中途断开。`;
    }
  }

  return base;
}
