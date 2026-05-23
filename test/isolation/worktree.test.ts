import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WorktreeManager } from "../../src/isolation/worktree.js";
import { simpleGit } from "simple-git";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

describe("WorktreeManager", () => {
  let testRepo: string;

  beforeEach(() => {
    testRepo = fs.mkdtempSync(path.join(os.tmpdir(), "multiarena-test-repo-"));
    execSync("git init", { cwd: testRepo });
    execSync('git config user.email "test@test.com"', { cwd: testRepo });
    execSync('git config user.name "Test"', { cwd: testRepo });
    execSync('git commit --allow-empty -m "initial"', { cwd: testRepo });
  });

  afterEach(() => {
    try {
      // Clean up any lingering worktrees
      const list = execSync("git worktree list", { cwd: testRepo, encoding: "utf-8" });
      const normalizedRepo = path.resolve(testRepo);
      for (const line of list.split("\n")) {
        const wtPath = line.split(" ")[0];
        if (wtPath && path.resolve(wtPath) !== normalizedRepo && fs.existsSync(wtPath)) {
          try {
            execSync(`git worktree remove "${wtPath}" --force`, { cwd: testRepo });
          } catch {}
        }
      }
    } catch {}
    try {
      fs.rmSync(testRepo, { recursive: true, force: true });
    } catch {}
  });

  it("creates worktrees for model names", async () => {
    const wm = new WorktreeManager(testRepo);
    const paths = await wm.setup("test-1", ["claude", "gpt"]);
    expect(paths.size).toBe(2);
    expect(fs.existsSync(paths.get("claude")!)).toBe(true);
    expect(fs.existsSync(paths.get("gpt")!)).toBe(true);
  });

  it("returns diff for modified worktree", async () => {
    const wm = new WorktreeManager(testRepo);
    const paths = await wm.setup("test-2", ["claude"]);
    const wtPath = paths.get("claude")!;

    // Create and commit a tracked file so git diff can detect changes
    const wtGit = simpleGit(wtPath);
    fs.writeFileSync(path.join(wtPath, "test.txt"), "initial");
    await wtGit.add("test.txt");
    await wtGit.commit("add test.txt");

    // Now modify it -- git diff will show the changes
    fs.writeFileSync(path.join(wtPath, "test.txt"), "hello");
    const diff = await wm.getDiff("claude");
    expect(diff).toContain("test.txt");
  });

  it("getWorktreePath returns undefined for unknown model", () => {
    const wm = new WorktreeManager(testRepo);
    expect(wm.getWorktreePath("unknown")).toBeUndefined();
  });

  it("cleanup removes worktrees", async () => {
    const wm = new WorktreeManager(testRepo);
    const paths = await wm.setup("test-3", ["claude"]);
    const wtPath = paths.get("claude")!;
    expect(fs.existsSync(wtPath)).toBe(true);
    await wm.cleanup("test-3");
    expect(fs.existsSync(wtPath)).toBe(false);
  });

  it("cleanup keeps the specified model's worktree", async () => {
    const wm = new WorktreeManager(testRepo);
    const paths = await wm.setup("test-4", ["claude", "gpt"]);
    const gptPath = paths.get("gpt")!;
    const claudePath = paths.get("claude")!;
    await wm.cleanup("test-4", "gpt");
    expect(fs.existsSync(claudePath)).toBe(false);
    expect(fs.existsSync(gptPath)).toBe(true);
  });
});
