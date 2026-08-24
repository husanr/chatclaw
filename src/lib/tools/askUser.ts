// ============================================
// ask_user 工具 - 向用户提问澄清
// ============================================
//
// 🧠 设计说明：
// Agent 不是全知全能的。当任务意图不明确、关键参数缺失、或涉及
// 用户偏好/方案选择时，与其瞎猜，不如停下来问用户。
// 执行时返回 needsInput，Agent 检测到后会暂停循环，把问题推给前端
// 展示提问卡片；用户回答后 Agent 恢复，回答作为 tool 结果回填给 LLM。
// 注意：能在合理范围内假设的问题不要用，避免打断用户。
// ============================================

import type { Tool } from '@/types';

export const askUserTool: Tool = {
  definition: {
    name: 'ask_user',
    description:
      '向用户提问以获取澄清信息。当任务意图不明确、关键参数缺失、或需要用户在多个方案间做选择时使用。例如：选择部署方式、确认技术偏好、缺少必要信息。不要问可以通过工具自行获取的信息（如当前时间、文件内容）。',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: '要向用户提出的问题（清晰、具体、给出上下文）',
        },
        options: {
          type: 'string',
          description: '可选的选项列表，用竖线 | 分隔（如：方案A | 方案B | 方案C），用户可以直接点选',
        },
      },
      required: ['question'],
    },
  },
  async execute(args) {
    const question = String(args.question ?? '').trim();
    if (!question) return { success: false, error: 'question 不能为空' };

    const options =
      typeof args.options === 'string' && args.options.trim()
        ? args.options.split('|').map((s: string) => s.trim()).filter(Boolean)
        : undefined;

    return {
      success: false, // 未真正"成功"，需要用户介入
      needsInput: {
        question,
        options,
      },
    };
  },
};