/**
 * Programmatic test harness for multiarena.
 *
 * Wraps the core business logic (Session, runTurn, runDeliberation, persistence)
 * without the Ink UI layer, enabling automated E2E testing of common workflows.
 */
import { Session } from "../core/session.js";
import { runTurn } from "../core/turn.js";
import {
  runDeliberation,
  runMerge,
  autoAssignRounds,
  assignPerspectives,
  type DeliberationProgress,
  type DeliberationRoundConfig,
  type AdversarialLevel,
  type Perspective,
} from "../core/deliberation.js";
import type { Message, StreamEvent } from "../provider/types.js";
import type { ArenaConfig, ModelConfig } from "../config/types.js";
import type { ModelState } from "../core/types.js";
import { ToolRegistry, createDefaultRegistry } from "../tools/registry.js";
import { PermissionManager, type PendingRequest } from "../tools/permission.js";
import type { PermissionDecision } from "../tools/types.js";
import { loadSession, saveSession, type SavedSession } from "../persistence/session.js";

// ── Types ────────────────────────────────────────────────────────

export interface BroadcastResult {
  models: Array<{
    name: string;
    buffer: string;
    messages: Message[];
    usage: { input: number; output: number };
    muted: boolean;
  }>;
}

export interface DeliberateResult {
  document: string;
  rounds: number;
  roundDetails: Array<{
    round: number;
    modelName: string;
    role: string;
    changeCount?: number;
  }>;
  teamMessages: Message[];
}

export interface TeamChatResult {
  buffer: string;
  teamMessages: Message[];
}

export interface HarnessOptions {
  /** Base directory for worktrees (default: os.tmpdir subdirectory). */
  worktreeBase?: string;
  /** If true, skip worktree setup/cleanup (for environments without git). */
  skipWorktrees?: boolean;
}

// ── Default config for tests ─────────────────────────────────────

function makeDefaultModelConfig(overrides?: Partial<ModelConfig>): ModelConfig {
  return {
    provider: "openai" as const,
    model: "gpt-4o",
    api_key: "sk-test",
    ...overrides,
  };
}

function makeDefaultConfig(modelNames: string[]): ArenaConfig {
  const models: Record<string, ModelConfig> = {};
  for (const name of modelNames) {
    models[name] = makeDefaultModelConfig({ model: name });
  }
  return {
    models,
    defaults: { active: modelNames, broadcast: true },
  };
}

// ── Harness ──────────────────────────────────────────────────────

export class Harness {
  session: Session;
  config: ArenaConfig;
  permissionManager: PermissionManager;
  toolRegistry: ToolRegistry;
  private sessionId: string;
  private inputHistory: string[] = [];
  private adversarialOverride: AdversarialLevel | null = null;

  constructor(
    modelNames: string[] = ["model-a", "model-b", "model-c"],
    configOverrides?: Partial<ArenaConfig>,
    options?: HarnessOptions,
  ) {
    this.config = { ...makeDefaultConfig(modelNames), ...configOverrides };
    this.session = new Session(this.config, options?.worktreeBase ?? process.cwd());
    this.sessionId = Date.now().toString(36);
    this.permissionManager = new PermissionManager();
    this.toolRegistry = createDefaultRegistry();
  }

  // ── Public API ────────────────────────────────────────────────

