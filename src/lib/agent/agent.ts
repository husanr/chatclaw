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

import { Message, ToolCall, AgentConfig, LLMProvider, Tool, ToolResult, AgentRunResult } from '@/types';
import { toolRegistry } from '../tools/base';

// 校验工具参数：对照工具定义的 parameters（properties + required）做必填和类型检查
// 手写校验，不引入 zod——工具定义是 JSON-schema 形状，这里最贴合且零依赖
function validateToolArgs(
  tool: Tool,
  args: Record<string, any>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const { properties = {}, required = [] } = tool.definition.parameters;

  // 必填项检查（undefined / null / 空字符串都算缺失）
  for (const key of required) {
    const val = args[key];
    if (val === undefined || val === null || val === '') {
      errors.push(`缺少必填参数 "${key}"`);
    }
  }

  // 类型检查（宽松：数字字符串可视为 number）
  for (const [key, val] of Object.entries(args)) {
    const schema = properties[key];
    if (!schema || val === undefined || val === null) continue;
    const expected = schema.type;
    if (!expected) continue;
    const actual = typeof val;
    if (actual === expected) continue;
    if (expected === 'number' && actual === 'string' && val !== '' && !isNaN(Number(val))) continue;
    if (expected === 'integer' && actual === 'number' && Number.isInteger(val)) continue;
    errors.push(`参数 "${key}" 类型应为 ${expected}，实际是 ${actual}`);
  }

  return { valid: errors.length === 0, errors };
}

export class Agent {
  private llm: LLMProvider;
  private config: AgentConfig;
  private messages: Message[] = [];

  // 流式回调缓存：暂停（审批/提问）后恢复时继续推送事件
  private callbacks: {
    onThinking?: (thought: string) => void;
    onToolCall?: (toolCall: ToolCall) => void;
    onToolResult?: (result: any) => void;
    onToken?: (token: string) => void;
    onReasoning?: (reasoning: string) => void;
  } = {};

