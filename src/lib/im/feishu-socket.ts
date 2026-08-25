// ============================================
// 飞书长连接客户端（推荐的事件接收方式）
// ============================================
//
// 🧠 原理：
// 飞书支持「长连接」接收事件——官方 SDK 用 WebSocket 主动连上飞书服务器，
// 飞书把事件推送过来。**不需要公网域名 / 不需要配置事件订阅 URL**，
// 本地开发直接可用（飞书开放平台「事件订阅」选「长连接」方式即可）。
//
// 相比 webhook 的优势：
// - 无公网要求（本地 localhost 也能收事件）
// - 无需 challenge 验证、无需加密策略
// - SDK 自带断线重连 + 心跳
//
// 启动时机：由 src/instrumentation.ts 在 Next.js 服务启动时调用，
// 全局防重复启动（dev 热重载 / 多次 register 只连一次）。
// ============================================

import * as lark from '@larksuiteoapi/node-sdk';
import { extractFeishuText, handleFeishuMessage } from './feishu-events';
import { extractCardAction, handleCardAction } from './card-actions';

let started = false;

/** 启动飞书长连接（幂等：多次调用只启动一次） */
export function startFeishuLongConnection(): void {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  // 未配置飞书应用：跳过
  if (!appId || !appSecret) {
    console.log('[feishu] 未配置 FEISHU_APP_ID/SECRET，跳过长连接启动');
    return;
  }
  // 防重复启动（Next dev 热更新会多次执行 register）
  if (started) {
    console.log('[feishu] 长连接已在运行，跳过重复启动');
    return;
  }

  try {
    // 事件分发器：注册消息事件 + 卡片按钮回调事件
    const eventDispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': (data: any) => {
        const event = data?.event ?? data;
        const parsed = extractFeishuText(event);
        if (!parsed) return;
        // 异步处理：Agent 可能跑很久，不阻塞 SDK 事件循环
        void handleFeishuMessage(parsed.openId, parsed.text, parsed.chatId, parsed.messageId);
      },
      'card.action.trigger': (data: any) => {
        const event = data?.event ?? data;
        const card = extractCardAction(event);
        if (!card) return;
        void handleCardAction(card.openId, card.requestId, card.decision, card.cardMessageId);
      },
    });

    const wsClient = new lark.WSClient({
      appId,
      appSecret,
      loggerLevel: lark.LoggerLevel.info,
      autoReconnect: true,
      source: 'chatclaw',
      onReady: () => {
        console.log('[feishu] ✅ 长连接已就绪，开始接收飞书消息');
      },
      onError: (err: Error) => {
        console.error('[feishu] 长连接错误:', err.message || err);
      },
      onReconnecting: () => {
        console.log('[feishu] 长连接断开，正在重连...');
      },
      onReconnected: () => {
        console.log('[feishu] ✅ 长连接已重连');
      },
    });

    // 启动连接（不 await：连接在后台建立，onReady 通知就绪）
    void wsClient.start({ eventDispatcher }).then(() => {
      console.log('[feishu] 长连接启动流程完成');
    }).catch((err: Error) => {
      console.error('[feishu] 长连接建立失败:', err.message || err);
    });

    started = true;
  } catch (e) {
    console.error('[feishu] 长连接初始化异常:', e instanceof Error ? e.message : e);
  }
}