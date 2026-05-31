#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "./ui/app.js";
import { listSessions } from "./persistence/session.js";
import { parseArgs, getPkgVersion, HELP } from "./cli/args.js";

const args = parseArgs(process.argv.slice(2));

// ── Help ──────────────────────────────────────────────────────
if (args.showHelp) {
  console.log(HELP);
  process.exit(0);
}

// ── Version ───────────────────────────────────────────────────
if (args.showVersion) {
  console.log(`multiarena v${getPkgVersion()}`);
  process.exit(0);
}

// ── List sessions ─────────────────────────────────────────────
if (args.listOnly) {
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

// ── Start guide (no args) ─────────────────────────────────────
if (args.showGuide) {
  const { startServer } = await import("./server/index.js");
  console.log(`
  ⚡ multiarena v${getPkgVersion()}

  Starting Web UI…
  Open http://127.0.0.1:${args.webPort} in your browser

  💡 Quick commands:
     multiarena web        Start Web UI
     multiarena terminal   Start terminal mode
     multiarena --help     See all options
`);
  startServer(args.webPort);
  // Server runs indefinitely
} else if (args.webMode) {
  // ── Web mode ──────────────────────────────────────────────
  const { startServer } = await import("./server/index.js");
  process.stdout.write(`\n  multiarena web → http://127.0.0.1:${args.webPort}\n\n`);
  startServer(args.webPort);
} else {
  // ── Terminal mode ─────────────────────────────────────────
  render(React.createElement(App, { sessionId: args.sessionId }));
}
