import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runDeliberation,
  autoAssignRounds,
  roundLabel,
  assignPerspectives,
  PERSPECTIVE_POOL,
  type DeliberationProgress,
  type DeliberationRoundConfig,
  type Perspective,
} from "../../src/core/deliberation.js";
import type { ModelConfig } from "../../src/config/types.js";
import type { StreamEvent } from "../../src/provider/types.js";

// Helper: wrap a task string into sharedMessages for the new API
function sharedMsgs(task: string) {
  return [{ role: "user" as const, content: task }];
}

// Mock runTurn so we control the output of each round
vi.mock("../../src/core/turn.js", () => ({
  runTurn: vi.fn(),
}));

import { runTurn } from "../../src/core/turn.js";

beforeEach(() => {
  (runTurn as any).mockReset();
});

function makeModelConfig(overrides?: Partial<ModelConfig>): ModelConfig {
  return {
    provider: "openai",
    model: "gpt-4o",
    api_key: "sk-test",
    ...overrides,
  };
}

function mockTurnText(text: string) {
  return async function* () {
    for (const chunk of text) {
      yield { type: "text", content: chunk } as StreamEvent;
    }
    yield { type: "done", usage: { input: 10, output: text.length } } as StreamEvent;
  };
}

describe("autoAssignRounds", () => {
  it("mirror pattern ABCBA for 3 models", () => {
    const models: Record<string, ModelConfig> = {
      a: makeModelConfig(),
      b: makeModelConfig(),
      c: makeModelConfig(),
    };
    const rounds = autoAssignRounds(["a", "b", "c"], models);
    expect(rounds).toHaveLength(5);
    expect(rounds[0]).toMatchObject({ modelName: "a", role: "draft" });
    expect(rounds[1]).toMatchObject({ modelName: "b", role: "revise" });
    expect(rounds[2]).toMatchObject({ modelName: "c", role: "polish" });
    expect(rounds[3]).toMatchObject({ modelName: "b", role: "revise" });
    expect(rounds[4]).toMatchObject({ modelName: "a", role: "review" });
  });

  it("mirror pattern ABCDCBA for 4 models", () => {
    const models: Record<string, ModelConfig> = {
      a: makeModelConfig(),
      b: makeModelConfig(),
      c: makeModelConfig(),
      d: makeModelConfig(),
    };
    const rounds = autoAssignRounds(["a", "b", "c", "d"], models);
    expect(rounds).toHaveLength(7);
    expect(rounds[0]).toMatchObject({ modelName: "a", role: "draft" });
    expect(rounds[1]).toMatchObject({ modelName: "b", role: "revise" });
    expect(rounds[2]).toMatchObject({ modelName: "c", role: "polish" });
    expect(rounds[3]).toMatchObject({ modelName: "d", role: "review" });
    expect(rounds[4]).toMatchObject({ modelName: "c", role: "revise" });
    expect(rounds[5]).toMatchObject({ modelName: "b", role: "revise" });
    expect(rounds[6]).toMatchObject({ modelName: "a", role: "review" });
  });

  it("mirror pattern ABA for 2 models", () => {
    const models: Record<string, ModelConfig> = {
      a: makeModelConfig(),
      b: makeModelConfig(),
    };
    const rounds = autoAssignRounds(["a", "b"], models);
    expect(rounds).toHaveLength(3);
    expect(rounds[0]).toMatchObject({ modelName: "a", role: "draft" });
    expect(rounds[1]).toMatchObject({ modelName: "b", role: "revise" });
    expect(rounds[2]).toMatchObject({ modelName: "a", role: "review" });
  });

  it("filters missing model configs", () => {
    const models: Record<string, ModelConfig> = {
      a: makeModelConfig(),
      b: makeModelConfig(),
      c: makeModelConfig(),
      d: makeModelConfig(),
      e: makeModelConfig(),
    };
    // Only a,b,c,d have configs
    const rounds = autoAssignRounds(["a", "b", "c", "d", "e"], models);
    // 5 model names, all 5 have configs → forward 4, reverse middle 2, final a = 7
    expect(rounds).toHaveLength(7);
  });
});

describe("roundLabel", () => {
  it("returns Chinese label for each role", () => {
    expect(roundLabel("draft")).toBe("起草");
    expect(roundLabel("revise")).toBe("修订");
    expect(roundLabel("polish")).toBe("润色");
    expect(roundLabel("review")).toBe("终审");
  });
});

