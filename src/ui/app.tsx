import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { readFile } from "node:fs/promises";
import { OutputArea } from "./components/OutputArea.js";
import { InputBar } from "./components/InputBar.js";
import { Session, type SessionSnapshot, contextLimitForModel } from "../core/session.js";
import { loadConfig, validateConfig } from "../config/loader.js";
import type { ModelConfig } from "../config/types.js";
import type { ModelState } from "../core/types.js";
import { createDefaultRegistry } from "../tools/registry.js";
import { PermissionManager } from "../tools/permission.js";
import { runTurn } from "../core/turn.js";
import { WorktreeManager } from "../isolation/worktree.js";
import { saveSession, loadSession } from "../persistence/session.js";
import {
  runDeliberation,
  runMerge,
  autoAssignRounds,
  type DeliberationProgress,
  type MergeInput,
} from "../core/deliberation.js";

function makeSystemPrompt(modelName: string, provider: string): string {
  return `You are a helpful AI coding assistant. You are the "${modelName}" model (provider: ${provider}). Be concise.`;
}

// App-level (module-scoped) tool registry and permission manager.
// Created once and shared across all submissions.
const toolRegistry = createDefaultRegistry();
const permissionManager = new PermissionManager();

export const App: React.FC<{ sessionId?: string }> = ({ sessionId: initialSessionId }) => {
  const config = loadConfig();
  const configWarnings = validateConfig(config);
  const { exit } = useApp();

  // Generate or reuse session ID
  const [sessionId] = useState(() => initialSessionId ?? Date.now().toString(36));

  // Load saved session or create fresh one
  const [session] = useState(() => {
    if (initialSessionId) {
      const saved = loadSession(initialSessionId);
      if (saved) {
        const snapshot: SessionSnapshot = {
          models: saved.models.map((m) => ({
            name: m.name,
            provider: config.models[m.name]?.provider ?? "unknown",
            messages: m.messages as any,
            muted: false,
            buffer: "",
            usage: { input: 0, output: 0 },
            contextLimit: contextLimitForModel(config.models[m.name]?.provider ?? "", config.models[m.name]?.context_limit),
          })),
          targetMode:
            saved.lastTarget === "broadcast"
              ? { type: "broadcast" }
              : { type: "directed", modelName: saved.lastTarget },
          worktreeBase: process.cwd(),
        };
        return new Session(config, process.cwd(), snapshot);
      }
    }
    return new Session(config, process.cwd());
  });
  const [input, setInput] = useState("");
  const [scrollOffsets, setScrollOffsets] = useState<Record<string, number>>({});
  const [modelStates, setModelStates] = useState<ModelState[]>(() => session.models);
  const [comparisonModel, setComparisonModel] = useState<string | null>(null);
  const comparisonFromBroadcastRef = useRef(false);

  // ── Team / Broadcast mode ──────────────────────────────────────
  const [teamMode, setTeamMode] = useState(false);

  // ── Deliberation state ─────────────────────────────────────────
  const [deliberationProgress, setDeliberationProgress] =
    useState<DeliberationProgress | null>(null);
  const [deliberationDocument, setDeliberationDocument] = useState("");
  const deliberatingRef = useRef(false);
  const deliberationAbortRef = useRef<AbortController | null>(null);

  const activeScrollModel =
    session.targetMode.type === "directed" ? session.targetMode.modelName : null;

  const adjustScroll = useCallback(
    (delta: number) => {
      const modelName = activeScrollModel;
      if (!modelName) return;
      setScrollOffsets((prev) => ({
        ...prev,
        [modelName]: Math.max(0, (prev[modelName] ?? 0) + delta),
      }));
    },
    [activeScrollModel],
  );

  // Input history
  const inputHistoryRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);

  const handleInputChange = useCallback((value: string) => {
    // Reset history navigation when user starts typing
    if (historyIdxRef.current !== -1) {
      historyIdxRef.current = -1;
    }
    setInput(value);
  }, []);

  // Track whether a shortcut key was just handled so we can clear the input
  // bar in a post-render effect (avoids ink-text-input re-populating it).
  const shortcutHandledRef = useRef(false);

  // ── Save helper (used by handleSubmit and quit) ──────────────────
  const saveCurrentSession = useCallback(() => {
    const lastTarget =
      session.targetMode.type === "broadcast"
        ? "broadcast"
        : session.targetMode.modelName;
    saveSession({
      id: sessionId,
      timestamp: new Date().toISOString(),
      models: session.models.map((m) => ({
        name: m.name,
        messages: m.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
          tool_call_id: msg.tool_call_id,
        })),
        buffer: m.buffer,
      })),
      lastTarget,
    });
  }, [session, sessionId]);

  const targetPrefix = teamMode
    ? "team"
    : session.targetMode.type === "broadcast"
      ? "all"
      : session.targetMode.modelName;

  const activeModelName =
    session.targetMode.type === "broadcast" ? null : session.targetMode.modelName;

  // Save session on process exit (Ctrl+C, kill, etc.)
  useEffect(() => {
    const onExit = () => {
      try {
        saveCurrentSession();
      } catch {
        // Best-effort save
      }
    };
    process.on("exit", onExit);
    return () => {
      process.off("exit", onExit);
    };
  }, [saveCurrentSession]);

  // Clean up orphaned worktrees from prior crashes on startup
  useEffect(() => {
    const wm = new WorktreeManager(process.cwd());
    wm.sweepOrphans().catch(() => {});
  }, []);

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
      process.stderr.write(`[DEBUG] Tab pressed: shift=${key.shift} meta=${key.meta} ctrl=${key.ctrl}\n`);
      if (key.shift) {
        // Shift+Tab: toggle team / broadcast mode
        setTeamMode((prev) => !prev);
        setDeliberationProgress(null);
        setDeliberationDocument("");
        setComparisonModel(null);
        setModelStates([...session.models]);
      } else {
        session.cycleTarget();
        setComparisonModel(null);
        comparisonFromBroadcastRef.current = false;
        setModelStates([...session.models]);
      }
      return;
    }

    // Escape dismisses comparison / deliberation / team mode
    if (key.escape) {
      if (teamMode) {
        setTeamMode(false);
        setDeliberationProgress(null);
        setDeliberationDocument("");
        shortcutHandledRef.current = true;
        return;
      }
      if (deliberationProgress) {
        // Abort running deliberation
        if (deliberatingRef.current) {
          deliberationAbortRef.current?.abort();
          deliberatingRef.current = false;
        }
        setDeliberationProgress(null);
        setDeliberationDocument("");
        shortcutHandledRef.current = true;
        return;
      }
      if (comparisonModel) {
        if (comparisonFromBroadcastRef.current) {
          session.setTarget({ type: "broadcast" });
          comparisonFromBroadcastRef.current = false;
        }
        setComparisonModel(null);
        setModelStates([...session.models]);
        shortcutHandledRef.current = true;
        return;
      }
    }

    if (key.upArrow) {
      if (input.length === 0) {
        const history = inputHistoryRef.current;
        if (history.length === 0) return;
        const idx = historyIdxRef.current === -1 ? history.length - 1 : Math.max(0, historyIdxRef.current - 1);
        historyIdxRef.current = idx;
        setInput(history[idx]);
      } else {
        adjustScroll(-1);
      }
      return;
    }
    if (key.downArrow) {
      if (input.length === 0) {
        const history = inputHistoryRef.current;
        if (historyIdxRef.current === -1) return;
        const idx = historyIdxRef.current + 1;
        if (idx >= history.length) {
          historyIdxRef.current = -1;
          setInput("");
        } else {
          historyIdxRef.current = idx;
          setInput(history[idx]);
        }
      } else {
        adjustScroll(1);
      }
      return;
    }

    // Single-key shortcuts — only active when the input bar is empty
    // so they don't collide with normal message typing.
    if (input.length > 0) return;
    if (key.ctrl || key.meta) return;

    // 'd' — toggle comparison mode (current model vs next unmuted model)
    if (inputValue === "d") {
      if (comparisonModel) {
        // Exiting comparison: restore broadcast if we entered from there
        if (comparisonFromBroadcastRef.current) {
          session.setTarget({ type: "broadcast" });
          comparisonFromBroadcastRef.current = false;
        }
        setComparisonModel(null);
      } else {
        const unmuted = session.models.filter((m) => !m.muted);
        if (unmuted.length < 2) {
          shortcutHandledRef.current = true;
          return;
        }
        if (session.targetMode.type === "broadcast") {
          // From broadcast: switch to directed for the first model, compare with second
          session.setTarget({ type: "directed", modelName: unmuted[0].name });
          setComparisonModel(unmuted[1].name);
          comparisonFromBroadcastRef.current = true;
        } else {
          // From directed: toggle comparison on/off for the current model
          const baseName = session.targetMode.modelName;
          const idx = unmuted.findIndex((m) => m.name === baseName);
          const next = unmuted[(idx + 1) % unmuted.length];
          if (next && next.name !== baseName) {
            setComparisonModel(next.name);
          }
        }
      }
      setModelStates([...session.models]);
      shortcutHandledRef.current = true;
      return;
    }

    // 'm' — mute/unmute the current directed model
    if (inputValue === "m") {
      if (session.targetMode.type === "directed") {
        session.toggleMute(session.targetMode.modelName);
        setModelStates([...session.models]);
        setComparisonModel(null);
        comparisonFromBroadcastRef.current = false;
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

    // 'q' — quit (save session and exit)
    if (inputValue === "q") {
      saveCurrentSession();
      exit();
      return;
    }
  });

  // ── Deliberation runner ───────────────────────────────────────
  const runDeliberationPipeline = useCallback(
    async (task: string) => {
      if (deliberatingRef.current) return;
      deliberatingRef.current = true;

      const activeModels = session.models
        .filter((m) => !m.muted)
        .map((m) => m.name);

      if (activeModels.length < 2) {
        // Need at least 2 models for deliberation
        setDeliberationProgress({
          type: "error",
          round: 0,
          totalRounds: 0,
          error: "Deliberation requires at least 2 active (non-muted) models.",
        });
        deliberatingRef.current = false;
        return;
      }

      // Use config deliberation settings or auto-assign
      const delibConfig = config.deliberation;
      let roundConfigs: Array<{
        modelName: string;
        role: "draft" | "revise" | "polish" | "review";
        config: ModelConfig;
      }>;

      if (delibConfig?.rounds && delibConfig.rounds.length > 0) {
        roundConfigs = delibConfig.rounds
          .filter((r) => activeModels.includes(r.model) && config.models[r.model])
          .map((r) => ({
            modelName: r.model,
            role: r.role,
            config: config.models[r.model],
          }));
      } else {
        roundConfigs = autoAssignRounds(activeModels, config.models);
      }

      if (roundConfigs.length < 2) {
        setDeliberationProgress({
          type: "error",
          round: 0,
          totalRounds: 0,
          error: "Not enough configured models for deliberation (need ≥2).",
        });
        deliberatingRef.current = false;
        return;
      }

      // Load constraint document if configured
      let constraint: string | undefined;
      if (delibConfig?.constraint_file) {
        try {
          constraint = await readFile(delibConfig.constraint_file, "utf-8");
        } catch {
          // Constraint file not found — proceed without it
        }
      }

      setDeliberationDocument("");
      let doc = "";

      const stream = runDeliberation(task, roundConfigs, constraint);

      for await (const event of stream) {
        setDeliberationProgress(event);
        if (event.type === "text" && event.content) {
          doc += event.content;
          setDeliberationDocument(doc);
        } else if (event.type === "done") {
          setDeliberationDocument(event.document ?? doc);
        } else if (event.type === "error") {
          deliberatingRef.current = false;
          return;
        }
      }

      // Keep the final document visible; user presses Esc to dismiss
      deliberatingRef.current = false;
    },
    [session.models, config],
  );

  // ── Merge runner ──────────────────────────────────────────────
  const runMergePipeline = useCallback(async () => {
    if (deliberatingRef.current) return;
    deliberatingRef.current = true;

    // Collect the last assistant response from each non-muted model
    const outputs: MergeInput[] = [];
    for (const m of session.models) {
      if (m.muted) continue;
      // Find the last assistant message
      const lastAssistant = [...m.messages].reverse().find((msg) => msg.role === "assistant");
      if (lastAssistant?.content) {
        outputs.push({ modelName: m.name, content: lastAssistant.content });
      }
    }

    if (outputs.length < 2) {
      setDeliberationProgress({
        type: "error",
        round: 0,
        totalRounds: 0,
        error: "需要至少 2 个模型有回复才能合并。",
      });
      deliberatingRef.current = false;
      return;
    }

    // Find the last user message as the task
    const firstModel = session.models.find((m) => !m.muted);
    const lastUserMsg = firstModel?.messages
      ? [...firstModel.messages].reverse().find((m) => m.role === "user")
      : null;
    const task = lastUserMsg?.content ?? "合并以下模型输出";

    // Use the first non-muted model as the merger
    const mergerName = session.models.find((m) => !m.muted)!.name;
    const mergerConfig = config.models[mergerName];
    if (!mergerConfig) {
      setDeliberationProgress({
        type: "error",
        round: 0,
        totalRounds: 0,
        error: `未找到模型 "${mergerName}" 的配置。`,
      });
      deliberatingRef.current = false;
      return;
    }

    setDeliberationDocument("");
    let doc = "";

    const stream = runMerge(task, outputs, mergerConfig, mergerName);

    for await (const event of stream) {
      setDeliberationProgress(event);
      if (event.type === "text" && event.content) {
        doc += event.content;
        setDeliberationDocument(doc);
      } else if (event.type === "done") {
        setDeliberationDocument(event.document ?? doc);
      } else if (event.type === "error") {
        deliberatingRef.current = false;
        return;
      }
    }

    deliberatingRef.current = false;
  }, [session.models, config]);

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      // ── Team mode: submit runs deliberation ───────────────────
      if (teamMode) {
        inputHistoryRef.current.push(trimmed);
        historyIdxRef.current = -1;
        setInput("");
        setDeliberationDocument("");
        runDeliberationPipeline(trimmed);
        return;
      }

      // ── Team mode toggle ────────────────────────────────────
      if (trimmed === "/team" || trimmed === "/t") {
        inputHistoryRef.current.push(trimmed);
        historyIdxRef.current = -1;
        setInput("");
        setTeamMode((prev) => !prev);
        setDeliberationProgress(null);
        setDeliberationDocument("");
        setComparisonModel(null);
        shortcutHandledRef.current = true;
        return;
      }

      // ── Merge command: synthesize last outputs ───────────────
      if (trimmed === "/merge" || trimmed === "/m") {
        inputHistoryRef.current.push(trimmed);
        historyIdxRef.current = -1;
        setInput("");
        setDeliberationDocument("");
        runMergePipeline();
        return;
      }

      // Add to input history
      inputHistoryRef.current.push(trimmed);
      historyIdxRef.current = -1;

      setInput("");
      if (activeScrollModel) {
        setScrollOffsets((prev) => ({ ...prev, [activeScrollModel]: 0 }));
      }
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

      // Launch concurrent turns for all target models
      await Promise.all(
        targets.map(async (m) => {
          const mc = config.models[m.name];
          if (!mc) {
            m.buffer = `[Error: No config for model "${m.name}"]`;
            m.isStreaming = false;
            setModelStates([...session.models]);
            return;
          }

          const worktreePath =
            worktreeManager.getWorktreePath(m.name) ?? process.cwd();

          const stream = runTurn({
            modelName: m.name,
            config: mc,
            messages: m.messages,
            systemPrompt: makeSystemPrompt(m.name, mc.provider),
            tools: toolRegistry.getDefinitions(),
            registry: toolRegistry,
            permission: permissionManager,
            worktreePath,
          });

          for await (const event of stream) {
            if (event.type === "text") {
              m.buffer += event.content;
            } else if (event.type === "done") {
              m.usage.input += event.usage.input;
              m.usage.output += event.usage.output;
              m.isStreaming = false;
            } else if (event.type === "error") {
              m.buffer += `\n[Error: ${event.message}]`;
              m.isStreaming = false;
            }
            setModelStates([...session.models]);
          }
        }),
      );

      // ── Worktree cleanup (keep none by default) ─────────────────
      await worktreeManager.cleanup(taskId);

      // ── Auto-save session ─────────────────────────────────────
      saveCurrentSession();
    },
    [session, config, sessionId, saveCurrentSession, teamMode, runDeliberationPipeline],
  );

  const terminalWidth = process.stdout.columns ?? 80;

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

