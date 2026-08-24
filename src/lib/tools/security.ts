// ============================================
// shell 命令安全检查（shell_executor / background_task 共用）
// ============================================
//
// 🧠 设计说明：
// Agent 有了真实 shell 能力后，必须有强安全护栏：
// 1. 危险命令硬阻断（黑名单模式）——无论用户怎么批，这些都不能执行
// 2. 工作目录限制——只能在用户指定的 allowedDir 内操作
// 3. 危险命令需要人工审批——工具标记 requiresApproval，Agent 会暂停等用户确认
// ============================================

// 硬阻断的危险模式：命中直接拒绝（不依赖审批，这些命令永远不该执行）
const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)*\/(\s|$)/,      // rm -rf / 等根目录删除
  /\brm\s+-[a-zA-Z]*[rf][a-zA-Z]*\s+~/,                 // 删家目录
  /\bmkfs(\.\w+)?\b/,                                    // 格式化
  /\bdd\b.*\bof=\/dev\//,                                // dd 写设备
  /\b(fdisk|parted|gdisk)\b/,                            // 分区工具
  /\b(reboot|shutdown|halt|poweroff|init\s+0|init\s+6)\b/, // 关机重启
  /\bchmod\s+777\s+\//,                                  // 根目录提权
  /\bchown\s+(-R\s+)?[^:]+:[^: ]+\s+\//,                 // 根目录改属主
  /:\(\)\s*\{\s*:\|:&\s*\};:/,                           // fork bomb
  />\s*\/dev\/(sd[a-z]+|nvme\w+|disk\w+)/,               // 写裸设备
  /\b(>|>>|\|)\s*\/etc\b/,                               // 写 /etc
  /\bmv\s+\/\s+/,                                        // 挪根目录
  /\bcurl\b.*\|\s*\w*sh\b/,                              // curl | sh 盲执行
  /\bwget\b.*-O\s+\/etc\//,                              // wget 写系统目录
  /\bsudo\b/,                                            // 提权（一律禁止）
  /\bdangerzone\b/,                                      // 保留关键字
];

/** 危险命令检查：返回 null 表示安全，否则返回拒绝原因 */
export function checkDangerousCommand(command: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return `安全限制：命令被硬性阻断（命中危险模式 ${pattern}）。此类命令即使审批也不允许执行。`;
    }
  }
  return null;
}

/** 命令是否看起来安全（供审批文案展示） */
export function summarizeCommand(command: string): string {
  const trimmed = command.trim();
  if (trimmed.length <= 80) return trimmed;
  return trimmed.slice(0, 80) + '…';
}