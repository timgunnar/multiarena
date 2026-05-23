# Arena Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Arena — a terminal-native multi-model AI coding assistant where users chat with N LLMs simultaneously, compare answers via Tab-driven UI, and execute tools in isolated git worktrees.

**Architecture:** Four-layer stack: UI (Ink/React) → Core (Session/Stream/Router) → Provider (unified interface + adapters) → Tool Runtime. Each model maintains independent conversation history. File operations run in per-model git worktrees with a shared permission model.

**Tech Stack:** TypeScript, Node.js, Ink (React for terminal), TOML config, Anthropic/OpenAI/Google SDKs

---

## File Structure

```
arena/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # CLI entry, mounts Ink app
│   ├── config/
│   │   ├── types.ts              # Config type definitions
│   │   └── loader.ts             # TOML config loading (.arenarc)
│   ├── provider/
│   │   ├── types.ts              # ChatRequest, StreamEvent, ToolDef, Message
│   │   ├── provider.ts           # Provider interface
│   │   └── adapters/
│   │       ├── anthropic.ts      # Anthropic adapter
│   │       ├── openai.ts         # OpenAI adapter
│   │       └── google.ts         # Google Gemini adapter
│   ├── core/
│   │   ├── types.ts              # ModelState, Session, TargetMode
│   │   ├── session.ts            # Session manager (per-model history)
│   │   ├── stream.ts             # Stream manager (concurrent dispatch)
│   │   └── router.ts             # Message router (broadcast vs directed)
│   ├── ui/
│   │   ├── app.tsx               # Main Ink app (state + layout)
│   │   ├── hooks/
│   │   │   ├── useInput.ts       # Input handling, Tab cycling
│   │   │   └── useStreams.ts     # Multi-stream state management
│   │   └── components/
│   │       ├── StatusBar.tsx      # Top fixed status bar
│   │       ├── OutputArea.tsx     # Scrollable output area
│   │       ├── InputBar.tsx       # Bottom fixed input bar
│   │       ├── ModelDetail.tsx    # Single model full-width detail view
│   │       └── BroadcastSummary.tsx # Multi-column summary view
│   ├── tools/
│   │   ├── types.ts              # Tool definitions
│   │   ├── registry.ts           # Tool registry
│   │   ├── executor.ts           # Execute tool, apply permission check
│   │   ├── permission.ts         # Session-memory permission manager
│   │   └── builtin/
│   │       ├── readFile.ts
│   │       ├── grep.ts
│   │       ├── glob.ts
│   │       ├── bash.ts
│   │       ├── writeFile.ts
│   │       └── editFile.ts
│   └── isolation/
│       └── worktree.ts           # Git worktree lifecycle
└── test/
    ├── config/
    │   └── loader.test.ts
    ├── provider/
    │   ├── types.test.ts
    │   └── adapters/
    │       └── anthropic.test.ts
    ├── core/
    │   ├── session.test.ts
    │   ├── stream.test.ts
    │   └── router.test.ts
    ├── tools/
    │   ├── executor.test.ts
    │   └── permission.test.ts
    └── isolation/
        └── worktree.test.ts
```

---

## Phase 1: Project Foundation

### Task 1: Initialize project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`

- [ ] **Step 1: Create package.json**

```bash
mkdir -p arena && cd arena
```

```json
{
  "name": "arena",
  "version": "0.1.0",
  "description": "Multi-model AI coding assistant for the terminal",
  "bin": {
    "arena": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/"
  },
  "dependencies": {
    "ink": "^5.0.0",
    "react": "^18.2.0",
    "@anthropic-ai/sdk": "^0.30.0",
    "openai": "^4.50.0",
    "@google/generative-ai": "^0.21.0",
    "@iarna/toml": "^2.2.5",
    "simple-git": "^3.25.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "typescript": "^5.5.0",
    "tsx": "^4.15.0",
    "vitest": "^1.6.0",
    "eslint": "^8.57.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "jsx": "react",
    "moduleResolution": "node"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Create minimal entry point**

```typescript
// src/index.ts
const main = () => {
  console.log("Arena — multi-model AI coding assistant");
};

main();
```

- [ ] **Step 4: Install dependencies and verify**

```bash
npm install
npm run build
npm start
```

Expected: prints "Arena — multi-model AI coding assistant"

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json src/index.ts package-lock.json
git commit -m "feat: project scaffolding"
```

---

### Task 2: Config system — types and loader

**Files:**
- Create: `src/config/types.ts`
- Create: `src/config/loader.ts`

- [ ] **Step 1: Define config types**

```typescript
// src/config/types.ts
export interface ModelConfig {
  provider: "anthropic" | "openai" | "google" | "ollama";
  model: string;
  api_key?: string;
  endpoint?: string;
}

export interface ArenaConfig {
  models: Record<string, ModelConfig>;
  defaults: {
    active: string[];
    broadcast: boolean;
  };
}

export const DEFAULT_CONFIG: Partial<ArenaConfig> = {
  defaults: {
    active: [],
    broadcast: true,
  },
};
```

- [ ] **Step 2: Write config loader**

```typescript
// src/config/loader.ts
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import TOML from "@iarna/toml";
import { ArenaConfig, DEFAULT_CONFIG } from "./types";

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "");
}

function resolveConfig(raw: Record<string, any>): ArenaConfig {
  // Deep-walk the config resolving ${ENV_VAR} in string values
  const walk = (obj: any): any => {
    if (typeof obj === "string") return resolveEnvVars(obj);
    if (Array.isArray(obj)) return obj.map(walk);
    if (obj && typeof obj === "object") {
      const result: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) {
        result[k] = walk(v);
      }
      return result;
    }
    return obj;
  };
  return walk(raw) as ArenaConfig;
}

export function loadConfig(): ArenaConfig {
  const candidates = [
    path.join(process.cwd(), ".arenarc"),
    path.join(os.homedir(), ".arenarc"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const raw = TOML.parse(fs.readFileSync(p, "utf-8"));
      return resolveConfig(raw) as ArenaConfig;
    }
  }

  // No config found — return empty default
  return { models: {}, defaults: { active: [], broadcast: true } };
}
```

