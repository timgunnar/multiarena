import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runDeliberation,
  autoAssignRounds,
  roundLabel,
  type DeliberationProgress,
  type DeliberationRoundConfig,
} from "../../src/core/deliberation.js";
import type { ModelConfig } from "../../src/config/types.js";
import type { StreamEvent } from "../../src/provider/types.js";

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
  it("assigns draft/revise/polish for 3 models", () => {
    const models: Record<string, ModelConfig> = {
      a: makeModelConfig(),
      b: makeModelConfig(),
      c: makeModelConfig(),
    };
    const rounds = autoAssignRounds(["a", "b", "c"], models);
    expect(rounds).toHaveLength(3);
    expect(rounds[0]).toMatchObject({ modelName: "a", role: "draft" });
    expect(rounds[1]).toMatchObject({ modelName: "b", role: "revise" });
    expect(rounds[2]).toMatchObject({ modelName: "c", role: "polish" });
  });

  it("adds review role for 4+ models", () => {
    const models: Record<string, ModelConfig> = {
      a: makeModelConfig(),
      b: makeModelConfig(),
      c: makeModelConfig(),
      d: makeModelConfig(),
    };
    const rounds = autoAssignRounds(["a", "b", "c", "d"], models);
    expect(rounds).toHaveLength(4);
    expect(rounds[0]).toMatchObject({ modelName: "a", role: "draft" });
    expect(rounds[1]).toMatchObject({ modelName: "b", role: "revise" });
    expect(rounds[2]).toMatchObject({ modelName: "c", role: "polish" });
    expect(rounds[3]).toMatchObject({ modelName: "d", role: "review" });
  });

  it("works with 2 models (draft + revise only)", () => {
    const models: Record<string, ModelConfig> = {
      a: makeModelConfig(),
      b: makeModelConfig(),
    };
    const rounds = autoAssignRounds(["a", "b"], models);
    expect(rounds).toHaveLength(2);
    expect(rounds[0]).toMatchObject({ modelName: "a", role: "draft" });
    expect(rounds[1]).toMatchObject({ modelName: "b", role: "revise" });
  });

  it("uses only first N models where N = role count", () => {
    const models: Record<string, ModelConfig> = {
      a: makeModelConfig(),
      b: makeModelConfig(),
      c: makeModelConfig(),
      d: makeModelConfig(),
      e: makeModelConfig(),
    };
    const rounds = autoAssignRounds(["a", "b", "c", "d", "e"], models);
    expect(rounds).toHaveLength(4); // max 4 roles
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
    for await (const event of runDeliberation("Write a report", roundConfigs)) {
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

    // Return different output per round
    let roundIdx = 0;
    const outputs = ["Draft v1.", "Revised v2.", "Polished v3."];
    mockRunTurn.mockImplementation(() => {
      const text = outputs[roundIdx++]!;
      return mockTurnText(text)();
    });

    const roundConfigs: DeliberationRoundConfig[] = [
      { modelName: "a", role: "draft", config: makeModelConfig() },
      { modelName: "b", role: "revise", config: makeModelConfig() },
      { modelName: "c", role: "polish", config: makeModelConfig() },
    ];

    const events: DeliberationProgress[] = [];
    for await (const event of runDeliberation("Task", roundConfigs)) {
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
    // Round 2 (revise) should have received round 1's output
    const calls = mockRunTurn.mock.calls;
    expect(calls).toHaveLength(3);

    // Round 2 (revise): system prompt should include draft
    const reviseSysPrompt = calls[1]?.[0]?.systemPrompt ?? "";
    expect(reviseSysPrompt).toContain("Draft v1.");
    expect(reviseSysPrompt).toContain("修订");

    // Round 3 (polish): system prompt should include revised doc
    const polishSysPrompt = calls[2]?.[0]?.systemPrompt ?? "";
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
    for await (const event of runDeliberation("Task", roundConfigs, constraint)) {
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
    for await (const event of runDeliberation("Task", roundConfigs)) {
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
    for await (const event of runDeliberation("Task", roundConfigs)) {
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
    for await (const event of runDeliberation("Task", roundConfigs)) {
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
});
