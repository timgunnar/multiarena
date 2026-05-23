import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolHandler } from "../types.js";

function globToRegex(pattern: string): RegExp {
  let escaped = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*" && pattern[i + 2] === "/") {
      escaped += ".*";
      i += 3;
      continue;
    }
    if (ch === "*" && pattern[i + 1] === "*") {
      escaped += ".*";
      i += 2;
      continue;
    }
    if (ch === "*") {
      escaped += "[^/]*";
      i++;
      continue;
    }
    if (ch === "?") {
      escaped += ".";
      i++;
      continue;
    }
    if (".+^$(){}[]|\\".includes(ch)) {
      escaped += "\\" + ch;
    } else {
      escaped += ch;
    }
    i++;
  }
  return new RegExp(`^${escaped}$`);
}

function collectFiles(dir: string, base: string, results: string[]): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      collectFiles(full, base, results);
    } else if (e.isFile()) {
      results.push(path.relative(base, full));
    }
  }
}

export const globTool: ToolHandler = {
  definition: {
    name: "glob",
    description: "Find files matching a glob pattern",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern (e.g. **/*.ts, src/**/*.tsx)" },
        path: { type: "string", description: "Base directory to search in" },
      },
      required: ["pattern"],
    },
  },
  async execute(args, worktreePath) {
    const pattern = args.pattern as string;
    const base = path.resolve(worktreePath, (args.path as string) ?? ".");
    const regex = globToRegex(pattern);
    const files: string[] = [];
    collectFiles(base, base, files);
    const matches = files
      .filter((f) => regex.test(f))
      .sort()
      .slice(0, 500);
    return matches.length > 0 ? matches.join("\n") : "No files matched";
  },
};
