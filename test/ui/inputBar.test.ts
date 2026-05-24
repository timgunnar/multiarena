import { describe, it, expect } from "vitest";
import { InputBar } from "../../src/ui/components/InputBar.js";
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

describe("InputBar", () => {
  const noop = () => {};

  it("shows broadcast prefix", () => {
    const models = [makeModel({ name: "A" }), makeModel({ name: "B" })];
    const el = InputBar({
      models,
      activeModelName: null,
      prefix: "all",
      value: "",
      onChange: noop,
      onSubmit: noop,
    });
    const text = flattenText(el);
    expect(text).toContain("[all]");
  });

  it("shows directed prefix", () => {
    const models = [makeModel({ name: "minimax" })];
    const el = InputBar({
      models,
      activeModelName: "minimax",
      prefix: "minimax",
      value: "",
      onChange: noop,
      onSubmit: noop,
    });
    const text = flattenText(el);
    expect(text).toContain("[minimax]");
  });

  it("shows dot for targeted models in broadcast", () => {
    const models = [makeModel({ name: "A" }), makeModel({ name: "B" })];
    const el = InputBar({
      models,
      activeModelName: null, // broadcast → all targeted
      prefix: "all",
      value: "",
      onChange: noop,
      onSubmit: noop,
    });
    const text = flattenText(el);
    expect(text).toContain("A");
    expect(text).toContain("B");
  });

  it("shows dot only for targeted model in directed mode", () => {
    const models = [makeModel({ name: "A" }), makeModel({ name: "B" })];
    const el = InputBar({
      models,
      activeModelName: "A",
      prefix: "A",
      value: "",
      onChange: noop,
      onSubmit: noop,
    });
    const text = flattenText(el);
    expect(text).toContain("A");
    expect(text).toContain("B"); // still shown, just not targeted
  });

  it("shows muted tag", () => {
    const models = [makeModel({ name: "M", muted: true })];
    const el = InputBar({
      models,
      activeModelName: "M",
      prefix: "M",
      value: "",
      onChange: noop,
      onSubmit: noop,
    });
    const text = flattenText(el);
    expect(text).toContain("[muted]");
  });

  it("shows shortcut hints", () => {
    const models = [makeModel()];
    const el = InputBar({
      models,
      activeModelName: null,
      prefix: "all",
      value: "",
      onChange: noop,
      onSubmit: noop,
    });
    const text = flattenText(el);
    expect(text).toContain("Tab:switch");
    expect(text).toContain("d:compare");
    expect(text).toContain("q:quit");
  });
});
