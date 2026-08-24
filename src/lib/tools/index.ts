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
import { getConfigAll, getConfig, setConfig } from '../config';
import { storeMemory, listMemory, recallMemory, forgetMemory } from '../memory';
import { setAllowedDir, getAllowedDir, setChatCredentials, getChatCredentials } from './context';
import { shellExecutorTool } from './shell';
import { backgroundTaskTool } from './jobs';
import { subagentTool } from './subagent';
import { askUserTool } from './askUser';

// 重新导出运行上下文（保持既有 import 路径兼容：route.ts 从 '@/lib/tools' 导入）
export { setAllowedDir, getAllowedDir, setChatCredentials, getChatCredentials };

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
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.vercel', 'dist', 'build', 'coverage', '.hermes']);
const TEXT_EXTS = new Set(['.txt', '.md', '.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.html', '.vue', '.py', '.yml', '.yaml', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.sh', '.example']);

// 递归收集目录下所有文件（跳过大目录）
async function collectAllFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      out.push(...(await collectAllFiles(full)));
    } else if (e.isFile()) {
      out.push(full);
    }
  }
  return out;
}

// 只保留文本类文件（grep 用）
async function collectTextFiles(dir: string): Promise<string[]> {
  const all = await collectAllFiles(dir);
  return all.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return TEXT_EXTS.has(ext) || /^\.env/.test(path.basename(f));
  });
}

// 正则构造：非法正则时降级为字面量匹配
function safeRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'm');
  } catch {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'm');
  }
}

