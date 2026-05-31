/**
 * E2E tests: Session persistence — save all fields, restore cleanly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Harness } from "../../src/testing/harness.js";
import { loadSession } from "../../src/persistence/session.js";

vi.mock("../../src/provider/provider.js", () => ({
  createProvider: vi.fn(),
}));

import { createProvider } from "../../src/provider/provider.js";

function mockProvider(text = "Response.") {
  return {
    chat: async function* () {
      yield { type: "text", content: text } as any;
      yield { type: "done", usage: { input: 5, output: text.length } } as any;
    },
    abort: vi.fn(),
  };
}

beforeEach(() => {
  (createProvider as any).mockReset();
});

describe("Harness persistence", () => {
  it("saves and restores model messages and buffers", async () => {
    (createProvider as any).mockImplementation(() => mockProvider("Persisted response."));

    const h1 = new Harness(["A", "B"]);
    await h1.broadcast("Test message");
    const saved = h1.save();

    const h2 = Harness.resume(saved.id);
    expect(h2.session.models[0].messages).toHaveLength(2); // user + assistant
    expect(h2.session.models[0].messages[1].content).toContain("Persisted response");
  });

  it("saves and restores teamMessages", async () => {
    (createProvider as any).mockImplementation(() => mockProvider("Team output."));

    const h1 = new Harness(["A", "B", "C"]);
    await h1.deliberate("Team task");
    const saved = h1.save();

    // Verify saved data contains teamMessages
    const loaded = loadSession(saved.id);
    expect(loaded?.teamMessages).toBeDefined();
    expect(loaded!.teamMessages!.length).toBeGreaterThan(0);

    const h2 = Harness.resume(saved.id);
    expect(h2.session.teamMessages.length).toBeGreaterThan(0);
  });

  it("saves and restores muted state", async () => {
    const h1 = new Harness(["A", "B", "C"]);
    h1.toggleMute("B");
    const saved = h1.save();

    const h2 = Harness.resume(saved.id);
    expect(h2.session.models[1].muted).toBe(true); // B is muted
    expect(h2.session.models[0].muted).toBe(false); // A is not
  });

  it("saves and restores usage stats", async () => {
    (createProvider as any).mockImplementation(() => mockProvider("Token test."));

    const h1 = new Harness(["A"]);
    await h1.broadcast("Usage test");
    const saved = h1.save();

    expect(saved.models[0].usage.input).toBeGreaterThan(0);
    expect(saved.models[0].usage.output).toBeGreaterThan(0);

    const h2 = Harness.resume(saved.id);
    expect(h2.session.models[0].usage.input).toBeGreaterThan(0);
    expect(h2.session.models[0].usage.output).toBeGreaterThan(0);
  });

  it("saves and restores input history", async () => {
    const h1 = new Harness(["A"]);
    (createProvider as any).mockImplementation(() => mockProvider());
    await h1.broadcast("Message 1");
    (createProvider as any).mockImplementation(() => mockProvider("R2"));
    await h1.broadcast("Message 2");
    const saved = h1.save();

    expect(saved.inputHistory).toContain("Message 1");
    expect(saved.inputHistory).toContain("Message 2");
  });

  it("saves and restores permissions", async () => {
    const h1 = new Harness(["A"]);
    // Manually add a permission entry
    h1.permissionManager.remember("bash", { command: "ls" }, "allow_always");
    h1.permissionManager.remember("readFile", { filePath: "secret.txt" }, "deny_always");
    const saved = h1.save();

    expect(saved.permissions).toHaveLength(2);

    const h2 = Harness.resume(saved.id);
    expect(h2.permissionManager.check("bash", { command: "ls" })).toBe("allow_always");
    expect(h2.permissionManager.check("readFile", { filePath: "secret.txt" })).toBe("deny_always");
  });

  it("restored session can continue conversation", async () => {
    (createProvider as any).mockImplementation(() => mockProvider("First response."));

    const h1 = new Harness(["A"]);
    await h1.broadcast("First message");
    const saved = h1.save();

    const h2 = Harness.resume(saved.id);

    (createProvider as any).mockImplementation(() => mockProvider("Second response."));
    await h2.broadcast("Second message");

    const aMsgs = h2.session.models[0].messages;
    const userMsgs = aMsgs.filter((m) => m.role === "user");
    expect(userMsgs).toHaveLength(2);
    expect(userMsgs[0].content).toBe("First message");
    expect(userMsgs[1].content).toBe("Second message");
  });
});