[models.deepseek]
provider = "deepseek"
model = "deepseek-chat"
api_key = "\${DEEPSEEK_API_KEY}"

[models.minimax]
provider = "minimax"
model = "MiniMax-M2.1"
api_key = "\${MINIMAX_API_KEY}"

[defaults]
active = ["claude", "gpt"]
broadcast = true`;

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">multiarena — Multi-Model AI Coding Assistant</Text>
        <Text> </Text>
        <Text>No models configured. Create a <Text color="yellow">.multiarenarc</Text> file in your project root or home directory:</Text>
        <Text> </Text>
        <Text color="gray">{example}</Text>
        <Text> </Text>
        <Text dimColor>Supported providers: anthropic, openai, google, ollama, deepseek, minimax</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%">
      {/* Config warnings */}
      {configWarnings.length > 0 && (
        <Box flexDirection="column">
          {configWarnings.map((w, i) => (
            <Text key={i} color="yellow">⚠ {w.message}</Text>
          ))}
        </Box>
      )}

      {/* Divider */}
      <Text>{"─".repeat(terminalWidth)}</Text>

      {/* Middle: scrollable output */}
      <OutputArea
        models={modelStates}
        targetMode={session.targetMode}
        scrollOffsets={scrollOffsets}
        comparisonModel={comparisonModel}
        terminalWidth={terminalWidth}
        deliberationProgress={deliberationProgress}
        deliberationDocument={deliberationDocument}
      />

      {/* Divider */}
      <Text>{"─".repeat(terminalWidth)}</Text>

      {/* Bottom: model indicators + shortcuts + input */}
      <InputBar
        models={modelStates}
        activeModelName={activeModelName}
        prefix={targetPrefix}
        value={input}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
      />
    </Box>
  );
};
