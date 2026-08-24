// ============================================
// 飞书 Webhook 入口
// ============================================
//
// 飞书开放平台「事件订阅」会 POST 到这里：
// 1. 首次配置时需要响应 URL 验证（challenge）
// 2. 用户发消息 → 解析 → 立即返回 200 → 后台跑 Agent → 调飞书 API 回复
//
// 快速 200 是关键：飞书事件推送有超时重试（3 秒），
// Agent 处理可能很久，所以绝不能同步等待后再响应。
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { runImAgent } from '@/lib/im/agent';
import { feishuClient, isFeishuConfigured } from '@/lib/im/feishu';

export const dynamic = 'force-dynamic';

async function handleIncoming(openId: string, text: string, chatId?: string): Promise<void> {
  console.log(`[feishu] 收到消息 openId=${openId} chatId=${chatId ?? '-'}: ${text.slice(0, 80)}`);
  try {
    const answer = await runImAgent('feishu', openId, text);
    await feishuClient.sendTextChunks(openId, answer);
    console.log(`[feishu] → 已回复（${answer.length} 字符）`);
  } catch (e) {
    console.error('[feishu] 处理失败:', e);
    try {
      await feishuClient.sendText(openId, `❌ 服务出错了: ${e instanceof Error ? e.message : String(e)}`);
    } catch {
      // 回复失败只能记日志
    }
  }
}

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
  const message = event.message ?? {};
  const sender = event.sender ?? {};
  const openId = sender.sender_id?.open_id as string | undefined;
  const chatId = message.chat_id as string | undefined;

  // 只处理文本消息（图片/卡片等忽略）
  if (!openId || message.message_type !== 'text') {
    return NextResponse.json({ ok: true });
  }

  let text = '';
  try {
    text = JSON.parse(message.content ?? '{}').text ?? '';
  } catch {
    text = String(message.content ?? '');
  }
  if (!text.trim()) {
    return NextResponse.json({ ok: true });
  }

  // 快速响应 + 后台异步处理（Agent 可能要跑几十秒，不能阻塞 webhook）
  void handleIncoming(openId, text.trim(), chatId);

  return NextResponse.json({ ok: true });
}