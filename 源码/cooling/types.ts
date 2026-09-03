// ============================================================
// 冷却模块 — 共享类型
// ============================================================

// === 生成元素 ===
export interface GeneratedElement {
  id?: string;
  type?: string;
  name?: string;
  effect?: string;
  realm?: string;
  attribute?: string;
  [key: string]: unknown;
}

// === 叙事上下文（约束栈使用） ===
export interface ConstraintWritingContext {
  protagonist: {
    name: string;
    realm: string;
    attributes: string[];
  };
  volume: number;
  chapter: number;
  [key: string]: unknown;
}

// === 模板类型 ===
export interface AbilityTemplate {
  id: string;
  type: string;
  name?: string;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpponentTemplate {
  id: string;
  type: string;
  name?: string;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}

// === 校验结果 ===
export interface ConstraintCheckResult {
  status: 'PASS' | 'FAIL' | 'WARN' | 'N/A';
  actual?: string;
  limit?: string;
  message?: string;
}

export interface LayerCheckDetail {
  layer: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  checks: Record<string, ConstraintCheckResult>;
}

export interface ViolationDetail {
  template: string;
  violation: string;
  detail?: string;
}

export interface ConstraintValidationResult {
  pass: boolean;
  violations: ViolationDetail[];
  warnings: string[];
  layers: Record<string, LayerCheckDetail>;
}