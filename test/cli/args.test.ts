import { describe, it, expect } from "vitest";
import { parseArgs, getPkgVersion, setPkgVersion, HELP } from "../../src/cli/args.js";

describe("parseArgs", () => {
  it("returns showGuide with no args", () => {
    const r = parseArgs([]);
    expect(r.showGuide).toBe(true);
    expect(r.webMode).toBe(false);
  });

  it("'web' positional starts web mode", () => {
    expect(parseArgs(["web"]).webMode).toBe(true);
    expect(parseArgs(["web", "8080"]).webPort).toBe(8080);
  });

  it("'terminal' positional starts terminal mode", () => {
    expect(parseArgs(["terminal"]).terminalMode).toBe(true);
  });

  it("detects --help", () => {
    expect(parseArgs(["--help"]).showHelp).toBe(true);
    expect(parseArgs(["-h"]).showHelp).toBe(true);
  });

  it("detects --version", () => {
    expect(parseArgs(["--version"]).showVersion).toBe(true);
    expect(parseArgs(["-v"]).showVersion).toBe(true);
  });

  it("parses --resume <id>", () => {
    const r = parseArgs(["--resume", "abc123"]);
    expect(r.sessionId).toBe("abc123");
    expect(r.listOnly).toBe(false);
  });

  it("returns undefined sessionId when --resume has no value", () => {
    const r = parseArgs(["--resume"]);
    expect(r.sessionId).toBeUndefined();
    expect(r.listOnly).toBe(false);
  });

  it("detects --list", () => {
    expect(parseArgs(["--list"]).listOnly).toBe(true);
    expect(parseArgs(["--list-sessions"]).listOnly).toBe(true);
  });

  it("--help takes priority over other flags", () => {
    const r = parseArgs(["--help", "--version"]);
    expect(r.showHelp).toBe(true);
    expect(r.showVersion).toBe(false);
  });

  it("--version takes priority over --list", () => {
    const r = parseArgs(["--version", "--list"]);
    expect(r.showVersion).toBe(true);
    expect(r.listOnly).toBe(false);
  });

  it("--resume takes priority over --list", () => {
    const r = parseArgs(["--resume", "x", "--list"]);
    expect(r.sessionId).toBe("x");
    expect(r.listOnly).toBe(false);
  });

  it("detects --web", () => {
    const r = parseArgs(["--web"]);
    expect(r.webMode).toBe(true);
    expect(r.webPort).toBe(3000);
  });

  it("detects --web with custom port", () => {
    const r = parseArgs(["--web", "8080"]);
    expect(r.webMode).toBe(true);
    expect(r.webPort).toBe(8080);
  });
});

describe("HELP", () => {
  it("contains the app name", () => {
    expect(HELP).toContain("multiarena");
  });

  it("mentions key options", () => {
    expect(HELP).toContain("--resume");
    expect(HELP).toContain("--list");
    expect(HELP).toContain("--help");
    expect(HELP).toContain("--version");
  });
});

describe("getPkgVersion", () => {
  it("returns a version string", () => {
    const v = getPkgVersion();
    expect(typeof v).toBe("string");
    expect(v.length).toBeGreaterThan(0);
  });

  it("returns overridden version after setPkgVersion", () => {
    setPkgVersion("9.9.9-test");
    expect(getPkgVersion()).toBe("9.9.9-test");
    // Reset
    setPkgVersion("0.0.0");
    expect(getPkgVersion()).toBe("0.0.0");
    setPkgVersion(""); // clear override
  });
});