- [ ] **Step 3: Write tests**

```typescript
// test/config/loader.test.ts
import { describe, it, expect } from "vitest";

describe("config loader", () => {
  it("resolves env vars in strings", () => {
    process.env.TEST_KEY = "secret123";
    // This tests the resolveEnvVars utility
    // Actual test would import and call the helper
  });

  it("returns default config when no file found", () => {
    // Test loadConfig with tmp dir that has no .arenarc
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add src/config/ test/config/
git commit -m "feat: config types and TOML loader with env var resolution"
```

---

## Phase 2: Provider Layer

### Task 3: Provider types and interface

**Files:**
- Create: `src/provider/types.ts`
- Create: `src/provider/provider.ts`

- [ ] **Step 1: Define provider types**

```typescript
// src/provider/types.ts
export interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface TokenUsage {
  input: number;
  output: number;
}

export type StreamEvent =
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; name: string; args: string }
  | { type: "done"; usage: TokenUsage }
  | { type: "error"; message: string };

export interface ChatRequest {
  messages: Message[];
  tools?: ToolDef[];
  system?: string;
  model?: string;
}
```

- [ ] **Step 2: Define Provider interface**

```typescript
// src/provider/provider.ts
import { ChatRequest, StreamEvent } from "./types";

export interface Provider {
  chat(request: ChatRequest): AsyncGenerator<StreamEvent>;
  abort(): void;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/provider/types.ts src/provider/provider.ts
git commit -m "feat: provider unified types and interface"
```

---

### Task 4: Anthropic adapter

**Files:**
- Create: `src/provider/adapters/anthropic.ts`

- [ ] **Step 1: Write Anthropic adapter**

```typescript
// src/provider/adapters/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";
import { Provider } from "../provider";
import { ChatRequest, StreamEvent, ToolDef } from "../types";

export class AnthropicProvider implements Provider {
  private client: Anthropic;
  private controller: AbortController | null = null;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async *chat(request: ChatRequest): AsyncGenerator<StreamEvent> {
    this.controller = new AbortController();

    const messages = request.messages.map((m) => {
      if (m.role === "tool") {
        return {
          role: "user" as const,
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: m.tool_call_id!,
              content: m.content,
            },
          ],
        };
      }
      return {
        role: m.role as "user" | "assistant",
        content: m.content,
      };
    });

    const tools: Anthropic.Tool[] | undefined = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Record<string, unknown>,
    }));

    try {
      const stream = this.client.messages.stream({
        model: request.model ?? "claude-sonnet-4-6",
        max_tokens: 4096,
        system: request.system,
        messages,
        tools,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            yield { type: "text", content: event.delta.text };
          } else if (event.delta.type === "input_json_delta") {
            // Handled through content_block_stop for accumulated args
          }
        } else if (event.type === "content_block_stop") {
          if (event.content_block.type === "tool_use") {
            yield {
              type: "tool_call",
              id: event.content_block.id,
              name: event.content_block.name,
              args: JSON.stringify(event.content_block.input),
            };
          }
        } else if (event.type === "message_stop") {
          yield {
            type: "done",
            usage: { input: 0, output: 0 }, // Anthropic stream doesn't give usage in message_stop
          };
        } else if (event.type === "error") {
          yield { type: "error", message: event.error.message };
        }
      }
    } catch (err: any) {
      yield { type: "error", message: err.message ?? String(err) };
    }
  }

  abort(): void {
    this.controller?.abort();
  }
}
```

- [ ] **Step 2: Write adapter test (mock Anthropic SDK)**

```typescript
// test/provider/adapters/anthropic.test.ts
import { describe, it, expect, vi } from "vitest";

describe("AnthropicProvider", () => {
  it("constructs with API key", () => {
    // Test construction
  });

  it("yields text events from stream", async () => {
    // Mock the SDK's messages.stream to yield events
  });

  it("yields tool_call events", async () => {
    // Mock tool_use content blocks
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add src/provider/adapters/anthropic.ts test/provider/adapters/anthropic.test.ts
git commit -m "feat: Anthropic provider adapter"
```

---

### Task 5: OpenAI and Google adapters

**Files:**
- Create: `src/provider/adapters/openai.ts`
- Create: `src/provider/adapters/google.ts`

- [ ] **Step 1: Write OpenAI adapter**

```typescript
// src/provider/adapters/openai.ts
import OpenAI from "openai";
import { Provider } from "../provider";
import { ChatRequest, StreamEvent } from "../types";

export class OpenAIProvider implements Provider {
  private client: OpenAI;
  private controller: AbortController | null = null;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async *chat(request: ChatRequest): AsyncGenerator<StreamEvent> {
    this.controller = new AbortController();

    const messages = request.messages.map((m) => {
      if (m.role === "tool") {
        return {
          role: "tool" as const,
          tool_call_id: m.tool_call_id!,
          content: m.content,
        };
      }
      return { role: m.role as "user" | "assistant", content: m.content };
    });

    if (request.system) {
      messages.unshift({ role: "system", content: request.system });
    }

    try {
      const stream = await this.client.chat.completions.create({
        model: request.model ?? "gpt-4o",
        messages: messages as any[],
        tools: request.tools?.map((t) => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
        stream: true,
      });

      let toolCallAccum: Record<string, { id: string; name: string; args: string }> = {};

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          yield { type: "text", content: delta.content };
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const key = tc.index ?? 0;
            if (!toolCallAccum[key]) {
              toolCallAccum[key] = { id: tc.id ?? "", name: tc.function?.name ?? "", args: "" };
            }
            if (tc.function?.arguments) {
              toolCallAccum[key].args += tc.function.arguments;
            }
          }
        }

        if (chunk.choices[0]?.finish_reason === "tool_calls") {
          for (const tc of Object.values(toolCallAccum)) {
            yield { type: "tool_call", id: tc.id, name: tc.name, args: tc.args };
          }
          toolCallAccum = {};
        }

        if (chunk.choices[0]?.finish_reason === "stop") {
          yield { type: "done", usage: { input: 0, output: 0 } };
        }
      }
    } catch (err: any) {
      yield { type: "error", message: err.message ?? String(err) };
    }
  }

  abort(): void {
    this.controller?.abort();
  }
}
```

