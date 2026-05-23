import { describe, it, expect, vi } from "vitest";
import { OpenAIProvider } from "../../../src/provider/adapters/openai.js";

// Mock openai SDK
vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    })),
  };
});

describe("OpenAIProvider", () => {
  it("constructs with API key", () => {
    const provider = new OpenAIProvider("test-key");
    expect(provider).toBeDefined();
  });

  it("yields text events from stream", async () => {
    const provider = new OpenAIProvider("test-key");

    // Mock the stream to yield chunks
    const mockStream = (async function* () {
      yield {
        id: "chatcmpl-1",
        choices: [
          {
            index: 0,
            delta: { content: "Hello", role: "assistant" },
            finish_reason: null,
          },
        ],
      } as any;
      yield {
        id: "chatcmpl-1",
        choices: [
          {
            index: 0,
            delta: { content: " world", role: "assistant" },
            finish_reason: "stop",
          },
        ],
      } as any;
    })();

    (provider as any).client.chat.completions.create = vi
      .fn()
      .mockResolvedValue(mockStream);

    const events: any[] = [];
    for await (const event of provider.chat({
      messages: [{ role: "user", content: "hi" }],
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: "text", content: "Hello" });
    expect(events[1]).toEqual({ type: "text", content: " world" });
    expect(events[2]).toEqual({
      type: "done",
      usage: { input: 0, output: 0 },
    });
  });

  it("yields error event on failure", async () => {
    const provider = new OpenAIProvider("test-key");

    (provider as any).client.chat.completions.create = vi
      .fn()
      .mockRejectedValue(new Error("API error"));

    const events: any[] = [];
    for await (const event of provider.chat({
      messages: [{ role: "user", content: "hi" }],
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "error", message: "API error" });
  });

  it("abort() terminates the generator cleanly without yielding an error event", async () => {
    const provider = new OpenAIProvider("test-key");

    let abortTriggered = false;

    const mockStream = (async function* () {
      yield {
        id: "chatcmpl-1",
        choices: [
          {
            index: 0,
            delta: { content: "partial", role: "assistant" },
            finish_reason: null,
          },
        ],
      } as any;

      if (abortTriggered) {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        throw err;
      }

      yield {
        id: "chatcmpl-1",
        choices: [
          {
            index: 0,
            delta: { content: " more", role: "assistant" },
            finish_reason: "stop",
          },
        ],
      } as any;
    })();

    (provider as any).client.chat.completions.create = vi
      .fn()
      .mockResolvedValue(mockStream);

    const gen = provider.chat({
      messages: [{ role: "user", content: "hi" }],
    });

    // Consume the first text event
    const result1 = await gen.next();
    expect(result1.done).toBe(false);
    expect(result1.value).toEqual({ type: "text", content: "partial" });

    // Trigger abort
    abortTriggered = true;
    provider.abort();

    // Verify the abort controller was set up and signalled
    const ctrl = (provider as any).activeController;
    expect(ctrl).not.toBeNull();
    expect(ctrl.signal.aborted).toBe(true);

    // Generator should terminate cleanly
    const result2 = await gen.next();
    expect(result2.done).toBe(true);
    expect(result2.value).toBeUndefined();
  });

  it("converts messages with tool roles to OpenAI format", async () => {
    const provider = new OpenAIProvider("test-key");

    let capturedParams: any = null;
    const mockStream = (async function* () {
      yield {
        id: "chatcmpl-1",
        choices: [
          {
            index: 0,
            delta: { content: "", role: "assistant" },
            finish_reason: "stop",
          },
        ],
      } as any;
    })();

    (provider as any).client.chat.completions.create = vi
      .fn()
      .mockImplementation((params: any) => {
        capturedParams = params;
        return Promise.resolve(mockStream);
      });

    const events: any[] = [];
    for await (const event of provider.chat({
      messages: [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            { id: "tc1", name: "read_file", arguments: '{"path":"/x"}' },
          ],
        },
        { role: "tool", content: "file contents", tool_call_id: "tc1" },
      ],
    })) {
      events.push(event);
    }

    expect(capturedParams.messages).toHaveLength(3);
    expect(capturedParams.messages[0]).toEqual({
      role: "user",
      content: "hi",
    });
    // Assistant with tool_calls
    expect(capturedParams.messages[1].role).toBe("assistant");
    expect(capturedParams.messages[1].tool_calls).toEqual([
      {
        id: "tc1",
        type: "function",
        function: { name: "read_file", arguments: '{"path":"/x"}' },
      },
    ]);
    // Tool message
    expect(capturedParams.messages[2]).toEqual({
      role: "tool",
      tool_call_id: "tc1",
      content: "file contents",
    });
  });

  it("converts tools definitions to OpenAI format", async () => {
    const provider = new OpenAIProvider("test-key");

    let capturedParams: any = null;
    const mockStream = (async function* () {
      yield {
        id: "chatcmpl-1",
        choices: [
          {
            index: 0,
            delta: { content: "", role: "assistant" },
            finish_reason: "stop",
          },
        ],
      } as any;
    })();

    (provider as any).client.chat.completions.create = vi
      .fn()
      .mockImplementation((params: any) => {
        capturedParams = params;
        return Promise.resolve(mockStream);
      });

    const events: any[] = [];
    for await (const event of provider.chat({
      messages: [{ role: "user", content: "hi" }],
      tools: [
        {
          name: "read_file",
          description: "Read a file",
          parameters: {
            properties: { path: { type: "string" } },
            required: ["path"],
          },
        },
      ],
    })) {
      events.push(event);
    }

    expect(capturedParams.tools).toHaveLength(1);
    expect(capturedParams.tools[0]).toEqual({
      type: "function",
      function: {
        name: "read_file",
        description: "Read a file",
        parameters: {
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    });
  });

  it("prepends system message when system is set", async () => {
    const provider = new OpenAIProvider("test-key");

    let capturedParams: any = null;
    const mockStream = (async function* () {
      yield {
        id: "chatcmpl-1",
        choices: [
          {
            index: 0,
            delta: { content: "", role: "assistant" },
            finish_reason: "stop",
          },
        ],
      } as any;
    })();

    (provider as any).client.chat.completions.create = vi
      .fn()
      .mockImplementation((params: any) => {
        capturedParams = params;
        return Promise.resolve(mockStream);
      });

    const events: any[] = [];
    for await (const event of provider.chat({
      messages: [{ role: "user", content: "hi" }],
      system: "You are a helpful assistant",
    })) {
      events.push(event);
    }

    expect(capturedParams.messages).toHaveLength(2);
    expect(capturedParams.messages[0]).toEqual({
      role: "system",
      content: "You are a helpful assistant",
    });
    expect(capturedParams.messages[1]).toEqual({
      role: "user",
      content: "hi",
    });
  });

  it("returns undefined for empty tools array", async () => {
    const provider = new OpenAIProvider("test-key");

    let capturedParams: any = null;
    const mockStream = (async function* () {
      yield {
        id: "chatcmpl-1",
        choices: [
          {
            index: 0,
            delta: { content: "", role: "assistant" },
            finish_reason: "stop",
          },
        ],
      } as any;
    })();

    (provider as any).client.chat.completions.create = vi
      .fn()
      .mockImplementation((params: any) => {
        capturedParams = params;
        return Promise.resolve(mockStream);
      });

    const events: any[] = [];
    for await (const event of provider.chat({
      messages: [{ role: "user", content: "hi" }],
      tools: [],
    })) {
      events.push(event);
    }

    expect(capturedParams.tools).toBeUndefined();
  });
});
