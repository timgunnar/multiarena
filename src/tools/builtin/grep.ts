import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolHandler } from "../types.js";

const MAX_RESULTS = 500;

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
    const include = args.include as string | undefined;

    // Check if rg is available; use Node.js fallback if not
    const rgAvailable = (() => {
      try {
        execSync("rg --version", { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    })();

    if (rgAvailable) {
      try {
        return tryRg(cwd, pattern, include);
      } catch (err: any) {
        // rg found no matches (exit code 1)
        if (err.status === 1) return "No matches found";
        throw err;
      }
    }

    return nodeGrep(cwd, pattern, include);
  },
};

function tryRg(cwd: string, pattern: string, include?: string): string {
  const inc = include ? `--glob="${include}"` : "";
  const result = execSync(`rg -n --no-heading ${inc} "${pattern}" .`, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return result || "No matches found";
}

function nodeGrep(cwd: string, pattern: string, include?: string): string {
  let regex: RegExp;
  try {
    // Don't use 'g' flag — it makes .test() stateful across calls
    regex = new RegExp(pattern);
  } catch {
    return `Error: invalid regex pattern "${pattern}"`;
  }

  const includeRegex = include ? globToRegex(include) : null;
  const results: string[] = [];

  walkDir(cwd, cwd, (filePath) => {
    if (includeRegex && !includeRegex.test(filePath)) return;

    let content: string;
    try {
      content = fs.readFileSync(path.join(cwd, filePath), "utf-8");
    } catch {
      return; // skip binary/unreadable
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length && results.length < MAX_RESULTS; i++) {
      if (regex.test(lines[i])) {
        // Normalize path separator for output
        const displayPath = filePath.replace(/\\/g, "/");
        results.push(`${displayPath}:${i + 1}:${lines[i].trimEnd()}`);
      }
    }
  });

  return results.length > 0 ? results.join("\n") : "No matches found";
}

function walkDir(
  base: string,
  dir: string,
  callback: (relativePath: string) => void,
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(base, fullPath);

    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      walkDir(base, fullPath, callback);
    } else if (entry.isFile()) {
      // Skip binary-looking files
      if (entry.name.endsWith(".exe") || entry.name.endsWith(".dll")) continue;
      callback(relPath);
    }
  }
}

function globToRegex(glob: string): RegExp {
  let pattern = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${pattern}$`, "i");
}
