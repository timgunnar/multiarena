# multiarena 架构关系图

## 分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         ENTRY LAYER                              │
│                                                                  │
│  src/index.ts                                                    │
│    ├── CLI: Ink render(<App/>)                                   │
│    └── --web: startServer(port)                                  │
└────────────┬──────────────┬─────────────────────────────────────┘
             │              │
             ▼              ▼
┌────────────────────┐  ┌─────────────────────────────────────────┐
│   CLI UI LAYER     │  │   WEB SERVER LAYER                       │
│   src/ui/          │  │   src/server/                            │
│                    │  │                                          │
│  app.tsx ──────────┤  │  index.ts ── HTTP + WebSocket ────┐      │
│  │                 │  │   │                                 │      │
│  ├─ modeTransitions│  │  ├─ wsHandler.ts ──── 消息路由       │      │
│  ├─ InputBar       │  │  └─ sessionManager ── 会话生命周期   │      │
│  ├─ OutputArea     │  │                                      │      │
│  │  ├─ Broadcast   │  │         WebSocket (ws://)            │      │
│  │  ├─ ModelDetail │  │              │                       │      │
│  │  └─ Deliberation│  │              ▼                       │      │
│  └─ formatTokens   │  │  ┌──────────────────────────────────┐│      │
│                    │  │  │   WEB FRONTEND LAYER             ││      │
│  Ink (React TUI)   │  │  │   src/web/  (Vue 3 + Vite)       ││      │
│  process.stdin     │  │  │                                  ││      │
│                    │  │  │  App.vue                          ││      │
│                    │  │  │   ├─ Sidebar.vue                  ││      │
│                    │  │  │   ├─ BroadcastPanel.vue ────────┘│      │
│                    │  │  │   ├─ DeliberationPanel.vue        │      │
│                    │  │  │   ├─ InputBar.vue                 │      │
│                    │  │  │   └─ PermissionDialog.vue         │      │
│                    │  │  │                                   │      │
│                    │  │  │  useWebSocket.js ──── WS client   │      │
│                    │  │  └──────────────────────────────────┘│      │
└────────┬───────────┘  └──────────────────┬──────────────────────┘
         │                                 │
         │         ┌───────────────────────┘
         │         │
         ▼         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       CORE LAYER                                 │
│                       src/core/                                  │
│                                                                  │
│  ┌──────────┐  ┌───────────────┐  ┌───────────────────────────┐ │
│  │ session  │  │ deliberation   │  │        turn               │ │
│  │          │  │                │  │                           │ │
│  │ 会话状态  │  │ runDeliberation│  │ runTurn (async generator) │ │
│  │ 模型管理  │  │ autoAssignRounds│ │   ├── provider.chat()     │ │
│  │ 消息路由  │  │ buildSystem    │  │   ├── tool execution     │ │
│  │ teamMsgs │  │   Prompt       │  │   ├── permission check   │ │
│  │          │  │ buildThink     │  │   └── message push       │ │
│  │          │  │   Prompt       │  │                           │ │
│  │          │  │ assignPerspec  │  │                           │ │
│  │          │  │   tives        │  │                           │ │
│  └──────────┘  └───────────────┘  └───────────────────────────┘ │
│                                                                  │
│  types.ts — ModelState, TargetMode                               │
└────┬─────────────┬────────────────────┬──────────────────────────┘
     │             │                    │
     ▼             ▼                    ▼
┌─────────┐ ┌──────────────┐ ┌──────────────────┐
│ PROVIDER│ │    TOOLS     │ │   PERSISTENCE    │
│ src/    │ │   src/tools/ │ │   src/           │
│ provider│ │              │ │   persistence/   │
│         │ │ registry     │ │                  │
│ types   │ │ permission   │ │ saveSession      │
│ factory │ │              │ │ loadSession      │
│         │ │ builtin/     │ │ listSessions     │
│ adapters│ │  ├─ bash     │ │                  │
│  ├─ anth│ │  ├─ readFile │ │                  │
│  ├─ open│ │  ├─ writeFile│ │                  │
│  ├─ goog│ │  ├─ editFile │ │                  │
│  ├─ olla│ │  ├─ glob     │ │                  │
│  ├─ deep│ │  └─ grep     │ │                  │
│  └─ mini│ │              │ │                  │
│         │ │ types        │ │                  │
└─────────┘ └──────────────┘ └──────────────────┘

     ┌──────────────┐     ┌──────────────┐
     │   CONFIG     │     │  ISOLATION   │
     │ src/config/  │     │ src/         │
     │              │     │ isolation/   │
     │ loader.ts    │     │              │
     │ types.ts     │     │ worktree.ts  │
     │              │     │              │
     │ TOML parse   │     │ git worktree │
     │ env resolve  │     │ setup/clean  │
     └──────────────┘     └──────────────┘

     ┌──────────────┐
     │   TESTING    │
     │ src/testing/ │
     │              │
     │ harness.ts   │
     │              │
     │ 程序化 E2E   │
     │ 测试接口      │
     └──────────────┘
```

## 调用关系

```
entry (index.ts)
  ├── CLI 路径
  │     └── ui/app.tsx
  │           ├── loadConfig()                    → config/
  │           ├── new Session()                   → core/session
  │           ├── runTurn()                       → core/turn
  │           │     ├── createProvider()          → provider/
  │           │     ├── ToolRegistry.execute()    → tools/
  │           │     └── PermissionManager.check() → tools/
  │           ├── runDeliberation()               → core/deliberation
  │           │     └── runTurn() (each round)    → core/turn
  │           ├── runMerge()                      → core/deliberation
  │           ├── saveSession()                   → persistence/
  │           └── WorktreeManager                 → isolation/
  │
  └── Web 路径
        └── server/index.ts
              ├── HTTP: serve dist/web/ (Vue SPA)
              └── WebSocket: wsHandler.ts
                    ├── new Session()              → core/session
                    ├── runTurn()                  → core/turn
                    ├── runDeliberation()          → core/deliberation
                    ├── autoAssignRounds()         → core/deliberation
                    ├── saveSession()              → persistence/
                    └── → WebSocket → web/App.vue

各层依赖方向：Entry → UI/Server → Core → Provider/Tools/Persistence/Config/Isolation
```

## 各层职责

| 层 | 目录 | 职责 | 可以被谁调用 |
|----|------|------|------------|
| Entry | `src/index.ts` | CLI 入口，解析参数，挂载 UI 或启动 server | — |
| CLI UI | `src/ui/` | Ink 终端界面，键盘交互，流式渲染 | Entry |
| Web Server | `src/server/` | HTTP + WebSocket，消息路由，会话管理 | Entry |
| Web Frontend | `src/web/` | Vue 浏览器界面，WS 通信 | Web Server (静态文件) |
| Core | `src/core/` | 会话、审议、turn 引擎 | UI / Server |
| Provider | `src/provider/` | LLM API 适配（6 家） | Core |
| Tools | `src/tools/` | 文件/Shell 工具、权限管理 | Core |
| Persistence | `src/persistence/` | 会话 JSON 保存/加载 | UI / Server |
| Config | `src/config/` | TOML 配置加载、校验 | Entry / UI / Server |
| Isolation | `src/isolation/` | git worktree 生命周期 | UI / Server |
| Testing | `src/testing/` | E2E 测试 Harness | 测试文件 |
