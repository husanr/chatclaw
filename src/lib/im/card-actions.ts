// ============================================
// 飞书卡片按钮回调处理（card.action.trigger）
// ============================================
//
// 🧠 流程（长连接推送，与消息事件同一 WSClient）：
//   用户点「批准/拒绝」→ 飞书发 card.action.trigger 事件
//   → openId + action.value{req, decision} + context.open_message_id
//   → 白名单校验 → withUserLock 串行（防与消息处理并发）
//   → 校验 pending.requestId 匹配（防重复点击/旧卡片误执行）
//   → 卡片更新为「处理中」（按钮置灰防连点）
//   → resumePendingApproval 恢复 Agent 执行
//   → 卡片更新为终态 + 完整结果单独发 markdown 卡片
//   → 多级审批：若恢复后又产生新 pending，再发一张审批卡片
// ============================================

import { getSession, withUserLock, type ImPendingApproval } from './session';
import { resumePendingApproval, attachApprovalCardMessage } from './agent';
import { feishuClient } from './feishu';
import {
  buildApprovalCard,
  buildApprovalResultCard,
  buildMarkdownCard,
  buildProcessingCard,
  buildStaleCard,
} from './cards';

const APPROVAL_RESULT_MAX = 500; // 按钮卡片内结果摘要长度

/** 从 card.action.trigger 事件提取卡片回调信息（兼容 v1/v2 schema） */
export function extractCardAction(
  event: any,
): { openId: string; requestId: string; decision: string; cardMessageId?: string } | null {
  try {
    const ev = event?.event ?? event ?? {};
    const openId =
      ev?.operator?.open_id ??
      ev?.open_id ??
      ev?.operator_id?.open_id ??
      ev?.user?.open_id ??
      '';
    const action = ev?.action ?? {};
    const value = action?.value ?? action ?? {};
    const requestId = String(value?.req ?? '');
    const decision = String(value?.decision ?? '');
    const cardMessageId = ev?.context?.open_message_id ?? ev?.open_message_id ?? ev?.message_id ?? '';
    if (!openId || !requestId) return null;
    return { openId, requestId, decision, cardMessageId };
  } catch {
    return null;
  }
}

/** 处理一次卡片按钮回调（异步执行，不阻塞 SDK 事件循环） */
export async function handleCardAction(
  openId: string,
  requestId: string,
  decision: string,
  cardMessageId?: string,
): Promise<void> {
  console.log(
    `[feishu] 卡片回调 openId=${openId} req=${requestId} decision=${decision} card=${cardMessageId ?? '-'}`,
  );

  // 白名单（与消息路径一致：IM_ALLOWLIST 未配置=放行；配置了则只认白名单）
  const allowlist = (process.env.IM_ALLOWLIST || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (allowlist.length > 0 && !allowlist.includes(openId)) {
    console.warn(`[feishu] 卡片回调被白名单拦截: ${openId}`);
    return;
  }
  if (decision !== 'approve' && decision !== 'reject') {
    console.warn(`[feishu] 未知 decision: ${decision}`);
    return;
  }
  const granted = decision === 'approve';

  await withUserLock('feishu', openId, async () => {
    const session = await getSession('feishu', openId);
    const pending = session.pending;
    if (pending?.kind !== 'approval' || pending.requestId !== requestId) {
      // 已处理/编号不匹配：把卡片置灰防再点（绝不误执行）
      if (cardMessageId) {
        await feishuClient.updateCard(cardMessageId, buildStaleCard(requestId)).catch(() => {});
      }
      return;
    }

    // 1. 先把按钮卡片更新为「处理中」（防连点 + 用户有即时反馈）
    if (cardMessageId) {
      await feishuClient.updateCard(cardMessageId, buildProcessingCard(pending, granted)).catch(() => {});
    }

    // 2. 恢复 Agent（同一把锁内，避免与消息路径并发消费同一 pending）
    const r = await resumePendingApproval('feishu', openId, granted);

    // 3. 按钮卡片更新为终态（结果摘要）
    if (cardMessageId && r.consumed) {
      await feishuClient
        .updateCard(
          cardMessageId,
          buildApprovalResultCard(pending, granted, r.text.slice(0, APPROVAL_RESULT_MAX)),
        )
        .catch(() => {});
    }

    // 4. 完整结果单独发 markdown 卡片（避免被按钮卡片摘要截断）
    if (r.consumed && r.text) {
      await feishuClient
        .sendCard(openId, buildMarkdownCard(r.text.length > 9000 ? r.text.slice(0, 9000) + '\n…（内容较长，已截断）' : r.text))
        .catch(e => {
          console.warn('[feishu] 结果卡片发送失败，降级文本:', e instanceof Error ? e.message : e);
          void feishuClient.sendText(openId, r.text).catch(() => {});
        });
    }

    // 5. 多级审批：恢复后又触发新审批 → 再发一张审批卡片
    if (r.consumed && r.nextPending) {
      const next: ImPendingApproval = r.nextPending;
      try {
        const mid = await feishuClient.sendCard(openId, buildApprovalCard(next));
        await attachApprovalCardMessage('feishu', openId, mid);
      } catch (e) {
        console.warn('[feishu] 多级审批卡片发送失败:', e instanceof Error ? e.message : e);
      }
    }
  });
}