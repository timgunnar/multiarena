/**
 * SSE integration test — verify server sends valid SSE events.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as http from "node:http";
import { startServer } from "../../src/server/index.js";

const PORT = 3098;
const BASE = `http://127.0.0.1:${PORT}`;

let server: http.Server;

beforeAll(async () => {
  server = startServer(PORT);
  await new Promise<void>((resolve) => server.on("listening", resolve));
}, 10000);

afterAll(() => {
  server?.close();
});

describe("SSE endpoint", () => {
  it("responds with text/event-stream content type", async () => {
    const res = await new Promise<http.IncomingMessage>((resolve) => {
      http.get(`${BASE}/api/stream`, resolve);
    });
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.statusCode).toBe(200);
    res.destroy();
  });

  it("sends initial state event", async () => {
    const events: Array<{ event: string; data: unknown }> = [];
    await new Promise<void>((resolve) => {
      http.get(`${BASE}/api/stream`, (res) => {
        let buffer = "";
        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          // Parse SSE events
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            if (!part.trim() || part === ":") continue;
            const eventMatch = part.match(/^event: (.+)$/m);
            const dataMatch = part.match(/^data: (.+)$/m);
            if (eventMatch && dataMatch) {
              events.push({
                event: eventMatch[1],
                data: JSON.parse(dataMatch[1]),
              });
            }
          }
          if (events.length > 0) {
            res.destroy();
            resolve();
          }
        });
        setTimeout(() => { res.destroy(); resolve(); }, 3000);
      });
    });
    // Should have received at least the state event
    const stateEvent = events.find((e) => e.event === "state");
    expect(stateEvent).toBeDefined();
    expect((stateEvent?.data as any)?.models).toBeDefined();
  });

  it("rejects invalid JSON in POST command", async () => {
    const { status } = await new Promise<{ status: number }>((resolve) => {
      const req = http.request(`${BASE}/api/cmd`, { method: "POST" }, (res) => {
        resolve({ status: res.statusCode ?? 0 });
      });
      req.write("not-json");
      req.end();
    });
    expect(status).toBe(400);
  });
});
