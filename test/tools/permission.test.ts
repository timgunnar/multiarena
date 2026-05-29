import { describe, it, expect } from "vitest";
import { PermissionManager } from "../../src/tools/permission.js";

describe("PermissionManager", () => {
  it("allows normal tools by default", () => {
    const pm = new PermissionManager();
    expect(pm.check("readFile", { filePath: "src/test.ts" })).toBe("allow");
  });

  it("blocks reading .env files", () => {
    const pm = new PermissionManager();
    expect(pm.check("readFile", { filePath: ".env" })).toBe("deny");
  });

  it("blocks dangerous bash commands", () => {
    const pm = new PermissionManager();
    expect(pm.check("bash", { command: "rm -rf /" })).toBe("deny");
    expect(pm.check("bash", { command: "sudo rm something" })).toBe("deny");
  });

  it("remembers allow_always decisions", () => {
    const pm = new PermissionManager();
    pm.remember("readFile", { filePath: "src/test.ts" }, "allow_always");
    expect(pm.check("readFile", { filePath: "src/test.ts" })).toBe("allow_always");
  });

  it("remembers deny_always decisions", () => {
    const pm = new PermissionManager();
    pm.remember("readFile", { filePath: "secret.txt" }, "deny_always");
    expect(pm.check("readFile", { filePath: "secret.txt" })).toBe("deny_always");
  });

  it("hard-coded rules override session memory", () => {
    const pm = new PermissionManager();
    pm.remember("bash", { command: "rm -rf /" }, "allow_always");
    // Hard-coded rules are checked first, so rm -rf / is always denied
    expect(pm.check("bash", { command: "rm -rf /" })).toBe("deny");
  });

  it("blocks reading .git-credentials files via readFile", () => {
    const pm = new PermissionManager();
    expect(pm.check("readFile", { filePath: ".git-credentials" })).toBe("deny");
  });

  it("blocks reading .env files via grep", () => {
    const pm = new PermissionManager();
    expect(pm.check("grep", { path: ".env" })).toBe("deny");
  });

  it("blocks reading .git-credentials files via grep", () => {
    const pm = new PermissionManager();
    expect(pm.check("grep", { path: ".git-credentials" })).toBe("deny");
  });

  it("clear resets all remembered decisions", () => {
    const pm = new PermissionManager();
    pm.remember("readFile", {}, "deny_always");
    pm.clear();
    expect(pm.check("readFile", {})).toBe("allow");
  });

  // ── Interactive permission ──────────────────────────────────

  it("requestUserDecision returns a promise and request ID", () => {
    const pm = new PermissionManager();
    const result = pm.requestUserDecision("bash", { command: "git status" }, "claude");
    expect(result.requestId).toMatch(/^perm-/);
    expect(result.promise).toBeInstanceOf(Promise);
  });

  it("getActiveRequest returns the active request", () => {
    const pm = new PermissionManager();
    const { requestId } = pm.requestUserDecision("bash", { command: "ls" }, "claude");
    const active = pm.getActiveRequest();
    expect(active).not.toBeNull();
    expect(active!.requestId).toBe(requestId);
    expect(active!.toolName).toBe("bash");
    expect(active!.modelName).toBe("claude");
  });

  it("resolveActiveRequest resolves the promise", async () => {
    const pm = new PermissionManager();
    const { promise } = pm.requestUserDecision("bash", { command: "ls" }, "claude");

    let resolved: string | null = null;
    promise.then((d) => { resolved = d; });

    pm.resolveActiveRequest("allow");

    // Wait for microtask
    await new Promise((r) => setTimeout(r, 0));
    expect(resolved).toBe("allow");
    expect(pm.getActiveRequest()).toBeNull();
  });

  it("second request is queued while active exists", () => {
    const pm = new PermissionManager();
    const r1 = pm.requestUserDecision("bash", { command: "ls" }, "claude");
    const r2 = pm.requestUserDecision("readFile", { filePath: "test.ts" }, "gpt");

    // r1 is active, r2 queued
    expect(pm.getActiveRequest()!.requestId).toBe(r1.requestId);

    // Resolve r1 → r2 becomes active
    pm.resolveActiveRequest("allow");
    expect(pm.getActiveRequest()!.requestId).toBe(r2.requestId);
  });

  it("resolveActiveRequest is no-op when no active request", () => {
    const pm = new PermissionManager();
    pm.resolveActiveRequest("allow");
    expect(pm.getActiveRequest()).toBeNull();
  });

  it("resolveActiveRequest remembers allow_always and deny_always", () => {
    const pm = new PermissionManager();

    // Allow always → should be remembered
    pm.requestUserDecision("readFile", { filePath: "src/test.ts" }, "claude");
    pm.resolveActiveRequest("allow_always");
    expect(pm.check("readFile", { filePath: "src/test.ts" })).toBe("allow_always");

    // Deny always → should be remembered (use different tool to avoid collision)
    pm.requestUserDecision("bash", { command: "rm file" }, "claude");
    pm.resolveActiveRequest("deny_always");
    expect(pm.check("bash", { command: "rm file" })).toBe("deny_always");
  });

  it("destroy rejects all pending promises with deny", async () => {
    const pm = new PermissionManager();
    const r1 = pm.requestUserDecision("bash", { command: "ls" }, "claude");
    const r2 = pm.requestUserDecision("bash", { command: "pwd" }, "gpt");

    const results: string[] = [];
    r1.promise.then((d) => results.push(d));
    r2.promise.then((d) => results.push(d));

    pm.destroy();

    await new Promise((r) => setTimeout(r, 0));
    expect(results).toEqual(["deny", "deny"]);
    expect(pm.getActiveRequest()).toBeNull();
  });

  it("onStateChange fires when active request changes", () => {
    const pm = new PermissionManager();
    const calls: number[] = [];

    pm.onStateChange(() => calls.push(1));

    // Creating first request → callback fires (via the first setting of active)
    pm.requestUserDecision("bash", { command: "ls" }, "claude");

    // Resolve → next queued becomes active → callback fires
    pm.requestUserDecision("bash", { command: "pwd" }, "gpt");
    pm.resolveActiveRequest("allow");

    expect(calls.length).toBe(1); // only fires when active changes via resolveActiveRequest
  });
});
