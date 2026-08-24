// ============================================
// 飞书 Webhook 入口（备选订阅方式）
// ============================================
//
// 主推「长连接」订阅（src/lib/im/feishu-socket.ts，无需公网 URL）。
// 本路由保留作为备选：在飞书开放平台用 webhook 方式订阅时，
// 事件会 POST 到这里（首次配置需通过 challenge 验证）。
//
// 处理逻辑与长连接完全一致（复用 feishu-events.ts）：
// 收到消息 → Typing 反应(正在输入) → Agent 处理 → 移除反应并回复。
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { handleFeishuMessage } from '@/lib/im/feishu-events';
import { isFeishuConfigured } from '@/lib/im/feishu';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  // URL 验证（飞书开放平台首次配置事件订阅时会发 challenge）——必须在配置检查之前，
  // 因为配 webhook 时应用可能还没填完整凭据，但 URL 验证必须通过
  if (body && typeof body === 'object' && body.challenge !== undefined) {
    return NextResponse.json({ challenge: body.challenge });
  }

  // 未配置飞书应用：直接 ok，避免飞书持续重试
  if (!isFeishuConfigured()) {
    return NextResponse.json({ ok: true });
  }

  // 只处理消息事件
  if (body.header?.event_type !== 'im.message.receive_v1') {
    return NextResponse.json({ ok: true });
  }

  const event = body.event ?? {};

  // 快速响应 + 后台异步处理（Agent 可能要跑几十秒，不能阻塞 webhook）
  void handleFeishuEvent(event);

  return NextResponse.json({ ok: true });
}

/** 从 webhook 事件提取并处理（与长连接共用逻辑） */
async function handleFeishuEvent(event: any): Promise<void> {
  const { extractFeishuText } = await import('@/lib/im/feishu-events');
  const parsed = extractFeishuText(event);
  if (!parsed) return;
  await handleFeishuMessage(parsed.openId, parsed.text, parsed.chatId, parsed.messageId);
}