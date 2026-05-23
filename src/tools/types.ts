import type { ToolDef } from "../provider/types.js";

export interface ToolHandler {
  definition: ToolDef;
  execute(args: Record<string, unknown>, worktreePath: string): Promise<string>;
}

export type PermissionDecision = "allow" | "deny" | "allow_always" | "deny_always";

export interface PermissionEntry {
  toolName: string;
  args: Record<string, unknown>;
  decision: "allow_always" | "deny_always";
}
