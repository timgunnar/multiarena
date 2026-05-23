import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { StatusBar } from "./components/StatusBar.js";
import { OutputArea } from "./components/OutputArea.js";
import { InputBar } from "./components/InputBar.js";
import { Session } from "../core/session.js";
import { loadConfig } from "../config/loader.js";
import { launchStreams } from "../core/stream.js";
import type { ModelState } from "../core/types.js";

const SYSTEM_PROMPT = "You are a helpful AI coding assistant. Be concise.";

export const App: React.FC = () => {
  const config = loadConfig();
  const [session] = useState(() => new Session(config, process.cwd()));
  const [input, setInput] = useState("");
  const [scrollOffset, setScrollOffset] = useState(0);
  const [modelStates, setModelStates] = useState<ModelState[]>(() => session.models);

  const targetPrefix =
    session.targetMode.type === "broadcast"
      ? "all"
      : session.targetMode.modelName;

  const activeModelName =
    session.targetMode.type === "broadcast" ? null : session.targetMode.modelName;

  // Tab to cycle target
  useInput((inputValue, key) => {
    if (key.tab) {
      session.cycleTarget();
      setScrollOffset(0);
      setModelStates([...session.models]);
      return;
    }

    if (key.upArrow) {
      setScrollOffset((o) => Math.max(0, o - 1));
      return;
    }
    if (key.downArrow) {
      setScrollOffset((o) => o + 1);
      return;
    }
  });

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      setInput("");
      setScrollOffset(0);

      // Add user message to target models
      const targets = session.addUserMessage(trimmed);
      setModelStates([...session.models]);

      // Mark targets as streaming, clear buffers
      for (const t of targets) {
        t.isStreaming = true;
        t.buffer = "";
      }
      setModelStates([...session.models]);

      // Launch concurrent streams
      const streams = launchStreams(session, config, SYSTEM_PROMPT, []);

      // Process all streams concurrently
      await Promise.all(
        streams.map(async ({ modelName, events }) => {
          const m = session.models.find((mm) => mm.name === modelName);
          if (!m) return;

          for await (const event of events) {
            if (event.type === "text") {
              m.buffer += event.content;
            } else if (event.type === "done") {
              m.isStreaming = false;
            } else if (event.type === "error") {
              m.buffer += `\n[Error: ${event.message}]`;
              m.isStreaming = false;
            }
            setModelStates([...session.models]);
          }
        }),
      );

      // Save final responses to history
      for (const { modelName } of streams) {
        const m = session.models.find((mm) => mm.name === modelName);
        if (m && m.buffer) {
          session.addAssistantMessage(modelName, m.buffer);
        }
      }
    },
    [session, config],
  );

  const terminalWidth = process.stdout.columns ?? 80;

  return (
    <Box flexDirection="column" width="100%">
      {/* Top: fixed status bar */}
      <StatusBar models={modelStates} activeModelName={activeModelName} />

      {/* Divider */}
      <Text>{"─".repeat(terminalWidth)}</Text>

      {/* Middle: scrollable output */}
      <OutputArea
        models={modelStates}
        targetMode={session.targetMode}
        scrollOffset={scrollOffset}
      />

      {/* Divider */}
      <Text>{"─".repeat(terminalWidth)}</Text>

      {/* Bottom: fixed input bar */}
      <InputBar
        prefix={targetPrefix}
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
      />
    </Box>
  );
};
