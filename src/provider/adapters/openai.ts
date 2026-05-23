import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions/completions";
import { Provider } from "../provider.js";
import { ChatRequest, StreamEvent, Message, ToolDef } from "../types.js";

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_TIMEOUT_MS = 120_000;

interface PendingToolCall {
  id: string;
  name: string;
  args: string;
}

export class OpenAIProvider implements Provider {
  private client: OpenAI;
  private activeController: AbortController | null = null;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL, timeout: DEFAULT_TIMEOUT_MS });
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

      // Track pending tool calls across stream chunks
      const pendingToolCalls = new Map<number, PendingToolCall>();
      let doneYielded = false;

      for await (const chunk of stream) {
        // Token usage chunk (when stream_options.include_usage is true)
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
          continue;
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Accumulate tool call deltas
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

        // Text delta
        if (delta.content) {
          yield { type: "text", content: delta.content };
        }

        // On finish_reason === "tool_calls", emit all pending tool_calls
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

        // handle stop
        if (choice.finish_reason === "stop") {
          yield {
            type: "done",
            usage: { input: inputTokens, output: outputTokens },
          };
          doneYielded = true;
        }
      }

      // Ensure done is always yielded (e.g. when stream ends on usage chunk)
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
