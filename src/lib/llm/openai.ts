// ============================================
// OpenAI LLM 提供者实现
// ============================================
//
// 🧠 原理讲解：
// OpenAI 的 Function Calling 机制：
// 1. 我们在请求中传入 tools 定义（JSON Schema 格式）
// 2. LLM 分析用户意图，决定是否需要调用工具
// 3. 如果需要，LLM 返回 tool_calls（工具名 + 参数）
// 4. 我们执行工具，把结果传回 LLM
// 5. LLM 继续推理或返回最终答案
//
// ============================================

import OpenAI from 'openai';
import { Message, ToolDefinition, ToolCall, LLMProvider } from '@/types';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  // 普通对话（不带工具）
  async chat(messages: Message[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content || '',
      })),
    });

    return response.choices[0].message.content || '';
  }

  // 带工具的对话（Agent 核心方法）
  async chatWithTools(
    messages: Message[],
    tools: ToolDefinition[]
  ): Promise<{ content: string | null; toolCalls: ToolCall[] }> {

    // 将我们的工具定义转换为 OpenAI 格式
    const openaiTools = tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    const response = await this.client.chat.completions.create({
      model: this.model,
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

  // 流式对话（实时输出）
  async *streamChat(messages: Message[]): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content || '',
      })),
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}
