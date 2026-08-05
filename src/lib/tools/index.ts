// ============================================
// 所有工具的实现
// ============================================
//
// 🧠 原理讲解：
// 每个工具都有：
// 1. definition: 告诉 LLM 这个工具能做什么、需要什么参数
// 2. execute: 实际执行逻辑
//
// LLM 会根据 definition 理解工具的能力，
// 然后生成正确的参数来调用工具。
//
// ============================================

import { Tool, ToolResult } from '@/types';
import { toolRegistry } from './base';
import vm from 'vm';
import fs from 'fs/promises';
import path from 'path';

// 允许的文件目录（由前端传入，运行时设置）
let allowedDir = '/tmp';

export function setAllowedDir(dir: string) {
  allowedDir = dir;
}

export function getAllowedDir(): string {
  return allowedDir;
}

// ============================================
// 1. 网页搜索工具
// ============================================
export const webSearchTool: Tool = {
  definition: {
    name: 'web_search',
    description: '搜索网页获取最新信息。用于查询实时数据、新闻、知识等。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词',
        },
      },
      required: ['query'],
    },
  },
  async execute(args): Promise<ToolResult> {
    const { query } = args;

    try {
      // 调用 Tavily Search API
      const apiKey = process.env.TAVILY_API_KEY;
      if (!apiKey) {
        return { success: false, error: '未配置 TAVILY_API_KEY' };
      }

      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: 5,
          include_answer: true,
          search_depth: 'basic',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `搜索失败: ${response.status} ${errText}` };
      }

      const data = await response.json();

      const results = (data.results || []).map((r: any) => ({
        title: r.title,
        snippet: r.content?.substring(0, 200),
        url: r.url,
      }));

      return {
        success: true,
        data: {
          answer: data.answer || null,
          results,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `搜索失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  },
};

// ============================================
// 2. 计算器工具
// ============================================
export const calculatorTool: Tool = {
  definition: {
    name: 'calculator',
    description: '执行数学计算。支持加减乘除、幂运算、三角函数等。',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: '数学表达式，如 "2 + 3 * 4" 或 "Math.sin(Math.PI / 2)"',
        },
      },
      required: ['expression'],
    },
  },
  async execute(args): Promise<ToolResult> {
    const { expression } = args;

    try {
      // 安全检查：只允许数学表达式
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
      if (sanitized.trim().length === 0) {
        throw new Error('无效的数学表达式');
      }

      // 使用 vm.createContext 沙箱执行，限制访问全局对象
      const context = vm.createContext({
        Math,
        Number,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        Infinity,
        NaN,
        undefined,
      });
      const result = vm.runInContext(sanitized, context, { timeout: 2000 });

      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('计算结果无效');
      }

      return {
        success: true,
        data: { expression, result },
      };
    } catch (error) {
      return {
        success: false,
        error: `计算错误: ${error instanceof Error ? error.message : '无效表达式'}`,
      };
    }
  },
};

// ============================================
// 3. 代码执行工具
// ============================================
export const codeExecutorTool: Tool = {
  definition: {
    name: 'code_executor',
    description: '执行 JavaScript 代码。用于数据处理、算法验证等。返回执行结果。',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: '要执行的 JavaScript 代码',
        },
      },
      required: ['code'],
    },
  },
  async execute(args): Promise<ToolResult> {
    const { code } = args;

    try {
      // 安全检查：禁止危险关键字
      const blocked = ['process', 'require', 'import(', 'eval(', 'Function(',
        '__dirname', '__filename', 'child_process', 'fs', 'os', 'net',
        'exec', 'spawn', 'exit', 'env', 'nextTick', 'setImmediate'];
      for (const kw of blocked) {
        if (code.includes(kw)) {
          throw new Error(`安全限制：禁止使用 "${kw}"`);
        }
      }

      // 使用 vm.createContext 沙箱执行
      const logs: string[] = [];
      const context = vm.createContext({
        console: {
          log: (...args: any[]) => logs.push(args.map(String).join(' ')),
          error: (...args: any[]) => logs.push('[ERROR] ' + args.map(String).join(' ')),
          warn: (...args: any[]) => logs.push('[WARN] ' + args.map(String).join(' ')),
        },
        Math,
        Number,
        String,
        Boolean,
        Array,
        Object,
        JSON,
        Date,
        RegExp,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        Infinity,
        NaN,
        undefined,
        Map,
        Set,
        Promise,
        Error,
        TypeError,
        RangeError,
      });

      const result = vm.runInContext(code, context, { timeout: 5000 });

      return {
        success: true,
        data: {
          output: logs.length > 0 ? logs.join('\n') : String(result ?? ''),
          returnValue: result,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `代码执行错误: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  },
};

