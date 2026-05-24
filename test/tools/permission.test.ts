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
});
