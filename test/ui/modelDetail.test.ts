import { describe, it, expect } from "vitest";
import { ModelDetail } from "../../src/ui/components/ModelDetail.js";
import type { ModelState } from "../../src/core/types.js";

function makeModel(overrides?: Partial<ModelState>): ModelState {
  return {
    name: "test-model",
    provider: "openai",
    messages: [],
    muted: false,
    buffer: "",
    isStreaming: false,
    usage: { input: 0, output: 0 },
    contextLimit: 128000,
    ...overrides,
  };
}

function flattenText(node: unknown): string {
  const parts: string[] = [];
  function walk(n: unknown): void {
    if (n === null || n === undefined) return;
    if (typeof n === "string") { parts.push(n); return; }
    if (typeof n === "number") { parts.push(String(n)); return; }
    if (typeof n === "boolean") return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n === "object" && "type" in n && "props" in n) {
      walk((n as Record<string, unknown>).props.children);
    }
  }
  walk(node);
  return parts.join("");
}

describe("ModelDetail", () => {
  it("shows No output for empty buffer", () => {
    const model = makeModel({ buffer: "" });
    const el = ModelDetail({ model, scrollOffset: 0 });
    const text = flattenText(el);
    expect(text).toContain("No output");
  });

  it("shows No output for whitespace-only buffer", () => {
    const model = makeModel({ buffer: " " });
    const el = ModelDetail({ model, scrollOffset: 0 });
    const text = flattenText(el);
    expect(text).toContain("No output");
  });

  it("shows 0 lines for empty buffer", () => {
    const model = makeModel({ buffer: "" });
    const el = ModelDetail({ model, scrollOffset: 0 });
    const text = flattenText(el);
    expect(text).toContain("0 lines");
  });

  it("shows model name", () => {
    const model = makeModel({ name: "claude" });
    const el = ModelDetail({ model, scrollOffset: 0 });
    const text = flattenText(el);
    expect(text).toContain("claude");
  });

  it("shows buffer content", () => {
    const model = makeModel({ buffer: "Hello world" });
    const el = ModelDetail({ model, scrollOffset: 0 });
    const text = flattenText(el);
    expect(text).toContain("Hello world");
  });

  it("shows streaming indicator", () => {
    const model = makeModel({ buffer: "partial", isStreaming: true });
    const el = ModelDetail({ model, scrollOffset: 0 });
    const text = flattenText(el);
    expect(text).toContain("streaming...");
  });

  it("shows done when not streaming", () => {
    const model = makeModel({ buffer: "content", isStreaming: false });
    const el = ModelDetail({ model, scrollOffset: 0 });
    const text = flattenText(el);
    expect(text).toContain("done");
  });

  it("shows token usage in footer", () => {
    const model = makeModel({
      buffer: "hi",
      usage: { input: 500, output: 200 },
      contextLimit: 128000,
    });
    const el = ModelDetail({ model, scrollOffset: 0 });
    const text = flattenText(el);
    expect(text).toContain("700");
    expect(text).toContain("128K");
  });

  it("respects scroll offset", () => {
    const model = makeModel({ buffer: "line1\nline2\nline3\nline4" });
    const el = ModelDetail({ model, scrollOffset: 2 });
    const text = flattenText(el);
    expect(text).toContain("line3");
    expect(text).not.toContain("line1");
  });

  it("handles buffer with null/undefined safely", () => {
    const model = makeModel({ buffer: null as any });
    expect(() =>
      ModelDetail({ model, scrollOffset: 0 }),
    ).not.toThrow();
  });
});
