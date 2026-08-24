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

## 🤖 IM Bot Integration (Feishu / Telegram)

Chat with chatClaw from **Feishu (Lark)** or **Telegram**. The bot receives messages via webhook, runs the Agent in the background, and replies through the IM API.

```
User → IM server → POST webhook → /api/im/feishu (or /api/im/telegram)
                              → 200 immediately (≤3s timeout safety)
                              → Agent processes (ReAct + tools)
                              → IM API sends the answer back
```

> **Architecture notes**: webhooks respond `200` instantly and process asynchronously — Agent runs can take tens of seconds, which would trip the IM server's retry timeout. Sessions are stored server-side (`data/im-sessions.json`) per channel+user; `send /reset` clears a conversation. IM mode uses the 13 non-interactive tools (shell/background/ask_user need approval UI, so they're excluded); model credentials come from `IM_AGENT_MODEL` / `IM_AGENT_API_KEY` / `IM_AGENT_BASE_URL` or the model's own `envKey`.

### Feishu setup (recommended: long connection)

Feishu supports **long-connection** event delivery (SDK-maintained WebSocket) — **no public URL needed**, works on localhost. chatClaw starts it automatically at server boot:

1. Create an app at [open.feishu.cn](https://open.feishu.cn) → **Enterprise self-built app**
2. Enable **Bot** capability (添加应用能力 → 机器人)
3. In **Permission management**, add `im:message` (read & send messages)
4. In **Event subscription**, switch to **长连接 (long connection)** mode — no URL to fill
5. Publish a version (发布版本)
6. Set env vars: `FEISHU_APP_ID`, `FEISHU_APP_SECRET` (from 凭证与基础信息)
7. Start the server (`npm run dev` / `next start`) — you'll see `[feishu] ✅ 长连接已就绪` in logs

Optional: restrict users with `IM_ALLOWLIST` (comma-separated open_ids; empty = everyone).

> Alternative: the old **webhook** mode (`/api/im/feishu`) still works if you prefer URL callbacks.

### Telegram setup

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → get your token
2. Register the webhook:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-public-url>/api/im/telegram"
   ```
3. Set `TELEGRAM_BOT_TOKEN`

### Public URL requirements

The webhook URL must be publicly reachable over HTTPS. Options:

- **Local dev**: [cloudflared tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (`cloudflared tunnel --url http://localhost:3000`) or ngrok
- **Self-hosted / VPS**: deploy with `next start` behind nginx/caddy
- ⚠️ **Vercel Hobby caveat**: serverless functions may freeze after responding — the async reply pattern can drop messages. Prefer self-hosting for IM bots.

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
