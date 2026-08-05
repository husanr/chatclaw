// ============================================
// 重试工具：指数退避 + 可重试错误分类
// ============================================
//
// 🧠 原理讲解：
// LLM API 调用会偶发失败（网络抖动、429 限流、5xx 服务端错误）。
// 一次性失败会让整轮 Agent 崩掉。这里提供带指数退避的重试封装：
// - 可重试：连接失败、429、5xx
// - 不可重试：其他 4xx（参数错误等，重试无用）
//
// 注意：流式调用时，重试只应发生在"开始流式前"（fetch + 非 ok 检查），
// 一旦字节开始流出就不能重试，否则会重复推送已流出的 token。
// ============================================

export interface RetryOptions {
  retries?: number;      // 最大重试次数（默认 3）
  baseDelay?: number;    // 基础退避毫秒（默认 500）
  maxDelay?: number;     // 最大退避毫秒（默认 8000）
  onRetry?: (attempt: number, error: unknown, delay: number) => void;
}

// 判断错误是否值得重试
function isRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return true; // 未知错误，保守重试

  const anyErr = error as any;
  const status = anyErr?.status ?? anyErr?.response?.status;

  // 有 HTTP 状态码时：429 和 5xx 可重试，其他 4xx 不可重试
  if (typeof status === 'number') {
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    if (status >= 400 && status < 500) return false;
  }

  // 无状态码：拖超时、连接失败等网络错误 → 重试
  const name = error.name || '';
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  if (error.message && /ECONN|ENOTFOUND|ETIMEDOUT|fetch failed|socket hang up|network/i.test(error.message)) {
    return true;
  }

  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { retries = 3, baseDelay = 500, maxDelay = 8000, onRetry } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      if (!isRetryable(error)) break;

      // 指数退避 + 随机抖动，避免多请求同时重试打爆 API
      const backoff = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = Math.random() * 0.4 * backoff;
      const delay = Math.round(backoff + jitter);
      onRetry?.(attempt + 1, error, delay);
      await sleep(delay);
    }
  }

  throw lastError;
}