  /** Simulate a broadcast-mode submission. All non-muted models respond concurrently. */
  async broadcast(prompt: string): Promise<BroadcastResult> {
    this.inputHistory.push(prompt);
    const targets = this.session.addUserMessage(prompt);

    for (const t of targets) {
      t.isStreaming = true;
      t.buffer = "";
    }

    await Promise.all(
      targets.map(async (m) => {
        const mc = this.config.models[m.name];
        if (!mc) return;

        const stream = runTurn({
          modelName: m.name,
          config: mc,
          messages: [...m.messages],
          systemPrompt: this.makeSystemPrompt(m.name),
          tools: this.toolRegistry.getDefinitions(),
          registry: this.toolRegistry,
          permission: this.permissionManager,
          worktreePath: process.cwd(),
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
        }

        // Store assistant response in history
        if (m.buffer) {
          m.messages.push({ role: "assistant", content: m.buffer });
        }
      }),
    );

    return {
      models: this.session.models.map((m) => ({
        name: m.name,
        buffer: m.buffer,
        messages: [...m.messages],
        usage: { ...m.usage },
        muted: m.muted,
      })),
    };
  }

  /** Simulate team-mode deliberation. */
  async deliberate(
    prompt: string,
    options?: { adversarial?: AdversarialLevel },
  ): Promise<DeliberateResult> {
    const adversarial: AdversarialLevel =
      options?.adversarial ??
      this.adversarialOverride ??
      this.config.deliberation?.adversarial ??
      "off";

    // Strip adversarial flag from prompt if present
    const cleanPrompt = prompt.replace(/\s*(?:--adversarial=\w+|-a\s+\w+)\s*/gi, " ").trim();
    this.inputHistory.push(prompt);

    // Push user message to team context
    this.session.teamMessages.push({ role: "user", content: cleanPrompt });

    // Get active models
    const activeModels = this.session.models
      .filter((m) => !m.muted)
      .map((m) => m.name);

    // Assign perspectives for high mode
    let perspectives: Record<string, string> | undefined;
    if (adversarial === "high") {
      perspectives = assignPerspectives(activeModels) as Record<string, string>;
    }

    // Auto-assign rounds
    const roundConfigs = autoAssignRounds(
      activeModels,
      this.config.models,
      adversarial,
      perspectives as Record<string, Perspective> | undefined,
    );

    // Load constraint if configured
    let constraint: string | undefined;
    if (this.config.deliberation?.constraint_file) {
      try {
        const fs = await import("node:fs/promises");
        constraint = await fs.readFile(this.config.deliberation.constraint_file, "utf-8");
      } catch {
        // optional
      }
    }

    const roundDetails: DeliberateResult["roundDetails"] = [];
    const stream = runDeliberation(
      this.session.teamMessages,
      roundConfigs,
      constraint,
      undefined,
      adversarial,
      perspectives as Record<string, Perspective> | undefined,
    );

    let document = "";
    for await (const event of stream) {
      if (event.type === "round_end") {
        roundDetails.push({
          round: event.round,
          modelName: event.modelName ?? "?",
          role: event.role ?? "?",
          changeCount: event.changeCount,
        });
        document = event.document ?? document;
      } else if (event.type === "done") {
        document = event.document ?? document;
      }
    }

    return {
      document,
      rounds: roundDetails.length,
      roundDetails,
      teamMessages: [...this.session.teamMessages],
    };
  }

  /** Simulate team-directed chat with a specific model. */
  async teamChat(modelName: string, prompt: string): Promise<TeamChatResult> {
    this.inputHistory.push(prompt);
    this.session.teamMessages.push({ role: "user", content: prompt });

    const m = this.session.models.find((mm) => mm.name === modelName);
    const mc = this.config.models[modelName];
    if (!m || !mc) {
      throw new Error(`Model ${modelName} not found`);
    }

    m.isStreaming = true;
    m.buffer = "";

    const stream = runTurn({
      modelName,
      config: mc,
      messages: [...this.session.teamMessages],
      systemPrompt: this.makeSystemPrompt(modelName),
      tools: this.toolRegistry.getDefinitions(),
      registry: this.toolRegistry,
      permission: this.permissionManager,
      worktreePath: process.cwd(),
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
    }

    // Store in teamMessages
    if (m.buffer) {
      this.session.teamMessages.push({ role: "assistant", content: m.buffer });
    }

    return {
      buffer: m.buffer,
      teamMessages: [...this.session.teamMessages],
    };
  }

  /** Simulate /merge — merge all model outputs. */
  async merge(prompt: string, mergerName?: string): Promise<{ document: string }> {
    const merger = mergerName ?? this.session.models[0]?.name;
    if (!merger) throw new Error("No models available for merge");

    const mc = this.config.models[merger];
    if (!mc) throw new Error(`Model ${merger} not configured`);

    const outputs = this.session.models
      .filter((m) => !m.muted && m.buffer)
      .map((m) => ({ modelName: m.name, content: m.buffer }));

    const stream = runMerge(prompt, outputs, mc, merger);
    let document = "";
    for await (const event of stream) {
      if (event.type === "done") {
        document = event.document ?? document;
      } else if (event.type === "text" && event.content) {
        document += event.content;
      }
    }

    return { document };
  }

  /** Set adversarial level for the next deliberate() call. Simulates /team -a high. */
  setAdversarial(level: AdversarialLevel | null): void {
    this.adversarialOverride = level;
  }

  /** Toggle mute on a model. */
  toggleMute(modelName: string): boolean {
    return this.session.toggleMute(modelName);
  }

  /** Get current permission prompt if one is pending. */
  getPermissionPrompt(): PendingRequest | null {
    return this.permissionManager.getActiveRequest();
  }

  /** Respond to a pending permission prompt. */
  respondPermission(decision: PermissionDecision): void {
    this.permissionManager.resolveActiveRequest(decision);
  }

  /** Save session to disk. Returns the raw saved data for verification. */
  save(): SavedSession {
    const lastTarget =
      this.session.targetMode.type === "broadcast"
        ? "broadcast"
        : this.session.targetMode.modelName;

    const saved: SavedSession = {
      id: this.sessionId,
      timestamp: new Date().toISOString(),
      models: this.session.models.map((m) => ({
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
      teamMessages: this.session.teamMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      permissions: this.permissionManager.getEntries(),
      inputHistory: this.inputHistory.slice(-100),
    };

    saveSession(saved);
    return saved;
  }

  /** Resume a previously saved session. */
  static resume(sessionId: string, configOverrides?: Partial<ArenaConfig>): Harness {
    const saved = loadSession(sessionId);
    if (!saved) throw new Error(`Session ${sessionId} not found`);

    const modelNames = saved.models.map((m) => m.name);
    const h = new Harness(modelNames, configOverrides);

    // Restore saved state
    for (const sm of saved.models) {
      const m = h.session.models.find((mm) => mm.name === sm.name);
      if (m) {
        m.messages = sm.messages as any;
        m.buffer = sm.buffer;
        m.usage = sm.usage ?? { input: 0, output: 0 };
        m.muted = sm.muted ?? false;
      }
    }

    if (saved.teamMessages) {
      h.session.teamMessages.length = 0;
      h.session.teamMessages.push(...(saved.teamMessages as any));
    }

    if (saved.permissions) {
      h.permissionManager.setEntries(saved.permissions);
    }

    if (saved.inputHistory) {
      h.inputHistory = saved.inputHistory;
    }

    if (saved.lastTarget !== "broadcast") {
      h.session.setTarget({ type: "directed", modelName: saved.lastTarget });
    }

    return h;
  }

  /** Clean up. In the full app this would remove worktrees; here we just clear session. */
  dispose(): void {
    this.permissionManager.destroy();
  }

  // ── Helpers ────────────────────────────────────────────────────

  private makeSystemPrompt(modelName: string): string {
    return `You are a helpful AI assistant. You are the "${modelName}" model. Respond directly.`;
  }
}
