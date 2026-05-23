import { describe, it, expect, vi } from "vitest";
import { runTurn, type TurnContext } from "../../src/core/turn.js";
import type { StreamEvent } from "../../src/provider/types.js";

function makeCtx(overrides?: Partial<TurnContext>): TurnContext {
  return {
    modelName: "test",
    config: { provider: "openai", model: "gpt-4o", api_key: "sk-test" },
    messages: [],
    systemPrompt: "You are helpful.",
    tools: [],
    registry: {
      getDefinitions: vi.fn().mockReturnValue([]),
      execute: vi.fn().mockResolvedValue("tool result"),
      register: vi.fn(),
    } as any,
    permission: {
      check: vi.fn().mockReturnValue("allow"),
      remember: vi.fn(),
    } as any,
    worktreePath: "/tmp/test",
    ...overrides,
  };
}

// Mock createProvider to return a controlled provider
vi.mock("../../src/provider/provider.js", () => ({
  createProvider: vi.fn(),
}));

import { createProvider } from "../../src/provider/provider.js";

describe("runTurn", () => {
  it("yields text and done for text-only response", async () => {
    const ctx = makeCtx();
    ctx.messages = [{ role: "user", content: "hi" }];

    const mockProvider = {
      chat: async function* () {
        yield { type: "text", content: "Hello!" } as StreamEvent;
        yield { type: "done", usage: { input: 0, output: 0 } } as StreamEvent;
      },
      abort: vi.fn(),
    };
    (createProvider as any).mockReturnValue(mockProvider);

    const events: StreamEvent[] = [];
    for await (const event of runTurn(ctx)) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "text", content: "Hello!" });
    expect(events[1]).toEqual({ type: "done", usage: { input: 0, output: 0 } });

    // Should push assistant message
    expect(ctx.messages).toHaveLength(2);
    expect(ctx.messages[1]).toEqual({ role: "assistant", content: "Hello!" });
  });

  it("executes tool calls and feeds results back", async () => {
    const ctx = makeCtx();
    ctx.messages = [{ role: "user", content: "read test.ts" }];
    ctx.tools = [{ name: "readFile", description: "Read file", parameters: {} }];

    let callCount = 0;
    const mockProvider = {
      chat: async function* () {
        callCount++;
        if (callCount === 1) {
          yield { type: "text", content: "Let me read that." } as StreamEvent;
          yield {
            type: "tool_call",
            id: "tc1",
            name: "readFile",
            args: JSON.stringify({ filePath: "test.ts" }),
          } as StreamEvent;
          yield { type: "done", usage: { input: 0, output: 0 } } as StreamEvent;
        } else {
          yield { type: "text", content: "File contents: hello" } as StreamEvent;
          yield { type: "done", usage: { input: 0, output: 0 } } as StreamEvent;
        }
      },
      abort: vi.fn(),
    };
    (createProvider as any).mockReturnValue(mockProvider);

    const events: StreamEvent[] = [];
    for await (const event of runTurn(ctx)) {
      events.push(event);
    }

    // Should have: text, tool_call, tool label text, tool result text, second text, done
    const textEvents = events.filter((e) => e.type === "text");
    expect(textEvents.length).toBeGreaterThanOrEqual(3);

    // Should have executed tool
    expect(ctx.registry.execute).toHaveBeenCalledWith(
      "readFile",
      { filePath: "test.ts" },
      "/tmp/test",
    );

    // Should have tool messages in history
    const toolMsg = ctx.messages.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.content).toBe("tool result");
  });

  it("yields error event on provider error", async () => {
    const ctx = makeCtx();
    ctx.messages = [{ role: "user", content: "hi" }];

    const mockProvider = {
      chat: async function* () {
        yield { type: "error", message: "API error" } as StreamEvent;
      },
      abort: vi.fn(),
    };
    (createProvider as any).mockReturnValue(mockProvider);

    const events: StreamEvent[] = [];
    for await (const event of runTurn(ctx)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "error", message: "API error" });
  });

  it("yields error on max tool rounds exceeded", async () => {
    const ctx = makeCtx();
    ctx.messages = [{ role: "user", content: "loop" }];
    ctx.tools = [{ name: "readFile", description: "Read file", parameters: {} }];

    const mockProvider = {
      chat: async function* () {
        yield {
          type: "tool_call",
          id: "tc",
          name: "readFile",
          args: JSON.stringify({ filePath: "x" }),
        } as StreamEvent;
        yield { type: "done", usage: { input: 0, output: 0 } } as StreamEvent;
      },
      abort: vi.fn(),
    };
    (createProvider as any).mockReturnValue(mockProvider);

    const events: StreamEvent[] = [];
    for await (const event of runTurn(ctx)) {
      events.push(event);
    }

    const errors = events.filter((e) => e.type === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("max");
  });

  it("handles tool args parse failure", async () => {
    const ctx = makeCtx();
    ctx.messages = [{ role: "user", content: "bad" }];

    const mockProvider = {
      chat: async function* () {
        yield {
          type: "tool_call",
          id: "tc1",
          name: "badTool",
          args: "not-json",
        } as StreamEvent;
        yield { type: "done", usage: { input: 0, output: 0 } } as StreamEvent;
      },
      abort: vi.fn(),
    };
    (createProvider as any).mockReturnValue(mockProvider);

    const events: StreamEvent[] = [];
    for await (const event of runTurn(ctx)) {
      events.push(event);
    }

    const textEvents = events.filter((e) => e.type === "text");
    const parseError = textEvents.find((e) =>
      e.content.includes("Failed to parse"),
    );
    expect(parseError).toBeDefined();
  });

  it("handles permission denied for tool", async () => {
    const ctx = makeCtx();
    ctx.messages = [{ role: "user", content: "delete" }];
    ctx.permission = {
      check: vi.fn().mockReturnValue("deny"),
      remember: vi.fn(),
    } as any;

    const mockProvider = {
      chat: async function* () {
        yield {
          type: "tool_call",
          id: "tc1",
          name: "bash",
          args: JSON.stringify({ command: "rm -rf /" }),
        } as StreamEvent;
        yield { type: "done", usage: { input: 0, output: 0 } } as StreamEvent;
      },
      abort: vi.fn(),
    };
    (createProvider as any).mockReturnValue(mockProvider);

    const events: StreamEvent[] = [];
    for await (const event of runTurn(ctx)) {
      events.push(event);
    }

    const textEvents = events.filter((e) => e.type === "text");
    const denyMsg = textEvents.find((e) =>
      e.content.includes("Permission denied"),
    );
    expect(denyMsg).toBeDefined();
  });
});
