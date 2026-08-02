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
| 🤖 Multi-Model Support | OpenAI / Claude / DeepSeek / Qwen / Zhipu / Doubao |
| 🔧 Tool Calling | web_search / code_executor / file_operations / api_caller / calculator / knowledge_search |
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
cp .env.example .env.local
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

Agent automatically decides when to use tools:

- **web_search** — Search the web for latest info
- **code_executor** — Execute JavaScript in sandbox
- **file_operations** — Read/write files in workspace
- **api_caller** — Call external APIs
- **calculator** — Math calculations
- **knowledge_search** — Search local knowledge base

## 🏗️ Project Structure

```
chatclaw/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts      # Chat API
│   │   │   └── rag/route.ts       # RAG Knowledge Base API
│   │   ├── page.tsx               # Main page
│   │   └── layout.tsx             # Layout
│   ├── components/
│   │   ├── ModelSelector.tsx      # Model selector
│   │   └── KnowledgePanel.tsx     # Knowledge base panel
│   ├── lib/
│   │   ├── agent/
│   │   │   ├── agent.ts           # Agent core (ReAct loop)
│   │   │   └── index.ts           # Agent factory
│   │   ├── llm/
│   │   │   ├── openai.ts          # OpenAI Provider
│   │   │   ├── claude.ts          # Claude Provider
│   │   │   ├── custom.ts          # Custom Provider
│   │   │   └── models.ts          # Model configs
│   │   ├── rag/
│   │   │   └── index.ts           # RAG core (Embedding + vector search)
│   │   └── tools/
│   │       ├── base.ts            # Tool registry
│   │       └── index.ts           # Tool implementations
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
