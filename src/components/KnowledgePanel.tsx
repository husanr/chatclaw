'use client';

import { useState, useEffect, useCallback } from 'react';

interface KnowledgePanelProps {
  apiKey: string;
  baseURL: string;
  embeddingApiKey?: string;
  embeddingBaseURL?: string;
}

interface DocInfo {
  source: string;
  chunks: number;
}

// ---- IndexedDB 工具函数 ----
const DB_NAME = 'chatclaw-rag';
const DB_VERSION = 1;
const STORE_NAME = 'chunks';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToIndexedDB(chunks: unknown[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  for (const chunk of chunks) {
    store.put(chunk);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadFromIndexedDB(): Promise<unknown[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const req = store.getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---- 组件 ----
export function KnowledgePanel({ apiKey, baseURL, embeddingApiKey, embeddingBaseURL }: KnowledgePanelProps) {
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [embKey, setEmbKey] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('ai-agent-embedding-key') || '';
  });
  const [embURL, setEmbURL] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('ai-agent-embedding-url') || '';
  });

  const effectiveEmbKey = embKey || embeddingApiKey || apiKey;
  const effectiveEmbURL = embURL || embeddingBaseURL || baseURL;

  // 调 RAG API
  const ragFetch = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const res = await fetch('/api/rag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, apiKey: effectiveEmbKey, baseURL: effectiveEmbURL, ...extra }),
    });
    return res.json();
  }, [effectiveEmbKey, effectiveEmbURL]);

  // 页面加载：从 IndexedDB 恢复到服务端，然后加载文档列表
  useEffect(() => {
    (async () => {
      try {
        const stored = await loadFromIndexedDB();
        if (stored.length > 0) {
          // 恢复到服务端内存
          await ragFetch('restore', { chunksData: stored });
          console.log(`[RAG] 从 IndexedDB 恢复了 ${stored.length} 个向量到服务端`);
        }
        // 加载文档列表
        const data = await ragFetch('list');
        if (data.success) setDocs(data.documents);
      } catch (e) {
        console.error('[RAG] 初始化失败:', e);
      }
    })();
  }, []);

  // 上传文件
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(`正在索引 ${file.name}...`);

    try {
      const content = await file.text();
      const data = await ragFetch('index', { content, source: file.name });
      if (data.success) {
        // 保存完整向量到 IndexedDB
        if (data.allChunks) {
          await saveToIndexedDB(data.allChunks);
          console.log(`[RAG] 已保存 ${data.allChunks.length} 个向量到 IndexedDB`);
        }
        setMessage(`✅ ${file.name} 已索引（${data.chunks} 个片段）`);
        const listData = await ragFetch('list');
        if (listData.success) setDocs(listData.documents);
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch (err) {
      setMessage(`❌ 上传失败: ${err}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // 删除文档
  const handleDelete = async (source: string) => {
    try {
      const data = await ragFetch('delete', { source });
      if (data.allChunks) {
        await saveToIndexedDB(data.allChunks);
      }
      const listData = await ragFetch('list');
      if (listData.success) setDocs(listData.documents);
    } catch {}
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
          📚 知识库
        </label>
        <label className="text-xs text-blue-500 hover:text-blue-600 cursor-pointer">
          {uploading ? '索引中...' : '+ 上传文档'}
          <input
            type="file"
            accept=".txt,.md,.json,.csv,.html,.xml,.log"
            onChange={handleUpload}
            disabled={uploading || !effectiveEmbKey}
            className="hidden"
          />
        </label>
      </div>

      {!effectiveEmbKey && (
        <p className="text-xs text-amber-500">请先填写 API Key 以启用知识库</p>
      )}

      {/* Embedding API 单独配置（可选） */}
      <details className="text-xs">
        <summary className="text-slate-400 cursor-pointer hover:text-slate-600">Embedding API 设置（可选）</summary>
        <div className="mt-1 space-y-1">
          <input
            type="text"
            value={embURL}
            onChange={e => { setEmbURL(e.target.value); localStorage.setItem('ai-agent-embedding-url', e.target.value); }}
            placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
            className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
          <input
            type="password"
            value={embKey}
            onChange={e => { setEmbKey(e.target.value); localStorage.setItem('ai-agent-embedding-key', e.target.value); }}
            placeholder="DashScope API Key"
            className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
          <p className="text-slate-400">推荐通义千问 DashScope（qwen3.7-text-embedding），免费额度</p>
        </div>
      </details>

      {message && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{message}</p>
      )}

      {docs.length > 0 ? (
        <div className="space-y-1">
          {docs.map(doc => (
            <div key={doc.source} className="flex items-center gap-2 text-xs group">
              <span className="flex-1 truncate text-slate-600 dark:text-slate-300">
                📄 {doc.source}
              </span>
              <span className="text-slate-400">{doc.chunks}段</span>
              <button
                onClick={() => handleDelete(doc.source)}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-500 transition-opacity"
              >×</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          支持 .txt .md .json .csv 等文本格式
        </p>
      )}
    </div>
  );
}
