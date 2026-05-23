import { Provider } from "../provider.js";
import { ChatRequest, StreamEvent, Message, ToolDef, ToolCall } from "../types.js";

const DEFAULT_MODEL = "llama3";
const DEFAULT_TIMEOUT_MS = 120_000;

interface OllamaMessage {
  role: string;
  content: string;
  tool_calls?: Array<{
    function: { name: string; arguments: Record<string, unknown> };
  }>;
  tool_call_id?: string;
}

interface OllamaChunk {
  message?: OllamaMessage;
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements Provider {
  private baseURL: string;
  private activeController: AbortController | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  async *chat(request: ChatRequest): AsyncGenerator<StreamEvent> {
    const controller = new AbortController();
    this.activeController = controller;

    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const body: Record<string, unknown> = {
        model: request.model || DEFAULT_MODEL,
        messages: this.convertMessages(request.messages),
        stream: true,
      };

      if (request.tools && request.tools.length > 0) {
        body.tools = this.convertTools(request.tools);
      }

      const response = await fetch(`${this.baseURL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        yield { type: "error", message: `Ollama error (${response.status}): ${text}` };
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        yield { type: "error", message: "No response body from Ollama" };
        return;
      }

      const decoder = new TextDecoder();
      let lineBuffer = "";
      let inputTokens = 0;
      let outputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let chunk: OllamaChunk;
          try {
            chunk = JSON.parse(line);
          } catch {
            continue;
          }

          if (chunk.message) {
            const msg = chunk.message;
            if (msg.content) {
              yield { type: "text", content: msg.content };
            }
            if (msg.tool_calls) {
              for (const tc of msg.tool_calls) {
                const id = `call_${tc.function.name}_${Math.random().toString(36).slice(2, 8)}`;
                yield {
                  type: "tool_call",
                  id,
                  name: tc.function.name,
                  args: JSON.stringify(tc.function.arguments),
                };
              }
            }
          }

          if (chunk.done) {
            inputTokens = chunk.prompt_eval_count ?? 0;
            outputTokens = chunk.eval_count ?? 0;
          }
        }
      }

      yield { type: "done", usage: { input: inputTokens, output: outputTokens } };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      yield {
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timeoutId);
      this.activeController = null;
    }
  }

  abort(): void {
    this.activeController?.abort();
  }

  private convertMessages(messages: Message[]): OllamaMessage[] {
    return messages.map((msg) => {
      switch (msg.role) {
        case "user":
          return { role: "user", content: msg.content };
        case "assistant": {
          const result: OllamaMessage = { role: "assistant", content: msg.content || "" };
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            result.tool_calls = msg.tool_calls.map((tc) => ({
              function: {
                name: tc.name,
                arguments: safeJsonParse(tc.arguments),
              },
            }));
          }
          return result;
        }
        case "tool":
          return {
            role: "tool",
            content: msg.content,
            tool_call_id: msg.tool_call_id || "",
          };
        default:
          return { role: "user", content: msg.content };
      }
    });
  }

  private convertTools(
    tools: ToolDef[],
  ): Array<{ type: string; function: { name: string; description: string; parameters: unknown } }> {
    return tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }
}

function safeJsonParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
