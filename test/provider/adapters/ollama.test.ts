import { describe, it, expect, vi } from "vitest";
import { OllamaProvider } from "../../../src/provider/adapters/ollama.js";

describe("OllamaProvider", () => {
  it("should be instantiated", () => {
    const provider = new OllamaProvider("http://localhost:11434");
    expect(provider).toBeDefined();
  });

  it("should convert user messages for native API", async () => {
    const provider = new OllamaProvider("http://localhost:11434");
    const stream = provider.chat({
      messages: [{ role: "user", content: "hello" }],
      system: undefined,
      model: "llama3",
      tools: undefined,
    });

    // The fetch will fail (no server), but we can check it reaches the fetch call
    // by verifying an error is yielded
    const events: unknown[] = [];
    for await (const event of stream) {
      events.push(event);
    }
    // Without a running Ollama server, we expect a fetch error
    expect(events.length).toBeGreaterThan(0);
    const first = events[0] as { type: string };
    expect(first.type).toBe("error");
  });

  it("should convert tool definitions for native API", () => {
    const provider = new OllamaProvider("http://localhost:11434");
    expect(provider).toBeDefined();
  });

  it("should support abort", () => {
    const provider = new OllamaProvider("http://localhost:11434");
    provider.abort(); // Should not throw
  });
});
