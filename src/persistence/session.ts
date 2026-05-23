import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const SESSIONS_DIR = path.join(os.homedir(), ".multiarena", "sessions");

export interface SavedSession {
  id: string;
  timestamp: string;
  models: Array<{
    name: string;
    messages: Array<{ role: string; content: string; tool_call_id?: string }>;
    buffer: string;
  }>;
  lastTarget: "broadcast" | string;
}

export function saveSession(session: SavedSession): void {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const filePath = path.join(SESSIONS_DIR, `${session.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
}

export function loadSession(id: string): SavedSession | null {
  const filePath = path.join(SESSIONS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as SavedSession;
}

export function listSessions(): SavedSession[] {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  return fs
    .readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const data = JSON.parse(
        fs.readFileSync(path.join(SESSIONS_DIR, f), "utf-8"),
      ) as SavedSession;
      return data;
    })
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
}
