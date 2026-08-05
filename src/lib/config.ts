// ============================================
// 应用配置存储：模块级内存 + 文件持久化
// ============================================
//
// 🧠 原理讲解：
// 让 agent 能"运行时配置"（比如图片生成 API 地址），配置改变后立即生效、跨请求保留。
//
// 存储策略：
// - 内存：模块级变量，读取快
// - 文件：懒加载 + 每次 set 后持久化到 {项目}/data/app-config.json
//   这样下次启动 / 下次请求还能读到（本地开发场景足够）
//
// 注意：文件写入失败时降级为纯内存（不崩溃），适合只读部署环境。
// ============================================

import fs from 'fs/promises';
import path from 'path';

export type ConfigValue = string | number | boolean;

const CONFIG_FILE = path.join(process.cwd(), 'data', 'app-config.json');

let config: Record<string, ConfigValue> = {};
let loaded = false;

async function loadConfig(): Promise<void> {
  if (loaded) return;
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    config = JSON.parse(data);
  } catch {
    config = {};
  }
  loaded = true;
}

async function saveConfig(): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/** 读取全部配置 */
export async function getConfigAll(): Promise<Record<string, ConfigValue>> {
  await loadConfig();
  return { ...config };
}

/** 读取单个配置（不存在返回 undefined） */
export async function getConfig(key: string): Promise<ConfigValue | undefined> {
  await loadConfig();
  return config[key];
}

/** 写入配置并持久化（写入失败降级为内存） */
export async function setConfig(key: string, value: ConfigValue): Promise<void> {
  await loadConfig();
  config[key] = value;
  try {
    await saveConfig();
  } catch (e) {
    console.warn('[config] 持久化失败，仅保存在内存:', e instanceof Error ? e.message : e);
  }
}