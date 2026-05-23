import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { editFileTool } from "../../src/tools/builtin/editFile.js";

describe("editFile tool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("replaces a single occurrence", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "const x = 1;");
    const result = await editFileTool.execute(
      { filePath: "f.txt", oldString: "x", newString: "counter" },
      tmpDir,
    );
    expect(result).toContain("Replaced 1 occurrence");
    const content = fs.readFileSync(path.join(tmpDir, "f.txt"), "utf-8");
    expect(content).toBe("const counter = 1;");
  });

  it("replaces all occurrences with replaceAll", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "a a a");
    const result = await editFileTool.execute(
      { filePath: "f.txt", oldString: "a", newString: "b", replaceAll: true },
      tmpDir,
    );
    expect(result).toContain("Replaced 3 occurrence");
    const content = fs.readFileSync(path.join(tmpDir, "f.txt"), "utf-8");
    expect(content).toBe("b b b");
  });

  it("returns error for missing file", async () => {
    const result = await editFileTool.execute(
      { filePath: "nope.txt", oldString: "x", newString: "y" },
      tmpDir,
    );
    expect(result).toContain("File not found");
  });

  it("returns error when oldString not found", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "hello");
    const result = await editFileTool.execute(
      { filePath: "f.txt", oldString: "world", newString: "replaced" },
      tmpDir,
    );
    expect(result).toContain("oldString not found");
  });

  it("detects duplicate oldString without replaceAll", async () => {
    fs.writeFileSync(path.join(tmpDir, "f.txt"), "dup dup dup");
    const result = await editFileTool.execute(
      { filePath: "f.txt", oldString: "dup", newString: "single" },
      tmpDir,
    );
    expect(result).toContain("appears 3 times");
  });
});
