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

  constructor(llm: LLMProvider, config: AgentConfig, history?: Message[]) {
    this.llm = llm;
    this.config = config;

    // 初始化系统提示词
    this.messages.push({
      role: 'system',
      content: this.getSystemPrompt(),
    });

    // 如果传入了历史消息，加载到 messages 里（跳过 system）
    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.role !== 'system') {
          this.messages.push(msg);
        }
      }
    }
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
- api_caller: 调用外部 API

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

  // 主运行方法（全流式：思考 + 工具调用 + 最终回答 全部实时推送）
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

      // 每一轮都用流式：边收 token 边推送前端
      let content: string | null = null;
      let toolCalls: ToolCall[] = [];
      let reasoningContent: string | undefined;

      if (this.llm.chatWithToolsStream) {
        // 流式路径：实时推送 token/reasoning
        for await (const event of this.llm.chatWithToolsStream(this.messages, enabledTools)) {
          if (event.type === 'token') {
            onToken?.(event.text);
          } else if (event.type === 'reasoning') {
            onReasoning?.(event.text);
          } else if (event.type === 'done') {
            content = event.content;
            toolCalls = event.toolCalls;
            reasoningContent = event.reasoningContent;
          }
        }
      } else {
        // 降级：非流式路径
        const response = await (this.llm as any).chatWithTools(this.messages, enabledTools);
        content = response.content;
        toolCalls = response.toolCalls;
        reasoningContent = response.reasoningContent;
        if (reasoningContent) onReasoning?.(reasoningContent);
        if (content) onThinking?.(content);
      }

      // 没有工具调用 → 任务完成
      if (toolCalls.length === 0) {
        this.messages.push({
          role: 'assistant',
          content,
          reasoningContent,
        });
        console.log('✅ Agent 任务完成');
        return content || '';
      }

      // 有工具调用 → 执行
      this.messages.push({
        role: 'assistant',
        content,
        toolCalls,
        reasoningContent,
      });

      for (const tc of toolCalls) {
        console.log(`🔧 调用工具: ${tc.name}`);
        onToolCall?.(tc);

        const result = await toolRegistry.execute(tc.name, tc.args);
        onToolResult?.(result);

        this.messages.push({
          role: 'tool',
          toolCallId: tc.id,
          name: tc.name,
          content: JSON.stringify(result),
        });
      }
    }

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
