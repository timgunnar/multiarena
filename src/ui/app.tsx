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
  assignPerspectives,
  type DeliberationProgress,
  type MergeInput,
  type AdversarialLevel,
} from "../core/deliberation.js";
import {
  reduceTab,
  reduceShiftTab,
  reduceEscape,
  reduceKeyD,
  reduceSubmitInTeam,
  buildModeState,
  type ModeState,
} from "./modeTransitions.js";

function makeSystemPrompt(modelName: string, provider: string): string {
  return `You are a helpful AI assistant. You can help with coding, writing, analysis, and creative tasks. You are the "${modelName}" model (provider: ${provider}). Respond directly to the user's request — if asked to write content, just write it; only use tools when the task genuinely requires file or command operations.`;
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
            muted: m.muted ?? false,
            buffer: saved.teamMessages?.length ? m.buffer : "", // keep buffer if no team context
            usage: m.usage ?? { input: 0, output: 0 },
            contextLimit: contextLimitForModel(config.models[m.name]?.provider ?? "", config.models[m.name]?.context_limit),
          })),
          targetMode:
            saved.lastTarget === "broadcast"
              ? { type: "broadcast" }
              : { type: "directed", modelName: saved.lastTarget },
          worktreeBase: process.cwd(),
          teamMessages: (saved.teamMessages ?? []) as any,
        };
        // Restore input history
        if (saved.inputHistory?.length) {
          inputHistoryRef.current = saved.inputHistory;
        }
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
  // Lightweight trigger for re-renders when only session.targetMode changes (not model data)
  const [targetVersion, setTargetVersion] = useState(0);

  // ── Team / Broadcast mode ──────────────────────────────────────
  const [teamMode, setTeamMode] = useState(false);

  // ── Deliberation state ─────────────────────────────────────────
  const [deliberationProgress, setDeliberationProgress] =
    useState<DeliberationProgress | null>(null);
  const [deliberationDocument, setDeliberationDocument] = useState("");
  const [deliberationThinkText, setDeliberationThinkText] = useState("");
  const [deliberationRounds, setDeliberationRounds] = useState<Array<{ round: number; modelName: string; role: "draft" | "revise" | "polish" | "review"; changeCount?: number; changeSamples?: string[] }>>([]);
  const [deliberationScrollOffset, setDeliberationScrollOffset] = useState(0);
  const deliberatingRef = useRef(false);
  const deliberationAbortRef = useRef<AbortController | null>(null);

  // ── Adversarial override from CLI ──────────────────────────────
  const adversarialOverrideRef = useRef<AdversarialLevel | null>(null);

  // ── Permission prompt state ────────────────────────────────────
  const [permissionPrompt, setPermissionPrompt] = useState<{
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
    modelName: string;
  } | null>(null);

  // Ref mirroring currentModeState() so the raw stdin Esc listener
  // always reads fresh mode state without re-subscribing on every render.
  const modeStateRef = useRef(currentModeState());
  modeStateRef.current = currentModeState();

  const activeScrollModel =
    session.targetMode.type === "directed" ? session.targetMode.modelName : null;

  const adjustScroll = useCallback(
    (delta: number) => {
      // Team overview with deliberation content → scroll the deliberation view
      if (teamMode && isOverview() && deliberationProgress) {
        setDeliberationScrollOffset((prev) => Math.max(0, prev + delta));
        return;
      }
      const modelName = activeScrollModel;
      if (!modelName) return;
      setScrollOffsets((prev) => ({
        ...prev,
        [modelName]: Math.max(0, (prev[modelName] ?? 0) + delta),
      }));
    },
    [activeScrollModel, teamMode, deliberationProgress],
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
        usage: { ...m.usage },
        muted: m.muted,
      })),
      lastTarget,
      teamMessages: session.teamMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      permissions: permissionManager.getEntries(),
      inputHistory: inputHistoryRef.current.slice(-100),
    });
  }, [session, sessionId]);

  const targetPrefix = teamMode
    ? session.targetMode.type === "broadcast"
      ? "team"
      : `team:${session.targetMode.modelName}`
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

  // Restore saved permissions from session file on resume
  useEffect(() => {
    if (initialSessionId) {
      const saved = loadSession(initialSessionId);
      if (saved?.permissions && saved.permissions.length > 0) {
        permissionManager.setEntries(saved.permissions);
      }
    }
  }, []);

  // Register permission state change callback for queue processing
  useEffect(() => {
    permissionManager.onStateChange(() => {
      const active = permissionManager.getActiveRequest();
      if (active) {
        setPermissionPrompt({
          requestId: active.requestId,
          toolName: active.toolName,
          args: active.args,
          modelName: active.modelName,
        });
      } else {
        setPermissionPrompt(null);
      }
    });
  }, []);

  // Raw stdin listener for Escape key.
  // Ink's useInput key.escape is unreliable on some terminal setups
  // (Windows Terminal + bash in particular). We listen for the raw
  // \x1b byte directly and use a brief timeout to distinguish
  // standalone Esc from escape sequences (arrow keys, etc.).
  useEffect(() => {
    let escTimer: ReturnType<typeof setTimeout> | null = null;

    const handleEsc = () => {
      const state = modeStateRef.current;
      const r = reduceEscape(state, deliberatingRef.current);
      if (r.teamMode !== state.teamMode) setTeamMode(r.teamMode);
      if (r.abortDeliberation) {
        deliberationAbortRef.current?.abort();
        deliberatingRef.current = false;
      }
      if (r.resetDeliberation) {
        setDeliberationProgress(null);
        setDeliberationDocument("");
        setDeliberationRounds([]);
      }
      setComparisonModel(r.comparisonModel);
      comparisonFromBroadcastRef.current = r.comparisonFromBroadcast;
      if (r.goToOverview) {
        session.setTarget({ type: "broadcast" });
        setTargetVersion((v) => v + 1);
      }
      if (r.restoreBroadcast) {
        session.setTarget({ type: "broadcast" });
        comparisonFromBroadcastRef.current = false;
        setModelStates([...session.models]);
      }
      shortcutHandledRef.current = true;
    };

    const onData = (data: Buffer) => {
      // A single 0x1b byte might be standalone Esc or the start of
      // an escape sequence (\x1b[A for Up, etc.). Wait briefly to
      // see if more bytes follow.
      if (data.length === 1 && data[0] === 0x1b) {
        if (escTimer) clearTimeout(escTimer);
        escTimer = setTimeout(() => { handleEsc(); escTimer = null; }, 35);
        return;
      }
      // Any other input — cancel pending Esc (it was part of a sequence)
      if (escTimer) { clearTimeout(escTimer); escTimer = null; }
    };

    process.stdin.on("data", onData);
    return () => {
      process.stdin.removeListener("data", onData);
      if (escTimer) clearTimeout(escTimer);
    };
  }, []);

  // Clear the input bar whenever a shortcut was handled (runs after the render
  // batch so it overrides any concurrent setInput from ink-text-input).
  useEffect(() => {
    if (shortcutHandledRef.current) {
      shortcutHandledRef.current = false;
      setInput("");
    }
  });

  // Build a ModeState snapshot from current React state so the pure
  // decision functions in modeTransitions.ts can drive the keyboard handler.
  function currentModeState(): ModeState {
    return buildModeState({
      teamMode,
      deliberationProgress,
      comparisonModel,
      comparisonFromBroadcast: comparisonFromBroadcastRef.current,
    });
  }

  /** True when the current target is the mode overview (broadcast target). */
  function isOverview(): boolean {
    return session.targetMode.type === "broadcast";
  }

  // Keyboard input: Tab cycling, scrolling, and single-key shortcuts.
  useInput((inputValue, key) => {
    // ── Permission prompt: intercept y/n/a/d keys ────────────────
    // Takes priority over all other shortcuts when a permission prompt is active.
    if (permissionPrompt) {
      if (key.ctrl || key.meta) return;

      if (inputValue === "y" || inputValue === "n" ||
          inputValue === "a" || inputValue === "d") {
        let decision: "allow" | "deny" | "allow_always" | "deny_always";
        switch (inputValue) {
          case "y": decision = "allow"; break;
          case "n": decision = "deny"; break;
          case "a": decision = "allow_always"; break;
          case "d": decision = "deny_always"; break;
          default: return;
        }
        permissionManager.resolveActiveRequest(decision);
        shortcutHandledRef.current = true;
        return;
      }
      // During a permission prompt, suppress all other shortcuts and navigation
      if (key.tab || key.escape) return;
      if (inputValue === "q") {
        permissionManager.destroy();
        saveCurrentSession();
        exit();
        return;
      }
      return;
    }

    // ── Tab (no shift): cycle target within current mode ──────────
    // Tab never changes teamMode. It cycles: overview → model1 → … → overview.
    if (key.tab && !key.shift) {
      const r = reduceTab(currentModeState());
      if (r.clearComparison) {
        setComparisonModel(null);
        comparisonFromBroadcastRef.current = false;
      }
      if (r.cycleTarget) {
        session.cycleTarget();
        setTargetVersion((v) => v + 1);
      }
      return;
    }

    // ── Shift+Tab: toggle between broadcast ↔ team ──────────────
    if (key.tab && key.shift) {
      const r = reduceShiftTab(currentModeState(), isOverview());
      if (!r) return;
      setTeamMode(r.teamMode);
      setComparisonModel(null);
      if (r.goToOverview) {
        session.setTarget({ type: "broadcast" });
        setTargetVersion((v) => v + 1);
      }
      if (r.resetDeliberation) {
        setDeliberationProgress(null);
        setDeliberationDocument("");
        setDeliberationRounds([]);
      }
      return;
    }

    // ── Escape: return to current mode's overview ────────────────
    if (key.escape) {
      const r = reduceEscape(currentModeState(), deliberatingRef.current);
      // teamMode is preserved — Esc never toggles it
      if (r.teamMode !== teamMode) setTeamMode(r.teamMode);
      if (r.abortDeliberation) {
        deliberationAbortRef.current?.abort();
        deliberatingRef.current = false;
      }
      if (r.resetDeliberation) {
        setDeliberationProgress(null);
        setDeliberationDocument("");
        setDeliberationRounds([]);
      }
      setComparisonModel(r.comparisonModel);
      comparisonFromBroadcastRef.current = r.comparisonFromBroadcast;
      if (r.goToOverview) {
        session.setTarget({ type: "broadcast" });
        setTargetVersion((v) => v + 1);
      }
      if (r.restoreBroadcast) {
        // Exiting comparison that entered from broadcast — restore broadcast
        session.setTarget({ type: "broadcast" });
        comparisonFromBroadcastRef.current = false;
        setModelStates([...session.models]);
      }
      shortcutHandledRef.current = true;
      return;
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
      const unmutedNames = session.models.filter((m) => !m.muted).map((m) => m.name);
      const currentTarget =
        session.targetMode.type === "directed" ? session.targetMode.modelName : null;

      const r = reduceKeyD(currentModeState(), unmutedNames, currentTarget);

      // Exiting comparison — restore broadcast if we entered from there
      if (comparisonModel && !r.comparisonModel && comparisonFromBroadcastRef.current) {
        session.setTarget({ type: "broadcast" });
        comparisonFromBroadcastRef.current = false;
        setTargetVersion((v) => v + 1);
      }

      setComparisonModel(r.comparisonModel);
      comparisonFromBroadcastRef.current = r.comparisonFromBroadcast;

      if (r.setDirectedTarget) {
        session.setTarget({ type: "directed", modelName: r.setDirectedTarget });
        setTargetVersion((v) => v + 1);
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
    async () => {
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
      const adversarial: AdversarialLevel =
        adversarialOverrideRef.current
        ?? delibConfig?.adversarial
        ?? "off";

      // Diagnostic: show what adversarial level is active
      if (adversarial !== "off") {
        const advLabel = { low: "低", medium: "中", high: "高" }[adversarial] ?? adversarial;
        setDeliberationDocument(`[对抗强度: ${advLabel}] 正在启动审议…`);
      }

      // Assign perspectives for high adversarial mode
      let perspectives: Record<string, string> | undefined;
      if (adversarial === "high") {
        perspectives = assignPerspectives(activeModels) as Record<string, string>;
      }

      let roundConfigs: Array<{
        modelName: string;
        role: "draft" | "revise" | "polish" | "review";
        config: ModelConfig;
      }>;

      if (delibConfig?.rounds && delibConfig.rounds.length > 0) {
        // Manual rounds: adversarial affects system prompts but not round structure
        roundConfigs = delibConfig.rounds
          .filter((r) => activeModels.includes(r.model) && config.models[r.model])
          .map((r) => ({
            modelName: r.model,
            role: r.role,
            config: config.models[r.model],
          }));
        // Assign perspectives for manual rounds too (high mode)
        if (adversarial === "high" && !perspectives) {
          const manualModels = roundConfigs.map((r) => r.modelName);
          perspectives = assignPerspectives(manualModels) as Record<string, string>;
        }
      } else {
        roundConfigs = autoAssignRounds(activeModels, config.models, adversarial, perspectives as any);
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
      setDeliberationRounds([]);
      setDeliberationScrollOffset(0);
      let doc = "";

      const stream = runDeliberation(
        session.teamMessages,
        roundConfigs,
        constraint,
        undefined, // worktreePath
        adversarial,
        perspectives as any,
      );

      for await (const event of stream) {
        setDeliberationProgress(event);
        if (event.type === "think_start") {
          setDeliberationThinkText("");
          setDeliberationDocument("");
        } else if (event.type === "think_text" && event.content) {
          setDeliberationThinkText((prev) => prev + event.content!);
        } else if (event.type === "think_end") {
          // Think done — keep think text in state for UI reference,
          // main round will populate deliberationDocument next.
        } else if (event.type === "round_start") {
          doc = "";
          setDeliberationDocument("");
          setDeliberationThinkText("");
          setDeliberationRounds((prev) => [
            ...prev,
            { round: event.round, modelName: event.modelName!, role: event.role! },
          ]);
        } else if (event.type === "text" && event.content) {
          doc += event.content;
          setDeliberationDocument(doc);
        } else if (event.type === "round_end") {
          // Update the round entry with change metadata
          setDeliberationRounds((prev) =>
            prev.map((r) =>
              r.round === event.round
                ? {
                    ...r,
                    changeCount: event.changeCount,
                    changeSamples: event.changeSamples,
                  }
                : r,
            ),
          );
        } else if (event.type === "done") {
          setDeliberationDocument(event.document ?? doc);
        } else if (event.type === "error") {
          deliberatingRef.current = false;
          return;
        }
      }

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
    setDeliberationRounds([]);
    setDeliberationScrollOffset(0);
    let doc = "";

    const stream = runMerge(task, outputs, mergerConfig, mergerName);

    for await (const event of stream) {
      setDeliberationProgress(event);
      if (event.type === "round_start") {
        doc = "";
        setDeliberationDocument("");
        setDeliberationRounds([
          { round: 1, modelName: mergerName, role: "draft" as const },
        ]);
      } else if (event.type === "text" && event.content) {
        doc += event.content;
        setDeliberationDocument(doc);
      } else if (event.type === "done") {
        setDeliberationDocument(event.document ?? doc);
      } else if (event.type === "error") {
        deliberatingRef.current = false;
        return;
      }
    }

    // Inject the merged document into each model's history so they
    // can discuss it when the user switches to chat mode.
    if (doc) {
      const contextMsg = `[合并结果]\n\n以下是将各模型输出合并后的最终文档。用户可以就此文档与你讨论。\n\n---\n${doc}\n---`;
      for (const m of session.models) {
        if (!m.muted) {
          m.messages.push({ role: "user", content: contextMsg });
        }
      }
    }

    deliberatingRef.current = false;
  }, [session.models, config]);

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      // ── Team mode: submit runs deliberation or routes to model ──
      if (teamMode) {
        // Parse adversarial override from CLI: /team -a high  or  /team --adversarial=medium
        const advMatch = trimmed.match(/(?:--adversarial=|-a\s+)(off|low|medium|high)/i);
        if (advMatch) {
          adversarialOverrideRef.current = advMatch[1].toLowerCase() as AdversarialLevel;
        } else {
          adversarialOverrideRef.current = null;
        }

        const r = reduceSubmitInTeam(currentModeState(), isOverview());
        if (r.action === "block") return;

        inputHistoryRef.current.push(trimmed);
        historyIdxRef.current = -1;
        setInput("");

        // Strip adversarial flag from message so models don't see it
        const cleanContent = trimmed.replace(/\s*(?:--adversarial=\w+|-a\s+\w+)\s*/gi, " ").trim();
        // All team interactions share session.teamMessages as context.
        session.teamMessages.push({ role: "user", content: cleanContent || trimmed });

        if (r.action === "deliberate") {
          setDeliberationDocument("");
          // Reset target to overview so OutputArea shows deliberation progress
          session.setTarget({ type: "broadcast" });
          setTargetVersion((v) => v + 1);
          runDeliberationPipeline();
          return;
        }

        // r.action === "route_normally" — team directed chat.
        // The user is drilling into a specific model. Use shared team context.
        const targetModel =
          session.targetMode.type === "directed"
            ? session.targetMode.modelName
            : null;
        if (!targetModel) return;

        const tm = session.models.find((m) => m.name === targetModel && !m.muted);
        if (!tm) return;

        const tmc = config.models[targetModel];
        if (!tmc) {
          tm.buffer = `[Error: No config for model "${targetModel}"]`;
          setModelStates([...session.models]);
          return;
        }

        // Worktree setup
        const taskId = Date.now().toString(36);
        const wtManager = new WorktreeManager(process.cwd());
        await wtManager.setup(taskId, [targetModel]);
        const wtPath = wtManager.getWorktreePath(targetModel) ?? process.cwd();

        tm.isStreaming = true;
        tm.buffer = "";
        setModelStates([...session.models]);

        const stream = runTurn({
          modelName: targetModel,
          config: tmc,
          messages: session.teamMessages,
          systemPrompt: makeSystemPrompt(targetModel, tmc.provider),
          tools: toolRegistry.getDefinitions(),
          registry: toolRegistry,
          permission: permissionManager,
          worktreePath: wtPath,
        });

        for await (const event of stream) {
          if (event.type === "text") {
            tm.buffer += event.content;
          } else if (event.type === "done") {
            tm.usage.input += event.usage.input;
            tm.usage.output += event.usage.output;
            tm.isStreaming = false;
          } else if (event.type === "error") {
            tm.buffer += `\n[Error: ${event.message}]`;
            tm.isStreaming = false;
          } else if (event.type === "permission_required") {
            const active = permissionManager.getActiveRequest();
            if (active && active.requestId === event.requestId) {
              setPermissionPrompt({
                requestId: event.requestId,
                toolName: event.toolName,
                args: event.args,
                modelName: event.modelName,
              });
            }
          }
          setModelStates([...session.models]);
        }

        // Store assistant response into message history
        if (tm.buffer) {
          session.teamMessages.push({ role: "assistant", content: tm.buffer } as any);
        }

        await wtManager.cleanup(taskId);
        saveCurrentSession();
        return;
      }

      // ── Team mode toggle ────────────────────────────────────
      if (trimmed.startsWith("/team") || trimmed.startsWith("/t ")) {
        // Parse adversarial from toggle command: /team -a high
        const advMatch = trimmed.match(/(?:--adversarial=|-a\s+)(off|low|medium|high)/i);
        if (advMatch) {
          adversarialOverrideRef.current = advMatch[1].toLowerCase() as AdversarialLevel;
        }
        inputHistoryRef.current.push(trimmed);
        historyIdxRef.current = -1;
        setInput("");
        setTeamMode((prev) => !prev);
        // Entering a mode always lands on its overview
        session.setTarget({ type: "broadcast" });
        setTargetVersion((v) => v + 1);
        setDeliberationProgress(null);
        setDeliberationDocument("");
        setDeliberationRounds([]);
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
            } else if (event.type === "permission_required") {
              const active = permissionManager.getActiveRequest();
              if (active && active.requestId === event.requestId) {
                setPermissionPrompt({
                  requestId: event.requestId,
                  toolName: event.toolName,
                  args: event.args,
                  modelName: event.modelName,
                });
              }
            }
            setModelStates([...session.models]);
          }
        }),
      );

      // Store assistant responses into message history so they persist across turns
      for (const t of targets) {
        if (t.buffer) {
          t.messages.push({ role: "assistant", content: t.buffer } as any);
        }
      }
      setModelStates([...session.models]);

      // ── Worktree cleanup (keep none by default) ─────────────────
      await worktreeManager.cleanup(taskId);

      // ── Auto-save session ─────────────────────────────────────
      saveCurrentSession();
    },
    [session, config, sessionId, saveCurrentSession, teamMode, deliberationProgress, runDeliberationPipeline, setTargetVersion],
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

      {/* Middle: scrollable output */}
      <Box flexGrow={1}>
      <OutputArea
        models={modelStates}
        targetMode={session.targetMode}
        scrollOffsets={scrollOffsets}
        comparisonModel={comparisonModel}
        terminalWidth={terminalWidth}
        deliberationProgress={deliberationProgress}
        deliberationDocument={deliberationDocument}
        deliberationThinkText={deliberationThinkText}
        deliberationRounds={deliberationRounds}
        teamMode={teamMode}
        deliberationScrollOffset={deliberationScrollOffset}
      />
      </Box>

      {/* Bottom: model indicators + shortcuts + input */}
      <InputBar
        models={modelStates}
        activeModelName={activeModelName}
        prefix={targetPrefix}
        value={input}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        permissionPrompt={permissionPrompt}
      />
    </Box>
  );
};
