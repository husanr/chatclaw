// ============================================
// 通用 OpenAI 兼容 LLM 提供者
// ============================================
//
// 🧠 原理讲解：
// DeepSeek、Moonshot、Qwen、GLM 等国产大模型
// 都兼容 OpenAI API 格式，只需要：
// 1. 不同的 baseURL（API 地址）
// 2. 不同的 API Key
// 3. 不同的模型名称
//
// 这个通用提供者可以支持所有 OpenAI 兼容的 API
//
// ============================================

import OpenAI from 'openai';
import { Message, ToolDefinition, ToolCall, LLMProvider } from '@/types';

// 自定义模型配置
export interface CustomModelConfig {
  name: string;           // 模型显示名称
  provider: string;       // 提供者名称
  baseURL: string;        // API 基础地址
  model: string;          // 模型 ID
  apiKey: string;         // API Key
  maxTokens?: number;     // 最大 token 数
  supportsTools?: boolean; // 是否支持工具调用
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

  // 带工具的对话
  async chatWithTools(
    messages: Message[],
    tools: ToolDefinition[]
  ): Promise<{ content: string | null; toolCalls: ToolCall[] }> {

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

    const response = await this.client.chat.completions.create({
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

        return msg;
      }),
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      tool_choice: openaiTools.length > 0 ? 'auto' : undefined,
      max_tokens: this.config.maxTokens || 4096,
    });

    const choice = response.choices[0];
    const message = choice.message;

    // 解析工具调用
    const toolCalls: ToolCall[] = (message.tool_calls || [])
      .filter(tc => tc.type === 'function')
      .map(tc => ({
        id: tc.id,
        name: (tc as any).function.name,
        args: JSON.parse((tc as any).function.arguments),
      }));

    return {
      content: message.content,
      toolCalls,
    };
  }

  // 流式对话
  async *streamChat(messages: Message[]): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.config.model,
      messages: messages.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content || '',
      })),
      max_tokens: this.config.maxTokens || 4096,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  // 获取配置信息
  getConfig(): CustomModelConfig {
    return this.config;
  }
}
