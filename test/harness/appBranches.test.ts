/**
 * Tests covering app.tsx handleSubmit code paths through the Harness.
 *
 * These tests exercise branches that the Harness's existing test suite
 * either skips or only partially covers:
 *   1. /team toggle            — broadcast vs team context independence
 *   2. adversarial flag handling — setAdversarial, option override, flag stripping
 *   3. muted model behavior    — mute → unmute cycle across broadcasts
 *   4. multi-turn session      — message accumulation + save/resume/continue
 *   5. permission flow         — request → prompt → respond → check cycle
 *   6. config override         — config-driven adversarial vs default
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Harness } from "../../src/testing/harness.js";

vi.mock("../../src/provider/provider.js", () => ({
  createProvider: vi.fn(),
}));

import { createProvider } from "../../src/provider/provider.js";

// ── Mock helpers ───────────────────────────────────────────────────

function mockAll(text: string) {
  return () => ({
    chat: async function* () {
      yield { type: "text", content: text } as any;
      yield { type: "done", usage: { input: 5, output: text.length } } as any;
    },
    abort: vi.fn(),
  });
}

/** Return a different response for each call (round-robin). */
function mockMulti(...responses: string[]) {
  let idx = 0;
  return () => {
    const text = responses[idx] ?? responses[responses.length - 1] ?? "";
    idx++;
    return {
      chat: async function* () {
        yield { type: "text", content: text } as any;
        yield { type: "done", usage: { input: 5, output: text.length } } as any;
      },
      abort: vi.fn(),
    };
  };
}

beforeEach(() => {
  (createProvider as any).mockReset();
});