// glob 转正则：支持 **、*、?
function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export const fileOperationsTool: Tool = {
  definition: {
    name: 'file_operations',
    description: '文件操作。read(读取)、write(写入)、list(列目录)、edit(字符串替换编辑，oldString→newString，可 replaceAll)、grep(正则全文搜索，返回 文件:行号:内容)、glob(按模式匹配文件，如 src/**/*.ts)。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'write', 'list', 'edit', 'grep', 'glob'],
          description: '操作类型: read(读取), write(写入), list(列出目录), edit(替换编辑), grep(文本搜索), glob(匹配文件)',
        },
        path: {
          type: 'string',
          description: '文件或目录路径',
        },
        content: {
          type: 'string',
          description: '写入的内容（仅 write 操作需要）',
        },
        oldString: {
          type: 'string',
          description: 'edit: 要被替换的旧文本',
        },
        newString: {
          type: 'string',
          description: 'edit: 替换后的新文本',
        },
        replaceAll: {
          type: 'boolean',
          description: 'edit: 替换所有匹配（默认只替换第一处）',
        },
        pattern: {
          type: 'string',
          description: 'grep: 搜索的正则表达式或关键词；glob: 文件匹配模式',
        },
        maxResults: {
          type: 'number',
          description: 'grep/glob: 最多返回结果数（默认 50 / 100）',
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
      const resolvedAllowed = path.resolve(getAllowedDir());
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
        case 'edit': {
          const oldString = String(args.oldString ?? '');
          const newString = String(args.newString ?? '');
          if (!oldString) return { success: false, error: 'edit 操作需要 oldString 参数' };
          const raw = await fs.readFile(resolved, 'utf-8');
          if (!raw.includes(oldString)) {
            return { success: false, error: `未在文件中找到要替换的文本: "${oldString.slice(0, 80)}"（edit 要求精确匹配，可先 read 确认内容）` };
          }
          const count = args.replaceAll ? raw.split(oldString).length - 1 : 1;
          const updated = args.replaceAll
            ? raw.split(oldString).join(newString)
            : raw.replace(oldString, newString);
          await fs.writeFile(resolved, updated, 'utf-8');
          return {
            success: true,
            data: {
              path: resolved,
              message: `已替换 ${count} 处`,
              preview: updated.slice(0, 500),
            },
          };
        }
        case 'grep': {
          const pattern = String(args.pattern ?? '');
          if (!pattern) return { success: false, error: 'grep 操作需要 pattern 参数' };
          const maxResults = Math.min(Number(args.maxResults) || 50, 200);
          const isDir = (await fs.stat(resolved)).isDirectory();
          const root = isDir ? resolved : path.dirname(resolved);
          const files = await collectTextFiles(root);
          const regex = safeRegex(pattern);
          const matches: { file: string; line: number; text: string }[] = [];
          for (const f of files) {
            if (matches.length >= maxResults) break;
            try {
              const lines = (await fs.readFile(f, 'utf-8')).split('\n');
              for (let i = 0; i < lines.length; i++) {
                if (regex.test(lines[i])) {
                  matches.push({
                    file: path.relative(root, f),
                    line: i + 1,
                    text: lines[i].trim().slice(0, 200),
                  });
                  if (matches.length >= maxResults) break;
                }
              }
            } catch {
              // 二进制/不可读文件跳过
            }
          }
          return { success: true, data: { pattern, matches, total: matches.length } };
        }
        case 'glob': {
          const pattern = String(args.pattern || path.basename(resolved));
          const isDir = (await fs.stat(resolved)).isDirectory();
          const root = isDir ? resolved : path.dirname(resolved);
          const maxResults = Math.min(Number(args.maxResults) || 100, 500);
          const rx = globToRegExp(pattern);
          const files = await collectAllFiles(root);
          const matched = files
            .map((f) => path.relative(root, f))
            .filter((rel) => rx.test(rel))
            .slice(0, maxResults);
          return { success: true, data: { pattern, files: matched, total: matched.length } };
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
// 5. 应用配置工具（让 agent 能运行时配置，改完立即生效）
// ============================================
export const appConfigTool: Tool = {
  definition: {
    name: 'app_config',
    description: '读取或修改应用的持久化配置。例如配置图片生成模型的 API 地址（imageBaseURL）、模型名（imageModel）、API Key（imageApiKey）。修改后立即生效，后续工具调用会使用新配置。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set', 'list'],
          description: '操作类型: list(列出所有), get(读取单个), set(设置)',
        },
        key: {
          type: 'string',
          description: '配置键，如 imageBaseURL、imageModel、imageApiKey',
        },
        value: {
          type: 'string',
          description: '配置值（set 时使用）',
        },
      },
      required: ['action'],
    },
  },
  async execute(args): Promise<ToolResult> {
    const { action, key, value } = args;
    try {
      if (action === 'list') {
        const all = await getConfigAll();
        return { success: true, data: { config: all } };
      }
      if (action === 'get') {
        if (!key) return { success: false, error: 'get 操作需要 key 参数' };
        const v = await getConfig(key);
        return { success: true, data: { key, value: v ?? null } };
      }
      if (action === 'set') {
        if (!key) return { success: false, error: 'set 操作需要 key 参数' };
        if (value === undefined || value === null) return { success: false, error: 'set 操作需要 value 参数' };
        await setConfig(key, value);
        return { success: true, data: { key, value, message: `已保存配置 ${key} = ${value}` } };
      }
      return { success: false, error: `不支持的操作: ${action}` };
    } catch (error) {
      return { success: false, error: `配置操作失败: ${error instanceof Error ? error.message : String(error)}` };
    }
  },
};

