import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import * as path from "node:path";

// __dirname won't be available in this module; use a static path for PKG_VERSION.
// We store the pkg version lazy-loaded so tests don't need a real package.json.
let _pkgVersion: string | null = null;

export function getPkgVersion(): string {
  if (_pkgVersion !== null) return _pkgVersion;
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    _pkgVersion = pkg.version ?? "0.1.0";
  } catch {
    _pkgVersion = "0.1.0";
  }
  return _pkgVersion!;
}

/** Override for tests. */
export function setPkgVersion(v: string): void {
  _pkgVersion = v;
}

export const HELP = `multiarena — Multi-Model AI Coding Assistant

Usage:
  multiarena [options]

Options:
  --new              Start a new session (default)
  --resume <id>      Resume a saved session
  --list             List saved sessions
  --help             Show this help
  --version          Show version`;

export interface ParsedArgs {
  sessionId?: string;
  listOnly: boolean;
  showHelp: boolean;
  showVersion: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { listOnly: false, showHelp: true, showVersion: false };
  }

  if (argv.includes("--version") || argv.includes("-v")) {
    return { listOnly: false, showHelp: false, showVersion: true };
  }

  const resumeIdx = argv.indexOf("--resume");
  if (resumeIdx >= 0 && argv[resumeIdx + 1]) {
    return {
      sessionId: argv[resumeIdx + 1],
      listOnly: false,
      showHelp: false,
      showVersion: false,
    };
  }

  if (argv.includes("--list") || argv.includes("--list-sessions")) {
    return { listOnly: true, showHelp: false, showVersion: false };
  }

  return { listOnly: false, showHelp: false, showVersion: false };
}
