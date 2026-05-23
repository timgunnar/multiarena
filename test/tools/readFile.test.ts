import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { readFileTool } from "../../src/tools/builtin/readFile.js";

describe("readFile tool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "multiarena-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads a file", async () => {
    fs.writeFileSync(path.join(tmpDir, "test.txt"), "line1\nline2\nline3");
    const result = await readFileTool.execute({ filePath: "test.txt" }, tmpDir);
    expect(result).toBe("line1\nline2\nline3");
  });

  it("returns error for missing file", async () => {
    const result = await readFileTool.execute(
      { filePath: "missing.txt" },
      tmpDir,
    );
    expect(result).toContain("File not found");
  });

  it("respects offset and limit", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "nums.txt"),
      "1\n2\n3\n4\n5\n6\n7\n8\n9\n10",
    );
    const result = await readFileTool.execute(
      { filePath: "nums.txt", offset: 3, limit: 2 },
      tmpDir,
    );
    expect(result).toBe("4\n5");
  });
});
