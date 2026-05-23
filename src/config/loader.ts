import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import TOML from "@iarna/toml";
import { ArenaConfig, DEFAULT_CONFIG } from "./types.js";

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "");
}

function resolveConfig(raw: Record<string, unknown>): ArenaConfig {
  const walk = (obj: any): any => {
    if (typeof obj === "string") return resolveEnvVars(obj);
    if (Array.isArray(obj)) return obj.map(walk);
    if (obj && typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        result[k] = walk(v);
      }
      return result;
    }
    return obj;
  };
  return walk(raw) as ArenaConfig;
}

export interface ConfigWarning {
  message: string;
}

export function validateConfig(config: ArenaConfig): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];

  for (const name of config.defaults.active) {
    const mc = config.models[name];
    if (!mc) {
      warnings.push({
        message: `Model "${name}" is in defaults.active but has no [models.${name}] config section`,
      });
      continue;
    }
    if (!mc.provider) {
      warnings.push({
        message: `Model "${name}" has no provider set`,
      });
    }
    if (!mc.api_key && mc.provider !== "ollama") {
      warnings.push({
        message: `Model "${name}" (${mc.provider}) has no api_key — set it or the \${ENV_VAR} may be missing`,
      });
    }
  }

  return warnings;
}

export function loadConfig(): ArenaConfig {
  const candidates = [
    path.join(process.cwd(), ".multiarenarc"),
    path.join(os.homedir(), ".multiarenarc"),
  ];

  let resolved: Partial<ArenaConfig> = {};

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const raw = TOML.parse(fs.readFileSync(p, "utf-8"));
      resolved = resolveConfig(raw);
      break;
    }
  }

  return {
    models: resolved.models ?? {},
    defaults: {
      active: resolved.defaults?.active ?? DEFAULT_CONFIG.defaults?.active ?? [],
      broadcast: resolved.defaults?.broadcast ?? DEFAULT_CONFIG.defaults?.broadcast ?? true,
    },
  };
}
