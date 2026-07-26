// ============================================================
// GWE V2.0 - LLM Provider 抽象层（浏览器版）
// 支持OpenAI兼容API，内置Mock Provider用于体验模式
// ============================================================

import type {
  LLMProvider,
  LLMRequest,
  LLMUsage,
  StreamCallbacks,
} from './types';
import { logWarn } from './logger';

// ============================================================
// OpenAI兼容 Provider
// ============================================================

export interface OpenAICompatibleConfig {
  apiKey: string;
  baseURL: string;       // 如 https://api.openai.com/v1 或 https://ark.cn-beijing.volces.com/api/v3
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export class OpenAICompatibleProvider implements LLMProvider {
  public readonly name = 'openai-compatible';
  private config: OpenAICompatibleConfig;

  constructor(config: OpenAICompatibleConfig) {
    this.config = config;
  }

  async chat(request: LLMRequest): Promise<{ content: string; usage?: LLMUsage }> {
    const url = `${this.config.baseURL.replace(/\/$/, '')}/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 60000
    );

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: request.messages,
          temperature: request.temperature ?? this.config.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4096,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`LLM API error ${res.status}: ${errText.slice(0, 300)}`);
      }

      const data = await res.json();
      const content: string = data.choices?.[0]?.message?.content ?? '';
      const usage = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
            totalTokens: data.usage.total_tokens ?? 0,
          }
        : undefined;

      return { content, usage };
    } finally {
      clearTimeout(timeout);
    }
  }

  async stream(request: LLMRequest, callbacks: StreamCallbacks): Promise<void> {
    const url = `${this.config.baseURL.replace(/\/$/, '')}/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 120000
    );

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: request.messages,
          temperature: request.temperature ?? this.config.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4096,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`LLM API error ${res.status}: ${errText.slice(0, 300)}`);
      }

      if (!res.body) {
        throw new Error('Response body is null');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta: string =
              parsed.choices?.[0]?.delta?.content ??
              parsed.choices?.[0]?.message?.content ??
              '';
            if (delta) {
              fullContent += delta;
              callbacks.onToken(delta);
            }
          } catch {
            // 忽略无法解析的SSE行
            logWarn('LLM', 'SSE流解析失败，跳过该行');
          }
        }
      }

      callbacks.onDone(fullContent);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      callbacks.onError(error);
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ============================================================
// Mock Provider（零配置体验模式，返回模拟文本）
// ============================================================

export class MockProvider implements LLMProvider {
  public readonly name = 'mock';

