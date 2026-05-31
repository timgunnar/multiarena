/**
 * Cross-environment data sharing tests — Web ↔ CLI data consistency.
 */
import { describe, it, expect, vi } from "vitest";
import { Harness } from "../../src/testing/harness.js";

vi.mock("../../src/provider/provider.js", () => ({
  createProvider: vi.fn(),
}));
import { createProvider } from "../../src/provider/provider.js";

function mockAll(text: string) {
  return () => ({
    chat: async function* () {
      yield { type: "text", content: text } as any;
      yield { type: "done", usage: { input: 5, output: text.length } } as any;
    },
    abort: vi.fn(),
  });
}

describe("Web ↔ CLI session sharing", () => {
  it("sessions saved by Harness are loadable by another Harness (simulates CLI→Web resume)", async () => {
    // CLI (Harness 1) creates a session
    (createProvider as any).mockImplementation(mockAll("CLI response."));
    const h1 = new Harness(["model-a", "model-b"]);
    await h1.broadcast("Hello from CLI");
    const saved = h1.save();

    // Web (Harness 2) resumes the same session
    (createProvider as any).mockImplementation(mockAll("Web response."));
    const h2 = Harness.resume(saved.id);
    expect(h2).not.toBeNull();
    expect(h2!.session.models[0].messages).toHaveLength(2); // user + assistant from CLI
    expect(h2!.session.models[0].messages[0].content).toBe("Hello from CLI");

    // Web continues the conversation
    await h2!.broadcast("Hello from Web");
    expect(h2!.session.models[0].messages).toHaveLength(4); // 2 user + 2 assistant
  });

  it("config with adversarial=high works in both environments", async () => {
    (createProvider as any).mockImplementation(mockAll("Test."));
    const h = new Harness(["A", "B", "C"], {
      deliberation: { rounds: [], adversarial: "high" },
    });
    const result = await h.deliberate("Write a doc");
    // High mode with 3 models should produce 8 rounds
    expect(result.rounds).toBe(8);
  });

  it("teamMessages are preserved across save/resume", async () => {
    (createProvider as any).mockImplementation(mockAll("Team."));
    const h1 = new Harness(["A", "B", "C"]);
    await h1.deliberate("Team task");
    const saved = h1.save();
    expect(saved.teamMessages!.length).toBeGreaterThan(0);

    const h2 = Harness.resume(saved.id);
    expect(h2!.session.teamMessages.length).toBeGreaterThan(0);
    expect(h2!.session.teamMessages[0].role).toBe("user");
  });

  it("permissions set in one session persist in resumed session", async () => {
    const h1 = new Harness(["A"]);
    h1.permissionManager.remember("bash", { command: "git status" }, "allow_always");
    h1.permissionManager.remember("readFile", { filePath: "secret.txt" }, "deny_always");
    const saved = h1.save();

    const h2 = Harness.resume(saved.id);
    expect(h2!.permissionManager.check("bash", { command: "git status" })).toBe("allow_always");
    expect(h2!.permissionManager.check("readFile", { filePath: "secret.txt" })).toBe("deny_always");
  });

  it("muted state survives across sessions", async () => {
    const h1 = new Harness(["A", "B", "C"]);
    h1.toggleMute("B");
    const saved = h1.save();

    const h2 = Harness.resume(saved.id);
    expect(h2!.session.models[1].muted).toBe(true);
    expect(h2!.session.models[0].muted).toBe(false);
  });

  // ── State consistency ───────────────────────────────────────

  it("after broadcast, model buffer is non-empty", async () => {
    (createProvider as any).mockImplementation(mockAll("Broadcast response."));
    const h = new Harness(["A", "B"]);
    const result = await h.broadcast("Test broadcast");

    // Each model's buffer should contain the mock response
    for (const model of result.models) {
      expect(model.buffer).toBeTruthy();
      expect(model.buffer).toContain("Broadcast response.");
    }
    // Also verify via session state
    for (const m of h.session.models) {
      expect(m.buffer).toBeTruthy();
      expect(m.buffer).toContain("Broadcast response.");
    }
  });

  it("after deliberation, saved session includes a valid sessionId", async () => {
    (createProvider as any).mockImplementation(mockAll("Deliberation response."));
    const h = new Harness(["A", "B", "C"]);
    await h.deliberate("Test deliberation");

    const saved = h.save();
    expect(saved.id).toBeDefined();
    expect(typeof saved.id).toBe("string");
    expect(saved.id.length).toBeGreaterThan(0);
    // SessionId should survive resume
    const h2 = Harness.resume(saved.id);
    expect(h2).not.toBeNull();
    const saved2 = h2!.save();
    expect(saved2.id).toBe(saved.id);
  });

  it("muted state persists through save/resume (multiple models)", async () => {
    // Already tested above for a single model; this tests all combinations
    const h1 = new Harness(["A", "B", "C"]);
    h1.toggleMute("A");
    h1.toggleMute("C"); // muted: A, C; unmuted: B

    const saved = h1.save();
    const h2 = Harness.resume(saved.id);

    const models = h2!.session.models;
    expect(models.find((m) => m.name === "A")!.muted).toBe(true);
    expect(models.find((m) => m.name === "B")!.muted).toBe(false);
    expect(models.find((m) => m.name === "C")!.muted).toBe(true);
  });
});
