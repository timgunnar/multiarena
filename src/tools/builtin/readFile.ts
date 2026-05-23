import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolHandler } from "../types.js";

export const readFileTool: ToolHandler = {
  definition: {
    name: "readFile",
    description: "Read the contents of a file",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Path to the file" },
        offset: { type: "number", description: "Line offset to start reading from" },
        limit: { type: "number", description: "Maximum number of lines to read" },
      },
      required: ["filePath"],
    },
  },
  async execute(args, worktreePath) {
    const filePath = path.resolve(worktreePath, args.filePath as string);
    if (!fs.existsSync(filePath)) return `File not found: ${args.filePath}`;
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const offset = (args.offset as number) ?? 0;
    const limit = (args.limit as number) ?? lines.length;
    return lines.slice(offset, offset + limit).join("\n");
  },
};
