// ============================================
// 通用 OpenAI 兼容 LLM 提供者（支持 DeepSeek 思考模式）
// ============================================
//
// 🧠 原理讲解：
// DeepSeek V4 支持思考模式（Thinking Mode）：
// 1. 通过 extra_body 传入 thinking 参数启用
// 2. reasoning_effort 控制思考强度（high/max）
// 3. 返回 reasoning_content（思维链）和 content（最终答案）
// 4. 流式输出时，delta.reasoning_content 用于思维链
//
// 参考文档: https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
//
// ============================================

import OpenAI from 'openai';
import { Message, ToolDefinition, ToolCall, LLMProvider } from '@/types';
import { withRetry } from './retry';

// 自定义模型配置
export interface CustomModelConfig {
  name: string;           // 模型显示名称
  provider: string;       // 提供者名称
  baseURL: string;        // API 基础地址
  model: string;          // 模型 ID
  apiKey: string;         // API Key
  maxTokens?: number;     // 最大 token 数
  supportsTools?: boolean; // 是否支持工具调用
  supportsThinking?: boolean; // 是否支持思考模式
}

export class CustomLLMProvider implements LLMProvider {
  private client: OpenAI;
  private config: CustomModelConfig;

  constructor(config: CustomModelConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }

  // 普通对话
  async chat(messages: Message[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages: messages.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content || '',
      })),
      max_tokens: this.config.maxTokens || 4096,
    });

    return response.choices[0].message.content || '';
  }

  // 带工具的对话（支持 DeepSeek 思考模式）
  async chatWithTools(
    messages: Message[],
    tools: ToolDefinition[]
  ): Promise<{ content: string | null; toolCalls: ToolCall[]; reasoningContent?: string }> {

    // 如果模型不支持工具，降级为普通对话
    if (!this.config.supportsTools) {
      const content = await this.chat(messages);
      return { content, toolCalls: [] };
    }

    // 将工具定义转换为 OpenAI 格式
    const openaiTools = tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    // 构建请求参数
    const requestParams: any = {
      model: this.config.model,
      messages: messages.map(m => {
        const msg: any = {
          role: m.role,
          content: m.content,
        };

        // 如果有工具调用，添加到消息中
        if (m.toolCalls && m.toolCalls.length > 0) {
          msg.tool_calls = m.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args),
            },
          }));
        }

        // 如果是工具执行结果，添加 tool_call_id
        if (m.toolCallId) {
          msg.tool_call_id = m.toolCallId;
        }

        // 如果有 reasoning_content，添加到消息中（DeepSeek 思考模式需要）
        if (m.reasoningContent) {
          msg.reasoning_content = m.reasoningContent;
        }

        return msg;
      }),
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      tool_choice: openaiTools.length > 0 ? 'auto' : undefined,
      max_tokens: this.config.maxTokens || 4096,
    };

    // 如果支持思考模式，添加 thinking 参数
    if (this.config.supportsThinking) {
      requestParams.reasoning_effort = 'high';
      requestParams.extra_body = {
        thinking: { type: 'enabled' }
      };
    }

    const response = await this.client.chat.completions.create(requestParams);

    const choice = response.choices[0];
    const message = choice.message;

    // 解析工具调用（参数 JSON 解析失败时回退 `{}`，交给上层校验/自我纠错）
    const toolCalls: ToolCall[] = (message.tool_calls || [])
      .filter(tc => tc.type === 'function')
      .map(tc => ({
        id: tc.id,
        name: (tc as any).function.name,
        args: (() => { try { return JSON.parse((tc as any).function.arguments); } catch { return {}; } })(),
      }));

    // 获取 reasoning_content（DeepSeek 思考模式）
    const reasoningContent = (message as any).reasoning_content || undefined;

    return {
      content: message.content,
      toolCalls,
      reasoningContent,
    };
  }

  // 流式对话（支持 DeepSeek 思考模式）
  // 使用 fetch 直接实现，参考 DeepSeek 官方 demo
  async *streamChat(messages: Message[]): AsyncIterable<{ type: 'reasoning' | 'content'; text: string }> {
    // 构建请求体
    const body: any = {
      model: this.config.model,
      messages: messages.map(m => {
        const msg: any = {
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content || '',
        };
        // 如果有 reasoning_content，添加到消息中
        if (m.reasoningContent) {
          msg.reasoning_content = m.reasoningContent;
        }
        return msg;
      }),
      max_tokens: this.config.maxTokens || 4096,
      stream: true,
    };

    // 如果支持思考模式，添加 thinking 参数
    if (this.config.supportsThinking) {
      body.reasoning_effort = 'high';
      body.extra_body = {
        thinking: { type: 'enabled' }
      };
    }

    // 使用 fetch 直接调用 API（带指数退避重试，只在开始流式前重试）
    const response = await withRetry(async () => {
      const res = await fetch(`${this.config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = new Error(`API request failed: ${res.status} ${res.statusText}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return res;
    }, {
      onRetry: (attempt, err) => console.log(`[LLM] streamChat 重试 #${attempt}: ${err instanceof Error ? err.message : err}`),
    });

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;

          // DeepSeek 思考模式 - 思维链内容
          if (delta.reasoning_content) {
            yield { type: 'reasoning', text: delta.reasoning_content };
          }
          // 最终答案内容
          else if (delta.content) {
            yield { type: 'content', text: delta.content };
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  }

  // 获取配置信息
  getConfig(): CustomModelConfig {
    return this.config;
  }

  // 带工具的流式对话（核心：边收 token 边解析 tool_calls）
  async *chatWithToolsStream(
    messages: Message[],
    tools: ToolDefinition[],
  ): AsyncIterable<import('@/types').ChatStreamEvent> {
    // 如果模型不支持工具，降级为普通流式
    if (!this.config.supportsTools) {
      let content = '';
      for await (const chunk of this.streamChat(messages)) {
        const text = typeof chunk === 'object' ? chunk.text : chunk;
        content += text;
        yield { type: 'token', text };
      }
      yield { type: 'done', content, toolCalls: [] };
      return;
    }

    const openaiTools = tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    // 构建请求消息（和 chatWithTools 一样处理 tool call / tool result / reasoning）
    const requestMessages = messages.map(m => {
      const msg: any = { role: m.role, content: m.content };
      if (m.toolCalls && m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        }));
      }
      if (m.toolCallId) msg.tool_call_id = m.toolCallId;
      if (m.reasoningContent) msg.reasoning_content = m.reasoningContent;
      return msg;
    });

    const body: any = {
      model: this.config.model,
      messages: requestMessages,
      tools: openaiTools,
      tool_choice: 'auto',
      max_tokens: this.config.maxTokens || 4096,
      stream: true,
    };

    if (this.config.supportsThinking) {
      body.reasoning_effort = 'high';
      body.extra_body = { thinking: { type: 'enabled' } };
    }

    // 带指数退避重试，只在开始流式前重试（避免重复推送已流出的 token）
    const response = await withRetry(async () => {
      const res = await fetch(`${this.config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const err = new Error(`API request failed: ${res.status} ${res.statusText} ${errText}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return res;
    }, {
      onRetry: (attempt, err) => console.log(`[LLM] chatWithToolsStream 重试 #${attempt}: ${err instanceof Error ? err.message : err}`),
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    // 累积变量
    let fullContent = '';
    let fullReasoning = '';
    // tool call 累积：按 index 存储
    const toolCallChunks: Record<number, { id: string; name: string; arguments: string }> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') break;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;

          // reasoning（DeepSeek 思考模式）
          if (delta.reasoning_content) {
            fullReasoning += delta.reasoning_content;
            yield { type: 'reasoning', text: delta.reasoning_content };
          }

          // 普通文本 token
          if (delta.content) {
            fullContent += delta.content;
            yield { type: 'token', text: delta.content };
          }

          // tool_calls 流式累积
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallChunks[idx]) {
                toolCallChunks[idx] = { id: '', name: '', arguments: '' };
              }
              if (tc.id) toolCallChunks[idx].id = tc.id;
              if (tc.function?.name) toolCallChunks[idx].name = tc.function.name;
              if (tc.function?.arguments) toolCallChunks[idx].arguments += tc.function.arguments;
            }
          }
        } catch {
          // 忽略 JSON 解析错误（可能是不完整的 chunk）
        }
      }
    }

    // 流结束：解析累积的 tool calls
    const toolCalls: import('@/types').ToolCall[] = Object.values(toolCallChunks)
      .filter(tc => tc.name && tc.id)
      .map(tc => ({
        id: tc.id,
        name: tc.name,
        args: (() => { try { return JSON.parse(tc.arguments); } catch { return {}; } })(),
      }));

    yield {
      type: 'done',
      content: fullContent || null,
      toolCalls,
      reasoningContent: fullReasoning || undefined,
    };
  }
}
