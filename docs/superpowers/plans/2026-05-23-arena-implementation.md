# Arena 实施计划

> **面向自动化执行者：** 使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐步实施本计划。步骤使用 checkbox（`- [ ]`）语法进行跟踪。

**目标：** 构建 Arena — 一个终端原生的多模型 AI 编程助手，用户可同时与 N 个 LLM 对话，通过 Tab 切换对比回答，在隔离的 git worktree 中执行工具。

**架构：** 四层结构 — UI (Ink/React) → Core (Session/Stream/Router) → Provider (统一接口 + 适配器) → Tool Runtime。每个模型维护独立的对话历史。文件操作在各自模型的 git worktree 中运行，权限模型跨模型共享。

**技术栈：** TypeScript、Node.js、Ink（React 终端渲染）、TOML 配置、Anthropic/OpenAI/Google SDK

---

## 文件结构

```
arena/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # CLI 入口，挂载 Ink 应用
│   ├── config/
│   │   ├── types.ts              # 配置类型定义
│   │   └── loader.ts             # TOML 配置加载 (.arenarc)
│   ├── provider/
│   │   ├── types.ts              # ChatRequest, StreamEvent, ToolDef, Message
│   │   ├── provider.ts           # Provider 接口
│   │   └── adapters/
│   │       ├── anthropic.ts      # Anthropic 适配器
│   │       ├── openai.ts         # OpenAI 适配器
│   │       └── google.ts         # Google Gemini 适配器
│   ├── core/
│   │   ├── types.ts              # ModelState, Session, TargetMode
│   │   ├── session.ts            # 会话管理器（每个模型独立历史）
│   │   ├── stream.ts             # 流调度器（并发分发）
│   │   └── router.ts             # 消息路由器（广播 vs 定向）
│   ├── ui/
│   │   ├── app.tsx               # 主 Ink 应用（状态 + 布局）
│   │   ├── hooks/
│   │   │   ├── useInput.ts       # 输入处理、Tab 循环
│   │   │   └── useStreams.ts     # 多流状态管理
│   │   └── components/
│   │       ├── StatusBar.tsx      # 顶部固定状态条
│   │       ├── OutputArea.tsx     # 可滚动输出区
│   │       ├── InputBar.tsx       # 底部固定输入栏
│   │       ├── ModelDetail.tsx    # 单模型全宽详情视图
│   │       └── BroadcastSummary.tsx # 多栏摘要视图
│   ├── tools/
│   │   ├── types.ts              # 工具定义
│   │   ├── registry.ts           # 工具注册表
│   │   ├── executor.ts           # 执行工具、权限检查
│   │   ├── permission.ts         # 会话记忆权限管理器
│   │   └── builtin/
│   │       ├── readFile.ts
│   │       ├── grep.ts
│   │       ├── glob.ts
│   │       ├── bash.ts
│   │       ├── writeFile.ts
│   │       └── editFile.ts
│   └── isolation/
│       └── worktree.ts           # Git worktree 生命周期
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

## 第一阶段：项目基础

### 任务 1：初始化项目

**涉及文件：**
- 创建：`package.json`
- 创建：`tsconfig.json`
- 创建：`src/index.ts`

- [ ] **步骤 1：创建 package.json**

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

- [ ] **步骤 2：创建 tsconfig.json**

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

- [ ] **步骤 3：创建最小入口文件**

```typescript
// src/index.ts
const main = () => {
  console.log("Arena — multi-model AI coding assistant");
};

main();
```

- [ ] **步骤 4：安装依赖并验证**

```bash
npm install
npm run build
npm start
```

预期输出：打印 "Arena — multi-model AI coding assistant"

- [ ] **步骤 5：提交**

```bash
git add package.json tsconfig.json src/index.ts package-lock.json
git commit -m "feat: project scaffolding"
```

---

### 任务 2：配置系统 — 类型和加载器

**涉及文件：**
- 创建：`src/config/types.ts`
- 创建：`src/config/loader.ts`

- [ ] **步骤 1：定义配置类型**

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

- [ ] **步骤 2：编写配置加载器**

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
  // 深度遍历配置，解析字符串中的 ${ENV_VAR}
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

  // 未找到配置文件 — 返回空默认值
  return { models: {}, defaults: { active: [], broadcast: true } };
}
```

