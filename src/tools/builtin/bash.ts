import { execSync } from "node:child_process";
import type { ToolHandler } from "../types.js";

export const bashTool: ToolHandler = {
  definition: {
    name: "bash",
    description: "Execute a shell command",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
      },
      required: ["command"],
    },
  },
  async execute(args, worktreePath) {
    const command = args.command as string;
    if (!command || command.trim() === "") {
      return "Error: no command provided";
    }
    const dangerous = ["rm -rf /", "sudo ", "mkfs.", "dd if=", "> /dev/sda"];
    for (const d of dangerous) {
      if (command.includes(d)) return `Blocked: dangerous command pattern "${d}"`;
    }
    try {
      const output = execSync(command, {
        cwd: worktreePath,
        encoding: "utf-8",
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        shell: "bash",
      });
      return output || "(no output)";
    } catch (err: any) {
      const detail = (err.stderr || err.message || "unknown error").trim();
      return `Command failed (exit ${err.status ?? "?"}): ${detail}\n[cmd] ${command}`;
    }
  },
};
