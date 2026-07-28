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
        if ((m as any).reasoningContent) {
          msg.reasoning_content = (m as any).reasoningContent;
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

    // 解析工具调用
    const toolCalls: ToolCall[] = (message.tool_calls || [])
      .filter(tc => tc.type === 'function')
      .map(tc => ({
        id: tc.id,
        name: (tc as any).function.name,
        args: JSON.parse((tc as any).function.arguments),
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
  async *streamChat(messages: Message[]): AsyncIterable<{ type: 'reasoning' | 'content'; text: string }> {
    // 构建请求参数
    const requestParams: any = {
      model: this.config.model,
      messages: messages.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content || '',
      })),
      max_tokens: this.config.maxTokens || 4096,
      stream: true,
    };

    // 如果支持思考模式，添加 thinking 参数
    if (this.config.supportsThinking) {
      requestParams.reasoning_effort = 'high';
      requestParams.extra_body = {
        thinking: { type: 'enabled' }
      };
    }

    const stream = await this.client.chat.completions.create(requestParams) as any;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // 思维链内容（DeepSeek 思考模式）
      if ((delta as any)?.reasoning_content) {
        yield { type: 'reasoning', text: (delta as any).reasoning_content };
      }

      // 最终答案内容
      if (delta?.content) {
        yield { type: 'content', text: delta.content };
      }
    }
  }

  // 获取配置信息
  getConfig(): CustomModelConfig {
    return this.config;
  }
}