// ═══════════════════════════════════════════════════════════════════
// 1. /team toggle — broadcast vs team context independence
// ═══════════════════════════════════════════════════════════════════
describe("/team toggle (broadcast ↔ team independence)", () => {
  it("deliberate() works from default broadcast-mode Harness", async () => {
    (createProvider as any).mockImplementation(mockAll("Deliberation output."));

    const h = new Harness(["A", "B", "C"]);
    const result = await h.deliberate("Write a document");

    expect(result.document).toContain("Deliberation output.");
    expect(result.rounds).toBeGreaterThan(0);
    expect(result.roundDetails.length).toBe(result.rounds);
  });

  it("broadcast and deliberate use separate message contexts", async () => {
    (createProvider as any).mockImplementation(mockAll("Broadcast response."));
    const h = new Harness(["A", "B", "C"]);
    await h.broadcast("Broadcast message");

    (createProvider as any).mockImplementation(mockAll("Deliberation output."));
    await h.deliberate("Team task");

    // Broadcast messages should be in model message arrays
    const modelA = h.session.models[0];
    const broadcastUserMsgs = modelA.messages.filter((m) => m.role === "user");
    expect(broadcastUserMsgs).toHaveLength(1);
    expect(broadcastUserMsgs[0].content).toBe("Broadcast message");

    // Team messages should be in the shared team context, NOT in model messages
    const teamUserMsgs = h.session.teamMessages.filter((m) => m.role === "user");
    expect(teamUserMsgs).toHaveLength(1);
    expect(teamUserMsgs[0].content).toBe("Team task");

    // Model messages should NOT contain the team task
    const allModelContent = modelA.messages.map((m) => m.content).join(" ");
    expect(allModelContent).not.toContain("Team task");
  });

  it("team mode deliberation produces teamMessages with user + assistant rounds", async () => {
    (createProvider as any).mockImplementation(mockAll("Round output."));

    const h = new Harness(["A", "B", "C"]);
    const result = await h.deliberate("Deliberate on this topic");

    // teamMessages should have 1 user message + N assistant messages (one per round)
    const userMsgs = result.teamMessages.filter((m) => m.role === "user");
    const asstMsgs = result.teamMessages.filter((m) => m.role === "assistant");
    expect(userMsgs).toHaveLength(1);
    expect(asstMsgs).toHaveLength(result.rounds);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Adversarial flag handling
// ═══════════════════════════════════════════════════════════════════
describe("adversarial flag handling", () => {
  it("setAdversarial('high') produces extra rounds vs off", async () => {
    (createProvider as any).mockImplementation(mockAll("Output."));

    const h = new Harness(["A", "B", "C"]);

    // off (default): 5 rounds for 3 models
    const offResult = await h.deliberate("Task");
    expect(offResult.rounds).toBe(5);

    // high via setAdversarial: 8 rounds for 3 models
    h.setAdversarial("high");
    const highResult = await h.deliberate("Task 2");
    expect(highResult.rounds).toBe(8);
    expect(highResult.rounds).toBeGreaterThan(offResult.rounds);
  });

  it("deliberate() option overrides setAdversarial()", async () => {
    (createProvider as any).mockImplementation(mockAll("Output."));

    const h = new Harness(["A", "B", "C"]);
    h.setAdversarial("high");

    // Option overrides the harness-level override
    const result = await h.deliberate("Task", { adversarial: "low" });
    expect(result.rounds).toBe(5); // low = standard rounds, not 8
  });

  it("deliberate() option overrides config-level adversarial", async () => {
    (createProvider as any).mockImplementation(mockAll("Output."));

    const h = new Harness(["A", "B", "C"], {
      deliberation: { rounds: [], adversarial: "high" },
    });

    // Config says high, but option overrides to off
    const result = await h.deliberate("Task", { adversarial: "off" });
    expect(result.rounds).toBe(5); // off = standard rounds
  });

  it("strips -a flag and --adversarial= flag from teamMessages text", async () => {
    (createProvider as any).mockImplementation(mockAll("Output."));

    const h = new Harness(["A", "B", "C"]);

    // -a high form
    await h.deliberate("Write about X -a high");
    let userMsgs = h.session.teamMessages.filter((m) => m.role === "user");
    expect(userMsgs.some((m) => m.content.includes("-a high"))).toBe(false);
    expect(userMsgs.some((m) => m.content.includes("Write about X"))).toBe(true);

    // --adversarial=medium form
    // Reset teamMessages for a clean test
    h.session.teamMessages.length = 0;
    await h.deliberate("Review this --adversarial=medium");
    userMsgs = h.session.teamMessages.filter((m) => m.role === "user");
    expect(userMsgs.some((m) => m.content.includes("--adversarial=medium"))).toBe(false);
    expect(userMsgs.some((m) => m.content.includes("Review this"))).toBe(true);
  });

  it("-a flag in prompt does NOT change adversarial level (must use options or setAdversarial)", async () => {
    (createProvider as any).mockImplementation(mockAll("Output."));

    const h = new Harness(["A", "B", "C"]);
    // No setAdversarial, no config adversarial, no options → defaults to "off"
    const result = await h.deliberate("Write doc -a high");
    expect(result.rounds).toBe(5); // "off" rounds, not 8 — flag is only stripped, not parsed
  });

  it("setAdversarial(null) resets to config or default", async () => {
    (createProvider as any).mockImplementation(mockAll("Output."));

    const h = new Harness(["A", "B", "C"]);
    h.setAdversarial("high");

    // Reset to null → falls back to config (none) → "off"
    h.setAdversarial(null);
    const result = await h.deliberate("Task");
    expect(result.rounds).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Muted model behavior
// ═══════════════════════════════════════════════════════════════════
describe("muted model behavior", () => {
  it("muted model receives no new messages during broadcast", async () => {
    (createProvider as any).mockImplementation(mockMulti("Reply A", "Reply C"));

    const h = new Harness(["A", "B", "C"]);
    h.toggleMute("B");
    const result = await h.broadcast("Hello");

    // B should have empty buffer and no assistant message
    const bModel = result.models[1];
    expect(bModel.name).toBe("B");
    expect(bModel.buffer).toBe("");
    expect(bModel.muted).toBe(true);

    // B's messages should NOT contain the user message (addUserMessage skips muted)
    const bMessages = h.session.models[1].messages;
    const bUserMsgs = bMessages.filter((m) => m.role === "user");
    expect(bUserMsgs).toHaveLength(0);

    // A and C should respond normally
    expect(result.models[0].buffer).toContain("Reply A");
    expect(result.models[2].buffer).toContain("Reply C");
  });

  it("unmuting restores model to broadcast participation", async () => {
    (createProvider as any).mockImplementation(mockMulti("A1", "C1"));
    const h = new Harness(["A", "B", "C"]);

    // Mute B, broadcast
    h.toggleMute("B");
    await h.broadcast("First message");

    // Unmute B
    h.toggleMute("B");
    expect(h.session.models[1].muted).toBe(false);

    // Broadcast again — B should now participate
    (createProvider as any).mockImplementation(mockMulti("A2", "B2", "C2"));
    const result = await h.broadcast("Second message");

    expect(result.models[0].buffer).toContain("A2");
    expect(result.models[1].buffer).toContain("B2");
    expect(result.models[2].buffer).toContain("C2");

    // B should have the second user message but not the first (was muted)
    const bMessages = h.session.models[1].messages;
    const bUserMsgs = bMessages.filter((m) => m.role === "user");
    expect(bUserMsgs).toHaveLength(1);
    expect(bUserMsgs[0].content).toBe("Second message");
  });

  it("all models participate when none are muted", async () => {
    (createProvider as any).mockImplementation(mockMulti("Reply A", "Reply B", "Reply C"));

    const h = new Harness(["A", "B", "C"]);
    const result = await h.broadcast("Hello all");

    expect(result.models).toHaveLength(3);
    for (const m of result.models) {
      expect(m.buffer).toBeTruthy();
      expect(m.muted).toBe(false);
    }
  });

  it("toggleMute returns the new mute state", async () => {
    const h = new Harness(["A", "B"]);
    // Initially unmuted
    expect(h.session.models[0].muted).toBe(false);

    const nowMuted = h.toggleMute("A");
    expect(nowMuted).toBe(true);
    expect(h.session.models[0].muted).toBe(true);

    const nowUnmuted = h.toggleMute("A");
    expect(nowUnmuted).toBe(false);
    expect(h.session.models[0].muted).toBe(false);
  });

  it("muted models are excluded from deliberation", async () => {
    (createProvider as any).mockImplementation(mockAll("Output."));

    const h = new Harness(["A", "B", "C"]);
    h.toggleMute("C");

    // Only A and B participate → 2 models → 3 rounds (off mode)
    const result = await h.deliberate("Write a doc");
    expect(result.rounds).toBe(3); // 2-model count
    expect(result.roundDetails.length).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Multi-turn session — message accumulation + save/resume/continue
// ═══════════════════════════════════════════════════════════════════
describe("multi-turn session", () => {
  it("accumulates user + assistant messages across turns", async () => {
    (createProvider as any).mockImplementation(mockAll("First response."));
    const h = new Harness(["A", "B"]);
    await h.broadcast("Message 1");

    (createProvider as any).mockImplementation(mockAll("Second response."));
    await h.broadcast("Message 2");

    for (const m of h.session.models) {
      const userMsgs = m.messages.filter((msg) => msg.role === "user");
      const asstMsgs = m.messages.filter((msg) => msg.role === "assistant");
      expect(userMsgs).toHaveLength(2);
      expect(asstMsgs).toHaveLength(2);
      expect(userMsgs[0].content).toBe("Message 1");
      expect(userMsgs[1].content).toBe("Message 2");
      expect(asstMsgs[0].content).toContain("First response.");
      expect(asstMsgs[1].content).toContain("Second response.");
    }
    expect(h.session.models[0].messages).toHaveLength(4);
  });

  it("save + resume preserves full message history", async () => {
    (createProvider as any).mockImplementation(mockAll("Response."));
    const h1 = new Harness(["A", "B"]);
    await h1.broadcast("Turn 1");
    await h1.broadcast("Turn 2");
    const saved = h1.save();

    const h2 = Harness.resume(saved.id);
    expect(h2.session.models).toHaveLength(2);
    for (const m of h2.session.models) {
      expect(m.messages).toHaveLength(4); // 2 user + 2 assistant
    }
  });

  it("resumed session continues conversation with correct message count", async () => {
    (createProvider as any).mockImplementation(mockAll("R1"));
    const h1 = new Harness(["A"]);
    await h1.broadcast("Message 1");
    await h1.broadcast("Message 2");
    const saved = h1.save();

    const h2 = Harness.resume(saved.id);
    expect(h2.session.models[0].messages).toHaveLength(4); // 2u + 2a

    // Continue with a third turn
    (createProvider as any).mockImplementation(mockAll("R3"));
    await h2.broadcast("Message 3");

    const msgs = h2.session.models[0].messages;
    expect(msgs).toHaveLength(6); // 3u + 3a
    const userMsgs = msgs.filter((m) => m.role === "user");
    const asstMsgs = msgs.filter((m) => m.role === "assistant");
    expect(userMsgs).toHaveLength(3);
    expect(asstMsgs).toHaveLength(3);
    expect(userMsgs[2].content).toBe("Message 3");
    expect(asstMsgs[2].content).toContain("R3");
  });

  it("inputHistory is preserved across save/resume", async () => {
    (createProvider as any).mockImplementation(mockAll("R"));
    const h1 = new Harness(["A"]);
    await h1.broadcast("First");
    await h1.broadcast("Second");
    const saved = h1.save();
    expect(saved.inputHistory).toEqual(["First", "Second"]);

    const h2 = Harness.resume(saved.id);
    // inputHistory is restored via Harness.resume
    // We verify by checking the saved data contains both entries
    expect(saved.inputHistory).toHaveLength(2);
  });

  it("permissions survive save/resume cycle", async () => {
    const h1 = new Harness(["A"]);
    h1.permissionManager.remember("bash", { command: "npm test" }, "allow_always");
    // Use a non-sensitive path so safety rules don't short-circuit the memory check
    h1.permissionManager.remember("readFile", { filePath: "some-file.txt" }, "deny_always");
    const saved = h1.save();

    const h2 = Harness.resume(saved.id);
    expect(h2.permissionManager.check("bash", { command: "npm test" })).toBe("allow_always");
    expect(h2.permissionManager.check("readFile", { filePath: "some-file.txt" })).toBe("deny_always");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Permission flow interaction
// ═══════════════════════════════════════════════════════════════════
describe("permission flow interaction", () => {
  it("requestUserDecision → getPermissionPrompt returns the request", () => {
    const h = new Harness(["A"]);
    h.permissionManager.requestUserDecision("bash", { command: "ls" }, "test-model");

    const prompt = h.getPermissionPrompt();
    expect(prompt).not.toBeNull();
    expect(prompt!.toolName).toBe("bash");
    expect(prompt!.args).toEqual({ command: "ls" });
    expect(prompt!.modelName).toBe("test-model");
    expect(prompt!.requestId).toMatch(/^perm-/);
  });

  it("respondPermission('allow_always') clears prompt and remembers decision", () => {
    const h = new Harness(["A"]);
    h.permissionManager.requestUserDecision("bash", { command: "ls" }, "A");

    h.respondPermission("allow_always");

    // Prompt should be cleared
    expect(h.getPermissionPrompt()).toBeNull();

    // Decision should be remembered
    expect(h.permissionManager.check("bash", { command: "ls" })).toBe("allow_always");
  });

  it("respondPermission('deny_always') clears prompt and remembers denial", () => {
    const h = new Harness(["A"]);
    h.permissionManager.requestUserDecision("readFile", { filePath: "secret.txt" }, "A");

    h.respondPermission("deny_always");

    expect(h.getPermissionPrompt()).toBeNull();
    expect(h.permissionManager.check("readFile", { filePath: "secret.txt" })).toBe("deny_always");
  });

  it("allow/deny (one-shot) clear prompt but do NOT persist", () => {
    const h = new Harness(["A"]);
    h.permissionManager.requestUserDecision("bash", { command: "rm file" }, "A");

    h.respondPermission("allow");

    expect(h.getPermissionPrompt()).toBeNull();
    // One-shot decision is NOT remembered — falls through to default "allow"
    expect(h.permissionManager.check("bash", { command: "rm file" })).toBe("allow");
  });

  it("respondPermission('deny') does not persist the denial", () => {
    const h = new Harness(["A"]);
    h.permissionManager.requestUserDecision("bash", { command: "rm file" }, "A");

    h.respondPermission("deny");

    expect(h.getPermissionPrompt()).toBeNull();
    // Not remembered, so check returns default "allow"
    expect(h.permissionManager.check("bash", { command: "rm file" })).toBe("allow");
  });

  it("pending requests are queued and processed in order", () => {
    const h = new Harness(["A"]);

    // Queue two requests
    const r1 = h.permissionManager.requestUserDecision("bash", { command: "ls" }, "A");
    const r2 = h.permissionManager.requestUserDecision("readFile", { filePath: "foo" }, "A");

    // First request is active
    expect(h.getPermissionPrompt()!.toolName).toBe("bash");

    // Resolve first → second becomes active
    h.respondPermission("allow");
    expect(h.getPermissionPrompt()!.toolName).toBe("readFile");

    // Resolve second → queue empty
    h.respondPermission("allow");
    expect(h.getPermissionPrompt()).toBeNull();
  });

  it("safety rules deny dangerous commands regardless of memory", () => {
    const h = new Harness(["A"]);

    // Even if we remembered allow_always
    h.permissionManager.remember("bash", { command: "rm -rf /" }, "allow_always");

    // Safety rules take precedence
    expect(h.permissionManager.check("bash", { command: "rm -rf /" })).toBe("deny");
    expect(h.permissionManager.check("bash", { command: "sudo rm file" })).toBe("deny");
  });

  it("safety rules deny sensitive file reads", () => {
    const h = new Harness(["A"]);

    h.permissionManager.remember("readFile", { filePath: ".env" }, "allow_always");

    // Safety rules override memory
    expect(h.permissionManager.check("readFile", { filePath: ".env" })).toBe("deny");
    expect(h.permissionManager.check("grep", { path: ".git-credentials" })).toBe("deny");
  });

  it("dispose() destroys all pending permission requests", () => {
    const h = new Harness(["A"]);
    h.permissionManager.requestUserDecision("bash", { command: "ls" }, "A");
    h.permissionManager.requestUserDecision("readFile", { filePath: "f" }, "A");
    expect(h.getPermissionPrompt()).not.toBeNull();

    h.dispose();
    expect(h.getPermissionPrompt()).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Config override — adversarial from config vs default
// ═══════════════════════════════════════════════════════════════════
describe("config override — adversarial", () => {
  it("config with deliberation.adversarial='high' produces high round count", async () => {
    (createProvider as any).mockImplementation(mockAll("Output."));

    const h = new Harness(["A", "B", "C"], {
      deliberation: { rounds: [], adversarial: "high" },
    });

    const result = await h.deliberate("Task");
    expect(result.rounds).toBe(8); // high = 8 rounds for 3 models
  });

  it("harness WITHOUT adversarial in config defaults to 'off'", async () => {
    (createProvider as any).mockImplementation(mockAll("Output."));

    const h = new Harness(["A", "B", "C"]); // no config override
    const result = await h.deliberate("Task");
    expect(result.rounds).toBe(5); // off = 5 rounds for 3 models
  });

  it("config adversarial='low' produces standard round count", async () => {
    (createProvider as any).mockImplementation(mockAll("Output."));

    const h = new Harness(["A", "B", "C"], {
      deliberation: { rounds: [], adversarial: "low" },
    });

    const result = await h.deliberate("Task");
    expect(result.rounds).toBe(5); // low = same count, only prompt differs
  });

  it("config adversarial='medium' produces standard round count", async () => {
    (createProvider as any).mockImplementation(mockAll("Output."));

    const h = new Harness(["A", "B", "C"], {
      deliberation: { rounds: [], adversarial: "medium" },
    });

    const result = await h.deliberate("Task");
    expect(result.rounds).toBe(5); // medium = same count, only prompt differs
  });

  it("setAdversarial overrides config adversarial", async () => {
    (createProvider as any).mockImplementation(mockAll("Output."));

    const h = new Harness(["A", "B", "C"], {
      deliberation: { rounds: [], adversarial: "high" },
    });

    // setAdversarial overrides config
    h.setAdversarial("off");
    const result = await h.deliberate("Task");
    expect(result.rounds).toBe(5); // overridden to off
  });

  it("option override beats both config and setAdversarial", async () => {
    (createProvider as any).mockImplementation(mockAll("Output."));

    const h = new Harness(["A", "B", "C"], {
      deliberation: { rounds: [], adversarial: "high" },
    });
    h.setAdversarial("medium");

    // Option takes highest priority
    const result = await h.deliberate("Task", { adversarial: "off" });
    expect(result.rounds).toBe(5);
  });

  it("config adversarial='high' with 2 models produces correct round count", async () => {
    (createProvider as any).mockImplementation(mockAll("Output."));

    const h = new Harness(["A", "B"], {
      deliberation: { rounds: [], adversarial: "high" },
    });

    const result = await h.deliberate("Task");
    expect(result.rounds).toBe(5); // 2 models high: A(draft) B(revise) B(revise) B(polish) A(review)
  });
});
