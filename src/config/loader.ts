import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import TOML from "@iarna/toml";
import { ArenaConfig } from "./types.js";

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "");
}

function resolveConfig(raw: Record<string, any>): ArenaConfig {
  const walk = (obj: any): any => {
    if (typeof obj === "string") return resolveEnvVars(obj);
    if (Array.isArray(obj)) return obj.map(walk);
    if (obj && typeof obj === "object") {
      const result: Record<string, any> = {};
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

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const raw = TOML.parse(fs.readFileSync(p, "utf-8"));
      return resolveConfig(raw) as ArenaConfig;
    }
  }

  return { models: {}, defaults: { active: [], broadcast: true } };
}
