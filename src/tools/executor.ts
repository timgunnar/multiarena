import type { StreamEvent } from "../provider/types.js";
import { ToolRegistry } from "./registry.js";
import { PermissionManager } from "./permission.js";

export async function* executeToolCalls(
  stream: AsyncGenerator<StreamEvent>,
  registry: ToolRegistry,
  permission: PermissionManager,
  worktreePath: string,
): AsyncGenerator<StreamEvent> {
  for await (const event of stream) {
    if (event.type === "tool_call") {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(event.args);
      } catch {
        yield { type: "error" as any, message: `Failed to parse tool arguments: ${event.args}` };
        continue;
      }

      const decision = permission.check(event.name, args);

      if (decision === "deny" || decision === "deny_always") {
        yield {
          type: "error" as any,
          message: `Permission denied for tool: ${event.name}`,
        };
        continue;
      }

      const result = await registry.execute(event.name, args, worktreePath);
      // Yield tool result by returning it as text appended to the stream
      yield { type: "text" as any, content: `\n[Tool: ${event.name}]\n${result}\n` };
    } else {
      yield event;
    }
  }
}
