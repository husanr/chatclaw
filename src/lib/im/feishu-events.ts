// ============================================
// 飞书消息事件处理（webhook 与长连接共用）
// ============================================
//
// 处理体验（仿「待回复标识」）：
// 1. 收到用户消息 → 立即发一张「🤔 正在处理中...」卡片（用户马上看到反馈）
// 2. Agent 后台处理（可能几十秒）
// 3. 完成后把同一张卡片更新为最终回答（一条消息从"处理中"变"回答"）
//
// 这样用户不会觉得机器人"死了"——处理中就有待回复的标识。
// ============================================

import { runImAgent } from './agent';
import { feishuClient } from './feishu';

// 卡片显示回答的最大长度（超过则卡片提示+分条发送）
const CARD_MAX = 3500;

/** 构造飞书交互卡片 */
function card(template: string, title: string, markdown: string): object {
  return {
    schema: '2.0',
    header: {
      template,
      title: { tag: 'plain_text', content: title },
    },
    elements: [{ tag: 'markdown', content: markdown }],
  };
}

/** 处理一条飞书文本消息（openId 为发送者） */
export async function handleFeishuMessage(openId: string, text: string, chatId?: string): Promise<void> {
  console.log(`[feishu] 收到消息 openId=${openId} chatId=${chatId ?? '-'}: ${text.slice(0, 80)}`);
  let pendingMessageId: string | null = null;

  try {
    // 1. 立即发"处理中"卡片（待回复标识）
    try {
      pendingMessageId = await feishuClient.sendCard(
        openId,
        card('blue', '🤔 chatClaw 思考中…', `**收到你的消息**：\n${text.slice(0, 200)}\n\n正在处理，请稍候～`),
      );
    } catch (e) {
      // 卡片发送失败不阻塞主流程（降级为无占位）
      console.warn('[feishu] 处理中卡片发送失败（降级）:', e instanceof Error ? e.message : e);
    }

    // 2. 跑 Agent
    const answer = await runImAgent('feishu', openId, text);

    // 3. 更新卡片为最终回答（或降级为文本）
    const finalContent = answer.trim();
    if (pendingMessageId) {
      if (finalContent.length <= CARD_MAX) {
        await feishuClient.updateCard(pendingMessageId, card('green', '💬 chatClaw', finalContent));
      } else {
        await feishuClient.updateCard(
          pendingMessageId,
          card('green', '✅ chatClaw 处理完成', `**回答较长**（${finalContent.length} 字符），已通过后续消息分条发送 👇`),
        );
        await feishuClient.sendTextChunks(openId, finalContent);
      }
    } else {
      await feishuClient.sendTextChunks(openId, finalContent);
    }
    console.log(`[feishu] → 已回复（${finalContent.length} 字符）`);
  } catch (e) {
    console.error('[feishu] 处理失败:', e);
    const errMsg = `❌ 服务出错了: ${e instanceof Error ? e.message : String(e)}`;
    try {
      if (pendingMessageId) {
        await feishuClient.updateCard(pendingMessageId, card('red', '❌ chatClaw 出错了', errMsg));
      } else {
        await feishuClient.sendText(openId, errMsg);
      }
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