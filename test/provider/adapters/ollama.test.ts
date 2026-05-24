import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaProvider } from "../../../src/provider/adapters/ollama.js";
import type { Message } from "../../../src/provider/types.js";

const BASE = "http://localhost:11434";

// Helper: create a ReadableStream from chunks
function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

// Helper: collect all events from an async generator
async function collect(gen: AsyncGenerator): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe("OllamaProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("text streaming", () => {
    it("yields text events from NDJSON stream", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        body: makeStream([
          '{"message":{"content":"Hello"},"done":false}\n',
          '{"message":{"content":" World"},"done":true,"prompt_eval_count":5,"eval_count":2}\n',
        ]),
      } as any);

      const p = new OllamaProvider(BASE);
      const events = await collect(p.chat({ messages: [{ role: "user", content: "hi" }] }));

      const texts = events.filter((e: any) => e.type === "text").map((e: any) => e.content);
      expect(texts).toEqual(["Hello", " World"]);

      const done = events.find((e: any) => e.type === "done");
      expect(done).toBeDefined();
      expect((done as any).usage).toEqual({ input: 5, output: 2 });
    });

    it("skips empty lines in NDJSON", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        body: makeStream([
          '\n{"message":{"content":"A"},"done":false}\n\n',
        ]),
      } as any);

      const p = new OllamaProvider(BASE);
      const events = await collect(p.chat({ messages: [{ role: "user", content: "x" }] }));

      const texts = events.filter((e: any) => e.type === "text");
      expect(texts).toHaveLength(1);
      expect((texts[0] as any).content).toBe("A");
    });
  });

  describe("tool call streaming", () => {
    it("yields tool_call events", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        body: makeStream([
          '{"message":{"tool_calls":[{"function":{"name":"read","arguments":{"path":"f.txt"}}}]},"done":false}\n',
          '{"message":{},"done":true}\n',
        ]),
      } as any);

      const p = new OllamaProvider(BASE);
      const events = await collect(p.chat({ messages: [{ role: "user", content: "read f.txt" }] }));

      const tc = events.find((e: any) => e.type === "tool_call");
      expect(tc).toBeDefined();
      expect((tc as any).name).toBe("read");
      expect((tc as any).args).toContain("f.txt");
    });
  });

  describe("error handling", () => {
    it("yields error on non-200 response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      } as any);

      const p = new OllamaProvider(BASE);
      const events = await collect(p.chat({ messages: [{ role: "user", content: "hi" }] }));

      expect(events).toHaveLength(1);
      expect((events[0] as any).type).toBe("error");
      expect((events[0] as any).message).toContain("Ollama error");
      expect((events[0] as any).message).toContain("500");
    });

    it("yields error when response has no body", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        body: null,
      } as any);

      const p = new OllamaProvider(BASE);
      const events = await collect(p.chat({ messages: [{ role: "user", content: "hi" }] }));

      expect(events).toHaveLength(1);
      expect((events[0] as any).type).toBe("error");
      expect((events[0] as any).message).toContain("No response body");
    });

    it("yields error on network failure", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

      const p = new OllamaProvider(BASE);
      const events = await collect(p.chat({ messages: [{ role: "user", content: "hi" }] }));

      expect(events).toHaveLength(1);
      expect((events[0] as any).type).toBe("error");
      expect((events[0] as any).message).toContain("ECONNREFUSED");
    });

    it("handles non-Error exceptions", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue("raw string error");

      const p = new OllamaProvider(BASE);
      const events = await collect(p.chat({ messages: [{ role: "user", content: "hi" }] }));

      expect(events).toHaveLength(1);
      expect((events[0] as any).type).toBe("error");
      expect((events[0] as any).message).toBe("raw string error");
    });

    it("silently returns on AbortError", async () => {
      const abortErr = new Error("aborted");
      abortErr.name = "AbortError";
      vi.spyOn(globalThis, "fetch").mockRejectedValue(abortErr);

      const p = new OllamaProvider(BASE);
      const events = await collect(p.chat({ messages: [{ role: "user", content: "hi" }] }));

      // AbortError should yield no events (silent return)
      expect(events.filter((e: any) => e.type === "error")).toHaveLength(0);
      // No done event either since fetch threw
      expect(events.filter((e: any) => e.type === "done")).toHaveLength(0);
    });
  });

  describe("abort", () => {
    it("aborts active request", async () => {
      // Use an AbortError rejection — this is what happens when AbortController aborts a fetch
      const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
      vi.spyOn(globalThis, "fetch").mockRejectedValue(abortErr);

      const p = new OllamaProvider(BASE);
      const events = await collect(p.chat({ messages: [{ role: "user", content: "hi" }] }));

      // AbortError → silent return → no error events, no done events
      expect(events.filter((e: any) => e.type === "error")).toHaveLength(0);
      expect(events.filter((e: any) => e.type === "done")).toHaveLength(0);
    });
  });

  describe("message conversion", () => {
    it("converts user messages", async () => {
      let capturedBody: string | null = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init: any) => {
        capturedBody = init?.body;
        return { ok: true, body: makeStream(['{"message":{},"done":true}\n']) } as any;
      });

      const p = new OllamaProvider(BASE);
      await collect(p.chat({ messages: [{ role: "user", content: "hello" }] }));

      const body = JSON.parse(capturedBody!);
      expect(body.messages[0]).toEqual({ role: "user", content: "hello" });
    });

    it("converts assistant messages with tool calls", async () => {
      let capturedBody: string | null = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init: any) => {
        capturedBody = init?.body;
        return { ok: true, body: makeStream(['{"message":{},"done":true}\n']) } as any;
      });

      const p = new OllamaProvider(BASE);
      await collect(p.chat({
        messages: [
          { role: "assistant", content: "I'll read that", tool_calls: [{ id: "c1", name: "read", arguments: '{"path":"f.txt"}' }] },
        ],
      }));

      const body = JSON.parse(capturedBody!);
      expect(body.messages[0].role).toBe("assistant");
      expect(body.messages[0].tool_calls).toBeDefined();
      expect(body.messages[0].tool_calls[0].function.name).toBe("read");
    });

    it("converts tool result messages", async () => {
      let capturedBody: string | null = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init: any) => {
        capturedBody = init?.body;
        return { ok: true, body: makeStream(['{"message":{},"done":true}\n']) } as any;
      });

      const p = new OllamaProvider(BASE);
      await collect(p.chat({
        messages: [{ role: "tool", content: "file content", tool_call_id: "c1" }],
      }));

      const body = JSON.parse(capturedBody!);
      expect(body.messages[0]).toEqual({ role: "tool", content: "file content", tool_call_id: "c1" });
    });

    it("defaults unknown role to user", async () => {
      let capturedBody: string | null = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init: any) => {
        capturedBody = init?.body;
        return { ok: true, body: makeStream(['{"message":{},"done":true}\n']) } as any;
      });

      const p = new OllamaProvider(BASE);
      await collect(p.chat({
        messages: [{ role: "system" as any, content: "sys msg" }],
      }));

      const body = JSON.parse(capturedBody!);
      expect(body.messages[0].role).toBe("user");
    });
  });

  describe("tool definition conversion", () => {
    it("includes tools in request body when provided", async () => {
      let capturedBody: string | null = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init: any) => {
        capturedBody = init?.body;
        return { ok: true, body: makeStream(['{"message":{},"done":true}\n']) } as any;
      });

      const p = new OllamaProvider(BASE);
      await collect(p.chat({
        messages: [{ role: "user", content: "read" }],
        tools: [{ name: "read", description: "Read a file", parameters: { type: "object", properties: {} } }],
      }));

      const body = JSON.parse(capturedBody!);
      expect(body.tools).toBeDefined();
      expect(body.tools[0].type).toBe("function");
      expect(body.tools[0].function.name).toBe("read");
    });

    it("omits tools when empty", async () => {
      let capturedBody: string | null = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init: any) => {
        capturedBody = init?.body;
        return { ok: true, body: makeStream(['{"message":{},"done":true}\n']) } as any;
      });

      const p = new OllamaProvider(BASE);
      await collect(p.chat({
        messages: [{ role: "user", content: "hi" }],
        tools: [],
      }));

      const body = JSON.parse(capturedBody!);
      expect(body.tools).toBeUndefined();
    });
  });
});
