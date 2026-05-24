import { describe, it, expect } from "vitest";
import { filterThinkText, flushThinkBuf, type ThinkFilterState } from "../../../src/provider/adapters/openai.js";

const fresh = (): ThinkFilterState => ({ inThink: false, buf: "" });

describe("filterThinkText", () => {
  describe("normal text (no think blocks)", () => {
    it("passes through plain text", () => {
      const r = filterThinkText("hello world", fresh());
      expect(r.text).toBe("hello world");
      expect(r.state.inThink).toBe(false);
    });

    it("passes through text with partial tag (no angle brackets)", () => {
      const r = filterThinkText("think about it", fresh());
      expect(r.text).toBe("think about it");
    });
  });

  describe("complete think block in one chunk", () => {
    it("strips a standalone think block", () => {
      const r = filterThinkText("before <think>hidden</think> after", fresh());
      expect(r.text).toBe("before  after");
      expect(r.state.inThink).toBe(false);
    });

    it("returns empty string when entire chunk is think block", () => {
      const r = filterThinkText("<think>internal reasoning</think>", fresh());
      expect(r.text).toBe("");
      expect(r.state.inThink).toBe(false);
    });

    it("handles before-only when think is at end", () => {
      const r = filterThinkText("before <think>internal</think>", fresh());
      expect(r.text).toBe("before ");
      expect(r.state.inThink).toBe(false);
    });

    it("handles after-only when think is at start", () => {
      const r = filterThinkText("<think>internal</think> after", fresh());
      expect(r.text).toBe(" after");
      expect(r.state.inThink).toBe(false);
    });
  });

  describe("think block spanning multiple chunks", () => {
    it("swallows chunk when think opens but doesn't close", () => {
      const r = filterThinkText("before <think>partial", fresh());
      expect(r.text).toBe("before ");
      expect(r.state.inThink).toBe(true);
      expect(r.state.buf).toBe("partial");
    });

    it("swallows subsequent chunks while in think", () => {
      const s1 = filterThinkText("before <think>start", fresh());
      expect(s1.state.inThink).toBe(true);

      const s2 = filterThinkText(" more", s1.state);
      expect(s2.text).toBe("");
      expect(s2.state.inThink).toBe(true);
    });

    it("closes think in subsequent chunk", () => {
      const s1 = filterThinkText("before <think>start", fresh());
      const s2 = filterThinkText(" end</think> after", s1.state);
      expect(s2.text).toBe(" after");
      expect(s2.state.inThink).toBe(false);
    });

    it("handles multiple think blocks across chunks", () => {
      const s1 = filterThinkText("<think>first</think> middle <think>second", fresh());
      // Single-pass: first think block stripped, second <think> is in remaining text
      expect(s1.text).toContain("middle");
      expect(s1.state.inThink).toBe(false);
    });

    it("handles think opening in first chunk, no before text", () => {
      const r = filterThinkText("<think>hidden", fresh());
      expect(r.text).toBe("");
      expect(r.state.inThink).toBe(true);
      expect(r.state.buf).toBe("hidden");
    });
  });

  describe("edge cases", () => {
    it("handles <think> without </think> (open never closed)", () => {
      const r = filterThinkText("before <think>never closes", fresh());
      expect(r.text).toBe("before ");
      expect(r.state.inThink).toBe(true);
    });

    it("handles </think> without opening tag", () => {
      // </think> alone is just text — it only matters when inThink is true
      const r = filterThinkText("just </think> text", fresh());
      expect(r.text).toBe("just </think> text");
      expect(r.state.inThink).toBe(false);
    });

    it("handles empty input", () => {
      const r = filterThinkText("", fresh());
      expect(r.text).toBe("");
    });

    it("handles partial tag like <think", () => {
      const r = filterThinkText("<think", fresh());
      expect(r.text).toBe("<think");
      expect(r.state.inThink).toBe(false);
    });
  });
});

describe("flushThinkBuf", () => {
  it("returns empty string when not in think", () => {
    expect(flushThinkBuf({ inThink: false, buf: "anything" })).toBe("");
  });

  it("returns empty string when buffer is empty", () => {
    expect(flushThinkBuf({ inThink: true, buf: "" })).toBe("");
  });

  it("returns text after </think> when buffer has closing tag", () => {
    expect(flushThinkBuf({ inThink: true, buf: "hidden</think>after" })).toBe("after");
  });

  it("returns empty when no closing tag in buffer", () => {
    expect(flushThinkBuf({ inThink: true, buf: "no closing tag" })).toBe("");
  });
});
