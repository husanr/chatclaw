// ============================================
// AI Agent 主聊天界面
// ============================================
//
// 🧠 原理讲解：
// 这是用户与 Agent 交互的界面。
// 关键功能：
// 1. 消息流展示 - 显示对话历史
// 2. 工具执行可视化 - 展示 Agent 调用了哪些工具
// 3. 思考过程展示 - 展示 Agent 的推理链
// 4. 流式输出 - 实时显示 Agent 的响应
//
// ============================================

'use client';

import { useState, useRef, useEffect } from 'react';
import { ModelSelector } from '@/components/ModelSelector';
import { KnowledgePanel } from '@/components/KnowledgePanel';

// 消息类型
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  toolCalls?: ToolCallInfo[];
  timestamp: Date;
}

interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, any>;
  result?: any;
}

// 对话会话类型
interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

// 工具名称映射（中文）
const toolNameMap: Record<string, string> = {
  web_search: '网页搜索',
  calculator: '计算器',
  code_executor: '代码执行',
  file_operations: '文件操作',
  api_caller: 'API 调用',
};

// 工具图标
const toolIconMap: Record<string, string> = {
  web_search: '🔍',
  calculator: '🔢',
  code_executor: '💻',
  file_operations: '📁',
  api_caller: '🌐',
};

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentThinking, setCurrentThinking] = useState('');
  const [currentReasoning, setCurrentReasoning] = useState('');
  const [currentToolCall, setCurrentToolCall] = useState<ToolCallInfo | null>(null);
  const [model, setModel] = useState('openai-gpt-4o');
  const [apiConfig, setApiConfig] = useState({ baseURL: '', apiKey: '' });
  const [maxIterations, setMaxIterations] = useState(() => {
    if (typeof window === 'undefined') return 25;
    const v = Number(localStorage.getItem('ai-agent-max-iterations'));
    return v > 0 ? v : 25;
  });
  const [workspaceDir, setWorkspaceDir] = useState(() => {
    if (typeof window === 'undefined') return '/tmp';
    return localStorage.getItem('ai-agent-workspace') || '/tmp';
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasRestoredRef = useRef(false);

  // 挂载后从 localStorage 恢复所有会话
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    try {
      const stored = localStorage.getItem('ai-agent-conversations');
      if (stored) {
        const parsed: Conversation[] = JSON.parse(stored);
        // 恢复 Date 对象
        const restored = parsed.map(c => ({
          ...c,
          messages: c.messages.map(m => ({
            ...m,
            timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
          })),
        }));
        setConversations(restored);
        if (restored.length > 0) {
          setCurrentConvId(restored[0].id);
          setMessages(restored[0].messages);
        }
      }
    } catch {}
  }, []);

  // 保存所有会话到 localStorage
  useEffect(() => {
    if (conversations.length === 0) return;
    try {
      localStorage.setItem('ai-agent-conversations', JSON.stringify(conversations));
    } catch {}
  }, [conversations]);

  // 切换会话时同步 messages
  useEffect(() => {
    const conv = conversations.find(c => c.id === currentConvId);
    if (conv) setMessages(conv.messages);
  }, [currentConvId]);

  // 新建会话
  const newConversation = () => {
    const id = generateId();
    const conv: Conversation = { id, title: '新对话', messages: [], createdAt: Date.now() };
    setConversations(prev => [conv, ...prev]);
    setCurrentConvId(id);
    setMessages([]);
    setCurrentThinking('');
    setCurrentReasoning('');
    setCurrentToolCall(null);
  };

  // 切换会话
  const switchConversation = (id: string) => {
    if (id === currentConvId) return;
    setCurrentConvId(id);
    setCurrentThinking('');
    setCurrentReasoning('');
    setCurrentToolCall(null);
  };

  // 删除会话
  const deleteConversation = (id: string) => {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id);
      if (id === currentConvId && next.length > 0) {
        setCurrentConvId(next[0].id);
      } else if (next.length === 0) {
        const newId = generateId();
        const newConv: Conversation = { id: newId, title: '新对话', messages: [], createdAt: Date.now() };
        setCurrentConvId(newId);
        setMessages([]);
        return [newConv];
      }
      return next;
    });
  };

  // 更新当前会话的消息
  const updateCurrentMessages = (updater: (prev: Message[]) => Message[]) => {
    setMessages(prev => {
      const next = updater(prev);
      setConversations(convs => convs.map(c => {
        if (c.id !== currentConvId) return c;
        // 自动标题：取第一条用户消息的前 20 个字
        const firstUser = next.find(m => m.role === 'user');
        const title = firstUser?.content?.substring(0, 20) || '新对话';
        return { ...c, messages: next, title };
      }));
      return next;
    });
  };

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentThinking, currentToolCall]);

  // 持久化对话到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ai-agent-messages', JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // 生成唯一 ID
  const generateId = () => Math.random().toString(36).substring(2, 15);

  // 发送消息
  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    // 确保有当前会话
    if (!currentConvId) {
      newConversation();
      return;
    }

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    updateCurrentMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setCurrentThinking('');
    setCurrentReasoning('');
    setCurrentToolCall(null);

    const assistantMessageId = generateId();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      timestamp: new Date(),
    };

    const currentHistory = [...messages];

    updateCurrentMessages(prev => [...prev, assistantMessage]);

    try {
      // 调用 API，带上完整对话历史
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          config: {
            model,
            baseURL: apiConfig.baseURL,
            apiKey: apiConfig.apiKey,
            allowedDir: workspaceDir,
            maxIterations,
            embeddingApiKey: localStorage.getItem('ai-agent-embedding-key') || undefined,
            embeddingBaseURL: localStorage.getItem('ai-agent-embedding-url') || undefined,
            embeddingModel: localStorage.getItem('ai-agent-embedding-model') || undefined,
          },
          history: currentHistory.map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 处理流式响应
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'thinking':
                  setCurrentThinking(data.content);
                  break;

                case 'reasoning':
                  // DeepSeek 思考模式 - 存到消息里 + 累积到实时显示
                  setCurrentReasoning(prev => prev + data.content);
                  updateCurrentMessages(prev => prev.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, reasoning: (m.reasoning || '') + data.content }
                      : m
                  ));
                  break;

                case 'tool_call':
                  const toolCall: ToolCallInfo = {
                    id: data.toolCall.id,
                    name: data.toolCall.name,
                    args: data.toolCall.args,
                  };
                  setCurrentToolCall(toolCall);

                  // 添加到消息的工具调用列表
                  updateCurrentMessages(prev => prev.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, toolCalls: [...(m.toolCalls || []), toolCall] }
                      : m
                  ));
                  break;

                case 'tool_result':
                  setCurrentToolCall(null);

                  // 更新最后一个工具调用的结果
                  updateCurrentMessages(prev => prev.map(m => {
                    if (m.id === assistantMessageId && m.toolCalls) {
                      const updatedToolCalls = [...m.toolCalls];
                      const lastCall = updatedToolCalls[updatedToolCalls.length - 1];
                      if (lastCall) {
                        lastCall.result = data.result;
                      }
                      return { ...m, toolCalls: updatedToolCalls };
                    }
                    return m;
                  }));
                  break;

                case 'token':
                  updateCurrentMessages(prev => prev.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, content: m.content + data.content }
                      : m
                  ));
                  break;

                case 'done':
                  updateCurrentMessages(prev => prev.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, content: data.content }
                      : m
                  ));
                  setCurrentThinking('');
                  setCurrentToolCall(null);
                  break;

                case 'error':
                  updateCurrentMessages(prev => prev.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, content: `❌ 错误: ${data.content}` }
                      : m
                  ));
                  break;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error) {
      updateCurrentMessages(prev => prev.map(m =>
        m.id === assistantMessageId
          ? { ...m, content: `❌ 请求失败: ${error}` }
          : m
      ));
    } finally {
      setIsLoading(false);
      setCurrentThinking('');
      setCurrentToolCall(null);
    }
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 清空对话 = 新建会话
  const clearChat = () => {
    newConversation();
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* 侧边栏 */}
      <aside className="w-72 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-r border-slate-200 dark:border-slate-700 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <img src="/logo.jpg" alt="chatClaw" className="w-10 h-10 rounded-xl object-cover" />
            <div>
              <h1 className="font-bold text-lg text-slate-800 dark:text-white">chatClaw</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">智能 AI 助手</p>
            </div>
          </div>
        </div>

        {/* 模型选择 */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2 block">
            选择模型
          </label>
          <ModelSelector
            selectedModel={model}
            onModelChange={setModel}
            onApiConfigChange={setApiConfig}
          />
        </div>

        {/* 工作目录 */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
            📁 工作目录（Agent 可读写此目录）
          </label>
          <input
            type="text"
            value={workspaceDir}
            onChange={e => {
              setWorkspaceDir(e.target.value);
              localStorage.setItem('ai-agent-workspace', e.target.value);
            }}
            placeholder="/Users/sanhu/Desktop"
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* 最大迭代次数 */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
            🔁 最大工具调用轮数
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={maxIterations}
            onChange={e => {
              const v = Number(e.target.value);
              setMaxIterations(v >= 1 ? v : 1);
              localStorage.setItem('ai-agent-max-iterations', String(v));
            }}
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-[10px] text-slate-400 mt-1">复杂任务调大，防止过早停止</p>
        </div>

        {/* 知识库 */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <KnowledgePanel apiKey={apiConfig.apiKey} baseURL={apiConfig.baseURL} />
        </div>

        {/* 新建对话按钮 */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={newConversation}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-slate-800 dark:bg-slate-600 text-white text-sm hover:bg-slate-700 dark:hover:bg-slate-500 transition-all"
          >
            + 新对话
          </button>
        </div>

        {/* 对话历史列表 */}
        <div className="flex-1 overflow-y-auto">
          {conversations.map(conv => (
            <div
              key={conv.id}
              onClick={() => switchConversation(conv.id)}
              className={`group flex items-center gap-2 px-4 py-3 cursor-pointer transition-colors border-b border-slate-100 dark:border-slate-700/50 ${
                conv.id === currentConvId
                  ? 'bg-blue-50 dark:bg-blue-900/20'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-700 dark:text-slate-200 truncate">
                  {conv.title}
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500">
                  {conv.messages.length} 条消息
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 p-1 transition-opacity"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          {conversations.length === 0 && (
            <div className="p-4 text-center text-xs text-slate-400 dark:text-slate-500">
              暂无对话记录
            </div>
          )}
        </div>
      </aside>

      {/* 主聊天区域 */}
      <main className="flex-1 flex flex-col">
        {/* 标题栏 */}
        <header className="h-16 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 flex items-center px-6">
          <div className="flex items-center gap-3">
            <img src="/logo.jpg" alt="chatClaw" className="w-8 h-8 rounded-lg object-cover" />
            <div>
              <h2 className="font-semibold text-slate-800 dark:text-white">
                chatClaw
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                基于 ReAct 模式 · 支持多工具调用
              </p>
            </div>
          </div>
        </header>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 欢迎消息 */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-20 h-20 rounded-2xl overflow-hidden mb-6 shadow-lg">
                🤖
              </div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
                你好！我是 chatClaw
              </h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-md">
                我可以使用各种工具来帮助你完成任务。试试问我：
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 max-w-lg">
                {[
                  { icon: '🔍', text: '搜索最新的 AI 新闻' },
                  { icon: '🔢', text: '计算 (15 * 23) + 45' },
                  { icon: '💻', text: '写一个斐波那契函数' },
                  { icon: '🎨', text: '生成一张猫咪图片' },
                ].map((example, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(example.text)}
                    className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors text-left"
                  >
                    <span className="text-lg">{example.icon}</span>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                      {example.text}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 消息列表 */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-2' : ''}`}>
                {/* 头像 */}
                <div className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm flex-shrink-0 ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-green-400 to-blue-500'
                      : 'bg-slate-200 dark:bg-slate-700'
                  }`}>
                    {msg.role === 'user' ? '👤' : <img src="/logo.jpg" alt="chatClaw" className="rounded object-cover" />}
                  </div>

                  <div className={`flex-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
                    {/* 思考过程 - 在内容上方，限制最大高度 */}
                    {msg.reasoning && (
                      <details className="text-xs text-purple-500 dark:text-purple-400 mb-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                        <summary className="font-medium cursor-pointer select-none">🧠 思考过程（点击展开）</summary>
                        <div className="whitespace-pre-wrap mt-1 max-h-40 overflow-y-auto">{msg.reasoning}</div>
                      </details>
                    )}

                    {/* 消息内容 */}
                    <div className={`inline-block rounded-2xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white'
                    }`}>
                      {msg.content ? (
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">
                          {msg.content}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-400">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                          <span className="text-xs">思考中...</span>
                        </div>
                      )}
                    </div>

                    {/* 工具调用展示 */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {msg.toolCalls.map((tc, i) => (
                          <span
                            key={tc.id}
                            className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-full px-2 py-0.5 text-xs"
                            title={JSON.stringify(tc.args).substring(0, 200)}
                          >
                            <span>{toolIconMap[tc.name] || '🔧'}</span>
                            <span className="text-slate-700 dark:text-slate-200">
                              {toolNameMap[tc.name] || tc.name}
                            </span>
                            {tc.result ? (
                              <span className="text-green-500">✓</span>
                            ) : (
                              <span className="text-blue-500">⏳</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 时间戳 */}
                    <div className={`text-xs text-slate-400 mt-2 ${msg.role === 'user' ? 'text-right' : ''}`}>
                      {msg.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* 当前思考状态 */}
          {isLoading && (currentThinking || currentReasoning || currentToolCall) && (
            <div className="flex justify-start">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm">
                  <img src="/logo.jpg" alt="chatClaw" className="w-4 h-4 rounded object-cover inline" />
                </div>
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 max-w-[80%]">
                  {currentThinking && (
                    <div className="text-sm text-slate-500 dark:text-slate-400 italic mb-2">
                      🤔 {currentThinking}
                    </div>
                  )}
                  {currentToolCall && (
                    <div className="flex items-center gap-2 text-sm">
                      <span>{toolIconMap[currentToolCall.name] || '🔧'}</span>
                      <span className="text-blue-500">
                        正在调用: {toolNameMap[currentToolCall.name] || currentToolCall.name}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 输入框 */}
        <div className="p-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-t border-slate-200 dark:border-slate-700">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-3 items-end">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入你的问题... (Enter 发送, Shift+Enter 换行)"
                  className="w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 pr-12 text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent max-h-32"
                  rows={1}
                  disabled={isLoading}
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                className="px-6 py-3 rounded-xl bg-slate-800 dark:bg-slate-600 text-white font-medium hover:bg-slate-700 dark:hover:bg-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    处理中
                  </span>
                ) : (
                  '发送'
                )}
              </button>
            </div>
            <div className="mt-2 text-xs text-slate-400 text-center">
              chatClaw · 基于 ReAct 模式 · 支持知识库 + 6 种工具
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
