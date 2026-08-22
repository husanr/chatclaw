'use client';

import ReactMarkdown, { Components } from 'react-markdown';

// Markdown 渲染组件：把 LLM 输出的 md 正确格式化为富文本
// 用组件覆写的方式给各元素套样式，避免引入 typography 插件

const components: Components = {
  p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
  h1: ({ children }) => <h1 className="text-xl font-bold my-2">{children}</h1>,
  h2: ({ children }) => <h2 className="text-lg font-bold my-2">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-semibold my-1.5">{children}</h3>,
  h4: ({ children }) => <h4 className="text-sm font-semibold my-1">{children}</h4>,
  ul: ({ children }) => <ul className="list-disc pl-5 my-1.5 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 my-1.5 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  hr: () => <hr className="my-3 border-slate-200 dark:border-slate-700" />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-slate-300 dark:border-slate-600 pl-3 my-2 text-slate-600 dark:text-slate-300">{children}</blockquote>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline break-all">{children}</a>
  ),
  img: ({ src, alt }) => (
    <img src={src} alt={alt} className="max-w-full rounded-lg my-2" loading="lazy" />
  ),
  pre: ({ children }) => (
    <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 my-2 overflow-x-auto text-xs leading-relaxed">{children}</pre>
  ),
  // 代码块（带 language- 前缀）不套内联样式；行内代码套内联背景
  code: ({ className, children }) => {
    const isBlock = className?.includes('language-') === true;
    if (isBlock) return <code className="text-slate-100">{children}</code>;
    return <code className="bg-slate-200 dark:bg-slate-700 rounded px-1 py-0.5 text-xs">{children}</code>;
  },
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-slate-300 dark:border-slate-600 px-2 py-1 text-left bg-slate-100 dark:bg-slate-700">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-slate-300 dark:border-slate-600 px-2 py-1">{children}</td>
  ),
};

export function MarkdownMessage({ content }: { content: string }) {
  return <div className="whitespace-normal"><ReactMarkdown components={components}>{content}</ReactMarkdown></div>;
}