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

  async setup(taskId: string, modelNames: string[]): Promise<Map<string, string>> {
    const baseName = `arena/${taskId}`;

    for (const name of modelNames) {
      const branchName = `${baseName}-${name}`;
      const worktreePath = path.join(os.tmpdir(), "arena-worktrees", `${taskId}-${name}`);

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
        .deleteLocalBranch(`arena/${taskId}-${modelName}`, true)
        .catch(() => {});
      this.worktrees.delete(modelName);
    }
  }
}