// ============================================
// 5.5 图片生成工具（地址/模型从配置读取，非写死）
// ============================================
export const imageGeneratorTool: Tool = {
  definition: {
    name: 'image_generator',
    description: '根据文字描述调用图片生成 API，返回图片 URL。默认复用当前对话模型的 API Key 和 BaseURL；如需不同的图片服务，用 app_config 配置 imageBaseURL/imageApiKey/imageModel 覆盖。',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '图片的文字描述',
        },
        size: {
          type: 'string',
          description: '图片尺寸，如 1024x1024（可选）',
        },
      },
      required: ['prompt'],
    },
  },
  async execute(args): Promise<ToolResult> {
    const { prompt, size } = args;
    try {
      // 优先用 app_config 覆盖值，否则默认复用当前对话凭据
      const creds = getChatCredentials();
      const baseURL = String(await getConfig('imageBaseURL') || '').trim() || creds.baseURL;
      const apiKey = String(await getConfig('imageApiKey') || '').trim() || creds.apiKey;
      const model = String(await getConfig('imageModel') || '').trim() || 'dall-e-3';

      if (!baseURL) {
        return { success: false, error: '未配置图片 API 地址（当前对话也无 BaseURL）。可用 app_config 设置 imageBaseURL，或先发起一次对话' };
      }

      const base = baseURL.replace(/\/+$/, '');
      const url = base.endsWith('/v1') ? `${base}/images/generations` : `${base}/v1/images/generations`;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, prompt, n: 1, ...(size ? { size } : {}) }),
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `图片生成失败: ${res.status} ${err.substring(0, 200)}` };
      }

      const data = await res.json();
      const images = (data.data || [])
        .map((d: any) => d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : null))
        .filter(Boolean);
      return { success: true, data: { images, model, url } };
    } catch (error) {
      return { success: false, error: `图片生成失败: ${error instanceof Error ? error.message : String(error)}` };
    }
  },
};

// ============================================
// 7. 时钟工具
// ============================================
export const getTimeTool: Tool = {
  definition: {
    name: 'get_time',
    description: '获取当前的日期和时间（北京时间）。用于回答"今天几号""现在几点"等。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  async execute(): Promise<ToolResult> {
    const now = new Date();
    return {
      success: true,
      data: {
        iso: now.toISOString(),
        beijing: now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        weekday: now.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', weekday: 'long' }),
        unix: now.getTime(),
      },
    };
  },
};

// ============================================
// 8. 网页抓取工具
// ============================================
export const webpageFetchTool: Tool = {
  definition: {
    name: 'webpage_fetch',
    description: '抓取网页并返回可读文本内容（去除 HTML 标签）。用于读取 web_search 摘要之外的完整内容。',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要抓取的网页地址' },
      },
      required: ['url'],
    },
  },
  async execute(args): Promise<ToolResult> {
    const { url } = args;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChatClaw/1.0)' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return { success: false, error: `抓取失败: ${res.status}` };
      const html = await res.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const truncated = text.length > 8000 ? text.slice(0, 8000) + '...' : text;
      return { success: true, data: { url, contentLength: text.length, content: truncated } };
    } catch (error) {
      return { success: false, error: `抓取失败: ${error instanceof Error ? error.message : String(error)}` };
    }
  },
};

// ============================================
// 9. 长期记忆工具
// ============================================
export const memoryTool: Tool = {
  definition: {
    name: 'memory',
    description: '长期记忆：跨会话记住或回忆信息。store 保存一条事实，recall 按关键词回忆，list 列出全部，forget 删除。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['store', 'recall', 'list', 'forget'], description: '操作' },
        content: { type: 'string', description: 'store: 想记住的内容；recall: 搜索关键词；forget: id 或内容' },
      },
      required: ['action'],
    },
  },
  async execute(args): Promise<ToolResult> {
    const { action, content } = args;
    try {
      switch (action) {
        case 'store': {
          if (!content) return { success: false, error: 'store 需要 content 参数' };
          const item = await storeMemory(content);
          return { success: true, data: { message: '已记住', id: item.id } };
        }
        case 'recall': {
          const matched = content ? await recallMemory(content) : await listMemory();
          return { success: true, data: { items: matched } };
        }
        case 'list': {
          return { success: true, data: { items: await listMemory() } };
        }
        case 'forget': {
          if (!content) return { success: false, error: 'forget 需要 content（id 或内容）' };
          const removed = await forgetMemory(content);
          return { success: true, data: { removed, message: removed ? '已删除' : '未找到匹配的记忆' } };
        }
        default:
          return { success: false, error: `不支持的操作: ${action}` };
      }
    } catch (error) {
      return { success: false, error: `记忆操作失败: ${error instanceof Error ? error.message : String(error)}` };
    }
  },
};

