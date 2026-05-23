import type { ToolDef } from "../provider/types.js";
import type { ToolHandler } from "./types.js";

export class ToolRegistry {
  private tools = new Map<string, ToolHandler>();

  register(handler: ToolHandler): void {
    this.tools.set(handler.definition.name, handler);
  }

  getDefinitions(): ToolDef[] {
    return Array.from(this.tools.values()).map((h) => h.definition);
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    worktreePath: string,
  ): Promise<string> {
    const handler = this.tools.get(name);
    if (!handler) {
      return `Error: unknown tool "${name}"`;
    }
    try {
      return await handler.execute(args, worktreePath);
    } catch (err: any) {
      return `Error executing ${name}: ${err.message}`;
    }
  }
}

import { readFileTool } from "./builtin/readFile.js";
import { grepTool } from "./builtin/grep.js";
import { bashTool } from "./builtin/bash.js";

export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(grepTool);
  registry.register(bashTool);
  return registry;
}
