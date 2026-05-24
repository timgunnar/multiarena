import { describe, it, expect } from "vitest";
import { createProvider } from "../../src/provider/provider.js";
import type { ModelConfig } from "../../src/config/types.js";

function cfg(provider: string, overrides?: Partial<ModelConfig>): ModelConfig {
  return { provider, model: "test-model", api_key: "sk-test", ...overrides };
}

describe("createProvider", () => {
  it("creates AnthropicProvider for anthropic", () => {
    const p = createProvider(cfg("anthropic"));
    expect(p).toBeDefined();
    expect(typeof p.chat).toBe("function");
    expect(typeof p.abort).toBe("function");
  });

  it("creates OpenAIProvider for openai", () => {
    const p = createProvider(cfg("openai"));
    expect(p).toBeDefined();
    expect(typeof p.chat).toBe("function");
  });

  it("creates GoogleProvider for google", () => {
    const p = createProvider(cfg("google"));
    expect(p).toBeDefined();
    expect(typeof p.chat).toBe("function");
  });

  it("creates OllamaProvider for ollama with default base URL", () => {
    const p = createProvider(cfg("ollama"));
    expect(p).toBeDefined();
    expect(typeof p.chat).toBe("function");
  });

  it("strips /v1 suffix from ollama endpoint", () => {
    const p = createProvider(cfg("ollama", { endpoint: "http://host:11434/v1" }));
    expect(p).toBeDefined();
  });

  it("strips /v1/ suffix from ollama endpoint", () => {
    const p = createProvider(cfg("ollama", { endpoint: "http://host:11434/v1/" }));
    expect(p).toBeDefined();
  });

  it("keeps ollama endpoint without /v1 suffix unchanged", () => {
    const p = createProvider(cfg("ollama", { endpoint: "http://host:11434" }));
    expect(p).toBeDefined();
  });

  it("creates OpenAIProvider for deepseek with default endpoint", () => {
    const p = createProvider(cfg("deepseek"));
    expect(p).toBeDefined();
  });

  it("uses custom endpoint for deepseek", () => {
    const p = createProvider(cfg("deepseek", { endpoint: "https://custom.deepseek.com/v1" }));
    expect(p).toBeDefined();
  });

  it("creates OpenAIProvider for minimax with default endpoint", () => {
    const p = createProvider(cfg("minimax"));
    expect(p).toBeDefined();
  });

  it("uses empty string for missing api_key", () => {
    const p = createProvider({ provider: "anthropic", model: "test" });
    expect(p).toBeDefined();
  });

  it("throws for unknown provider", () => {
    expect(() => createProvider(cfg("unknown_provider"))).toThrow("Unknown provider: unknown_provider");
  });
});
