import type { PermissionDecision, PermissionEntry } from "./types.js";

export class PermissionManager {
  private entries: PermissionEntry[] = [];

  check(toolName: string, args: Record<string, unknown>): PermissionDecision {
    // Hard-coded safety rules
    if (toolName === "bash") {
      const cmd = String(args.command ?? "");
      if (cmd.includes("rm -rf /") || cmd.includes("sudo ")) {
        return "deny";
      }
    }

    if (toolName === "readFile" || toolName === "grep") {
      const path = String(args.path ?? args.filePath ?? "");
      if (path.includes(".env") || path.includes(".git-credentials")) {
        return "deny";
      }
    }

    // Session memory
    for (const entry of this.entries) {
      if (entry.toolName === toolName) {
        return entry.decision;
      }
    }

    return "allow";
  }

  remember(toolName: string, args: Record<string, unknown>, decision: "allow_always" | "deny_always"): void {
    this.entries.push({ toolName, args, decision });
  }

  clear(): void {
    this.entries = [];
  }
}