  // v12.1: 意图感知的模拟内容库 — 按15种意图类型生成差异化内容
  private readonly intentSamples: Record<string, string> = {
    show_growth: [
      '冷。\n\n不是温度，是那种从骨头缝里渗出来的寒意。林渊蜷缩在石室的角落里，双手死死攥着膝盖，指节已经发白。\n\n他的脊背像被烙铁烫过一样灼热——那是剑骨觉醒的位置。三天前，当赵无极的剑锋距离他的咽喉只剩三寸时，那道暗金色的纹路第一次从皮肤下浮现出来。\n\n就像有什么东西，在他体内沉睡了一万年，终于被死亡的恐惧唤醒了。\n\n"继续。"他咬着牙，对自己说。\n\n石壁上有一道裂缝，那是他昨天一拳砸出来的。裂缝周围散布着蛛网般的细纹，像某种古老文字的碎片。他盯着那些纹路，忽然觉得它们似乎在蠕动。\n\n不，不是幻觉。\n\n那些纹路真的在动。\n\n它们像金色的血管，沿着石壁的纹理蔓延，每一条都指向他的后背。不对，是从他的后背扩散出去的。林渊猛地站起身，后背撞在石壁上，一股灼热的力量从剑骨的位置迸发出来，顺着脊椎直冲颅顶。\n\n眼前的世界变了。\n\n石壁不再是石壁。那些裂缝中流淌着金色的光，像某种活着的文字，又像一把剑的脉络。他看到了——在石壁深处，有一把剑的虚影，通体暗金，剑身上刻满了与他的剑骨一模一样的纹路。\n\n"原来……你一直在等我。"\n\n他伸出手，指尖触碰到石壁的瞬间，整面石壁轰然碎裂。',
      '起初只是后背微微发烫。\n\n林渊以为那是被赵无极的掌风扫到的擦伤，没太在意。但当他踉跄着退到石壁边缘时，那股热度已经变成了灼烧——像有人把烧红的铁条贴在他的脊椎上。\n\n"这是什么……"\n\n他咬紧牙关，不让自己叫出声。赵无极还站在十步之外，嘴角挂着那副胜券在握的笑。外门弟子不能对内门长老出手，这是青云宗的铁律。但赵无极显然不在乎——他今天出现在这里，就没打算让林渊活着离开。\n\n后背的灼热越来越烈。\n\n有什么东西在皮肤下蠕动，像一条蛇，沿着他的脊柱缓慢爬行。每爬过一节脊椎，那节骨头就发出"咔"的一声脆响，像被什么力量重新锻造了一遍。\n\n第一声脆响，赵无极停下了脚步。\n\n第二声脆响，石室里的温度骤降。\n\n第三声，第四声，第五声——一连串的脆响沿着林渊的脊柱炸开，像一串鞭炮在他体内点燃。他猛地弓起背，双手撑地，暗金色的光从后背透出来，在地上投下了一道剑形的影子。\n\n"剑骨？！"赵无极的脸色终于变了。',
    ].join('\n\n---\n\n'),
    create_conflict: [
      '秦风把那张纸拍在桌上，整个议事厅安静了一瞬。\n\n"这是什么意思？"坐在上首的白发长老没有看纸，只是盯着秦风的眼睛。\n\n"字面上的意思，许长老。"秦风的声音很平，但手指在桌沿上敲了第三下——那是他压抑怒火的方式，"林渊觉醒剑骨，按照青云宗第七十二条门规，他应该进入内门修炼。为什么外门执事还在压他的晋升令？"\n\n许长老端起茶杯，不紧不慢地吹了吹浮沫："内门名额有限，今年已经满了。让他等明年吧。"\n\n"明年？"秦风笑了，"许长老，您的外甥赵无极，今年刚进内门吧？他好像连剑意都没凝聚出来。"\n\n议事厅的温度又降了几度。\n\n另外三位长老交换了一个眼神，但谁都没有开口。站在许长老身后的赵无极倒是开口了，声音里带着笑："秦师叔，规则是长老会定的。您虽然曾是内门首席，但现在……您已经不在了，不是吗？"\n\n秦风的手指停住了。\n\n他缓缓转过头，看向这个站在权力阴影里的年轻人，忽然笑了。那笑容让赵无极的笑容僵住了。\n\n"你说得对，我已经不在内门了。"秦风站起身，拍了拍衣袍上的褶皱，"但剑骨的事，不是你们能压得住的。因为剑骨选择的人，从来不是由长老会决定的。"',
    ].join('\n\n---\n\n'),
    advance_plot: [
      '天亮的时候，三个人影已经出现在青云宗的山门外。\n\n为首的是一身黑衣的中年男人，腰间的令牌在晨光中泛着冷光——那是剑阁的执法令，见令如见阁主。守门的弟子只看了一眼，就慌忙让开了路。\n\n"剑阁的人怎么来了？"\n\n"不知道，但肯定是冲着剑骨来的。"\n\n消息比人跑得快。当黑衣执法队踏进青云宗广场的时候，整个宗门都已经知道了。外门弟子们趴在墙头张望，内门弟子则站在廊下，眼神复杂。\n\n林渊站在石室的废墟前，背后的暗金色纹路还没有完全消退。他抬头看着天空——那里有一道剑光，正在急速逼近。\n\n不是御剑飞行。\n\n是有人在用剑气撕裂云层。\n\n那道剑光落在广场中央，化成一个白衣少女。她看起来不过十六七岁，但手中的剑通体漆黑，剑身上流转着与林渊剑骨一模一样的暗金色纹路。\n\n"你就是林渊？"少女歪了歪头，语气像在问今天天气怎么样，"我叫苏云裳，剑阁第七席。从现在开始，你是我的师弟了。"\n\n全场哗然。',
    ].join('\n\n---\n\n'),
    plant_foreshadow: [
      '苏云裳离开的时候，林渊注意到她腰间挂着一枚玉佩。\n\n那枚玉佩很普通——青白色的玉料，边缘有些磨损，看起来像是戴了很多年。但玉佩上刻着的纹路，林渊总觉得在哪里见过。\n\n不是剑阁的标记。也不是青云宗的标记。\n\n那是三道弯曲的线，像三条蛇纠缠在一起，又像某种古老的文字。林渊盯着它看了两秒，后背的剑骨忽然微微一热。\n\n"怎么了？"苏云裳察觉到他的目光，回头问。\n\n"没什么。"林渊收回视线，"你的玉佩挺好看的。"\n\n苏云裳低头看了一眼玉佩，嘴角动了动，像是想说什么，但最终只是淡淡地说了句："祖传的。\n\n那天晚上，林渊在石室的废墟里翻到了一块碎片。碎片上有一道纹路，和他白天在苏云裳玉佩上看到的一模一样。\n\n三道弯曲的线，像三条蛇纠缠在一起。\n\n他把碎片握在手里，剑骨的热度又升高了一分。\n\n"祖传的……"林渊喃喃自语。但苏云裳是剑阁的人，剑阁的人为什么会有刻着青云宗石壁上纹路的玉佩？\n\n除非——剑阁和剑骨，在很久以前，原本就是同一个东西。',
    ].join('\n\n---\n\n'),
    climax: [
      '赵无极不再留手。\n\n他的剑势变了。从方才的试探变成了杀招，每一剑都带着撕裂空气的尖啸。林渊拼命闪避，但外门弟子和内门长老之间的差距，不是靠意志能弥补的。\n\n第三剑划破了他的左肩。\n\n第五剑刺穿了他的右腿。\n\n第七剑——\n\n林渊闭上了眼睛。\n\n不是认命。是后背的剑骨，忽然开始燃烧。\n\n那不是热，是光。暗金色的光从他的后背炸开，像一轮太阳从地底升起。石壁上所有的裂缝同时亮了起来，那些古老的纹路在光的照耀下开始流动，像活了过来的血管。\n\n赵无极的剑停在半空。\n\n不是他不想刺下去，是刺不下去。有一股无形的力量，把他的剑死死地按在了空中，像有千万只手同时握住了剑身。\n\n"这是什么……"\n\n林渊睁开眼睛。他的瞳孔里，也亮起了暗金色的光。\n\n"剑骨第一式。"\n\n他抬起右手，没有剑，但手指并拢的瞬间，空气中凝聚出了一道剑形的虚影。那是纯粹由剑骨的力量凝聚而成的剑气——没有实体，却比任何实体都锋利。\n\n"破。"\n\n一道暗金色的剑光，从林渊的指尖射出，贯穿了赵无极的剑，贯穿了他的护体真气，贯穿了石室的墙壁，在青云宗的上空炸开了一朵金色的剑花。\n\n整个宗门，都看到了那朵剑花。',
    ].join('\n\n---\n\n'),
    build_relationship: [
      '"你受伤了。"\n\n苏云裳的声音从背后传来，林渊没有回头。他的左肩还在渗血，但比起血，更让他不安的是后背的剑骨——自从刚才爆发之后，它就一直处于一种半醒半睡的状态，像一头随时会睁眼的野兽。\n\n"小伤。"他说。\n\n苏云裳没有接话，只是走到他身边，从袖中取出一只青瓷瓶。她倒出一些药粉，不由分说地按在林渊的伤口上。药粉碰到血的瞬间，一股清凉的感觉蔓延开来，疼痛减轻了大半。\n\n"这是剑阁的止血散，外面买不到。"她说，语气平淡得像在念药方，"剑骨觉醒后，你的身体会有一段适应期。这段时间里，你的血比普通人流得快三倍，伤口愈合也快三倍，但一旦感染，死亡也快三倍。"\n\n林渊转头看她。\n\n月光下，苏云裳的侧脸线条很清晰，睫毛上挂着细碎的露水。她已经在这里站了很久了——从他在石室里打坐开始，就一直站在门外。\n\n"你为什么帮我？"他问。\n\n苏云裳沉默了一会儿，从腰间解下那枚玉佩，放在林渊手心。\n\n"因为剑骨选择的人，从来不是一个人。"',
    ].join('\n\n---\n\n'),
    reveal_secret: [
      '那枚玉佩在林渊手心里微微发烫。\n\n不是体温焐热的——是玉佩自己热的。他低头看去，玉佩上的三道蛇纹开始发光，与他的剑骨产生了某种共鸣。\n\n"这是什么？"他问。\n\n苏云裳靠着石壁坐下来，目光落在远处的黑暗中："你应该听说过剑阁吧——天下剑修的最高殿堂，阁主一剑可断山河。但你有没有想过，剑阁为什么会存在？"\n\n林渊摇了摇头。\n\n"因为剑骨。"苏云裳说，"每一代剑骨觉醒者，都会自动成为剑阁的弟子。不是剑阁选了剑骨，是剑骨创造了剑阁。第一代剑阁阁主，就是第一个觉醒剑骨的人。"\n\n林渊的手指收紧，玉佩在掌心发出轻微的嗡鸣。\n\n"但那是三千年前的事了。"苏云裳的声音低了下去，"三千年来，剑骨再也没有觉醒过。剑阁从一个守护者的组织，变成了权力斗争的工具。十二席之间互相倾轧，早就忘了剑骨存在的意义。"\n\n"那剑骨存在的意义是什么？"\n\n苏云裳抬头看他，月光在她的瞳孔里碎成了两片银箔。\n\n"守护墟壁。"',
    ].join('\n\n---\n\n'),
    build_atmosphere: [
      '青云宗的后山，有一条没人走的小路。\n\n说是小路，其实只是碎石的走向刚好形成了一条可以落脚的线。路的两旁是密不透风的铁杉林，树干上爬满了暗绿色的苔藓，在月光下泛着湿润的光泽。空气里有一股铁锈和腐叶混杂的气味，像是有什么东西在泥土深处腐烂了很久。\n\n林渊跟在苏云裳身后，每一步都踩在她的脚印上。\n\n不是因为他小心。是因为苏云裳走得太快了，快到他来不及看清脚下的路。更奇怪的是，那些铁杉的枝条在她经过时会自动向两旁分开，等她走过后又缓缓合拢，像在行礼。\n\n"到了。"\n\n苏云裳忽然停下，林渊差点撞上她的后背。\n\n眼前是一片空地。空地的中央，矗立着一面石壁。\n\n不，不是石壁。\n\n那是一面完全由暗金色纹路构成的"墙"。那些纹路不再是林渊之前看到的碎片，而是完整的、流动的、像活物一样呼吸着的图案。它们从地面升起，一直延伸到看不见的高处，在月光下发出低沉的嗡鸣。\n\n像一首歌。\n\n一首用骨头唱的歌。',
    ].join('\n\n---\n\n'),
    emotional_impact: [
      '秦风死了。\n\n林渊是在第二天早上才知道的。\n\n消息是苏云裳带来的，她站在石室的门口，手里攥着那枚玉佩，指节发白。她没有哭，但声音比哭还难听。\n\n"昨夜，剑阁执法队冲进了他的住处。他……没有反抗。"\n\n没有反抗。\n\n林渊知道秦风为什么不反抗。因为他曾是内门首席，他知道反抗剑阁的后果。更因为——他是为了保护自己。\n\n那天在议事厅上，秦风是唯一一个替林渊说话的人。\n\n林渊坐在石室的废墟里，后背的剑骨冰冷得像一块死铁。他想起秦风最后看他的那个眼神——不是愤怒，不是绝望，是平静。像一条河，在水面下藏着看不见的暗流。\n\n"他说了什么？"林渊的声音很轻。\n\n"他说——"苏云裳顿了顿，把玉佩攥得更紧了，"他说，剑骨选择的人，从来不会屈服。所以他也不会。"\n\n林渊闭上眼睛。\n\n后背的剑骨，又开始燃烧了。',
    ].join('\n\n---\n\n'),
    world_building: [
      '墟壁。\n\n这面墙在青云宗的后山，却又不属于青云宗。按照苏云裳的说法，它比青云宗古老得多——古老到青云宗建立之初，它的第一代宗主就是在这面墙前悟出了剑道。\n\n但没有人知道墟壁是什么。\n\n它像一面用金属和骨骼混合铸造的墙壁，上面刻满了暗金色的纹路。这些纹路不是文字，也不是图案，而是一种"状态"——它们会流动，会呼吸，会根据观看者的不同呈现出不同的形态。\n\n林渊第一次站在墟壁前的时候，那些纹路变成了一把剑。\n\n苏云裳第一次来的时候，它们变成了一面镜子。\n\n"剑骨觉醒者看到的，永远是剑。"苏云裳说，"因为剑骨本身就是墟壁的一部分。三千年前，第一位剑骨觉醒者从墟壁上剥下了一块碎片，把它融入自己的脊椎。从那以后，剑骨就成了一种传承——不是血脉，是意志。"\n\n"意志？"\n\n"对。墟壁只会回应一种东西——守护的意志。如果你心里没有想守护的东西，剑骨永远不会觉醒。"\n\n林渊沉默了很久。\n\n"可是……我觉醒的时候，只是想活下去。"\n\n苏云裳转过头看他，眼神里有一种他看不懂的东西。\n\n"想活下去，也是守护。你在守护你自己。"',
    ].join('\n\n---\n\n'),
    character_intro: [
      '来的人是一个少年。\n\n年纪和林渊差不多大，但身上的气质完全不同。他穿着一件洗得发白的灰布袍，袖口卷到小臂，露出一截被太阳晒成小麦色的皮肤。腰间挂着一把没有剑鞘的剑——剑身直接裸露在外，剑刃上布满了细密的缺口，像锯子一样。\n\n他站在广场中央，左右看了看，然后径直朝林渊走来。\n\n"你就是林渊？"他问。\n\n"是。"\n\n"我叫楚河。"少年咧嘴一笑，露出一口白牙，"我是你师兄。从今天起，你跟我。"\n\n林渊还没来得及回答，楚河就拍了拍他的肩膀，力道大得差点把他拍趴下。\n\n"别紧张，我跟你一样，也是剑骨觉醒者。不过我是三年前觉醒的，比你早了点。"他指了指自己腰间的无鞘剑，"这是我的剑，叫\'锯\'。别问我为什么叫这个，问就是剑阁那帮老东西取的名。"\n\n苏云裳在旁边冷冷地补了一句："因为你的剑术像锯木头一样粗暴。"\n\n"嘿，粗暴怎么了？"楚河也不恼，"能赢就行。"',
    ].join('\n\n---\n\n'),
    raise_stakes: [
      '剑阁的通缉令在第三天早上贴满了青云宗。\n\n林渊的名字赫然在列，罪名是"私通墟外势力，擅自动用禁术剑骨"。通缉令上悬赏的金额，足够让整个青云宗的外门弟子为他拼命。\n\n"他们疯了。"楚河撕下一张通缉令，揉成一团，"剑骨是剑阁的根本，他们居然把剑骨定为禁术？"\n\n苏云裳的脸色比平时更冷："不是剑阁疯了。是十二席中有三席，不想让剑骨觉醒者活着回到剑阁。因为剑骨觉醒者自动获得第七席的席位——而第七席，现在被一个不想让位的人占着。"\n\n楚河停下了撕纸的动作。\n\n"你是说……内鬼？"\n\n"不是内鬼。"苏云裳看向远处剑阁的方向，"是权力。剑骨觉醒者拥有罢免十二席的权力。三千年来第一次有剑骨觉醒，有人害怕了。"\n\n林渊听着他们的话，目光落在通缉令上自己的画像上。画像上的人他认识，但他不认识画像上那个悬赏金额。\n\n一万灵石。\n\n够买一个内门长老的人头。',
    ].join('\n\n---\n\n'),
    resolve_foreshadow: [
      '玉佩碎了。\n\n不是摔碎的，是苏云裳自己捏碎的。她站在墟壁前，把那枚祖传的玉佩握在掌心，然后用力一攥。青白色的碎屑从她指缝间落下，掉在地上，融进了暗金色纹路的流光里。\n\n"你在干什么？"林渊抓住她的手腕。\n\n苏云裳没有挣开，只是抬起头，看着墟壁上流动的纹路。那些纹路正在变化——它们不再是剑形，而是在重组成一个图案。\n\n三道弯曲的线，像三条蛇纠缠在一起。\n\n和玉佩上一模一样。\n\n"我骗了你。"苏云裳说，声音很平静，"我不是剑阁第七席。第七席是我父亲。他在三年前被人暗杀，凶手就是现在占着第七席的那个人。这枚玉佩，是我父亲留给我的唯一遗物——也是剑阁第七席的传承信物。"\n\n林渊松开了手。\n\n"那你为什么要混进剑阁？"\n\n"因为我要报仇。"苏云裳转过身，看着林渊的眼睛，"但我一个人做不到。剑骨觉醒者拥有罢免十二席的权力，只有你能帮我。"\n\n墟壁上的纹路，忽然亮了起来。',
    ].join('\n\n---\n\n'),
    transition: [
      '从青云宗到剑阁，需要穿过整个苍梧山脉。\n\n楚河说骑马要七天，苏云裳说御剑要三天，林渊说他不会御剑。于是最后变成了三个人骑两匹马，楚河一个人骑一匹，林渊和苏云裳骑一匹。\n\n"为什么是我跟他？"苏云裳问。\n\n"因为你是女的，他是男的，男女授受不亲——"楚河振振有词。\n\n"那你为什么不让林渊跟你骑一匹？"\n\n"因为我的马怕生。"\n\n苏云裳拔出剑。楚河拍马就跑。\n\n林渊骑在马上，看着前面两个人一追一逃，忽然觉得这大概是他这辈子最轻松的时刻。剑骨的灼热退去了，后背只留下一种温温的暖意，像泡在温泉里。\n\n但他知道，这只是暴风雨前的宁静。\n\n前方是剑阁，是十二席，是一个他从未涉足过的世界。他不知道等待他的是什么，但他知道——他必须去。\n\n因为秦风死了。\n\n而他还活着。',
    ].join('\n\n---\n\n'),
    breather: [
      '他们在山腰的一处温泉边扎营。\n\n楚河一看到温泉就把衣服脱了跳进去，苏云裳骂了一句"流氓"后拎着剑去林子另一边洗了。林渊坐在温泉边，把脚泡在水里，看着远处苍梧山脉的轮廓在暮色中渐渐模糊。\n\n"想什么呢？"楚河从水里冒出头，头发贴在脑门上，像一只落汤的野狗。\n\n"想秦风。"\n\n楚河沉默了。他靠在池边，仰头看着天空。星星还没有出来，只有一颗特别亮的，孤零零地挂在天顶。\n\n"秦风是个好人。"楚河说，"我见过他一次，三年前，在剑阁的入门考核上。他是那一届的考官。别人考的都是剑术，他考的是——你为什么要学剑。"\n\n"你怎么回答的？"\n\n"我说，因为好玩。"\n\n林渊忍不住笑了。这是他这些天来第一次笑。\n\n"他说什么？"\n\n"他说，这个理由，比那些说什么\'为了天下苍生\'的人靠谱多了。"楚河也笑了，但笑着笑着，眼眶就红了，"妈的，好人不长命。"\n\n林渊把脚从温泉里抽出来，站起身。\n\n"那就让好人白死。"\n\n楚河抬头看他。\n\n"不是。"林渊说，"是让害死他的人，付出代价。"',
    ].join('\n\n---\n\n'),
  };

