// ============================================
// RAG 核心模块：Embedding + 向量存储 + 文档分块
// ============================================

import fs from 'fs/promises';
import path from 'path';

// ---- 类型 ----
export interface DocumentChunk {
  id: string;
  content: string;
  metadata: { source: string; chunkIndex: number };
  embedding?: number[];
}

export interface SearchResult {
  content: string;
  source: string;
  score: number;
}

// ---- Embedding（调 API）----
async function getEmbedding(
  text: string,
  apiKey: string,
  baseURL: string,
  model: string,
): Promise<number[]> {
  // 拼接 URL：如果 baseURL 已经以 /v1 结尾就直接加 /embeddings，否则加 /v1/embeddings
  const base = baseURL.replace(/\/+$/, '');
  const url = base.endsWith('/v1') ? `${base}/embeddings` : `${base}/v1/embeddings`;
  console.log(`[RAG] 请求 Embedding: ${url}, model: ${model}, input长度: ${text.length}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`[RAG] Embedding API 失败: ${res.status}`, err);
    throw new Error(`Embedding API ${res.status} [${url}]: ${err.substring(0, 200)}`);
  }
  const data = await res.json();
  if (!data.data?.[0]?.embedding) {
    throw new Error(`Embedding 返回格式异常: ${JSON.stringify(data).substring(0, 200)}`);
  }
  return data.data[0].embedding;
}

// ---- 文档分块 ----
function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  // 按段落先分
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 0);
  let buffer = '';

  for (const para of paragraphs) {
    if (buffer.length + para.length > chunkSize && buffer.length > 0) {
      chunks.push(buffer.trim());
      // 保留 overlap
      buffer = buffer.slice(-overlap) + '\n\n' + para;
    } else {
      buffer += (buffer ? '\n\n' : '') + para;
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());

  // 如果单段太长，按字符强制切
  const result: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= chunkSize * 2) {
      result.push(chunk);
    } else {
      for (let i = 0; i < chunk.length; i += chunkSize - overlap) {
        result.push(chunk.slice(i, i + chunkSize));
      }
    }
  }
  return result;
}

// ---- 余弦相似度 ----
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

// ---- 向量存储（内存 + 文件持久化）----
const STORE_FILE = '/tmp/ai-agent-rag-store.json';
let chunks: DocumentChunk[] = [];
let storeLoaded = false;

async function loadStore() {
  if (storeLoaded) return;
  try {
    const data = await fs.readFile(STORE_FILE, 'utf-8');
    chunks = JSON.parse(data);
  } catch { chunks = []; }
  storeLoaded = true;
}

async function saveStore() {
  await fs.writeFile(STORE_FILE, JSON.stringify(chunks), 'utf-8');
}

// ---- 公开 API ----

/** 自动选择 embedding 模型 */
function pickEmbeddingModel(baseURL: string, chatModel: string): string {
  const url = baseURL.toLowerCase();
  if (url.includes('deepseek')) return 'deepseek-embedding-v1';
  if (url.includes('openai') || url.includes('api.openai')) return 'text-embedding-3-small';
  if (url.includes('zhipu') || url.includes('bigmodel')) return 'embedding-3';
  if (url.includes('dashscope') || url.includes('aliyun')) return 'qwen3.7-text-embedding';
  if (url.includes('volces') || url.includes('ark')) return 'doubao-embedding';
  // 默认用 OpenAI 兼容的
  return 'text-embedding-3-small';
}

/** 索引文档：分块 → embedding → 存储 */
export async function indexDocument(
  content: string,
  source: string,
  apiKey: string,
  baseURL: string,
  model?: string,
): Promise<{ chunks: number; source: string }> {
  await loadStore();

  // 先删除同一来源的旧数据
  chunks = chunks.filter(c => c.metadata.source !== source);

  const textChunks = chunkText(content);
  const embeddingModel = model || pickEmbeddingModel(baseURL, '');
  console.log(`[RAG] 索引文档: ${source}, ${textChunks.length} 个片段, embedding模型: ${embeddingModel}`);
  let indexed = 0;
  const errors: string[] = [];

  for (let i = 0; i < textChunks.length; i++) {
    try {
      const embedding = await getEmbedding(textChunks[i], apiKey, baseURL, embeddingModel);
      chunks.push({
        id: `${source}_${i}`,
        content: textChunks[i],
        metadata: { source, chunkIndex: i },
        embedding,
      });
      indexed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`片段${i}: ${msg}`);
      console.error(`Embedding failed for chunk ${i} of ${source}:`, msg);
    }
  }

  await saveStore();

  if (indexed === 0 && textChunks.length > 0) {
    throw new Error(`所有片段索引失败。文档产生了 ${textChunks.length} 个片段但 Embedding 全部失败。错误: ${errors.join('; ')}`);
  }

  return { chunks: indexed, source };
}

/** 搜索知识库 */
export async function searchKnowledge(
  query: string,
  apiKey: string,
  baseURL: string,
  topK = 3,
  model?: string,
): Promise<SearchResult[]> {
  await loadStore();

  if (chunks.length === 0) return [];

  const embeddingModel = model || pickEmbeddingModel(baseURL, '');
  const queryEmbedding = await getEmbedding(query, apiKey, baseURL, embeddingModel);

  const scored = chunks
    .filter(c => c.embedding)
    .map(c => ({
      content: c.content,
      source: c.metadata.source,
      score: cosineSimilarity(queryEmbedding, c.embedding!),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

/** 列出已索引的文档 */
export async function listDocuments(): Promise<{ source: string; chunks: number }[]> {
  await loadStore();
  const sources: Record<string, number> = {};
  for (const c of chunks) {
    sources[c.metadata.source] = (sources[c.metadata.source] || 0) + 1;
  }
  return Object.entries(sources).map(([source, count]) => ({ source, chunks: count }));
}

/** 删除文档 */
export async function deleteDocument(source: string): Promise<boolean> {
  await loadStore();
  const before = chunks.length;
  chunks = chunks.filter(c => c.metadata.source !== source);
  if (chunks.length < before) {
    await saveStore();
    return true;
  }
  return false;
}
