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

  it("clear resets all remembered decisions", () => {
    const pm = new PermissionManager();
    pm.remember("readFile", {}, "deny_always");
    pm.clear();
    expect(pm.check("readFile", {})).toBe("allow");
  });
});
