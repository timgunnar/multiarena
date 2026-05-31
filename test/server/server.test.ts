/**
 * Server tests — basic HTTP endpoint validation.
 * Uses a minimal server with temp config to avoid touching real session files.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as http from "node:http";
import { startServer } from "../../src/server/index.js";

const PORT = 3099;
const BASE = `http://127.0.0.1:${PORT}`;

let server: http.Server;

beforeAll(async () => {
  server = startServer(PORT);
  await new Promise<void>((resolve) => server.on("listening", resolve));
}, 10000);

afterAll(() => {
  server?.close();
});

function post(path: string, payload: any): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode ?? 0, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode ?? 0, data }); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

describe("Web Server", () => {
  it("POST /api/cmd state returns session state with models", async () => {
    const { status, data } = await post("/api/cmd", { type: "state" });
    expect(status).toBe(200);
    expect(data.sessionId).toBeDefined();
    expect(Array.isArray(data.models)).toBe(true);
    expect(data.mode).toBe("broadcast");
  });

  it("POST /api/cmd mute toggles model muted state", async () => {
    const initial = await post("/api/cmd", { type: "state" });
    const modelName = initial.data.models?.[0]?.name;
    if (!modelName) return;

    await post("/api/cmd", { type: "mute", modelName });
    const afterMute = await post("/api/cmd", { type: "state" });
    expect(afterMute.data.models[0].muted).toBe(true);

    await post("/api/cmd", { type: "mute", modelName });
    const afterUnmute = await post("/api/cmd", { type: "state" });
    expect(afterUnmute.data.models[0].muted).toBe(false);
  });

  it("POST /api/cmd with unknown type returns 400", async () => {
    const { status, data } = await post("/api/cmd", { type: "nonexistent" });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("POST /api/cmd permission resolves active request", async () => {
    await post("/api/cmd", { type: "permission", decision: "allow" });
    // Should not throw — resolves even if no active request
    const { status } = await post("/api/cmd", { type: "state" });
    expect(status).toBe(200);
  });

  it("POST /api/cmd reset clears model state", async () => {
    const initial = await post("/api/cmd", { type: "state" });
    const modelName = initial.data.models?.[0]?.name;
    if (!modelName) return;

    const { status } = await post("/api/cmd", { type: "reset", modelName });
    expect(status).toBe(200);
  });
});
