import { describe, it, expect } from "vitest";
import { DeliberationView, type RoundSummary } from "../../src/ui/components/DeliberationView.js";
import type { DeliberationProgress } from "../../src/core/deliberation.js";

/** Walks Ink element tree including composite components. */
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
        walk(obj.type(obj.props));
      } else {
        walk(obj.props.children);
      }
    }
  }
  walk(node);
  return parts.join("");
}

function makeProgress(overrides?: Partial<DeliberationProgress>): DeliberationProgress {
  return {
    type: "round_start",
    round: 1,
    totalRounds: 3,
    modelName: "test-model",
    role: "draft",
    ...overrides,
  } as DeliberationProgress;
}

function makeRounds(): RoundSummary[] {
  return [
    { round: 1, modelName: "claude", role: "draft", changeCount: 0 },
    { round: 2, modelName: "gpt", role: "revise", changeCount: 4, changeSamples: ["old -> new", "foo -> bar"] },
    { round: 3, modelName: "minimax", role: "review", changeCount: 0 },
  ];
}

describe("DeliberationView", () => {
  describe("active deliberation", () => {
    it("shows current round info", () => {
      const el = DeliberationView({
        progress: makeProgress({ round: 2, totalRounds: 3, modelName: "gpt", role: "revise" }),
        document: "In progress...",
        rounds: [],
      });
      const text = flattenText(el);
      expect(text).toContain("2/3");
      expect(text).toContain("gpt");
      expect(text).toContain("修订");
    });

    it("shows document content as it streams", () => {
      const el = DeliberationView({
        progress: makeProgress(),
        document: "Hello\nWorld",
        rounds: [],
      });
      const text = flattenText(el);
      expect(text).toContain("Hello");
      expect(text).toContain("World");
    });

    it("shows waiting message when no document yet", () => {
      const el = DeliberationView({
        progress: makeProgress(),
        document: "",
        rounds: [],
      });
      const text = flattenText(el);
      expect(text).toContain("等待输出");
    });
  });

  describe("done state", () => {
    it("shows completion summary with round count", () => {
      const el = DeliberationView({
        progress: makeProgress({ type: "done", round: 3, totalRounds: 3 }),
        document: "Final document",
        rounds: makeRounds(),
      });
      const text = flattenText(el);
      expect(text).toContain("审议完成");
      expect(text).toContain("3 轮");
    });

    it("shows total changes across rounds", () => {
      const el = DeliberationView({
        progress: makeProgress({ type: "done", round: 3, totalRounds: 3 }),
        document: "Final",
        rounds: makeRounds(),
      });
      const text = flattenText(el);
      expect(text).toContain("4 处修改");
    });

    it("shows process summary with round labels", () => {
      const el = DeliberationView({
        progress: makeProgress({ type: "done", round: 3, totalRounds: 3 }),
        document: "Final",
        rounds: makeRounds(),
      });
      const text = flattenText(el);
      expect(text).toContain("审议过程");
      expect(text).toContain("起草");
      expect(text).toContain("修订");
      expect(text).toContain("终审");
    });

    it("shows change samples when present", () => {
      const el = DeliberationView({
        progress: makeProgress({ type: "done", round: 2, totalRounds: 2 }),
        document: "Final",
        rounds: makeRounds(),
      });
      const text = flattenText(el);
      expect(text).toContain("old -> new");
      expect(text).toContain("foo -> bar");
    });

    it("shows no changes text for non-draft rounds with no changes", () => {
      const el = DeliberationView({
        progress: makeProgress({ type: "done", round: 3, totalRounds: 3 }),
        document: "Final",
        rounds: makeRounds(),
      });
      const text = flattenText(el);
      expect(text).toContain("无修改");
    });

    it("shows final document header", () => {
      const el = DeliberationView({
        progress: makeProgress({ type: "done", round: 1, totalRounds: 1 }),
        document: "Final output",
        rounds: [],
      });
      const text = flattenText(el);
      expect(text).toContain("最终文档");
      expect(text).toContain("Final output");
    });
  });

  describe("error state", () => {
    it("shows error message", () => {
      const el = DeliberationView({
        progress: makeProgress({ type: "error", error: "Something went wrong" }),
        document: "",
        rounds: [],
      });
      const text = flattenText(el);
      expect(text).toContain("审议出错");
      expect(text).toContain("Something went wrong");
    });
  });

  describe("scroll offset", () => {
    it("hides lines before offset", () => {
      const el = DeliberationView({
        progress: makeProgress({ type: "done", round: 1, totalRounds: 1 }),
        document: "line1\nline2\nline3\nline4\nline5",
        rounds: [],
        scrollOffset: 3,
      });
      const text = flattenText(el);
      expect(text).not.toContain("line1");
      expect(text).toContain("line4");
      expect(text).toContain("line5");
    });
  });

  describe("pipeline indicators", () => {
    it("shows checkmark for past rounds when done", () => {
      const el = DeliberationView({
        progress: makeProgress({ type: "done", round: 3, totalRounds: 3 }),
        document: "Done",
        rounds: makeRounds(),
      });
      const text = flattenText(el);
      // Past rounds (all done) should show ✓
      expect(text).toContain("✓");
    });

    it("shows spinner/active for current round when running", () => {
      const el = DeliberationView({
        progress: makeProgress({ type: "round_start", round: 2, totalRounds: 3 }),
        document: "",
        rounds: makeRounds(),
      });
      const text = flattenText(el);
      expect(text).toContain("正在生成");
    });
  });
});
