export interface ModelConfig {
  provider: "anthropic" | "openai" | "google" | "ollama" | "deepseek" | "minimax";
  model: string;
  api_key?: string;
  endpoint?: string;
  context_limit?: number;
}

export interface ArenaConfig {
  models: Record<string, ModelConfig>;
  defaults: {
    active: string[];
    broadcast: boolean;
  };
}

export const DEFAULT_CONFIG: Partial<ArenaConfig> = {
  defaults: {
    active: [],
    broadcast: true,
  },
};
