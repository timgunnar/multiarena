import { ChatRequest, StreamEvent } from "./types.js";
import { AnthropicProvider } from "./adapters/anthropic.js";
import { OpenAIProvider } from "./adapters/openai.js";
import { GoogleProvider } from "./adapters/google.js";
import { ModelConfig } from "../config/types.js";

export interface Provider {
  chat(request: ChatRequest): AsyncGenerator<StreamEvent>;
  abort(): void;
}

export function createProvider(config: ModelConfig): Provider {
  const key = config.api_key ?? "";

  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider(key);
    case "openai":
      return new OpenAIProvider(key, config.endpoint);
    case "google":
      return new GoogleProvider(key);
    case "ollama":
      return new OpenAIProvider("ollama", config.endpoint ?? "http://localhost:11434/v1");
    default:
      throw new Error(`Unknown provider: ${(config as any).provider}`);
  }
}
