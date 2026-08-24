<div align="center">

# 🐾 chatClaw

**Intelligent AI Agent Assistant Platform**

基于 ReAct 模式，支持多模型接入、工具调用、流式输出、RAG 知识库

[English](./README.md) | [中文](./README_CN.md)

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)

</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 Multi-Model Support | OpenAI / Claude / DeepSeek / Moonshot / Qwen / Zhipu / Doubao / ERNIE / Spark |
| 🛠️ 16 Built-in Tools | web_search / code_executor / file_operations / shell_executor / background_task / subagent / webpage_fetch / api_caller / image_generator / calculator / get_time / memory / knowledge_search / ask_user / app_config / reload_tool (hot-pluggable) |
| 🛂 Safe Shell Execution | Real bash via shell_executor (cwd-locked, dangerous-command blacklist, user approval required before every run) |
| ⏱️ Background Tasks | Long-running commands (npm install / builds) run in background: start / status / list / stop / result |
| 🤝 Sub-agent Delegation | subagent spawns an independent ReAct agent with its own loop & tools — parallel task decomposition |
| ❓ Clarify Instead of Guess | ask_user pauses the agent to ask the user when intent is ambiguous; shell tools pause for approval |
| 🧠 Auto Context Compression | Long conversations get LLM-summarized instead of hard-truncated (fallback to trim when disabled) |
| ⚡ Full Streaming | SSE real-time push for thinking process, tool calls, and final answer |
| 📚 RAG Knowledge Base | Upload docs → chunk → embed → vector search, agent prioritizes knowledge base |
| 🔒 Code Sandbox | vm.createContext isolation, keyword blacklist + timeout control |
| 💬 Multi-Session | localStorage persistence, create/switch/delete sessions |
| 🔑 Secure Key Management | Frontend localStorage storage, zero hardcoded secrets |

## 🛠️ Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS 4
- **Backend**: Next.js API Routes, Node.js
- **Architecture**: ReAct (Reasoning-Acting-Observing) pattern
- **Streaming**: SSE (Server-Sent Events)
- **RAG**: Embedding API + cosine similarity + IndexedDB persistence
- **Sandbox**: Node.js vm.createContext

## 🚀 Quick Start

### 1. Clone

```bash
git clone https://github.com/husanr/chatclaw.git
cd chatclaw
```

### 2. Install

```bash
npm install
```

### 3. Configure

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your API key:

```env
# Search tool (optional, web_search won't work without it)
TAVILY_API_KEY=your_tavily_key
```

> 💡 Other API keys (OpenAI / DeepSeek, etc.) are configured in the web UI model selector — no need to add them to env files.

### 4. Run

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) 🎉

## 📦 Deploy

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/husanr/chatclaw)

1. Fork this repo
2. Import on [Vercel](https://vercel.com)
3. Set environment variable `TAVILY_API_KEY`
4. Deploy

## 📖 Usage

### Chat

Select a model on the left sidebar, enter your API Key, and start chatting.

### Knowledge Base

1. Open "Embedding API Settings", configure DashScope Key
2. Click "+ Upload Document", supports .txt / .md / .json / .csv
3. Agent will prioritize knowledge base for answering

### Tool Calling

Agent automatically decides when to use tools. 16 tools built in, plus hot-pluggable loading:

- **web_search** — Search the web for latest info (Tavily API)
- **webpage_fetch** — Fetch a webpage and extract readable text
- **code_executor** — Execute JavaScript in a secure sandbox
- **file_operations** — Read/write/edit with string replace, grep full-text search, glob file matching
- **shell_executor** — Real bash in the user workspace (⛔ approval required, dangerous commands hard-blocked)
- **background_task** — Run long commands in background: start / status / list / stop / result
- **subagent** — Delegate a self-contained subtask to an independent Agent (parallel decomposition)
- **api_caller** — Call external HTTP APIs (GET/POST/PUT/DELETE)
- **image_generator** — Generate images from text prompts (reuses chat credentials)
- **calculator** — Math calculations (arithmetic, powers, trigonometry)
- **get_time** — Get current date & time (Beijing time)
- **memory** — Long-term memory: store / recall / list / forget facts across sessions
- **knowledge_search** — Search the local RAG knowledge base
- **ask_user** — Pause and ask the user when intent is ambiguous or a decision is needed
- **app_config** — Read/modify runtime config (e.g. image model settings, takes effect immediately)
- **reload_tool** — Dynamically register/unregister tools at runtime so the agent can extend itself

> **Approval flow**: `shell_executor` and `background_task(start)` pause the ReAct loop and push an `approval_required` SSE event — the UI shows an approve/reject card. The agent resumes with your decision via the `reply` protocol.

## 🏗️ Project Structure

```
chatclaw/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts      # Chat API (SSE streaming)
│   │   │   └── rag/route.ts       # RAG Knowledge Base API
│   │   ├── page.tsx               # Main page
│   │   ├── layout.tsx             # Layout
│   │   └── globals.css            # Global styles
│   ├── components/
│   │   ├── ModelSelector.tsx      # Model selector
│   │   ├── KnowledgePanel.tsx     # Knowledge base panel
│   │   └── MarkdownMessage.tsx    # Markdown message renderer
│   ├── lib/
│   │   ├── agent/
│   │   │   ├── agent.ts           # Agent core (ReAct loop)
│   │   │   └── index.ts           # Agent factory
│   │   ├── llm/
│   │   │   ├── index.ts           # LLM provider exports
│   │   │   ├── openai.ts          # OpenAI Provider
│   │   │   ├── claude.ts          # Claude Provider
│   │   │   ├── custom.ts          # Custom Provider
│   │   │   ├── retry.ts           # Exponential-backoff retry
│   │   │   └── models.ts          # Model configs
│   │   ├── rag/
│   │   │   └── index.ts           # RAG core (Embedding + vector search)
│   │   ├── memory.ts              # Long-term memory store
│   │   ├── config.ts              # Runtime config (app_config tool)
│   │   └── tools/
│   │       ├── base.ts            # Tool registry
│   │       ├── index.ts           # 16 tool implementations
│   │       ├── shell.ts           # shell_executor（授权执行）
│   │       ├── jobs.ts            # background_task 后台任务
│   │       ├── subagent.ts        # subagent 子 Agent 委派
│   │       ├── askUser.ts         # ask_user 提问澄清
│   │       ├── security.ts        # 危险命令黑名单
│   │       └── context.ts         # 共享运行时上下文（工作目录/凭据）
│   └── types/
│       └── index.ts               # Type definitions
└── package.json
```

## 🔧 Architecture

### ReAct Loop

```
User Query → Reasoning → Acting (Tool Call) → Observing → Answer
```

### Streaming

SSE-based full-chain streaming, adapts to OpenAI / Claude protocols with a unified `ChatStreamEvent` abstraction layer.

### RAG Knowledge Base

```
Upload → Chunk (500 chars/segment) → Embed → Persist to IndexedDB
Query → knowledge_search → Inject context → Agent answers from docs
```

## 📄 License

MIT License

---

<div align="center">

**Made with ❤️ by [husanr](https://github.com/husanr)**

</div>
