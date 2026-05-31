/**
 * WebSocket robustness tests — connection stability, protocol resilience,
 * concurrent clients, malformed input, and state injection.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { WebSocket } from "ws";
import { startServer } from "../../src/server/index.js";

// Mock provider to avoid real API calls
vi.mock("../../src/provider/provider.js", () => ({
  createProvider: vi.fn(),
}));

import { createProvider } from "../../src/provider/provider.js";

// ── Test setup ─────────────────────────────────────────────────

const PORT = 8190 + Math.floor(Math.random() * 1000);
let server: http.Server;
let createdWebDist = false;

function mockProvider(text = "Hello from mock") {
  return () => ({
    chat: async function* () {
      yield { type: "text", content: text } as any;
      yield { type: "done", usage: { input: 5, output: text.length } } as any;
    },
    abort: vi.fn(),
  });
}

beforeAll(async () => {
  // Ensure web/dist/index.html exists for __INITIAL_STATE__ injection test.
  // The server computes STATIC_DIR from import.meta.dirname → <project>/web/dist/
  const projectRoot = path.join(import.meta.dirname, "..", "..");
  const webDistDir = path.join(projectRoot, "web", "dist");
  const indexHtmlPath = path.join(webDistDir, "index.html");

  if (!fs.existsSync(indexHtmlPath)) {
    if (!fs.existsSync(webDistDir)) {
      fs.mkdirSync(webDistDir, { recursive: true });
    }
    fs.writeFileSync(indexHtmlPath,
      '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>');
    createdWebDist = true;
  }

  server = startServer(PORT);
  await new Promise<void>((resolve) => server.on("listening", resolve));
}, 15000);

afterAll(() => {
  server?.close();
  // Clean up web/dist/index.html if we created it
  if (createdWebDist) {
    const projectRoot = path.join(import.meta.dirname, "..", "..");
    const webDistDir = path.join(projectRoot, "web", "dist");
    const indexHtmlPath = path.join(webDistDir, "index.html");
    if (fs.existsSync(indexHtmlPath)) {
      fs.unlinkSync(indexHtmlPath);
    }
    try { fs.rmdirSync(webDistDir); } catch {}
    try { fs.rmdirSync(path.join(projectRoot, "web")); } catch {}
  }
});

beforeEach(() => {
  (createProvider as any).mockReset();
});

// ── Helpers ────────────────────────────────────────────────────

function wsConnect(timeoutMs = 5000): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket connection timeout"));
    }, timeoutMs);
    ws.on("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Wait for a single JSON message from the WebSocket. */
function wsNextMsg(ws: WebSocket, timeoutMs = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Message timeout")), timeoutMs);
    const handler = (data: Buffer) => {
      clearTimeout(timer);
      ws.removeListener("message", handler);
      try {
        resolve(JSON.parse(data.toString()));
      } catch {
        resolve({ type: "error", message: "JSON parse failure" });
      }
    };
    ws.on("message", handler);
  });
}

/** Connect and consume the initial state message. Returns a ready WebSocket. */
async function wsReady(): Promise<WebSocket> {
  const ws = await wsConnect();
  const init = await wsNextMsg(ws);
  expect(init.type).toBe("state");
  return ws;
}

