/**
 * Server-side session lifecycle management.
 * Wraps the core Session, Provider, and Tool layers for the WebSocket protocol.
 */
import { Session } from "../core/session.js";
import { runTurn } from "../core/turn.js";
import {
  runDeliberation,
  autoAssignRounds,
  assignPerspectives,
  type DeliberationProgress,
  type AdversarialLevel,
} from "../core/deliberation.js";
import type { Message, StreamEvent } from "../provider/types.js";
import type { ArenaConfig } from "../config/types.js";
import { createDefaultRegistry } from "../tools/registry.js";
import { PermissionManager } from "../tools/permission.js";
import type { PermissionDecision } from "../tools/types.js";
import { saveSession, loadSession, listSessions, type SavedSession } from "../persistence/session.js";

export interface ModelSnapshot {
  name: string;
  provider: string;
  buffer: string;
  isStreaming: boolean;
  usage: { input: number; output: number };
  contextLimit: number;
  muted: boolean;
  messages: Message[];
}

export interface ServerState {
  mode: "broadcast" | "team";
  targetModel: string | null;
  models: ModelSnapshot[];
  deliberation: {
    progress: DeliberationProgress | null;
    document: string;
    thinkText: string;
    rounds: Array<{ round: number; modelName: string; role: string; changeCount?: number }>;
  } | null;
  permissionPrompt: {
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
    modelName: string;
  } | null;
  sessionId: string;
  inputHistory: string[];
}

export class SessionManager {
  session: Session;
  config: ArenaConfig;
  permissionManager = new PermissionManager();
  toolRegistry = createDefaultRegistry();
  private inputHistory: string[] = [];
  private adversarialOverride: AdversarialLevel | null = null;

  constructor(config: ArenaConfig) {
    this.config = config;
    this.session = new Session(config, process.cwd());
  }

  getState(): ServerState {
    const teamMode = false; // tracked at UI layer
    return {
      mode: teamMode ? "team" : "broadcast",
      targetModel: this.session.targetMode.type === "directed" ? this.session.targetMode.modelName : null,
      models: this.session.models.map((m) => ({
        name: m.name,
        provider: m.provider,
        buffer: m.buffer,
        isStreaming: m.isStreaming,
        usage: { ...m.usage },
        contextLimit: m.contextLimit,
        muted: m.muted,
        messages: [...m.messages],
      })),
      deliberation: null,
      permissionPrompt: this.getPermissionState(),
      sessionId: "", // set by caller
      inputHistory: [...this.inputHistory],
    };
  }

  getPermissionState() {
    const active = this.permissionManager.getActiveRequest();
    if (!active) return null;
    return {
      requestId: active.requestId,
      toolName: active.toolName,
      args: active.args,
      modelName: active.modelName,
    };
  }

  /** Broadcast mode submit — returns async generator of ServerMessage */
  async *broadcast(text: string) {
    this.inputHistory.push(text);
    const targets = this.session.addUserMessage(text);

    for (const t of targets) {
      t.isStreaming = true;
      t.buffer = "";
    }

    for (const m of targets) {
      const mc = this.config.models[m.name];
      if (!mc) continue;

      try {
        const stream = runTurn({
          modelName: m.name,
          config: mc,
          messages: [...m.messages],
          systemPrompt: `You are a helpful AI assistant. You are the "${m.name}" model. Respond directly.`,
          tools: this.toolRegistry.getDefinitions(),
          registry: this.toolRegistry,
          permission: this.permissionManager,
          worktreePath: process.cwd(),
        });

        for await (const event of stream) {
          if (event.type === "text") {
            m.buffer += event.content;
            yield { type: "stream" as const, modelName: m.name, text: event.content };
          } else if (event.type === "done") {
            m.usage.input += event.usage.input;
            m.usage.output += event.usage.output;
            m.isStreaming = false;
            yield { type: "stream_end" as const, modelName: m.name, usage: event.usage };
          } else if (event.type === "error") {
            m.buffer += `\n[Error: ${event.message}]`;
            m.isStreaming = false;
            yield { type: "error" as const, message: event.message };
          } else if (event.type === "permission_required") {
            const active = this.permissionManager.getActiveRequest();
            if (active && active.requestId === event.requestId) {
              yield {
                type: "permission_required" as const,
                requestId: event.requestId,
                toolName: event.toolName,
                args: event.args,
                modelName: event.modelName,
              };
            }
          }
        }

        // Store assistant response
        if (m.buffer) {
          m.messages.push({ role: "assistant", content: m.buffer });
        }
      } catch (err: any) {
        console.error(`[broadcast] Error for ${m.name}:`, err.message || err);
        m.buffer += `\n[Error: ${err.message || String(err)}]`;
        m.isStreaming = false;
        yield { type: "error" as const, message: err.message || String(err) };
      } finally {
        m.isStreaming = false;
      }
    }

    yield { type: "done" as const };
  }

