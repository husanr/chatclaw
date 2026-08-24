// ============================================
// 飞书消息事件处理（webhook 与长连接共用）
// ============================================
//
// 解析一条飞书文本消息 → 跑 IM Agent → 把回答发回飞书。
// webhook 路由（/api/im/feishu）和长连接客户端（feishu-socket.ts）都调用这里，
// 保证两种订阅方式行为一致。
// ============================================

import { runImAgent } from './agent';
import { feishuClient } from './feishu';

/** 处理一条飞书文本消息（openId 为发送者） */
export async function handleFeishuMessage(openId: string, text: string, chatId?: string): Promise<void> {
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

/**
 * 从飞书事件（webhook body 或长连接事件）提取 openId + 文本。
 * 只处理文本消息，其他消息类型返回 null。
 */
export function extractFeishuText(event: any): { openId: string; text: string; chatId?: string } | null {
  try {
    const sender = event?.sender ?? {};
    const message = event?.message ?? {};
    const openId = sender?.sender_id?.open_id as string | undefined;
    const chatId = message?.chat_id as string | undefined;

    if (!openId || message.message_type !== 'text') return null;

    let text = '';
    try {
      text = JSON.parse(message.content ?? '{}').text ?? '';
    } catch {
      text = String(message.content ?? '');
    }
    if (!text.trim()) return null;

    return { openId, text: text.trim(), chatId };
  } catch {
    return null;
  }
}