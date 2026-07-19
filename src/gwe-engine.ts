// ============================================================
// GWE V2.0 - 通用网文引擎主类 (GWEEngine)
// 节点化架构 Facade 门面
// ============================================================

import type {
  NodeId,
  OptionId,
  NodeOptionKB,
  Preset,
  EngineConfig,
  UserOverrides,
  WritingContext,
  CheckResult,
  ValidationResult,
  LLMProvider,
  ChatMessage,
  LLMUsage,
  StreamCallbacks,
  EngineEventType,
  EngineEvent,
  EngineEventListener,
  MergedConfig,
  NodeDefinition,
  CustomRule,
  Thresholds,
} from './types';

import * as registry from './node-registry';
import { mergeConfig } from './config-merger';
import { validate } from './validator';
import { check } from './checker';
import { buildSystemPrompt, buildUserMessage } from './prompt-builder';
import { MockProvider } from './llm-provider';

// ============================================================
// GWEEngine 主类
// ============================================================

export type TaskType =
  | 'continue'
  | 'rewrite'
  | 'review'
  | 'polish'
  | 'expand'
  | 'compress'
  | 'outline'
  | 'dialog'
  | 'generate';

export interface NodeCatalog {
  nodes: NodeDefinition[];
  presets: Preset[];
}

export class GWEEngine {
  private config: EngineConfig;
  private merged: MergedConfig | null = null;
  private llmProvider: LLMProvider;
  private loadedOptions: Map<OptionId, NodeOptionKB> = new Map();
  private presets: Map<string, Preset> = new Map();
  private listeners: Map<EngineEventType, Set<EngineEventListener>> = new Map();
  private context: WritingContext | null = null;
  private customNodes: NodeDefinition[] = [];
  private basePrompt: string = '';
  private baseVocab: NonNullable<NodeOptionKB['vocabulary']>['add'] | null = null;
  private userPresets: Map<string, Preset> = new Map();

  constructor(provider?: LLMProvider) {
    this.llmProvider = provider ?? new MockProvider();
    this.config = {
      presetId: null,
      selections: { ...registry.getDefaultSelectionsFull() },
      userOverrides: {},
    };
    // 加载用户保存的自定义预设
    this.loadUserPresetsFromStorage();
  }

  // ============================================================
  // 配置加载
  // ============================================================

  /**
   * 从KB数据加载节点选项（.kb.json文件内容）
   */
  loadNodeOption(kb: NodeOptionKB): void {
    registry.registerNodeOption(kb);
    this.loadedOptions.set(kb.option_id, kb);
  }

  /**
   * 批量加载节点选项
   */
  loadNodeOptions(kbs: NodeOptionKB[]): void {
    for (const kb of kbs) {
      this.loadNodeOption(kb);
    }
  }

  /**
   * 注册预设包
   */
  registerPreset(preset: Preset): void {
    this.presets.set(preset.preset_id, preset);
  }

  /**
   * 设置基础提示词（base-prompt.md内容）
   */
  setBasePrompt(prompt: string): void {
    this.basePrompt = prompt;
  }

  /**
   * 设置基础词库（base-vocab.json内容）
   */
  setBaseVocab(vocab: NonNullable<NodeOptionKB['vocabulary']>['add']): void {
    this.baseVocab = vocab;
    this.merged = null;
  }

  /**
   * 设置LLM Provider
   */
  setLLMProvider(provider: LLMProvider): void {
    this.llmProvider = provider;
  }

  /**
   * 注册自定义节点
   */
  registerCustomNode(nodeDef: NodeDefinition): void {
    registry.registerNode(nodeDef);
    this.customNodes.push(nodeDef);
  }

  /**
   * 注册自定义规则
   */
  addCustomRule(rule: CustomRule): void {
    if (!this.config.userOverrides.rules) {
      this.config.userOverrides.rules = [];
    }
    this.config.userOverrides.rules.push(rule);
    this.merged = null; // 重新合并
  }

  // ============================================================
  // 配置操作
  // ============================================================

