// ============================================
// 飞书交互卡片构建器
//   - 审批请求卡片（橙色调 + 批准/拒绝按钮）
//   - 审批结果/处理中/已过期卡片（按钮回调后更新用）
//   - Markdown 回复卡片（普通回答渲染，对齐 Hermes 的交互体验）
// ============================================
import type { ImPendingApproval } from './session';

/** 审批请求卡片：工具描述 + 参数 + 批准/拒绝按钮（按钮 value 带 req + decision） */
export function buildApprovalCard(p: ImPendingApproval): object {
  const argsJson = JSON.stringify(p.toolArgs ?? {});
  const argsShown = argsJson.length > 400 ? argsJson.slice(0, 400) + '…' : argsJson;
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'orange',
      title: { tag: 'plain_text', content: '🛂 申请授权' },
    },
    elements: [
      {
        tag: 'markdown',
        content: `**#${p.requestId}** · \`${p.toolName}\`\n> ${p.toolDescription}`,
      },
      { tag: 'hr' },
      {
        tag: 'markdown',
        content: `**📋 参数**\n\`${argsShown}\``,
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '✅ 批准执行' },
            type: 'primary',
            value: { req: p.requestId, decision: 'approve' },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🚫 拒绝' },
            type: 'danger',
            value: { req: p.requestId, decision: 'reject' },
          },
        ],
      },
      {
        tag: 'note',
        elements: [{ tag: 'plain_text', content: '点击按钮即可，或直接回复「批准」/「拒绝」' }],
      },
    ],
  };
}

/** 按钮已点击、正在处理中的卡片（按钮置灰防连点） */
export function buildProcessingCard(p: ImPendingApproval, granted: boolean): object {
  const label = granted ? '✅ 已批准，正在执行…' : '🚫 已拒绝，正在处理…';
  return {
    config: { wide_screen_mode: true },
    header: {
      template: granted ? 'green' : 'red',
      title: { tag: 'plain_text', content: granted ? '审批通过' : '已拒绝' },
    },
    elements: [
      { tag: 'markdown', content: `**#${p.requestId}** · \`${p.toolName}\`\n${label}` },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: granted ? '✅ 已批准' : '🚫 已拒绝' },
            type: granted ? 'primary' : 'danger',
            disabled: true,
            value: {},
          },
        ],
      },
    ],
  };
}

/** 审批终态卡片（执行完毕后更新按钮卡片为结果摘要） */
export function buildApprovalResultCard(
  p: ImPendingApproval,
  granted: boolean,
  snippet: string,
): object {
  const title = granted ? '✅ 已批准 · 执行完成' : '🚫 已拒绝';
  const color = granted ? 'green' : 'red';
  const snippetShown = snippet.length > 400 ? snippet.slice(0, 400) + '…' : snippet;
  return {
    config: { wide_screen_mode: true },
    header: { template: color, title: { tag: 'plain_text', content: title } },
    elements: [
      { tag: 'markdown', content: `**#${p.requestId}** · \`${p.toolName}\`` },
      { tag: 'hr' },
      { tag: 'markdown', content: `> ${snippetShown.replace(/\n/g, '\n> ')}` },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: granted ? '✅ 已批准' : '🚫 已拒绝' },
            type: granted ? 'primary' : 'danger',
            disabled: true,
            value: {},
          },
        ],
      },
    ],
  };
}

/** 请求已过期/已处理的占位卡片（防重复点击误执行） */
export function buildStaleCard(requestId: string): object {
  return {
    config: { wide_screen_mode: true },
    header: { template: 'grey', title: { tag: 'plain_text', content: '⏳ 请求已处理' } },
    elements: [
      { tag: 'markdown', content: `**#${requestId}** 已被处理，本次点击不生效。` },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '已处理' },
            type: 'default',
            disabled: true,
            value: {},
          },
        ],
      },
    ],
  };
}

/** 普通 Markdown 回复卡片（渲染 **加粗** / 列表 / 行内代码 / 链接等） */
export function buildMarkdownCard(md: string): object {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: '🤖 小鱼儿' },
    },
    elements: [
      {
        tag: 'markdown',
        content: md,
      },
    ],
  };
}