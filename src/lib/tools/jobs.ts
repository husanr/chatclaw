// ============================================
// background_task 工具 - 后台任务管理（启动 / 查询 / 终止）
// ============================================
//
// 🧠 设计说明：
// shell_executor 是同步等待，长任务（build、安装依赖、爬虫）会卡死 Agent。
// background_task 让 Agent 把长任务丢到后台跑，随时查询进度，完成后拿结果：
// - start: 后台启动 shell 命令，立即返回 jobId
// - status: 查询任务状态 + 累积输出尾部
// - list: 列出所有任务
// - stop: 终止正在运行的任务（SIGTERM）
// - result: 获取完整输出（任务结束后）
//
// 安全：与 shell_executor 同样的危险命令硬阻断；start 需要用户审批。
// 清理策略：任务表最多 30 个，超过则剔除最早结束的；结束超 1 小时的自动清理。
// ============================================

import { spawn } from 'child_process';
import path from 'path';
import type { Tool, ToolResult } from '@/types';
import { getAllowedDir } from './context';
import { checkDangerousCommand } from './security';

export type JobStatus = 'running' | 'completed' | 'failed' | 'stopped';

export interface BackgroundJob {
  id: string;
  command: string;
  status: JobStatus;
  stdout: string;        // 累积 stdout（截断到 MAX_OUTPUT_LENGTH）
  stderr: string;
  exitCode: number | null;
  startedAt: number;
  finishedAt: number | null;
  pid: number | null;
}

const jobs = new Map<string, BackgroundJob>();
let jobSeq = 0;
const MAX_OUTPUT_LENGTH = 100_000;
const MAX_JOBS = 30;

function pruneJobs(): void {
  const now = Date.now();
  // 清理：结束超过 1 小时的任务
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > 3600_000) {
      jobs.delete(id);
    }
  }
  // 数量超限：剔除最早结束的已完成任务
  if (jobs.size > MAX_JOBS) {
    const finished = [...jobs.entries()]
      .filter(([, j]) => j.status !== 'running')
      .sort((a, b) => (a[1].finishedAt ?? 0) - (b[1].finishedAt ?? 0));
    for (const [id] of finished) {
      if (jobs.size <= MAX_JOBS) break;
      jobs.delete(id);
    }
  }
}

export function startJob(command: string, cwd: string): BackgroundJob {
  pruneJobs();
  const id = `job_${++jobSeq}_${Date.now().toString(36)}`;
  const job: BackgroundJob = {
    id,
    command,
    status: 'running',
    stdout: '',
    stderr: '',
    exitCode: null,
    startedAt: Date.now(),
    finishedAt: null,
    pid: null,
  };
  jobs.set(id, job);

  const child = spawn(command, { cwd, shell: true });
  job.pid = child.pid ?? null;

  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    job.stdout = (job.stdout + text).slice(-MAX_OUTPUT_LENGTH);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    job.stderr = (job.stderr + text).slice(-MAX_OUTPUT_LENGTH);
  });
  child.on('error', (err) => {
    job.status = 'failed';
    job.finishedAt = Date.now();
    job.stderr = (job.stderr + `\n[启动失败] ${err.message}`).slice(-MAX_OUTPUT_LENGTH);
  });
  child.on('close', (code) => {
    job.exitCode = code;
    job.finishedAt = Date.now();
    job.status = code === 0 ? 'completed' : 'failed';
  });

  return job;
}

export function stopJob(id: string): BackgroundJob | null {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.status === 'running' && job.pid) {
    try {
      process.kill(job.pid, 'SIGTERM');
      job.status = 'stopped';
      job.finishedAt = Date.now();
      job.stderr = (job.stderr + '\n[用户/Agent 已终止]').slice(-MAX_OUTPUT_LENGTH);
    } catch {
      job.status = 'stopped';
      job.finishedAt = Date.now();
    }
  }
  return job;
}

export function listJobs(): BackgroundJob[] {
  return [...jobs.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((j) => ({
      ...j,
      stdout: j.stdout.slice(-2000), // list 只回尾部
      stderr: j.stderr.slice(-2000),
    }));
}

export function getJob(id: string): BackgroundJob | undefined {
  return jobs.get(id);
}

function jobSnapshot(job: BackgroundJob, full: boolean): Record<string, unknown> {
  const tail = (s: string) => (full ? s : s.slice(-2000));
  return {
    id: job.id,
    command: job.command,
    status: job.status,
    exitCode: job.exitCode,
    startedAt: new Date(job.startedAt).toISOString(),
    finishedAt: job.finishedAt ? new Date(job.finishedAt).toISOString() : null,
    pid: job.pid,
    stdout: tail(job.stdout),
    stderr: tail(job.stderr),
  };
}

export const backgroundTaskTool: Tool = {
  requiresApproval: true, // start 需要审批
  definition: {
    name: 'background_task',
    description:
      '后台任务管理：把长耗时命令放到后台异步执行，不阻塞 Agent。start（启动 shell 任务，返回 jobId，需用户审批）、status（查询任务状态和输出）、list（列出所有任务）、stop（终止任务）、result（获取完整输出）。适合 npm install、构建、长时间运行的服务、数据处理等耗时长任务。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'status', 'list', 'stop', 'result'],
          description: '操作类型',
        },
        command: {
          type: 'string',
          description: 'start 时：要后台执行的 Shell 命令',
        },
        id: {
          type: 'string',
          description: 'status/stop/result 时的任务 ID',
        },
      },
      required: ['action'],
    },
  },
  async execute(args): Promise<ToolResult> {
    const action = String(args.action ?? '');
    const command = String(args.command ?? '').trim();
    const id = String(args.id ?? '');

    try {
      switch (action) {
        case 'start': {
          if (!command) return { success: false, error: 'start 需要 command 参数' };
          const blocked = checkDangerousCommand(command);
          if (blocked) return { success: false, error: blocked };
          const job = startJob(command, path.resolve(getAllowedDir()));
          return {
            success: true,
            data: {
              jobId: job.id,
              pid: job.pid,
              message: `任务已后台启动：${job.command}`,
            },
          };
        }
        case 'status': {
          if (!id) return { success: false, error: 'status 需要 id 参数' };
          const job = getJob(id);
          if (!job) return { success: false, error: `任务不存在: ${id}` };
          return { success: true, data: jobSnapshot(job, false) };
        }
        case 'list': {
          return { success: true, data: { jobs: listJobs() } };
        }
        case 'stop': {
          if (!id) return { success: false, error: 'stop 需要 id 参数' };
          const job = stopJob(id);
          if (!job) return { success: false, error: `任务不存在: ${id}` };
          return {
            success: true,
            data: { jobId: id, status: job.status, message: `任务已终止: ${job.command}` },
          };
        }
        case 'result': {
          if (!id) return { success: false, error: 'result 需要 id 参数' };
          const job = getJob(id);
          if (!job) return { success: false, error: `任务不存在: ${id}` };
          if (job.status === 'running') {
            return {
              success: true,
              data: { ...jobSnapshot(job, false), note: '任务仍在运行，以下为当前输出' },
            };
          }
          return { success: true, data: jobSnapshot(job, true) };
        }
        default:
          return { success: false, error: `不支持的操作: ${action}` };
      }
    } catch (error) {
      return {
        success: false,
        error: `后台任务操作失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};