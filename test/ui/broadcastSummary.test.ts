import { describe, it, expect } from "vitest";
import { BroadcastSummary } from "../../src/ui/components/BroadcastSummary.js";
import type { ModelState } from "../../src/core/types.js";

function makeModel(overrides?: Partial<ModelState>): ModelState {
  return {
    name: "M",
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

describe("BroadcastSummary", () => {
  it("renders model names for all active models", () => {
    const models = [
      makeModel({ name: "claude", buffer: "Hello" }),
      makeModel({ name: "gpt", buffer: "World" }),
    ];
    const el = BroadcastSummary({ models, terminalWidth: 80 });
    const text = flattenText(el);
    expect(text).toContain("claude");
    expect(text).toContain("gpt");
  });

  it("shows No output for empty buffer", () => {
    const models = [makeModel({ name: "M", buffer: "", isStreaming: false })];
    const el = BroadcastSummary({ models, terminalWidth: 80 });
    const text = flattenText(el);
    expect(text).toContain("No output");
  });

  it("shows Waiting for streaming empty model", () => {
    const models = [makeModel({ name: "M", buffer: "", isStreaming: true })];
    const el = BroadcastSummary({ models, terminalWidth: 80 });
    const text = flattenText(el);
    expect(text).toContain("Waiting");
  });

  it("shows 0 lines for empty buffer", () => {
    const models = [makeModel({ name: "M", buffer: "" })];
    const el = BroadcastSummary({ models, terminalWidth: 80 });
    const text = flattenText(el);
    expect(text).toContain("0 lines");
  });

  it("shows correct line count", () => {
    const models = [makeModel({ name: "M", buffer: "line1\nline2\nline3" })];
    const el = BroadcastSummary({ models, terminalWidth: 80 });
    const text = flattenText(el);
    expect(text).toContain("3 lines");
  });

  it("shows token usage in footer", () => {
    const models = [
      makeModel({
        name: "M",
        buffer: "hi",
        usage: { input: 1000, output: 500 },
        contextLimit: 128000,
      }),
    ];
    const el = BroadcastSummary({ models, terminalWidth: 80 });
    const text = flattenText(el);
    expect(text).toContain("2K"); // 1000+500 = 1500 ≈ 2K
  });

  it("excludes muted models", () => {
    const models = [
      makeModel({ name: "claude", muted: false, buffer: "hi" }),
      makeModel({ name: "gpt", muted: true, buffer: "secret" }),
    ];
    const el = BroadcastSummary({ models, terminalWidth: 80 });
    const text = flattenText(el);
    expect(text).toContain("claude");
    expect(text).not.toContain("gpt");
  });

  it("displays last 4 lines of buffer", () => {
    const buffer = Array.from({ length: 10 }, (_, i) => `L${String(i + 1).padStart(2, "0")}`).join("\n");
    const models = [makeModel({ name: "M", buffer })];
    const el = BroadcastSummary({ models, terminalWidth: 80 });
    const text = flattenText(el);
    // Last 4 lines (L07-L10) visible, first line (L01) not visible
    expect(text).toContain("L10");
    expect(text).toContain("L07");
    expect(text).not.toContain("L01");
  });

  it("pads to exactly 4 display lines", () => {
    const models = [makeModel({ name: "M", buffer: "only one line" })];
    const el = BroadcastSummary({ models, terminalWidth: 80 });
    expect(el).toBeDefined();
    const text = flattenText(el);
    expect(text).toContain("only one line");
  });
});
