/**
 * E2E tests: Permission interaction — tool call authorization flow.
 *
 * These tests verify that the Harness correctly surfaces permission prompts
 * and that the permission manager handles all four decisions (allow, deny,
 * allow_always, deny_always), hardcoded safety rules, and session persistence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Harness } from "../../src/testing/harness.js";

vi.mock("../../src/provider/provider.js", () => ({
  createProvider: vi.fn(),
}));

import { createProvider } from "../../src/provider/provider.js";

// ── Helpers ────────────────────────────────────────────────────────

/** Poll getPermissionPrompt() until a request appears or timeout. */
async function waitForPrompt(
  h: Harness,
  timeout = 5000,
): Promise<NonNullable<ReturnType<typeof h.getPermissionPrompt>>> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const p = h.getPermissionPrompt();
    if (p) return p;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("Timed out waiting for permission prompt");
}

/**
 * Mock factory that yields a tool_call event on the first `toolCalls` calls
 * to chat(), then yields a plain text response on every subsequent call.
 *
 * This mirrors the real runTurn loop: the provider is re-created each
 * iteration, so we count provider creations rather than turn rounds.
 */
function mockToolCallSequence(
  toolCalls: number,
  toolName: string,
  toolArgs: Record<string, unknown>,
  finalText = "Done",
) {
  let callCount = 0;
  return () => {
    callCount++;
    if (callCount <= toolCalls) {
      return {
        chat: async function* () {
          yield {
            type: "tool_call",
            id: `tc${callCount}`,
            name: toolName,
            args: JSON.stringify(toolArgs),
          } as any;
          yield { type: "done", usage: { input: 10, output: 0 } } as any;
        },
        abort: vi.fn(),
      };
    }
    return {
      chat: async function* () {
        yield { type: "text", content: finalText } as any;
        yield {
          type: "done",
          usage: { input: 5, output: finalText.length },
        } as any;
      },
      abort: vi.fn(),
    };
  };
}

beforeEach(() => {
  (createProvider as any).mockReset();
});

// ── Tests ──────────────────────────────────────────────────────────

describe("Harness permission", () => {
  // ── 3. getPermissionPrompt() returns the pending request ──────

  it("getPermissionPrompt() returns pending request when a tool call triggers a permission check", async () => {
    (createProvider as any).mockImplementation(
      mockToolCallSequence(1, "bash", { command: "git status" }),
    );

    const h = new Harness(["A"]);
    // Fire broadcast but do not await — we need to interact mid-flight.
    const resultPromise = h.broadcast("Run git status");

    const prompt = await waitForPrompt(h);
    expect(prompt.toolName).toBe("bash");
    expect(prompt.args).toEqual({ command: "git status" });
    expect(prompt.modelName).toBe("A");
    expect(prompt.requestId).toMatch(/^perm-\d+$/);

    // Clean-up: resolve so the async generator can drain.
    h.respondPermission("deny");
    await resultPromise;
  });

  // ── 4. respondPermission("allow") resolves & tool executes ────

  it('respondPermission("allow") resolves the prompt and executes the tool', async () => {
    (createProvider as any).mockImplementation(
      mockToolCallSequence(1, "bash", { command: "git status" }, "All done"),
    );

    const h = new Harness(["A"]);
    const resultPromise = h.broadcast("Run git status");

    const prompt = await waitForPrompt(h);
    expect(prompt).not.toBeNull();
    h.respondPermission("allow");

    const result = await resultPromise;
    // The buffer should contain the tool label (printed before execution).
    expect(result.models[0].buffer).toContain("git status");
    // The final model response should follow.
    expect(result.models[0].buffer).toContain("All done");
    // The prompt should be cleared after resolution.
    expect(h.getPermissionPrompt()).toBeNull();
  });

  // ── 5. respondPermission("deny") skips the tool ───────────────

  it('respondPermission("deny") skips the tool and reports denial', async () => {
    (createProvider as any).mockImplementation(
      mockToolCallSequence(1, "bash", { command: "git status" }, "Moving on"),
    );

    const h = new Harness(["A"]);
    const resultPromise = h.broadcast("Run git status");

    const prompt = await waitForPrompt(h);
    h.respondPermission("deny");

    const result = await resultPromise;
    expect(result.models[0].buffer).toContain("Permission denied");
    // The final model response still arrives — the loop continues.
    expect(result.models[0].buffer).toContain("Moving on");
  });

  // ── 6. respondPermission("allow_always") persists ─────────────

  it('respondPermission("allow_always") persists — next check() returns allow_always', async () => {
    (createProvider as any).mockImplementation(
      mockToolCallSequence(1, "bash", { command: "git status" }),
    );

    const h = new Harness(["A"]);
    const resultPromise = h.broadcast("Run git status");

    const prompt = await waitForPrompt(h);
    h.respondPermission("allow_always");
    await resultPromise;

    // After remembering, a fresh check returns the cached decision.
    expect(h.permissionManager.check("bash", { command: "anything" })).toBe(
      "allow_always",
    );
  });

  // ── 7. Hardcoded deny never generates a prompt ────────────────

  it("hardcoded safety rule (rm -rf /) never generates a permission prompt", async () => {
    (createProvider as any).mockImplementation(
      mockToolCallSequence(1, "bash", { command: "rm -rf /" }, "I refuse"),
    );

    const h = new Harness(["A"]);
    // This broadcast completes without ever posting a prompt because
    // PermissionManager.check() returns "deny" for the hardcoded rule.
    const result = await h.broadcast("Delete everything");

    expect(h.getPermissionPrompt()).toBeNull();
    expect(result.models[0].buffer).toContain("Permission denied");
    expect(result.models[0].buffer).toContain("I refuse");
  });

  // ── 8. respondPermission("deny_always") persists ──────────────

  it('respondPermission("deny_always") persists — next check() returns deny_always', async () => {
    (createProvider as any).mockImplementation(
      mockToolCallSequence(1, "bash", { command: "git status" }),
    );

    const h = new Harness(["A"]);
    const resultPromise = h.broadcast("Run git status");

    const prompt = await waitForPrompt(h);
    h.respondPermission("deny_always");
    await resultPromise;

    // After remembering, a fresh check returns the cached decision.
    expect(h.permissionManager.check("bash", { command: "anything" })).toBe(
      "deny_always",
    );
  });
});
