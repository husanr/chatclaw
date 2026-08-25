// 冒烟：卡片 JSON 结构 + 卡片回调事件解析（v1/v2 schema）
import {
  buildApprovalCard,
  buildMarkdownCard,
  buildProcessingCard,
  buildApprovalResultCard,
  buildStaleCard,
} from '/Users/sanhu/Documents/program/AI/ai-agent/src/lib/im/cards';
import { extractCardAction } from '/Users/sanhu/Documents/program/AI/ai-agent/src/lib/im/card-actions';

async function main() {
  const pend = {
    kind: 'approval' as const,
    requestId: 'req_1725000000000',
    toolName: 'shell_executor',
    toolArgs: { command: 'date' },
    toolDescription: '运行 shell 命令',
    createdAt: Date.now(),
  };

  // 1. 审批卡片结构
  const card = buildApprovalCard(pend) as any;
  console.log('[1] 审批卡片 header:', card.header?.template, card.header?.title?.content);
  console.log('[1] elements 数:', card.elements?.length);
  const actions = card.elements?.find((e: any) => e.tag === 'action')?.actions ?? [];
  console.log('[1] 按钮:', actions.map((a: any) => `${a.text.content}@${a.type} -> ${JSON.stringify(a.value)}`).join(' | '));
  const md = card.elements?.find((e: any) => e.tag === 'markdown')?.content ?? '';
  console.log('[1] markdown 含参数:', md.includes('date'), '| 含#req:', md.includes('#req_1725'));
  if (!card.config?.wide_screen_mode) throw new Error('缺 config.wide_screen_mode');
  if (actions.length !== 2) throw new Error('按钮数 != 2');
  if (actions[0].value.decision !== 'approve' || actions[1].value.decision !== 'reject') throw new Error('按钮 value 错误');

  // 2. 其他卡片
  const procCard = buildProcessingCard(pend, true) as Record<string, any>;
  const resCard = buildApprovalResultCard(pend, true, '✅ 命令输出: 当前时间...') as Record<string, any>;
  const staleCard = buildStaleCard('req_x') as Record<string, any>;
  const mdCard = buildMarkdownCard('**加粗** `code`\n- a\n- b') as Record<string, any>;
  console.log('[2] processing:', procCard['header']['template']);
  console.log('[2] result:', resCard['elements'][2]['content'].slice(0, 30));
  console.log('[2] stale:', staleCard['header']['template']);
  console.log('[2] md 卡片:', mdCard['elements'][0]['content'].slice(0, 20));

  // 3. extractCardAction v1 / v2
  const v2 = {
    event: {
      operator: { open_id: 'ou_v2_openid' },
      action: { value: { req: 'req_abc', decision: 'approve' } },
      context: { open_message_id: 'om_v2_msg' },
    },
  };
  const v1 = {
    open_id: 'ou_v1_openid',
    operator_id: { open_id: 'ou_v1_op' },
    action: { value: { req: 'req_def', decision: 'reject' } },
    context: { open_message_id: 'om_v1_msg' },
  };
  const r2 = extractCardAction(v2);
  const r1 = extractCardAction(v1);
  console.log('[3] v2:', JSON.stringify(r2));
  console.log('[3] v1:', JSON.stringify(r1));
  if (!r2 || r2.openId !== 'ou_v2_openid' || r2.requestId !== 'req_abc' || r2.decision !== 'approve') throw new Error('v2 解析错');
  if (!r1 || r1.openId !== 'ou_v1_openid' || r1.requestId !== 'req_def' || r1.decision !== 'reject') throw new Error('v1 解析错');
  // 垃圾事件解析为 null
  if (extractCardAction({ event: { operator: {} } }) !== null) throw new Error('空事件应返回 null');

  console.log('\n✅ SMOKE_CARDS_ALL_OK');
}

main().catch(e => {
  console.error('❌', e);
  process.exit(1);
});