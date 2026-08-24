// ============================================
// IM 版 Agent 执行器（飞书 / Telegram 共用）
// ============================================
//
// 🧠 设计说明：
// Web 端由用户在浏览器填 API Key；IM 端没有 UI，所以统一从环境变量取：
//   IM_AGENT_MODEL      —— 模型 ID（默认 openai-gpt-4o）
//   IM_AGENT_API_KEY    —— 可选，覆盖对应模型的 envKey
//   IM_AGENT_BASE_URL   —— 可选，覆盖模型默认 API 地址
// 会话历史存在服务端（见 session.ts），每条消息重建 Agent（无状态，与 Web 端一致）。
//
// IM 工具集：排除需要交互的工具体（shell_executor / background_task 要审批、
// ask_user 要弹窗），其余 13 个全部可用。
// ============================================

import type { AgentConfig, AgentRunResult } from '@/types';
import { Agent } from '../agent/agent';
import { CustomLLMProvider } from '../llm/custom';
import { getModelById } from '../llm/models';
import { getSession, saveSession, resetSession, withUserLock } from './session';

// IM 场景可用工具：排除审批/交互类
const IM_TOOLS = [
  'web_search',
  'calculator',
  'code_executor',
  'file_operations',
  'api_caller',
  'knowledge_search',
  'app_config',
  'image_generator',
  'get_time',
  'webpage_fetch',
  'memory',
  'reload_tool',
  'subagent',
];

const DEFAULT_MODEL = 'openai-gpt-4o';
const MAX_HISTORY_MESSAGES = 40; // 历史最多保留条数（含 tool 消息）
const MAX_RUN_MS = 120_000;      // 单次处理超时 120s

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`处理超时（>${ms / 1000}s），请拆分任务或稍后再试`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer!));
}

/** 处理一条 IM 消息：更新会话 → 跑 Agent → 返回最终回答文本 */
export async function runImAgent(channel: string, userId: string, text: string): Promise<string> {
  return withUserLock(channel, userId, async () => {
    // 内置命令
    const trimmed = text.trim();
    if (trimmed === '/reset' || trimmed === '重置会话' || trimmed === '清空上下文') {
      await resetSession(channel, userId);
      return '✅ 会话已重置，之前的对话历史已清空。';
    }

    // 模型与凭据（环境变量；models.ts 里没有的模型 ID 也支持——用 env 直连构造）
    const modelId = process.env.IM_AGENT_MODEL || DEFAULT_MODEL;
    const modelConfig = getModelById(modelId);
    const apiKey =
      process.env.IM_AGENT_API_KEY ||
      (modelConfig?.envKey ? process.env[modelConfig.envKey] || '' : '') ||
      '';
    const baseURL = process.env.IM_AGENT_BASE_URL || modelConfig?.baseURL || '';
    if (!apiKey) {
      return `❌ 服务端未配置模型 API Key（IM_AGENT_API_KEY，或 ${modelConfig?.envKey ?? '对应模型的 envKey'}）。请在 .env.local 填入后再试。`;
    }
    if (!baseURL) {
      return `❌ 未找到模型 ${modelId} 的 API 地址：请配置 IM_AGENT_BASE_URL，或使用 models.ts 中已定义的模型 ID。`;
    }

    // 恢复历史，重建 Agent（stateless）
    const session = await getSession(channel, userId);
    const agentConfig: AgentConfig = {
      model: modelId,
      maxIterations: 15,
      temperature: 0.7,
      tools: IM_TOOLS,
      maxContextMessages: 20,
      compressContext: true,
    };
    // 构造 LLM Provider：models.ts 有配置走配置；没有则按自定义模型直连（env 提供地址/Key）
    const llm = new CustomLLMProvider({
      name: modelConfig?.name ?? modelId,
      provider: modelConfig?.provider ?? 'custom',
      baseURL,
      model: modelConfig?.model ?? modelId,
      apiKey,
      maxTokens: modelConfig?.maxTokens ?? 8192,
      supportsTools: true,
      supportsThinking: modelConfig?.supportsThinking ?? false,
    });
    const agent = new Agent(llm, agentConfig, session.messages);

    // 跑（带超时）
    let result: AgentRunResult;
    try {
      result = await withTimeout(agent.run(text), MAX_RUN_MS);
    } catch (e) {
      return `❌ 处理失败: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 保存历史（IM 工具集无暂停类工具，这里只会 complete；防御性处理其他状态）
    if (result.status === 'complete') {
      session.messages = agent.getMessages().slice(-MAX_HISTORY_MESSAGES);
    } else if (result.status === 'awaiting_input') {
      session.messages = agent.getMessages().slice(-MAX_HISTORY_MESSAGES);
    } else if (result.status === 'awaiting_approval') {
      session.messages = agent.getMessages().slice(-MAX_HISTORY_MESSAGES);
    }
    await saveSession(session);

    if (result.status === 'complete') {
      const content = (result.content || '').trim();
      return content || '✅ 处理完成（没有输出内容）。';
    }
    if (result.status === 'awaiting_input') {
      return `🤔 我需要先确认一下：\n${result.question}`;
    }
    if (result.status === 'awaiting_approval') {
      return `🛂 工具调用需要人工审批，IM 模式下已自动跳过，请换个方式描述需求。`;
    }
    return '❌ 未知状态';
  });
}