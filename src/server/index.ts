/**
 * HTTP + SSE server for multiarena --web mode.
 *
 * Zero extra dependencies — uses Node.js built-in http module.
 * SSE for server→client streaming, HTTP POST for client→server commands.
 */
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig } from "../config/loader.js";
import { SessionManager } from "./sessionManager.js";

const PORT = parseInt(process.env.MULTIARENA_PORT ?? "3000", 10);
const HOST = "127.0.0.1";

// ── SSE Helpers ─────────────────────────────────────────────────

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
  "Access-Control-Allow-Origin": "*",
};

function sendSSE(res: http.ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

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
  const mgr = new SessionManager(config);
  let sessionId = Date.now().toString(36);

  // Connected SSE clients — broadcast events to all
  const sseClients = new Set<http.ServerResponse>();

  function broadcastSSE(event: string, data: unknown) {
    for (const client of sseClients) {
      try { sendSSE(client, event, data); } catch {}
    }
  }

  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";

    // SSE stream endpoint
    if (url === "/api/stream" && req.method === "GET") {
      res.writeHead(200, SSE_HEADERS);
      res.flushHeaders(); // Critical: flush headers immediately for SSE
      sseClients.add(res);

      // Send initial state + immediate comment to flush
      sendSSE(res, "state", { ...mgr.getState(), sessionId });
      res.write(":\n\n"); // flush

      // Keep alive every 5s (browsers may close idle connections >15s)
      const keepAlive = setInterval(() => {
        try { res.write(":\n\n"); } catch { clearInterval(keepAlive); sseClients.delete(res); }
      }, 5000);

      req.on("close", () => {
        clearInterval(keepAlive);
        sseClients.delete(res);
        try { res.end(); } catch {}
      });

      return;
    }

    // POST endpoint for commands
    if (url === "/api/cmd" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const msg = JSON.parse(body);
          await handleCommand(msg, res);
        } catch (err: any) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: err.message }));
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
          res.writeHead(400);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
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
        const injected = html.replace("</body>", `<script>window.__INITIAL_STATE__=${stateJson};</script></body>`);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(injected);
        return;
      }
    }
    serveStatic(res, filePath);
  });

  // ── Command handler ──────────────────────────────────────────

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
        // Stream results directly back — same pattern as CLI's runTurn()
        res.writeHead(200, {
          "Content-Type": "application/x-ndjson",
          "Transfer-Encoding": "chunked",
          "Cache-Control": "no-cache",
        });

        const text = payload.text ?? "";
        const mode = payload.mode ?? "broadcast";
        try {
          if (mode === "deliberation") {
            for await (const event of mgr.deliberate(text)) {
              res.write(JSON.stringify({ type: "deliberation", event }) + "\n");
            }
          } else if (mode === "team_chat" && payload.modelName) {
            for await (const event of mgr.teamChat(payload.modelName, text)) {
              res.write(JSON.stringify(event) + "\n");
            }
          } else {
            for await (const event of mgr.broadcast(text)) {
              res.write(JSON.stringify(event) + "\n");
            }
          }
          // Send final state
          res.write(JSON.stringify({ type: "state", ...mgr.getState(), sessionId }) + "\n");
        } catch (err: any) {
          res.write(JSON.stringify({ type: "error", message: err.message }) + "\n");
        }
        res.end();
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

  server.listen(port, HOST, () => {
    console.log(`\n  multiarena web → http://${HOST}:${port}\n`);
  });

  return server;
}
