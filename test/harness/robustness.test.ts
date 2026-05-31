/**
 * Harness robustness tests — edge cases, null config, empty input.
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

function mockOk() {
  return () => ({
    chat: async function* () {
      yield { type: "text", content: "mock response" } as any;
      yield { type: "done", usage: { input: 5, output: 13 } } as any;
    },
    abort: vi.fn(),
  });
}

describe("Harness robustness", () => {
  // ── Construction edge cases ──────────────────────────────────

  it("constructs with empty model list without crashing", () => {
    const h = new Harness([]);
    expect(h).toBeDefined();
    expect(h.session.models).toHaveLength(0);
  });

  it("constructs with a single model", () => {
    const h = new Harness(["single-model"]);
    expect(h.session.models).toHaveLength(1);
    expect(h.session.models[0].name).toBe("single-model");
  });

  it("broadcast with zero models returns empty result", async () => {
    const h = new Harness([]);
    const result = await h.broadcast("test");
    expect(result.models).toHaveLength(0);
  });

  it("does not throw on toggleMute for nonexistent model", () => {
    const h = new Harness(["A", "B"]);
    const result = h.toggleMute("nonexistent");
    expect(result).toBe(false);
  });

  it("does not throw on respondPermission with no pending request", () => {
    const h = new Harness(["A", "B"]);
    expect(() => h.respondPermission("allow")).not.toThrow();
    expect(h.getPermissionPrompt()).toBeNull();
  });

  it("merge with no models throws descriptive error", async () => {
    const h = new Harness([]);
    await expect(h.merge("test")).rejects.toThrow("No models available");
  });

  it("merge with no merger model throws descriptive error", async () => {
    const h = new Harness(["A"]);
    await expect(h.merge("prompt", "B")).rejects.toThrow("not configured");
  });

  it("teamChat with nonexistent model throws descriptive error", async () => {
    const h = new Harness(["A"]);
    await expect(h.teamChat("B", "test")).rejects.toThrow("not found");
  });

  it("setAdversarial with null clears override", () => {
    const h = new Harness(["A", "B"]);
    h.setAdversarial("high");
    h.setAdversarial(null);
    expect(() => h.setAdversarial(null)).not.toThrow();
  });

  it("dispose cleans up without errors on fresh instance", () => {
    const h = new Harness(["A"]);
    expect(() => h.dispose()).not.toThrow();
  });

  it("dispose cleans up after broadcast", async () => {
    (createProvider as any).mockImplementation(mockOk());
    const h = new Harness(["A"]);
    await h.broadcast("test");
    expect(() => h.dispose()).not.toThrow();
  });

  it("broadcast handles provider error gracefully", async () => {
    (createProvider as any).mockImplementation(() => ({
      chat: async function* () {
        yield { type: "error", message: "API failure" } as any;
      },
      abort: vi.fn(),
    }));
    const h = new Harness(["A"]);
    const result = await h.broadcast("fail");
    expect(result.models[0].buffer).toContain("[Error: API failure]");
  });

  it("broadcast handles provider creation failure gracefully", async () => {
    (createProvider as any).mockImplementation(() => {
      throw new Error("Cannot create provider");
    });
    const h = new Harness(["A"]);
    // harness resolves — error is stored in model buffer via runTurn's catch
    const result = await h.broadcast("test");
    expect(result.models[0].buffer).toContain("Failed to create provider");
  });
});
