import { describe, it, expect } from "vitest";
import { Session } from "../../src/core/session.js";
import { ArenaConfig } from "../../src/config/types.js";

function mockConfig(active: string[] = ["claude", "gpt"]): ArenaConfig {
  return {
    models: {
      claude: { provider: "anthropic", model: "claude-sonnet-4-6" },
      gpt: { provider: "openai", model: "gpt-4o" },
    },
    defaults: { active, broadcast: true },
  };
}

describe("Session", () => {
  it("starts in broadcast mode", () => {
    const s = new Session(mockConfig(), "/tmp/test");
    expect(s.targetMode).toEqual({ type: "broadcast" });
  });

  it("addUserMessage appends to all unmuted models in broadcast", () => {
    const s = new Session(mockConfig(), "/tmp/test");
    const targets = s.addUserMessage("hello");
    expect(targets).toHaveLength(2);
    expect(s.models[0].messages).toHaveLength(1);
    expect(s.models[1].messages).toHaveLength(1);
    expect(s.models[0].messages[0]).toEqual({ role: "user", content: "hello" });
  });

  it("addUserMessage appends only to directed model", () => {
    const s = new Session(mockConfig(), "/tmp/test");
    s.jumpToModel("claude");
    const targets = s.addUserMessage("hello");
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe("claude");
    expect(s.models[0].messages).toHaveLength(1);
    expect(s.models[1].messages).toHaveLength(0);
  });

  it("cycleTarget rotates broadcast → model1 → model2 → broadcast", () => {
    const s = new Session(mockConfig(), "/tmp/test");
    expect(s.targetMode).toEqual({ type: "broadcast" });

    const t1 = s.cycleTarget();
    expect(t1).toEqual({ type: "directed", modelName: "claude" });

    const t2 = s.cycleTarget();
    expect(t2).toEqual({ type: "directed", modelName: "gpt" });

    const t3 = s.cycleTarget();
    expect(t3).toEqual({ type: "broadcast" });
  });

  it("skips muted models in broadcast", () => {
    const s = new Session(mockConfig(), "/tmp/test");
    s.toggleMute("claude");
    const targets = s.addUserMessage("hello");
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe("gpt");
  });

  it("addAssistantMessage appends to correct model", () => {
    const s = new Session(mockConfig(), "/tmp/test");
    s.addAssistantMessage("claude", "response");
    expect(s.models[0].messages).toHaveLength(1);
    expect(s.models[0].messages[0]).toEqual({ role: "assistant", content: "response" });
    expect(s.models[1].messages).toHaveLength(0);
  });

  it("addToolResult appends tool result", () => {
    const s = new Session(mockConfig(), "/tmp/test");
    s.addToolResult("claude", "call1", "file contents");
    expect(s.models[0].messages[0]).toEqual({
      role: "tool",
      content: "file contents",
      tool_call_id: "call1",
    });
  });

  it("toggleMute toggles mute state", () => {
    const s = new Session(mockConfig(), "/tmp/test");
    expect(s.models[0].muted).toBe(false);
    expect(s.toggleMute("claude")).toBe(true);
    expect(s.models[0].muted).toBe(true);
    expect(s.toggleMute("claude")).toBe(false);
  });

  it("resetModel clears messages and buffer", () => {
    const s = new Session(mockConfig(), "/tmp/test");
    s.addUserMessage("hello");
    s.addAssistantMessage("claude", "resp");
    s.models[0].buffer = "some buffer";
    s.resetModel("claude");
    expect(s.models[0].messages).toHaveLength(0);
    expect(s.models[0].buffer).toBe("");
  });

  it("getContextUsage returns ratio", () => {
    const s = new Session(mockConfig(), "/tmp/test");
    expect(s.getContextUsage("claude")).toBe(0);
    s.models[0].usage = { input: 100000, output: 20000 };
    expect(s.getContextUsage("claude")).toBe(120000 / 200000);
  });

  it("jumpToModel ignores unknown model", () => {
    const s = new Session(mockConfig(), "/tmp/test");
    s.jumpToModel("nonexistent");
    expect(s.targetMode).toEqual({ type: "broadcast" });
  });

  it("jumpToBroadcast switches to broadcast", () => {
    const s = new Session(mockConfig(), "/tmp/test");
    s.jumpToModel("claude");
    s.jumpToBroadcast();
    expect(s.targetMode).toEqual({ type: "broadcast" });
  });

  it("cycleTarget with empty models stays in broadcast", () => {
    const s = new Session(mockConfig([]), "/tmp/test");
    const result = s.cycleTarget();
    expect(result).toEqual({ type: "broadcast" });
  });
});
