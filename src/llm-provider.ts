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

  private mockContinue(_context?: string): string {
    return (
      '\n\n他沉默了片刻，指尖无意识地摩挲着袖口磨损的边缘。窗外的风声似乎远了一些，' +
      '又似乎更近了。那种从骨头缝里渗出来的凉意再次爬上后颈，他下意识地收紧了肩膀。\n\n' +
      '"继续。"他说，声音比他预想的要平稳。\n\n' +
      '没有人回答。只有铜碗里的水微微晃了一下，映出壁上那道暗金色的纹路，像一条沉睡的血管。'
    );
  }

  private mockRewrite(selectedText: string): string {
    return selectedText.replace(/很/g, '').replace(/非常/g, '');
  }

  async chat(request: LLMRequest): Promise<{ content: string; usage?: LLMUsage }> {
    const lastMsg = request.messages[request.messages.length - 1]?.content ?? '';
    let content = '';

    if (lastMsg.includes('续写') || lastMsg.includes('continue')) {
      content = this.mockContinue();
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
      content = '（Mock Provider：请配置真实API Key以获得AI输出）';
    }

    return {
      content,
      usage: { promptTokens: 200, completionTokens: content.length, totalTokens: 200 + content.length },
    };
  }

  async stream(request: LLMRequest, callbacks: StreamCallbacks): Promise<void> {
    const { content } = await this.chat(request);
    // 模拟流式：逐字输出
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
