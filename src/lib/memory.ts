// ============================================
// 长期记忆存储：跨会话记住事实
// ============================================
//
// 🧠 原理讲解：
// 让 agent 能记住跨会话的信息（用户偏好、历史结论等）。
// 存储策略与 config.ts 一致：模块内存 + 文件持久化到 {项目}/data/memory.json
// ============================================

import fs from 'fs/promises';
import path from 'path';

export interface MemoryItem {
  id: string;
  content: string;
  createdAt: string;
}

const MEMORY_FILE = path.join(process.cwd(), 'data', 'memory.json');

let items: MemoryItem[] = [];
let loaded = false;

async function loadMemory(): Promise<void> {
  if (loaded) return;
  try {
    const data = await fs.readFile(MEMORY_FILE, 'utf-8');
    items = JSON.parse(data);
  } catch {
    items = [];
  }
  loaded = true;
}

async function saveMemory(): Promise<void> {
  await fs.mkdir(path.dirname(MEMORY_FILE), { recursive: true });
  await fs.writeFile(MEMORY_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

/** 记住一条事实 */
export async function storeMemory(content: string): Promise<MemoryItem> {
  await loadMemory();
  const item: MemoryItem = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    content,
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  try { await saveMemory(); } catch { /* 降级为纯内存 */ }
  return item;
}

/** 列出全部记忆 */
export async function listMemory(): Promise<MemoryItem[]> {
  await loadMemory();
  return [...items];
}

/** 按关键词回忆（大小写不敏感的子串匹配） */
export async function recallMemory(query: string): Promise<MemoryItem[]> {
  await loadMemory();
  const q = query.toLowerCase();
  return items.filter(i => i.content.toLowerCase().includes(q));
}

/** 删除记忆（按 id 或内容子串匹配），返回是否删除成功 */
export async function forgetMemory(idOrContent: string): Promise<boolean> {
  await loadMemory();
  const before = items.length;
  items = items.filter(i => i.id !== idOrContent && !i.content.includes(idOrContent));
  if (items.length < before) {
    try { await saveMemory(); } catch { /* 降级 */ }
    return true;
  }
  return false;
}