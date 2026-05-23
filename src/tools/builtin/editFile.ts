import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolHandler } from "../types.js";

export const editFileTool: ToolHandler = {
  definition: {
    name: "editFile",
    description: "Replace a string in a file with a new string",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Path to the file to edit" },
        oldString: { type: "string", description: "Exact text to replace" },
        newString: { type: "string", description: "Replacement text" },
        replaceAll: { type: "boolean", description: "Replace all occurrences (default: false)" },
      },
      required: ["filePath", "oldString", "newString"],
    },
  },
  async execute(args, worktreePath) {
    const filePath = path.resolve(worktreePath, args.filePath as string);
    if (!fs.existsSync(filePath)) return `File not found: ${args.filePath}`;
    const content = fs.readFileSync(filePath, "utf-8");
    const oldStr = args.oldString as string;
    const newStr = args.newString as string;
    const replaceAll = args.replaceAll as boolean;

    if (!content.includes(oldStr)) {
      return `Error: oldString not found in ${args.filePath}`;
    }

    const occurrences = content.split(oldStr).length - 1;
    if (occurrences > 1 && !replaceAll) {
      return `Error: oldString appears ${occurrences} times. Use replaceAll: true or provide more context.`;
    }

    const result = replaceAll
      ? content.replaceAll(oldStr, newStr)
      : content.replace(oldStr, newStr);

    fs.writeFileSync(filePath, result, "utf-8");
    const replaced = replaceAll ? occurrences : 1;
    return `Replaced ${replaced} occurrence(s) in ${args.filePath}`;
  },
};
