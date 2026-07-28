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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, config } = body;

    if (!message) {
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

    // 创建 Agent
    const agent = createAgent(agentConfig);

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
          // 运行 Agent
          const result = await agent.run(
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
            (result) => send({ type: 'tool_result', result }),
            // onToken（流式输出）
            (token) => send({ type: 'token', content: token }),
            // onReasoning（DeepSeek 思考模式 - 思维链）
            (reasoning) => send({ type: 'reasoning', content: reasoning }),
          );

          // 发送最终结果
          send({ type: 'done', content: result });
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
