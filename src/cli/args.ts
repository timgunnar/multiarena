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
  --web [port]       Start web mode (default port 3000)
  --list             List saved sessions
  --help             Show this help
  --version          Show version`;

export interface ParsedArgs {
  sessionId?: string;
  listOnly: boolean;
  showHelp: boolean;
  showVersion: boolean;
  webMode: boolean;
  webPort: number;
}

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { listOnly: false, showHelp: true, showVersion: false, webMode: false, webPort: 3000 };
  }

  if (argv.includes("--version") || argv.includes("-v")) {
    return { listOnly: false, showHelp: false, showVersion: true, webMode: false, webPort: 3000 };
  }

  const webIdx = argv.indexOf("--web");
  if (webIdx >= 0) {
    const port = parseInt(argv[webIdx + 1] ?? "3000", 10) || 3000;
    return { listOnly: false, showHelp: false, showVersion: false, webMode: true, webPort: port };
  }

  const resumeIdx = argv.indexOf("--resume");
  if (resumeIdx >= 0 && argv[resumeIdx + 1]) {
    return {
      sessionId: argv[resumeIdx + 1],
      listOnly: false,
      showHelp: false,
      showVersion: false,
      webMode: false,
      webPort: 3000,
    };
  }

  if (argv.includes("--list") || argv.includes("--list-sessions")) {
    return { listOnly: true, showHelp: false, showVersion: false, webMode: false, webPort: 3000 };
  }

  return { listOnly: false, showHelp: false, showVersion: false, webMode: false, webPort: 3000 };
}
