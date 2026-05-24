import { describe, it, expect } from "vitest";
import { friendlyToolLabel } from "../../src/core/turn.js";

describe("friendlyToolLabel", () => {
  it("formats bash with command", () => {
    const label = friendlyToolLabel("bash", { command: "echo hello" });
    expect(label).toContain("$ echo hello");
  });

  it("formats bash with missing command", () => {
    const label = friendlyToolLabel("bash", {});
    expect(label).toContain("$ (no command)");
  });

  it("formats read_file", () => {
    const label = friendlyToolLabel("read_file", { file_path: "src/foo.ts" });
    expect(label).toContain("Reading src/foo.ts");
  });

  it("formats read_file with missing path", () => {
    const label = friendlyToolLabel("read_file", {});
    expect(label).toContain("Reading (?)");
  });

  it("formats write_file", () => {
    const label = friendlyToolLabel("write_file", { file_path: "src/bar.ts" });
    expect(label).toContain("Writing src/bar.ts");
  });

  it("formats edit_file", () => {
    const label = friendlyToolLabel("edit_file", { file_path: "src/bar.ts" });
    expect(label).toContain("Editing src/bar.ts");
  });

  it("formats glob", () => {
    const label = friendlyToolLabel("glob", { pattern: "**/*.ts" });
    expect(label).toContain("Finding **/*.ts");
  });

  it("formats glob with missing pattern", () => {
    const label = friendlyToolLabel("glob", {});
    expect(label).toContain("Finding (?)");
  });

  it("formats grep", () => {
    const label = friendlyToolLabel("grep", { pattern: "TODO" });
    expect(label).toContain('Searching "TODO"');
  });

  it("formats grep with missing pattern", () => {
    const label = friendlyToolLabel("grep", {});
    expect(label).toContain('Searching "(?)"');
  });

  it("falls back for unknown tools", () => {
    const label = friendlyToolLabel("custom_tool", {});
    expect(label).toContain("Running custom_tool...");
  });
});
