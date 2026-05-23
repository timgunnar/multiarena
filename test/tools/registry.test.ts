import { describe, it, expect } from "vitest";
import { ToolRegistry, createDefaultRegistry } from "../../src/tools/registry.js";

describe("ToolRegistry", () => {
  it("getDefinitions returns registered tool definitions", () => {
    const registry = createDefaultRegistry();
    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(3);
    expect(defs.map((d) => d.name).sort()).toEqual(["bash", "grep", "readFile"]);
  });

  it("execute returns error for unknown tool", async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute("unknown", {}, "/tmp");
    expect(result).toContain("Error: unknown tool");
  });
});
