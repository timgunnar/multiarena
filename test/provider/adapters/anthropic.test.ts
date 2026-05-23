import { describe, it, expect, vi } from "vitest";
import { AnthropicProvider } from "../../../src/provider/adapters/anthropic.js";

// Mock @anthropic-ai/sdk
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        stream: vi.fn(),
      },
    })),
  };
});

describe("AnthropicProvider", () => {
  it("constructs with API key", () => {
    const provider = new AnthropicProvider("test-key");
    expect(provider).toBeDefined();
  });

  it("yields text events from stream", async () => {
    const provider = new AnthropicProvider("test-key");

    // Mock the stream to yield events that match the shape
    // the MessageStream async iterator produces.
    const mockStream = (async function* () {
      yield {
        type: "message_start",
        message: { usage: { input_tokens: 5, output_tokens: 0 } },
      } as any;
      yield {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Hello" },
      } as any;
      yield {
        type: "content_block_delta",
        delta: { type: "text_delta", text: " world" },
      } as any;
      yield { type: "message_delta", usage: { output_tokens: 12 } } as any;
      yield { type: "message_stop" } as any;
    })();

    (provider as any).client.messages.stream = vi
      .fn()
      .mockReturnValue(mockStream);

    const events: any[] = [];
    for await (const event of provider.chat({
      messages: [{ role: "user", content: "hi" }],
    })) {
      events.push(event);
    }

    // text + text + done (3 events)
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: "text", content: "Hello" });
    expect(events[1]).toEqual({ type: "text", content: " world" });
    expect(events[2]).toEqual({
      type: "done",
      usage: { input: 5, output: 12 },
    });
  });

  it("yields tool_call event on content_block_stop with tool_use", async () => {
    const provider = new AnthropicProvider("test-key");

    const mockStream = (async function* () {
      yield {
        type: "message_start",
        message: { usage: { input_tokens: 10, output_tokens: 0 } },
      } as any;
      yield {
        type: "content_block_start",
        content_block: { type: "tool_use", id: "toolu_1", name: "read_file" },
      } as any;
      yield {
        type: "content_block_delta",
        delta: {
          type: "input_json_delta",
          partial_json: '{"path":"/foo"}',
        },
      } as any;
      yield {
        type: "content_block_stop",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_1",
          name: "read_file",
          input: { path: "/foo" },
        },
      } as any;
      yield { type: "message_delta", usage: { output_tokens: 20 } } as any;
      yield { type: "message_stop" } as any;
    })();

    (provider as any).client.messages.stream = vi
      .fn()
      .mockReturnValue(mockStream);

    const events: any[] = [];
    for await (const event of provider.chat({
      messages: [{ role: "user", content: "read file" }],
      tools: [
        {
          name: "read_file",
          description: "Read a file",
          parameters: { properties: { path: { type: "string" } } },
        },
      ],
    })) {
      events.push(event);
    }

    // tool_call + done
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: "tool_call",
      id: "toolu_1",
      name: "read_file",
      args: '{"path":"/foo"}',
    });
    expect(events[1]).toEqual({
      type: "done",
      usage: { input: 10, output: 20 },
    });
  });

  it("yields error event on failure", async () => {
    const provider = new AnthropicProvider("test-key");

    (provider as any).client.messages.stream = vi.fn().mockImplementation(() => {
      throw new Error("API error");
    });

    const events: any[] = [];
    for await (const event of provider.chat({
      messages: [{ role: "user", content: "hi" }],
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "error", message: "API error" });
  });

  it("converts messages with tool roles to tool_result blocks", async () => {
    const provider = new AnthropicProvider("test-key");

    // Capture the params passed to stream()
    let capturedParams: any = null;
    const mockStream = (async function* () {
      yield {
        type: "message_start",
        message: { usage: { input_tokens: 1, output_tokens: 0 } },
      } as any;
      yield { type: "message_stop" } as any;
    })();

    (provider as any).client.messages.stream = vi
      .fn()
      .mockImplementation((params: any) => {
        capturedParams = params;
        return mockStream;
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
    // Assistant with tool_calls should produce content array
    expect(capturedParams.messages[1].role).toBe("assistant");
    expect(capturedParams.messages[1].content).toEqual([
      { type: "tool_use", id: "tc1", name: "read_file", input: { path: "/x" } },
    ]);
    // Tool message becomes user with tool_result
    expect(capturedParams.messages[2]).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tc1",
          content: "file contents",
        },
      ],
    });
  });

  it("converts tools definitions to Anthropic format", async () => {
    const provider = new AnthropicProvider("test-key");

    let capturedParams: any = null;
    const mockStream = (async function* () {
      yield {
        type: "message_start",
        message: { usage: { input_tokens: 1, output_tokens: 0 } },
      } as any;
      yield { type: "message_stop" } as any;
    })();

    (provider as any).client.messages.stream = vi
      .fn()
      .mockImplementation((params: any) => {
        capturedParams = params;
        return mockStream;
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
      name: "read_file",
      description: "Read a file",
      input_schema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    });
  });

  it("passes system prompt to top-level system parameter", async () => {
    const provider = new AnthropicProvider("test-key");

    let capturedParams: any = null;
    const mockStream = (async function* () {
      yield {
        type: "message_start",
        message: { usage: { input_tokens: 1, output_tokens: 0 } },
      } as any;
      yield { type: "message_stop" } as any;
    })();

    (provider as any).client.messages.stream = vi
      .fn()
      .mockImplementation((params: any) => {
        capturedParams = params;
        return mockStream;
      });

    const events: any[] = [];
    for await (const event of provider.chat({
      messages: [{ role: "user", content: "hi" }],
      system: "You are a helpful assistant",
    })) {
      events.push(event);
    }

    expect(capturedParams.system).toBe("You are a helpful assistant");
  });

  it("returns undefined for empty tools array", async () => {
    const provider = new AnthropicProvider("test-key");

    let capturedParams: any = null;
    const mockStream = (async function* () {
      yield {
        type: "message_start",
        message: { usage: { input_tokens: 1, output_tokens: 0 } },
      } as any;
      yield { type: "message_stop" } as any;
    })();

    (provider as any).client.messages.stream = vi
      .fn()
      .mockImplementation((params: any) => {
        capturedParams = params;
        return mockStream;
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
