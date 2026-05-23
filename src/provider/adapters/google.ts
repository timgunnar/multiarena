import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Content, Tool, FunctionDeclarationSchema } from "@google/generative-ai";
import { Provider } from "../provider.js";
import { ChatRequest, StreamEvent, Message, ToolDef } from "../types.js";

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

      for await (const chunk of result.stream) {
        if (this.aborted) return;

        const text = chunk.text();
        if (text) {
          yield { type: "text", content: text };
        }
      }

      yield {
        type: "done",
        usage: { input: 0, output: 0 },
      };
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
      // Skip tool messages — Gemini doesn't support tool_result in the
      // same way; they are typically filtered from history.
      if (msg.role === "tool") continue;

      const content: Content = {
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      };

      result.push(content);
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
          // Google's FunctionDeclarationSchema is stricter than our
          // free-form JSON Schema; cast through unknown.
          parameters: t.parameters as unknown as FunctionDeclarationSchema,
        })),
      },
    ];
  }
}
