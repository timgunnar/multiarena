# multiarena --web 模式设计

> CLI 驱动本地 Web UI，共享所有 Core/Provider 逻辑，零额外依赖。

## 入口

```bash
multiarena --web          # 启动 Web 模式，默认 localhost:3000
multiarena --web --port 8080  # 指定端口
```

CLI 启动后自动打开浏览器。

## 架构

```
┌─ Browser ─────────────────────────────────────────────┐
│  Vue SPA (Vite bundled)                             │
│    ├── WebSocket client                               │
│    ├── 布局：左侧会话列表 / 中央输出 / 底部输入         │
│    └── 组件复用 CLI 的设计模式（面板、流式、弹窗）       │
└──────────────────────┬─────────────────────────────────┘
                       │ ws://localhost:3000
┌─ Server ─────────────┴─────────────────────────────────┐
│  Node.js http + ws                                     │
│    ├── 静态文件服务 (dist/web/)                         │
│    ├── WebSocket 协议层                                 │
│    └── 调用 Session / runTurn / runDeliberation         │
│         ↓                                              │
│    Core 层（零改动复用）                                  │
│    Provider 层（零改动复用）                               │
│    Tools 层（零改动复用）                                  │
└────────────────────────────────────────────────────────┘
```

## WebSocket 协议

### 客户端 → 服务端

```typescript
type ClientMessage =
  | { type: "submit"; text: string }                          // 提交消息
  | { type: "abort" }                                         // 中止当前流
  | { type: "permission"; decision: "allow" | "deny" | "allow_always" | "deny_always" }
  | { type: "mode"; mode: "broadcast" | "team" | "directed"; modelName?: string }
  | { type: "mute"; modelName: string }
  | { type: "reset"; modelName: string }
  | { type: "save" }
  | { type: "resume"; sessionId: string }
```

### 服务端 → 客户端

```typescript
type ServerMessage =
  | { type: "state"; models: ModelSnapshot[]; mode: string }  // 完整状态快照
  | { type: "stream"; modelName: string; text: string }       // 流式文本
  | { type: "stream_end"; modelName: string; usage: TokenUsage }
  | { type: "deliberation"; event: DeliberationProgress }     // 审议进度
  | { type: "permission_required"; requestId: string; toolName: string; args: Record<string,unknown>; modelName: string }
  | { type: "error"; message: string }
  | { type: "session_list"; sessions: SavedSession[] }
```

## 前端布局

```
┌─ Sidebar ───┬─ Main ────────────────────────────────────────┐
│ Sessions    │ ┌─ claude ──────────┐ ┌─ gpt ───────────────┐ │
│             │ │                   │ │                     │ │
│ + New       │ │ You can use ls... │ │ Here's how to...    │ │
│             │ │ $ ls               │ │ $ ls -la            │ │
│ ├ 2026-05-31│ │                   │ │                     │ │
│ ├ 2026-05-30│ │ 1K/200K · done    │ │ 1K/128K · done     │ │
│             │ └───────────────────┘ └─────────────────────┘ │
│             │ ───────────────────────────────────────────────│
│             │ [all] > ▊                     Tab · Shift+Tab  │
└─────────────┴───────────────────────────────────────────────┘
```

- **左侧栏**：会话列表，可新建/切换/删除
- **主区域**：三区布局（模型面板 + 细节 + 输入栏），与 CLI 一致
- **审议视图**：独立占满主区域，显示轮次管线
- **响应式**：窄屏时侧栏折叠，面板上下堆叠

## 文件结构

```
src/
├── server/
│   ├── index.ts          # HTTP 服务器入口，WebSocket 升级
│   ├── wsHandler.ts      # WebSocket 消息路由
│   └── sessionManager.ts # 服务端 Session 生命周期管理
├── web/                   # 前端源码（独立 Vite + Vue 项目）
│   ├── index.html
│   ├── src/
│   │   ├── App.vue         # 根组件
│   │   ├── composables/
│   │   │   └── useWebSocket.js  # WebSocket 连接管理
│   │   ├── components/
│   │   │   ├── BroadcastPanel.vue
│   │   │   ├── DeliberationPanel.vue
│   │   │   ├── InputBar.vue
│   │   │   ├── Sidebar.vue
│   │   │   └── PermissionDialog.vue
│   │   └── types.ts
│   ├── package.json
│   └── vite.config.js
└── ui/                    # CLI UI（不变）
```

## 构建流程

```bash
# 开发
npm run dev:web      # 启动 Vite dev server + Node WebSocket server

# 生产构建
npm run build:web    # Vite build → dist/web/
npm run build        # tsc → dist/ (包含 server/)
```

`package.json` 的 `files` 增加 `dist/web/`。

## 安全约束

- **仅 localhost**：server 只监听 `127.0.0.1`，不暴露到网络
- **无认证**：本地进程，浏览器同源
- **API key 安全**：key 在服务端内存中，永不发送到浏览器
- **状态隔离**：每个 `--web` 进程独立，关窗口即销毁

## 与 CLI 的关系

| 维度 | CLI | Web |
|------|-----|-----|
| Session | `useState` | server 内存 |
| 流式渲染 | Ink reconciler | Vue DOM |
| 输入 | `useInput` | `<input>` + keydown |
| 快捷键 | process.stdin | Web 原生键盘事件 |
| 权限弹窗 | InputBar row | Modal dialog |
| 滚动 | ↑↓ 偏移 | 原生滚动条 |

**Core/Provider/Tools 层零改动。** 100% 复用。

## 实施阶段

| 阶段 | 内容 |
|------|------|
| Phase 1 | Node HTTP + WebSocket server，状态快照推送 |
| Phase 2 | 广播模式 Web UI（面板 + 流式 + 输入） |
| Phase 3 | 团队模式 Web UI（审议进程 + 轮次管线） |
| Phase 4 | 权限弹窗 + 会话列表 + 持久化 |
| Phase 5 | 打包构建 + `--web` CLI 参数 |

## 版本

v0.3.0 — Web 模式首个可用版本。
