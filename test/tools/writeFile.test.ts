import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { writeFileTool } from "../../src/tools/builtin/writeFile.js";

describe("writeFile tool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes content to a file", async () => {
    const result = await writeFileTool.execute(
      { filePath: "out.txt", content: "hello world" },
      tmpDir,
    );
    expect(result).toContain("Wrote");
    const written = fs.readFileSync(path.join(tmpDir, "out.txt"), "utf-8");
    expect(written).toBe("hello world");
  });

  it("creates parent directories", async () => {
    const result = await writeFileTool.execute(
      { filePath: "deep/nested/file.txt", content: "deep content" },
      tmpDir,
    );
    const written = fs.readFileSync(
      path.join(tmpDir, "deep", "nested", "file.txt"),
      "utf-8",
    );
    expect(written).toBe("deep content");
  });

  it("blocks path escape attempts", async () => {
    const result = await writeFileTool.execute(
      { filePath: "../outside.txt", content: "escape" },
      tmpDir,
    );
    expect(result).toContain("escapes");
  });

  it("overwrites existing files", async () => {
    fs.writeFileSync(path.join(tmpDir, "existing.txt"), "old");
    await writeFileTool.execute(
      { filePath: "existing.txt", content: "new" },
      tmpDir,
    );
    const written = fs.readFileSync(path.join(tmpDir, "existing.txt"), "utf-8");
    expect(written).toBe("new");
  });
});
