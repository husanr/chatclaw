// ============================================
// AI Agent 核心实现（ReAct 模式 + DeepSeek 思考模式）
// ============================================
//
// 🧠 原理讲解：
//
// 这是整个项目的核心！Agent 的工作流程：
//
// 1. 用户输入目标
// 2. Agent 开始 ReAct 循环：
//    - Reasoning（思考）: LLM 分析当前状态，决定下一步
//    - Acting（行动）: 调用工具执行操作
//    - Observing（观察）: 获取工具执行结果
// 3. 重复直到任务完成或达到最大迭代次数
// 4. 返回最终结果（流式输出）
//
// DeepSeek 思考模式：
// - 思维链内容通过 reasoning_content 返回
// - 流式输出时，delta.reasoning_content 用于思维链
// - 工具调用时，reasoning_content 必须在后续请求中回传
//
// ============================================

import { Message, ToolCall, AgentConfig, LLMProvider } from '@/types';
import { toolRegistry } from '../tools/base';

export class Agent {
  private llm: LLMProvider;
  private config: AgentConfig;
  private messages: Message[] = [];

  constructor(llm: LLMProvider, config: AgentConfig) {
    this.llm = llm;
    this.config = config;

    // 初始化系统提示词
    this.messages.push({
      role: 'system',
      content: this.getSystemPrompt(),
    });
  }

  // 系统提示词 - 定义 Agent 的行为
  private getSystemPrompt(): string {
    return `你是一个智能助手（AI Agent），能够使用各种工具来帮助用户完成任务。

## 你的能力
你可以使用以下工具：
- web_search: 搜索网页获取最新信息
- calculator: 执行数学计算
- code_executor: 执行 JavaScript 代码
- file_operations: 文件读写操作
- database_query: 数据库查询
- api_caller: 调用外部 API
- email_sender: 发送邮件
- image_generator: 根据描述生成图片

## 工作流程（ReAct 模式）
1. 仔细分析用户的请求（Reasoning - 思考）
2. 决定需要使用哪些工具（Acting - 行动）
3. 获取工具执行结果（Observing - 观察）
4. 继续思考或返回最终答案

## 重要原则
- 如果不确定，先搜索再回答
- 复杂任务要分解成多个步骤
- 每次只调用必要的工具
- 遇到错误要尝试其他方法
- 最终要给出清晰、有用的回答
- 用中文回答用户问题

现在，让我们开始帮助用户吧！`;
  }

  // 主运行方法（支持流式输出 + DeepSeek 思考模式）
  async run(
    userMessage: string,
    onThinking?: (thought: string) => void,
    onToolCall?: (toolCall: ToolCall) => void,
    onToolResult?: (result: any) => void,
    onToken?: (token: string) => void,
    onReasoning?: (reasoning: string) => void,
  ): Promise<string> {
    // 添加用户消息
    this.messages.push({ role: 'user', content: userMessage });

    // 获取启用的工具
    const enabledTools = toolRegistry.getEnabledDefinitions(this.config.tools);

    // ReAct 循环
    for (let iteration = 0; iteration < this.config.maxIterations; iteration++) {
      console.log(`\n🔄 Agent 循环 #${iteration + 1}`);

      // 1. 思考：让 LLM 决定下一步
      const response = await (this.llm as any).chatWithTools(this.messages, enabledTools);

      // 2. 如果有思维链内容，通知观察者（DeepSeek 思考模式）
      if (response.reasoningContent) {
        onReasoning?.(response.reasoningContent);
      }

      // 3. 如果有文本内容，通知观察者
      if (response.content) {
        onThinking?.(response.content);
      }

      // 4. 如果没有工具调用，说明任务完成 - 使用流式输出
      if (response.toolCalls.length === 0) {
        // 如果已经有内容（非流式返回的），直接使用
        if (response.content) {
          this.messages.push({
            role: 'assistant',
            content: response.content,
            reasoningContent: response.reasoningContent,
          });
          console.log('✅ Agent 任务完成');
          return response.content;
        }

        // 否则使用流式输出获取最终答案
        console.log('✅ Agent 任务完成（流式输出）');
        let fullContent = '';
        let fullReasoning = '';

        // 使用流式对话获取最终答案
        const messagesForStream = [...this.messages];
        const stream = this.llm.streamChat(messagesForStream);

        for await (const chunk of stream) {
          // 处理对象格式（支持思考模式）
          if (typeof chunk === 'object' && chunk !== null) {
            if (chunk.type === 'reasoning') {
              fullReasoning += chunk.text;
              onReasoning?.(chunk.text);
            } else if (chunk.type === 'content') {
              fullContent += chunk.text;
              onToken?.(chunk.text);
            }
          } else {
            // 处理字符串格式（兼容旧版本）
            fullContent += chunk as string;
            onToken?.(chunk as string);
          }
        }

        // 添加助手消息
        this.messages.push({
          role: 'assistant',
          content: fullContent,
          reasoningContent: fullReasoning || undefined,
        });

        return fullContent;
      }

      // 5. 有工具调用，需要执行
      // 先添加助手消息（包含工具调用和 reasoning_content）
      this.messages.push({
        role: 'assistant',
        content: response.content || null,
        toolCalls: response.toolCalls,
        reasoningContent: response.reasoningContent,
      });

      // 6. 逐个执行工具
      for (const toolCall of response.toolCalls) {
        console.log(`🔧 调用工具: ${toolCall.name}`);
        onToolCall?.(toolCall);

        // 执行工具
        const result = await toolRegistry.execute(toolCall.name, toolCall.args);
        onToolResult?.(result);

        // 添加工具结果到消息
        this.messages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          name: toolCall.name,
          content: JSON.stringify(result),
        });
      }
    }

    // 达到最大迭代次数
    console.log('⚠️ 达到最大迭代次数');
    return '抱歉，任务未能在规定步骤内完成。请尝试简化您的请求。';
  }

  // 获取对话历史
  getMessages(): Message[] {
    return this.messages;
  }

  // 清空对话
  clear(): void {
    this.messages = [{ role: 'system', content: this.getSystemPrompt() }];
  }

  // 获取当前状态
  getState(): { messageCount: number; lastMessage: Message | null } {
    return {
      messageCount: this.messages.length,
      lastMessage: this.messages[this.messages.length - 1] || null,
    };
  }
}
