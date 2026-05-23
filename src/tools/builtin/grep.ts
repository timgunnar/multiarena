import { execSync } from "node:child_process";
import * as path from "node:path";
import type { ToolHandler } from "../types.js";

export const grepTool: ToolHandler = {
  definition: {
    name: "grep",
    description: "Search for a pattern in files using regex",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        path: { type: "string", description: "Directory or file to search in" },
        include: { type: "string", description: "File glob pattern to include" },
      },
      required: ["pattern"],
    },
  },
  async execute(args, worktreePath) {
    const cwd = args.path
      ? path.resolve(worktreePath, args.path as string)
      : worktreePath;
    const pattern = args.pattern as string;
    const include = args.include ? `--glob="${args.include}"` : "";
    try {
      const result = execSync(`rg -n --no-heading ${include} "${pattern}" .`, {
        cwd,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
      return result || "No matches found";
    } catch (err: any) {
      if (err.status === 1) return "No matches found";
      throw err;
    }
  },
};