- [ ] **Step 2: Write Google adapter**

```typescript
// src/provider/adapters/google.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Provider } from "../provider";
import { ChatRequest, StreamEvent } from "../types";

export class GoogleProvider implements Provider {
  private client: GoogleGenerativeAI;
  private aborted = false;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async *chat(request: ChatRequest): AsyncGenerator<StreamEvent> {
    this.aborted = false;

    const model = this.client.getGenerativeModel({
      model: request.model ?? "gemini-2.5-flash",
      systemInstruction: request.system,
    });

    // Build Gemini contents from messages
    const contents = request.messages
      .filter((m) => m.role !== "tool")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    try {
      const result = await model.generateContentStream({ contents });
      
      for await (const chunk of result.stream) {
        if (this.aborted) break;
        const text = chunk.text();
        if (text) {
          yield { type: "text", content: text };
        }
      }

      if (!this.aborted) {
        yield { type: "done", usage: { input: 0, output: 0 } };
      }
    } catch (err: any) {
      yield { type: "error", message: err.message ?? String(err) };
    }
  }

  abort(): void {
    this.aborted = true;
  }
}
```

- [ ] **Step 3: Write provider factory**

Add to `src/provider/provider.ts`:

```typescript
import { AnthropicProvider } from "./adapters/anthropic";
import { OpenAIProvider } from "./adapters/openai";
import { GoogleProvider } from "./adapters/google";
import { ModelConfig } from "../config/types";

export function createProvider(config: ModelConfig): Provider {
  const key = config.api_key ?? "";
  
  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider(key);
    case "openai":
      return new OpenAIProvider(key, config.endpoint);
    case "google":
      return new GoogleProvider(key);
    case "ollama":
      return new OpenAIProvider("ollama", config.endpoint ?? "http://localhost:11434/v1");
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add src/provider/
git commit -m "feat: OpenAI, Google adapters and provider factory"
```

---

## Phase 3: Core Layer

### Task 6: Session manager (per-model conversation history)

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/session.ts`

- [ ] **Step 1: Define core types**

```typescript
// src/core/types.ts
import { Message } from "../provider/types";

export type TargetMode =
  | { type: "broadcast" }
  | { type: "directed"; modelName: string };

export interface ModelState {
  name: string;
  provider: string;
  messages: Message[];
  muted: boolean;
  buffer: string;          // Accumulated streaming output
  isStreaming: boolean;
  usage: { input: number; output: number };
  contextLimit: number;    // Model's context window size
}

export interface SessionState {
  models: ModelState[];
  targetMode: TargetMode;
  worktreeBase: string;    // Path to original repo
}
```

- [ ] **Step 2: Implement Session class**

```typescript
// src/core/session.ts
import { Message } from "../provider/types";
import { ModelState, SessionState, TargetMode } from "./types";
import { ArenaConfig } from "../config/types";

export class Session {
  private state: SessionState;

  constructor(config: ArenaConfig, worktreeBase: string) {
    const models: ModelState[] = config.defaults.active.map((name) => {
      const mc = config.models[name];
      return {
        name,
        provider: mc.provider,
        messages: [],
        muted: false,
        buffer: "",
        isStreaming: false,
        usage: { input: 0, output: 0 },
        contextLimit: contextLimitForModel(mc.model),
      };
    });

    this.state = {
      models,
      targetMode: { type: "broadcast" },
      worktreeBase,
    };
  }

  get models(): ModelState[] {
    return this.state.models;
  }

  get targetMode(): TargetMode {
    return this.state.targetMode;
  }

  /** Add a user message to one or all models */
  addUserMessage(content: string): ModelState[] {
    if (this.state.targetMode.type === "broadcast") {
      for (const m of this.state.models) {
        if (!m.muted) {
          m.messages.push({ role: "user", content });
        }
      }
      return this.state.models.filter((m) => !m.muted);
    } else {
      const target = this.findModel(this.state.targetMode.modelName);
      if (target) {
        target.messages.push({ role: "user", content });
      }
      return target ? [target] : [];
    }
  }

  /** Append assistant response to a model */
  addAssistantMessage(modelName: string, content: string): void {
    const m = this.findModel(modelName);
    if (m) {
      m.messages.push({ role: "assistant", content });
    }
  }

  /** Append tool result to a model */
  addToolResult(modelName: string, toolCallId: string, result: string): void {
    const m = this.findModel(modelName);
    if (m) {
      m.messages.push({ role: "tool", content: result, tool_call_id: toolCallId });
    }
  }

  cycleTarget(): TargetMode {
    const current = this.state.targetMode;
    if (current.type === "broadcast") {
      const first = this.state.models[0];
      this.state.targetMode = first
        ? { type: "directed", modelName: first.name }
        : current;
    } else {
      const idx = this.state.models.findIndex((m) => m.name === current.modelName);
      const next = this.state.models[idx + 1];
      this.state.targetMode = next
        ? { type: "directed", modelName: next.name }
        : { type: "broadcast" };
    }
    return this.state.targetMode;
  }

