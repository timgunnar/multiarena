import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions/completions";
import { Provider } from "../provider.js";
import { ChatRequest, StreamEvent, Message, ToolDef } from "../types.js";

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_TIMEOUT_MS = 120_000;

// ── Think-tag filter state machine ──────────────────────────────

export interface ThinkFilterState {
  inThink: boolean;
  buf: string;
}

/**
 * Filter think blocks from reasoning model output (DeepSeek-R1, MiniMax).
 * Returns the text that should be yielded to the user, and updates state.
 * Callers yield the returned text and replace their state with the returned state.
 */
export function filterThinkText(
  deltaText: string,
  state: ThinkFilterState,
): { text: string; state: ThinkFilterState } {
  let text = deltaText;
  let { inThink, buf } = state;

  if (inThink) {
    buf += text;
    const endIdx = buf.indexOf("</think>");
    if (endIdx !== -1) {
      inThink = false;
      text = buf.slice(endIdx + "</think>".length);
      buf = "";
      if (!text) return { text: "", state: { inThink, buf } };
    } else {
      return { text: "", state: { inThink: true, buf } };
    }
  }

  // Check for <think> opening tag
  const startIdx = text.indexOf("<think>");
  if (startIdx !== -1) {
    const before = text.slice(0, startIdx);
    const rest = text.slice(startIdx + "<think>".length);
    const endIdx = rest.indexOf("</think>");
    if (endIdx !== -1) {
      // Complete think block in this chunk
      const after = rest.slice(endIdx + "</think>".length);
      text = before + after;
      if (!text) return { text: "", state: { inThink, buf } };
    } else {
      // Think block spans chunks
      if (before) return { text: before, state: { inThink: true, buf: rest } };
      return { text: "", state: { inThink: true, buf: rest } };
    }
  }

  return { text, state: { inThink, buf } };
}

/** Called when the stream ends (finish_reason = stop). Flush any buffered think content. */
export function flushThinkBuf(state: ThinkFilterState): string {
  if (!state.inThink || !state.buf) return "";
  const endIdx = state.buf.indexOf("</think>");
  if (endIdx !== -1) {
    return state.buf.slice(endIdx + "</think>".length);
  }
  return "";
}

interface PendingToolCall {
  id: string;
  name: string;
  args: string;
}

export class OpenAIProvider implements Provider {
  private client: OpenAI;
  private activeController: AbortController | null = null;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL, timeout: DEFAULT_TIMEOUT_MS, maxRetries: 2 });
  }

  async *chat(request: ChatRequest): AsyncGenerator<StreamEvent> {
    const abortController = new AbortController();
    this.activeController = abortController;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = await this.client.chat.completions.create(
        {
          model: request.model || DEFAULT_MODEL,
          messages: this.convertMessages(request.messages, request.system),
          tools: this.convertTools(request.tools),
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: abortController.signal },
      );

      const pendingToolCalls = new Map<number, PendingToolCall>();
      let doneYielded = false;

      // Stateful think-tag filter for reasoning models (e.g. MiniMax, DeepSeek-R1)
      let thinkState: ThinkFilterState = { inThink: false, buf: "" };

      for await (const chunk of stream) {
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
          continue;
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            const existing = pendingToolCalls.get(idx) ?? {
              id: "",
              name: "",
              args: "",
            };

            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name += tc.function.name;
            if (tc.function?.arguments) existing.args += tc.function.arguments;

            pendingToolCalls.set(idx, existing);
          }
        }

        // Text delta with think-tag filtering (for reasoning models)
        if (delta.content) {
          const result = filterThinkText(delta.content, thinkState);
          thinkState = result.state;
          if (result.text) {
            yield { type: "text", content: result.text };
          }
        }

        if (choice.finish_reason === "tool_calls") {
          for (const [, tc] of pendingToolCalls) {
            yield {
              type: "tool_call",
              id: tc.id,
              name: tc.name,
              args: tc.args,
            };
          }
          pendingToolCalls.clear();
          yield {
            type: "done",
            usage: { input: inputTokens, output: outputTokens },
          };
          doneYielded = true;
        }

        if (choice.finish_reason === "stop") {
          // Flush any remaining think buffer
          const flushed = flushThinkBuf(thinkState);
          if (flushed) yield { type: "text", content: flushed };
          thinkState = { inThink: false, buf: "" };
          yield {
            type: "done",
            usage: { input: inputTokens, output: outputTokens },
          };
          doneYielded = true;
        }
      }

      if (!doneYielded) {
        yield {
          type: "done",
          usage: { input: inputTokens, output: outputTokens },
        };
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "APIUserAbortError")
      ) {
        return; // Aborted silently
      }
      yield {
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.activeController = null;
    }
  }

  abort(): void {
    this.activeController?.abort();
  }

  // ── Message conversion ──────────────────────────────────────────────

  private convertMessages(
    messages: Message[],
    system?: string,
  ): ChatCompletionMessageParam[] {
    const result: ChatCompletionMessageParam[] = [];

    // Prepend system message if provided
    if (system) {
      result.push({ role: "system", content: system });
    }

    for (const msg of messages) {
      switch (msg.role) {
        case "user":
          result.push({ role: "user", content: msg.content });
          break;

        case "assistant": {
          const toolCalls = msg.tool_calls?.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          }));

          if (toolCalls && toolCalls.length > 0) {
            result.push({
              role: "assistant",
              content: msg.content || null,
              tool_calls: toolCalls,
            });
          } else {
            result.push({ role: "assistant", content: msg.content });
          }
          break;
        }

        case "tool":
          result.push({
            role: "tool",
            tool_call_id: msg.tool_call_id ?? "",
            content: msg.content,
          });
          break;
      }
    }

    return result;
  }

  // ── Tool conversion ─────────────────────────────────────────────────

  private convertTools(tools?: ToolDef[]): ChatCompletionTool[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }
}
