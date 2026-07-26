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
      // 实际项目中，这里会调用搜索 API（如 SerpAPI、Tavily）
      // 这里用模拟数据演示
      const results = [
        {
          title: `${query} - 最新资讯`,
          snippet: `关于${query}的最新信息...`,
          url: `https://example.com/search?q=${encodeURIComponent(query)}`,
        },
        {
          title: `${query} - 百科`,
          snippet: `${query}的详细介绍和相关知识...`,
          url: `https://baike.example.com/${encodeURIComponent(query)}`,
        },
      ];

      return {
        success: true,
        data: results,
      };
    } catch (error) {
      return { success: false, error: '搜索失败' };
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
      // 安全的数学表达式计算
      // 使用 Function 构造器创建沙箱环境
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
      const result = new Function(`"use strict"; return (${sanitized})`)();

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
      // ⚠️ 实际项目中必须使用沙箱（如 VM2）执行代码！
      // 这里仅为演示，直接执行有安全风险
      const logs: string[] = [];
      const mockConsole = {
        log: (...args: any[]) => logs.push(args.map(String).join(' ')),
        error: (...args: any[]) => logs.push('[ERROR] ' + args.map(String).join(' ')),
      };

      // 创建一个安全的执行环境
      const fn = new Function('console', `"use strict"; ${code}`);
      const result = fn(mockConsole);

      return {
        success: true,
        data: {
          output: logs.length > 0 ? logs.join('\n') : String(result),
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
    const { action, path, content } = args;

    // 实际项目中需要：
    // 1. 验证路径安全性（防止访问敏感文件）
    // 2. 使用 fs 模块操作文件
    // 3. 添加权限控制

    return {
      success: true,
      data: {
        action,
        path,
        message: `文件操作 "${action}" 已执行（示例模式）`,
      },
    };
  },
};

// ============================================
// 5. 数据库查询工具
// ============================================
export const databaseQueryTool: Tool = {
  definition: {
    name: 'database_query',
    description: '执行数据库查询。支持 SQL 查询语句。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SQL 查询语句',
        },
        database: {
          type: 'string',
          description: '数据库名称（可选）',
        },
      },
      required: ['query'],
    },
  },
  async execute(args): Promise<ToolResult> {
    const { query, database } = args;

    // 实际项目中需要：
    // 1. 连接数据库（SQLite/PostgreSQL/MySQL）
    // 2. 验证 SQL 安全性（防止 SQL 注入）
    // 3. 执行查询并返回结果

    return {
      success: true,
      data: {
        query,
        database: database || 'default',
        message: `查询已执行（示例模式）`,
        rows: [],
      },
    };
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
// 7. 邮件发送工具
// ============================================
export const emailSenderTool: Tool = {
  definition: {
    name: 'email_sender',
    description: '发送邮件。可以发送给指定收件人。',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: '收件人邮箱',
        },
        subject: {
          type: 'string',
          description: '邮件主题',
        },
        body: {
          type: 'string',
          description: '邮件内容',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  async execute(args): Promise<ToolResult> {
    const { to, subject, body } = args;

    // 实际项目中需要：
    // 1. 配置 SMTP 服务器（Nodemailer）
    // 2. 验证邮箱格式
    // 3. 发送邮件

    return {
      success: true,
      data: {
        to,
        subject,
        message: `邮件已发送给 ${to}（示例模式）`,
      },
    };
  },
};

// ============================================
// 8. 图片生成工具
// ============================================
export const imageGeneratorTool: Tool = {
  definition: {
    name: 'image_generator',
    description: '根据文字描述生成图片。支持指定尺寸和风格。',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '图片描述',
        },
        size: {
          type: 'string',
          enum: ['256x256', '512x512', '1024x1024'],
          description: '图片尺寸（默认 512x512）',
        },
        style: {
          type: 'string',
          enum: ['realistic', 'cartoon', 'abstract', 'anime'],
          description: '图片风格（默认 realistic）',
        },
      },
      required: ['prompt'],
    },
  },
  async execute(args): Promise<ToolResult> {
    const { prompt, size = '512x512', style = 'realistic' } = args;

    // 实际项目中需要调用：
    // - DALL-E API (OpenAI)
    // - Stable Diffusion API
    // - Midjourney API

    return {
      success: true,
      data: {
        prompt,
        size,
        style,
        message: `图片已生成（示例模式）`,
        imageUrl: `https://placeholder.com/${size}?text=${encodeURIComponent(prompt.substring(0, 20))}`,
      },
    };
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
  toolRegistry.register(databaseQueryTool);
  toolRegistry.register(apiCallerTool);
  toolRegistry.register(emailSenderTool);
  toolRegistry.register(imageGeneratorTool);
}

// 导出工具注册表
export { toolRegistry } from './base';
