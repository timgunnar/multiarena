/**
 * HTTP + WebSocket server for multiarena --web mode.
 *
 * WebSocket (ws://127.0.0.1:PORT/ws) handles ALL real-time communication:
 * submit, permission, mute, reset, mode, save, resume — with streaming responses.
 *
 * HTTP endpoints (/api/config, /api/sessions, /api/health) remain for
 * non-streaming operations and backward compatibility.
 *
 * Initial state is injected into index.html for instant page load.
 */
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { WebSocketServer, WebSocket } from "ws";
import { loadConfig } from "../config/loader.js";
import { SessionManager } from "./sessionManager.js";

const PORT = parseInt(process.env.MULTIARENA_PORT ?? "3000", 10);
const HOST = "127.0.0.1";

// ── Static file serving ────────────────────────────────────────

const WEB_DIR = path.join(import.meta.dirname, "..", "..", "web", "dist");
// In development, web/dist might not exist; fall back to a placeholder
const STATIC_DIR = fs.existsSync(WEB_DIR) ? WEB_DIR : null;

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function serveStatic(res: http.ServerResponse, filePath: string) {
  if (!STATIC_DIR) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>multiarena</title></head>
<body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#111;color:#eee">
<p>Web UI not built yet. Run <code>npm run build:web</code></p>
</body></html>`);
    return;
  }

  const safePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(STATIC_DIR, safePath || "index.html");
  if (!fs.existsSync(fullPath) || !fullPath.startsWith(STATIC_DIR)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(fullPath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  res.end(fs.readFileSync(fullPath));
}

// ── Server ──────────────────────────────────────────────────────

export function startServer(port = PORT) {
  const config = loadConfig();
  let mgr = new SessionManager(config);
  let sessionId = Date.now().toString(36);

  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";

    // POST endpoint for commands (backward compatibility)
    if (url === "/api/cmd" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const msg = JSON.parse(body);
          await handleCommand(msg, res);
        } catch (err: any) {
          console.error("[api/cmd] Parse/handle error:", err.message || err);
          res.writeHead(400);
          res.end(JSON.stringify({ error: err.message || "Bad request" }));
        }
      });
      return;
    }

    // Config save endpoint — SetupWizard writes models to .multiarenarc
    if (url === "/api/config" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const cfg = JSON.parse(body);
          const toml = buildConfigTOML(cfg);
          const configPath = path.join(os.homedir(), ".multiarenarc");
          fs.writeFileSync(configPath, toml, "utf-8");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", path: configPath }));
        } catch (err: any) {
          console.error("[api/config] Error:", err.message || err);
          res.writeHead(400);
          res.end(JSON.stringify({ error: err.message || "Bad config request" }));
        }
      });
      return;
    }

    // Health check
    if (url === "/api/health" && req.method === "GET") {
      const modelCount = Object.keys(config.models).length;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", models: modelCount }));
      return;
    }

    // Session list
    if (url === "/api/sessions" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(SessionManager.listSessions()));
      return;
    }

    // Static files — inject initial state into index.html
    const filePath = url === "/" ? "/index.html" : url;
    if ((url === "/" || url === "/index.html") && STATIC_DIR) {
      const htmlPath = path.join(STATIC_DIR, "index.html");
      if (fs.existsSync(htmlPath)) {
        const html = fs.readFileSync(htmlPath, "utf-8");
        const stateJson = JSON.stringify({ ...mgr.getState(), sessionId });
        const injected = html.replace("<!-- __INITIAL_STATE__ -->", `<script>window.__INITIAL_STATE__=${stateJson};</script><!-- __INITIAL_STATE__ -->`);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(injected);
        return;
      }
    }
    serveStatic(res, filePath);
  });

  // ── WebSocket ───────────────────────────────────────────────

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WebSocket) => {
    // Send initial state on connect
    safeSend(ws, { type: "state", ...mgr.getState(), sessionId });

    // ── Keep-alive ping: detect dead connections every 30s ──
    const pingInterval = setInterval(() => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      } catch {
        // Connection already dead — cleanup handles it
      }
    }, 30000);

    ws.on("message", (data: Buffer) => {
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        safeSend(ws, { type: "error", message: "Invalid JSON" });
        return;
      }
      handleWsMessage(ws, msg);
    });

    ws.on("close", () => {
      clearInterval(pingInterval);
    });

    ws.on("error", (err: Error) => {
      console.error("[ws] Connection error:", err.message);
      clearInterval(pingInterval);
    });
  });

  wss.on("error", (err: Error) => {
    console.error("[wss] WebSocketServer error:", err.message);
    // Don't crash — the server keeps running, clients will reconnect
  });

  // ── WebSocket message handler ───────────────────────────────

  async function handleWsMessage(ws: WebSocket, msg: any) {
    const { type, ...payload } = msg;

    switch (type) {
      case "submit": {
        // Fire-and-forget — LLM API calls are async, don't block WS message loop
        const text = payload.text ?? "";
        const mode = payload.mode ?? "broadcast";
        (async () => {
          try {
            let stream: AsyncGenerator<any>;
            if (mode === "deliberation") {
              stream = mgr.deliberate(text);
            } else if (mode === "team_chat" && payload.modelName) {
              stream = mgr.teamChat(payload.modelName, text);
            } else {
              stream = mgr.broadcast(text);
            }
            let eventCount = 0;
            for await (const event of stream) {
              eventCount++;
              safeSend(ws, event);
            }
            console.log(`[ws] Submit complete: ${eventCount} events, mode=${mode}`);
            safeSend(ws, { type: "state", ...mgr.getState(), sessionId });
          } catch (err: any) {
            console.error("[ws] Submit error:", err.message || err);
            safeSend(ws, { type: "error", message: err.message || String(err) });
          }
        })();
        break;
      }

      case "permission": {
        mgr.respondPermission(payload.decision);
        safeSend(ws, { type: "state", ...mgr.getState(), sessionId });
        break;
      }

      case "mute": {
        mgr.toggleMute(payload.modelName);
        safeSend(ws, { type: "state", ...mgr.getState(), sessionId });
        break;
      }

      case "reset": {
        mgr.resetModel(payload.modelName);
        safeSend(ws, { type: "state", ...mgr.getState(), sessionId });
        break;
      }

      case "mode": {
        mgr.setTarget(payload.mode, payload.modelName);
        safeSend(ws, { type: "state", ...mgr.getState(), sessionId });
        break;
      }

      case "save": {
        const saved = mgr.save(sessionId);
        safeSend(ws, { type: "saved", session: saved });
        break;
      }

      case "resume": {
        const restored = SessionManager.resume(payload.sessionId, config);
        if (!restored) {
          safeSend(ws, { type: "error", message: "Session not found" });
          return;
        }
        // Replace the session manager with the restored one
        mgr = restored;
        sessionId = payload.sessionId;
        safeSend(ws, { type: "state", ...mgr.getState(), sessionId });
        break;
      }

      case "state": {
        safeSend(ws, { type: "state", ...mgr.getState(), sessionId });
        break;
      }

      default:
        safeSend(ws, { type: "error", message: `Unknown command: ${type}` });
    }
  }

  // ── Helper: send JSON, ignore closed-socket errors ─────────

  function safeSend(ws: WebSocket, payload: any) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    } catch (err: any) {
      // Connection may have closed mid-stream — silently drop
      if (!err.message?.includes("CLOSED") && !err.message?.includes("CLOSING")) {
        console.error("[ws] Send error:", err.message || err);
      }
    }
  }

  // ── HTTP command handler (backward compatibility) ───────────

  /** Build a .multiarenarc TOML string from web UI config. */
  function buildConfigTOML(cfg: any): string {
    let toml = "";
    const names: string[] = [];
    for (const m of cfg.models ?? []) {
      const name = (m.nickname || m.name || "model").replace(/[^a-zA-Z0-9_-]/g, "_");
      names.push(name);
      toml += `[models.${name}]\n`;
      toml += `provider = "${m.provider ?? "openai"}"\n`;
      toml += `model = "${m.model ?? m.name ?? name}"\n`;
      toml += `api_key = "${m.api_key ?? ""}"\n`;
      if (m.endpoint) toml += `endpoint = "${m.endpoint}"\n`;
      toml += "\n";
    }
    toml += "[defaults]\n";
    toml += `active = [${names.map((n) => `"${n}"`).join(", ")}]\n`;
    toml += "broadcast = true\n";
    return toml;
  }

  async function handleCommand(msg: any, res: http.ServerResponse) {
    const { type, ...payload } = msg;

    switch (type) {
      case "submit": {
        // Return immediately; process in background. Client polls /api/cmd state.
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));

        const text = payload.text ?? "";
        const mode = payload.mode ?? "broadcast";
        (async () => {
          try {
            if (mode === "deliberation") {
              for await (const _event of mgr.deliberate(text)) { /* consumed */ }
            } else if (mode === "team_chat" && payload.modelName) {
              for await (const _event of mgr.teamChat(payload.modelName, text)) { /* consumed */ }
            } else {
              for await (const _event of mgr.broadcast(text)) { /* consumed */ }
            }
          } catch (err: any) {
            console.error("[submit bg]", err.message);
          }
        })();
        break;
      }

      case "permission": {
        mgr.respondPermission(payload.decision);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        break;
      }

      case "mute": {
        mgr.toggleMute(payload.modelName);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(mgr.getState()));
        break;
      }

      case "mode": {
        mgr.setTarget(payload.mode, payload.modelName);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(mgr.getState()));
        break;
      }

      case "reset": {
        mgr.resetModel(payload.modelName);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(mgr.getState()));
        break;
      }

      case "save": {
        const saved = mgr.save(sessionId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(saved));
        break;
      }

      case "resume": {
        const restored = SessionManager.resume(payload.sessionId, config);
        if (!restored) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Session not found" }));
          return;
        }
        mgr = restored;
        sessionId = payload.sessionId;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(restored.getState()));
        break;
      }

      case "state": {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ...mgr.getState(), sessionId }));
        break;
      }

      default:
        res.writeHead(400);
        res.end(JSON.stringify({ error: `Unknown command: ${type}` }));
    }
  }

  // ── Server-level error handling: NEVER crash ────────────────

  server.on("error", (err: Error) => {
    console.error("[server] HTTP server error:", err.message);
    if ((err as any).code === "EADDRINUSE") {
      console.error(`[server] Port ${port} is already in use. Please stop the other process or use a different port (MULTIARENA_PORT env var).`);
      process.exit(1);
    }
    // Other errors: log but don't crash
  });

  process.on("uncaughtException", (err: Error) => {
    console.error("[process] Uncaught exception:", err.message || err);
    console.error(err.stack);
    // Don't exit — keep the server running
  });

  process.on("unhandledRejection", (reason: any) => {
    console.error("[process] Unhandled rejection:", reason?.message || reason);
    if (reason?.stack) console.error(reason.stack);
    // Don't exit — keep the server running
  });

  // Never crash — catch all unhandled errors
  process.on("uncaughtException", (err) => {
    console.error("[process] uncaughtException:", err.message);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[process] unhandledRejection:", reason);
  });

  server.listen(port, HOST, () => {
    console.log(`\n  multiarena web → http://${HOST}:${port}\n`);
  });

  return server;
}
