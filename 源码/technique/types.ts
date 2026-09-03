// technique/types.ts
// P3 工程债补齐：定义引擎在 technique 层使用的共享契约类型。
// 真实技巧推荐逻辑属软件化阶段，此处只定义类型（被 library.ts / engine.ts 引用）。

export interface TechniqueRecommendContext {
  /** 当前写作上下文（宽松结构，避免与 WritingContext 强耦合） */
  chapterContent?: string;
  chapterTitle?: string;
  genre?: string;
  [key: string]: unknown;
}

export interface TechniqueRecommendation {
  /** 推荐使用的写作技巧列表 */
  techniques: RecommendedTechnique[];
  /** 附加说明 */
  note?: string;
}

export interface RecommendedTechnique {
  id: string;
  name: string;
  reason: string;
}
