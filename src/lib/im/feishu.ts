// ============================================
// 飞书（Feishu/Lark）开放平台客户端
// ============================================
//
// 🧠 原理：
// 1. 用户消息：飞书服务器以事件订阅（Webhook）POST 到我们的接口
// 2. 回复消息：我们调用飞书开放 API 主动发送
//   - 先获取 tenant_access_token（应用凭证，2 小时有效，需缓存）
//   - 再调用 /im/v1/messages 发送文本消息
//
// 环境变量（.env.local）：
//   FEISHU_APP_ID / FEISHU_APP_SECRET —— 飞书开放平台「自建应用」的凭证
// ============================================

const FEISHU_BASE = 'https://open.feishu.cn/open-apis';

interface TokenCache {
  token: string;
  expiresAt: number; // 过期时间戳（毫秒）
}

class FeishuClient {
  private appId: string;
  private appSecret: string;
  private tokenCache: TokenCache | null = null;

  constructor(appId: string, appSecret: string) {
    this.appId = appId;
    this.appSecret = appSecret;
  }

  // 获取租户访问令牌（缓存到过期前 10 分钟）
  async getTenantToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - 600_000) {
      return this.tokenCache.token;
    }
    const res = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`获取 tenant_access_token 失败: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.code !== 0) {
      throw new Error(`获取 tenant_access_token 失败: ${data.code} ${data.msg}`);
    }
    this.tokenCache = {
      token: data.tenant_access_token,
      expiresAt: Date.now() + data.expire * 1000,
    };
    return data.tenant_access_token;
  }

  // 发送文本消息给指定用户（open_id）
  async sendText(openId: string, text: string): Promise<void> {
    const token = await this.getTenantToken();
    const res = await fetch(
      `${FEISHU_BASE}/im/v1/messages?receive_id_type=open_id`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receive_id: openId,
          msg_type: 'text',
          content: JSON.stringify({ text }),
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      throw new Error(`发送飞书消息失败: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.code !== 0) {
      throw new Error(`发送飞书消息失败: ${data.code} ${data.msg}`);
    }
  }

  // 发送交互卡片（处理中状态），返回 message_id 供后续更新
  async sendCard(openId: string, card: object): Promise<string> {
    const token = await this.getTenantToken();
    const res = await fetch(
      `${FEISHU_BASE}/im/v1/messages?receive_id_type=open_id`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receive_id: openId,
          msg_type: 'interactive',
          content: JSON.stringify(card),
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      throw new Error(`发送飞书卡片失败: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.code !== 0) {
      throw new Error(`发送飞书卡片失败: ${data.code} ${data.msg}`);
    }
    return data.data?.message_id as string;
  }

  // 更新已有消息为新的卡片内容（处理中 → 最终回答）
  async updateCard(messageId: string, card: object): Promise<void> {
    const token = await this.getTenantToken();
    const res = await fetch(`${FEISHU_BASE}/im/v1/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content: JSON.stringify(card) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`更新飞书卡片失败: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.code !== 0) {
      throw new Error(`更新飞书卡片失败: ${data.code} ${data.msg}`);
    }
  }

  // 添加 Typing 反应（飞书客户端在消息上显示"正在输入…"待回复动画）
  // 返回 reaction_id，回复完成时用其移除
  async addTypingReaction(messageId: string): Promise<string | null> {
    const token = await this.getTenantToken();
    const res = await fetch(`${FEISHU_BASE}/im/v1/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reaction_type: { emoji_type: 'Typing' } }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.code !== 0) {
      // 已存在同款反应/限流时不抛错（保活重试友好）
      throw new Error(`添加 Typing 反应失败: ${data.code ?? res.status} ${data.msg ?? ''}`);
    }
    return (data.data?.reaction_id as string) ?? null;
  }

  // 移除 Typing 反应（回复完成 / 出错时）
  async removeTypingReaction(messageId: string, reactionId?: string | null): Promise<void> {
    if (!reactionId) return;
    const token = await this.getTenantToken();
    const res = await fetch(
      `${FEISHU_BASE}/im/v1/messages/${messageId}/reactions/${reactionId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.code !== 0) {
      throw new Error(`移除 Typing 反应失败: ${data.code ?? res.status} ${data.msg ?? ''}`);
    }
  }

  // 长文本自动分片发送（飞书单条文本上限很高，分片主要为了可读性）
  async sendTextChunks(openId: string, text: string, chunkSize = 4000): Promise<void> {
    const clean = text.trim();
    if (!clean) return;
    if (clean.length <= chunkSize) {
      await this.sendText(openId, clean);
      return;
    }
    const parts: string[] = [];
    let rest = clean;
    // 按段落优先切分，再按字符兜底
    while (rest.length > chunkSize) {
      const slice = rest.slice(0, chunkSize);
      const cut = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'), slice.lastIndexOf('。'));
      const idx = cut > chunkSize * 0.5 ? cut + 1 : chunkSize;
      parts.push(slice.slice(0, idx));
      rest = rest.slice(idx);
    }
    parts.push(rest);
    const total = parts.length;
    for (let i = 0; i < total; i++) {
      await this.sendText(openId, total > 1 ? `（${i + 1}/${total}）\n${parts[i]}` : parts[i]);
    }
  }
}

// 全局单例（按环境变量初始化）
export const feishuClient = new FeishuClient(
  process.env.FEISHU_APP_ID || '',
  process.env.FEISHU_APP_SECRET || '',
);

/** 是否已配置飞书应用（未配置时 webhook 直接返回 ok，不处理） */
export function isFeishuConfigured(): boolean {
  return Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET);
}