  /** Team deliberation submit */
  async *deliberate(text: string, adversarial?: AdversarialLevel) {
    const advLevel = adversarial ?? this.adversarialOverride ?? this.config.deliberation?.adversarial ?? "off";
    this.inputHistory.push(text);

    try {
      const cleanText = text.replace(/\s*(?:--adversarial=\w+|-a\s+\w+)\s*/gi, " ").trim();
      this.session.teamMessages.push({ role: "user", content: cleanText });

      const activeModels = this.session.models.filter((m) => !m.muted).map((m) => m.name);

      let perspectives: Record<string, string> | undefined;
      if (advLevel === "high") {
        perspectives = assignPerspectives(activeModels) as Record<string, string>;
      }

      const roundConfigs = autoAssignRounds(
        activeModels,
        this.config.models,
        advLevel,
        perspectives as any,
      );

      const stream = runDeliberation(
        this.session.teamMessages,
        roundConfigs,
        undefined, // constraint
        undefined, // worktreePath
        advLevel,
        perspectives as any,
      );

      for await (const event of stream) {
        yield { type: "deliberation" as const, event };
      }
    } catch (err: any) {
      console.error("[deliberate] Error:", err.message || err);
      yield { type: "error" as const, message: err.message || String(err) };
    }

    yield { type: "done" as const };
  }

  /** Team directed chat */
  async *teamChat(modelName: string, text: string) {
    this.inputHistory.push(text);
    this.session.teamMessages.push({ role: "user", content: text });

    const m = this.session.models.find((mm) => mm.name === modelName);
    const mc = this.config.models[modelName];
    if (!m || !mc) {
      yield { type: "error" as const, message: `Model ${modelName} not found` };
      return;
    }

    m.isStreaming = true;
    m.buffer = "";

    try {
      const stream = runTurn({
        modelName,
        config: mc,
        messages: [...this.session.teamMessages],
        systemPrompt: `You are a helpful AI assistant. You are the "${modelName}" model.`,
        tools: this.toolRegistry.getDefinitions(),
        registry: this.toolRegistry,
        permission: this.permissionManager,
        worktreePath: process.cwd(),
      });

      for await (const event of stream) {
        if (event.type === "text") {
          m.buffer += event.content;
          yield { type: "stream" as const, modelName, text: event.content };
        } else if (event.type === "done") {
          m.usage.input += event.usage.input;
          m.usage.output += event.usage.output;
          m.isStreaming = false;
        } else if (event.type === "error") {
          m.buffer += `\n[Error: ${event.message}]`;
          m.isStreaming = false;
          yield { type: "error" as const, message: event.message };
        } else if (event.type === "permission_required") {
          const active = this.permissionManager.getActiveRequest();
          if (active && active.requestId === event.requestId) {
            yield { type: "permission_required" as const, requestId: event.requestId, toolName: event.toolName, args: event.args, modelName: event.modelName };
          }
        }
      }

      if (m.buffer) {
        this.session.teamMessages.push({ role: "assistant", content: m.buffer });
      }
    } catch (err: any) {
      console.error(`[teamChat] Error for ${modelName}:`, err.message || err);
      m.buffer += `\n[Error: ${err.message || String(err)}]`;
      m.isStreaming = false;
      yield { type: "error" as const, message: err.message || String(err) };
    } finally {
      m.isStreaming = false;
    }

    yield { type: "done" as const };
  }

  respondPermission(decision: PermissionDecision) {
    this.permissionManager.resolveActiveRequest(decision);
  }

  setAdversarial(level: AdversarialLevel | null) {
    this.adversarialOverride = level;
  }

  toggleMute(modelName: string) {
    return this.session.toggleMute(modelName);
  }

  resetModel(modelName: string) {
    this.session.resetModel(modelName);
  }

  setTarget(mode: "broadcast" | "directed", modelName?: string) {
    if (mode === "broadcast") {
      this.session.setTarget({ type: "broadcast" });
    } else if (modelName) {
      this.session.setTarget({ type: "directed", modelName });
    }
  }

  save(sessionId: string): SavedSession {
    const lastTarget = this.session.targetMode.type === "broadcast" ? "broadcast" : this.session.targetMode.modelName;
    const saved: SavedSession = {
      id: sessionId,
      timestamp: new Date().toISOString(),
      models: this.session.models.map((m) => ({
        name: m.name,
        messages: m.messages.map((msg) => ({ role: msg.role, content: msg.content, tool_call_id: msg.tool_call_id })),
        buffer: m.buffer,
        usage: { ...m.usage },
        muted: m.muted,
      })),
      lastTarget,
      teamMessages: this.session.teamMessages.map((msg) => ({ role: msg.role, content: msg.content })),
      permissions: this.permissionManager.getEntries(),
      inputHistory: this.inputHistory.slice(-100),
    };
    saveSession(saved);
    return saved;
  }

  static resume(sessionId: string, config: ArenaConfig): SessionManager | null {
    const saved = loadSession(sessionId);
    if (!saved) return null;

    const mgr = new SessionManager(config);

    for (const sm of saved.models) {
      const m = mgr.session.models.find((mm) => mm.name === sm.name);
      if (m) {
        m.messages = sm.messages as any;
        m.buffer = sm.buffer;
        m.usage = sm.usage ?? { input: 0, output: 0 };
        m.muted = sm.muted ?? false;
      }
    }

    if (saved.teamMessages) {
      mgr.session.teamMessages.length = 0;
      mgr.session.teamMessages.push(...(saved.teamMessages as any));
    }

    if (saved.permissions) {
      mgr.permissionManager.setEntries(saved.permissions);
    }

    if (saved.inputHistory) {
      mgr.inputHistory = saved.inputHistory;
    }

    if (saved.lastTarget !== "broadcast") {
      mgr.session.setTarget({ type: "directed", modelName: saved.lastTarget });
    }

    return mgr;
  }

  static listSessions() {
    return listSessions();
  }
}
