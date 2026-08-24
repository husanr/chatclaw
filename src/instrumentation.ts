// ============================================
// Next.js 服务启动钩子
// ============================================
//
// register() 在 Node.js 服务端启动时执行一次：
// - 启动飞书长连接客户端（事件订阅「长连接」模式，无需公网域名）
//
// 注意：仅在 nodejs runtime 下启动（Edge 无长驻进程）。
// ============================================

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startFeishuLongConnection } = await import('./lib/im/feishu-socket');
    startFeishuLongConnection();
  }
}