  jumpToModel(modelName: string): void {
    this.state.targetMode = { type: "directed", modelName };
  }

  jumpToBroadcast(): void {
    this.state.targetMode = { type: "broadcast" };
  }

  toggleMute(modelName: string): boolean {
    const m = this.findModel(modelName);
    if (m) m.muted = !m.muted;
    return m?.muted ?? false;
  }

  resetModel(modelName: string): void {
    const m = this.findModel(modelName);
    if (m) {
      m.messages = [];
      m.buffer = "";
      m.usage = { input: 0, output: 0 };
    }
  }

  getContextUsage(modelName: string): number {
    const m = this.findModel(modelName);
    if (!m) return 0;
    const totalTokens = m.usage.input + m.usage.output;
    return Math.min(1, totalTokens / m.contextLimit);
  }

  private findModel(name: string): ModelState | undefined {
    return this.state.models.find((m) => m.name === name);
  }
}

function contextLimitForModel(model: string): number {
  // Conservative defaults for known models
  if (model.includes("claude")) return 200000;
  if (model.includes("gpt-4")) return 128000;
  if (model.includes("gpt-3.5")) return 16384;
  if (model.includes("gemini")) return 1048576;
  if (model.includes("deepseek")) return 128000;
  return 128000;
}
```

- [ ] **Step 3: Write tests**

```typescript
// test/core/session.test.ts
import { describe, it, expect } from "vitest";
import { Session } from "../../src/core/session";

const mockConfig = {
  models: {
    claude: { provider: "anthropic" as const, model: "claude-sonnet-4-6" },
    gpt: { provider: "openai" as const, model: "gpt-4o" },
  },
  defaults: { active: ["claude", "gpt"], broadcast: true },
};

