#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "./ui/app.js";
import { listSessions } from "./persistence/session.js";
import { parseArgs, getPkgVersion, HELP } from "./cli/args.js";

const args = parseArgs(process.argv.slice(2));

if (args.showHelp) {
  console.log(HELP);
  process.exit(0);
}

if (args.showVersion) {
  console.log(`multiarena v${getPkgVersion()}`);
  process.exit(0);
}

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

if (args.webMode) {
  const { startServer } = await import("./server/index.js");
  startServer(args.webPort);
  // Server runs indefinitely
} else {
  render(React.createElement(App, { sessionId: args.sessionId }));
}
