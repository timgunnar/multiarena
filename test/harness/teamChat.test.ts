/**
 * E2E tests: team-directed chat — sending messages to a specific model in team context.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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

beforeEach(() => {
  (createProvider as any).mockReset();
});

describe("Harness teamChat", () => {
  it("returns buffer containing the model's response", async () => {
    (createProvider as any).mockImplementation(mockAll("Hello! How can I assist with your code?"));

    const h = new Harness(["model-a", "model-b"]);
    const result = await h.teamChat("model-a", "hello");

    expect(result.buffer).toContain("How can I assist");
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("stores user and assistant messages in teamMessages", async () => {
    (createProvider as any).mockImplementation(
      mockAll("I recommend using TypeScript for this project."),
    );

    const h = new Harness(["model-a"]);
    const result = await h.teamChat("model-a", "What language should we use?");

    // teamMessages should have both user and assistant entries
    expect(result.teamMessages).toHaveLength(2);
    expect(result.teamMessages[0]).toEqual({
      role: "user",
      content: "What language should we use?",
    });
    expect(result.teamMessages[1].role).toBe("assistant");
    expect(result.teamMessages[1].content).toContain("TypeScript");
  });

  it("preserves previous messages across multi-turn team chat", async () => {
    (createProvider as any).mockImplementation(
      mockAll("First, let's set up the project structure."),
    );

    const h = new Harness(["model-a"]);
    const firstResult = await h.teamChat("model-a", "How do I start?");

    expect(firstResult.teamMessages).toHaveLength(2);
    expect(firstResult.teamMessages[0].content).toBe("How do I start?");

    // Second turn
    (createProvider as any).mockImplementation(
      mockAll("Next, add a tsconfig.json with strict mode enabled."),
    );

    const secondResult = await h.teamChat("model-a", "What next?");

    // teamMessages should now have 4 entries: user1, asst1, user2, asst2
    expect(secondResult.teamMessages).toHaveLength(4);
    expect(secondResult.teamMessages[0].content).toBe("How do I start?");
    expect(secondResult.teamMessages[1].content).toContain("set up the project structure");
    expect(secondResult.teamMessages[2].content).toBe("What next?");
    expect(secondResult.teamMessages[3].content).toContain("tsconfig.json");
  });

  it("throws when model name is not found", async () => {
    (createProvider as any).mockImplementation(mockAll("irrelevant"));

    const h = new Harness(["model-a"]);
    await expect(h.teamChat("nonexistent-model", "hello")).rejects.toThrow(
      "Model nonexistent-model not found",
    );
  });

  it("tracks token usage for team chat turn", async () => {
    (createProvider as any).mockImplementation(mockAll("Token usage test response."));

    const h = new Harness(["model-a"]);
    await h.teamChat("model-a", "Count my tokens.");

    // Verify usage was recorded for the model
    const modelState = h.session.models.find((m) => m.name === "model-a");
    expect(modelState).toBeDefined();
    expect(modelState!.usage.input).toBeGreaterThan(0);
    expect(modelState!.usage.output).toBeGreaterThan(0);
  });
});
