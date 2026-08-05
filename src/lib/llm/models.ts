// ============================================
// 模型配置中心
// ============================================
//
// 🧠 原理讲解：
// 这里定义了所有支持的模型配置
// 每个模型都有：
// - 唯一 ID
// - 显示名称
// - API 地址
// - 模型 ID
// - 是否支持工具调用
// - 对应的环境变量名
//
// ============================================

export interface ModelConfig {
  id: string;                // 唯一标识
  name: string;              // 显示名称
  provider: string;          // 提供者
  baseURL: string;           // API 地址
  model: string;             // 模型 ID
  envKey: string;            // 环境变量名
  maxTokens?: number;        // 最大 token
  supportsTools: boolean;    // 是否支持工具
  supportsThinking?: boolean; // 是否支持思考模式（DeepSeek）
  description?: string;      // 描述
  icon?: string;             // 图标
  isCustom?: boolean;        // 是否为自定义模型
}

// ============================================
// 预定义模型列表
// ============================================
export const MODEL_CONFIGS: ModelConfig[] = [
  // ---- OpenAI 系列 ----
  {
    id: 'openai-gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    envKey: 'OPENAI_API_KEY',
    maxTokens: 4096,
    supportsTools: true,
    description: 'OpenAI 最新旗舰模型，多模态能力强',
    icon: '🟢',
  },
  {
    id: 'openai-gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    envKey: 'OPENAI_API_KEY',
    maxTokens: 4096,
    supportsTools: true,
    description: '轻量版 GPT-4o，速度快成本低',
    icon: '🟢',
  },
  {
    id: 'openai-gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4-turbo',
    envKey: 'OPENAI_API_KEY',
    maxTokens: 4096,
    supportsTools: true,
    description: 'GPT-4 Turbo，支持 128K 上下文',
    icon: '🟢',
  },

  // ---- Claude 系列 ----
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'Anthropic',
    baseURL: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-20250514',
    envKey: 'ANTHROPIC_API_KEY',
    maxTokens: 4096,
    supportsTools: true,
    description: 'Claude 最新模型，推理能力强',
    icon: '🟣',
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    baseURL: 'https://api.anthropic.com',
    model: 'claude-3-5-sonnet-20241022',
    envKey: 'ANTHROPIC_API_KEY',
    maxTokens: 4096,
    supportsTools: true,
    description: 'Claude 3.5 系列，性能均衡',
    icon: '🟣',
  },
  {
    id: 'claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'Anthropic',
    baseURL: 'https://api.anthropic.com',
    model: 'claude-3-haiku-20240307',
    envKey: 'ANTHROPIC_API_KEY',
    maxTokens: 4096,
    supportsTools: true,
    description: 'Claude 轻量版，速度极快',
    icon: '🟣',
  },

  // ---- DeepSeek 系列 ----
  // 文档: https://api-docs.deepseek.com/zh-cn/
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    provider: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    envKey: 'DEEPSEEK_API_KEY',
    maxTokens: 8192,
    supportsTools: true,
    supportsThinking: true,
    description: 'DeepSeek V4 Flash，速度快成本低，支持思考模式',
    icon: '🔵',
  },
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    provider: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-v4-pro',
    envKey: 'DEEPSEEK_API_KEY',
    maxTokens: 8192,
    supportsTools: true,
    supportsThinking: true,
    description: 'DeepSeek V4 Pro，最强能力，支持思考模式',
    icon: '🔵',
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek R1',
    provider: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-reasoner',
    envKey: 'DEEPSEEK_API_KEY',
    maxTokens: 8192,
    supportsTools: false,
    description: 'DeepSeek R1 推理模型，思维链推理',
    icon: '🔵',
  },

  // ---- Moonshot (Kimi) 系列 ----
  {
    id: 'moonshot-v1-8k',
    name: 'Moonshot V1 8K',
    provider: 'Moonshot',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    envKey: 'MOONSHOT_API_KEY',
    maxTokens: 4096,
    supportsTools: true,
    description: 'Kimi 8K 上下文版本',
    icon: '🌙',
  },
  {
    id: 'moonshot-v1-32k',
    name: 'Moonshot V1 32K',
    provider: 'Moonshot',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-32k',
    envKey: 'MOONSHOT_API_KEY',
    maxTokens: 4096,
    supportsTools: true,
    description: 'Kimi 32K 上下文版本',
    icon: '🌙',
  },
  {
    id: 'moonshot-v1-128k',
    name: 'Moonshot V1 128K',
    provider: 'Moonshot',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-128k',
    envKey: 'MOONSHOT_API_KEY',
    maxTokens: 4096,
    supportsTools: true,
    description: 'Kimi 128K 长上下文版本',
    icon: '🌙',
  },

  // ---- 通义千问 (Qwen) 系列 ----
  {
    id: 'qwen-turbo',
    name: '通义千问 Turbo',
    provider: '阿里云',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-turbo',
    envKey: 'QWEN_API_KEY',
    maxTokens: 4096,
    supportsTools: true,
    description: '通义千问 Turbo，速度快成本低',
    icon: '🟠',
  },
  {
    id: 'qwen-plus',
    name: '通义千问 Plus',
    provider: '阿里云',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    envKey: 'QWEN_API_KEY',
    maxTokens: 4096,
    supportsTools: true,
    description: '通义千问 Plus，性能均衡',
    icon: '🟠',
  },
  {
    id: 'qwen-max',
    name: '通义千问 Max',
    provider: '阿里云',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-max',
    envKey: 'QWEN_API_KEY',
    maxTokens: 4096,
    supportsTools: true,
    description: '通义千问 Max，最强能力',
    icon: '🟠',
  },

  // ---- 智谱 GLM 系列 ----
  {
    id: 'glm-4',
    name: 'GLM-4',
    provider: '智谱AI',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4',
    envKey: 'GLM_API_KEY',
    maxTokens: 4096,
    supportsTools: true,
    description: '智谱 GLM-4，国产顶级模型',
    icon: '🟢',
  },
  {
    id: 'glm-4-flash',
    name: 'GLM-4 Flash',
    provider: '智谱AI',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    envKey: 'GLM_API_KEY',
    maxTokens: 4096,
    supportsTools: true,
    description: 'GLM-4 Flash，速度快成本低',
    icon: '🟢',
  },

  // ---- 文心一言 (ERNIE) 系列 ----
  {
    id: 'ernie-4.0',
    name: '文心一言 4.0',
    provider: '百度',
    baseURL: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
    model: 'ernie-4.0-8k',
    envKey: 'ERNIE_API_KEY',
    maxTokens: 4096,
    supportsTools: false,
    description: '文心一言 4.0，百度最强模型',
    icon: '🔴',
  },

  // ---- 火山引擎 (Volcengine) agent-plan 大模型 ----
  {
    id: 'doubao-pro',
    name: '火山agent-plan',
    provider: '火山引擎',
    baseURL: 'https://ark.cn-beijing.volces.com/api/plan/v3',
    model: 'ark-code-latest',
    envKey: 'VOLC_API_KEY',
    maxTokens: 4096,
    supportsTools: true,
    description: '火山引擎 agent-plan 大模型（ark-code-latest）',
    icon: '🎵',
  },

  // ---- 讯飞星火 (Spark) 系列 ----
  {
    id: 'spark-max',
    name: '星火 Max',
    provider: '科大讯飞',
    baseURL: 'https://spark-api-open.xf-yun.com/v1',
    model: 'generalv3.5',
    envKey: 'SPARK_API_KEY',
    maxTokens: 4096,
    supportsTools: false,
    description: '讯飞星火 Max，国产老牌模型',
    icon: '✨',
  },
];

