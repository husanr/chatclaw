// ============================================
// Telegram Webhook 入口
// ============================================
//
// Telegram 把用户消息 POST 到这里（需先 setWebhook 注册）。
// 快速 200 + 后台处理 + API 回复，与飞书相同的架构。
//
// 注册 webhook：
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://你的公网地址/api/im/telegram"
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { runImAgent } from '@/lib/im/agent';
import { telegramClient, isTelegramConfigured } from '@/lib/im/telegram';

export const dynamic = 'force-dynamic';

async function handleIncoming(chatId: number, text: string, userId: number, username?: string): Promise<void> {
  console.log(`[telegram] 收到消息 chatId=${chatId} user=${userId}${username ? ` (${username})` : ''}: ${text.slice(0, 80)}`);
  try {
    const answer = await runImAgent('telegram', String(userId), text);
    await telegramClient.sendTextChunks(chatId, answer);
    console.log(`[telegram] → 已回复（${answer.length} 字符）`);
  } catch (e) {
    console.error('[telegram] 处理失败:', e);
    try {
      await telegramClient.sendText(chatId, `❌ 服务出错了: ${e instanceof Error ? e.message : String(e)}`);
    } catch {
      // 忽略
    }
  }
}

export async function POST(request: NextRequest) {
  // 未配置 Bot：直接 ok
  if (!isTelegramConfigured()) {
    return NextResponse.json({ ok: true });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = body.message;
  if (!message || typeof message.text !== 'string') {
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat?.id as number | undefined;
  const userId = message.from?.id as number | undefined;
  const username = message.from?.username as string | undefined;
  const text = message.text.trim();

  if (!chatId || !userId || !text) {
    return NextResponse.json({ ok: true });
  }

  // 快速响应 + 后台异步处理
  void handleIncoming(chatId, text, userId, username);

  return NextResponse.json({ ok: true });
}