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

export function loadConfig(): ArenaConfig {
  const candidates = [
    path.join(process.cwd(), ".arenarc"),
    path.join(os.homedir(), ".arenarc"),
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
