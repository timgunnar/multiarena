/**
 * E2E tests: Cleanup — verify no residue after dispose.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Harness } from "../../src/testing/harness.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

vi.mock("../../src/provider/provider.js", () => ({
  createProvider: vi.fn(),
}));

import { createProvider } from "../../src/provider/provider.js";

function mockProvider(text = "Response.") {
  return {
    chat: async function* () {
      yield { type: "text", content: text } as any;
      yield { type: "done", usage: { input: 5, output: text.length } } as any;
    },
    abort: vi.fn(),
  };
}

beforeEach(() => {
  (createProvider as any).mockReset();
});

describe("Harness cleanup", () => {
  it("save writes session file to ~/.multiarena/sessions/", async () => {
    (createProvider as any).mockImplementation(() => mockProvider());

    const h = new Harness(["A"]);
    await h.broadcast("Test");
    const saved = h.save();

    const sessionPath = path.join(os.homedir(), ".multiarena", "sessions", `${saved.id}.json`);
    expect(fs.existsSync(sessionPath)).toBe(true);

    // Verify file is valid JSON with expected fields
    const content = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
    expect(content.id).toBe(saved.id);
    expect(content.models[0].name).toBe("A");
    expect(content.models[0].messages.length).toBeGreaterThan(0);

    // Clean up
    fs.unlinkSync(sessionPath);
  });

  it("dispose destroys pending permission requests", () => {
    const h = new Harness(["A"]);
    // Create a pending permission request
    h.permissionManager.requestUserDecision("bash", { command: "ls" }, "A");
    expect(h.getPermissionPrompt()).not.toBeNull();

    h.dispose();
    expect(h.getPermissionPrompt()).toBeNull();
  });

  it("save round-trips all model metadata", async () => {
    (createProvider as any).mockImplementation(() => mockProvider("Test output."));

    const h1 = new Harness(["Alpha", "Beta"]);
    h1.toggleMute("Beta");
    await h1.broadcast("Roundtrip test");
    const saved = h1.save();

    // Verify save captures complete state
    expect(saved.models).toHaveLength(2);
    expect(saved.models[0].name).toBe("Alpha");
    expect(saved.models[0].muted).toBe(false);
    expect(saved.models[0].buffer).toContain("Test output.");
    expect(saved.models[1].name).toBe("Beta");
    expect(saved.models[1].muted).toBe(true);
    expect(saved.models[1].buffer).toBe(""); // muted = no response
    expect(saved.teamMessages).toEqual([]);
    expect(saved.inputHistory).toEqual(["Roundtrip test"]);

    // Clean up saved session
    const sessionPath = path.join(os.homedir(), ".multiarena", "sessions", `${saved.id}.json`);
    if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  });

  it("multiple saves create distinct session files", async () => {
    (createProvider as any).mockImplementation(() => mockProvider());

    const h1 = new Harness(["A"]);
    await h1.broadcast("Session 1");
    const s1 = h1.save();

    const h2 = new Harness(["A"]);
    await h2.broadcast("Session 2");
    const s2 = h2.save();

    expect(s1.id).not.toBe(s2.id);

    const p1 = path.join(os.homedir(), ".multiarena", "sessions", `${s1.id}.json`);
    const p2 = path.join(os.homedir(), ".multiarena", "sessions", `${s2.id}.json`);
    expect(fs.existsSync(p1)).toBe(true);
    expect(fs.existsSync(p2)).toBe(true);

    // Clean up
    fs.unlinkSync(p1);
    fs.unlinkSync(p2);
  });
});
