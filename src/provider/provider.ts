import { ChatRequest, StreamEvent } from "./types.js";
import { AnthropicProvider } from "./adapters/anthropic.js";
import { OpenAIProvider } from "./adapters/openai.js";
import { GoogleProvider } from "./adapters/google.js";
import { OllamaProvider } from "./adapters/ollama.js";
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
    case "ollama": {
      const baseURL = config.endpoint?.replace(/\/v1\/?$/, "") ?? "http://localhost:11434";
      return new OllamaProvider(baseURL);
    }
    case "deepseek":
      return new OpenAIProvider(key, config.endpoint ?? "https://api.deepseek.com/v1");
    case "minimax":
      return new OpenAIProvider(key, config.endpoint ?? "https://api.minimax.chat/v1");
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