- [ ] **步骤 3：编写测试**

```typescript
// test/config/loader.test.ts
import { describe, it, expect } from "vitest";

describe("config loader", () => {
  it("resolves env vars in strings", () => {
    process.env.TEST_KEY = "secret123";
    // 测试 resolveEnvVars 工具函数
    // 实际测试应导入并调用该辅助函数
  });

  it("returns default config when no file found", () => {
    // 在临时目录中测试，确保没有 .arenarc
  });
});
```

- [ ] **步骤 4：运行测试**

```bash
npx vitest run
```

- [ ] **步骤 5：提交**

```bash
git add src/config/ test/config/
git commit -m "feat: config types and TOML loader with env var resolution"
```

---

## 第二阶段：Provider 层

### 任务 3：Provider 类型和接口

**涉及文件：**
- 创建：`src/provider/types.ts`
- 创建：`src/provider/provider.ts`

- [ ] **步骤 1：定义 Provider 类型**

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

- [ ] **步骤 2：定义 Provider 接口**

```typescript
// src/provider/provider.ts
import { ChatRequest, StreamEvent } from "./types";

export interface Provider {
  chat(request: ChatRequest): AsyncGenerator<StreamEvent>;
  abort(): void;
}
```

- [ ] **步骤 3：提交**

```bash
git add src/provider/types.ts src/provider/provider.ts
git commit -m "feat: provider unified types and interface"
```

---

### 任务 4：Anthropic 适配器

**涉及文件：**
- 创建：`src/provider/adapters/anthropic.ts`

- [ ] **步骤 1：编写 Anthropic 适配器**

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
            // 通过 content_block_stop 处理累积的参数
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
            usage: { input: 0, output: 0 }, // Anthropic 流不在 message_stop 中返回 usage
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

- [ ] **步骤 2：编写适配器测试（模拟 Anthropic SDK）**

```typescript
// test/provider/adapters/anthropic.test.ts
import { describe, it, expect, vi } from "vitest";

describe("AnthropicProvider", () => {
  it("constructs with API key", () => {
    // 测试构造
  });

  it("yields text events from stream", async () => {
    // 模拟 SDK 的 messages.stream 产生事件
  });

  it("yields tool_call events", async () => {
    // 模拟 tool_use content blocks
  });
});
```

- [ ] **步骤 3：运行测试**

```bash
npx vitest run
```

- [ ] **步骤 4：提交**

```bash
git add src/provider/adapters/anthropic.ts test/provider/adapters/anthropic.test.ts
git commit -m "feat: Anthropic provider adapter"
```

---

### 任务 5：OpenAI 和 Google 适配器

**涉及文件：**
- 创建：`src/provider/adapters/openai.ts`
- 创建：`src/provider/adapters/google.ts`

- [ ] **步骤 1：编写 OpenAI 适配器**

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

- [ ] **步骤 2：编写 Google 适配器**

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

    // 将消息转换为 Gemini contents 格式
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

- [ ] **步骤 3：编写 Provider 工厂函数**

添加到 `src/provider/provider.ts`：

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

- [ ] **步骤 4：运行测试**

```bash
npx vitest run
```

- [ ] **步骤 5：提交**

```bash
git add src/provider/
git commit -m "feat: OpenAI, Google adapters and provider factory"
```

---

## 第三阶段：Core 层

### 任务 6：会话管理器（每个模型独立对话历史）

**涉及文件：**
- 创建：`src/core/types.ts`
- 创建：`src/core/session.ts`

- [ ] **步骤 1：定义 Core 类型**

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
  buffer: string;          // 累积的流式输出
  isStreaming: boolean;
  usage: { input: number; output: number };
  contextLimit: number;    // 模型的上下文窗口大小
}

export interface SessionState {
  models: ModelState[];
  targetMode: TargetMode;
  worktreeBase: string;    // 原始仓库路径
}
```

- [ ] **步骤 2：实现 Session 类**

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

  /** 向一个或所有模型添加用户消息 */
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

  /** 将助手回复追加到模型历史 */
  addAssistantMessage(modelName: string, content: string): void {
    const m = this.findModel(modelName);
    if (m) {
      m.messages.push({ role: "assistant", content });
    }
  }

  /** 将工具结果追加到模型历史 */
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
  // 已知模型的保守默认值
  if (model.includes("claude")) return 200000;
  if (model.includes("gpt-4")) return 128000;
  if (model.includes("gpt-3.5")) return 16384;
  if (model.includes("gemini")) return 1048576;
  if (model.includes("deepseek")) return 128000;
  return 128000;
}
```