  /**
   * 加载预设包（一键配置所有节点）
   */
  loadPreset(presetId: string): void {
    // 先从内置预设查找，再从用户自定义预设查找
    let preset = this.presets.get(presetId);
    if (!preset) {
      preset = this.userPresets.get(presetId);
    }
    if (!preset) {
      throw new Error(`[GWE] 预设包 "${presetId}" 未注册`);
    }
    // 用预设的selections覆盖
    this.config.selections = {
      ...registry.getDefaultSelectionsFull(),
      ...preset.selections,
    };
    this.config.presetId = presetId;
    this.config.userOverrides = {};
    this.merged = null;
    this.emit('preset:loaded', { presetId, preset });
    this.emit('config:changed', { presetId });
  }

  /**
   * 设置单个节点的选项
   */
  setNodeOption(nodeId: NodeId, optionId: OptionId): void {
    const node = registry.getNode(nodeId);
    if (!node) {
      throw new Error(`[GWE] 节点 "${nodeId}" 不存在`);
    }
    this.config.selections[nodeId] = optionId;
    this.config.presetId = null; // 修改任意节点后变为自定义状态
    this.merged = null;
    this.emit('config:changed', { nodeId, optionId });
  }

  /**
   * 批量设置节点选项
   */
  setNodeOptions(selections: Partial<Record<NodeId, OptionId>>): void {
    for (const [nodeId, optionId] of Object.entries(selections)) {
      if (optionId) {
        this.config.selections[nodeId as NodeId] = optionId;
      }
    }
    this.config.presetId = null;
    this.merged = null;
    this.emit('config:changed', { selections });
  }

  /**
   * 应用用户自定义覆盖
   */
  applyUserOverrides(overrides: UserOverrides): void {
    this.config.userOverrides = {
      ...this.config.userOverrides,
      ...overrides,
      // 词库和规则数组合并
      vocab: overrides.vocab
        ? {
            add: {
              ...this.config.userOverrides.vocab?.add,
              ...overrides.vocab.add,
            },
            remove: [
              ...(this.config.userOverrides.vocab?.remove ?? []),
              ...(overrides.vocab.remove ?? []),
            ],
          }
        : this.config.userOverrides.vocab,
      rules: [
        ...(this.config.userOverrides.rules ?? []),
        ...(overrides.rules ?? []),
      ],
    };
    this.merged = null;
    this.emit('config:changed', { overrides: true });
  }

  /**
   * 清除所有用户自定义覆盖（恢复到纯节点+预设状态）
   */
  clearUserOverrides(): void {
    this.config.userOverrides = {};
    this.merged = null;
    this.emit('config:changed', { overridesCleared: true });
  }

  /**
   * 重置用户自定义词库（用于面板重新输入词库时替换而非追加）
   */
  setUserVocab(vocab: NonNullable<UserOverrides['vocab']>): void {
    if (!this.config.userOverrides.vocab) {
      this.config.userOverrides.vocab = { add: {}, remove: [] };
    }
    this.config.userOverrides.vocab = {
      add: { ...vocab.add },
      remove: vocab.remove ? [...vocab.remove] : [],
    };
    this.merged = null;
    this.emit('config:changed', { vocabSet: true });
  }

  /**
   * 重置用户自定义阈值（替换而非合并）
   */
  setUserThresholds(thresholds: Partial<Thresholds>): void {
    this.config.userOverrides.thresholds = { ...thresholds };
    this.merged = null;
    this.emit('config:changed', { thresholdsSet: true });
  }

  /**
   * 清除用户自定义阈值（恢复预设/节点默认）
   */
  clearUserThresholds(): void {
    if (this.config.userOverrides.thresholds) {
      this.config.userOverrides.thresholds = undefined;
      this.merged = null;
      this.emit('config:changed', { thresholdsCleared: true });
    }
  }

  /**
   * 设置用户自由文本自定义规则（直接注入system prompt）
   */
  setCustomPromptText(text: string): void {
    this.config.userOverrides.prompt = text.trim() || undefined;
    this.merged = null;
    this.emit('config:changed', { customPromptSet: true });
  }

  /**
   * 获取用户自由文本自定义规则
   */
  getCustomPromptText(): string {
    return this.config.userOverrides.prompt || '';
  }

  /**
   * 获取当前引擎配置（可序列化）
   */
  getConfig(): EngineConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * 加载引擎配置（从保存的文件恢复）
   */
  loadConfig(config: EngineConfig): void {
    this.config = JSON.parse(JSON.stringify(config));
    this.merged = null;
    this.emit('config:changed', { loaded: true });
  }