describe("runDeliberation", () => {
  it("yields round_start, text, round_end, done for each round", async () => {
    const mockRunTurn = runTurn as any;
    mockRunTurn.mockImplementation(() => mockTurnText("Round output.")());

    const roundConfigs: DeliberationRoundConfig[] = [
      { modelName: "a", role: "draft", config: makeModelConfig() },
      { modelName: "b", role: "revise", config: makeModelConfig() },
      { modelName: "c", role: "polish", config: makeModelConfig() },
    ];

    const events: DeliberationProgress[] = [];
    for await (const event of runDeliberation(sharedMsgs("Write a report"), roundConfigs)) {
      events.push(event);
    }

    // Should have: round_start + texts + round_end per round, plus final done
    expect(events.filter((e) => e.type === "round_start")).toHaveLength(3);
    expect(events.filter((e) => e.type === "round_end")).toHaveLength(3);
    expect(events.filter((e) => e.type === "done")).toHaveLength(1);
    expect(events.filter((e) => e.type === "text").length).toBeGreaterThan(0);

    // Round metadata
    expect(events[0]).toMatchObject({
      type: "round_start",
      round: 1,
      totalRounds: 3,
      modelName: "a",
      role: "draft",
    });

    // Final done event carries document
    const doneEvent = events[events.length - 1];
    expect(doneEvent.type).toBe("done");
    expect(doneEvent.document).toBeTruthy();
  });

  it("uses previous round output in subsequent rounds", async () => {
    const mockRunTurn = runTurn as any;

    // Each round now has 2 calls: think (private) + main (public).
    // Even indices = think outputs, odd indices = main round outputs.
    let callIdx = 0;
    const outputs = [
      "Think: plan draft.", "Draft v1.",
      "Think: review draft.", "Revised v2.",
      "Think: polish review.", "Polished v3.",
    ];
    mockRunTurn.mockImplementation(() => {
      const text = outputs[callIdx++]!;
      return mockTurnText(text)();
    });

    const roundConfigs: DeliberationRoundConfig[] = [
      { modelName: "a", role: "draft", config: makeModelConfig() },
      { modelName: "b", role: "revise", config: makeModelConfig() },
      { modelName: "c", role: "polish", config: makeModelConfig() },
    ];

    const events: DeliberationProgress[] = [];
    for await (const event of runDeliberation(sharedMsgs("Task"),roundConfigs)) {
      events.push(event);
    }

    // Check that each round_end has the correct accumulated document
    const roundEnds = events.filter((e) => e.type === "round_end");
    expect(roundEnds[0]?.document).toContain("Draft v1.");
    expect(roundEnds[1]?.document).toContain("Revised v2.");
    expect(roundEnds[2]?.document).toContain("Polished v3.");

    // Final document is the last round's output
    const done = events.find((e) => e.type === "done");
    expect(done?.document).toContain("Polished v3.");

    // Verify system prompts received the previous document
    const calls = mockRunTurn.mock.calls;
    expect(calls).toHaveLength(6); // think + main per round

    // Round 2 main (revise) at calls[3]: system prompt should include draft
    const reviseSysPrompt = calls[3]?.[0]?.systemPrompt ?? "";
    expect(reviseSysPrompt).toContain("Draft v1.");
    expect(reviseSysPrompt).toContain("修订");

    // Round 3 main (polish) at calls[5]: system prompt should include revised doc
    const polishSysPrompt = calls[5]?.[0]?.systemPrompt ?? "";
    expect(polishSysPrompt).toContain("Revised v2.");
    expect(polishSysPrompt).toContain("润色");
  });

  it("injects constraint document into all round prompts", async () => {
    const mockRunTurn = runTurn as any;
    mockRunTurn.mockImplementation(() => mockTurnText("Output.")());

    const roundConfigs: DeliberationRoundConfig[] = [
      { modelName: "a", role: "draft", config: makeModelConfig() },
      { modelName: "b", role: "revise", config: makeModelConfig() },
    ];

    const constraint = "必须使用中文。\n禁止使用英文缩写。";

    const events: DeliberationProgress[] = [];
    for await (const event of runDeliberation(sharedMsgs("Task"),roundConfigs, constraint)) {
      events.push(event);
    }

    const calls = mockRunTurn.mock.calls;
    // Draft prompt includes constraint
    expect(calls[0]?.[0]?.systemPrompt).toContain("必须使用中文");
    // Revise prompt also includes constraint
    expect(calls[1]?.[0]?.systemPrompt).toContain("必须使用中文");
  });

  it("handles provider error gracefully", async () => {
    const mockRunTurn = runTurn as any;
    mockRunTurn.mockImplementation(() => {
      return (async function* () {
        yield { type: "error", message: "API rate limited" } as StreamEvent;
      })();
    });

    const roundConfigs: DeliberationRoundConfig[] = [
      { modelName: "a", role: "draft", config: makeModelConfig() },
      { modelName: "b", role: "revise", config: makeModelConfig() },
    ];

    const events: DeliberationProgress[] = [];
    for await (const event of runDeliberation(sharedMsgs("Task"),roundConfigs)) {
      events.push(event);
    }

    // Provider error is captured as text in the round buffer, not as a
    // deliberation-level error. The round still completes (round_end) and
    // the next round proceeds with an error annotation in the document.
    const errorText = events.find(
      (e) => e.type === "text" && e.content?.includes("API rate limited"),
    );
    expect(errorText).toBeDefined();

    // Round 1 ends despite the error
    const round1End = events.find(
      (e) => e.type === "round_end" && e.round === 1,
    );
    expect(round1End).toBeDefined();
    expect(round1End?.document).toContain("API rate limited");

    // Deliberation continues to round 2
    const round2Start = events.find(
      (e) => e.type === "round_start" && e.round === 2,
    );
    expect(round2Start).toBeDefined();
  });

  it("halts on thrown exception (not provider error event)", async () => {
    const mockRunTurn = runTurn as any;
    mockRunTurn.mockImplementation(() => {
      throw new Error("Network failure");
    });

    const roundConfigs: DeliberationRoundConfig[] = [
      { modelName: "a", role: "draft", config: makeModelConfig() },
      { modelName: "b", role: "revise", config: makeModelConfig() },
    ];

    const events: DeliberationProgress[] = [];
    for await (const event of runDeliberation(sharedMsgs("Task"),roundConfigs)) {
      events.push(event);
    }

    // A thrown exception yields a deliberation-level error and stops the pipeline
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.error).toContain("Network failure");

    // No done event since pipeline was aborted
    expect(events.find((e) => e.type === "done")).toBeUndefined();
  });

  it("propagates round index correctly through all rounds", async () => {
    const mockRunTurn = runTurn as any;
    mockRunTurn.mockImplementation(() => mockTurnText("OK.")());

    const roundConfigs: DeliberationRoundConfig[] = [
      { modelName: "a", role: "draft", config: makeModelConfig() },
      { modelName: "b", role: "revise", config: makeModelConfig() },
      { modelName: "c", role: "polish", config: makeModelConfig() },
      { modelName: "d", role: "review", config: makeModelConfig() },
    ];

    const events: DeliberationProgress[] = [];
    for await (const event of runDeliberation(sharedMsgs("Task"),roundConfigs)) {
      events.push(event);
    }

    const starts = events.filter((e) => e.type === "round_start");
    expect(starts[0]).toMatchObject({ round: 1, role: "draft" });
    expect(starts[1]).toMatchObject({ round: 2, role: "revise" });
    expect(starts[2]).toMatchObject({ round: 3, role: "polish" });
    expect(starts[3]).toMatchObject({ round: 4, role: "review" });

    const done = events.find((e) => e.type === "done");
    expect(done).toMatchObject({ round: 4, totalRounds: 4 });
  });

  it("continue editing: second deliberation sees first deliberation output via sharedMessages", async () => {
    const mockRunTurn = runTurn as any;

    // Interleaved: think (even) + main (odd) per round.
    let callIdx = 0;
    const outputs = [
      "Think: plan.", "First draft.",
      "Think: review.", "First revise.",
      "Think: plan round 2.", "Second draft based on first.",
      "Think: review round 2.", "Second revise.",
    ];
    mockRunTurn.mockImplementation(() => {
      const text = outputs[callIdx++]!;
      return mockTurnText(text)();
    });

    const roundConfigs: DeliberationRoundConfig[] = [
      { modelName: "a", role: "draft", config: makeModelConfig() },
      { modelName: "b", role: "revise", config: makeModelConfig() },
    ];

    // First deliberation: shared messages start with just the user task
    const sharedMessages = sharedMsgs("Write a report");
    const events1: DeliberationProgress[] = [];
    for await (const event of runDeliberation(sharedMessages, roundConfigs)) {
      events1.push(event);
    }

    // After first deliberation, sharedMessages has:
    // [user: "Write a report", assistant: "First draft.", assistant: "First revise."]
    expect(sharedMessages).toHaveLength(3);
    expect(sharedMessages[1].content).toContain("First draft.");
    expect(sharedMessages[2].content).toContain("First revise.");

    const done1 = events1.find((e) => e.type === "done");
    expect(done1?.document).toContain("First revise.");

    // User sends a follow-up message
    sharedMessages.push({ role: "user", content: "Make it shorter" });

    // Second deliberation: same sharedMessages array
    const events2: DeliberationProgress[] = [];
    for await (const event of runDeliberation(sharedMessages, roundConfigs)) {
      events2.push(event);
    }

    // Second deliberation's draft round sees the follow-up task
    const calls = mockRunTurn.mock.calls;
    // calls layout: 0-3 = first deliberation (think+main × 2), 4-7 = second deliberation
    const secondDraftCall = calls[5]?.[0]; // main call for second deliberation round 1
    expect(secondDraftCall.messages).toHaveLength(5); // 4 shared + 1 round instruction
    expect(secondDraftCall.systemPrompt).toContain("Make it shorter"); // task from last user msg

    // First deliberation's output is in the shared context visible to second deliberation
    const contextContents = secondDraftCall.messages.map((m: any) => m.content).join(" ");
    expect(contextContents).toContain("First draft.");
    expect(contextContents).toContain("First revise.");
    expect(contextContents).toContain("Make it shorter");

    // Second deliberation produces new output
    expect(sharedMessages).toHaveLength(6); // 3 from first run + user follow-up + 2 new round outputs
    const done2 = events2.find((e) => e.type === "done");
    expect(done2?.document).toContain("Second revise.");
  });
});