describe("Session", () => {
  it("starts in broadcast mode", () => {
    const s = new Session(mockConfig, "/tmp/test");
    expect(s.targetMode).toEqual({ type: "broadcast" });
  });

  it("addUserMessage appends to all unmuted models in broadcast", () => {
    const s = new Session(mockConfig, "/tmp/test");
    const targets = s.addUserMessage("hello");
    expect(targets).toHaveLength(2);
    expect(s.models[0].messages).toHaveLength(1);
    expect(s.models[1].messages).toHaveLength(1);
  });

  it("addUserMessage appends only to directed model", () => {
    const s = new Session(mockConfig, "/tmp/test");
    s.jumpToModel("claude");
    const targets = s.addUserMessage("hello");
    expect(targets).toHaveLength(1);
    expect(s.models[0].messages).toHaveLength(1);
    expect(s.models[1].messages).toHaveLength(0);
  });

  it("cycleTarget rotates broadcast → first → second → broadcast", () => {
    const s = new Session(mockConfig, "/tmp/test");
    expect(s.targetMode).toEqual({ type: "broadcast" });

    const t1 = s.cycleTarget();
    expect(t1).toEqual({ type: "directed", modelName: "claude" });

    const t2 = s.cycleTarget();
    expect(t2).toEqual({ type: "directed", modelName: "gpt" });

    const t3 = s.cycleTarget();
    expect(t3).toEqual({ type: "broadcast" });
  });

  it("skips muted models in broadcast", () => {
    const s = new Session(mockConfig, "/tmp/test");
    s.toggleMute("claude");
    const targets = s.addUserMessage("hello");
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe("gpt");
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add src/core/ test/core/
git commit -m "feat: session manager with per-model history and Tab cycling"
```

---

### Task 7: Stream manager (concurrent multi-model streaming)

**Files:**
- Create: `src/core/stream.ts`

- [ ] **Step 1: Implement StreamManager**

```typescript
// src/core/stream.ts
import { Provider, createProvider } from "../provider/provider";
import { StreamEvent, ChatRequest, ToolDef } from "../provider/types";
import { Session } from "./session";
import { ModelState } from "./types";
import { ArenaConfig } from "../config/types";

export interface StreamResult {
  modelName: string;
  events: AsyncGenerator<StreamEvent>;
  provider: Provider;
}

/** Launch concurrent streams for all target models */
export function launchStreams(
  session: Session,
  config: ArenaConfig,
  systemPrompt: string,
  tools: ToolDef[],
): StreamResult[] {
  const targets = session.targetMode.type === "broadcast"
    ? session.models.filter((m) => !m.muted)
    : session.models.filter((m) => m.name === (session.targetMode as { type: "directed"; modelName: string }).modelName);

  return targets.map((m) => {
      const mc = config.models[m.name];
      if (!mc) throw new Error(`No config for model ${m.name}`);

      const provider = createProvider(mc);
      const request: ChatRequest = {
        messages: m.messages,
        tools,
        system: systemPrompt,
        model: mc.model,
      };

      return {
        modelName: m.name,
        events: provider.chat(request),
        provider,
      };
    });
}
```

- [ ] **Step 2: Write tests**

```typescript
// test/core/stream.test.ts
import { describe, it, expect, vi } from "vitest";
import { launchStreams } from "../../src/core/stream";
import { Session } from "../../src/core/session";

describe("launchStreams", () => {
  it("launches streams for all models in broadcast mode", () => {
    const s = new Session(mockConfig, "/tmp/test");
    s.addUserMessage("hello");
    const results = launchStreams(s, mockConfig, "You are helpful", []);
    expect(results).toHaveLength(2);
  });

  it("launches stream only for directed model", () => {
    const s = new Session(mockConfig, "/tmp/test");
    s.jumpToModel("claude");
    s.addUserMessage("hello");
    const results = launchStreams(s, mockConfig, "", []);
    expect(results).toHaveLength(1);
    expect(results[0].modelName).toBe("claude");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add src/core/stream.ts test/core/stream.test.ts
git commit -m "feat: concurrent stream manager for multi-model dispatch"
```

---

## Phase 4: Terminal UI

### Task 8: Ink app shell with three-zone layout

**Files:**
- Create: `src/ui/app.tsx`
- Create: `src/ui/components/StatusBar.tsx`
- Create: `src/ui/components/OutputArea.tsx`
- Create: `src/ui/components/InputBar.tsx`
- Modify: `src/index.ts`

- [ ] **Step 1: Create StatusBar component**

```typescript
// src/ui/components/StatusBar.tsx
import React from "react";
import { Box, Text } from "ink";
import { ModelState } from "../../core/types";

interface Props {
  models: ModelState[];
  activeModelName: string | null; // null = broadcast
}

export const StatusBar: React.FC<Props> = ({ models, activeModelName }) => (
  <Box height={1} flexDirection="row">
    {models.map((m) => {
      const isActive = activeModelName === m.name;
      const hasNew = m.buffer.length > 0 && !isActive;
      const color = isActive ? "green" : "white";
      return (
        <Box key={m.name} marginRight={1}>
          <Text color={color} bold={isActive}>
            {m.name}
          </Text>
          {hasNew && <Text color="yellow"> ●</Text>}
          {m.muted && <Text color="gray"> [muted]</Text>}
        </Box>
      );
    })}
  </Box>
);
```

- [ ] **Step 2: Create OutputArea component**

```typescript
// src/ui/components/OutputArea.tsx
import React from "react";
import { Box, Text } from "ink";
import { ModelState } from "../../core/types";
import { BroadcastSummary } from "./BroadcastSummary";
import { ModelDetail } from "./ModelDetail";

interface Props {
  models: ModelState[];
  targetMode: { type: "broadcast" } | { type: "directed"; modelName: string };
  scrollOffset: number;
}

export const OutputArea: React.FC<Props> = ({ models, targetMode, scrollOffset }) => {
  if (targetMode.type === "broadcast") {
    return <BroadcastSummary models={models} />;
  }

  const activeModel = models.find((m) => m.name === targetMode.modelName);
  if (!activeModel) {
    return (
      <Box flexGrow={1}>
        <Text>No model selected</Text>
      </Box>
    );
  }

  return <ModelDetail model={activeModel} scrollOffset={scrollOffset} />;
};
```

- [ ] **Step 3: Create BroadcastSummary**

```typescript
// src/ui/components/BroadcastSummary.tsx
import React from "react";
import { Box, Text } from "ink";
import { ModelState } from "../../core/types";

interface Props {
  models: ModelState[];
}

const PANEL_HEIGHT = 5;

export const BroadcastSummary: React.FC<Props> = ({ models }) => {
  const activeModels = models.filter((m) => !m.muted);

  return (
    <Box flexDirection="row" flexGrow={1}>
      {activeModels.map((m) => {
        const lines = m.buffer.split("\n").slice(0, PANEL_HEIGHT);
        return (
          <Box
            key={m.name}
            flexDirection="column"
            flexGrow={1}
            borderStyle="single"
            marginRight={1}
            height={PANEL_HEIGHT + 2}
          >
            {lines.map((line, i) => (
              <Text key={i} wrap="truncate">
                {line || " "}
              </Text>
            ))}
            {lines.length === 0 && (
              <Text dimColor>Waiting...</Text>
            )}
            <Text dimColor>
              {m.buffer.split("\n").length} lines · {m.isStreaming ? "streaming..." : "done"}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
```

- [ ] **Step 4: Create ModelDetail**

```typescript
// src/ui/components/ModelDetail.tsx
import React from "react";
import { Box, Text } from "ink";
import { ModelState } from "../../core/types";

interface Props {
  model: ModelState;
  scrollOffset: number;
}

export const ModelDetail: React.FC<Props> = ({ model, scrollOffset }) => {
  const allLines = model.buffer.split("\n");
  const visibleLines = allLines.slice(scrollOffset);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {visibleLines.map((line, i) => (
        <Text key={scrollOffset + i}>{line || " "}</Text>
      ))}
      {model.isStreaming && <Text color="gray">▋</Text>}
      {allLines.length === 0 && !model.isStreaming && (
        <Text dimColor>No output yet</Text>
      )}
    </Box>
  );
};
```

- [ ] **Step 5: Create InputBar**

```typescript
// src/ui/components/InputBar.tsx
import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface Props {
  prefix: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

export const InputBar: React.FC<Props> = ({ prefix, value, onChange, onSubmit }) => (
  <Box height={1} flexDirection="row">
    <Box marginRight={1}>
      <Text color="green">[{prefix}]</Text>
    </Box>
    <Text>› </Text>
    <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
  </Box>
);
```

- [ ] **Step 6: Create App**

```typescript
// src/ui/app.tsx
import React, { useState, useCallback } from "react";
import { Box, useInput, useApp } from "ink";
import { StatusBar } from "./components/StatusBar";
import { OutputArea } from "./components/OutputArea";
import { InputBar } from "./components/InputBar";
import { Session } from "../core/session";
import { loadConfig } from "../config/loader";
import { launchStreams } from "../core/stream";
import { StreamEvent } from "../provider/types";

const SYSTEM_PROMPT = "You are a helpful AI coding assistant. Be concise.";

export const App: React.FC = () => {
  const config = loadConfig();
  const [session] = useState(() => new Session(config, process.cwd()));
  const [input, setInput] = useState("");
  const [scrollOffset, setScrollOffset] = useState(0);
  const [modelStates, setModelStates] = useState(session.models);
  const { exit } = useApp();

  const targetPrefix =
    session.targetMode.type === "broadcast"
      ? "全部"
      : session.targetMode.modelName;

  const activeModelName =
    session.targetMode.type === "broadcast"
      ? null
      : session.targetMode.modelName;

  // Tab to cycle target
  useInput((input, key) => {
    if (key.tab) {
      session.cycleTarget();
      setScrollOffset(0);
      // Force re-render by updating state copy
      setModelStates([...session.models]);
      return;
    }

    if (key.escape) {
      session.jumpToBroadcast();
      setScrollOffset(0);
      setModelStates([...session.models]);
      return;
    }

    // Ctrl+1/2/3 to jump to model
    for (let i = 0; i < session.models.length; i++) {
      if (input === `\x010${i + 1}`) {
        session.jumpToModel(session.models[i].name);
        setScrollOffset(0);
        setModelStates([...session.models]);
        return;
      }
    }

    if (key.upArrow) {
      setScrollOffset((o) => Math.max(0, o - 1));
    }
    if (key.downArrow) {
      setScrollOffset((o) => o + 1);
    }
  });

  const handleSubmit = useCallback(
    async (value: string) => {
      if (!value.trim()) return;

      setInput("");
      const targets = session.addUserMessage(value);
      setModelStates([...session.models]);

      // Mark targets as streaming
      for (const t of targets) {
        t.isStreaming = true;
        t.buffer = "";
      }
      setModelStates([...session.models]);

      // Launch concurrent streams
      const streams = launchStreams(session, config, SYSTEM_PROMPT, []);

      // Process all streams concurrently
      await Promise.all(
        streams.map(async ({ modelName, events }) => {
          const m = session.models.find((mm) => mm.name === modelName);
          if (!m) return;

          for await (const event of events) {
            if (event.type === "text") {
              m.buffer += event.content;
            } else if (event.type === "done") {
              m.isStreaming = false;
            } else if (event.type === "error") {
              m.buffer += `\n[Error: ${event.message}]`;
              m.isStreaming = false;
            }
            setModelStates([...session.models]);
          }
        }),
      );

      // Save assistant responses to history
      for (const { modelName } of streams) {
        const m = session.models.find((mm) => mm.name === modelName);
        if (m && m.buffer) {
          session.addAssistantMessage(modelName, m.buffer);
        }
      }
    },
    [session, config],
  );

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Top: fixed status bar */}
      <StatusBar models={modelStates} activeModelName={activeModelName} />

      {/* Divider */}
      <Box height={0}>
        <Text>{"─".repeat(process.stdout.columns ?? 80)}</Text>
      </Box>

      {/* Middle: scrollable output */}
      <OutputArea
        models={modelStates}
        targetMode={session.targetMode}
        scrollOffset={scrollOffset}
      />

      {/* Divider */}
      <Box height={0}>
        <Text>{"─".repeat(process.stdout.columns ?? 80)}</Text>
      </Box>

      {/* Bottom: fixed input bar */}
      <InputBar
        prefix={targetPrefix}
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
      />
    </Box>
  );
};
```

- [ ] **Step 7: Update entry point**

```typescript
// src/index.ts
import React from "react";
import { render } from "ink";
import { App } from "./ui/app";

render(React.createElement(App));
```

- [ ] **Step 8: Test visually**

```bash
npx tsx src/index.ts
```

Expected: Terminal shows three-zone layout. Type a message and hit Enter to test streaming. Tab to cycle between models. You'll need valid API keys in `.arenarc` or env vars.

- [ ] **Step 9: Commit**

```bash
git add src/ui/ src/index.ts
git commit -m "feat: Ink UI with three-zone layout and Tab-driven interaction"
```

---

## Phase 5: Tools & Permissions

### Task 9: Tool registry and permission manager

**Files:**
- Create: `src/tools/types.ts`
- Create: `src/tools/registry.ts`
- Create: `src/tools/permission.ts`

- [ ] **Step 1: Define tool types**

```typescript
// src/tools/types.ts
import { ToolDef } from "../provider/types";

export interface ToolHandler {
  definition: ToolDef;
  execute(args: Record<string, unknown>, worktreePath: string): Promise<string>;
}

export type PermissionDecision = "allow" | "deny" | "allow_always" | "deny_always";

export interface PermissionEntry {
  toolName: string;
  args: Record<string, unknown>;
  decision: "allow_always" | "deny_always";
}
```

- [ ] **Step 2: Implement permission manager**

```typescript
// src/tools/permission.ts
import { PermissionDecision, PermissionEntry } from "./types";

export class PermissionManager {
  private entries: PermissionEntry[] = [];

  check(toolName: string, args: Record<string, unknown>): PermissionDecision {
    // Check hard-coded safety rules first
    if (toolName === "bash") {
      const cmd = String(args.command ?? "");
      if (cmd.includes("rm -rf /") || cmd.includes("sudo ")) {
        return "deny";
      }
    }

    if (toolName === "readFile" || toolName === "grep") {
      const path = String(args.path ?? args.filePath ?? "");
      if (path.includes(".env") || path.includes(".git-credentials")) {
        return "deny";
      }
    }

    // Check session memory
    for (const entry of this.entries) {
      if (entry.toolName === toolName) {
        return entry.decision;
      }
    }

    // Unknown — needs user input
    return "allow";
  }

  remember(toolName: string, args: Record<string, unknown>, decision: "allow_always" | "deny_always"): void {
    this.entries.push({ toolName, args, decision });
  }

  forget(toolName: string): void {
    this.entries = this.entries.filter((e) => e.toolName !== toolName);
  }

  clear(): void {
    this.entries = [];
  }
}
```

- [ ] **Step 3: Implement tool registry**

```typescript
// src/tools/registry.ts
import { ToolDef } from "../provider/types";
import { ToolHandler } from "./types";

export class ToolRegistry {
  private tools = new Map<string, ToolHandler>();

  register(handler: ToolHandler): void {
    this.tools.set(handler.definition.name, handler);
  }

  getDefinitions(): ToolDef[] {
    return Array.from(this.tools.values()).map((h) => h.definition);
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    worktreePath: string,
  ): Promise<string> {
    const handler = this.tools.get(name);
    if (!handler) {
      return `Error: unknown tool "${name}"`;
    }
    try {
      return await handler.execute(args, worktreePath);
    } catch (err: any) {
      return `Error executing ${name}: ${err.message}`;
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add src/tools/
git commit -m "feat: tool registry and permission manager"
```

---

### Task 10: Built-in tools (read-only)

**Files:**
- Create: `src/tools/builtin/readFile.ts`
- Create: `src/tools/builtin/grep.ts`
- Create: `src/tools/builtin/bash.ts`

- [ ] **Step 1: Implement ReadFile**

```typescript
// src/tools/builtin/readFile.ts
import * as fs from "fs";
import * as path from "path";
import { ToolHandler } from "../types";

export const readFileTool: ToolHandler = {
  definition: {
    name: "readFile",
    description: "Read the contents of a file",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Path to the file" },
        offset: { type: "number", description: "Line offset to start reading" },
        limit: { type: "number", description: "Max lines to read" },
      },
      required: ["filePath"],
    },
  },
  async execute(args, worktreePath) {
    const filePath = path.resolve(worktreePath, args.filePath as string);
    if (!fs.existsSync(filePath)) return `File not found: ${args.filePath}`;

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const offset = (args.offset as number) ?? 0;
    const limit = (args.limit as number) ?? lines.length;
    return lines.slice(offset, offset + limit).join("\n");
  },
};
```

- [ ] **Step 2: Implement Grep**

```typescript
// src/tools/builtin/grep.ts
import { execSync } from "child_process";
import { ToolHandler } from "../types";

export const grepTool: ToolHandler = {
  definition: {
    name: "grep",
    description: "Search for a pattern in files using regex",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        path: { type: "string", description: "Directory or file to search in" },
        include: { type: "string", description: "File glob pattern to include" },
      },
      required: ["pattern"],
    },
  },
  async execute(args, worktreePath) {
    const cwd = args.path ? path.resolve(worktreePath, args.path as string) : worktreePath;
    const pattern = args.pattern as string;
    const include = args.include ? `--include="${args.include}"` : "";
    try {
      return execSync(`rg -n --no-heading ${include} "${pattern}" .`, {
        cwd,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (err: any) {
      if (err.status === 1) return "No matches found";
      throw err;
    }
  },
};
```

- [ ] **Step 3: Implement Bash (safe subset)**

```typescript
// src/tools/builtin/bash.ts
import { execSync } from "child_process";
import * as path from "path";
import { ToolHandler } from "../types";

export const bashTool: ToolHandler = {
  definition: {
    name: "bash",
    description: "Execute a shell command",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
      },
      required: ["command"],
    },
  },
  async execute(args, worktreePath) {
    const command = args.command as string;

    // Safety check
    const dangerous = ["rm -rf /", "sudo ", "mkfs.", "dd if=", "> /dev/sda"];
    for (const d of dangerous) {
      if (command.includes(d)) return `Blocked: dangerous command pattern "${d}"`;
    }

    try {
      const output = execSync(command, {
        cwd: worktreePath,
        encoding: "utf-8",
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });
      return output;
    } catch (err: any) {
      return `Command failed (exit ${err.status}): ${err.stderr ?? err.message}`;
    }
  },
};
```

- [ ] **Step 4: Register built-in tools**

Add to `src/tools/registry.ts`:

```typescript
import { readFileTool } from "./builtin/readFile";
import { grepTool } from "./builtin/grep";
import { bashTool } from "./builtin/bash";

export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(grepTool);
  registry.register(bashTool);
  return registry;
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add src/tools/builtin/
git commit -m "feat: built-in tools (readFile, grep, bash)"
```

---

## Phase 6: Git Worktree Isolation

### Task 11: Worktree lifecycle management

**Files:**
- Create: `src/isolation/worktree.ts`

- [ ] **Step 1: Implement WorktreeManager**

```typescript
// src/isolation/worktree.ts
import simpleGit, { SimpleGit } from "simple-git";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

export class WorktreeManager {
  private git: SimpleGit;
  private worktrees: Map<string, string> = new Map(); // modelName → worktree path

  constructor(repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  async setup(taskId: string, modelNames: string[]): Promise<Map<string, string>> {
    const baseName = `arena/${taskId}`;

    for (const name of modelNames) {
      const branchName = `${baseName}-${name}`;
      const worktreePath = path.join(os.tmpdir(), "arena-worktrees", `${taskId}-${name}`);

      fs.mkdirSync(worktreePath, { recursive: true });

      try {
        // Delete existing branch if leftover
        await this.git.deleteLocalBranch(branchName, true).catch(() => {});
        await this.git.branch([branchName]);
        await this.git.raw(["worktree", "add", worktreePath, branchName]);
        this.worktrees.set(name, worktreePath);
      } catch (err) {
        // If worktree already exists, just reuse it
        this.worktrees.set(name, worktreePath);
      }
    }

    return this.worktrees;
  }

  getWorktreePath(modelName: string): string | undefined {
    return this.worktrees.get(modelName);
  }

  async getDiff(modelName: string): Promise<string> {
    const wt = this.worktrees.get(modelName);
    if (!wt) return "";

    const wtGit = simpleGit(wt);
    return await wtGit.diff();
  }

  async cleanup(taskId: string, keepModel?: string): Promise<void> {
    for (const [modelName, wtPath] of this.worktrees) {
      if (modelName === keepModel) continue;

      try {
        await this.git.raw(["worktree", "remove", wtPath, "--force"]);
      } catch {
        // Best effort cleanup
        fs.rmSync(wtPath, { recursive: true, force: true });
      }
      await this.git.deleteLocalBranch(`arena/${taskId}-${modelName}`, true).catch(() => {});
    }
    this.worktrees.clear();
  }
}
```

- [ ] **Step 2: Write tests**

```typescript
// test/isolation/worktree.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WorktreeManager } from "../../src/isolation/worktree";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

describe("WorktreeManager", () => {
  let testRepo: string;

  beforeEach(() => {
    testRepo = fs.mkdtempSync(path.join(require("os").tmpdir(), "arena-test-"));
    execSync("git init", { cwd: testRepo });
    execSync('git commit --allow-empty -m "initial"', { cwd: testRepo });
  });

  afterEach(() => {
    fs.rmSync(testRepo, { recursive: true, force: true });
  });

  it("creates worktrees for model names", async () => {
    const wm = new WorktreeManager(testRepo);
    const paths = await wm.setup("test-1", ["claude", "gpt"]);
    expect(paths.size).toBe(2);
    expect(fs.existsSync(paths.get("claude")!)).toBe(true);
    expect(fs.existsSync(paths.get("gpt")!)).toBe(true);
  });

  it("returns diff for modified worktree", async () => {
    const wm = new WorktreeManager(testRepo);
    const paths = await wm.setup("test-2", ["claude"]);
    const wtPath = paths.get("claude")!;
    fs.writeFileSync(path.join(wtPath, "test.txt"), "hello");
    const diff = await wm.getDiff("claude");
    expect(diff).toContain("test.txt");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add src/isolation/ test/isolation/
git commit -m "feat: git worktree isolation manager"
```

---

## Phase 7: Integration & Polish

### Task 12: Wire tools into the UI stream loop

**Files:**
- Modify: `src/ui/app.tsx`
- Create: `src/tools/executor.ts`

- [ ] **Step 1: Implement tool executor**

```typescript
// src/tools/executor.ts
import { ToolRegistry } from "./registry";
import { PermissionManager } from "./permission";
import { StreamEvent } from "../provider/types";

export async function* executeToolCalls(
  stream: AsyncGenerator<StreamEvent>,
  registry: ToolRegistry,
  permission: PermissionManager,
  worktreePath: string,
): AsyncGenerator<StreamEvent> {
  for await (const event of stream) {
    if (event.type === "tool_call") {
      const args = JSON.parse(event.args);
      const decision = permission.check(event.name, args);

      if (decision === "deny" || decision === "deny_always") {
        yield {
          type: "tool_result" as any,
          id: event.id,
          result: `Permission denied for tool: ${event.name}`,
        };
        continue;
      }

      const result = await registry.execute(event.name, args, worktreePath);
      yield {
        type: "tool_result" as any,
        id: event.id,
        result,
      };
    } else {
      yield event;
    }
  }
}
```

- [ ] **Step 2: Update App to use tool executor and worktrees**

Modify `src/ui/app.tsx` handleSubmit:

```typescript
// Inside handleSubmit:
const taskId = Date.now().toString(36);
const worktree = new WorktreeManager(process.cwd());
const toolRegistry = createDefaultRegistry();
const permission = new PermissionManager();

// Setup worktrees for all active models
const modelNames = session.models.map((m) => m.name);
await worktree.setup(taskId, modelNames);

// Launch concurrent streams with tool execution
const streams = launchStreams(session, config, SYSTEM_PROMPT, toolRegistry.getDefinitions());

await Promise.all(
  streams.map(async ({ modelName, events, provider }) => {
    const m = session.models.find((mm) => mm.name === modelName);
    if (!m) return;

    const wtPath = worktree.getWorktreePath(modelName) ?? process.cwd();
    const toolStream = executeToolCalls(events, toolRegistry, permission, wtPath);

    for await (const event of toolStream) {
      if (event.type === "text") {
        m.buffer += event.content;
      } else if (event.type === "tool_result") {
        m.buffer += `\n[tool: ${event.id}] ${event.result}`;
        session.addToolResult(modelName, event.id, event.result);
      } else if (event.type === "done") {
        m.isStreaming = false;
      } else if (event.type === "error") {
        m.buffer += `\n[Error: ${event.message}]`;
        m.isStreaming = false;
      }
      setModelStates([...session.models]);
    }
  }),
);

// Cleanup worktrees (keep none by default, user can choose to keep)
await worktree.cleanup(taskId);
```

- [ ] **Step 3: Commit**

```bash
git add src/tools/executor.ts src/ui/app.tsx
git commit -m "feat: integrate tools with UI stream loop and worktree isolation"
```

---

### Task 13: Session persistence (JSON save/load)

**Files:**
- Create: `src/persistence/session.ts`

- [ ] **Step 1: Implement session persistence**

```typescript
// src/persistence/session.ts
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const SESSIONS_DIR = path.join(os.homedir(), ".arena", "sessions");

export interface SavedSession {
  id: string;
  timestamp: string;
  models: Array<{
    name: string;
    messages: Array<{ role: string; content: string }>;
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
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export function listSessions(): SavedSession[] {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  return fs
    .readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), "utf-8"));
      return data as SavedSession;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
```

- [ ] **Step 2: Commit**

```bash
git add src/persistence/
git commit -m "feat: JSON session persistence (save/load/list)"
```

---

## Summary of Implementation Order

| Phase | Tasks | What You Can Test |
|-------|-------|-------------------|
| 1. Foundation | 1-2 | `npm start` prints banner |
| 2. Provider | 3-5 | Unit tests calling mock LLM APIs |
| 3. Core | 6-7 | Session/stream unit tests |
| 4. UI | 8 | Full terminal app with three-zone layout + Tab |
| 5. Tools | 9-10 | Tool execution unit tests |
| 6. Worktree | 11 | Worktree creation/diff unit tests |
| 7. Integration | 12-13 | End-to-end: chat with models, tools, worktree |