  /**
   * 验证当前配置（冲突/依赖检测）
   */
  validateConfig(): ValidationResult {
    const result = validate(this.config.selections, this.loadedOptions);
    this.emit('config:validated', result);
    return result;
  }

  // ============================================================
  // 核心功能
  // ============================================================

  /**
   * 设置写作上下文（书籍/角色/章节等数据）
   */
  setContext(context: WritingContext): void {
    this.context = context;
  }

  /**
   * 运行文本检测（审稿核心）
   */
  check(text: string, context?: WritingContext): CheckResult {
    const merged = this.ensureMerged();
    const ctx = context ?? this.context ?? null;
    const result = check(text, ctx, merged);
    this.emit('check:done', result);
    return result;
  }

  /**
   * 构建AI系统提示词
   */
  getSystemPrompt(task: TaskType, context?: WritingContext): string {
    const merged = this.ensureMerged();
    const ctx = context ?? this.context;
    if (!ctx) {
      throw new Error('[GWE] 未设置写作上下文，请先调用setContext()');
    }
    const preset = this.config.presetId
      ? this.presets.get(this.config.presetId) ?? null
      : null;
    return buildSystemPrompt({
      task,
      context: ctx,
      mergedConfig: merged,
      preset,
      selections: this.config.selections,
      basePrompt: this.basePrompt || undefined,
      userCustomPrompt: this.config.userOverrides.prompt,
    });
  }

  /**
   * 构建AI用户消息
   */
  getUserMessage(task: TaskType, context?: WritingContext, params?: Record<string, unknown>): string {
    const ctx = context ?? this.context;
    if (!ctx) {
      throw new Error('[GWE] 未设置写作上下文，请先调用setContext()');
    }
    return buildUserMessage({ task, context: ctx, params });
  }

  // ============================================================
  // AI 调用（流式/非流式）
  // ============================================================