// ============================================
// 自定义模型存储
// ============================================
const CUSTOM_MODELS_KEY = 'ai-agent-custom-models';

export function getCustomModels(): ModelConfig[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(CUSTOM_MODELS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveCustomModel(model: ModelConfig): void {
  const customModels = getCustomModels();
  const existingIndex = customModels.findIndex(m => m.id === model.id);

  if (existingIndex >= 0) {
    customModels[existingIndex] = model;
  } else {
    customModels.push(model);
  }

  localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(customModels));
}

export function deleteCustomModel(modelId: string): void {
  const customModels = getCustomModels().filter(m => m.id !== modelId);
  localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(customModels));
}

// ============================================
// 获取所有模型
// ============================================
export function getAllModels(): ModelConfig[] {
  return [...MODEL_CONFIGS, ...getCustomModels()];
}

// 根据 ID 获取模型
export function getModelById(id: string): ModelConfig | undefined {
  return getAllModels().find(m => m.id === id);
}

// 按提供者分组
export function getModelsByProvider(): Record<string, ModelConfig[]> {
  const models = getAllModels();
  const grouped: Record<string, ModelConfig[]> = {};

  for (const model of models) {
    if (!grouped[model.provider]) {
      grouped[model.provider] = [];
    }
    grouped[model.provider].push(model);
  }

  return grouped;
}