  // 通用续写（无意图匹配时使用）
  private readonly defaultSample = '风从石缝里灌进来，带着一股铁锈的气味。\n\n林渊站在这面暗金色的墙前，后背的剑骨微微发烫。墙上那些纹路像活过来了一样，慢慢地流动，慢慢地呼吸，像某种古老的生物正在醒来。\n\n"它在等你。"苏云裳的声音从背后传来。\n\n"等什么？"\n\n"等你伸手。"\n\n林渊深吸一口气，抬起右手。指尖触碰到墙面的一瞬间，那些纹路忽然停止了流动。整个世界安静了一瞬，然后——\n\n所有的纹路，同时亮了起来。';

  /** 根据用户消息中的意图关键词，匹配对应的模拟内容 */
  private matchIntentContent(lastMsg: string): string {
    const msg = lastMsg.toLowerCase();
    // 按优先级匹配意图关键词
    const intentOrder = [
      'show_growth', 'create_conflict', 'plant_foreshadow', 'climax',
      'build_relationship', 'reveal_secret', 'resolve_foreshadow',
      'build_atmosphere', 'emotional_impact', 'world_building',
      'character_intro', 'raise_stakes', 'advance_plot',
      'transition', 'breather',
    ];

    const intentKeywords: Record<string, string[]> = {
      show_growth: ['成长', '突破', '觉醒', '领悟', '修炼', '晋升', 'growth', 'awaken'],
      create_conflict: ['冲突', '对抗', '对决', '矛盾', '冲突', 'conflict'],
      plant_foreshadow: ['伏笔', '伏笔', '暗示', '铺垫', 'foreshadow'],
      climax: ['高潮', '决战', '爆发', 'climax'],
      build_relationship: ['关系', '感情', '羁绊', 'relationship'],
      reveal_secret: ['秘密', '真相', '揭示', 'secret'],
      resolve_foreshadow: ['回收', '揭晓', 'resolve'],
      build_atmosphere: ['氛围', '气氛', 'atmosphere'],
      emotional_impact: ['情感', '感动', 'emotional'],
      world_building: ['世界', '设定', 'world'],
      character_intro: ['角色', '出场', 'character'],
      raise_stakes: ['危机', '赌注', 'stakes'],
      advance_plot: ['推进', '剧情', 'advance'],
      transition: ['过渡', 'transition'],
      breather: ['缓冲', '休息', 'breather'],
    };

    for (const intent of intentOrder) {
      if (this.intentSamples[intent]) {
        const keywords = intentKeywords[intent] || [];
        for (const kw of keywords) {
          if (msg.includes(kw)) return this.intentSamples[intent];
        }
      }
    }

    return this.defaultSample;
  }

