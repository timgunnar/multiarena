import { Message } from "../provider/types.js";
import { ModelState, TargetMode } from "./types.js";
import { ArenaConfig } from "../config/types.js";

export interface SessionSnapshot {
  models: Array<{
    name: string;
    provider: string;
    messages: Message[];
    muted: boolean;
    buffer: string;
    usage: { input: number; output: number };
    contextLimit: number;
  }>;
  targetMode: TargetMode;
  worktreeBase: string;
  teamMessages?: Message[];
}

export class Session {
  private state: {
    models: ModelState[];
    targetMode: TargetMode;
    worktreeBase: string;
    teamMessages: Message[];
  };

  constructor(config: ArenaConfig, worktreeBase: string, snapshot?: SessionSnapshot) {
    if (snapshot) {
      this.state = {
        models: snapshot.models.map((m) => ({
          ...m,
          isStreaming: false,
          buffer: "",
        })),
        targetMode: snapshot.targetMode,
        worktreeBase: snapshot.worktreeBase,
        teamMessages: snapshot.teamMessages ?? [],
      };
    } else {
      const models: ModelState[] = (config.defaults.active ?? []).map((name) => {
        const mc = config.models[name];
        return {
          name,
          provider: mc?.provider ?? "unknown",
          messages: [],
          muted: false,
          buffer: "",
          isStreaming: false,
          usage: { input: 0, output: 0 },
          contextLimit: contextLimitForModel(mc?.provider ?? "", mc?.context_limit),
        };
      });

      this.state = {
        models,
        targetMode: { type: "broadcast" },
        worktreeBase,
        teamMessages: [],
      };
    }
  }

  get models(): ModelState[] {
    return this.state.models;
  }

  get targetMode(): TargetMode {
    return this.state.targetMode;
  }

  get teamMessages(): Message[] {
    return this.state.teamMessages;
  }

  /** Add a user message to the target model(s). Returns affected models. */
  addUserMessage(content: string): ModelState[] {
    if (this.state.targetMode.type === "broadcast") {
      for (const m of this.state.models) {
        if (!m.muted) {
          m.messages.push({ role: "user", content });
        }
      }
      return this.state.models.filter((m) => !m.muted);
    } else {
      const target = this.findModel(this.state.targetMode.modelName);
      if (target) {
        target.messages.push({ role: "user", content });
      }
      return target ? [target] : [];
    }
  }

  /** Append assistant response to a model's history */
  addAssistantMessage(modelName: string, content: string): void {
    const m = this.findModel(modelName);
    if (m) {
      m.messages.push({ role: "assistant", content });
    }
  }

  /** Append tool result to a model's history */
  addToolResult(modelName: string, toolCallId: string, result: string): void {
    const m = this.findModel(modelName);
    if (m) {
      m.messages.push({ role: "tool", content: result, tool_call_id: toolCallId });
    }
  }

  setTarget(target: TargetMode): void {
    this.state.targetMode = target;
  }

  /** Cycle Tab through unmuted targets: broadcast → model1 → model2 → ... → broadcast */
  cycleTarget(): TargetMode {
    const current = this.state.targetMode;
    const unmuted = this.state.models.filter((m) => !m.muted);
    if (current.type === "broadcast") {
      const first = unmuted[0];
      this.state.targetMode = first
        ? { type: "directed", modelName: first.name }
        : current;
    } else {
      const idx = unmuted.findIndex((m) => m.name === current.modelName);
      const next = unmuted[idx + 1];
      this.state.targetMode = next
        ? { type: "directed", modelName: next.name }
        : { type: "broadcast" };
    }
    return this.state.targetMode;
  }

  jumpToModel(modelName: string): void {
    const exists = this.state.models.some((m) => m.name === modelName);
    if (exists) {
      this.state.targetMode = { type: "directed", modelName };
    }
  }

  jumpToBroadcast(): void {
    this.state.targetMode = { type: "broadcast" };
  }

  toggleMute(modelName: string): boolean {
    const m = this.findModel(modelName);
    if (m) m.muted = !m.muted;
    return m?.muted ?? false;
  }

  resetModel(modelName: string): void {
    const m = this.findModel(modelName);
    if (m) {
      m.messages = [];
      m.buffer = "";
      m.usage = { input: 0, output: 0 };
    }
  }

  getContextUsage(modelName: string): number {
    const m = this.findModel(modelName);
    if (!m || m.contextLimit <= 0) return 0;
    const totalTokens = m.usage.input + m.usage.output;
    return Math.min(1, totalTokens / m.contextLimit);
  }

  toJSON(): SessionSnapshot {
    return {
      models: this.state.models.map((m) => ({
        name: m.name,
        provider: m.provider,
        messages: [...m.messages],
        muted: m.muted,
        buffer: m.buffer,
        usage: { ...m.usage },
        contextLimit: m.contextLimit,
      })),
      targetMode: this.state.targetMode,
      worktreeBase: this.state.worktreeBase,
      teamMessages: [...this.state.teamMessages],
    };
  }

  private findModel(name: string): ModelState | undefined {
    return this.state.models.find((m) => m.name === name);
  }
}

export function contextLimitForModel(provider: string, explicit?: number): number {
  if (explicit && explicit > 0) return explicit;
  // Sensible defaults per provider. Users can override with context_limit in config.
  switch (provider) {
    case "anthropic":  return 200000;
    case "openai":     return 128000;
    case "google":     return 1048576;
    case "deepseek":   return 1048576;
    case "minimax":    return 1048576;
    case "ollama":     return 128000;
    default:           return 128000;
  }
}
