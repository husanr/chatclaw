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
import { AgentConfig, LLMProvider } from '@/types';
import { registerAllTools } from '../tools';

// 注册所有工具
registerAllTools();

// 创建 LLM 提供者
function createLLMProvider(modelId: string): LLMProvider {
  const modelConfig = getModelById(modelId);

  if (!modelConfig) {
    throw new Error(`未找到模型配置: ${modelId}`);
  }

  // 获取 API Key
  const apiKey = process.env[modelConfig.envKey];
  if (!apiKey) {
    throw new Error(`请配置 ${modelConfig.envKey} 环境变量`);
  }

  // 根据提供者类型创建不同的 Provider
  switch (modelConfig.provider) {
    case 'OpenAI':
      return new OpenAIProvider(apiKey, modelConfig.model);

    case 'Anthropic':
      return new ClaudeProvider(apiKey, modelConfig.model);

    default:
      // 其他所有模型使用通用 OpenAI 兼容提供者
      return new CustomLLMProvider({
        name: modelConfig.name,
        provider: modelConfig.provider,
        baseURL: modelConfig.baseURL,
        model: modelConfig.model,
        apiKey,
        maxTokens: modelConfig.maxTokens,
        supportsTools: modelConfig.supportsTools,
      });
  }
}

// 创建 Agent 实例
export function createAgent(config: AgentConfig): Agent {
  const llm = createLLMProvider(config.model);
  return new Agent(llm, config);
}

// 默认配置
export const defaultConfig: AgentConfig = {
  model: 'openai-gpt-4o',
  maxIterations: 10,
  temperature: 0.7,
  tools: [
    'web_search',
    'calculator',
    'code_executor',
    'file_operations',
    'database_query',
    'api_caller',
    'email_sender',
    'image_generator',
  ],
};

// 导出 Agent 类和工具
export { Agent } from './agent';
export { registerAllTools } from '../tools';
