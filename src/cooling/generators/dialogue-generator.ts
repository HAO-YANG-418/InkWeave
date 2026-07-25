// ============================================================
// 对话生成器 (Dialogue Generator) — v2.1
// 职责：根据模板+上下文+词库，生成对话结构
// 来源：narrative-engine-service → 100%通用
// ============================================================

import { GeneratedElement, WritingContext, DialogueTurn, VocabProvider } from './types';
import { fillParams, renderTemplate } from '../param-filler';

export class DialogueGenerator {
  private vocabProvider: VocabProvider;

  constructor(vocabProvider: VocabProvider) {
    this.vocabProvider = vocabProvider;
  }

  generate(
    template: any,
    context: WritingContext,
    packId: string,
    dialogueContext?: { dialogue_type?: string; participants: string[]; topic?: string }
  ): GeneratedElement {
    const participants = dialogueContext?.participants || [context.protagonist.name, '对方'];
    const topic = dialogueContext?.topic || context.current_event || '当前的事';

    const subtextPool = template.subtext_pool || [];
    const subtext = subtextPool.length > 0
      ? subtextPool[Math.floor(Math.random() * subtextPool.length)]
      : this.pickDefaultSubtext();

    const dialogueTurns = this.buildDialogueTurns(
      template.turn_structure || template.turn_patterns,
      participants,
      topic,
      subtext,
      context
    );

    const params = fillParams(template.parameters, {
      protagonist: context.protagonist.name,
      location: context.location,
      topic,
      subtext,
    });

    const narrative = renderTemplate(
      template.narrative_template || '',
      params,
      { protagonist: context.protagonist.name, location: context.location, topic, subtext }
    );

    return {
      name: template.name || '对话',
      dialogue_turns: dialogueTurns,
      subtext,
      narrative,
    };
  }

  scoreTemplate(
    template: any,
    _context: WritingContext
  ): { relevance: number; novelty: number; compatibility: number; total: number } {
    const usageCount = template.usage_count || 0;
    const relevance = 0.5;
    const novelty = 1 - Math.min(usageCount / 10, 1);
    const compatibility = 0.7;
    return {
      relevance,
      novelty,
      compatibility,
      total: relevance * 0.4 + novelty * 0.3 + compatibility * 0.3,
    };
  }

  private buildDialogueTurns(
    turnStructure: string[] | null,
    participants: string[],
    topic: string,
    subtext: string,
    _context: WritingContext
  ): DialogueTurn[] {
    const defaultTurns = [
      { type: 'open', tone: 'cautious' },
      { type: 'respond', tone: 'guarded' },
      { type: 'press', tone: 'intense' },
      { type: 'close', tone: 'resolved' },
    ];

    const turns = turnStructure && turnStructure.length > 0
      ? turnStructure.map((t: string, i: number) => ({ type: t, tone: defaultTurns[i]?.tone || 'neutral' }))
      : defaultTurns;

    return turns.map((turn: any, idx: number) => {
      const speaker = participants[idx % participants.length];
      const line = this.generateLine(speaker, topic, turn.type, turn.tone, subtext, participants, idx);
      return {
        speaker,
        line,
        action: this.generateAction(turn.type, speaker),
        subtext: idx === turns.length - 1 ? subtext : '',
      };
    });
  }

  private generateLine(
    _speaker: string,
    _topic: string,
    turnType: string,
    _tone: string,
    _subtext: string,
    _participants: string[],
    _turnIndex: number
  ): string {
    const lines: Record<string, string[]> = {
      open: [
        '你来了。', '这件事，你怎么看？', '我一直在等你。',
        '有件事，我想跟你说。', '你知道我为什么找你。',
      ],
      respond: [
        '你想说什么？', '我不明白你的意思。', '这件事没那么简单。',
        '你到底知道多少？', '……你继续说。',
      ],
      press: [
        '别装了，你我都清楚。', '你在隐瞒什么？', '说真话。',
        '这件事你跑不掉的。', '我不信。',
      ],
      close: [
        '……我知道了。', '给我时间想想。', '好，我答应你。',
        '你会后悔的。', '记住今天说的话。',
      ],
      neutral: [
        '……', '嗯。', '我明白。', '说来听听。', '然后呢？',
      ],
    };

    const pool = lines[turnType] || lines.neutral;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private generateAction(turnType: string, _speaker: string): string {
    const actions: Record<string, string[]> = {
      open: ['目光沉了沉', '声音压低', '顿了一下', '看着对方'],
      respond: ['眉头微皱', '沉默片刻', '退后一步', '握紧拳头'],
      press: ['向前逼近一步', '声音冷了下来', '盯着对方的眼睛', '语气加重'],
      close: ['转身准备离开', '深吸一口气', '别过脸去', '闭上眼'],
      neutral: ['没有说话', '微微点头', '别开目光', '顿了顿'],
    };
    const pool = actions[turnType] || actions.neutral;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private pickDefaultSubtext(): string {
    const subtexts = [
      '话里有话，暗藏试探',
      '表面平静，内心警惕',
      '有所隐瞒，不肯全说',
      '意在言外，另有所图',
      '虚与委蛇，等待时机',
    ];
    return subtexts[Math.floor(Math.random() * subtexts.length)];
  }
}