// ── Adversarial deliberation ───────────────────────────────────

describe("assignPerspectives", () => {
  it("assigns unique perspectives when enough available", () => {
    const models = ["A", "B", "C"];
    const result = assignPerspectives(models);
    expect(Object.keys(result)).toHaveLength(3);
    const values = Object.values(result);
    expect(new Set(values).size).toBe(3);
  });

  it("wraps around when fewer perspectives than models", () => {
    const models = ["A", "B", "C", "D", "E", "F", "G", "H"]; // 8 models, 6 perspectives
    const result = assignPerspectives(models);
    expect(Object.keys(result)).toHaveLength(8);
    expect(result["A"]).toBe("skeptic");
    expect(result["F"]).toBe("synthesizer");
    // Wraps: 7th model gets skeptic again
    expect(result["G"]).toBe("skeptic");
    expect(result["H"]).toBe("pragmatist");
  });

  it("uses custom pool when provided", () => {
    const result = assignPerspectives(["X", "Y"], ["optimist", "skeptic"] as Perspective[]);
    expect(result["X"]).toBe("optimist");
    expect(result["Y"]).toBe("skeptic");
  });

  it("single model gets first perspective", () => {
    const result = assignPerspectives(["solo"]);
    expect(result["solo"]).toBe(PERSPECTIVE_POOL[0]);
  });
});

