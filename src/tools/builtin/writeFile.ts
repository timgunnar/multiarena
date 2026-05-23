import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolHandler } from "../types.js";

export const writeFileTool: ToolHandler = {
  definition: {
    name: "writeFile",
    description: "Write content to a file (creates or overwrites)",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Path to the file to write" },
        content: { type: "string", description: "Content to write to the file" },
      },
      required: ["filePath", "content"],
    },
  },
  async execute(args, worktreePath) {
    const filePath = path.resolve(worktreePath, args.filePath as string);
    // Prevent writing outside the worktree
    if (!filePath.startsWith(path.resolve(worktreePath))) {
      return "Error: file path escapes the worktree";
    }
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, args.content as string, "utf-8");
    return `Wrote ${fs.statSync(filePath).size} bytes to ${args.filePath}`;
  },
};
