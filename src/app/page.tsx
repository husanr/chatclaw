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

// 消息类型
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCallInfo[];
  timestamp: Date;
}

interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, any>;
  result?: any;
}

// 工具名称映射（中文）
const toolNameMap: Record<string, string> = {
  web_search: '网页搜索',
  calculator: '计算器',
  code_executor: '代码执行',
  file_operations: '文件操作',
  database_query: '数据库查询',
  api_caller: 'API 调用',
  email_sender: '邮件发送',
  image_generator: '图片生成',
};

// 工具图标
const toolIconMap: Record<string, string> = {
  web_search: '🔍',
  calculator: '🔢',
  code_executor: '💻',
  file_operations: '📁',
  database_query: '🗄️',
  api_caller: '🌐',
  email_sender: '📧',
  image_generator: '🎨',
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentThinking, setCurrentThinking] = useState('');
  const [currentReasoning, setCurrentReasoning] = useState('');
  const [currentToolCall, setCurrentToolCall] = useState<ToolCallInfo | null>(null);
  const [model, setModel] = useState('openai-gpt-4o');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentThinking, currentToolCall]);

  // 生成唯一 ID
  const generateId = () => Math.random().toString(36).substring(2, 15);

  // 发送消息
  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setCurrentThinking('');
    setCurrentToolCall(null);

    // 创建助手消息占位
    const assistantMessageId = generateId();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      // 调用 API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          config: { model },
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
                  // DeepSeek 思考模式 - 思维链内容
                  setCurrentReasoning(prev => prev + data.content);
                  break;

                case 'tool_call':
                  const toolCall: ToolCallInfo = {
                    id: data.toolCall.id,
                    name: data.toolCall.name,
                    args: data.toolCall.args,
                  };
                  setCurrentToolCall(toolCall);

                  // 添加到消息的工具调用列表
                  setMessages(prev => prev.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, toolCalls: [...(m.toolCalls || []), toolCall] }
                      : m
                  ));
                  break;

                case 'tool_result':
                  setCurrentToolCall(null);

                  // 更新最后一个工具调用的结果
                  setMessages(prev => prev.map(m => {
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
                  setMessages(prev => prev.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, content: m.content + data.content }
                      : m
                  ));
                  break;

                case 'done':
                  setMessages(prev => prev.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, content: data.content }
                      : m
                  ));
                  setCurrentThinking('');
                  setCurrentToolCall(null);
                  break;

                case 'error':
                  setMessages(prev => prev.map(m =>
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
      setMessages(prev => prev.map(m =>
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

  // 清空对话
  const clearChat = () => {
    setMessages([]);
    setCurrentThinking('');
    setCurrentToolCall(null);
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* 侧边栏 */}
      <aside className="w-72 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-r border-slate-200 dark:border-slate-700 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xl">
              🤖
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-800 dark:text-white">AI Agent</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">智能助手</p>
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
          />
        </div>

        {/* 工具列表 */}
        <div className="flex-1 p-4 overflow-y-auto">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">
            🛠️ 可用工具
          </h3>
          <div className="space-y-2">
            {Object.entries(toolNameMap).map(([key, name]) => (
              <div
                key={key}
                className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50"
              >
                <span className="text-lg">{toolIconMap[key]}</span>
                <div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {name}
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">
                    {key}
                  </div>
                </div>
                <div className="ml-auto w-2 h-2 rounded-full bg-green-400"></div>
              </div>
            ))}
          </div>
        </div>

        {/* 清空按钮 */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={clearChat}
            className="w-full py-2 px-4 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-sm"
          >
            🗑️ 清空对话
          </button>
        </div>
      </aside>

      {/* 主聊天区域 */}
      <main className="flex-1 flex flex-col">
        {/* 标题栏 */}
        <header className="h-16 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 flex items-center px-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm">
              🤖
            </div>
            <div>
              <h2 className="font-semibold text-slate-800 dark:text-white">
                AI Agent
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
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-4xl mb-6 shadow-lg">
                🤖
              </div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
                你好！我是 AI Agent
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
                      : 'bg-gradient-to-br from-blue-500 to-purple-600'
                  }`}>
                    {msg.role === 'user' ? '👤' : '🤖'}
                  </div>

                  <div className={`flex-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
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
                      <div className="mt-3 space-y-2">
                        {msg.toolCalls.map((tc, i) => (
                          <div
                            key={tc.id}
                            className="inline-block bg-slate-100 dark:bg-slate-700 rounded-lg px-3 py-2 text-left"
                          >
                            <div className="flex items-center gap-2 text-sm">
                              <span>{toolIconMap[tc.name] || '🔧'}</span>
                              <span className="font-medium text-slate-700 dark:text-slate-200">
                                {toolNameMap[tc.name] || tc.name}
                              </span>
                              {tc.result ? (
                                <span className="text-green-500 text-xs">✓ 完成</span>
                              ) : (
                                <span className="text-blue-500 text-xs">⏳ 执行中...</span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              {JSON.stringify(tc.args).substring(0, 50)}...
                            </div>
                          </div>
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
                  🤖
                </div>
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 max-w-[80%]">
                  {/* DeepSeek 思考模式 - 思维链 */}
                  {currentReasoning && (
                    <div className="text-xs text-purple-500 dark:text-purple-400 mb-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <div className="font-medium mb-1">🧠 思考过程:</div>
                      <div className="whitespace-pre-wrap">{currentReasoning}</div>
                    </div>
                  )}
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
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium hover:from-blue-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25"
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
              AI Agent · 基于 ReAct 模式 · 支持 8 种工具
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