describe("autoAssignRounds adversarial", () => {
  const modelCfg: ModelConfig = { provider: "openai", model: "gpt-4o" };

  it("off/low/medium keep same round count (no change from default)", () => {
    const models: Record<string, ModelConfig> = { A: modelCfg, B: modelCfg, C: modelCfg };
    const off = autoAssignRounds(["A", "B", "C"], models, "off");
    const low = autoAssignRounds(["A", "B", "C"], models, "low");
    const med = autoAssignRounds(["A", "B", "C"], models, "medium");
    expect(off.length).toBe(low.length);
    expect(low.length).toBe(med.length);
    expect(off.length).toBe(5); // A(draft) B(revise) C(polish) B(revise) A(review)
  });

  it("high mode generates more reverse rounds than default", () => {
    const models: Record<string, ModelConfig> = { A: modelCfg, B: modelCfg, C: modelCfg };
    const result = autoAssignRounds(["A", "B", "C"], models, "high");
    // Forward: A(draft) B(revise) C(polish) = 3
    // Reverse with high: C(revise) C(polish) B(revise) B(polish) A(review) = 5
    // Total: 8 (vs 5 for off/low/medium)
    expect(result.length).toBeGreaterThan(6);
    expect(result.length).toBe(8);
    // Final round is always review by first model
    expect(result[result.length - 1].role).toBe("review");
    expect(result[result.length - 1].modelName).toBe("A");
    // Check reverse double: C and B both appear twice in reverse
    const reverseRoles = result.slice(3).map(r => r.role);
    const polishCount = reverseRoles.filter(r => r === "polish").length;
    expect(polishCount).toBe(2); // C and B each get a polish round
  });

  it("high mode works with 2 models (was broken — empty reverse loop)", () => {
    const models: Record<string, ModelConfig> = { A: modelCfg, B: modelCfg };
    const result = autoAssignRounds(["A", "B"], models, "high");
    // Forward: A(draft) B(revise) = 2
    // Reverse with high: B(revise) B(polish) A(review) = 3
    // Total: 5 (vs 3 for off/low/medium)
    expect(result.length).toBe(5);
    expect(result[result.length - 1].role).toBe("review");
    expect(result[result.length - 1].modelName).toBe("A");
  });
});

