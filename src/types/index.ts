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
}

// 工具接口 - 每个工具都要实现
export interface Tool {
  definition: ToolDefinition;           // 工具定义（给 LLM 看）
  execute: (args: Record<string, any>) => Promise<ToolResult>; // 执行函数
}

// LLM 提供者接口
export interface LLMProvider {
  // 普通对话
  chat(messages: Message[]): Promise<string>;

  // 带工具的对话（Agent 核心）
  chatWithTools(messages: Message[], tools: ToolDefinition[]): Promise<{
    content: string | null;
    toolCalls: ToolCall[];
  }>;

  // 流式对话（实时输出）
  streamChat(messages: Message[]): AsyncIterable<string>;
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
}
