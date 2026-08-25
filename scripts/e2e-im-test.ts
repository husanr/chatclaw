/**
 * 端到端测试：IM 审批流 + 文本工具调用桥 + XML 垃圾根治（真实模型 + 真实会话存储）
 *
 * 断言基于「会话里的 tool 执行记录」（success 标记），不是模型嘴上说的。
 * 运行：npx tsx scripts/e2e-im-test.ts
 */
import fs from 'fs';
import path from 'path';

// 1) 灌入 .env.local 的 IM_* 变量（必须在动态 import 之前）
const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && m[1].startsWith('IM_')) process.env[m[1]] = m[2].trim();
}
process.env.IM_SESSION_FILE = '/tmp/im-e2e-sessions.json';
process.env.IM_ALLOWLIST = 'ou_test';
try { fs.unlinkSync(process.env.IM_SESSION_FILE); } catch { /* 首次无文件 */ }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 读会话文件（先等落盘防抖 500ms） */
async function readSession(): Promise<any> {
  await sleep(700);
  try {
    return JSON.parse(fs.readFileSync(process.env.IM_SESSION_FILE!, 'utf-8'))['feishu:ou_test'] ?? { messages: [] };
  } catch {
    return { messages: [] };
  }
}

/** 提取会话里真实的工具执行记录 */
function toolMessages(sess: any): { name: string; success: boolean }[] {
  const out: { name: string; success: boolean }[] = [];
  for (const m of sess?.messages || []) {
    if (m.role === 'tool') {
      let success = false;
      try { success = !!JSON.parse(m.content ?? '{}').success; } catch { /* 解析失败当失败 */ }
      out.push({ name: m.name, success });
    }
  }
  return out;
}

/** 严格判定回复里是否残留工具调用文本 */
function hasXmlJunk(s: string): boolean {
  const lt = String.fromCharCode(60);
  const gt = String.fromCharCode(62);
  const keys = ['tool_calls', 'tool_调用', 'invoke', 'function_call', 'parameter'];
  for (const k of keys) {
    if (s.includes(lt + k) || s.includes(lt + '/' + k)) return true;
  }
  return new RegExp(lt + '[^' + gt + ']*(?:tool_calls|tool_调用|invoke|function_call|parameter)[^' + gt + ']*' + gt, 'i').test(s);
}

async function main() {
  const { runImAgent } = await import('../src/lib/im/agent');
  const results: { step: string; pass: boolean; detail: string }[] = [];
  const record = (step: string, pass: boolean, detail: string) => results.push({ step, pass, detail: detail.slice(0, 160) });

  // 步骤1：真工具调用 get_time 必须真实执行成功
  const r1 = await runImAgent('feishu', 'ou_test', '你好！现在几点了？请用时间工具获取真实时间。');
  const s1 = await readSession();
  const tm1 = toolMessages(s1);
  record('1 get_time必须真实执行成功', !hasXmlJunk(r1) && tm1.some((t) => t.name === 'get_time' && t.success), r1);

  // 步骤2：shell → 必须触发真正的 🛂 审批 + pending
  const r2 = await runImAgent('feishu', 'ou_test', '用 shell 执行 date 命令，把结果告诉我');
  const s2 = await readSession();
  record('2 shell必须触发🛂审批请求', r2.includes('🛂') && r2.includes('申请授权') && s2.pending?.kind === 'approval', r2);

  // 步骤3：批准 → shell_executor 必须真实执行成功（date 真输出）
  const r3 = await runImAgent('feishu', 'ou_test', '批准');
  const s3 = await readSession();
  const tm3 = toolMessages(s3);
  record('3 批准后shell必须真执行', !hasXmlJunk(r3) && s3.pending === null && tm3.some((t) => t.name === 'shell_executor' && t.success), r3);

  // 步骤4：再来一次 shell + 审批 → 拒绝 → 不得执行 echo
  const r4 = await runImAgent('feishu', 'ou_test', '用 shell 执行 echo HELLO_E2E 然后结束');
  const s4 = await readSession();
  record('4 第二次shell触发审批', r4.includes('🛂') && r4.includes('申请授权') && s4.pending?.kind === 'approval', r4);
  const r5 = await runImAgent('feishu', 'ou_test', '拒绝');
  const s5 = await readSession();
  const tm5 = toolMessages(s5);
  const deniedShell = tm5.filter((t) => t.name === 'shell_executor' && !t.success).length;
  const okShell = tm5.filter((t) => t.name === 'shell_executor' && t.success).length;
  // 拒绝后：出现失败记录（deny 注入），且成功的 shell 只有步骤3那一次 date
  record('5 拒绝后不得执行echo', !hasXmlJunk(r5) && s5.pending === null && deniedShell >= 1 && okShell === 1, r5);

  let allOk = true;
  for (const r of results) {
    console.log(`${r.pass ? 'PASS✅' : 'FAIL❌'} ${r.step}`);
    console.log(`     ${r.detail}`);
    if (!r.pass) allOk = false;
  }
  console.log(allOk ? 'E2E_ALL_OK' : 'E2E_HAS_FAILURES');
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error('E2E 崩溃:', e);
  process.exit(1);
});