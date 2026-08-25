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
// 🛂 IM 审批流（对标 Web 端审批卡片，2026-08-25 新增）：
// 敏感工具（shell_executor / background_task，均 requiresApproval）被调用时 Agent 暂停，
// 把 pending 审批存进会话 → 回一条授权请求消息 → 用户回复「批准/拒绝」→ 重建 Agent
// 调 resumeWithApproval 继续执行。ask_user 依旧不开放（IM 无弹窗机制）。
// ============================================

import type { AgentConfig, AgentRunResult, Message } from '@/types';
import { Agent } from '../agent/agent';
import { CustomLLMProvider } from '../llm/custom';
import { getModelById } from '../llm/models';
import { getSession, saveSession, resetSession, withUserLock, type ImPendingApproval } from './session';
import { stripToolCallXml, hasToolCallXml } from '../llm/xml-strip';

// IM 场景可用工具：含审批类（shell_executor / background_task 会暂停等用户批准），ask_user 不开放
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
  'shell_executor',
  'background_task',
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

/** 解析用户回复是批准还是拒绝；无法判断返回 undefined（保持挂起，重新提示） */
function parseApproval(text: string): boolean | undefined {
  const t = text.trim().toLowerCase();
  if (/^(批准|同意|授权|确认|可以|执行|好的?|ok|yes|y|是|继续)$/.test(t)) return true;
  if (/^(拒绝|取消|不要|不行|不同意|算了|no|n|否)$/.test(t)) return false;
  return undefined;
}

/** 生成审批请求消息（含编号，多级审批可区分） */
function buildApprovalPrompt(p: ImPendingApproval): string {
  const args = JSON.stringify(p.toolArgs ?? {});
  return (
    `🛂 【申请授权 #${p.requestId}】\n` +
    `${p.toolDescription}\n` +
    `📋 参数: ${args.length > 300 ? args.slice(0, 300) + '…' : args}\n\n` +
    `回复「批准」继续执行，或「拒绝」取消。`
  );
}

/** 把 awaiting_approval 结果转成持久化 pending 审批 */
function toPending(result: AgentRunResult, fallback: ImPendingApproval | null): ImPendingApproval | null {
  if (result.status !== 'awaiting_approval' || !result.toolCall) return fallback;
  return {
    kind: 'approval',
    requestId: result.requestId ?? `req_${Date.now()}`,
    toolName: result.toolCall.name,
    toolArgs: result.toolCall.args,
    toolDescription: result.toolDescription ?? result.toolCall.name,
    createdAt: Date.now(),
  };
}

/** 构造 IM 的 LLM + Agent（普通运行与审批恢复共用；凭据缺失抛错） */
function buildAgent(modelId: string, history: Message[]): { agent: Agent; agentConfig: AgentConfig } {
  const modelConfig = getModelById(modelId);
  const apiKey =
    process.env.IM_AGENT_API_KEY ||
    (modelConfig?.envKey ? process.env[modelConfig.envKey] || '' : '') ||
    '';
  const baseURL = process.env.IM_AGENT_BASE_URL || modelConfig?.baseURL || '';
  if (!apiKey) {
    throw new Error(`服务端未配置模型 API Key（IM_AGENT_API_KEY，或 ${modelConfig?.envKey ?? '对应模型的 envKey'}）。请在 .env.local 填入后再试。`);
  }
  if (!baseURL) {
    throw new Error(`未找到模型 ${modelId} 的 API 地址：请配置 IM_AGENT_BASE_URL，或使用 models.ts 中已定义的模型 ID。`);
  }
  const agentConfig: AgentConfig = {
    model: modelId,
    maxIterations: 15,
    temperature: 0.7,
    tools: IM_TOOLS,
    maxContextMessages: 20,
    compressContext: true,
  };
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
  return { agent: new Agent(llm, agentConfig, history), agentConfig };
}

/** 统一的结果格式化（complete 走 XML 兜底剔除） */
function formatResult(result: AgentRunResult): string {
    if (result.status === 'complete') {
      // 兜底：模型可能把幻觉的工具调用以 XML 文本输出（飞书里无法执行），剔除后再发
      const before = result.content || '';
      const content = stripToolCallXml(before);
      if (hasToolCallXml(before)) {
        console.log('[feishu] ⚠️ 已剔除回复中的工具调用XML残留');
      }
      return content || '✅ 处理完成（没有输出内容）。';
    }
    if (result.status === 'awaiting_input') {
      return `🤔 我需要先确认一下：\n${result.question}`;
    }
    if (result.status === 'awaiting_approval') {
      // 理论上到不了这里（上游已转 pending 处理），防御性降级
      return '🛂 工具调用需要审批，请稍后重试。';
    }
    return '❌ 未知状态';
}

/** 处理一条 IM 消息：更新会话 → 跑 Agent → 返回最终回答文本 */
export async function runImAgent(channel: string, userId: string, text: string): Promise<string> {
  return withUserLock(channel, userId, async () => {
    // 白名单检查（参考 Hermes 的 dmPolicy=allowlist 模式）：
    // IM_ALLOWLIST=逗号分隔的 open_id / user_id，不配置 = 允许所有用户
    const allowlist = (process.env.IM_ALLOWLIST || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (allowlist.length > 0 && !allowlist.includes(userId)) {
      return '🔒 抱歉，此机器人仅对授权用户开放。';
    }

    // 内置命令
    const trimmed = text.trim();
    if (trimmed === '/reset' || trimmed === '重置会话' || trimmed === '清空上下文') {
      await resetSession(channel, userId);
      return '✅ 会话已重置，之前的对话历史已清空。';
    }

    const modelId = process.env.IM_AGENT_MODEL || DEFAULT_MODEL;
    const session = await getSession(channel, userId);

    // 🛂 有挂起的审批请求 → 处理用户的批准/拒绝
    if (session.pending?.kind === 'approval') {
      const granted = parseApproval(trimmed);
      if (granted === undefined) {
        return `${buildApprovalPrompt(session.pending)}\n\n⚠️ 未识别到审批指令，请回复「批准」或「拒绝」。`;
      }
      const pending = session.pending;
      session.pending = null;
      try {
        const { agent } = buildAgent(modelId, session.messages);
        const result = await withTimeout(agent.resumeWithApproval(granted), MAX_RUN_MS);
        session.messages = agent.getMessages().slice(-MAX_HISTORY_MESSAGES);
        session.pending = toPending(result, null);
        await saveSession(session);
        return formatResult(result);
      } catch (e) {
        await saveSession(session);
        return `❌ 审批恢复失败: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    // 正常流程：跑 Agent（含首次触发审批 → 存 pending 并回请求）
    let result: AgentRunResult;
    try {
      const { agent } = buildAgent(modelId, session.messages);
      result = await withTimeout(agent.run(text), MAX_RUN_MS);
      session.messages = agent.getMessages().slice(-MAX_HISTORY_MESSAGES);
      session.pending = toPending(result, session.pending ?? null);
      await saveSession(session);
      return formatResult(result);
    } catch (e) {
      await saveSession(session);
      return `❌ 处理失败: ${e instanceof Error ? e.message : String(e)}`;
    }
  });
}
