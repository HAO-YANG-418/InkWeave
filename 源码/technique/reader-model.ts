// technique/reader-model.ts
// P3 补齐：读者弃书风险模型（类人认知模块）。
// 当前为安全降级实现：基于浅层启发式给出分数，不调用 LLM。
// 真实实现（读者模型替代禁令墙）属软件化阶段，见质量模型本质认知。

export interface DropRiskPoint {
  position: number;
  risk: number; // 0-1
  reason: string;
  snippet: string;
}

export interface ReadingSimulation {
  overallScore: {
    engagement: number;
    readability: number;
    emotionalImpact: number;
    retention: number;
  };
  dropRiskPoints: DropRiskPoint[];
}

export class ReaderModel {
  constructor() {}

  simulateReading(content: string): ReadingSimulation {
    if (!content || !content.trim()) {
      return {
        overallScore: { engagement: 0, readability: 0, emotionalImpact: 0, retention: 0 },
        dropRiskPoints: [],
      };
    }
    const dropRiskPoints: DropRiskPoint[] = [];
    const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim());
    // 启发式1：超长段落（>400字）增加弃读风险
    let pos = 0;
    for (const p of paragraphs) {
      if (p.length > 400) {
        dropRiskPoints.push({
          position: pos,
          risk: 0.5,
          reason: '段落过长，阅读压力大',
          snippet: p.slice(0, 24),
        });
      }
      pos += p.length + 2;
    }
    // 启发式2：开头若为大段背景陈述（无动作动词）降分
    const opening = content.slice(0, 60);
    const hasAction = /[冲跑跳打杀扑撞掀砸踢飞落崩炸]/u.test(opening);
    // 启发式3：感叹号过载
    const exclaim = (content.match(/[！!]/g) || []).length;
    if (exclaim > 15) {
      dropRiskPoints.push({
        position: 0,
        risk: 0.3,
        reason: '感叹号过载，情绪廉价',
        snippet: content.slice(0, 24),
      });
    }
    const readability = hasAction ? 0.85 : 0.6;
    const engagement = Math.max(0.3, readability - dropRiskPoints.length * 0.05);
    const emotionalImpact = 0.6;
    const retention = Math.max(0, Math.min(1, engagement - dropRiskPoints.length * 0.04));
    return {
      overallScore: { engagement, readability, emotionalImpact, retention },
      dropRiskPoints,
    };
  }

  generateReport(sim: ReadingSimulation): string {
    const avg =
      (sim.overallScore.engagement +
        sim.overallScore.readability +
        sim.overallScore.emotionalImpact +
        sim.overallScore.retention) /
      4;
    if (sim.dropRiskPoints.length === 0) {
      return `读者留存评估：良好（综合 ${(avg * 100).toFixed(0)}）。无明显弃读风险点。`;
    }
    const lines = sim.dropRiskPoints.map(
      (d) => `- [风险${d.risk}] ${d.reason}（${d.snippet}）`,
    );
    return `读者留存评估：综合 ${(avg * 100).toFixed(0)}。风险点：\n${lines.join('\n')}`;
  }
}
