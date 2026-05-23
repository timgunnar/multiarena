import { Message } from "../provider/types.js";
import { ModelState, TargetMode } from "./types.js";
import { ArenaConfig } from "../config/types.js";

export class Session {
  private state: {
    models: ModelState[];
    targetMode: TargetMode;
    worktreeBase: string;
  };

  constructor(config: ArenaConfig, worktreeBase: string) {
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
        contextLimit: contextLimitForModel(mc?.model ?? ""),
      };
    });

    this.state = {
      models,
      targetMode: { type: "broadcast" },
      worktreeBase,
    };
  }

  get models(): ModelState[] {
    return this.state.models;
  }

  get targetMode(): TargetMode {
    return this.state.targetMode;
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

  /** Cycle Tab through targets: broadcast → model1 → model2 → ... → broadcast */
  cycleTarget(): TargetMode {
    const current = this.state.targetMode;
    if (current.type === "broadcast") {
      const first = this.state.models[0];
      this.state.targetMode = first
        ? { type: "directed", modelName: first.name }
        : current;
    } else {
      const idx = this.state.models.findIndex((m) => m.name === current.modelName);
      const next = this.state.models[idx + 1];
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

  private findModel(name: string): ModelState | undefined {
    return this.state.models.find((m) => m.name === name);
  }
}

function contextLimitForModel(model: string): number {
  if (model.includes("claude")) return 200000;
  if (model.includes("gpt-4")) return 128000;
  if (model.includes("gpt-3.5")) return 16384;
  if (model.includes("gemini")) return 1048576;
  if (model.includes("deepseek")) return 128000;
  return 128000;
}
