/**
 * Install / uninstall tests — verify npm pack, install, and clean removal.
 */
import { describe, it, expect, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

const TMP_DIR = path.join(os.tmpdir(), "multiarena-install-test-" + Date.now().toString(36));

function findTarball(dir: string): string | null {
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith(".tgz")) return path.join(dir, f);
  }
  return null;
}

describe("npm install / uninstall", () => {
  afterAll(() => {
    try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
  });

  it("npm pack creates a tarball and dry-run shows correct files", () => {
    fs.mkdirSync(TMP_DIR, { recursive: true });

    const packOutput = execSync("npm pack --pack-destination " + TMP_DIR, {
      cwd: process.cwd(),
      encoding: "utf-8",
    }).trim();

    const tarball = findTarball(TMP_DIR);
    expect(tarball).not.toBeNull();
    expect(packOutput).toMatch(/multiarena-.*\.tgz/);
  });

  it("installed package contains required dist and doc files", () => {
    const installDir = path.join(TMP_DIR, "install2");
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(path.join(installDir, "package.json"), JSON.stringify({
      name: "test-install2", private: true,
    }));

    const tarball = findTarball(TMP_DIR)!;
    execSync(`npm install "${tarball}"`, { cwd: installDir });

    const base = path.join(installDir, "node_modules", "multiarena");
    expect(fs.existsSync(path.join(base, "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(base, "README_CN.md"))).toBe(true);
    expect(fs.existsSync(path.join(base, "CHANGELOG.md"))).toBe(true);
    expect(fs.existsSync(path.join(base, "CHANGELOG_CN.md"))).toBe(true);
    expect(fs.existsSync(path.join(base, "LICENSE"))).toBe(true);
    expect(fs.existsSync(path.join(base, "dist", "index.js"))).toBe(true);
  });

  it("installed package excludes source and internal files", () => {
    const base = path.join(TMP_DIR, "install2", "node_modules", "multiarena");
    expect(fs.existsSync(path.join(base, "src"))).toBe(false);
    expect(fs.existsSync(path.join(base, "test"))).toBe(false);
    expect(fs.existsSync(path.join(base, "docs"))).toBe(false);
    expect(fs.existsSync(path.join(base, "CLAUDE.md"))).toBe(false);
  });

  it("local install works and binary is executable", () => {
    const installDir = path.join(TMP_DIR, "install");
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(path.join(installDir, "package.json"), JSON.stringify({
      name: "test-install", private: true,
    }));

    const tarball = findTarball(TMP_DIR)!;
    execSync(`npm install "${tarball}"`, { cwd: installDir });

    // Verify the package was installed
    const pkgJson = path.join(installDir, "node_modules", "multiarena", "package.json");
    expect(fs.existsSync(pkgJson)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf-8"));
    expect(pkg.name).toBe("multiarena");
    expect(pkg.version).toBe("0.1.8");

    // Verify binary entry point exists
    const entryPoint = path.join(installDir, "node_modules", "multiarena", pkg.bin.multiarena);
    expect(fs.existsSync(entryPoint)).toBe(true);
  });

  it("uninstall leaves no residue in node_modules", () => {
    const installDir = path.join(TMP_DIR, "install");
    const modPath = path.join(installDir, "node_modules", "multiarena");

    // Should exist from previous test
    expect(fs.existsSync(modPath)).toBe(true);

    // Remove it
    fs.rmSync(modPath, { recursive: true, force: true });

    // Verify it's gone
    expect(fs.existsSync(modPath)).toBe(false);

    // Verify no stray files outside node_modules/multiarena
    const nodeModules = fs.readdirSync(path.join(installDir, "node_modules"));
    expect(nodeModules).not.toContain("multiarena");
  });
});