describe("runDeliberation adversarial modes", () => {
  const modelCfg: ModelConfig = { provider: "openai", model: "gpt-4o" };
  const mockConfig = { provider: "openai", model: "gpt-4o", api_key: "sk-test" } as ModelConfig;

  it("does not crash with adversarial=high + perspectives", async () => {
    // Mock runTurn to return simple text+done for both think and main
    (runTurn as any).mockImplementation(async function* () {
      yield { type: "text", content: "Mock output." } as StreamEvent;
      yield { type: "done", usage: { input: 1, output: 1 } } as StreamEvent;
    });

    const shared = sharedMsgs("Write a test document");
    const rounds = [
      { modelName: "A", role: "draft" as const, config: mockConfig },
      { modelName: "B", role: "revise" as const, config: mockConfig },
      { modelName: "C", role: "polish" as const, config: mockConfig },
      { modelName: "B", role: "revise" as const, config: mockConfig },
      { modelName: "A", role: "review" as const, config: mockConfig },
    ];
    const perspectives = { A: "skeptic", B: "optimist", C: "pragmatist" } as Record<string, Perspective>;

    const events: DeliberationProgress[] = [];
    for await (const event of runDeliberation(shared, rounds, undefined, undefined, "high", perspectives)) {
      events.push(event);
    }

    expect(events.some(e => e.type === "done")).toBe(true);
  });

  it("low adversarial does not change round count", async () => {
    (runTurn as any).mockImplementation(async function* () {
      yield { type: "text", content: "Mock." } as StreamEvent;
      yield { type: "done", usage: { input: 0, output: 0 } } as StreamEvent;
    });

    const shared = sharedMsgs("Test");
    const rounds = [
      { modelName: "A", role: "draft" as const, config: mockConfig },
      { modelName: "B", role: "revise" as const, config: mockConfig },
      { modelName: "A", role: "review" as const, config: mockConfig },
    ];

    const events: DeliberationProgress[] = [];
    for await (const event of runDeliberation(shared, rounds, undefined, undefined, "low")) {
      events.push(event);
    }

    const roundEndEvents = events.filter(e => e.type === "round_end");
    expect(roundEndEvents).toHaveLength(3);
    expect(events.some(e => e.type === "done")).toBe(true);
  });

  it("default off mode works with new parameters", async () => {
    (runTurn as any).mockImplementation(async function* () {
      yield { type: "text", content: "Default." } as StreamEvent;
      yield { type: "done", usage: { input: 0, output: 0 } } as StreamEvent;
    });

    const shared = sharedMsgs("Hello");
    const rounds = [
      { modelName: "A", role: "draft" as const, config: mockConfig },
      { modelName: "A", role: "review" as const, config: mockConfig },
    ];

    const events: DeliberationProgress[] = [];
    // No adversarial args — should default to off
    for await (const event of runDeliberation(shared, rounds)) {
      events.push(event);
    }

    expect(events.some(e => e.type === "done")).toBe(true);
  });
});
