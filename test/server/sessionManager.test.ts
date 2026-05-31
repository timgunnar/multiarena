/**
 * SessionManager unit tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionManager } from "../../src/server/sessionManager.js";
import type { ArenaConfig } from "../../src/config/types.js";

vi.mock("../../src/provider/provider.js", () => ({
  createProvider: vi.fn(),
}));

import { createProvider } from "../../src/provider/provider.js";

function makeConfig(modelNames: string[]): ArenaConfig {
  const models: Record<string, any> = {};
  for (const n of modelNames) {
    models[n] = { provider: "openai", model: "gpt-4o", api_key: "sk-test" };
  }
  return {
    models,
    defaults: { active: modelNames, broadcast: true },
  };
}

beforeEach(() => {
  (createProvider as any).mockReset();
});

describe("SessionManager", () => {
  it("constructs and returns initial state", () => {
    const mgr = new SessionManager(makeConfig(["A", "B"]));
    const state = mgr.getState();
    expect(state.mode).toBe("broadcast");
    expect(state.models).toHaveLength(2);
    expect(state.models[0].name).toBe("A");
    expect(state.models[1].name).toBe("B");
    expect(state.permissionPrompt).toBeNull();
  });

  it("toggleMute changes model state", () => {
    const mgr = new SessionManager(makeConfig(["A", "B"]));
    const result = mgr.toggleMute("A");
    expect(result).toBe(true);
    expect(mgr.getState().models[0].muted).toBe(true);
    mgr.toggleMute("A");
    expect(mgr.getState().models[0].muted).toBe(false);
  });

  it("setTarget changes target mode", () => {
    const mgr = new SessionManager(makeConfig(["A", "B"]));
    mgr.setTarget("directed", "A");
    expect(mgr.getState().targetModel).toBe("A");
    mgr.setTarget("broadcast");
    expect(mgr.getState().targetModel).toBeNull();
  });

  it("resetModel clears model buffer and messages", () => {
    const mgr = new SessionManager(makeConfig(["A"]));
    const m = mgr.session.models[0];
    m.buffer = "test";
    m.messages.push({ role: "user", content: "hi" });
    mgr.resetModel("A");
    expect(m.buffer).toBe("");
    expect(m.messages).toHaveLength(0);
  });

  it("respondPermission resolves pending request", () => {
    const mgr = new SessionManager(makeConfig(["A"]));
    mgr.permissionManager.requestUserDecision("bash", { command: "ls" }, "A");
    expect(mgr.getPermissionState()).not.toBeNull();
    mgr.respondPermission("allow");
    expect(mgr.getPermissionState()).toBeNull();
  });

  it("setAdversarial stores level", async () => {
    const mgr = new SessionManager(makeConfig(["A", "B", "C"]));
    mgr.setAdversarial("high");
    (createProvider as any).mockImplementation(() => ({
      chat: async function* () {
        yield { type: "text", content: "Test." } as any;
        yield { type: "done", usage: { input: 1, output: 1 } } as any;
      },
      abort: vi.fn(),
    }));
    // Deliberate with high adversarial → verify it runs
    const events: any[] = [];
    for await (const e of mgr.deliberate("Test task")) {
      events.push(e);
    }
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("save creates a valid session file", () => {
    const mgr = new SessionManager(makeConfig(["A"]));
    mgr.session.models[0].buffer = "test output";
    mgr.session.models[0].messages.push({ role: "user", content: "hello" });
    const saved = mgr.save("test-session-id");
    expect(saved.id).toBe("test-session-id");
    expect(saved.models[0].buffer).toBe("test output");
    expect(saved.models[0].messages).toHaveLength(1);
    expect(saved.teamMessages).toBeDefined();
  });

  // ── Robustness ─────────────────────────────────────────────

  it("constructs with empty model list without crashing", () => {
    const mgr = new SessionManager(makeConfig([]));
    const state = mgr.getState();
    expect(state.models).toHaveLength(0);
    expect(state.mode).toBe("broadcast");
    expect(state.permissionPrompt).toBeNull();
  });

  it("broadcast with no active models yields only done event", async () => {
    const mgr = new SessionManager(makeConfig([]));
    const events: any[] = [];
    for await (const e of mgr.broadcast("test")) {
      events.push(e);
    }
    // Should yield a single "done" event — no models to run
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("done");
  });

  it("broadcast handles provider creation failure gracefully", async () => {
    const mgr = new SessionManager(makeConfig(["A"]));
    (createProvider as any).mockImplementation(() => {
      throw new Error("Provider creation failed");
    });

    const events: any[] = [];
    for await (const e of mgr.broadcast("test")) {
      events.push(e);
    }

    // Should yield an error event + done, not crash
    const errEvent = events.find((e) => e.type === "error");
    expect(errEvent).toBeDefined();
    expect(errEvent.message).toContain("Provider creation failed");

    // Model streaming should be reset
    expect(mgr.session.models[0].isStreaming).toBe(false);

    // Should still yield done
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("teamChat handles provider failure gracefully", async () => {
    const mgr = new SessionManager(makeConfig(["A"]));
    (createProvider as any).mockImplementation(() => {
      throw new Error("Provider creation failed");
    });

    const events: any[] = [];
    for await (const e of mgr.teamChat("A", "test")) {
      events.push(e);
    }

    const errEvent = events.find((e) => e.type === "error");
    expect(errEvent).toBeDefined();
    expect(errEvent.message).toContain("Provider creation failed");
    expect(mgr.session.models[0].isStreaming).toBe(false);
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("teamChat with nonexistent model yields error", async () => {
    const mgr = new SessionManager(makeConfig(["A"]));
    const events: any[] = [];
    for await (const e of mgr.teamChat("nonexistent", "test")) {
      events.push(e);
    }
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    expect(events[0].message).toContain("not found");
  });

  it("deliberate with no active models handles gracefully", async () => {
    const mgr = new SessionManager(makeConfig(["A"]));
    mgr.toggleMute("A"); // mute all models
    const events: any[] = [];
    for await (const e of mgr.deliberate("test")) {
      events.push(e);
    }
    // Should complete without crashing (may yield a done or have empty output)
    expect(events.some((e) => e.type === "done")).toBe(true);
  });
});
