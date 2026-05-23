import { describe, it, expect } from "vitest";
import { launchStreams } from "../../src/core/stream.js";
import { Session } from "../../src/core/session.js";
import { ArenaConfig } from "../../src/config/types.js";

function mockConfig(): ArenaConfig {
  return {
    models: {
      claude: { provider: "anthropic", model: "claude-sonnet-4-6" },
      gpt: { provider: "openai", model: "gpt-4o" },
    },
    defaults: { active: ["claude", "gpt"], broadcast: true },
  };
}

describe("launchStreams", () => {
  it("launches streams for all unmuted models in broadcast mode", () => {
    const s = new Session(mockConfig(), "/tmp/test");
    s.addUserMessage("hello");
    const results = launchStreams(s, mockConfig(), "You are helpful", []);
    expect(results).toHaveLength(2);
    expect(results[0].modelName).toBe("claude");
    expect(results[1].modelName).toBe("gpt");
    // Each result has an async generator and a provider
    expect(results[0].events).toBeDefined();
    expect(results[0].provider).toBeDefined();
  });

  it("launches stream only for directed model", () => {
    const s = new Session(mockConfig(), "/tmp/test");
    s.jumpToModel("claude");
    s.addUserMessage("hello");
    const results = launchStreams(s, mockConfig(), "", []);
    expect(results).toHaveLength(1);
    expect(results[0].modelName).toBe("claude");
  });

  it("skips muted models in broadcast", () => {
    const s = new Session(mockConfig(), "/tmp/test");
    s.toggleMute("claude");
    s.addUserMessage("hello");
    const results = launchStreams(s, mockConfig(), "", []);
    expect(results).toHaveLength(1);
    expect(results[0].modelName).toBe("gpt");
  });

  it("throws for unknown model", () => {
    const s = new Session(
      {
        models: { claude: { provider: "anthropic", model: "claude-sonnet-4-6" } },
        defaults: { active: ["unknown_model"], broadcast: true },
      },
      "/tmp/test",
    );
    expect(() => launchStreams(s, mockConfig(), "", [])).toThrow(/No config for model/);
  });
});
