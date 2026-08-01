'use client';

import { useState, useEffect } from 'react';

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

  // 实际用的 embedding key/url（优先用户单独配置，否则用主 API 的）
  const effectiveEmbKey = embKey || embeddingApiKey || apiKey;
  const effectiveEmbURL = embURL || embeddingBaseURL || baseURL;

  const loadDocs = async () => {
    try {
      const res = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', apiKey: effectiveEmbKey, baseURL: effectiveEmbURL }),
      });
      const data = await res.json();
      if (data.success) setDocs(data.documents);
    } catch {}
  };

  useEffect(() => { loadDocs(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(`正在索引 ${file.name}...`);

    try {
      const content = await file.text();
      const res = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'index',
          content,
          source: file.name,
          apiKey: effectiveEmbKey,
          baseURL: effectiveEmbURL,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`✅ ${file.name} 已索引（${data.chunks} 个片段）`);
        loadDocs();
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

  const handleDelete = async (source: string) => {
    try {
      await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', source, apiKey: effectiveEmbKey, baseURL: effectiveEmbURL }),
      });
      loadDocs();
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
