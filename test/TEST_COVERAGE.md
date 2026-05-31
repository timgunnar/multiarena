# 测试覆盖报告

> v0.2.0 · 43 文件 · 441 测试（主）+ 4 测试（Web）

## 基础设施测试 (5)

| 模块 | 文件 | 测试数 | 覆盖点 |
|------|------|--------|--------|
| Worktree | `test/isolation/worktree.test.ts` | 5 | 创建、diff、cleanup、sweep |

## 核心模块测试 (95)

| 模块 | 文件 | 测试数 | 覆盖点 |
|------|------|--------|--------|
| Session | `test/core/session.test.ts` | 28 | 广播/定向消息、Tab 循环、静音、reset、contextLimit |
| Turn | `test/core/turn.test.ts` | 10 | 流式文本、tool_call 循环、错误、max rounds、权限拒绝、交互权限 |
| Deliberation | `test/core/deliberation.test.ts` | 22 | autoAssignRounds、对抗四级强度、视角分配、runDeliberation |
| Permission | `test/tools/permission.test.ts` | 18 | 硬编码拒绝、记忆、交互式请求/响应、队列、destroy |
| Config | `test/config/loader.test.ts` | 10 | TOML 加载、env 解析、默认值、校验 |
| Integration | `test/core/integration.test.ts` | 19 | Tab/ShiftTab/Esc 模式切换 |

## CLI 端测试 (33)

| 模块 | 文件 | 测试数 | 覆盖点 |
|------|------|--------|--------|
| CLI Args | `test/cli/args.test.ts` | 17 | --help/--version/--resume/--list/--web/?/web/terminal |
| Provider Adapters | 5 文件 | 58 | Anthropic/OpenAI/Google/Ollama 流式/tool_call/错误/abort |
| Provider Factory | `test/provider/provider.test.ts` | 12 | createProvider、各 provider 创建 |
| Think Filter | `test/provider/adapters/thinkFilter.test.ts` | 19 | think 标签状态机、嵌套 |

## Web 端测试 (4)

| 模块 | 文件 | 测试数 | 覆盖点 |
|------|------|--------|--------|
| i18n | `web/src/__tests__/useI18n.test.js` | 4 | 中英文翻译、语言切换、缺失 key |

## 多端交互测试 (12)

| 模块 | 文件 | 测试数 | 覆盖点 |
|------|------|--------|--------|
| Server HTTP | `test/server/server.test.ts` | 5 | SS E headers、state/mute/reset/permission 命令 |
| SessionManager | `test/server/sessionManager.test.ts` | 7 | 构造/静音/setTarget/reset/perm/对抗/save |
| Cross-Env | `test/harness/crossEnvironment.test.ts` | 5 | CLI→Web 会话恢复/对抗配置共享/teamMessages/权限/静音共享 |

## E2E 测试 (107)

| 模块 | 文件 | 测试数 | 覆盖链路 |
|------|------|--------|---------|
| Broadcast | `test/harness/broadcast.test.ts` | 7 | 提交→多模型并发→buffer→messages→多轮历史→token→错误 |
| Deliberation | `test/harness/deliberation.test.ts` | 11 | 提交→autoAssignRounds→runDeliberation→轮次→对抗四级→视角 |
| Persistence | `test/harness/persistence.test.ts` | 7 | save(全字段)→resume→继续对话 |
| Cleanup | `test/harness/cleanup.test.ts` | 4 | 会话文件创建/dispose/多会话隔离 |
| Permission | `test/harness/permission.test.ts` | 6 | tool_call→弹窗→allow/deny/always/硬编码 |
| Merge | `test/harness/merge.test.ts` | 5 | broadcast→merge→来源标注→指定模型→静音排除 |
| TeamChat | `test/harness/teamChat.test.ts` | 5 | 定向对话→多轮历史→错误→token |
| AppBranches | `test/harness/appBranches.test.ts` | 35 | /team 切换/对抗标志/静音/多轮/权限/配置覆盖 |
| Install | `test/harness/install.test.ts` | 1 | pack→install→verify→files→uninstall |
| PermInteractive | `test/core/permissionInteractive.test.ts` | 3 | prompt→allow→execute/deny/allow_always 记忆 |
| Session IO | `test/persistence/session.test.ts` | 5 | JSON 保存/加载/列表 |

## UI 组件测试 (60)

| 模块 | 文件 | 测试数 | 覆盖点 |
|------|------|--------|--------|
| Mode Transitions | `test/ui/modeTransitions.test.ts` | 48 | Tab/ShiftTab/Esc/d/submitInTeam/buildModeState |
| InputBar | `test/ui/inputBar.test.ts` | 9 | 前缀、静音标签、快捷键提示、权限弹窗 |
| DeliberationView | `test/ui/deliberationView.test.ts` | 13 | 标题、管线、思考文本、完成/错误 |
| Others | friendlyToolLabel/formatTokens/MD/BS/OutputArea/registry + 工具层 7 文件 | 59 | |

## 未覆盖

| 区域 | 理由 |
|------|------|
| Ink 渲染层 | 终端 UI 视觉回归需屏幕截图对比 |
| process.stdin | 平台差异大，需真实终端环境 |
| Vue 组件渲染 | 仅 i18n 逻辑测试，BroadcastView/DeliberationView 未测 |
| Web SSE 连通性 | 需浏览器环境 (Playwright) |
| Web E2E | 需 Playwright/Cypress，未纳入 |
