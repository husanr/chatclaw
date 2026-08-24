// ============================================
// shell_executor 工具 - 真实 Shell 执行（v1: 沙箱 + 授权）
// ============================================
//
// 🧠 设计说明：
// code_executor 只能跑 JS 沙箱，遇到真实系统操作就无能为力。
// shell_executor 让 Agent 能在用户授权下执行真实命令：
// - 工作目录锁定在 allowedDir（安全边界）
// - 危险命令硬阻断（见 security.ts）
// - requiresApproval=true：所有命令执行前都要用户审批
// - 超时控制 + 输出截断，防止失控
// ============================================

import { exec } from 'child_process';
import path from 'path';
import type { Tool, ToolResult } from '@/types';
import { getAllowedDir } from './context';
import { checkDangerousCommand } from './security';

const MAX_OUTPUT_LENGTH = 50_000;  // 输出截断上限
const DEFAULT_TIMEOUT = 15_000;    // 默认超时 15s
const MAX_TIMEOUT = 60_000;        // 超时上限 60s

export const shellExecutorTool: Tool = {
  // 需要用户审批：所有 shell 命令执行前都会暂停，等用户确认
  requiresApproval: true,
  definition: {
    name: 'shell_executor',
    description:
      '在用户授权的工作目录中执行真实 Shell 命令（bash）。可执行 npm、git、python 等任何命令行任务。注意：每次执行前都会请求用户确认。危险命令（rm -rf /、格式化、关机等）会被硬性禁止。',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '要执行的 Shell 命令（支持管道、变量、&& 等 bash 语法）',
        },
        timeout: {
          type: 'number',
          description: '超时时间（毫秒，默认 15000，最大 60000）',
        },
      },
      required: ['command'],
    },
  },
  async execute(args): Promise<ToolResult> {
    const command = String(args.command ?? '').trim();
    const timeout = Math.min(Number(args.timeout) || DEFAULT_TIMEOUT, MAX_TIMEOUT);

    if (!command) {
      return { success: false, error: 'command 不能为空' };
    }

    // 第一道闸：危险命令硬阻断（不需要审批也禁止）
    const blocked = checkDangerousCommand(command);
    if (blocked) {
      return { success: false, error: blocked };
    }

    const cwd = getAllowedDir();
    const resolvedCwd = path.resolve(cwd);

    return new Promise<ToolResult>((resolve) => {
      exec(
        command,
        {
          cwd: resolvedCwd,
          timeout,
          maxBuffer: MAX_OUTPUT_LENGTH * 4,
          env: { ...process.env, PWD: resolvedCwd },
        },
        (error, stdout, stderr) => {
          const combined = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ''}`.trim();
          const truncated =
            combined.length > MAX_OUTPUT_LENGTH
              ? combined.slice(0, MAX_OUTPUT_LENGTH) + `\n…（输出过长，已截断 ${combined.length} 字符）`
              : combined;

          if (error) {
            const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
            // 超时单独报
            if (err.killed || (err.signal && err.signal !== 'SIGINT')) {
              resolve({
                success: false,
                error: `命令执行超时（>${timeout}ms），已终止。当前输出：\n${truncated || '（无输出）'}`,
              });
              return;
            }
            resolve({
              success: false,
              error: `命令执行失败（exit ${err.code ?? '?'}）：${truncated || err.message}`,
              data: { exitCode: err.code ?? null, output: truncated },
            });
            return;
          }

          resolve({
            success: true,
            data: {
              exitCode: 0,
              output: truncated || '（命令执行成功，无输出）',
              cwd: resolvedCwd,
            },
          });
        },
      );
    });
  },
};