// ============================================
// 4. 文件操作工具
// ============================================
export const fileOperationsTool: Tool = {
  definition: {
    name: 'file_operations',
    description: '读写文件。可以读取文件内容、写入文件或列出目录内容。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'write', 'list'],
          description: '操作类型: read(读取), write(写入), list(列出目录)',
        },
        path: {
          type: 'string',
          description: '文件路径',
        },
        content: {
          type: 'string',
          description: '写入的内容（仅 write 操作需要）',
        },
      },
      required: ['action', 'path'],
    },
  },
  async execute(args): Promise<ToolResult> {
    const { action, path: filePath, content } = args;

    try {
      // 安全限制：只能操作用户指定的工作目录
      const resolved = path.resolve(filePath);
      const resolvedAllowed = path.resolve(allowedDir);
      if (!resolved.startsWith(resolvedAllowed + '/') && resolved !== resolvedAllowed) {
        return { success: false, error: `安全限制：只能读写 ${resolvedAllowed} 目录下的文件` };
      }

      switch (action) {
        case 'read': {
          const data = await fs.readFile(resolved, 'utf-8');
          return { success: true, data: { path: resolved, content: data } };
        }
        case 'write': {
          if (!content) return { success: false, error: '写入操作需要 content 参数' };
          await fs.mkdir(path.dirname(resolved), { recursive: true });
          await fs.writeFile(resolved, content, 'utf-8');
          return { success: true, data: { path: resolved, message: '写入成功' } };
        }
        case 'list': {
          const entries = await fs.readdir(resolved, { withFileTypes: true });
          const list = entries.map(e => ({
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file',
          }));
          return { success: true, data: { path: resolved, entries: list } };
        }
        default:
          return { success: false, error: `不支持的操作: ${action}` };
      }
    } catch (error) {
      return {
        success: false,
        error: `文件操作失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  },
};

// ============================================
// 6. API 调用工具
// ============================================
export const apiCallerTool: Tool = {
  definition: {
    name: 'api_caller',
    description: '调用外部 API。支持 GET、POST、PUT、DELETE 等 HTTP 请求。',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'API 地址',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'HTTP 方法',
        },
        headers: {
          type: 'string',
          description: '请求头（JSON 格式）',
        },
        body: {
          type: 'string',
          description: '请求体（JSON 格式，POST/PUT 时使用）',
        },
      },
      required: ['url', 'method'],
    },
  },
  async execute(args): Promise<ToolResult> {
    const { url, method, headers, body } = args;

    try {
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(headers ? JSON.parse(headers) : {}),
        },
      };

      if (body && (method === 'POST' || method === 'PUT')) {
        options.body = body;
      }

      const response = await fetch(url, options);
      const data = await response.json();

      return {
        success: true,
        data: {
          status: response.status,
          statusText: response.statusText,
          data,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `API 调用失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  },
};

// ============================================
// 注册所有工具
// ============================================
export function registerAllTools(): void {
  toolRegistry.register(webSearchTool);
  toolRegistry.register(calculatorTool);
  toolRegistry.register(codeExecutorTool);
  toolRegistry.register(fileOperationsTool);
  toolRegistry.register(apiCallerTool);
  toolRegistry.register(knowledgeSearchTool);
}

// ============================================
// 6. 知识库搜索工具（RAG）
// ============================================

// 运行时存储 apiConfig（由 API route 设置）
// embedding 必须显式配置，不自动借用聊天用的 apiKey/baseURL
let ragApiConfig = { apiKey: '', baseURL: '', embeddingApiKey: '', embeddingBaseURL: '', embeddingModel: '' };

export function setRagApiConfig(config: { apiKey: string; baseURL: string; embeddingApiKey?: string; embeddingBaseURL?: string; embeddingModel?: string }) {
  ragApiConfig = {
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    embeddingApiKey: config.embeddingApiKey || '',
    embeddingBaseURL: config.embeddingBaseURL || '',
    embeddingModel: config.embeddingModel || '',
  };
}

export const knowledgeSearchTool: Tool = {
  definition: {
    name: 'knowledge_search',
    description: '搜索本地知识库。当用户上传了文档后，可以用这个工具基于文档内容回答问题。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词或问题',
        },
      },
      required: ['query'],
    },
  },
  async execute(args): Promise<ToolResult> {
    const { query } = args;
    try {
      const { searchKnowledge } = await import('@/lib/rag');
      if (!ragApiConfig.embeddingApiKey || !ragApiConfig.embeddingModel) {
        return { success: false, error: '知识库未完整配置（需要 Embedding API Key、URL 和模型）' };
      }
      const results = await searchKnowledge(query, ragApiConfig.embeddingApiKey, ragApiConfig.embeddingBaseURL, 3, ragApiConfig.embeddingModel);
      if (results.length === 0) {
        return { success: true, data: { message: '知识库中没有找到相关内容', results: [] } };
      }
      return { success: true, data: { results } };
    } catch (error) {
      return { success: false, error: `知识库搜索失败: ${error instanceof Error ? error.message : '未知错误'}` };
    }
  },
};

// 导出工具注册表
export { toolRegistry } from './base';
