// ============================================
// subagent 工具 - 委派子任务给独立 Agent（多 Agent 协作）
// ============================================
//
// 🧠 设计说明：
// 复杂任务可以拆成多个独立子任务并行推进——这正是"多个 Agent 协作"的形态。
// subagent 复用当前对话的模型凭据，创建一个全新的子 Agent 实例：
// - 子 Agent 有自己独立的 ReAct 循环和消息历史
// - 用精简的工具子集（不含 shell/审批类工具，避免递归审批）
// - prompt 必须自包含（子 Agent 看不到父 Agent 的上下文）
// - 返回子 Agent 的最终回答
//
// 与 reload_tool 一脉相承：都是给 Agent"扩展自身能力"的手段。
// reload_tool 扩展"工具"，subagent 扩展"执行体"。
// ============================================

import type { Tool, ToolResult, AgentConfig } from '@/types';
import { Agent } from '../agent/agent';
import { CustomLLMProvider } from '../llm/custom';
import { getChatCredentials } from './context';

// 子 Agent 可用工具子集：不包含 shell_executor（需审批）和 reload_tool（动态加载），
// 避免子 Agent 无限递归创建 subagent / 触发审批风暴。
const SUBAGENT_TOOLS = [
  'web_search',
  'calculator',
  'code_executor',
  'file_operations',
  'api_caller',
  'knowledge_search',
  'get_time',
  'webpage_fetch',
  'memory',
];

export const subagentTool: Tool = {
  definition: {
    name: 'subagent',
    description:
      '委派一个独立子任务给全新的子 Agent 执行，返回子 Agent 的最终回答。子 Agent 有自己的思考循环和工具，适合：独立调研、并行处理多个不相关子任务、分而治之的复杂拆解。prompt 必须自包含、描述清楚目标和约束。注意：子 Agent 看不到当前对话的上下文。',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '子任务的完整指令（自包含：目标、约束、期望输出格式）',
        },
        maxIterations: {
          type: 'number',
          description: '子 Agent 最大工具循环次数（可选，默认 8，最大 15）',
        },
      },
      required: ['prompt'],
    },
  },
  async execute(args): Promise<ToolResult> {
    const prompt = String(args.prompt ?? '').trim();
    if (!prompt) return { success: false, error: 'prompt 不能为空' };

    const maxIterations = Math.min(Math.max(Number(args.maxIterations) || 8, 1), 15);
    const credentials = getChatCredentials();

    if (!credentials.apiKey || !credentials.baseURL) {
      return { success: false, error: '无可用模型凭据，请先在界面上方发起一次对话后再使用 subagent' };
    }

    try {
      const provider = new CustomLLMProvider({
        name: 'subagent',
        provider: 'subagent',
        baseURL: credentials.baseURL,
        model: credentials.model || 'gpt-4o-mini',
        apiKey: credentials.apiKey,
        maxTokens: 4096,
        supportsTools: true,
        supportsThinking: false,
      });

      const subConfig: AgentConfig = {
        model: credentials.model || 'gpt-4o-mini',
        maxIterations,
        temperature: 0.4, // 子任务追求稳定输出
        tools: SUBAGENT_TOOLS,
        maxContextMessages: 20,
        compressContext: true,
      };

      const subAgent = new Agent(provider, subConfig);
      const startedAt = Date.now();
      const content = await subAgent.run(prompt);
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

      return {
        success: true,
        data: {
          result: content,
          iterations: subAgent.getState().messageCount,
          elapsedSeconds: Number(elapsed),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `子 Agent 执行失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};