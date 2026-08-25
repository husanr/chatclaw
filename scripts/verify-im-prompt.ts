/**
 * 验证 IM 模式系统提示词：不应出现 shell_executor / background_task / ask_user，
 * 应包含 subagent 和 file_operations；Web 模式应包含全部 16 个工具。
 */
import { Agent } from '../src/lib/agent/agent';

const IM_TOOLS = [
  'web_search', 'calculator', 'code_executor', 'file_operations', 'api_caller',
  'knowledge_search', 'app_config', 'image_generator', 'get_time', 'webpage_fetch',
  'memory', 'reload_tool', 'subagent',
];

const ALL_TOOLS = [
  'knowledge_search', 'web_search', 'calculator', 'code_executor', 'file_operations',
  'api_caller', 'app_config', 'image_generator', 'get_time', 'webpage_fetch',
  'memory', 'reload_tool', 'shell_executor', 'background_task', 'subagent', 'ask_user',
];

function getSystemPrompt(tools: string[]): string {
  const agent = new Agent({} as any, { tools, maxIterations: 1, temperature: 0, maxContextMessages: 20, compressContext: false, model: 'x' } as any);
  const msg = (agent as any).messages.find((m: any) => m.role === 'system');
  return msg?.content ?? '';
}

async function main() {
  const im = getSystemPrompt(IM_TOOLS);
  console.log('=== IM 模式提示词 ===');
  console.log(im);
  console.log('=== 校验 ===');
  const checks = [
    ['IM 不含 shell_executor', !im.includes('shell_executor')],
    ['IM 不含 background_task', !im.includes('background_task')],
    ['IM 不含 ask_user', !im.includes('ask_user')],
    ['IM 包含 subagent', im.includes('subagent')],
    ['IM 包含 file_operations', im.includes('file_operations')],
    ['IM 无 ask_user 规则（意图不明确就问）', !im.includes('意图不明确就问')],
    ['IM 无 shell 规则（涉及真实 Shell 操作）', !im.includes('涉及真实 Shell 操作')],
  ];
  const web = getSystemPrompt(ALL_TOOLS);
  checks.push(
    ['Web 包含 shell_executor', web.includes('shell_executor')],
    ['Web 包含 ask_user', web.includes('ask_user')],
    ['Web 包含规则 7（subagent 拆解）', web.includes('7. **复杂任务可拆解**')],
  );
  let allOk = true;
  for (const [name, ok] of checks) {
    console.log(`${ok ? '✅' : '❌'} ${name}`);
    if (!ok) allOk = false;
  }
  console.log(allOk ? 'ALL_OK' : 'HAS_FAILURES');
  process.exit(allOk ? 0 : 1);
}

main();