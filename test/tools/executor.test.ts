import { describe, it, expect } from "vitest";
import { executeToolCalls } from "../../src/tools/executor.js";
import { ToolRegistry, createDefaultRegistry } from "../../src/tools/registry.js";
import { PermissionManager } from "../../src/tools/permission.js";
import type { StreamEvent } from "../../src/provider/types.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("executeToolCalls", () => {
  it("passes through text events unchanged", async () => {
    async function* mockStream(): AsyncGenerator<StreamEvent> {
      yield { type: "text", content: "hello" };
      yield { type: "done", usage: { input: 0, output: 0 } };
    }

    const events: StreamEvent[] = [];
    for await (const e of executeToolCalls(
      mockStream(),
      new ToolRegistry(),
      new PermissionManager(),
      "/tmp",
    )) {
      events.push(e);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "text", content: "hello" });
  });

  it("handles tool calls by executing the tool", async () => {
    // Create a temp file with known content so we can use readFile (no shell dependency)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-test-"));
    const testFile = path.join(tmpDir, "test.txt");
    fs.writeFileSync(testFile, "hello from test");

    async function* mockStream(): AsyncGenerator<StreamEvent> {
      yield {
        type: "tool_call",
        id: "call1",
        name: "readFile",
        args: JSON.stringify({ filePath: testFile }),
      };
      yield { type: "done", usage: { input: 0, output: 0 } };
    }

    const registry = createDefaultRegistry();
    const events: StreamEvent[] = [];
    for await (const e of executeToolCalls(
      mockStream(),
      registry,
      new PermissionManager(),
      tmpDir,
    )) {
      events.push(e);
    }

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });

    // Should have a text event with the tool result + done event
    expect(events.length).toBeGreaterThanOrEqual(2);
    const textEvent = events.find((e) => e.type === "text");
    expect(textEvent).toBeDefined();
    expect((textEvent as any).content).toContain("[Tool: readFile]");
    expect((textEvent as any).content).toContain("hello from test");
  });

  it("handles malformed tool args JSON", async () => {
    async function* mockStream(): AsyncGenerator<StreamEvent> {
      yield {
        type: "tool_call",
        id: "call1",
        name: "bash",
        args: "not valid json{{{",
      };
    }

    const events: StreamEvent[] = [];
    for await (const e of executeToolCalls(
      mockStream(),
      new ToolRegistry(),
      new PermissionManager(),
      "/tmp",
    )) {
      events.push(e);
    }

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
  });
});
