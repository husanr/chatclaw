// ============================================
// Anthropic Claude LLM 提供者实现
// ============================================
//
// 🧠 原理讲解：
// Claude 的 Tool Use 机制与 OpenAI 类似，但有区别：
// 1. Claude 使用 "tool_use" 和 "tool_result" 消息类型
// 2. 工具定义放在顶层 tools 参数
// 3. Claude 返回 content 数组，包含 text 和 tool_use 块
// 4. 我们需要解析 content 数组来提取工具调用
//
// ============================================

import Anthropic from '@anthropic-ai/sdk';
import { Message, ToolDefinition, ToolCall, LLMProvider } from '@/types';

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  // 普通对话
  async chat(messages: Message[]): Promise<string> {
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemMessage?.content || undefined,
      messages: otherMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content || '',
      })),
    });

    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  // 带工具的对话
  async chatWithTools(
    messages: Message[],
    tools: ToolDefinition[]
  ): Promise<{ content: string | null; toolCalls: ToolCall[] }> {

    // 转换为 Claude 工具格式
    const claudeTools = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));

    // 分离系统消息
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    // 转换消息格式（Claude 的格式略有不同）
    const claudeMessages = this.convertMessages(otherMessages);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemMessage?.content || undefined,
      messages: claudeMessages,
      tools: claudeTools.length > 0 ? claudeTools : undefined,
    });

    // 解析响应
    let content: string | null = null;
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content = block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          args: block.input as Record<string, any>,
        });
      }
    }

    return { content, toolCalls };
  }

  // 转换消息格式为 Claude 格式
  private convertMessages(messages: Message[]): any[] {
    const result: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'tool') {
        // 工具结果需要特殊处理
        result.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.toolCallId,
            content: msg.content,
          }],
        });
      } else if (msg.toolCalls && msg.toolCalls.length > 0) {
        // 包含工具调用的助手消息
        const content = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.args,
          });
        }
        result.push({ role: 'assistant', content });
      } else {
        result.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content || '',
        });
      }
    }

    return result;
  }

  // 流式对话
  async *streamChat(messages: Message[]): AsyncIterable<string> {
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      system: systemMessage?.content || undefined,
      messages: otherMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content || '',
      })),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}
