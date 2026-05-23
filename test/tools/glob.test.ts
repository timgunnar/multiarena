import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { globTool } from "../../src/tools/builtin/glob.js";

describe("globTool", () => {
  it("matches files by extension", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "multiarena-glob-"));
    fs.writeFileSync(path.join(dir, "a.ts"), "x");
    fs.writeFileSync(path.join(dir, "b.ts"), "y");
    fs.writeFileSync(path.join(dir, "c.txt"), "z");

    const result = await globTool.execute({ pattern: "*.ts" }, dir);
    expect(result).toContain("a.ts");
    expect(result).toContain("b.ts");
    expect(result).not.toContain("c.txt");

    fs.rmSync(dir, { recursive: true });
  });

  it("matches recursive with **", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "multiarena-glob-"));
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "root.ts"), "x");
    fs.writeFileSync(path.join(dir, "sub", "nested.ts"), "y");

    const result = await globTool.execute({ pattern: "**/*.ts" }, dir);
    expect(result).toContain("root.ts");
    expect(result).toContain(path.join("sub", "nested.ts"));

    fs.rmSync(dir, { recursive: true });
  });

  it("returns empty for no matches", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "multiarena-glob-"));
    const result = await globTool.execute({ pattern: "*.zzz" }, dir);
    expect(result).toBe("No files matched");
    fs.rmSync(dir, { recursive: true });
  });
});
