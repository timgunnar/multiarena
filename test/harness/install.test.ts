/**
 * Install / uninstall tests — verify npm pack, install, and clean removal.
 */
import { describe, it, expect, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

const TMP_DIR = path.join(os.tmpdir(), "multiarena-install-test-" + Date.now().toString(36));

describe("npm install / uninstall", () => {
  afterAll(() => {
    try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
  });

  it("full pack → install → verify → uninstall pipeline", () => {
    fs.mkdirSync(TMP_DIR, { recursive: true });

    // 1. npm pack
    const packOutput = execSync("npm pack --pack-destination " + TMP_DIR, {
      cwd: process.cwd(),
      encoding: "utf-8",
    }).trim();
    expect(packOutput).toMatch(/multiarena-.*\.tgz/);

    const tarball = path.join(TMP_DIR, packOutput);
    expect(fs.existsSync(tarball)).toBe(true);

    // 2. Install to temp dir
    const installDir = path.join(TMP_DIR, "install");
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(path.join(installDir, "package.json"), JSON.stringify({
      name: "test-install", private: true,
    }));
    execSync(`npm install "${tarball}"`, { cwd: installDir, encoding: "utf-8" });

    // 3. Verify package contents
    const base = path.join(installDir, "node_modules", "multiarena");
    expect(fs.existsSync(path.join(base, "package.json"))).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(path.join(base, "package.json"), "utf-8"));
    expect(pkg.name).toBe("multiarena");
    expect(pkg.bin.multiarena).toBeDefined();

    // Required files present
    expect(fs.existsSync(path.join(base, "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(base, "README_CN.md"))).toBe(true);
    expect(fs.existsSync(path.join(base, "CHANGELOG.md"))).toBe(true);
    expect(fs.existsSync(path.join(base, "CHANGELOG_CN.md"))).toBe(true);
    expect(fs.existsSync(path.join(base, "LICENSE"))).toBe(true);
    expect(fs.existsSync(path.join(base, pkg.bin.multiarena))).toBe(true);

    // Source/docs NOT leaked
    expect(fs.existsSync(path.join(base, "src"))).toBe(false);
    expect(fs.existsSync(path.join(base, "test"))).toBe(false);
    expect(fs.existsSync(path.join(base, "docs"))).toBe(false);
    expect(fs.existsSync(path.join(base, "CLAUDE.md"))).toBe(false);

    // 4. Uninstall — remove the package
    const modPath = path.join(installDir, "node_modules", "multiarena");
    fs.rmSync(modPath, { recursive: true, force: true });
    expect(fs.existsSync(modPath)).toBe(false);

    // Verify no stray files
    const remaining = fs.readdirSync(path.join(installDir, "node_modules"));
    expect(remaining).not.toContain("multiarena");
  }, 30000);
});
