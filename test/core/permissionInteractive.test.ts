import { describe, it, expect, vi } from "vitest";
import { runTurn, type TurnContext } from "../../src/core/turn.js";
import { PermissionManager } from "../../src/tools/permission.js";
import type { StreamEvent } from "../../src/provider/types.js";

vi.mock("../../src/provider/provider.js", () => ({
  createProvider: vi.fn(),
}));

import { createProvider } from "../../src/provider/provider.js";

function makeCtx(overrides?: Partial<TurnContext>): TurnContext {
  return {
    modelName: "test",
    config: { provider: "openai", model: "gpt-4o", api_key: "sk-test" },
    messages: [{ role: "user", content: "do something" }],
    systemPrompt: "You are helpful.",
    tools: [{ name: "bash", description: "Run command", parameters: {} }],
    registry: {
      getDefinitions: vi.fn().mockReturnValue([]),
      execute: vi.fn().mockResolvedValue("tool output"),
      register: vi.fn(),
    } as any,
    permission: new PermissionManager(),
    worktreePath: "/tmp/test",
    ...overrides,
  };
}

describe("interactive permission flow", () => {
  it("full flow: prompt → allow → execute", async () => {
    const ctx = makeCtx();

    let chatCalls = 0;
    const mockProvider = {
      chat: async function* () {
        chatCalls++;
        if (chatCalls === 1) {
          yield {
            type: "tool_call",
            id: "tc1",
            name: "bash",
            args: JSON.stringify({ command: "echo hello" }),
          } as StreamEvent;
          yield { type: "done", usage: { input: 5, output: 2 } } as StreamEvent;
        } else {
          yield { type: "text", content: "Done." } as StreamEvent;
          yield { type: "done", usage: { input: 1, output: 1 } } as StreamEvent;
        }
      },
      abort: vi.fn(),
    };
    (createProvider as any).mockReturnValue(mockProvider);

    const iter = runTurn(ctx);

    // 1. permission_required (check returns "allow" since no entries)
    const step1 = await iter.next();
    expect(step1.done).toBe(false);
    expect(step1.value.type).toBe("permission_required");
    expect((step1.value as any).toolName).toBe("bash");

    // 2. User resolves with "allow"
    ctx.permission.resolveActiveRequest("allow");

    // 3. Tool label
    const step3 = await iter.next();
    expect(step3.value.type).toBe("text");
    expect((step3.value as any).content).toContain("echo hello");

    // 4. Tool result
    const step4 = await iter.next();
    expect(step4.value.type).toBe("text");
    expect((step4.value as any).content).toContain("tool output");

    // 5. Next round: text (no tool calls)
    const step5 = await iter.next();
    expect(step5.value.type).toBe("text");

    // 6. Done event (yielded by runTurn after final round)
    const step6 = await iter.next();
    expect(step6.value.type).toBe("done");

    // 7. Generator complete
    const step7 = await iter.next();
    expect(step7.done).toBe(true);
  });

  it("prompt → deny → skip tool", async () => {
    const ctx = makeCtx();

    let chatCalls = 0;
    const mockProvider = {
      chat: async function* () {
        chatCalls++;
        if (chatCalls === 1) {
          yield {
            type: "tool_call",
            id: "tc1",
            name: "bash",
            args: JSON.stringify({ command: "rm file" }),
          } as StreamEvent;
          yield { type: "done", usage: { input: 2, output: 1 } } as StreamEvent;
        } else {
          yield { type: "text", content: "OK" } as StreamEvent;
          yield { type: "done", usage: { input: 0, output: 0 } } as StreamEvent;
        }
      },
      abort: vi.fn(),
    };
    (createProvider as any).mockReturnValue(mockProvider);

    const iter = runTurn(ctx);

    // 1. permission_required
    const step1 = await iter.next();
    expect(step1.value.type).toBe("permission_required");

    // 2. User denies
    ctx.permission.resolveActiveRequest("deny");

    // 3. Deny message
    const step3 = await iter.next();
    expect(step3.value.type).toBe("text");
    expect((step3.value as any).content).toContain("Permission denied");

    // Tool was NOT executed
    expect(ctx.registry.execute).not.toHaveBeenCalled();
  });

  it("prompt → allow_always → remembers decision", async () => {
    const ctx = makeCtx();

    let chatCalls = 0;
    const mockProvider = {
      chat: async function* () {
        chatCalls++;
        if (chatCalls === 1) {
          yield {
            type: "tool_call",
            id: "tc1",
            name: "bash",
            args: JSON.stringify({ command: "echo hi" }),
          } as StreamEvent;
          yield { type: "done", usage: { input: 3, output: 1 } } as StreamEvent;
        } else {
          yield { type: "text", content: "Done" } as StreamEvent;
          yield { type: "done", usage: { input: 0, output: 0 } } as StreamEvent;
        }
      },
      abort: vi.fn(),
    };
    (createProvider as any).mockReturnValue(mockProvider);

    const iter = runTurn(ctx);

    // 1. permission_required
    const step1 = await iter.next();
    expect(step1.value.type).toBe("permission_required");

    // 2. User allows always → this calls remember()
    ctx.permission.resolveActiveRequest("allow_always");

    // Consume rest (tool label, tool result, then done)
    while (true) {
      const n = await iter.next();
      if (n.done) break;
    }

    // Tool should have been executed
    expect(ctx.registry.execute).toHaveBeenCalled();

    // Next check should return allow_always (remembered by resolveActiveRequest)
    expect(ctx.permission.check("bash", { command: "echo hi" })).toBe("allow_always");
  });
});
