import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  Content,
  Tool,
  FunctionDeclarationSchema,
  FunctionCallPart,
  FunctionResponsePart,
} from "@google/generative-ai";
import { Provider } from "../provider.js";
import { ChatRequest, StreamEvent, Message, ToolDef, ToolCall } from "../types.js";

const DEFAULT_MODEL = "gemini-2.5-flash";

export class GoogleProvider implements Provider {
  private genAI: GoogleGenerativeAI;
  private aborted = false;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async *chat(request: ChatRequest): AsyncGenerator<StreamEvent> {
    this.aborted = false;

    try {
      const model = this.genAI.getGenerativeModel({
        model: request.model || DEFAULT_MODEL,
        systemInstruction: request.system,
        tools: this.convertTools(request.tools),
      });

      const contents = this.convertMessages(request.messages);
      const result = await model.generateContentStream({ contents });

      let textOffset = 0;
      let fnCallCount = 0;

      for await (const chunk of result.stream) {
        if (this.aborted) return;

        // Yield new text
        const fullText = chunk.text();
        if (fullText && fullText.length > textOffset) {
          const delta = fullText.slice(textOffset);
          textOffset = fullText.length;
          if (delta) {
            yield { type: "text", content: delta };
          }
        }

        // Yield new function calls
        const fnCalls = chunk.functionCalls?.();
        if (fnCalls) {
          for (let i = fnCallCount; i < fnCalls.length; i++) {
            const fc = fnCalls[i];
            yield {
              type: "tool_call",
              id: `${fc.name}_${i}`,
              name: fc.name,
              args: JSON.stringify(fc.args),
            };
          }
          fnCallCount = fnCalls.length;
        }
      }

      // Try to get usage metadata from the completed response
      let usage = { input: 0, output: 0 };
      try {
        const response = await result.response;
        const metadata = response.usageMetadata;
        if (metadata) {
          usage = {
            input: metadata.promptTokenCount ?? 0,
            output: metadata.candidatesTokenCount ?? 0,
          };
        }
      } catch {
        // usageMetadata may not be available in all SDK versions
      }

      yield { type: "done", usage };
    } catch (error) {
      if (this.aborted) return;
      yield {
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  abort(): void {
    this.aborted = true;
  }

  // ── Message conversion ──────────────────────────────────────────────

  private convertMessages(messages: Message[]): Content[] {
    const result: Content[] = [];

    for (const msg of messages) {
      switch (msg.role) {
        case "user":
          result.push({
            role: "user",
            parts: [{ text: msg.content }],
          });
          break;

        case "assistant": {
          const parts: Content["parts"] = [];
          if (msg.content) {
            parts.push({ text: msg.content });
          }
          if (msg.tool_calls) {
            for (const tc of msg.tool_calls) {
              parts.push({
                functionCall: {
                  name: tc.name,
                  args: safeJsonParse(tc.arguments),
                },
              } as FunctionCallPart);
            }
          }
          result.push({ role: "model", parts });
          break;
        }

        case "tool": {
          const toolCall = findToolCall(messages, msg.tool_call_id);
          result.push({
            role: "function",
            parts: [
              {
                functionResponse: {
                  name: toolCall?.name ?? "",
                  response: { content: msg.content },
                },
              } as FunctionResponsePart,
            ],
          });
          break;
        }
      }
    }

    return result;
  }

  // ── Tool conversion ─────────────────────────────────────────────────

  private convertTools(tools?: ToolDef[]): Tool[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters as unknown as FunctionDeclarationSchema,
        })),
      },
    ];
  }
}

function safeJsonParse(raw: string): object {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function findToolCall(messages: Message[], toolCallId?: string): ToolCall | undefined {
  if (!toolCallId) return undefined;
  for (const msg of messages) {
    if (msg.tool_calls) {
      const found = msg.tool_calls.find((tc) => tc.id === toolCallId);
      if (found) return found;
    }
  }
  return undefined;
}
