// ============================================
// Telegram Bot API 客户端
// ============================================
//
// 🧠 原理：
// 同飞书：Bot 收到消息（Webhook POST）→ 我们后台处理 → 调 sendMessage 回复。
// Telegram 优势：无需申请企业应用，找 @BotFather 创建 Bot 拿 token 即可。
//
// 环境变量：TELEGRAM_BOT_TOKEN
// Webhook 注册：curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://你的公网地址/api/im/telegram"
// ============================================

const TELEGRAM_BASE = 'https://api.telegram.org';

class TelegramClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  // 发送文本消息（支持 MarkdownV2 但是转义麻烦，这里用纯文本）
  async sendText(chatId: number | string, text: string): Promise<void> {
    const res = await fetch(`${TELEGRAM_BASE}/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`发送 Telegram 消息失败: HTTP ${res.status} ${err.slice(0, 200)}`);
    }
  }

  // 长文本分片
  async sendTextChunks(chatId: number | string, text: string, chunkSize = 4000): Promise<void> {
    const clean = text.trim();
    if (!clean) return;
    if (clean.length <= chunkSize) {
      await this.sendText(chatId, clean);
      return;
    }
    const parts: string[] = [];
    let rest = clean;
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
      await this.sendText(chatId, total > 1 ? `（${i + 1}/${total}）\n${parts[i]}` : parts[i]);
    }
  }
}

export const telegramClient = new TelegramClient(process.env.TELEGRAM_BOT_TOKEN || '');

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}