// ============================================
// 10. 动态工具加载工具（自我扩展）
// ============================================
// 从 allowedDir 内的文件动态加载并注册一个新工具。
// 用 vm 沙箱执行（绕开 bundler 的动态 import 限制），工具文件用 CommonJS module.exports 导出。
async function loadToolFromFile(filePath: string): Promise<Tool> {
  const code = await fs.readFile(filePath, 'utf-8');

  // 沙箱提供常用全局（console/fetch 等），不暴露 require/process/fs，更安全
  const sandbox: any = {
    console,
    fetch,
    Math, JSON, Date, Object, Array, String, Number, Boolean, RegExp,
    Map, Set, Promise, Uint8Array,
    setTimeout, clearTimeout, setInterval, clearInterval,
    module: { exports: {} },
    exports: {},
  };
  sandbox.exports = sandbox.module.exports;

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { timeout: 5000 });

  const tool: Tool = sandbox.module.exports ?? sandbox.tool;
  if (!tool || typeof tool.execute !== 'function' || !tool.definition?.name) {
    throw new Error('工具文件需用 CommonJS 导出 module.exports（含 definition.name 和 execute 函数）');
  }
  return tool;
}

export const reloadTool: Tool = {
  definition: {
    name: 'reload_tool',
    description: '动态加载/卸载工具，让 agent 能给自己扩展新能力。register：从文件加载并注册新工具。工具文件须为自包含的 .js 文件（须在 allowedDir 内），用 CommonJS 写 module.exports = { definition: {name,description,parameters}, execute(args) }，execute 内可用 fetch 调外部 API、console 输出。unregister：按名称卸载；list：列出已注册工具。加载前先用 file_operations write 写好 .js 文件。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['register', 'unregister', 'list'], description: '操作' },
        file: { type: 'string', description: 'register 时加载的工具文件路径（须在 allowedDir 内）' },
        name: { type: 'string', description: 'unregister 时的工具名' },
      },
      required: ['action'],
    },
  },
  async execute(args): Promise<ToolResult> {
    const { action, file, name } = args;
    try {
      if (action === 'list') {
        return { success: true, data: { tools: toolRegistry.list() } };
      }
      if (action === 'register') {
        if (!file) return { success: false, error: 'register 需要 file 参数' };
        const resolved = path.resolve(file);
        const allowed = path.resolve(getAllowedDir());
        if (!resolved.startsWith(allowed + '/') && resolved !== allowed) {
          return { success: false, error: `安全限制：工具文件须在 ${allowed} 目录内` };
        }
        const tool = await loadToolFromFile(resolved);
        toolRegistry.register(tool);
        toolRegistry.enableDynamic(tool.definition.name);
        return { success: true, data: { message: `已加载并注册工具 ${tool.definition.name}` } };
      }
      if (action === 'unregister') {
        if (!name) return { success: false, error: 'unregister 需要 name 参数' };
        const removed = toolRegistry.unregister(name);
        return { success: true, data: { removed, message: removed ? `已卸载 ${name}` : `未找到 ${name}` } };
      }
      return { success: false, error: `不支持的操作: ${action}` };
    } catch (error) {
      return { success: false, error: `工具加载失败: ${error instanceof Error ? error.message : String(error)}` };
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
  toolRegistry.register(appConfigTool);
  toolRegistry.register(imageGeneratorTool);
  toolRegistry.register(getTimeTool);
  toolRegistry.register(webpageFetchTool);
  toolRegistry.register(memoryTool);
  toolRegistry.register(reloadTool);
  // v1 新增：真实 shell / 后台任务 / 子 Agent 委派 / 用户提问
  toolRegistry.register(shellExecutorTool);
  toolRegistry.register(backgroundTaskTool);
  toolRegistry.register(subagentTool);
  toolRegistry.register(askUserTool);
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
