/**
 * HTTP server for multiarena --web mode.
 *
 * Zero extra dependencies — uses Node.js built-in http module.
 * Initial state is injected into index.html. Streaming responses via NDJSON on /api/cmd submit.
 */
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
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
  const mgr = new SessionManager(config);
  let sessionId = Date.now().toString(36);

  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";

    // POST endpoint for commands
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
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
          "Cache-Control": "no-cache",
        });

        let closed = false;
        const safeWrite = (data: string) => {
          if (closed) return;
          try {
            res.write(data);
          } catch {
            closed = true;
          }
        };

        res.on("close", () => {
          closed = true;
          clearTimeout(timeout);
        });

        const timeout = setTimeout(() => {
          console.error("[submit] Timeout after 60s");
          safeWrite(JSON.stringify({ type: "error", message: "Request timeout after 60s" }) + "\n");
          if (!res.writableEnded) res.end();
        }, 60_000);

        const text = payload.text ?? "";
        const mode = payload.mode ?? "broadcast";
        try {
          if (mode === "deliberation") {
            for await (const event of mgr.deliberate(text)) {
              if (closed) break;
              safeWrite(JSON.stringify({ type: "deliberation", event }) + "\n");
            }
          } else if (mode === "team_chat" && payload.modelName) {
            for await (const event of mgr.teamChat(payload.modelName, text)) {
              if (closed) break;
              safeWrite(JSON.stringify(event) + "\n");
            }
          } else {
            for await (const event of mgr.broadcast(text)) {
              if (closed) break;
              safeWrite(JSON.stringify(event) + "\n");
            }
          }
          clearTimeout(timeout);
          safeWrite(JSON.stringify({ type: "state", ...mgr.getState(), sessionId }) + "\n");
        } catch (err: any) {
          clearTimeout(timeout);
          console.error("[submit] Error:", err.message || err);
          safeWrite(JSON.stringify({ type: "error", message: err.message || String(err) }) + "\n");
        }
        if (!res.writableEnded) res.end();
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
