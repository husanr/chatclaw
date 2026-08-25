// ============================================
// IM 会话存储（飞书 / Telegram 等即时通讯渠道）
// ============================================
//
// 🧠 设计说明：
// Web 端把对话历史存在浏览器 localStorage，IM 端没有浏览器，
// 所以历史存在服务端：内存 Map + JSON 文件落盘（模式同 config.ts）。
// - 每个渠道用户一条会话（key = channel:userId）
// - 消息处理串行化（同一用户的消息排队，避免并发错乱）
// - 落盘防抖（500ms），避免每条消息都写一次盘
// ============================================

import fs from 'fs/promises';
import path from 'path';
import type { Message } from '@/types';

export interface ImPendingApproval {
  kind: 'approval';
  requestId: string;
  toolName: string;
  toolArgs: Record<string, any>;
  toolDescription: string;
  createdAt: number;
}

export interface ImSession {
  userId: string;
  channel: string;
  messages: Message[];   // 完整对话历史（含 toolCalls 等结构化字段）
  updatedAt: number;
  pending?: ImPendingApproval | null;  // 挂起的审批请求（IM 审批流用）
}

const SESSION_FILE = path.join(process.cwd(), 'data', 'im-sessions.json');

const sessions = new Map<string, ImSession>();
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// 同一用户的消息处理锁（Promise 链，串行执行）
const userLocks = new Map<string, Promise<unknown>>();

function sessionKey(channel: string, userId: string): string {
  return `${channel}:${userId}`;
}

async function loadSessions(): Promise<void> {
  if (loaded) return;
  try {
    const data = await fs.readFile(SESSION_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    for (const [k, v] of Object.entries(parsed)) {
      sessions.set(k, v as ImSession);
    }
  } catch {
    // 首次启动或文件不存在：空会话
  }
  loaded = true;
}

// 防抖落盘
function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await fs.mkdir(path.dirname(SESSION_FILE), { recursive: true });
      const snapshot = Object.fromEntries(sessions.entries());
      await fs.writeFile(SESSION_FILE, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch (e) {
      console.warn('⚠️ IM 会话落盘失败（降级为纯内存）:', e instanceof Error ? e.message : e);
    }
  }, 500);
}

/** 获取（或创建）渠道用户的会话 */
export async function getSession(channel: string, userId: string): Promise<ImSession> {
  await loadSessions();
  const key = sessionKey(channel, userId);
  let session = sessions.get(key);
  if (!session) {
    session = { userId, channel, messages: [], updatedAt: Date.now() };
    sessions.set(key, session);
  }
  return session;
}

/** 更新并持久化会话 */
export async function saveSession(session: ImSession): Promise<void> {
  session.updatedAt = Date.now();
  sessions.set(sessionKey(session.channel, session.userId), session);
  scheduleSave();
}

/** 清空某用户会话（/reset 命令用） */
export async function resetSession(channel: string, userId: string): Promise<void> {
  await loadSessions();
  sessions.delete(sessionKey(channel, userId));
  scheduleSave();
}

/**
 * 同一用户串行执行任务（防并发错乱）。
 * 用法：await withUserLock(channel, userId, async () => { ... })
 */
export async function withUserLock<T>(
  channel: string,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = sessionKey(channel, userId);
  const prev = userLocks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  // 链尾的 finally 清理，避免锁永久占用
  userLocks.set(
    key,
    next.catch(() => {}),
  );
  try {
    return await next;
  } finally {
    if (userLocks.get(key) === (next.catch(() => {}) as Promise<unknown>)) {
      userLocks.delete(key);
    }
  }
}