export interface ModelConfig {
  provider: "anthropic" | "openai" | "google" | "ollama" | "deepseek" | "minimax";
  model: string;
  api_key?: string;
  endpoint?: string;
  context_limit?: number;
}

export interface DeliberationConfig {
  /** Models and their round roles in order. E.g. [{ model: "claude", role: "draft" }, ...] */
  rounds: Array<{ model: string; role: "draft" | "revise" | "polish" | "review" }>;
  /** Path to a constraint document (markdown), relative to project root. */
  constraint_file?: string;
  /** 对抗强度。off = 纯协作（默认），low = 批判提示注入，medium = 挑战-回应嵌入，high = 视角分配 + 镜像对抗。 */
  adversarial?: "off" | "low" | "medium" | "high";
}

export interface ArenaConfig {
  models: Record<string, ModelConfig>;
  defaults: {
    active: string[];
    broadcast: boolean;
  };
  deliberation?: DeliberationConfig;
}

export const DEFAULT_CONFIG: Partial<ArenaConfig> = {
  defaults: {
    active: [],
    broadcast: true,
  },
};