- [ ] **步骤 3：编写测试**

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

- [ ] **步骤 4：运行测试**

```bash
npx vitest run
```

- [ ] **步骤 5：提交**

```bash
git add src/core/ test/core/
git commit -m "feat: session manager with per-model history and Tab cycling"
```

---

### 任务 7：流调度器（并发多模型流式输出）

**涉及文件：**
- 创建：`src/core/stream.ts`

- [ ] **步骤 1：实现 StreamManager**

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

/** 为所有目标模型启动并发流 */
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

- [ ] **步骤 2：编写测试**

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

- [ ] **步骤 3：运行测试**

```bash
npx vitest run
```

- [ ] **步骤 4：提交**

```bash
git add src/core/stream.ts test/core/stream.test.ts
git commit -m "feat: concurrent stream manager for multi-model dispatch"
```

---

## 第四阶段：终端 UI

### 任务 8：Ink 应用框架 — 三区布局

**涉及文件：**
- 创建：`src/ui/app.tsx`
- 创建：`src/ui/components/StatusBar.tsx`
- 创建：`src/ui/components/OutputArea.tsx`
- 创建：`src/ui/components/InputBar.tsx`
- 修改：`src/index.ts`

- [ ] **步骤 1：创建 StatusBar 组件**

```typescript
// src/ui/components/StatusBar.tsx
import React from "react";
import { Box, Text } from "ink";
import { ModelState } from "../../core/types";

interface Props {
  models: ModelState[];
  activeModelName: string | null; // null = 广播模式
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

- [ ] **步骤 2：创建 OutputArea 组件**

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
        <Text>未选择模型</Text>
      </Box>
    );
  }

  return <ModelDetail model={activeModel} scrollOffset={scrollOffset} />;
};
```

- [ ] **步骤 3：创建 BroadcastSummary**

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
              <Text dimColor>等待中...</Text>
            )}
            <Text dimColor>
              {m.buffer.split("\n").length} 行 · {m.isStreaming ? "输出中..." : "完成"}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
```

- [ ] **步骤 4：创建 ModelDetail**

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
        <Text dimColor>暂无输出</Text>
      )}
    </Box>
  );
};
```

- [ ] **步骤 5：创建 InputBar**

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

- [ ] **步骤 6：创建 App**

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

  // Tab 切换对话目标
  useInput((input, key) => {
    if (key.tab) {
      session.cycleTarget();
      setScrollOffset(0);
      // 通过更新 state 副本触发重新渲染
      setModelStates([...session.models]);
      return;
    }

    if (key.escape) {
      session.jumpToBroadcast();
      setScrollOffset(0);
      setModelStates([...session.models]);
      return;
    }

    // Ctrl+1/2/3 快速跳转到对应模型
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

      // 标记目标模型为流式输出中
      for (const t of targets) {
        t.isStreaming = true;
        t.buffer = "";
      }
      setModelStates([...session.models]);

      // 启动并发流
      const streams = launchStreams(session, config, SYSTEM_PROMPT, []);

      // 并发处理所有流
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
              m.buffer += `\n[错误: ${event.message}]`;
              m.isStreaming = false;
            }
            setModelStates([...session.models]);
          }
        }),
      );

      // 将助手回复保存到历史
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
      {/* 顶部：固定状态条 */}
      <StatusBar models={modelStates} activeModelName={activeModelName} />

      {/* 分隔线 */}
      <Box height={0}>
        <Text>{"─".repeat(process.stdout.columns ?? 80)}</Text>
      </Box>

      {/* 中间：可滚动输出区 */}
      <OutputArea
        models={modelStates}
        targetMode={session.targetMode}
        scrollOffset={scrollOffset}
      />

      {/* 分隔线 */}
      <Box height={0}>
        <Text>{"─".repeat(process.stdout.columns ?? 80)}</Text>
      </Box>

      {/* 底部：固定输入栏 */}
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

- [ ] **步骤 7：更新入口文件**

