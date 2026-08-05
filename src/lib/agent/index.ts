// ============================================
// Agent 工厂 - 创建和配置 Agent 实例
// ============================================
//
// 🧠 原理讲解：
// 工厂模式让我们可以轻松切换不同的 LLM 提供者，
// 而不需要修改 Agent 的核心逻辑。
//
// 现在支持：
// - OpenAI 系列 (GPT-4o, GPT-4 Turbo)
// - Claude 系列 (Claude 3.5 Sonnet, Claude 3 Haiku)
// - DeepSeek 系列 (V3, Coder, R1)
// - Moonshot/Kimi 系列
// - 通义千问 系列
// - 智谱 GLM 系列
// - 以及其他所有 OpenAI 兼容的 API
//
// ============================================

import { Agent } from './agent';
import { OpenAIProvider } from '../llm/openai';
import { ClaudeProvider } from '../llm/claude';
import { CustomLLMProvider } from '../llm/custom';
import { getModelById, type ModelConfig } from '../llm/models';
import { AgentConfig, LLMProvider, Message } from '@/types';
import { registerAllTools } from '../tools';

// 注册所有工具
registerAllTools();

// 创建 LLM 提供者（apiKey/baseURL 从请求体传入，不再读环境变量）
function createLLMProvider(modelId: string, apiOverrides?: { baseURL?: string; apiKey?: string }): LLMProvider {
  const modelConfig = getModelById(modelId);

  if (!modelConfig) {
    throw new Error(`未找到模型配置: ${modelId}`);
  }

  // API Key：优先用前端传入的，否则报错
  const apiKey = apiOverrides?.apiKey;
  if (!apiKey) {
    throw new Error('请在界面上填写 API Key');
  }

  // baseURL：优先用前端传入的，否则用模型配置里的
  const baseURL = apiOverrides?.baseURL || modelConfig.baseURL;

  // 根据提供者类型创建不同的 Provider
  switch (modelConfig.provider) {
    case 'OpenAI':
      return new OpenAIProvider(apiKey, modelConfig.model);

    case 'Anthropic':
      return new ClaudeProvider(apiKey, modelConfig.model);

    default:
      return new CustomLLMProvider({
        name: modelConfig.name,
        provider: modelConfig.provider,
        baseURL,
        model: modelConfig.model,
        apiKey,
        maxTokens: modelConfig.maxTokens,
        supportsTools: modelConfig.supportsTools,
        supportsThinking: modelConfig.supportsThinking,
      });
  }
}

// 创建 Agent 实例
export function createAgent(config: AgentConfig, history?: Message[]): Agent {
  const llm = createLLMProvider(config.model, {
    baseURL: (config as any).baseURL,
    apiKey: (config as any).apiKey,
  });
  return new Agent(llm, config, history);
}

// 默认配置
export const defaultConfig: AgentConfig = {
  model: 'openai-gpt-4o',
  maxIterations: 25,
  temperature: 0.7,
  maxContextMessages: 30,
  tools: [
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
  ],
};

// 导出 Agent 类和工具
export { Agent } from './agent';
export { registerAllTools } from '../tools';
