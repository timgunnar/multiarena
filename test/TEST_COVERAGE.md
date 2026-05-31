# 测试覆盖报告

> v0.2.0 · 440 测试 · 42 文件

## 单元测试

### Provider 层 (70 tests)
| 模块 | 文件 | 测试数 | 覆盖点 |
|------|------|--------|--------|
| Anthropic | `test/provider/adapters/anthropic.test.ts` | 9 | 构造、流式文本、tool_use 事件、错误、消息转换、工具定义转换、system prompt、abort |
| OpenAI | `test/provider/adapters/openai.test.ts` | 8 | 构造、流式文本、tool_call 事件、错误、消息转换、工具定义转换、system prompt |
| Google | `test/provider/adapters/google.test.ts` | 7 | 构造、流式文本、错误、function response 转换、工具定义转换、tool_call、system instruction |
| Ollama | `test/provider/adapters/ollama.test.ts` | 15 | 构造、流式文本、tool_call、NDJSON 解析、错误处理 |
| Think Filter | `test/provider/adapters/thinkFilter.test.ts` | 19 | think 标签状态机、边界情况、多标签嵌套 |
| Factory | `test/provider/provider.test.ts` | 12 | createProvider 工厂、各 provider 创建 |

### Core 引擎 (92 tests)
| 模块 | 文件 | 测试数 | 覆盖点 |
|------|------|--------|--------|
| Session | `test/core/session.test.ts` | 28 | 广播/定向消息、Tab 循环、静音跳过、mute 边界、reset、contextLimit |
| Turn | `test/core/turn.test.ts` | 10 | 纯文本、工具调用循环、错误、max rounds、参数解析、权限拒绝 |
| Deliberation | `test/core/deliberation.test.ts` | 22 | autoAssignRounds 镜像模式、对抗强度四级轮次、视角分配、runDeliberation、think phase |
| 集成 | `test/core/integration.test.ts` | 19 | Tab 循环、Shift+Tab、Esc、模式切换不跨模式 |
| 权限交互 | `test/core/permissionInteractive.test.ts` | 3 | prompt→allow→execute、prompt→deny、prompt→allow_always 记忆 |
| Config | `test/config/loader.test.ts` | 10 | TOML 加载、env 解析、默认值合并、校验 |

### 工具层 (31 tests)
| 模块 | 文件 | 测试数 | 覆盖点 |
|------|------|--------|--------|
| bash | `test/tools/bash.test.ts` | 5 | 正常执行、危险命令拒绝、空命令、超时、错误 |
| readFile | `test/tools/readFile.test.ts` | 3 | 正常读取、文件未找到、offset/limit |
| writeFile | `test/tools/writeFile.test.ts` | 4 | 正常写入、覆盖、权限、目录创建 |
| editFile | `test/tools/editFile.test.ts` | 5 | 精确替换、未匹配、多次替换 |
| glob | `test/tools/glob.test.ts` | 3 | 通配符匹配、无匹配、嵌套 |
| grep | `test/tools/grep.test.ts` | 4 | 正则匹配、无匹配、Node.js fallback |
| registry | `test/tools/registry.test.ts` | 4 | 注册、获取定义、执行、未知工具 |
| permission | `test/tools/permission.test.ts` | 18 | 默认允许、hardcoded 拒绝、记忆、交互式请求/响应、队列、destroy |

### UI 组件 (60 tests)
| 模块 | 文件 | 测试数 | 覆盖点 |
|------|------|--------|--------|
| modeTransitions | `test/ui/modeTransitions.test.ts` | 48 | 状态机全覆盖：Tab/ShiftTab/Esc/d/submitInTeam/buildModeState |
| InputBar | `test/ui/inputBar.test.ts` | 9 | 前缀、静音标签、快捷键提示、权限弹窗 |
| DeliberationView | `test/ui/deliberationView.test.ts` | 13 | 标题、管线、思考文本、完成状态、错误状态 |
| ModelDetail | `test/ui/modelDetail.test.ts` | 10 | 缓冲区、empty 状态、流式状态、错误行 |
| BroadcastSummary | `test/ui/broadcastSummary.test.ts` | 9 | 面板渲染、静音跳过、空状态 |
| OutputArea | `test/ui/outputArea.test.ts` | 6 | 广播/定向/团队/对比视图路由 |
| 其他 | friendlyToolLabel(11)、formatTokens(3)、CLI args(13) | 27 | 工具标签、token 格式化、CLI 参数解析 |

### 基础设施
| 模块 | 文件 | 测试数 | 覆盖点 |
|------|------|--------|--------|
| Worktree | `test/isolation/worktree.test.ts` | 5 | 创建、diff、cleanup、sweep |
| Session 持久化 | `test/persistence/session.test.ts` | 5 | 保存、加载、列表 |

## E2E 测试 (Harness) (100 tests)

| 模块 | 文件 | 测试数 | 覆盖链路 |
|------|------|--------|---------|
| 广播模式 | `test/harness/broadcast.test.ts` | 7 | 提交→多模型并发→buffer→messages→多轮历史→token→错误 |
| 团队审议 | `test/harness/deliberation.test.ts` | 11 | 提交→autoAssignRounds→runDeliberation→轮次验证→对抗四级强度→视角分配→标志剥离 |
| 会话持久化 | `test/harness/persistence.test.ts` | 7 | save(全字段)→resume→继续对话 |
| 清理 | `test/harness/cleanup.test.ts` | 4 | 会话文件创建、dispose、多会话隔离、全字段完整性 |
| 权限交互 | `test/harness/permission.test.ts` | 6 | 工具调用→权限弹窗→allow/deny/allow_always/deny_always→硬编码规则 |
| 合并 | `test/harness/merge.test.ts` | 5 | broadcast→merge→来源标注→指定模型→静音排除 |
| 团队聊天 | `test/harness/teamChat.test.ts` | 5 | 定向对话→多轮历史→错误→token |
| App 分支 | `test/harness/appBranches.test.ts` | 35 | /team 切换、对抗标志、静音、多轮会话、权限流程、配置覆盖 |
| 安装/卸载 | `test/harness/install.test.ts` | 5 | npm pack、文件清单、安装验证、卸载无残留 |

### Web 组件 (4 tests)
| 模块 | 文件 | 测试数 | 覆盖点 |
|------|------|--------|--------|
| i18n | `web/src/__tests__/useI18n.test.js` | 4 | 中英文翻译、切换、缺失 key 处理 |

## 未覆盖

| 区域 | 理由 |
|------|------|
| Ink 渲染层视觉回归 | 终端 UI 需要屏幕截图/快照对比，当前框架不支持 |
| `process.stdin` 原始字节监听 | 平台差异大，需要真实终端环境 |
| `WorktreeManager` 完整 git 操作 | 需要真实 git 仓库，当前仅单元测试模拟 |
| Vue 组件渲染测试 | 仅 i18n 逻辑测试，BroadcastView/DeliberationView 等需 `@vue/test-utils` + DOM 快照 |
| Web 端到端浏览器测试 | 需 Playwright/Cypress，未纳入当前测试框架 |
