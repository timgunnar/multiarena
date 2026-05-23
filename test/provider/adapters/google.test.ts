import { describe, it, expect, vi } from "vitest";
import { GoogleProvider } from "../../../src/provider/adapters/google.js";

// Mock @google/generative-ai
vi.mock("@google/generative-ai", () => {
  const mockGetGenerativeModel = vi.fn();
  const mockGenerateContentStream = vi.fn();

  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    })),
    GenerativeModel: vi.fn(),
  };
});

import { GoogleGenerativeAI } from "@google/generative-ai";

describe("GoogleProvider", () => {
  it("constructs with API key", () => {
    const provider = new GoogleProvider("test-key");
    expect(provider).toBeDefined();
  });

  it("yields text events from stream", async () => {
    const provider = new GoogleProvider("test-key");

    const mockStream = (async function* () {
      yield { text: () => "Hello" };
      yield { text: () => " world" };
    })();

    const mockModel = {
      generateContentStream: vi.fn().mockResolvedValue({ stream: mockStream }),
    };

    (provider as any).genAI.getGenerativeModel = vi
      .fn()
      .mockReturnValue(mockModel);

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
    const provider = new GoogleProvider("test-key");

    const mockModel = {
      generateContentStream: vi
        .fn()
        .mockRejectedValue(new Error("API error")),
    };

    (provider as any).genAI.getGenerativeModel = vi
      .fn()
      .mockReturnValue(mockModel);

    const events: any[] = [];
    for await (const event of provider.chat({
      messages: [{ role: "user", content: "hi" }],
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "error", message: "API error" });
  });

  it("filters out tool messages from history", async () => {
    const provider = new GoogleProvider("test-key");

    let capturedContents: any = null;
    const mockStream = (async function* () {
      yield { text: () => "response" };
    })();

    const mockModel = {
      generateContentStream: vi
        .fn()
        .mockImplementation((params: any) => {
          capturedContents = params.contents;
          return Promise.resolve({ stream: mockStream });
        }),
    };

    (provider as any).genAI.getGenerativeModel = vi
      .fn()
      .mockReturnValue(mockModel);

    const events: any[] = [];
    for await (const event of provider.chat({
      messages: [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: "I'll help",
        },
        { role: "tool", content: "file contents", tool_call_id: "tc1" },
        { role: "user", content: "thanks" },
      ],
    })) {
      events.push(event);
    }

    // Tool messages should be filtered out
    expect(capturedContents).toHaveLength(3);
    expect(capturedContents[0]).toEqual({
      role: "user",
      parts: [{ text: "hi" }],
    });
    expect(capturedContents[1]).toEqual({
      role: "model",
      parts: [{ text: "I'll help" }],
    });
    expect(capturedContents[2]).toEqual({
      role: "user",
      parts: [{ text: "thanks" }],
    });
  });

  it("converts tools definitions to Google format", async () => {
    const provider = new GoogleProvider("test-key");

    let capturedTools: any = null;
    const mockStream = (async function* () {
      yield { text: () => "response" };
    })();

    const mockGetGenerativeModel = vi
      .fn()
      .mockImplementation((params: any) => {
        capturedTools = params.tools;
        return {
          generateContentStream: vi
            .fn()
            .mockResolvedValue({ stream: mockStream }),
        };
      });

    (provider as any).genAI.getGenerativeModel = mockGetGenerativeModel;

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

    expect(capturedTools).toHaveLength(1);
    expect(capturedTools[0].functionDeclarations).toHaveLength(1);
    expect(capturedTools[0].functionDeclarations[0].name).toBe("read_file");
    expect(
      capturedTools[0].functionDeclarations[0].description,
    ).toBe("Read a file");
  });

  it("passes system instruction to model params", async () => {
    const provider = new GoogleProvider("test-key");

    let capturedSystemInstruction: any = null;
    const mockStream = (async function* () {
      yield { text: () => "response" };
    })();

    const mockGetGenerativeModel = vi
      .fn()
      .mockImplementation((params: any) => {
        capturedSystemInstruction = params.systemInstruction;
        return {
          generateContentStream: vi
            .fn()
            .mockResolvedValue({ stream: mockStream }),
        };
      });

    (provider as any).genAI.getGenerativeModel = mockGetGenerativeModel;

    const events: any[] = [];
    for await (const event of provider.chat({
      messages: [{ role: "user", content: "hi" }],
      system: "You are a helpful assistant",
    })) {
      events.push(event);
    }

    expect(capturedSystemInstruction).toBe("You are a helpful assistant");
  });
});
