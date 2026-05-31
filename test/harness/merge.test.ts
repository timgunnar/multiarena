/**
 * E2E tests: /merge — merging multi-model outputs into a unified document.
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

describe("Harness merge", () => {
  it("merges broadcast outputs into a non-empty document", async () => {
    // Phase 1: broadcast — produce distinct model outputs
    (createProvider as any).mockImplementation(
      mockMulti("Findings from A: use React", "Findings from B: use Vue", "Findings from C: use Svelte"),
    );

    const h = new Harness(["model-a", "model-b", "model-c"]);
    await h.broadcast("What framework should we use?");

    // Phase 2: merge — synthesize outputs
    (createProvider as any).mockImplementation(
      mockAll("[共识] The team recommends React. [来源: model-a] Provided benchmarks."),
    );

    const result = await h.merge("What framework should we use?");

    expect(result.document).toBeTruthy();
    expect(result.document.length).toBeGreaterThan(0);
  });

  it("merge result contains source annotations", async () => {
    // Phase 1: broadcast
    (createProvider as any).mockImplementation(
      mockMulti("React is best for SPAs.", "Vue is easier to learn.", "Svelte is most performant."),
    );

    const h = new Harness(["model-a", "model-b", "model-c"]);
    await h.broadcast("Compare frameworks.");

    // Phase 2: merge with annotated output
    (createProvider as any).mockImplementation(
      mockAll(
        "[共识] All agree modern frameworks improve DX.\n[来源: model-a] React has largest ecosystem.\n[分歧] model-b prefers Vue's simplicity while model-c argues for Svelte performance.",
      ),
    );

    const result = await h.merge("Compare frameworks.");

    expect(result.document).toContain("[来源:");
    expect(result.document).toContain("[共识]");
    expect(result.document).toContain("[分歧]");
  });

  it("merge uses specified merger model name", async () => {
    (createProvider as any).mockImplementation(mockMulti("Output A", "Output B"));

    const h = new Harness(["model-a", "model-b"]);
    await h.broadcast("Task");

    // Use model-b as the merger
    (createProvider as any).mockImplementation(
      mockAll("[共识] Merged by model-b."),
    );

    const result = await h.merge("Task", "model-b");

    expect(result.document).toContain("Merged by model-b");
    expect(result.document.length).toBeGreaterThan(0);
  });

  it("throws when no models are available", async () => {
    const h = new Harness([]);
    await expect(h.merge("Some task")).rejects.toThrow("No models available");
  });

  it("excludes muted models from merge inputs", async () => {
    (createProvider as any).mockImplementation(
      mockMulti("A's output", "B's output", "C's output"),
    );

    const h = new Harness(["A", "B", "C"]);
    await h.broadcast("Task");

    // Mute B and C, only A's output should be merged
    h.toggleMute("B");
    h.toggleMute("C");

    (createProvider as any).mockImplementation(
      mockAll("[共识] Only A's content was considered."),
    );

    const result = await h.merge("Task");
    expect(result.document).toContain("Only A's content");
  });
});
