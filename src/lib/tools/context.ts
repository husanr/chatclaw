// ============================================
// 工具共享运行时上下文
// ============================================
//
// 🧠 设计说明：
// 集中管理 Agent 运行时的可变状态，供所有工具导入：
// - allowedDir: 用户指定的工作目录（文件/Shell 操作的安全边界）
// - chatCredentials: 当前对话的模型凭据（图片生成、subagent 等工具复用）
// 独立成模块避免 tools/index.ts 与各工具文件之间的循环依赖。
// ============================================

// 允许的文件目录（由前端传入，运行时设置）
let allowedDir = '/tmp';

export function setAllowedDir(dir: string): void {
  allowedDir = dir;
}

export function getAllowedDir(): string {
  return allowedDir;
}

// 当前对话使用的 API 凭据（由 chat route 设置），供图片生成、subagent 等工具默认复用
interface ChatCredentials {
  apiKey: string;
  baseURL: string;
  model: string;
}

let chatCredentials: ChatCredentials = { apiKey: '', baseURL: '', model: '' };

export function setChatCredentials(c: { apiKey: string; baseURL: string; model?: string }): void {
  chatCredentials = { apiKey: c.apiKey, baseURL: c.baseURL, model: c.model || '' };
}

export function getChatCredentials(): ChatCredentials {
  return chatCredentials;
}