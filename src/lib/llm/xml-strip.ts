// ============================================
// 工具调用 XML 残留清洗器（IM/Web 共用）
// ============================================
//
// 背景：某些模型（或网关）会把工具调用写成文本形式：
//   <tool_calls><invoke name="get_time"/></tool_calls>
//   <﹨DSM L﹨tool_calls><﹨DSM L﹨invoke name="x">...</﹨DSM L﹨tool_calls>（网关注入标记）
// 这类文本不是可执行调用，且会污染历史让模型模仿 → 收发时统一清洗。
//
// 策略：只匹配「标签内含 tool_calls / invoke / parameter 关键字」的 XML 块，
// 对标签内的任何杂质（U+FF5C、DSM、空白等）免疫；不碰正常正文。
// ============================================

/** 剔除回复/历史文本中的工具调用 XML 残留（闭合块 + 未闭合块 + 孤立标签） */
export function stripToolCallXml(text: string): string {
  return (text || '')
    // 1) 闭合块：<...tool_calls|invoke|parameter...> ... </...tool_calls|invoke|parameter...>
    .replace(
      /<\s*[^>]*(?:tool_calls|invoke|parameter)[^>]*>[\s\S]*?<\s*\/\s*[^>]*(?:tool_calls|invoke|parameter)[^>]*>/gi,
      '',
    )
    // 2) 未闭合块：从第一个含关键字的标签吃到文本末尾（尾部残留无意义）
    .replace(/<\s*[^>]*(?:tool_calls|invoke|parameter)[^>]*>[\s\S]*/gi, '')
    // 3) 收尾：清掉可能残留的空白行
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 判断文本里是否含有待剔除的 XML 残留（用于日志标记） */
export function hasToolCallXml(text: string): boolean {
  return /<\s*[^>]*(?:tool_calls|invoke|parameter)[^>]*>/i.test(text || '');
}