```typescript
// src/index.ts
import React from "react";
import { render } from "ink";
import { App } from "./ui/app";

render(React.createElement(App));
```

- [ ] **步骤 8：视觉测试**

```bash
npx tsx src/index.ts
```

预期效果：终端显示三区布局。输入消息并按回车测试流式输出。按 Tab 在模型间切换。需要在 `.arenarc` 中配置有效的 API key 或设置环境变量。

- [ ] **步骤 9：提交**

```bash
git add src/ui/ src/index.ts
git commit -m "feat: Ink UI with three-zone layout and Tab-driven interaction"
```

---

## 第五阶段：工具与权限

### 任务 9：工具注册表和权限管理器

**涉及文件：**
- 创建：`src/tools/types.ts`
- 创建：`src/tools/registry.ts`
- 创建：`src/tools/permission.ts`

- [ ] **步骤 1：定义工具类型**

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

- [ ] **步骤 2：实现权限管理器**

```typescript
// src/tools/permission.ts
import { PermissionDecision, PermissionEntry } from "./types";

export class PermissionManager {
  private entries: PermissionEntry[] = [];

  check(toolName: string, args: Record<string, unknown>): PermissionDecision {
    // 首先检查硬编码的安全规则
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

    // 检查会话记忆
    for (const entry of this.entries) {
      if (entry.toolName === toolName) {
        return entry.decision;
      }
    }

    // 未知 — 默认允许
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

- [ ] **步骤 3：实现工具注册表**

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
      return `错误: 未知工具 "${name}"`;
    }
    try {
      return await handler.execute(args, worktreePath);
    } catch (err: any) {
      return `执行 ${name} 出错: ${err.message}`;
    }
  }
}
```

- [ ] **步骤 4：运行测试**

```bash
npx vitest run
```

- [ ] **步骤 5：提交**

```bash
git add src/tools/
git commit -m "feat: tool registry and permission manager"
```

---

### 任务 10：内置工具（只读）

**涉及文件：**
- 创建：`src/tools/builtin/readFile.ts`
- 创建：`src/tools/builtin/grep.ts`
- 创建：`src/tools/builtin/bash.ts`

- [ ] **步骤 1：实现 ReadFile**

```typescript
// src/tools/builtin/readFile.ts
import * as fs from "fs";
import * as path from "path";
import { ToolHandler } from "../types";

export const readFileTool: ToolHandler = {
  definition: {
    name: "readFile",
    description: "读取文件内容",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "文件路径" },
        offset: { type: "number", description: "起始行偏移" },
        limit: { type: "number", description: "最大读取行数" },
      },
      required: ["filePath"],
    },
  },
  async execute(args, worktreePath) {
    const filePath = path.resolve(worktreePath, args.filePath as string);
    if (!fs.existsSync(filePath)) return `文件未找到: ${args.filePath}`;

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const offset = (args.offset as number) ?? 0;
    const limit = (args.limit as number) ?? lines.length;
    return lines.slice(offset, offset + limit).join("\n");
  },
};
```

- [ ] **步骤 2：实现 Grep**

```typescript
// src/tools/builtin/grep.ts
import { execSync } from "child_process";
import { ToolHandler } from "../types";

export const grepTool: ToolHandler = {
  definition: {
    name: "grep",
    description: "在文件中使用正则表达式搜索",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "正则表达式模式" },
        path: { type: "string", description: "搜索目录或文件" },
        include: { type: "string", description: "文件 glob 过滤" },
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
      if (err.status === 1) return "未找到匹配项";
      throw err;
    }
  },
};
```

- [ ] **步骤 3：实现 Bash（安全子集）**

```typescript
// src/tools/builtin/bash.ts
import { execSync } from "child_process";
import * as path from "path";
import { ToolHandler } from "../types";

export const bashTool: ToolHandler = {
  definition: {
    name: "bash",
    description: "执行 shell 命令",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "要执行的 shell 命令" },
      },
      required: ["command"],
    },
  },
  async execute(args, worktreePath) {
    const command = args.command as string;

    // 安全检查
    const dangerous = ["rm -rf /", "sudo ", "mkfs.", "dd if=", "> /dev/sda"];
    for (const d of dangerous) {
      if (command.includes(d)) return `已阻止: 危险命令模式 "${d}"`;
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
      return `命令失败 (exit ${err.status}): ${err.stderr ?? err.message}`;
    }
  },
};
```

