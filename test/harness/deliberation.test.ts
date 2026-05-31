/**
 * E2E tests: Team deliberation — adversarial levels, round counts, perspectives.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Harness } from "../../src/testing/harness.js";

vi.mock("../../src/provider/provider.js", () => ({
  createProvider: vi.fn(),
}));

import { createProvider } from "../../src/provider/provider.js";

beforeEach(() => {
  (createProvider as any).mockReset();
});

function mockProvider(text = "Mock deliberation output.") {
  return {
    chat: async function* () {
      yield { type: "text", content: text } as any;
      yield { type: "done", usage: { input: 5, output: text.length } } as any;
    },
    abort: vi.fn(),
  };
}

describe("Harness deliberation", () => {
  it("completes a basic deliberation with correct round count", async () => {
    (createProvider as any).mockImplementation(() => mockProvider("Output."));

    const h = new Harness(["A", "B", "C"]);
    const result = await h.deliberate("Write a document");

    expect(result.document).toContain("Output.");
    // 3 models, off mode: A(draft) B(revise) C(polish) B(revise) A(review) = 5 rounds
    expect(result.rounds).toBe(5);
    expect(result.roundDetails[0].role).toBe("draft");
    expect(result.roundDetails[result.rounds - 1].role).toBe("review");
  });

  it("2-model deliberation works correctly", async () => {
    (createProvider as any).mockImplementation(() => mockProvider("Output."));

    const h = new Harness(["A", "B"]);
    const result = await h.deliberate("Write");

    // 2 models: A(draft) B(revise) A(review) = 3 rounds
    expect(result.rounds).toBe(3);
    expect(result.teamMessages.length).toBeGreaterThan(0);
  });

  it("adversarial=off produces standard round count", async () => {
    (createProvider as any).mockImplementation(() => mockProvider("Output."));

    const h = new Harness(["A", "B", "C"]);
    const result = await h.deliberate("Task", { adversarial: "off" });
    expect(result.rounds).toBe(5); // standard mirror for 3 models
  });

  it("adversarial=low produces standard round count (prompt change only)", async () => {
    (createProvider as any).mockImplementation(() => mockProvider("Output."));

    const h = new Harness(["A", "B", "C"]);
    const result = await h.deliberate("Task", { adversarial: "low" });
    expect(result.rounds).toBe(5); // same count, only prompt differs
  });

  it("adversarial=medium produces standard round count (prompt change only)", async () => {
    (createProvider as any).mockImplementation(() => mockProvider("Output."));

    const h = new Harness(["A", "B", "C"]);
    const result = await h.deliberate("Task", { adversarial: "medium" });
    expect(result.rounds).toBe(5); // same count, only prompt differs
  });

  it("adversarial=high produces more rounds for 3 models", async () => {
    (createProvider as any).mockImplementation(() => mockProvider("Output."));

    const h = new Harness(["A", "B", "C"]);
    const result = await h.deliberate("Task", { adversarial: "high" });

    // 3 models high: A(draft) B(revise) C(polish) C(revise) C(polish) B(revise) B(polish) A(review) = 8
    expect(result.rounds).toBeGreaterThan(5);
    expect(result.rounds).toBe(8);
  });

  it("adversarial=high produces extra rounds for 2 models", async () => {
    (createProvider as any).mockImplementation(() => mockProvider("Output."));

    const h = new Harness(["A", "B"]);
    const result = await h.deliberate("Task", { adversarial: "high" });

    // 2 models high: A(draft) B(revise) B(revise) B(polish) A(review) = 5
    // vs off: A(draft) B(revise) A(review) = 3
    expect(result.rounds).toBe(5);
  });

  it("adversarial config from options takes precedence over config file", async () => {
    (createProvider as any).mockImplementation(() => mockProvider("Output."));

    // Create harness with config that says adversarial=off
    const h = new Harness(["A", "B", "C"], {
      deliberation: { rounds: [], adversarial: "off" },
    });

    // Override via explicit option → should be high
    const result = await h.deliberate("Task", { adversarial: "high" });
    expect(result.rounds).toBe(8);
  });

  it("setAdversarial() affects the next deliberation", async () => {
    (createProvider as any).mockImplementation(() => mockProvider("Output."));

    const h = new Harness(["A", "B", "C"]);
    h.setAdversarial("high");
    const result = await h.deliberate("Task");
    expect(result.rounds).toBe(8);
  });

  it("strips -a flag from prompt text", async () => {
    (createProvider as any).mockImplementation(() => mockProvider("Output."));

    const h = new Harness(["A", "B", "C"]);
    await h.deliberate("Write about X -a high");

    // The teamMessages should NOT contain -a high
    const userMsgs = h.session.teamMessages.filter((m) => m.role === "user");
    expect(userMsgs.some((m) => m.content.includes("-a high"))).toBe(false);
    expect(userMsgs.some((m) => m.content.includes("Write about X"))).toBe(true);
  });

  it("teamMessages contains full deliberation history", async () => {
    (createProvider as any).mockImplementation(() => mockProvider("Deliberation round output."));

    const h = new Harness(["A", "B", "C"]);
    const result = await h.deliberate("My task");

    expect(result.teamMessages.length).toBeGreaterThan(0);
    // Should have user message + assistant outputs for each round
    const userMsgs = result.teamMessages.filter((m) => m.role === "user");
    const asstMsgs = result.teamMessages.filter((m) => m.role === "assistant");
    expect(userMsgs).toHaveLength(1);
    expect(asstMsgs).toHaveLength(result.rounds);
  });
});
