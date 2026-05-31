/**
 * E2E tests: Broadcast mode — multi-model concurrent submission.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Harness } from "../../src/testing/harness.js";

vi.mock("../../src/provider/provider.js", () => ({
  createProvider: vi.fn(),
}));

import { createProvider } from "../../src/provider/provider.js";

function mockMulti(...responses: string[]) {
  let idx = 0;
  return () => {
    const text = responses[idx] ?? responses[responses.length - 1] ?? "";
    idx++;
    return {
      chat: async function* () {
        yield { type: "text", content: text } as any;
        yield { type: "done", usage: { input: 5, output: text.length } } as any;
      },
      abort: vi.fn(),
    };
  };
}

function mockAll(text: string) {
  return () => ({
    chat: async function* () {
      yield { type: "text", content: text } as any;
      yield { type: "done", usage: { input: 5, output: text.length } } as any;
    },
    abort: vi.fn(),
  });
}

beforeEach(() => {
  (createProvider as any).mockReset();
});

describe("Harness broadcast", () => {
  it("sends prompt to all non-muted models", async () => {
    (createProvider as any).mockImplementation(mockMulti("Hello from A", "Hello from B", "Hello from C"));

    const h = new Harness(["A", "B", "C"]);
    const result = await h.broadcast("Hi");

    expect(result.models).toHaveLength(3);
    expect(result.models[0].buffer).toContain("Hello from A");
    expect(result.models[1].buffer).toContain("Hello from B");
    expect(result.models[2].buffer).toContain("Hello from C");
  });

  it("skips muted models", async () => {
    (createProvider as any).mockImplementation(mockMulti("Hello from A", "Hello from C"));

    const h = new Harness(["A", "B", "C"]);
    h.toggleMute("B");

    const result = await h.broadcast("Hi");
    expect(result.models[0].buffer).toContain("Hello from A");
    expect(result.models[1].buffer).toBe(""); // B muted, no turn
    expect(result.models[2].buffer).toContain("Hello from C");
  });

  it("stores assistant response in messages after stream", async () => {
    (createProvider as any).mockImplementation(mockMulti("Resp A", "Resp B", "Resp C"));

    const h = new Harness(["A", "B", "C"]);
    const result = await h.broadcast("First message");

    for (const m of result.models) {
      const asstMsgs = m.messages.filter((msg) => msg.role === "assistant");
      expect(asstMsgs).toHaveLength(1);
    }
  });

  it("preserves conversation history across multiple turns", async () => {
    (createProvider as any).mockImplementation(mockMulti("First reply", "First reply"));
    const h = new Harness(["A", "B"]);
    await h.broadcast("Turn 1");

    (createProvider as any).mockImplementation(mockMulti("Second reply", "Second reply"));
    const result = await h.broadcast("Turn 2");

    const userMsgs = result.models[0].messages.filter((m) => m.role === "user");
    expect(userMsgs).toHaveLength(2);
    expect(userMsgs[0].content).toBe("Turn 1");
    expect(userMsgs[1].content).toBe("Turn 2");

    const asstMsgs = result.models[0].messages.filter((m) => m.role === "assistant");
    expect(asstMsgs).toHaveLength(2);
    expect(asstMsgs[0].content).toContain("First reply");
    expect(asstMsgs[1].content).toContain("Second reply");
  });

  it("tracks token usage correctly", async () => {
    (createProvider as any).mockImplementation(mockAll("Hi"));

    const h = new Harness(["A", "B", "C"]);
    const result = await h.broadcast("Test");

    for (const m of result.models) {
      expect(m.usage.input).toBeGreaterThan(0);
      expect(m.usage.output).toBeGreaterThan(0);
    }
  });

  it("handles errors gracefully", async () => {
    (createProvider as any).mockImplementation(() => ({
      chat: async function* () {
        yield { type: "error", message: "API failure" } as any;
      },
      abort: vi.fn(),
    }));

    const h = new Harness(["A"]);
    const result = await h.broadcast("Test");
    expect(result.models[0].buffer).toContain("[Error: API failure]");
  });
});