- [ ] **步骤 4：注册内置工具**

添加到 `src/tools/registry.ts`：

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

- [ ] **步骤 5：运行测试**

```bash
npx vitest run
```

- [ ] **步骤 6：提交**

```bash
git add src/tools/builtin/
git commit -m "feat: built-in tools (readFile, grep, bash)"
```

---

## 第六阶段：Git Worktree 隔离

### 任务 11：Worktree 生命周期管理

**涉及文件：**
- 创建：`src/isolation/worktree.ts`

- [ ] **步骤 1：实现 WorktreeManager**

```typescript
// src/isolation/worktree.ts
import simpleGit, { SimpleGit } from "simple-git";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

export class WorktreeManager {
  private git: SimpleGit;
  private worktrees: Map<string, string> = new Map(); // modelName → worktree 路径

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
        // 删除可能残留的旧分支
        await this.git.deleteLocalBranch(branchName, true).catch(() => {});
        await this.git.branch([branchName]);
        await this.git.raw(["worktree", "add", worktreePath, branchName]);
        this.worktrees.set(name, worktreePath);
      } catch (err) {
        // worktree 已存在则直接复用
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
        // 尽力清理
        fs.rmSync(wtPath, { recursive: true, force: true });
      }
      await this.git.deleteLocalBranch(`arena/${taskId}-${modelName}`, true).catch(() => {});
    }
    this.worktrees.clear();
  }
}
```

- [ ] **步骤 2：编写测试**

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

- [ ] **步骤 3：运行测试**

```bash
npx vitest run
```

- [ ] **步骤 4：提交**

```bash
git add src/isolation/ test/isolation/
git commit -m "feat: git worktree isolation manager"
```

---

## 第七阶段：集成与打磨

### 任务 12：将工具连接到 UI 流循环中

**涉及文件：**
- 修改：`src/ui/app.tsx`
- 创建：`src/tools/executor.ts`

- [ ] **步骤 1：实现工具执行器**

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
          result: `权限被拒绝: ${event.name}`,
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

- [ ] **步骤 2：更新 App 以使用工具执行器和 worktree**

修改 `src/ui/app.tsx` 中的 handleSubmit：

```typescript
// handleSubmit 内部：
const taskId = Date.now().toString(36);
const worktree = new WorktreeManager(process.cwd());
const toolRegistry = createDefaultRegistry();
const permission = new PermissionManager();

// 为所有活跃模型设置 worktree
const modelNames = session.models.map((m) => m.name);
await worktree.setup(taskId, modelNames);

// 启动带工具执行的并发流
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
        m.buffer += `\n[工具: ${event.id}] ${event.result}`;
        session.addToolResult(modelName, event.id, event.result);
      } else if (event.type === "done") {
        m.isStreaming = false;
      } else if (event.type === "error") {
        m.buffer += `\n[错误: ${event.message}]`;
        m.isStreaming = false;
      }
      setModelStates([...session.models]);
    }
  }),
);

// 清理 worktree（默认不保留，用户可选择保留）
await worktree.cleanup(taskId);
```

- [ ] **步骤 3：提交**

```bash
git add src/tools/executor.ts src/ui/app.tsx
git commit -m "feat: integrate tools with UI stream loop and worktree isolation"
```

---

### 任务 13：会话持久化（JSON 保存/加载）

**涉及文件：**
- 创建：`src/persistence/session.ts`

- [ ] **步骤 1：实现会话持久化**

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

- [ ] **步骤 2：提交**

```bash
git add src/persistence/
git commit -m "feat: JSON session persistence (save/load/list)"
```

---

## 实施顺序总结

| 阶段 | 任务 | 可测试内容 |
|------|------|-----------|
| 1. 基础 | 1-2 | `npm start` 打印 banner |
| 2. Provider | 3-5 | 模拟 LLM API 的单元测试 |
| 3. Core | 6-7 | 会话/流单元测试 |
| 4. UI | 8 | 三区布局 + Tab 交互的完整终端应用 |
| 5. 工具 | 9-10 | 工具执行单元测试 |
| 6. Worktree | 11 | worktree 创建/diff 单元测试 |
| 7. 集成 | 12-13 | 端到端：对话、工具调用、worktree 全流程 |
