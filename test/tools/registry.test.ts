import { describe, it, expect } from "vitest";
import { ToolRegistry, createDefaultRegistry } from "../../src/tools/registry.js";

describe("ToolRegistry", () => {
  it("getDefinitions returns registered tool definitions", () => {
    const registry = createDefaultRegistry();
    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(6);
    expect(defs.map((d) => d.name).sort()).toEqual(["bash", "editFile", "glob", "grep", "readFile", "writeFile"]);
  });

  it("execute returns error for unknown tool", async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute("unknown", {}, "/tmp");
    expect(result).toContain("Error: unknown tool");
  });

  it("register adds a tool that can be executed", async () => {
    const registry = new ToolRegistry();
    registry.register({
      definition: { name: "echo", description: "", parameters: { type: "object", properties: {} } },
      execute: async (args) => `echo: ${args.text ?? ""}`,
    });
    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe("echo");

    const result = await registry.execute("echo", { text: "hello" }, "/tmp");
    expect(result).toBe("echo: hello");
  });

  it("execute catches handler errors and returns error message", async () => {
    const registry = new ToolRegistry();
    registry.register({
      definition: { name: "failer", description: "", parameters: { type: "object", properties: {} } },
      execute: async () => { throw new Error("BOOM"); },
    });
    const result = await registry.execute("failer", {}, "/tmp");
    expect(result).toContain("Error executing failer");
    expect(result).toContain("BOOM");
  });
});