  /**
   * 非流式AI调用（审稿/大纲等不需要实时输出的场景）
   */
  async callAI(task: TaskType, params?: Record<string, unknown>): Promise<{
    content: string;
    usage?: LLMUsage;
    checkResult?: CheckResult;
  }> {
    if (!this.context) {
      throw new Error('[GWE] 未设置写作上下文');
    }
    const merged = this.ensureMerged();
    const preset = this.config.presetId
      ? this.presets.get(this.config.presetId) ?? null
      : null;
    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt({
        task,
        context: this.context,
        mergedConfig: merged,
        preset,
        selections: this.config.selections,
        basePrompt: this.basePrompt || undefined,
        userCustomPrompt: this.config.userOverrides.prompt,
      }) },
      { role: 'user', content: buildUserMessage({ task, context: this.context, params }) },
    ];

    const temperature = this.getTemperature();

    const result = await this.llmProvider.chat({
      messages,
      temperature,
    });

    // 对续写/改写/生成结果做本地规则检查
    let checkResult: CheckResult | undefined;
    if (task === 'continue' || task === 'rewrite' || task === 'polish' || task === 'expand' || task === 'generate') {
      checkResult = this.check(result.content, this.context);
    }

    this.emit('ai:done', { task, content: result.content, usage: result.usage });
    return { ...result, checkResult };
  }

  /**
   * 流式AI调用（续写/润色等实时输出场景）
   */
  async streamAI(
    task: TaskType,
    callbacks: StreamCallbacks,
    params?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.context) {
      callbacks.onError(new Error('[GWE] 未设置写作上下文'));
      return;
    }
    const merged = this.ensureMerged();
    const preset = this.config.presetId
      ? this.presets.get(this.config.presetId) ?? null
      : null;
    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt({
        task,
        context: this.context,
        mergedConfig: merged,
        preset,
        selections: this.config.selections,
        basePrompt: this.basePrompt || undefined,
        userCustomPrompt: this.config.userOverrides.prompt,
      }) },
      { role: 'user', content: buildUserMessage({ task, context: this.context, params }) },
    ];

    const temperature = this.getTemperature();

    await this.llmProvider.stream(
      { messages, temperature },
      {
        onToken: (delta) => {
          callbacks.onToken(delta);
          this.emit('ai:token', { delta, task });
        },
        onDone: (full, usage) => {
          callbacks.onDone(full, usage);
          this.emit('ai:done', { task, content: full, usage });
        },
        onError: (err) => {
          this.emit('ai:error', { error: err, task });
          callbacks.onError(err);
        },
      },
    );
  }

  // 便捷方法

  /** 流式续写 */
  async continueWrite(callbacks: StreamCallbacks): Promise<void> {
    return this.streamAI('continue', callbacks);
  }

  /** 流式改写选中文本 */
  async rewriteSelection(callbacks: StreamCallbacks, selectedText: string): Promise<void> {
    return this.streamAI('rewrite', callbacks, { selectedText });
  }

  /** 审稿（非流式，返回检测结果+AI建议） */
  async review(): Promise<CheckResult> {
    if (!this.context) throw new Error('[GWE] 未设置写作上下文');
    const chapter = this.context.chapters.find(
      (c) => c.id === this.context!.currentChapterId,
    );
    if (!chapter) throw new Error('[GWE] 当前章节不存在');
    return this.check(chapter.content, this.context);
  }

  /** 润色（流式） */
  async polishSelection(callbacks: StreamCallbacks, selectedText: string): Promise<void> {
    return this.streamAI('polish', callbacks, { selectedText });
  }

  /** 扩写（流式） */
  async expandSelection(callbacks: StreamCallbacks, selectedText: string): Promise<void> {
    return this.streamAI('expand', callbacks, { selectedText });
  }

  /** 缩写（非流式） */
  async compressSelection(selectedText: string): Promise<string> {
    const result = await this.callAI('compress', { selectedText });
    return result.content;
  }

  // ============================================================
  // 节点目录查询（给UI展示用）
  // ============================================================

  /**
   * 获取所有可用节点和预设列表
   */
  getNodeCatalog(): NodeCatalog {
    // 合并内置预设和用户自定义预设
    const allPresets = [
      ...Array.from(this.presets.values()),
      ...Array.from(this.userPresets.values()),
    ];
    return {
      nodes: registry.getAllNodes(),
      presets: allPresets,
    };
  }

  /**
   * 保存当前配置为用户自定义预设
   */
  saveUserPreset(name: string, description?: string): string {
    const presetId = `user_${Date.now()}`;
    const preset: Preset = {
      preset_id: presetId,
      preset_name: name,
      preset_description: description || '用户自定义预设',
      based_on: this.config.presetId,
      selections: { ...this.config.selections },
      // 保存当前自定义词库
      extra_vocab: this.config.userOverrides.vocab
        ? {
            add: { ...this.config.userOverrides.vocab.add },
            remove: this.config.userOverrides.vocab.remove ? [...this.config.userOverrides.vocab.remove] : [],
          }
        : undefined,
      // 保存当前自定义追加提示词
      extra_prompt: this.config.userOverrides.prompt,
      // 保存当前自定义阈值
      threshold_overrides: this.config.userOverrides.thresholds
        ? { ...this.config.userOverrides.thresholds }
        : undefined,
    };
    this.userPresets.set(presetId, preset);
    this.saveUserPresetsToStorage();
    this.emit('preset:saved', { presetId, preset });
    return presetId;
  }

  /**
   * 删除用户自定义预设
   */
  deleteUserPreset(presetId: string): boolean {
    if (!presetId.startsWith('user_')) return false;
    const deleted = this.userPresets.delete(presetId);
    if (deleted) {
      this.saveUserPresetsToStorage();
      this.emit('preset:deleted', { presetId });
    }
    return deleted;
  }

  /**
   * 从localStorage加载用户预设
   */
  private loadUserPresetsFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('gwe_user_presets');
      if (stored) {
        const presets = JSON.parse(stored) as Preset[];
        for (const p of presets) {
          this.userPresets.set(p.preset_id, p);
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  /**
   * 保存用户预设到localStorage
   */
  private saveUserPresetsToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const data = Array.from(this.userPresets.values());
      localStorage.setItem('gwe_user_presets', JSON.stringify(data));
    } catch {
      // ignore storage errors
    }
  }

  /**
   * 获取某个节点的已加载选项
   */
  getNodeOptions(nodeId: NodeId): NodeOptionKB[] {
    const node = registry.getNode(nodeId);
    if (!node) return [];
    return node.options
      .map((oid) => this.loadedOptions.get(oid))
      .filter((kb): kb is NodeOptionKB => kb !== undefined);
  }

  /**
   * 获取单个选项的完整KB数据（包含描述、示例、约束等）
   */
  getOption(optionId: OptionId): NodeOptionKB | undefined {
    return this.loadedOptions.get(optionId);
  }

  /**
   * 获取当前合并后的运行时配置（用于调试/UI显示）
   */
  getMergedConfig(): MergedConfig | null {
    return this.ensureMerged();
  }

  /**
   * 同步获取当前合并后的运行时配置（别名，UI用）
   */
  getMergedConfigSync(): MergedConfig | null {
    return this.ensureMerged();
  }

  /**
   * 获取所有预设（内置+用户自定义）
   */
  getPresets(): Preset[] {
    const all: Preset[] = [];
    for (const p of this.presets.values()) all.push(p);
    for (const p of this.userPresets.values()) all.push(p);
    return all;
  }

  /**
   * 保存当前配置为预设（UI友好的别名，对应saveUserPreset）
   */
  saveAsPreset(opts: { preset_name: string; description?: string; tags?: string[] }): string {
    return this.saveUserPreset(opts.preset_name, opts.description);
  }

  /**
   * 获取当前配置的简短文字摘要（用于注入到对话AI的system prompt中，轻量不占token）
   */
  getConfigSummary(): string {
    const merged = this.ensureMerged();
    if (!merged) return '';

    const lines: string[] = [];

    // 当前预设
    if (this.config.presetId) {
      const preset = this.presets.get(this.config.presetId);
      if (preset) {
        lines.push(`- 当前预设：${preset.preset_name}`);
      }
    } else {
      lines.push('- 当前预设：自定义配置');
    }

    // 核心风格节点（只列关键的几个，避免过长）
    const keyNodes: NodeId[] = [
      'node_sentence_rhythm',
      'node_paragraph_density',
      'node_dialogue_style',
      'node_description_style',
      'node_emotion_style',
      'node_tone',
      'node_pov',
    ];
    for (const nodeId of keyNodes) {
      const optId = this.config.selections[nodeId];
      if (!optId) continue;
      const kb = this.loadedOptions.get(optId);
      if (kb) {
        const nodeDef = registry.getNode(nodeId);
        lines.push(`- ${nodeDef?.name || nodeId}：${kb.option_name}`);
      }
    }

    // 阈值（只显示关键几个）
    const t = merged.thresholds;
    if (t) {
      lines.push(`- 段落目标：${t.targetParagraphLength}字/段，单段≤${t.maxParagraphLength}字`);
      lines.push(`- 连续对话：≤${t.maxDialogueContinuous}句无动作穿插`);
    }

    // 自定义词库（只显示数量）
    const v = merged.vocabulary;
    if (v) {
      if (v.worldTerms.size > 0) lines.push(`- 专属术语：${v.worldTerms.size}个`);
      if (v.fillerPatterns.size > 0) lines.push(`- 禁用/警惕填充词：${v.fillerPatterns.size}个`);
    }

    return lines.join('\n');
  }

  // ============================================================
  // 事件系统
  // ============================================================

  on(event: EngineEventType, listener: EngineEventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off(event: EngineEventType, listener: EngineEventListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: EngineEventType, payload?: unknown): void {
    const evt: EngineEvent = { type: event, payload };
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(evt);
      } catch (e) {
        console.error('[GWE] Event listener error:', e);
      }
    });
  }

  // ============================================================
  // 内部方法
  // ============================================================

  private ensureMerged(): MergedConfig {
    if (this.merged) return this.merged;

    const preset = this.config.presetId
      ? this.presets.get(this.config.presetId)
      : undefined;

    this.merged = mergeConfig({
      selections: this.config.selections,
      loadedOptions: this.loadedOptions,
      preset: preset ?? null,
      userOverrides: this.config.userOverrides,
      baseVocabOverride: this.baseVocab,
    });
    return this.merged;
  }

  private getTemperature(): number {
    const optId = this.config.selections['node_ai_creativity'];
    const kb = this.loadedOptions.get(optId);
    // 根据AI创造性节点返回temperature
    if (optId === 'opt_ai_conservative' || kb?.option_id === 'opt_ai_conservative') return 0.3;
    if (optId === 'opt_ai_adventurous' || kb?.option_id === 'opt_ai_adventurous') return 1.0;
    return 0.7;
  }
}
