import { describe, it, expect, vi } from "vitest";
import { runTurn, type TurnContext } from "../../src/core/turn.js";
import type { StreamEvent } from "../../src/provider/types.js";
import { PermissionManager } from "../../src/tools/permission.js";

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
      check: vi.fn().mockReturnValue("allow_always"),
      remember: vi.fn(),
      requestUserDecision: vi.fn().mockReturnValue({
        requestId: "perm-mock",
        promise: Promise.resolve("allow" as const),
      }),
      getActiveRequest: vi.fn().mockReturnValue(null),
      resolveActiveRequest: vi.fn(),
      onStateChange: vi.fn(),
      destroy: vi.fn(),
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
      requestUserDecision: vi.fn(),
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

  // ── Interactive permission ──────────────────────────────────

  it("yields permission_required when check returns allow", async () => {
    const ctx = makeCtx();
    ctx.messages = [{ role: "user", content: "run git status" }];
    ctx.tools = [{ name: "bash", description: "Run command", parameters: {} }];

    let resolveFn!: (d: string) => void;
    ctx.permission = {
      check: vi.fn().mockReturnValue("allow"),
      remember: vi.fn(),
      requestUserDecision: vi.fn().mockReturnValue({
        requestId: "perm-1",
        promise: new Promise<string>((r) => { resolveFn = r; }),
      }),
      getActiveRequest: vi.fn().mockReturnValue(null),
      resolveActiveRequest: vi.fn(),
      onStateChange: vi.fn(),
      destroy: vi.fn(),
    } as any;

    const mockProvider = {
      chat: async function* () {
        yield { type: "text", content: "Running..." } as StreamEvent;
        yield {
          type: "tool_call",
          id: "tc1",
          name: "bash",
          args: JSON.stringify({ command: "git status" }),
        } as StreamEvent;
        yield { type: "done", usage: { input: 0, output: 0 } } as StreamEvent;
      },
      abort: vi.fn(),
    };
    (createProvider as any).mockReturnValue(mockProvider);

    const iter = runTurn(ctx);

    // First event: text
    const e1 = await iter.next();
    expect(e1.value).toMatchObject({ type: "text", content: "Running..." });

    // Second event: permission_required
    const e2 = await iter.next();
    expect(e2.value).toMatchObject({
      type: "permission_required",
      toolName: "bash",
      modelName: "test",
    });
    expect((e2.value as any).requestId).toBe("perm-1");

    // Resolve with deny to stop the tool (won't execute)
    resolveFn("deny");
    // consume remainder
    while (true) {
      const n = await iter.next();
      if (n.done) break;
    }
  }, 10000);

  it("executes tool after user allows", async () => {
    const ctx = makeCtx();
    ctx.messages = [{ role: "user", content: "run ls" }];
    ctx.tools = [{ name: "bash", description: "Run command", parameters: {} }];

    const mockProvider = {
      chat: async function* () {
        yield {
          type: "tool_call",
          id: "tc1",
          name: "bash",
          args: JSON.stringify({ command: "ls" }),
        } as StreamEvent;
        yield { type: "done", usage: { input: 0, output: 0 } } as StreamEvent;
      },
      abort: vi.fn(),
    };
    (createProvider as any).mockReturnValue(mockProvider);

    // Use a real PermissionManager with check() spied
    const pm = { ...ctx.permission } as any;
    pm.check = vi.fn().mockReturnValue("allow");
    // requestUserDecision returns a promise we'll resolve
    let resolveFn!: (d: string) => void;
    pm.requestUserDecision = vi.fn().mockReturnValue({
      requestId: "perm-test",
      promise: new Promise<string>((r) => { resolveFn = r; }),
    });
    ctx.permission = pm;

    const iter = runTurn(ctx);

    // Get permission_required
    const e1 = await iter.next();
    expect(e1.value.type).toBe("permission_required");

    // User allows
    resolveFn("allow");

    // Should get tool label and result
    const e2 = await iter.next();
    expect(e2.value.type).toBe("text");
    expect((e2.value as any).content).toContain("ls");

    const e3 = await iter.next();
    expect(e3.value.type).toBe("text");
    expect((e3.value as any).content).toContain("tool result");

    // Tool should have been executed
    expect(ctx.registry.execute).toHaveBeenCalledWith(
      "bash",
      { command: "ls" },
      "/tmp/test",
    );
  });

  it("skips tool execution when user denies", async () => {
    const ctx = makeCtx();
    ctx.messages = [{ role: "user", content: "run rm" }];
    ctx.tools = [{ name: "bash", description: "Run command", parameters: {} }];

    const mockProvider = {
      chat: async function* () {
        yield {
          type: "tool_call",
          id: "tc1",
          name: "bash",
          args: JSON.stringify({ command: "rm file" }),
        } as StreamEvent;
        yield { type: "done", usage: { input: 0, output: 0 } } as StreamEvent;
      },
      abort: vi.fn(),
    };
    (createProvider as any).mockReturnValue(mockProvider);

    const pm = { ...ctx.permission } as any;
    pm.check = vi.fn().mockReturnValue("allow");
    let resolveFn!: (d: string) => void;
    pm.requestUserDecision = vi.fn().mockReturnValue({
      requestId: "perm-deny",
      promise: new Promise<string>((r) => { resolveFn = r; }),
    });
    ctx.permission = pm;

    const iter = runTurn(ctx);

    // Get permission_required
    const e1 = await iter.next();
    expect(e1.value.type).toBe("permission_required");

    // User denies
    resolveFn("deny");

    // Should get deny message
    const e2 = await iter.next();
    expect(e2.value.type).toBe("text");
    expect((e2.value as any).content).toContain("Permission denied");

    // Tool should NOT have been executed
    expect(ctx.registry.execute).not.toHaveBeenCalled();
  });

  it("hardcoded deny never prompts for interaction", async () => {
    const ctx = makeCtx();
    ctx.messages = [{ role: "user", content: "danger" }];
    ctx.tools = [{ name: "bash", description: "Run command", parameters: {} }];

    const mockProvider = {
      chat: async function* () {
        yield {
          type: "tool_call",
          id: "tc1",
          name: "bash",
          args: JSON.stringify({ command: "sudo rm -rf /" }),
        } as StreamEvent;
        yield { type: "done", usage: { input: 0, output: 0 } } as StreamEvent;
      },
      abort: vi.fn(),
    };
    (createProvider as any).mockReturnValue(mockProvider);

    // Use real PermissionManager so hardcoded rules fire
    const realPM = new PermissionManager();
    ctx.permission = realPM as any;

    const events: StreamEvent[] = [];
    for await (const event of runTurn(ctx)) {
      events.push(event);
    }

    // Should get permission denied directly, no permission_required
    const textEvents = events.filter((e) => e.type === "text");
    const denyMsg = textEvents.find((e) =>
      e.content.includes("Permission denied"),
    );
    expect(denyMsg).toBeDefined();

    const permReq = events.find((e) => e.type === "permission_required");
    expect(permReq).toBeUndefined();
  });
});