function httpGet(urlPath: string): Promise<{ status: number; data: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}${urlPath}`, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk.toString()));
      res.on("end", () => resolve({
        status: res.statusCode ?? 0,
        data,
        headers: res.headers as Record<string, string>,
      }));
    }).on("error", reject);
  });
}

// ── Tests ─────────────────────────────────────────────────────

describe("WebSocket server robustness", () => {
  it("ws module can be imported for both server and client use", () => {
    expect(typeof WebSocket).toBe("function");
  });

  it("server starts and listens on the specified port", () => {
    expect(server).toBeDefined();
    expect(server.listening).toBe(true);
  });

  it("client connects and immediately receives a {type: 'state'} message", async () => {
    const ws = await wsConnect();
    const msg = await wsNextMsg(ws);
    expect(msg.type).toBe("state");
    expect(msg.models).toBeDefined();
    expect(Array.isArray(msg.models)).toBe(true);
    expect(msg.sessionId).toBeDefined();
    expect(typeof msg.sessionId).toBe("string");
    ws.close();
  });

  it("sending {type: 'state'} command returns state", async () => {
    const ws = await wsReady();

    const respPromise = wsNextMsg(ws);
    ws.send(JSON.stringify({ type: "state" }));
    const msg = await respPromise;

    expect(msg.type).toBe("state");
    expect(msg.models).toBeDefined();
    expect(msg.mode).toBeDefined();
    ws.close();
  });

  it("sending an unknown command type does not crash server", async () => {
    const ws = await wsReady();

    const respPromise = wsNextMsg(ws);
    ws.send(JSON.stringify({ type: "nonexistent_cmd_xyz" }));
    const msg = await respPromise;

    expect(msg.type).toBe("error");
    expect(msg.message).toContain("Unknown command");
    ws.close();

    // Server must still be functional — connect again
    const ws2 = await wsReady();
    ws2.send(JSON.stringify({ type: "state" }));
    const stateMsg = await wsNextMsg(ws2);
    expect(stateMsg.type).toBe("state");
    ws2.close();
  });

  it("sending {type: 'mute', modelName: 'nonexistent'} does not crash", async () => {
    const ws = await wsReady();

    const respPromise = wsNextMsg(ws);
    ws.send(JSON.stringify({ type: "mute", modelName: "nonexistent_model_xyz" }));
    const msg = await respPromise;

    // Should receive a state response (server returns state after mute)
    expect(msg.type).toBe("state");
    ws.close();
  });

  it("sending {type: 'permission', decision: 'allow'} with no pending request does not crash", async () => {
    const ws = await wsReady();

    const respPromise = wsNextMsg(ws);
    ws.send(JSON.stringify({ type: "permission", decision: "allow" }));
    const msg = await respPromise;

    expect(msg.type).toBe("state");
    // No pending permission → prompt is null
    expect(msg.permissionPrompt).toBeNull();
    ws.close();
  });

  it("sending malformed JSON does not crash server", async () => {
    const ws = await wsReady();

    const respPromise = wsNextMsg(ws);
    ws.send("not valid json{{{{{{");
    const msg = await respPromise;

    expect(msg.type).toBe("error");
    expect(msg.message).toContain("Invalid JSON");
    ws.close();

    // Server must still be functional
    const ws2 = await wsReady();
    ws2.send(JSON.stringify({ type: "state" }));
    const stateMsg = await wsNextMsg(ws2);
    expect(stateMsg.type).toBe("state");
    ws2.close();
  });

  it("client disconnect does not crash server — new clients still connect", async () => {
    const ws1 = await wsReady();
    ws1.close();

    // Small delay to allow server-side cleanup
    await new Promise((r) => setTimeout(r, 100));

    const ws2 = await wsReady();
    ws2.send(JSON.stringify({ type: "state" }));
    const msg = await wsNextMsg(ws2);
    expect(msg.type).toBe("state");
    ws2.close();
  });

  it("multiple concurrent clients each receive their own initial state", async () => {
    const results = await Promise.all([
      (async () => {
        const ws = await wsConnect();
        const msg = await wsNextMsg(ws);
        ws.close();
        return msg;
      })(),
      (async () => {
        const ws = await wsConnect();
        const msg = await wsNextMsg(ws);
        ws.close();
        return msg;
      })(),
    ]);

    for (const msg of results) {
      expect(msg.type).toBe("state");
      expect(msg.sessionId).toBeDefined();
      expect(Array.isArray(msg.models)).toBe(true);
    }
  });

  it("submit command streams text events and returns final state", async () => {
    (createProvider as any).mockImplementation(mockProvider("Streaming response text"));

    const ws = await wsReady();

    ws.send(JSON.stringify({ type: "submit", text: "Hello", mode: "broadcast" }));

    // Collect all events until we receive the final state
    const events: any[] = [];
    for (let i = 0; i < 20; i++) {
      const msg = await wsNextMsg(ws, 15000);
      events.push(msg);
      // Stop when we get a state message after seeing a stream or done event
      if (msg.type === "state" && events.some((e) => e.type === "done" || e.type === "stream")) {
        break;
      }
    }

    const hasStream = events.some((e) => e.type === "stream");
    const hasDone = events.some((e) => e.type === "done");
    const hasState = events.some((e) => e.type === "state");
    expect(hasStream || hasDone).toBe(true);
    expect(hasState).toBe(true);
    ws.close();
  });

  it("__INITIAL_STATE__ is injected into served index.html", async () => {
    const { status, data } = await httpGet("/");
    expect(status).toBe(200);
    expect(data).toContain("window.__INITIAL_STATE__");

    // Extract and parse the injected state JSON
    const match = data.match(/window\.__INITIAL_STATE__=(\{.*?\});/s);
    expect(match).not.toBeNull();
    if (match) {
      const state = JSON.parse(match[1]);
      expect(state.models).toBeDefined();
      expect(Array.isArray(state.models)).toBe(true);
      expect(state.sessionId).toBeDefined();
    }
  });
});
