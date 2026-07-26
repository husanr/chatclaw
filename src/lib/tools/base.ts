// ============================================
// 工具系统基础架构
// ============================================
//
// 🧠 原理讲解：
// 工具系统是 Agent 的"手和脚"，让 LLM 能与外部世界交互。
//
// 设计原则：
// 1. 每个工具都是独立的，有清晰的输入/输出定义
// 2. 工具定义（给 LLM 看）和执行逻辑（实际运行）分离
// 3. 统一的错误处理和结果格式
// 4. 工具可以被动态注册和启用/禁用
//
// ============================================

import { Tool, ToolDefinition, ToolResult } from '@/types';

// 工具注册表 - 管理所有可用工具
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  // 注册工具
  register(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
    console.log(`🔧 工具已注册: ${tool.definition.name}`);
  }

  // 获取工具
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  // 获取所有工具定义（给 LLM 用）
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  // 获取启用的工具定义
  getEnabledDefinitions(enabledTools: string[]): ToolDefinition[] {
    return this.getDefinitions().filter(d => enabledTools.includes(d.name));
  }

  // 执行工具
  async execute(name: string, args: Record<string, any>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `工具不存在: ${name}`,
      };
    }

    try {
      console.log(`⚡ 执行工具: ${name}`, args);
      const result = await tool.execute(args);
      console.log(`✅ 工具执行完成: ${name}`, result);
      return result;
    } catch (error) {
      console.error(`❌ 工具执行失败: ${name}`, error);
      return {
        success: false,
        error: `工具执行失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // 列出所有已注册的工具
  list(): string[] {
    return Array.from(this.tools.keys());
  }
}

// 全局工具注册表实例
export const toolRegistry = new ToolRegistry();
