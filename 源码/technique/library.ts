// technique/library.ts
// P3 补齐：写作技巧推荐库。当前为安全降级（返回空推荐数组）。
// 真实技巧推荐（基于读者模型反馈 + 微调能力靶子）属软件化阶段。
import type { TechniqueRecommendContext, TechniqueRecommendation } from './types';

export class TechniqueLibrary {
  constructor() {}

  recommend(_ctx: TechniqueRecommendContext): TechniqueRecommendation[] {
    // 安全降级：返回空推荐数组，匹配 GWEWritingEngine.suggestTechnique 的返回类型。
    return [{ techniques: [], note: '技巧推荐未启用（P3 降级实现）' }];
  }
}
