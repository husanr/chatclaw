// ============================================
// 工具调用 XML/JSON 文本：清洗 + 解析（IM/Web 共用）
// ============================================
//
// 背景：部分模型/网关不会发结构化 tool_calls，而是把调用写成文本：
//   <invoke name="file_operations"><parameter name="operation">list</parameter>...</invoke>
//   <tool_calls>{"name":"get_time","arguments":{}}</tool_calls>
//   <tool_调用>{"name":"shell_executor","arguments":{"command":"date"}}</tool_调用>
// 且网关可能往标签里塞杂质（如 <﹨DSM L﹨tool_calls>）。
//
// 双职责：
//   1) stripToolCallXml —— 剔除残留（对标签内杂质免疫，只认关键字）
//   2) parseTextToolCalls —— 把文本调用解析成 {name, args}[] 供 Agent 真实执行
// 关键字集合：tool_calls / tool_调用 / invoke / function_call
// ============================================

// 可识别为工具调用标签的关键字（中英文，出现在 <...> 内即可命中）
const CALL_KEYWORDS = '(?:tool_calls|tool_调用|invoke|function_call|tool_call)';

/** 剔除回复/历史文本中的工具调用文本残留（闭合块 + 未闭合块 + 孤立标签） */
export function stripToolCallXml(text: string): string {
  return (text || '')
    // 1) 闭合块：<...关键字...> ... </...关键字...>
    .replace(
      new RegExp(`<\\s*[^>]*${CALL_KEYWORDS}[^>]*>[\\s\\S]*?<\\s*\\/\\s*[^>]*${CALL_KEYWORDS}[^>]*>`, 'gi'),
      '',
    )
    // 2) 未闭合块：从第一个含关键字的标签吃到文本末尾
    .replace(new RegExp(`<\\s*[^>]*${CALL_KEYWORDS}[^>]*>[\\s\\S]*`, 'gi'), '')
    // 3) 残留的孤立 parameter 标签
    .replace(/<[/]?parameter[^>]*>/gi, '')
    // 4) 收尾：压缩多空行
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 判断文本里是否含有待剔除的文本调用残留（用于日志标记） */
export function hasToolCallXml(text: string): boolean {
  return new RegExp(`<\\s*[^>]*${CALL_KEYWORDS}[^>]*>`, 'i').test(text || '');
}

/**
 * 解析文本形式的工具调用 → [{name, args}]。
 * 支持两种样式：
 *   A) <任意关键字>{"name":"工具名","arguments":{...}}</任意关键字>
 *   B) <invoke name="工具名"><parameter name="k">v</parameter>...</invoke>（XML 参数风格）
 */
export function parseTextToolCalls(text: string): { name: string; args: Record<string, any> }[] {
  const out: { name: string; args: Record<string, any> }[] = [];
  const seen = new Set<string>();
  if (!text) return out;

  const push = (name: string, args: Record<string, any>) => {
    const key = `${name}:${JSON.stringify(args)}`;
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push({ name, args: args ?? {} });
    }
  };

  // A) JSON-in-tag：标签内容是一段 JSON（{"name":..., "arguments":...} 或裸参数对象）
  const jsonTagRe = new RegExp(
    `<\\s*[^>]*${CALL_KEYWORDS}[^>]*>([\\s\\S]*?)<\\s*\\/\\s*[^>]*${CALL_KEYWORDS}[^>]*>`,
    'gi',
  );
  for (const m of text.matchAll(jsonTagRe)) {
    const inner = (m[1] || '').trim();
    if (!inner) continue;
    // 有时 JSON 被 ```json 代码围栏包着
    const jsonText = inner.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try {
      const obj = JSON.parse(jsonText);
      // 样式A1: {"name":"x","arguments":{...}}
      if (obj && typeof obj.name === 'string' && obj.arguments !== undefined) {
        push(obj.name, typeof obj.arguments === 'string' ? safeJsonParse(obj.arguments, {}) : obj.arguments);
      }
      // 样式A2: 裸参数对象但缺 name（无法确定工具，跳过；有 name 字段在 A1 已处理）
    } catch {
      // 不是 JSON → 可能是不带名称的文本，跳过
    }
  }

  // B) XML 参数风格：<invoke name="x"><parameter name="k">v</parameter></invoke>
  const xmlRe = /<\s*[^>]*\binvoke\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\s*\/\s*[^>]*\binvoke\b[^>]*>/gi;
  for (const m of text.matchAll(xmlRe)) {
    const name = (m[1] || '').trim();
    const body = m[2] || '';
    const args: Record<string, any> = {};
    for (const pm of body.matchAll(/<parameter[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/parameter>/gi)) {
      args[(pm[1] || '').trim()] = coerceTextValue((pm[2] || '').trim());
    }
    if (name) push(name, args);
  }

  return out;
}

/** 字符串数值化：纯数字→number，true/false→boolean，JSON→对象，否则原样 */
function coerceTextValue(s: string): any {
  if (s === '') return '';
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === 'true') return true;
  if (s === 'false') return false;
  const parsed = safeJsonParse(s, null);
  return parsed !== null ? parsed : s;
}

function safeJsonParse(s: string, fallback: any): any {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}