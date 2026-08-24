// ============================================
// 聊天 API 路由（支持 DeepSeek 思考模式）
// ============================================
//
// 🧠 原理讲解：
// 这是前端和 Agent 之间的桥梁。
// 前端发送用户消息，API 调用 Agent 处理，返回结果。
//
// 使用 Server-Sent Events (SSE) 实现流式输出，
// 让用户能实时看到 Agent 的思考过程和思维链。
//
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createAgent, defaultConfig } from '@/lib/agent';
import { AgentConfig } from '@/types';
import { setAllowedDir, setRagApiConfig, setChatCredentials } from '@/lib/tools';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, config, history, reply } = body;

    // 设置工作目录
    if (config?.allowedDir) {
      setAllowedDir(config.allowedDir);
    }

    // 保存当前对话凭据，供图片生成、subagent 等工具默认复用
    if (config?.apiKey && config?.baseURL) {
      setChatCredentials({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        model: config.model,
      });
    }

    // 设置 RAG API 配置
    if (config?.apiKey && config?.baseURL) {
      setRagApiConfig({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        embeddingApiKey: config.embeddingApiKey || undefined,
        embeddingBaseURL: config.embeddingBaseURL || undefined,
        embeddingModel: config.embeddingModel || undefined,
      });
    }

    // 普通消息必填；回复（reply）模式下 message 可以为空
    if (!message && !reply) {
      return NextResponse.json(
        { error: '消息不能为空' },
        { status: 400 }
      );
    }

    // 合并配置
    const agentConfig: AgentConfig = {
      ...defaultConfig,
      ...config,
    };

    // 创建 Agent（传入历史消息实现多轮对话）
    const agent = createAgent(agentConfig, history);

    // 使用流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // 发送数据的辅助函数
        const send = (data: any) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        };

        try {
          // 运行 Agent（reply 存在时是「恢复」：回答 ask_user 提问 / 审批工具调用）
          let result;
          if (reply?.kind === 'answer') {
            result = await agent.resumeWithAnswer(String(reply.answer ?? ''));
          } else if (reply?.kind === 'approval') {
            result = await agent.resumeWithApproval(!!reply.grant, reply.toolCallId);
          } else {
            if (!message) {
              send({ type: 'error', content: '消息不能为空' });
              return;
            }
            result = await agent.run(
              message,
              // onThinking
              (thought) => send({ type: 'thinking', content: thought }),
              // onToolCall
              (toolCall) => send({
                type: 'tool_call',
                toolCall: {
                  id: toolCall.id,
                  name: toolCall.name,
                  args: toolCall.args,
                },
              }),
              // onToolResult
              (r) => send({ type: 'tool_result', result: r }),
              // onToken（流式输出）
              (token) => send({ type: 'token', content: token }),
              // onReasoning（DeepSeek 思考模式 - 思维链）
              (reasoning) => send({ type: 'reasoning', content: reasoning }),
            );
          }

          // 分发运行结果
          if (result.status === 'complete') {
            // 发送最终结果
            send({ type: 'done', content: result.content });
          } else if (result.status === 'awaiting_input') {
            // Agent 向用户提问：推送问题 + 完整消息快照（前端保存，回答时原样回传恢复）
            send({
              type: 'user_input_required',
              requestId: result.requestId,
              question: result.question,
              options: result.options,
              history: agent.getMessages(),
            });
          } else if (result.status === 'awaiting_approval') {
            // Agent 请求审批：推送待审批工具 + 完整消息快照
            send({
              type: 'approval_required',
              requestId: result.requestId,
              toolCall: result.toolCall,
              toolDescription: result.toolDescription,
              history: agent.getMessages(),
            });
          }
        } catch (error) {
          console.error('Agent 执行错误:', error);
          send({
            type: 'error',
            content: error instanceof Error ? error.message : '未知错误',
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('API 错误:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '服务器错误' },
      { status: 500 }
    );
  }
}
