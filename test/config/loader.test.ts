import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const mocks = vi.hoisted(() => ({
  homeDir: "/tmp/nonexistent-arena-home",
}));

vi.mock("os", async () => {
  const actual = await vi.importActual<typeof import("os")>("os");
  return {
    ...actual,
    homedir: () => mocks.homeDir,
  };
});

import { loadConfig, validateConfig } from "../../src/config/loader.js";

describe("config loader", () => {
  let tmpDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-test-"));
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    mocks.homeDir = "/tmp/nonexistent-arena-home";
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    cwdSpy.mockRestore();
  });

  it("returns default config when no .arenarc found", () => {
    const config = loadConfig();

    expect(config.models).toEqual({});
    expect(config.defaults.broadcast).toBe(true);
    expect(config.defaults.active).toEqual([]);
  });

  it("loads models from .arenarc", () => {
    const tomlContent = `
[models.claude]
provider = "anthropic"
model = "claude-sonnet-4-6"

[models.gpt]
provider = "openai"
model = "gpt-4o"
api_key = "sk-test123"

[defaults]
active = ["claude", "gpt"]
broadcast = true
`;
    fs.writeFileSync(path.join(tmpDir, ".arenarc"), tomlContent);

    const config = loadConfig();

    expect(config.models.claude.provider).toBe("anthropic");
    expect(config.models.claude.model).toBe("claude-sonnet-4-6");
    expect(config.models.gpt.provider).toBe("openai");
    expect(config.models.gpt.api_key).toBe("sk-test123");
    expect(config.defaults.active).toEqual(["claude", "gpt"]);
    expect(config.defaults.broadcast).toBe(true);
  });

  it("uses defaults when [defaults] section is missing", () => {
    const tomlContent = `
[models.claude]
provider = "anthropic"
model = "claude-sonnet-4-6"
`;
    fs.writeFileSync(path.join(tmpDir, ".arenarc"), tomlContent);

    const config = loadConfig();

    expect(config.models.claude.provider).toBe("anthropic");
    expect(config.defaults.broadcast).toBe(true);
    expect(config.defaults.active).toEqual([]);
  });

  it("resolves env vars in config values", () => {
    process.env.TEST_ARENA_KEY = "secret-from-env";

    const tomlContent = `
[models.claude]
provider = "anthropic"
model = "claude-sonnet-4-6"
api_key = "\${TEST_ARENA_KEY}"
`;
    fs.writeFileSync(path.join(tmpDir, ".arenarc"), tomlContent);

    const config = loadConfig();

    expect(config.models.claude.api_key).toBe("secret-from-env");

    delete process.env.TEST_ARENA_KEY;
  });

  it("resolves env vars nested in arrays", () => {
    process.env.TEST_ARENA_MODEL = "gpt-4o";

    const tomlContent = `
[defaults]
active = ["claude", "\${TEST_ARENA_MODEL}"]
broadcast = true
`;
    fs.writeFileSync(path.join(tmpDir, ".arenarc"), tomlContent);

    const config = loadConfig();

    expect(config.defaults.active).toEqual(["claude", "gpt-4o"]);

    delete process.env.TEST_ARENA_MODEL;
  });

  it("warns on missing model config", () => {
    const warnings = validateConfig({
      models: {},
      defaults: { active: ["claude"], broadcast: true },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("claude");
  });

  it("warns on missing api_key for non-ollama provider", () => {
    const warnings = validateConfig({
      models: { gpt: { provider: "openai", model: "gpt-4o" } },
      defaults: { active: ["gpt"], broadcast: true },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("api_key");
  });

  it("does not warn on missing api_key for ollama", () => {
    const warnings = validateConfig({
      models: { local: { provider: "ollama", model: "llama3" } },
      defaults: { active: ["local"], broadcast: true },
    });
    expect(warnings).toHaveLength(0);
  });

  it("returns no warnings for valid config", () => {
    const warnings = validateConfig({
      models: { claude: { provider: "anthropic", model: "claude", api_key: "sk-key" } },
      defaults: { active: ["claude"], broadcast: true },
    });
    expect(warnings).toHaveLength(0);
  });

  it("loads config from home directory when project-level .arenarc is absent", () => {
    const homeConfigContent = `
[models.home-model]
provider = "ollama"
model = "llama3"
`;
    // Point homedir to tmpDir and write .arenarc there
    mocks.homeDir = tmpDir;
    fs.writeFileSync(path.join(tmpDir, ".arenarc"), homeConfigContent);

    // cwd points to a subdirectory with no .arenarc
    cwdSpy.mockRestore();
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(path.join(tmpDir, "no-config-here"));

    const config = loadConfig();

    expect(config.models["home-model"].provider).toBe("ollama");
    expect(config.models["home-model"].model).toBe("llama3");
  });
});
