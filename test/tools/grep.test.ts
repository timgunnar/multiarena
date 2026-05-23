import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { grepTool } from "../../src/tools/builtin/grep.js";

const hasRg = (() => {
  try {
    execSync("rg --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("grep tool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-test-"));
    fs.writeFileSync(path.join(tmpDir, "a.ts"), "const x = 42;\nexport default x;");
    fs.writeFileSync(path.join(tmpDir, "b.ts"), "import x from './a';\nconsole.log(x);");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.runIf(hasRg)("finds matches for a regex pattern", async () => {
    const result = await grepTool.execute({ pattern: "const" }, tmpDir);
    expect(result).toContain("const");
  });

  it.runIf(hasRg)("returns 'No matches found' for no matches", async () => {
    const result = await grepTool.execute({ pattern: "NONEXISTENT" }, tmpDir);
    expect(result).toBe("No matches found");
  });

  it.runIf(hasRg)("searches within a specific path", async () => {
    const subDir = path.join(tmpDir, "sub");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, "c.ts"), "const y = 99;");
    const result = await grepTool.execute(
      { pattern: "99", path: "sub" },
      tmpDir,
    );
    expect(result).toContain("99");
  });
});
