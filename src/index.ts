#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { App } from "./ui/app.js";
import { listSessions } from "./persistence/session.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PKG_VERSION = (() => {
  try {
    const pkgPath = path.join(__dirname, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
})();

const HELP = `multiarena — Multi-Model AI Coding Assistant

Usage:
  multiarena [options]

Options:
  --new              Start a new session (default)
  --resume <id>      Resume a saved session
  --list             List saved sessions
  --help             Show this help
  --version          Show version`;

function parseArgs(): {
  sessionId?: string;
  listOnly: boolean;
  showHelp: boolean;
  showVersion: boolean;
} {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    return { listOnly: false, showHelp: true, showVersion: false };
  }

  if (args.includes("--version") || args.includes("-v")) {
    return { listOnly: false, showHelp: false, showVersion: true };
  }

  const resumeIdx = args.indexOf("--resume");
  if (resumeIdx >= 0 && args[resumeIdx + 1]) {
    return {
      sessionId: args[resumeIdx + 1],
      listOnly: false,
      showHelp: false,
      showVersion: false,
    };
  }

  if (args.includes("--list") || args.includes("--list-sessions")) {
    return { listOnly: true, showHelp: false, showVersion: false };
  }

  return { listOnly: false, showHelp: false, showVersion: false };
}

const { sessionId, listOnly, showHelp, showVersion } = parseArgs();

if (showHelp) {
  console.log(HELP);
  process.exit(0);
}

if (showVersion) {
  console.log(`multiarena v${PKG_VERSION}`);
  process.exit(0);
}

if (listOnly) {
  const sessions = listSessions();
  if (sessions.length === 0) {
    console.log("No saved sessions.");
  } else {
    console.log("Saved sessions:");
    for (const s of sessions) {
      const models = s.models.map((m) => m.name).join(", ");
      console.log(`  ${s.id}  ${s.timestamp}  [${models}]`);
    }
  }
  process.exit(0);
}

render(React.createElement(App, { sessionId }));
