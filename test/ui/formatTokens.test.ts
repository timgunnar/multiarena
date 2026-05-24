import { describe, it, expect } from "vitest";
import { formatTokens } from "../../src/ui/components/formatTokens.js";

describe("formatTokens", () => {
  it("returns raw number for small values", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(500)).toBe("500");
    expect(formatTokens(999)).toBe("999");
  });

  it("formats thousands as K", () => {
    expect(formatTokens(1000)).toBe("1K");
    expect(formatTokens(1500)).toBe("2K");
    expect(formatTokens(999999)).toBe("1000K");
  });

  it("formats millions as M", () => {
    expect(formatTokens(1000000)).toBe("1.0M");
    expect(formatTokens(1500000)).toBe("1.5M");
    expect(formatTokens(1048576)).toBe("1.0M");
  });
});