  private mockRewrite(selectedText: string): string {
    return selectedText.replace(/很/g, '').replace(/非常/g, '');
  }

  async chat(request: LLMRequest): Promise<{ content: string; usage?: LLMUsage }> {
    const lastMsg = request.messages[request.messages.length - 1]?.content ?? '';
    let content = '';

    if (lastMsg.includes('续写') || lastMsg.includes('continue')) {
      content = this.matchIntentContent(lastMsg);
    } else if (lastMsg.includes('改写') || lastMsg.includes('rewrite')) {
      const match = lastMsg.match(/选中文字[：:]\s*([\s\S]+?)(?:\n\n|$)/);
      content = this.mockRewrite(match?.[1] ?? '（选中的文字）');
    } else if (lastMsg.includes('审稿') || lastMsg.includes('review')) {
      content = JSON.stringify({
        score: 78,
        issues: [
          { type: 'filler', severity: 'warning', message: '检测到少量填充词，建议精简。' },
        ],
      });
    } else {
      // 尝试匹配意图，否则返回通用内容
      content = this.matchIntentContent(lastMsg);
    }

    return {
      content,
      usage: { promptTokens: 200, completionTokens: content.length, totalTokens: 200 + content.length },
    };
  }

  async stream(request: LLMRequest, callbacks: StreamCallbacks): Promise<void> {
    const { content } = await this.chat(request);
    const chars = Array.from(content);
    for (let i = 0; i < chars.length; i++) {
      callbacks.onToken(chars[i]);
    }
    callbacks.onDone(content);
  }
}

// ============================================================
// 预设服务商配置
// ============================================================

export interface PresetProvider {
  id: string;
  name: string;
  baseURL: string;
  defaultModel: string;
  docs?: string;
}

export const PRESET_PROVIDERS: PresetProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'ark',
    name: '火山方舟（豆包）',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-1-5-pro-32k-250115',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-max',
  },
  {
    id: 'zhipu',
    name: '智谱GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
  },
  {
    id: 'moonshot',
    name: 'Kimi（月之暗面）',
    baseURL: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseURL: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
  },
  {
    id: 'custom',
    name: '自定义（OpenAI兼容）',
    baseURL: '',
    defaultModel: '',
  },
];

export function createProvider(presetId: string, apiKey: string, model?: string): LLMProvider {
  const preset = PRESET_PROVIDERS.find((p) => p.id === presetId);
  if (!preset || presetId === 'custom') {
    throw new Error('Custom provider requires explicit baseURL and model, use OpenAICompatibleProvider directly');
  }
  return new OpenAICompatibleProvider({
    apiKey,
    baseURL: preset.baseURL,
    model: model ?? preset.defaultModel,
  });
}
