import { simpleGit, type SimpleGit } from "simple-git";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

export class WorktreeManager {
  private git: SimpleGit;
  private worktrees: Map<string, string> = new Map();

  constructor(repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  /** Clean up orphaned multiarena branches and worktree directories from prior crashes. */
  async sweepOrphans(): Promise<number> {
    let cleaned = 0;

    // Parse registered worktrees from `git worktree list --porcelain`
    const registeredPaths = new Set<string>();
    const registeredBranches = new Set<string>();
    try {
      const raw = await this.git.raw(["worktree", "list", "--porcelain"]);
      let currentPath: string | null = null;
      for (const line of raw.split("\n")) {
        if (line.startsWith("worktree ")) {
          currentPath = line.slice("worktree ".length);
          registeredPaths.add(currentPath);
        } else if (line.startsWith("branch ") && currentPath) {
          // branch line looks like "branch refs/heads/multiarena/..."
          const ref = line.slice("branch ".length);
          const branchName = ref.replace("refs/heads/", "");
          registeredBranches.add(branchName);
        }
      }
    } catch {
      return cleaned;
    }

    // Remove orphaned multiarena branches (branch exists but no worktree)
    const branches = await this.git.branchLocal();
    for (const branch of branches.all) {
      if (!branch.startsWith("multiarena/")) continue;
      if (!registeredBranches.has(branch)) {
        await this.git.deleteLocalBranch(branch, true).catch(() => {});
        cleaned++;
      }
    }

    // Remove orphaned worktree directories (dir exists but not registered)
    const arenaDir = path.join(os.tmpdir(), "multiarena-worktrees");
    if (fs.existsSync(arenaDir)) {
      let entries: string[] = [];
      try { entries = fs.readdirSync(arenaDir); } catch { /* ignore */ }
      for (const entry of entries) {
        const fullPath = path.join(arenaDir, entry);
        if (!registeredPaths.has(fullPath)) {
          try {
            // Try git worktree remove first, then force delete
            await this.git.raw(["worktree", "remove", fullPath, "--force"]).catch(() => {});
            fs.rmSync(fullPath, { recursive: true, force: true });
            cleaned++;
          } catch { /* best effort */ }
        }
      }
    }

    return cleaned;
  }

  async setup(taskId: string, modelNames: string[]): Promise<Map<string, string>> {
    const baseName = `multiarena/${taskId}`;

    for (const name of modelNames) {
      const branchName = `${baseName}-${name}`;
      const worktreePath = path.join(os.tmpdir(), "multiarena-worktrees", `${taskId}-${name}`);

      // Ensure the parent directory exists; git worktree add creates the leaf directory
      fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

      // Remove leftover directory from a previous run that wasn't cleaned up
      if (fs.existsSync(worktreePath)) {
        await this.git.raw(["worktree", "remove", worktreePath, "--force"]).catch(() => {
          fs.rmSync(worktreePath, { recursive: true, force: true });
        });
      }

      // Clean up any leftover branch from previous runs
      await this.git.deleteLocalBranch(branchName, true).catch(() => {});

      // Create the branch and add the worktree
      await this.git.branch([branchName]);
      await this.git.raw(["worktree", "add", worktreePath, branchName]);
      this.worktrees.set(name, worktreePath);
    }

    return this.worktrees;
  }

  getWorktreePath(modelName: string): string | undefined {
    return this.worktrees.get(modelName);
  }

  async getDiff(modelName: string): Promise<string> {
    const wt = this.worktrees.get(modelName);
    if (!wt) return "";
    const wtGit = simpleGit(wt);
    return await wtGit.diff();
  }

  async cleanup(taskId: string, keepModel?: string): Promise<void> {
    for (const [modelName, wtPath] of this.worktrees) {
      if (modelName === keepModel) continue;
      try {
        await this.git.raw(["worktree", "remove", wtPath, "--force"]);
      } catch {
        fs.rmSync(wtPath, { recursive: true, force: true });
      }
      await this.git
        .deleteLocalBranch(`multiarena/${taskId}-${modelName}`, true)
        .catch(() => {});
      this.worktrees.delete(modelName);
    }
  }
}
