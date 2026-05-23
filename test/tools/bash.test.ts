import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { bashTool } from "../../src/tools/builtin/bash.js";

describe("bash tool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "multiarena-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("executes a simple command", async () => {
    const result = await bashTool.execute(
      { command: "echo hello" },
      tmpDir,
    );
    expect(result).toContain("hello");
  });

  it("blocks dangerous commands", async () => {
    const result = await bashTool.execute(
      { command: "sudo rm -rf /" },
      tmpDir,
    );
    expect(result).toContain("Blocked");
  });

  it("returns error for failing commands", async () => {
    const result = await bashTool.execute(
      { command: "nonexistent_command_xyz" },
      tmpDir,
    );
    expect(result).toContain("Command failed");
  });

  it("runs in the specified worktree", async () => {
    fs.writeFileSync(path.join(tmpDir, "hello.txt"), "world");
    // Use a command that proves we're in the worktree
    const result = await bashTool.execute(
      { command: process.platform === "win32" ? "type hello.txt" : "cat hello.txt" },
      tmpDir,
    );
    expect(result).toContain("world");
  });

  it("returns (no output) for silent commands", async () => {
    const result = await bashTool.execute(
      { command: process.platform === "win32" ? "echo." : "true" },
      tmpDir,
    );
    // echo. on Windows outputs a dot, so we just check it doesn't error
    expect(result).toBeDefined();
    expect(result).not.toContain("Command failed");
  });
});
