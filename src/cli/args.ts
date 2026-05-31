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
  multiarena                         Show start guide (Web or Terminal)
  multiarena web                     Start web mode (recommended for most users)
  multiarena terminal                Start terminal mode (for developers)
  multiarena --web [port]            Start web mode on custom port
  multiarena --resume, -r <id>       Resume a saved session
  multiarena --list, -l              List saved sessions
  multiarena --help, -h, ?           Show this help
  multiarena --version, -v           Show version`;

export interface ParsedArgs {
  sessionId?: string;
  listOnly: boolean;
  showHelp: boolean;
  showVersion: boolean;
  showGuide: boolean;    // No args — show start guide
  webMode: boolean;
  webPort: number;
  terminalMode: boolean; // Explicit terminal mode
}

const DEFAULTS: ParsedArgs = {
  listOnly: false, showHelp: false, showVersion: false,
  showGuide: false, webMode: false, webPort: 3000, terminalMode: false,
};

export function parseArgs(argv: string[]): ParsedArgs {
  // Positional: "web" → start web mode
  if (argv[0] === "web") {
    return { ...DEFAULTS, webMode: true, webPort: argv[1] ? parseInt(argv[1], 10) || 3000 : 3000 };
  }

  // Positional: "terminal" → start terminal mode
  if (argv[0] === "terminal") {
    return { ...DEFAULTS, terminalMode: true };
  }

  // No args — show interactive start guide
  if (argv.length === 0) {
    return { ...DEFAULTS, showGuide: true };
  }

  // Help: --help, -h, or ? (single question mark)
  if (argv.includes("--help") || argv.includes("-h") || argv.includes("?")) {
    return { ...DEFAULTS, showHelp: true };
  }

  // Version
  if (argv.includes("--version") || argv.includes("-v")) {
    return { ...DEFAULTS, showVersion: true };
  }

  // Web mode
  const webIdx = argv.indexOf("--web");
  if (webIdx >= 0) {
    const port = parseInt(argv[webIdx + 1] ?? "3000", 10) || 3000;
    return { ...DEFAULTS, webMode: true, webPort: port };
  }

  // Resume: --resume or -r
  const resumeIdx = argv.indexOf("--resume");
  const rIdx = argv.indexOf("-r");
  const resumeFlag = resumeIdx >= 0 ? resumeIdx : rIdx;
  if (resumeFlag >= 0 && argv[resumeFlag + 1]) {
    return { ...DEFAULTS, sessionId: argv[resumeFlag + 1] };
  }

  // List: --list, --list-sessions, or -l
  if (argv.includes("--list") || argv.includes("--list-sessions") || argv.includes("-l")) {
    return { ...DEFAULTS, listOnly: true };
  }

  // Unknown args — show help
  return { ...DEFAULTS, showHelp: true };
}
