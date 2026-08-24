// ============================================
// AI Agent 核心类型定义
// ============================================
//
// 这些类型定义了整个系统的数据结构
// 理解这些类型是理解 Agent 架构的基础
//
// ============================================

// 消息类型 - 对话的基本单位
export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  toolCalls?: ToolCall[];    // LLM 请求调用的工具
  toolCallId?: string;       // 工具执行结果的 ID
  name?: string;             // 工具名称
  reasoningContent?: string; // 思维链内容（DeepSeek 思考模式）
}

// 工具调用 - LLM 生成的调用指令
export interface ToolCall {
  id: string;                // 唯一标识
  name: string;              // 工具名称
  args: Record<string, any>; // 工具参数
}

// 工具定义 - 告诉 LLM 有哪些工具可用
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

// 工具执行结果
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  // 工具需要向用户提问才能继续（如 ask_user），Agent 检测到后会暂停并请求用户输入
  needsInput?: {
    question: string;
    options?: string[];
  };
}

// 工具接口 - 每个工具都要实现
export interface Tool {
  definition: ToolDefinition;           // 工具定义（给 LLM 看）
  execute: (args: Record<string, any>) => Promise<ToolResult>; // 执行函数
  /** 是否需要用户审批后才执行（如 shell 命令）。Agent 会暂停并请求前端展示审批卡片 */
  requiresApproval?: boolean;
}

// Agent 运行结果：正常完成 / 等待用户输入 / 等待审批
export type AgentRunResult =
  | { status: 'complete'; content: string }
  | {
      status: 'awaiting_input';
      requestId: string;
      question: string;
      options?: string[];
      pendingToolCall: ToolCall;
    }
  | {
      status: 'awaiting_approval';
      requestId: string;
      toolCall: ToolCall;
      toolDescription: string;
    };

// 流式工具调用事件
export type ChatStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'done'; content: string | null; toolCalls: ToolCall[]; reasoningContent?: string };

// LLM 提供者接口
export interface LLMProvider {
  // 普通对话
  chat(messages: Message[]): Promise<string>;

  // 带工具的对话（非流式，保留兼容）
  chatWithTools(messages: Message[], tools: ToolDefinition[]): Promise<{
    content: string | null;
    toolCalls: ToolCall[];
    reasoningContent?: string;
  }>;

  // 带工具的流式对话（推荐）
  chatWithToolsStream?(messages: Message[], tools: ToolDefinition[]): AsyncIterable<ChatStreamEvent>;

  // 流式对话（实时输出）
  streamChat(messages: Message[]): AsyncIterable<string> | AsyncIterable<{ type: 'reasoning' | 'content'; text: string }>;
}

// Agent 状态
export interface AgentState {
  messages: Message[];
  isThinking: boolean;
  currentTool: string | null;
  error: string | null;
}

// Agent 配置
export interface AgentConfig {
  model: string;              // 模型 ID（如 'openai-gpt-4o', 'deepseek-chat' 等）
  maxIterations: number;      // 最大循环次数（防止死循环）
  temperature: number;        // 创造性参数 0-1
  tools: string[];            // 启用的工具列表
  maxContextMessages?: number; // 上下文消息数上限（超过则压缩/裁剪最旧消息，默认 30）
  compressContext?: boolean;    // 是否用 LLM 摘要压缩旧上下文（默认 true；false 则退回直接裁剪）
}
