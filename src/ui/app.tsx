import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { StatusBar } from "./components/StatusBar.js";
import { OutputArea } from "./components/OutputArea.js";
import { InputBar } from "./components/InputBar.js";
import { Session } from "../core/session.js";
import { loadConfig } from "../config/loader.js";
import { launchStreams } from "../core/stream.js";
import type { ModelState } from "../core/types.js";
import { createDefaultRegistry } from "../tools/registry.js";
import { PermissionManager } from "../tools/permission.js";
import { executeToolCalls } from "../tools/executor.js";
import { WorktreeManager } from "../isolation/worktree.js";

const SYSTEM_PROMPT = "You are a helpful AI coding assistant. Be concise.";

// App-level (module-scoped) tool registry and permission manager.
// Created once and shared across all submissions.
const toolRegistry = createDefaultRegistry();
const permissionManager = new PermissionManager();

export const App: React.FC = () => {
  const config = loadConfig();
  const [session] = useState(() => new Session(config, process.cwd()));
  const [input, setInput] = useState("");
  const [scrollOffset, setScrollOffset] = useState(0);
  const [modelStates, setModelStates] = useState<ModelState[]>(() => session.models);
  const [comparisonModel, setComparisonModel] = useState<string | null>(null);

  // Track whether a shortcut key was just handled so we can clear the input
  // bar in a post-render effect (avoids ink-text-input re-populating it).
  const shortcutHandledRef = useRef(false);

  const targetPrefix =
    session.targetMode.type === "broadcast"
      ? "all"
      : session.targetMode.modelName;

  const activeModelName =
    session.targetMode.type === "broadcast" ? null : session.targetMode.modelName;

  // Clear the input bar whenever a shortcut was handled (runs after the render
  // batch so it overrides any concurrent setInput from ink-text-input).
  useEffect(() => {
    if (shortcutHandledRef.current) {
      shortcutHandledRef.current = false;
      setInput("");
    }
  });

  // Keyboard input: Tab cycling, scrolling, and single-key shortcuts.
  // Single-key shortcuts (d/m/r) only fire when the input bar is empty so they
  // don't interfere with message typing.
  useInput((inputValue, key) => {
    if (key.tab) {
      session.cycleTarget();
      setScrollOffset(0);
      setComparisonModel(null);
      setModelStates([...session.models]);
      return;
    }

    // Escape dismisses comparison mode
    if (key.escape) {
      if (comparisonModel) {
        setComparisonModel(null);
        shortcutHandledRef.current = true;
        return;
      }
    }

    if (key.upArrow) {
      setScrollOffset((o) => Math.max(0, o - 1));
      return;
    }
    if (key.downArrow) {
      setScrollOffset((o) => o + 1);
      return;
    }

    // Single-key shortcuts — only active when the input bar is empty
    // so they don't collide with normal message typing.
    if (input.length > 0) return;
    if (key.ctrl || key.meta) return;

    // 'd' — toggle comparison mode (current model vs next unmuted model)
    if (inputValue === "d") {
      if (comparisonModel) {
        setComparisonModel(null);
      } else {
        const unmuted = session.models.filter((m) => !m.muted);
        const baseName =
          session.targetMode.type === "directed"
            ? session.targetMode.modelName
            : unmuted[0]?.name;
        if (baseName && unmuted.length >= 2) {
          const idx = unmuted.findIndex((m) => m.name === baseName);
          const next = unmuted[(idx + 1) % unmuted.length];
          if (next && next.name !== baseName) {
            setComparisonModel(next.name);
          }
        }
      }
      shortcutHandledRef.current = true;
      return;
    }

    // 'm' — mute/unmute the current directed model
    if (inputValue === "m") {
      if (session.targetMode.type === "directed") {
        session.toggleMute(session.targetMode.modelName);
        setModelStates([...session.models]);
        setComparisonModel(null);
      }
      shortcutHandledRef.current = true;
      return;
    }

    // 'r' — reset the current directed model's context (clear history & buffer)
    if (inputValue === "r") {
      if (session.targetMode.type === "directed") {
        session.resetModel(session.targetMode.modelName);
        setModelStates([...session.models]);
      }
      shortcutHandledRef.current = true;
      return;
    }
  });

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      setInput("");
      setScrollOffset(0);
      setComparisonModel(null);

      // ── Worktree setup ──────────────────────────────────────────
      const taskId = Date.now().toString(36);
      const worktreeManager = new WorktreeManager(process.cwd());
      const modelNames = session.models
        .filter((m) => !m.muted)
        .map((m) => m.name);
      await worktreeManager.setup(taskId, modelNames);

      // Add user message to target models
      const targets = session.addUserMessage(trimmed);
      setModelStates([...session.models]);

      // Mark targets as streaming, clear buffers
      for (const t of targets) {
        t.isStreaming = true;
        t.buffer = "";
      }
      setModelStates([...session.models]);

      // Launch concurrent streams with tool definitions
      const streams = launchStreams(
        session,
        config,
        SYSTEM_PROMPT,
        toolRegistry.getDefinitions(),
      );

      // Process all streams concurrently, with tool-call interception
      await Promise.all(
        streams.map(async ({ modelName, events }) => {
          const m = session.models.find((mm) => mm.name === modelName);
          if (!m) return;

          const worktreePath =
            worktreeManager.getWorktreePath(modelName) ?? process.cwd();
          const toolStream = executeToolCalls(
            events,
            toolRegistry,
            permissionManager,
            worktreePath,
          );

          for await (const event of toolStream) {
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

      // ── Worktree cleanup (keep none by default) ─────────────────
      await worktreeManager.cleanup(taskId);
    },
    [session, config],
  );

  const terminalWidth = process.stdout.columns ?? 80;

  const contextUsages: Record<string, number> = {};
  for (const m of modelStates) {
    contextUsages[m.name] = session.getContextUsage(m.name);
  }

  // ── No models configured: show startup guide ──────────────────
  if (modelStates.length === 0) {
    const example = `[models.claude]
provider = "anthropic"
model = "claude-sonnet-4-6"
api_key = "\${ANTHROPIC_API_KEY}"

[models.gpt]
provider = "openai"
model = "gpt-4o"
api_key = "\${OPENAI_API_KEY}"

[defaults]
active = ["claude", "gpt"]
broadcast = true`;

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Arena — Multi-Model AI Coding Assistant</Text>
        <Text> </Text>
        <Text>No models configured. Create a <Text color="yellow">.arenarc</Text> file in your project root or home directory:</Text>
        <Text> </Text>
        <Text color="gray">{example}</Text>
        <Text> </Text>
        <Text dimColor>Supported providers: anthropic, openai, google, ollama</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%">
      {/* Top: fixed status bar */}
      <StatusBar models={modelStates} activeModelName={activeModelName} contextUsages={contextUsages} />

      {/* Divider */}
      <Text>{"─".repeat(terminalWidth)}</Text>

      {/* Middle: scrollable output */}
      <OutputArea
        models={modelStates}
        targetMode={session.targetMode}
        scrollOffset={scrollOffset}
        comparisonModel={comparisonModel}
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