  private requestSeq = 0;

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
- knowledge_search: 搜索本地知识库（用户上传的文档）
- web_search: 搜索网页获取最新信息
- calculator: 执行数学计算
- code_executor: 执行 JavaScript 代码（沙箱）
- file_operations: 文件操作（读写/列表/edit 编辑/grep 搜索/glob 匹配）
- api_caller: 调用外部 API
- app_config: 读取/修改应用配置（如图片 API 地址），改完立即生效
- image_generator: 根据描述生成图片，返回图片 URL
- get_time: 获取当前日期时间
- webpage_fetch: 抓取网页完整文本
- memory: 长期记忆，跨会话记住/回忆信息
- reload_tool: 动态加载/卸载工具，扩展自身能力
- shell_executor: 在用户授权的工作目录执行真实 Shell 命令（npm/git/python 等，执行前需用户审批）
- background_task: 后台任务管理（start/status/list/stop/result），长耗时命令用这个，不阻塞对话
- subagent: 委派子任务给独立子 Agent 并行执行（prompt 必须自包含）
- ask_user: 向用户提问澄清（意图不明、方案选择、关键参数缺失时用，不要瞎猜）

## 重要规则（必须遵守）
1. **先查知识库，再搜网页**：当用户提问时，必须先用 knowledge_search 搜索本地知识库。只有当知识库没有相关内容时，才用 web_search。
2. 如果用户上传了文档，回答问题时务必先搜索知识库，基于文档内容回答。
3. 只有涉及实时信息（新闻、天气、股价等）或知识库确实找不到答案时，才用 web_search。
4. **长任务必须用 background_task**：npm install、构建、批量处理等耗时操作，启动后台任务后轮询 status，不要用 shell_executor 同步等待。
5. **涉及真实 Shell 操作**（安装依赖、运行项目、git 操作等）用 shell_executor，命令执行前会请用户确认，等待确认时不要重复发起相同命令。
6. **意图不明确就问**：任务有歧义、多方案需要用户决策、缺少关键信息时，用 ask_user 提问澄清，不要擅自假设。
7. **复杂任务可拆解**：多个独立子任务可用 subagent 并行委派，然后汇总结果。

## 工作流程（ReAct 模式）
1. 仔细分析用户的请求（Reasoning - 思考）
2. 决定需要使用哪些工具（Acting - 行动）
3. 获取工具执行结果（Observing - 观察）
4. 继续思考或返回最终答案

## 重要原则
- 如果不确定，先搜索知识库，再搜索网页
- 复杂任务要分解成多个步骤
- 每次只调用必要的工具
- 遇到错误要尝试其他方法
- 最终要给出清晰、有用的回答
- 用中文回答用户问题

## 停止规则（重要）
- 当你已经能直接回答用户时，**立即停止调用工具，直接给出最终答案**。
- 不要为了"完成任务"而反复调用工具，除非确实需要更多信息。
- 如果某个工具调用失败，最多重试一次；仍失败就基于已有信息回答，不要无限重试。

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
  ): Promise<AgentRunResult> {
    // 缓存回调：暂停（审批/提问）后 resume 时继续推送
    this.callbacks = { onThinking, onToolCall, onToolResult, onToken, onReasoning };

    // 添加用户消息
    this.messages.push({ role: 'user', content: userMessage });

    return this.continueLoop();
  }

  // 恢复：用户回答了 ask_user 的提问
  // 通过历史消息重建 Agent 后也能调用（history 里包含 assistant toolCalls 但缺 tool result）
  async resumeWithAnswer(answer: string): Promise<AgentRunResult> {
    const tc = this.findPendingToolCall();
    if (!tc) {
      return { status: 'complete', content: '（无法恢复：没有找到待回答的问题）' };
    }

    const result: ToolResult = {
      success: true,
      data: { answer },
    };
    this.callbacks.onToolResult?.(result);
    this.messages.push({
      role: 'tool',
      toolCallId: tc.id,
      name: tc.name,
      content: JSON.stringify(result),
    });
    return this.continueLoop();
  }

  // 恢复：用户审批（或拒绝）了待执行的工具
  async resumeWithApproval(granted: boolean, toolCallId?: string): Promise<AgentRunResult> {
    const tc = this.findPendingToolCall(toolCallId);
    if (!tc) {
      return { status: 'complete', content: '（无法恢复：没有找到待审批的工具调用）' };
    }

    if (granted) {
      const result = await toolRegistry.execute(tc.name, tc.args);
      this.callbacks.onToolResult?.(result);
      this.messages.push({
        role: 'tool',
        toolCallId: tc.id,
        name: tc.name,
        content: JSON.stringify(result),
      });
    } else {
      const denied: ToolResult = { success: false, error: '用户拒绝了本次工具调用，请调整方案或直接回答用户' };
      this.callbacks.onToolResult?.(denied);
      this.messages.push({
        role: 'tool',
        toolCallId: tc.id,
        name: tc.name,
        content: JSON.stringify(denied),
      });
    }
    return this.continueLoop();
  }

  // 从消息历史中找出「最后一个未被消费的工具调用」
  // 规则：逆序找第一条 assistant 消息的最后一个 toolCall（该调用还没有对应的 tool 结果消息）
  private findPendingToolCall(toolCallId?: string): ToolCall | null {
    if (toolCallId) {
      for (let i = this.messages.length - 1; i >= 0; i--) {
        const m = this.messages[i];
        if (m.toolCalls) {
          const found = m.toolCalls.find((t) => t.id === toolCallId);
          if (found) return found;
        }
      }
      return null;
    }
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        return m.toolCalls[m.toolCalls.length - 1];
      }
    }
    return null;
  }

  // ReAct 主循环（run / resume 共用）
  private async continueLoop(): Promise<AgentRunResult> {
    const { onThinking, onToolCall, onToolResult, onToken, onReasoning } = this.callbacks;

    // 获取启用的工具
    const enabledTools = toolRegistry.getEnabledDefinitions(this.config.tools);

    // ReAct 循环
    for (let iteration = 0; iteration < this.config.maxIterations; iteration++) {
      // 每轮开始前先做上下文管理：压缩超限的旧对话（任何轮次都生效，包括纯对话轮）
      await this.compressContext();

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
        return { status: 'complete', content: content || '' };
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

        const tool = toolRegistry.get(tc.name);

        // 【权限门】需要用户审批的工具（如 shell_executor）：暂停循环，等用户确认
        if (tool?.requiresApproval) {
          console.log(`🛂 工具 ${tc.name} 需要用户审批`);
          return {
            status: 'awaiting_approval',
            requestId: `req_${++this.requestSeq}`,
            toolCall: tc,
            toolDescription: tool.definition.description,
          };
        }

        // 先校验参数：不合法则不执行，把错误回填给 LLM 让它自我纠错重试
        let result: ToolResult;
        const validation = tool ? validateToolArgs(tool, tc.args) : { valid: false, errors: [`工具不存在: ${tc.name}`] };

        if (!validation.valid) {
          const errorMsg = `工具 "${tc.name}" 参数校验失败: ${validation.errors.join('; ')}。收到的参数: ${JSON.stringify(tc.args)}。请修正参数后重试。`;
          console.warn(`⚠️ ${errorMsg}`);
          result = { success: false, error: errorMsg };
        } else {
          result = await toolRegistry.execute(tc.name, tc.args);
        }

        // 【提问门】工具请求用户输入（ask_user）：暂停循环，把问题推给前端
        if (result?.needsInput) {
          console.log(`❓ 工具 ${tc.name} 请求用户输入`);
          return {
            status: 'awaiting_input',
            requestId: `req_${++this.requestSeq}`,
            question: result.needsInput.question,
            options: result.needsInput.options,
            pendingToolCall: tc,
          };
        }

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
    return { status: 'complete', content: '抱歉，任务未能在规定步骤内完成。请尝试简化您的请求。' };
  }

  // 上下文管理：超过 maxContextMessages 时，优先用 LLM 摘要压缩最旧的对话，
  // 失败或关闭压缩时退回「从中间裁剪最旧工具对」。
  private async compressContext(): Promise<void> {
    const max = this.config.maxContextMessages ?? 30;
    if (this.messages.length <= max) return;

    // 显式关闭压缩：退回直接裁剪
    if (this.config.compressContext === false) {
      this.trimContext();
      return;
    }

    try {
      // 一次压缩到上限内：保留最近 (max-2) 条 + 1 条摘要占位
      // 如 27 条 / max=8 → 压缩前 21 条为摘要，保留 6 条最近消息
      const compressEnd = Math.max(4, this.messages.length - max + 2);
      const compressible = this.messages.slice(1, compressEnd);
      if (compressible.length < 4) {
        this.trimContext();
        return;
      }

      // 摘要输入：tool 角色消息转成 user（避免 API 因 tool 消息无对应 tool_call 而报错）
      const summaryInput: Message[] = [
        {
          role: 'system',
          content:
            '把以下对话历史压缩成简洁的中文摘要。请保留：用户的核心需求、已确认的事实、关键工具执行结果要点、未完成的任务。不要编造不存在的信息，输出纯摘要文本，不要任何解释。',
        },
        ...compressible.map((m): Message => {
          if (m.role === 'tool') {
            return { role: 'user', content: `[工具 ${m.name ?? '?'} 的结果] ${m.content ?? ''}` };
          }
          return { role: m.role as 'user' | 'assistant', content: m.content ?? '' };
        }),
      ];

      const summary = await this.llm.chat(summaryInput);

      if (!summary || !summary.trim()) {
        this.trimContext();
        return;
      }

      this.messages = [
        this.messages[0],
        {
          role: 'system',
          content: `【历史对话摘要】\n${summary.trim().slice(0, 2000)}\n\n（以上为之前对话的自动压缩摘要，回答问题时可以参考其中已确认的信息）`,
        },
        ...this.messages.slice(compressible.length + 1),
      ];
      console.log(`🧠 上下文已压缩：${compressible.length} 条消息 → 摘要（当前 ${this.messages.length} 条）`);
    } catch (error) {
      console.warn('⚠️ 摘要压缩失败，退回直接裁剪:', error instanceof Error ? error.message : error);
      this.trimContext();
    }
  }

  // 上下文封顶（兜底）：超过 maxContextMessages 时，从中间裁剪最旧的完整 tool_call/tool_result 对。
  // 绝不删 system 提示词和最近消息，绝不拆散 tool_call/tool_result 配对。
  private trimContext(): void {
    const max = this.config.maxContextMessages ?? 30;
    if (this.messages.length <= max) return;

    // 反复删除最旧的一对 tool(result) + 其前置 assistant(toolCalls)，直到低于上限
    while (this.messages.length > max) {
      const toolIdx = this.messages.findIndex(m => m.role === 'tool');
      if (toolIdx <= 0) break; // 没有可裁剪的工具消息，放弃（保守处理）
      const removeStart = this.messages[toolIdx - 1].role === 'assistant' ? toolIdx - 1 : toolIdx;
      this.messages.splice(removeStart, toolIdx - removeStart + 1);
    }
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
