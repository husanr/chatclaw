// ============================================
// 飞书消息事件处理（webhook 与长连接共用）
// ============================================
//
// 待回复体验（与 Hermes 同款）：
// 1. 收到用户消息 → 立即给该消息添加「Typing」反应
//    （飞书客户端显示"正在输入…"待回复动画）
// 2. 保活：每 25 秒重新添加（反应会过期），直到处理完成
// 3. Agent 处理完 → 移除 Typing 反应 → 发送最终回复
//
// 这样用户在 Agent 思考的几十秒里能明确看到"机器人正在处理"，
// 而不是觉得机器人沉默了。
// ============================================

import { runImAgent } from './agent';
import { feishuClient } from './feishu';

// Typing 反应保活间隔（飞书 reaction 约 30 秒过期，25 秒续一次）
const TYPING_KEEPALIVE_MS = 25_000;

/** 处理一条飞书文本消息（openId 为发送者，messageId 用于挂 Typing 反应） */
export async function handleFeishuMessage(
  openId: string,
  text: string,
  chatId?: string,
  messageId?: string,
): Promise<void> {
  console.log(`[feishu] 收到消息 openId=${openId} chatId=${chatId ?? '-'}: ${text.slice(0, 80)}`);

  let reactionId: string | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  // 停止保活并移除 Typing 反应（幂等）
  const stopTyping = (): void => {
    if (keepalive) {
      clearInterval(keepalive);
      keepalive = null;
    }
    if (messageId && reactionId) {
      void feishuClient.removeTypingReaction(messageId, reactionId).catch(() => {});
    }
  };

  try {
    // 1. 添加 "正在输入" 反应（失败则降级为无占位，不阻塞主流程）
    if (messageId) {
      try {
        reactionId = await feishuClient.addTypingReaction(messageId);
        // 2. 保活循环：反应过期前重新添加
        keepalive = setInterval(async () => {
          try {
            const newId = await feishuClient.addTypingReaction(messageId!);
            if (newId) reactionId = newId;
          } catch {
            // 连续失败就停掉保活（限流/权限问题，避免刷 API）
            if (keepalive) clearInterval(keepalive);
            keepalive = null;
          }
        }, TYPING_KEEPALIVE_MS);
      } catch (e) {
        console.warn('[feishu] Typing 反应添加失败（降级为无占位）:', e instanceof Error ? e.message : e);
      }
    }

    // 3. 跑 Agent
    const answer = await runImAgent('feishu', openId, text);

    // 4. 移除 Typing 反应并发送回复
    stopTyping();
    const finalContent = answer.trim();
    await feishuClient.sendTextChunks(openId, finalContent);
    console.log(`[feishu] → 已回复（${finalContent.length} 字符）`);
  } catch (e) {
    console.error('[feishu] 处理失败:', e);
    stopTyping();
    try {
      await feishuClient.sendText(openId, `❌ 服务出错了: ${e instanceof Error ? e.message : String(e)}`);
    } catch {
      // 回复失败只能记日志
    }
  }
}

/**
 * 从飞书事件（webhook body 或长连接事件）提取 openId + 文本 + messageId。
 * 只处理文本消息，其他消息类型返回 null。
 */
export function extractFeishuText(
  event: any,
): { openId: string; text: string; chatId?: string; messageId?: string } | null {
  try {
    const sender = event?.sender ?? {};
    const message = event?.message ?? {};
    const openId = sender?.sender_id?.open_id as string | undefined;
    const chatId = message?.chat_id as string | undefined;
    const messageId = message?.message_id as string | undefined;

    if (!openId || message.message_type !== 'text') return null;

    let text = '';
    try {
      text = JSON.parse(message.content ?? '{}').text ?? '';
    } catch {
      text = String(message.content ?? '');
    }
    if (!text.trim()) return null;

    return { openId, text: text.trim(), chatId, messageId };
  } catch {
    return null;
  }
}