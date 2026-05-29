import type { PermissionDecision, PermissionEntry } from "./types.js";

export interface PendingRequest {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
  modelName: string;
  resolve: (decision: PermissionDecision) => void;
}

export class PermissionManager {
  private entries: PermissionEntry[] = [];
  private pendingQueue: PendingRequest[] = [];
  private activeRequest: PendingRequest | null = null;
  private changeCallback: (() => void) | null = null;
  private nextId = 0;

  check(toolName: string, args: Record<string, unknown>): PermissionDecision {
    // Hard-coded safety rules
    if (toolName === "bash") {
      const cmd = String(args.command ?? "");
      if (cmd.includes("rm -rf /") || cmd.includes("sudo ")) {
        return "deny";
      }
    }

    if (toolName === "readFile" || toolName === "grep") {
      const path = String(args.path ?? args.filePath ?? "");
      if (path.includes(".env") || path.includes(".git-credentials")) {
        return "deny";
      }
    }

    // Session memory
    for (const entry of this.entries) {
      if (entry.toolName === toolName) {
        return entry.decision;
      }
    }

    return "allow";
  }

  remember(toolName: string, args: Record<string, unknown>, decision: "allow_always" | "deny_always"): void {
    this.entries.push({ toolName, args, decision });
  }

  clear(): void {
    this.entries = [];
  }

  /** Export all remembered entries for session persistence. */
  getEntries(): PermissionEntry[] {
    return [...this.entries];
  }

  /** Import remembered entries from a saved session. */
  setEntries(entries: PermissionEntry[]): void {
    this.entries = [...entries];
  }

  /**
   * Request an interactive user decision.
   * Returns a request ID and a Promise that resolves when the user responds.
   */
  requestUserDecision(
    toolName: string,
    args: Record<string, unknown>,
    modelName: string,
  ): { requestId: string; promise: Promise<PermissionDecision> } {
    const requestId = `perm-${++this.nextId}`;
    let resolveFn!: (decision: PermissionDecision) => void;
    const promise = new Promise<PermissionDecision>((resolve) => {
      resolveFn = resolve;
    });

    const request: PendingRequest = {
      requestId,
      toolName,
      args: { ...args },
      modelName,
      resolve: resolveFn,
    };

    if (this.activeRequest === null) {
      this.activeRequest = request;
    } else {
      this.pendingQueue.push(request);
    }

    return { requestId, promise };
  }

  /** Return the currently active permission request, or null. */
  getActiveRequest(): PendingRequest | null {
    return this.activeRequest;
  }

  /**
   * Resolve the active request with the user's decision.
   * The associated promise is resolved, the request is cleared,
   * and the next queued request (if any) becomes active.
   */
  resolveActiveRequest(decision: PermissionDecision): void {
    if (!this.activeRequest) return;

    const req = this.activeRequest;

    // Remember persistent decisions
    if (decision === "allow_always" || decision === "deny_always") {
      this.remember(req.toolName, req.args, decision);
    }

    this.activeRequest = null;
    req.resolve(decision);

    // Promote next queued request
    if (this.pendingQueue.length > 0) {
      this.activeRequest = this.pendingQueue.shift()!;
    }

    // Notify UI of state change
    if (this.changeCallback) {
      this.changeCallback();
    }
  }

  /** Register a callback invoked whenever request state changes. */
  onStateChange(cb: () => void): void {
    this.changeCallback = cb;
  }

  /**
   * Reject all pending and active requests.
   * Called on session teardown to prevent stale promises from hanging.
   */
  destroy(): void {
    if (this.activeRequest) {
      this.activeRequest.resolve("deny");
      this.activeRequest = null;
    }
    for (const req of this.pendingQueue) {
      req.resolve("deny");
    }
    this.pendingQueue = [];
  }
}
