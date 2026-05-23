import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock os.homedir to use a temp directory
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "multiarena-persist-test-"));
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof os>("node:os");
  return { ...actual, homedir: () => tmpDir };
});

// Dynamic import so the mock takes effect
const { saveSession, loadSession, listSessions } =
  await import("../../src/persistence/session.js");

describe("session persistence", () => {
  beforeEach(() => {
    // Clean the temp sessions dir
    const sessionsDir = path.join(tmpDir, ".multiarena", "sessions");
    if (fs.existsSync(sessionsDir)) {
      fs.rmSync(sessionsDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    const sessionsDir = path.join(tmpDir, ".multiarena", "sessions");
    if (fs.existsSync(sessionsDir)) {
      fs.rmSync(sessionsDir, { recursive: true, force: true });
    }
  });

  it("saves and loads a session", () => {
    const session = {
      id: "test-1",
      timestamp: "2026-05-24T00:00:00Z",
      models: [
        {
          name: "claude",
          messages: [{ role: "user", content: "hi" }],
          buffer: "Hello!",
        },
      ],
      lastTarget: "claude" as const,
    };

    saveSession(session);

    const loaded = loadSession("test-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe("test-1");
    expect(loaded!.models).toHaveLength(1);
    expect(loaded!.models[0].name).toBe("claude");
  });

  it("returns null for nonexistent session", () => {
    const loaded = loadSession("nonexistent");
    expect(loaded).toBeNull();
  });

  it("lists sessions sorted by timestamp (newest first)", () => {
    saveSession({
      id: "older",
      timestamp: "2026-05-23T00:00:00Z",
      models: [],
      lastTarget: "broadcast",
    });
    saveSession({
      id: "newer",
      timestamp: "2026-05-24T00:00:00Z",
      models: [],
      lastTarget: "broadcast",
    });

    const list = listSessions();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe("newer");
    expect(list[1].id).toBe("older");
  });

  it("returns empty list when no sessions saved", () => {
    const list = listSessions();
    expect(list).toEqual([]);
  });

  it("overwrites existing session on re-save", () => {
    const session = {
      id: "overwrite-test",
      timestamp: "2026-05-24T00:00:00Z",
      models: [
        {
          name: "gpt",
          messages: [{ role: "user", content: "v1" }],
          buffer: "",
        },
      ],
      lastTarget: "broadcast" as const,
    };

    saveSession(session);

    const updated = { ...session, timestamp: "2026-05-24T01:00:00Z" };
    saveSession(updated);

    const loaded = loadSession("overwrite-test");
    expect(loaded!.timestamp).toBe("2026-05-24T01:00:00Z");
  });
});
