#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "./ui/app.js";
import { loadSession, listSessions } from "./persistence/session.js";

function parseArgs(): { sessionId?: string; listOnly: boolean } {
  const args = process.argv.slice(2);

  const resumeIdx = args.indexOf("--resume");
  if (resumeIdx >= 0 && args[resumeIdx + 1]) {
    return { sessionId: args[resumeIdx + 1], listOnly: false };
  }

  if (args.includes("--list") || args.includes("--list-sessions")) {
    return { listOnly: true };
  }

  // --new is the default (no saved state)
  return { listOnly: false };
}

const { sessionId, listOnly } = parseArgs();

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
