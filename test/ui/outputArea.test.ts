import { describe, it, expect } from "vitest";
import { OutputArea } from "../../src/ui/components/OutputArea.js";
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
      const obj = n as { type: unknown; props: Record<string, unknown> };
      if (typeof obj.type === "function") {
        // Composite component — call it to get the inner tree
        walk(obj.type(obj.props));
      } else {
        // Intrinsic element (e.g. "ink-box") — walk its children
        walk(obj.props.children);
      }
    }
  }
  walk(node);
  return parts.join("");
}

describe("OutputArea", () => {
  describe("broadcast mode", () => {
    it("renders BroadcastSummary", () => {
      const models = [makeModel({ name: "A", buffer: "hi" })];
      const el = OutputArea({
        models,
        targetMode: { type: "broadcast" },
        scrollOffsets: {},
        terminalWidth: 80,
      });
      const text = flattenText(el);
      expect(text).toContain("A");
      expect(text).toContain("hi");
    });

    it("renders multiple models", () => {
      const models = [
        makeModel({ name: "X", buffer: "x" }),
        makeModel({ name: "Y", buffer: "y" }),
      ];
      const el = OutputArea({
        models,
        targetMode: { type: "broadcast" },
        scrollOffsets: {},
        terminalWidth: 80,
      });
      const text = flattenText(el);
      expect(text).toContain("X");
      expect(text).toContain("Y");
    });
  });

  describe("directed mode", () => {
    it("renders ModelDetail for target model", () => {
      const models = [
        makeModel({ name: "claude", buffer: "claude output" }),
        makeModel({ name: "gpt", buffer: "gpt output" }),
      ];
      const el = OutputArea({
        models,
        targetMode: { type: "directed", modelName: "claude" },
        scrollOffsets: {},
        terminalWidth: 80,
      });
      const text = flattenText(el);
      expect(text).toContain("claude output");
      expect(text).not.toContain("gpt output");
    });

    it("shows No model selected when target not found", () => {
      const el = OutputArea({
        models: [],
        targetMode: { type: "directed", modelName: "missing" },
        scrollOffsets: {},
        terminalWidth: 80,
      });
      const text = flattenText(el);
      expect(text).toContain("No model selected");
    });
  });

  describe("comparison mode", () => {
    it("renders two ModelDetail components side by side", () => {
      const models = [
        makeModel({ name: "A", buffer: "aaa" }),
        makeModel({ name: "B", buffer: "bbb" }),
      ];
      const el = OutputArea({
        models,
        targetMode: { type: "directed", modelName: "A" },
        scrollOffsets: {},
        comparisonModel: "B",
        terminalWidth: 80,
      });
      const text = flattenText(el);
      expect(text).toContain("aaa");
      expect(text).toContain("bbb");
      expect(text).toContain("A");
      expect(text).toContain("B");
    });

    it("falls back to single ModelDetail when comparison model not found", () => {
      const models = [makeModel({ name: "A", buffer: "aaa" })];
      const el = OutputArea({
        models,
        targetMode: { type: "directed", modelName: "A" },
        scrollOffsets: {},
        comparisonModel: "missing",
        terminalWidth: 80,
      });
      const text = flattenText(el);
      expect(text).toContain("aaa");
    });
  });
});
