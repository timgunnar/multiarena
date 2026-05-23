import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { Provider } from "../provider.js";
import { ChatRequest, StreamEvent, Message, ToolDef } from "../types.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 4096;

export class AnthropicProvider implements Provider {
  private client: Anthropic;
  private activeController: AbortController | null = null;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async *chat(request: ChatRequest): AsyncGenerator<StreamEvent> {
    const abortController = new AbortController();
    this.activeController = abortController;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = this.client.messages.stream(
        {
          model: request.model || DEFAULT_MODEL,
          max_tokens: DEFAULT_MAX_TOKENS,
          system: request.system,
          messages: this.convertMessages(request.messages),
          tools: this.convertTools(request.tools),
        },
        { signal: abortController.signal },
      );

      for await (const event of stream) {
        switch (event.type) {
          case "message_start":
            inputTokens = event.message.usage.input_tokens;
            break;

          case "content_block_delta":
            if (event.delta.type === "text_delta") {
              yield { type: "text", content: event.delta.text };
            }
            break;

          case "content_block_stop": {
            // The type definition for RawContentBlockStopEvent is incomplete in SDK v0.30.0;
            // the actual API response includes a `content_block` field.
            const block = (event as unknown as Record<string, unknown>).content_block as
              | { type: string; id: string; name: string; input: unknown }
              | undefined;
            if (block?.type === "tool_use") {
              yield {
                type: "tool_call",
                id: block.id,
                name: block.name,
                args: JSON.stringify(block.input),
              };
            }
            break;
          }

          case "message_delta":
            outputTokens = event.usage.output_tokens;
            break;

          case "message_stop":
            yield {
              type: "done",
              usage: { input: inputTokens, output: outputTokens },
            };
            break;
        }
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

  private convertMessages(messages: Message[]): MessageParam[] {
    const result: MessageParam[] = [];

    for (const msg of messages) {
      switch (msg.role) {
        case "user":
          result.push({ role: "user", content: msg.content });
          break;

        case "assistant": {
          const content: AnthropicAssistantContent = [];
          if (msg.content) {
            content.push({ type: "text", text: msg.content });
          }
          if (msg.tool_calls) {
            for (const tc of msg.tool_calls) {
              content.push({
                type: "tool_use",
                id: tc.id,
                name: tc.name,
                input: tc.arguments ? safeJsonParse(tc.arguments) : {},
              });
            }
          }
          // If no tool_calls and content is plain text, use the string form directly
          if (content.length === 1 && content[0].type === "text") {
            result.push({ role: "assistant", content: msg.content });
          } else {
            result.push({ role: "assistant", content });
          }
          break;
        }

        case "tool":
          result.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: msg.tool_call_id || "",
                content: msg.content,
              },
            ],
          });
          break;
      }
    }

    return result;
  }

  // ── Tool conversion ─────────────────────────────────────────────────

  private convertTools(tools?: ToolDef[]): Tool[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        ...t.parameters,
        type: "object" as const,
      },
    }));
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

type AnthropicAssistantContent = Array<
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
>;

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
