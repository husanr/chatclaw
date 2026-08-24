<div align="center">

# 🐾 chatClaw

**智能 AI Agent 助手平台**

基于 ReAct 模式，支持多模型接入、工具调用、流式输出、RAG 知识库

[English](./README.md) | [中文](./README_CN.md)

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)

</div>

---

## ✨ 功能特性

| 功能 | 描述 |
|---|---|
| 🤖 多模型支持 | OpenAI / Claude / DeepSeek / Moonshot / 通义千问 / 智谱 / 豆包 / 文心 / 星火 |
| 🛠️ 12 个内置工具 | web_search / code_executor / file_operations / webpage_fetch / api_caller / image_generator / calculator / get_time / memory / knowledge_search / app_config / reload_tool（支持热插拔） |
| ⚡ 全链路流式 | SSE 实时推送思考过程、工具调用、最终回答 |
| 📚 RAG 知识库 | 上传文档 → 分块 → Embedding → 向量检索，Agent 优先查知识库 |
| 🔒 代码沙箱 | vm.createContext 隔离执行，关键字黑名单 + 超时控制 |
| 💬 多会话管理 | localStorage 持久化，新建/切换/删除会话 |
| 🔑 安全密钥管理 | 前端 localStorage 存储，代码零硬编码 |

## 🛠️ 技术栈

- **前端**: Next.js 16, React 19, TypeScript, Tailwind CSS 4
- **后端**: Next.js API Routes, Node.js
- **架构**: ReAct (Reasoning-Acting-Observing) 推理模式
- **流式**: SSE (Server-Sent Events)
- **RAG**: Embedding API + 余弦相似度 + IndexedDB 持久化
- **沙箱**: Node.js vm.createContext

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/husanr/chatclaw.git
cd chatclaw
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.local.example .env.local
```

编辑 `.env.local`，填入你的 API Key：

```env
# 搜索工具（可选，不配则 web_search 不可用）
TAVILY_API_KEY=your_tavily_key
```

> 💡 其他 API Key（OpenAI / DeepSeek 等）在网页端的模型选择器中配置，无需写入环境变量

### 4. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 🎉

## 📦 一键部署

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/husanr/chatclaw)

1. Fork 本仓库
2. 在 [Vercel](https://vercel.com) 导入项目
3. 配置环境变量 `TAVILY_API_KEY`
4. 点击 Deploy

## 📖 使用说明

### 对话

在左侧选择模型，输入 API Key，开始对话。

### 知识库

1. 展开「Embedding API 设置」，配置 DashScope Key
2. 点击「+ 上传文档」，支持 .txt / .md / .json / .csv 等格式
3. 上传后 Agent 会优先从知识库检索回答

### 工具调用

Agent 会自动判断是否需要调用工具。内置 12 个工具，且支持热插拔动态加载：

- **web_search** — 搜索网页获取最新信息（Tavily API）
- **webpage_fetch** — 抓取网页并提取可读文本（去除 HTML 标签）
- **code_executor** — 在安全沙箱中执行 JavaScript 代码
- **file_operations** — 读写 / 列出工作目录下的文件
- **api_caller** — 调用外部 HTTP API（GET/POST/PUT/DELETE）
- **image_generator** — 根据文字描述生成图片（默认复用对话模型凭据）
- **calculator** — 数学计算（加减乘除、幂运算、三角函数等）
- **get_time** — 获取当前日期时间（北京时间）
- **memory** — 长期记忆：跨会话存储 / 回忆 / 列出 / 删除事实
- **knowledge_search** — 搜索本地 RAG 知识库
- **app_config** — 读取 / 修改运行时配置（如图生模型设置，改完立即生效）
- **reload_tool** — 运行时动态注册 / 卸载工具，让 Agent 能自我扩展能力

## 🏗️ 项目结构

```
chatclaw/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts      # 对话 API（SSE 流式）
│   │   │   └── rag/route.ts       # RAG 知识库 API
│   │   ├── page.tsx               # 主页面
│   │   ├── layout.tsx             # 布局
│   │   └── globals.css            # 全局样式
│   ├── components/
│   │   ├── ModelSelector.tsx      # 模型选择器
│   │   ├── KnowledgePanel.tsx     # 知识库面板
│   │   └── MarkdownMessage.tsx    # Markdown 消息渲染
│   ├── lib/
│   │   ├── agent/
│   │   │   ├── agent.ts           # Agent 核心（ReAct 循环）
│   │   │   └── index.ts           # Agent 工厂
│   │   ├── llm/
│   │   │   ├── index.ts           # LLM Provider 出口
│   │   │   ├── openai.ts          # OpenAI Provider
│   │   │   ├── claude.ts          # Claude Provider
│   │   │   ├── custom.ts          # 自定义 Provider
│   │   │   ├── retry.ts           # 指数退避重试
│   │   │   └── models.ts          # 模型配置
│   │   ├── rag/
│   │   │   └── index.ts           # RAG 核心（Embedding + 向量检索）
│   │   ├── memory.ts              # 长期记忆存储
│   │   ├── config.ts              # 运行时配置（app_config 工具）
│   │   └── tools/
│   │       ├── base.ts            # 工具注册表
│   │       └── index.ts           # 12 个工具实现
│   └── types/
│       └── index.ts               # 类型定义
└── package.json
```

## 🔧 核心设计

### ReAct 推理循环

```
用户提问 → Reasoning（思考）→ Acting（调用工具）→ Observing（观察结果）→ 回答
```

### 流式输出

基于 SSE 实现全链路流式，适配 OpenAI / Claude 两种流式协议，一套 `ChatStreamEvent` 抽象层屏蔽底层差异。

### RAG 知识库

```
上传文档 → 文档分块(500字/段) → Embedding 向量化 → IndexedDB 持久化
提问时 → 知识库检索(knowledge_search) → 注入上下文 → Agent 基于文档回答
```

## 📄 开源协议

MIT License

---

<div align="center">

**Made with ❤️ by [husanr](https://github.com/husanr)**

</div>
