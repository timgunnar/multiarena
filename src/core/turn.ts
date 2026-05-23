import { Provider, createProvider } from "../provider/provider.js";
import type { StreamEvent, Message, ToolDef, ToolCall } from "../provider/types.js";
import type { ModelConfig } from "../config/types.js";
import { ToolRegistry } from "../tools/registry.js";
import { PermissionManager } from "../tools/permission.js";

const MAX_TOOL_ROUNDS = 10;

export interface TurnContext {
  modelName: string;
  config: ModelConfig;
  messages: Message[];
  systemPrompt: string;
  tools: ToolDef[];
  registry: ToolRegistry;
  permission: PermissionManager;
  worktreePath: string;
}

export interface TurnResult {
  /** The final assistant text (excluding tool result annotations). */
  text: string;
  /** Whether the turn ended with an error. */
  error: boolean;
}

/**
 * Run a single model turn with tool-call looping.
 *
 * Yields StreamEvents for real-time UI rendering. Tool calls are intercepted,
 * executed, and their results are fed back to the model via ctx.messages so
 * the conversation can continue.
 *
 * After the turn completes, all messages (assistant, tool calls, tool results)
 * have been pushed into ctx.messages — the caller only needs to persist.
 */
export async function* runTurn(ctx: TurnContext): AsyncGenerator<StreamEvent> {
  const allText: string[] = [];
  let provider: Provider | null = null;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      provider = createProvider(ctx.config);

      const request = {
        messages: [...ctx.messages],
        tools: ctx.tools.length > 0 ? ctx.tools : undefined,
        system: ctx.systemPrompt,
        model: ctx.config.model,
      };

      const pendingToolCalls: ToolCall[] = [];
      let hasToolCall = false;
      let roundText = "";

      for await (const event of provider.chat(request)) {
        switch (event.type) {
          case "text":
            roundText += event.content;
            allText.push(event.content);
            yield event;
            break;

          case "tool_call":
            hasToolCall = true;
            pendingToolCalls.push({
              id: event.id,
              name: event.name,
              arguments: event.args,
            });
            break;

          case "error":
            yield event;
            return;

          case "done":
            break;
        }
      }

      // No tool calls — this round is the final answer
      if (!hasToolCall) {
        if (roundText) {
          ctx.messages.push({ role: "assistant", content: roundText });
        }
        yield { type: "done", usage: { input: 0, output: 0 } };
        return;
      }

      // Record assistant message with any text + tool calls
      ctx.messages.push({
        role: "assistant",
        content: roundText,
        tool_calls: pendingToolCalls,
      });

      // Execute tools and feed results back
      for (const tc of pendingToolCalls) {
        const toolLabel = `\n[Tool: ${tc.name}]\n`;
        allText.push(toolLabel);
        yield { type: "text", content: toolLabel } as StreamEvent;

        let args: Record<string, unknown>;
        try {
          args = JSON.parse(tc.arguments);
        } catch {
          const errMsg = `Failed to parse tool arguments: ${tc.arguments}`;
          ctx.messages.push({ role: "tool", content: errMsg, tool_call_id: tc.id });
          allText.push(errMsg + "\n");
          yield { type: "text", content: errMsg + "\n" } as StreamEvent;
          continue;
        }

        const decision = ctx.permission.check(tc.name, args);
        if (decision === "deny" || decision === "deny_always") {
          const errMsg = `Permission denied for tool: ${tc.name}`;
          ctx.messages.push({ role: "tool", content: errMsg, tool_call_id: tc.id });
          allText.push(errMsg + "\n");
          yield { type: "text", content: errMsg + "\n" } as StreamEvent;
          continue;
        }

        let result: string;
        try {
          result = await ctx.registry.execute(tc.name, args, ctx.worktreePath);
        } catch (err: any) {
          result = `Error executing ${tc.name}: ${err.message}`;
        }

        ctx.messages.push({ role: "tool", content: result, tool_call_id: tc.id });
        allText.push(result + "\n");
        yield { type: "text", content: result + "\n" } as StreamEvent;
      }

      // Loop continues — model sees tool results via ctx.messages
    }

    // Exceeded max rounds
    yield {
      type: "error",
      message: `Exceeded maximum tool rounds (${MAX_TOOL_ROUNDS})`,
    };
  } finally {
    provider?.abort();
  }
}
