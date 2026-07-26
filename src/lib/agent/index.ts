// ============================================
// Agent 工厂 - 创建和配置 Agent 实例
// ============================================
//
// 🧠 原理讲解：
// 工厂模式让我们可以轻松切换不同的 LLM 提供者，
// 而不需要修改 Agent 的核心逻辑。
//
// ============================================

import { Agent } from './agent';
import { OpenAIProvider } from '../llm/openai';
import { ClaudeProvider } from '../llm/claude';
import { AgentConfig } from '@/types';
import { registerAllTools } from '../tools';

// 注册所有工具
registerAllTools();

// 创建 Agent 实例
export function createAgent(config: AgentConfig): Agent {
  let llm;

  switch (config.model) {
    case 'openai':
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        throw new Error('请配置 OPENAI_API_KEY 环境变量');
      }
      llm = new OpenAIProvider(openaiKey);
      break;

    case 'claude':
      const claudeKey = process.env.ANTHROPIC_API_KEY;
      if (!claudeKey) {
        throw new Error('请配置 ANTHROPIC_API_KEY 环境变量');
      }
      llm = new ClaudeProvider(claudeKey);
      break;

    default:
      throw new Error(`不支持的模型: ${config.model}`);
  }

  return new Agent(llm, config);
}

// 默认配置
export const defaultConfig: AgentConfig = {
  model: 'openai',
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

// 导出 Agent 类
export { Agent } from './agent';
