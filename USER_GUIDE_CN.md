# multiarena 用户手册

[English](./USER_GUIDE.md) | [中文](./USER_GUIDE_CN.md)

## 目录

1. [安装与卸载](#1-安装与卸载)
2. [快速开始](#2-快速开始)
3. [架构总览](#3-架构总览)
4. [配置详解](#4-配置详解)
5. [CLI 命令](#5-cli-命令)
6. [CLI UI 交互](#6-cli-ui-交互)
7. [Web UI 交互](#7-web-ui-交互)
8. [会话管理](#8-会话管理)
9. [权限系统](#9-权限系统)
10. [快捷键](#10-快捷键)
11. [故障排查](#11-故障排查)

---

## 1. 安装与卸载

### npm（推荐）

```bash
npm install -g multiarena
```

### 从源码安装

```bash
git clone git@github.com:timgunnar/multiarena.git
cd multiarena
npm install
npm run build
npm link
```

### 验证安装

```bash
multiarena --version
# multiarena v0.1.8
```

### 卸载

```bash
npm uninstall -g multiarena
```

**卸载不会删除** `~/.multiarena/sessions/` 目录（会话数据）。如需清除：

```bash
rm -rf ~/.multiarena
```

### 前置条件

| 依赖 | 版本要求 |
|------|---------|
| Node.js | >= 18.0.0 |
| git | >= 2.30（worktree 隔离需要） |
| ripgrep (rg) | 可选（grep 工具需要） |

---

## 2. 快速开始

### 第一步：创建配置文件

在项目根目录或家目录创建 `.multiarenarc`：

```toml
[models.claude]
provider = "anthropic"
model = "claude-sonnet-4-6"
api_key = "${ANTHROPIC_API_KEY}"

[models.gpt]
provider = "openai"
model = "gpt-4o"
api_key = "${OPENAI_API_KEY}"

[defaults]
active = ["claude", "gpt"]
```

### 第二步：启动

```bash
multiarena
```

### 第三步：开始对话

- 输入消息后按 `Enter` — 多个模型同时回答
- 按 `Tab` 进入单个模型的详情视图
- 按 `Shift+Tab` 进入团队审议模式

---

## 3. 架构总览

```
┌──────────────────────────────────────────────────┐
│                  入口层                           │
│  multiarena (CLI)  │  multiarena --web (浏览器)    │
└──────────┬──────────────────┬────────────────────┘
           │                  │
           ▼                  ▼
┌──────────────────┐ ┌─────────────────────────────┐
│   CLI UI         │ │   Web 服务器 (HTTP + SSE)    │
│   (Ink/React)    │ │   src/server/                │
│   src/ui/        │ └──────────────┬──────────────┘
└────────┬─────────┘                │
         │                          ▼
         │               ┌─────────────────────────────┐
         └──────────────→│        核心层               │
                         │       src/core/             │
                         │                             │
                         │  Session    ── 会话状态      │
                         │  Turn       ── 流式引擎      │
                         │  Deliberation ─ 审议引擎    │
                         └──────┬──────────────────────┘
                                │
              ┌─────────────────┼──────────────────┐
              ▼                 ▼                  ▼
     ┌────────────┐  ┌──────────────┐  ┌──────────────────┐
     │ Provider   │  │    工具层    │  │     持久化       │
     │ (6 家 API) │  │ (6 个内置)   │  │  (JSON 会话)     │
     └────────────┘  └──────────────┘  └──────────────────┘
```

| 层 | 目录 | 职责 |
|----|------|------|
| CLI UI | `src/ui/` | 终端界面（Ink/React） |
| Web 服务器 | `src/server/` | HTTP + SSE，消息路由 |
| Web 前端 | `src/web/` | Vue 3 浏览器界面 |
| 核心层 | `src/core/` | 会话、流式、审议引擎 |
| Provider 层 | `src/provider/` | 6 家 LLM API 适配 |
| 工具层 | `src/tools/` | 文件/Shell 操作、权限 |
| 持久化 | `src/persistence/` | 会话 JSON 保存/加载 |
| 配置 | `src/config/` | TOML 配置加载 |
| 隔离 | `src/isolation/` | git worktree 生命周期 |

完整架构图：`docs/multiarena-architecture.md`

---

## 4. 配置详解

### 配置文件

- **位置**：项目根目录的 `.multiarenarc` 或 `~/.multiarenarc`
- **格式**：TOML
- **环境变量**：支持 `${ENV_VAR}` 语法

### 完整示例

```toml
[models.claude]
provider = "anthropic"
model = "claude-sonnet-4-6"
api_key = "${ANTHROPIC_API_KEY}"
context_limit = 200000

[models.gpt]
provider = "openai"  
model = "gpt-4o"
api_key = "${OPENAI_API_KEY}"

[models.ollama]
provider = "ollama"
model = "llama3"
endpoint = "http://localhost:11434/v1"

[defaults]
active = ["claude", "gpt", "ollama"]
broadcast = true

[deliberation]
constraint_file = "rules.md"
adversarial = "high"

[[deliberation.rounds]]
model = "claude"
role = "draft"

[[deliberation.rounds]]
model = "gpt"
role = "revise"
```

### 支持的 Provider

| Provider | 厂商 | 说明 |
|----------|------|------|
| `anthropic` | Anthropic | Claude Sonnet / Opus / Haiku |
| `openai` | OpenAI | GPT-4o、GPT-4.1 |
| `google` | Google | Gemini 系列 |
| `deepseek` | DeepSeek | DeepSeek-V3、DeepSeek-R1 |
| `minimax` | MiniMax | MiniMax-M2 系列 |
| `ollama` | Ollama | 任意本地模型 |

---

## 5. CLI 命令

### 基本用法

```bash
multiarena                           # 启动 Web 界面（推荐，无需参数）
multiarena terminal                  # 启动终端模式（开发者）
multiarena web                       # 启动 Web 模式（默认端口）
multiarena web 8080                  # 启动 Web 模式（自定义端口）
multiarena --web [port]              # 同上
multiarena --help, -h, ?             # 显示帮助
multiarena --version, -v             # 显示版本
multiarena --list, -l                # 列出已保存会话
multiarena --resume, -r <id>         # 恢复已保存会话
```

### 应用内命令

在输入栏中键入，非 CLI 参数：

| 命令 | 效果 |
|------|------|
| `/team` | 切换团队模式 |
| `/team -a high` | 以高对抗强度进入团队模式 |
| `/merge` | 合并所有模型的输出为一个文档 |

### 退出

按 `q` 或 `Ctrl+C` 退出。退出时自动保存会话。

---

## 6. CLI UI 交互

### 模式系统

multiarena 有两个顶层模式：

```
广播模式 (Broadcast)                团队模式 (Team)
  ├── 总览：多面板并排                ├── 总览：审议入口/结果
  └── 定向：单个模型全宽              └── 定向：与模型私聊
```

### 广播模式（默认启动）

消息同时发给所有非静音模型。

- **总览**：多列面板并排显示各模型回答
- **定向** (Tab)：进入单个模型的全宽详情
- **对比** (d)：双模型并排对比

### 团队模式 (Shift+Tab 进入)

多个模型接力协作，起草 → 修订 → 润色 → 终审，生成一份精致文档。

- **总览**：输入任务启动审议，完成后查看结果
- **定向** (Tab)：使用团队共享上下文与某模型私聊

### 模式切换规则

```
          Shift+Tab (仅在总览生效)
广播总览 ←─────────────────────────→ 团队总览
   ↑ Tab                                ↑ Tab
广播定向                              团队定向
   ↑                                    ↑
   └─── Esc ────────────────────────────┘
```

- **Tab**：当前模式内循环（总览 → 模型1 → 模型2 → 总览）
- **Shift+Tab**：广播 ↔ 团队切换（仅在总览生效）
- **Esc**：返回当前模式总览
- **d**：对比模式（输入栏为空时）

### 输入栏前缀

| 前缀 | 所处位置 |
|------|---------|
| `[all]` | 广播总览 |
| `[claude]` | 广播定向到 claude |
| `[team]` | 团队总览 |
| `[team:claude]` | 团队定向到 claude |

### 团队审议流程

1. 进入团队总览（`Shift+Tab`）
2. 输入任务描述 → `Enter`
3. 模型按序接力：起草 → 修订 → 润色 → 终审
4. 每轮显示私有思考（💭）后再公开提交
5. 结果：精致文档 + 修改摘要
6. 按 `Tab` 可就审议结果与任一模型讨论

### 对抗强度

控制模型之间相互批判的深度：

| 强度 | 效果 |
|------|------|
| `off`（默认） | 纯协作接力 |
| `low` | 修订轮注入批判提示 |
| `medium` | 每轮输出批判点 + 修改 |
| `high` | 分配批判视角 + 镜像对抗轮次 |

配置方式：`[deliberation] adversarial = "high"` 或 CLI 命令 `/team -a high`

---

## 7. Web UI 交互

### 启动 Web 模式

```bash
multiarena --web          # 启动 localhost:3000
multiarena --web 8080     # 自定义端口
```

浏览器自动打开。

### 布局

```
┌─ 侧栏 ──┬─ 主区域 ────────────────────────────┐
│ 会话     │ ┌─ claude ──┐ ┌─ gpt ────────────┐ │
│          │ │           │ │                   │ │
│ + 新建   │ │ 回复内容…  │ │ 回复内容…          │ │
│          │ │           │ │                   │ │
│ 会话列表  │ └───────────┘ └───────────────────┘ │
│          │ ─────────────────────────────────────│
│          │ [all] > ▊                             │
└──────────┴─────────────────────────────────────┘
```

### 功能

- **广播模式**：多面板流式输出，与 CLI 一致
- **团队审议**：轮次管线可视化
- **权限弹窗**：模态对话框确认工具调用
- **会话管理**：侧栏新建/切换/删除会话
- **键盘操作**：与 CLI 相同的快捷键映射

### 安全约束

- 服务器仅监听 `127.0.0.1`（不暴露于网络）
- API key 永不离开服务端进程
- 无需认证（仅本地访问）

### 当前状态

Web UI 正在开发中（目标 v0.3.0）。服务端已完成 — `multiarena web` 即可启动 HTTP + SSE 后端。Vue 前端开发中。当前可试：

```bash
cd web && npm install && npm run dev    # 启动 Vite 开发服务器
# 另一个终端：
multiarena web                           # 启动后端
```

打开 `http://localhost:5173`（Vite 自动代理 API 到后端）。

---

## 8. 会话管理

### 自动保存

每次消息交换后自动保存。按 `q` 或 `Ctrl+C` 退出时也保存。

### 会话文件

```
~/.multiarena/sessions/
├── m2t8k1.json
├── m2t9p3.json
└── ...
```

### 会话 JSON 结构

```json
{
  "id": "m2t8k1",
  "timestamp": "2026-05-31T10:00:00Z",
  "models": [
    {
      "name": "claude",
      "messages": [...],
      "buffer": "...",
      "usage": { "input": 5000, "output": 2000 },
      "muted": false
    }
  ],
  "teamMessages": [...],
  "permissions": [
    { "toolName": "bash", "args": {...}, "decision": "allow_always" }
  ],
  "inputHistory": ["你好", "写一个故事"],
  "lastTarget": "broadcast"
}
```

### 恢复会话

```bash
multiarena -r mygrz3
```

### 手动编辑

用户可直接编辑会话 JSON 文件来修改权限记录或删除对话历史。下次 `--resume` 时生效。

---

## 9. 权限系统

### 交互式弹窗

当模型请求调用工具时，弹出确认提示：

```
!!! Allow "claude" to run $ git status? [y]es/[n]o/[a]lways allow/[d]eny always
```

| 按键 | 效果 |
|------|------|
| `y` | 允许本次调用 |
| `n` | 拒绝本次调用 |
| `a` | 始终允许（保存到会话文件） |
| `d` | 始终拒绝（保存到会话文件） |
| `q` | 退出（拒绝所有待处理请求） |

### 安全规则（不可覆盖）

- `bash` 执行 `rm -rf /` 或 `sudo` 命令
- 读取 `.env` 或 `.git-credentials` 文件

### 跨模型共享

权限在所有模型间共享。允许 claude 执行 `bash git status` 后，gpt 也无需再次询问。

### 手动编辑

编辑会话 JSON 中的 `permissions` 数组可预授权或阻止工具调用。

---

## 10. 快捷键

### CLI

| 按键 | 功能 | 约束 |
|------|------|------|
| `Tab` | 当前模式内循环切换目标 | 不切换模式 |
| `Shift+Tab` | 广播 ↔ 团队切换 | 仅在总览生效 |
| `Esc` | 返回总览 / 退出对比 / 中止审议 | 不切换模式 |
| `d` | 对比两个模型 | 输入栏为空时 |
| `m` | 静音/取消静音当前模型 | 定向模式 |
| `r` | 重置当前模型上下文 | 定向模式 |
| `↑ ↓` | 浏览历史输入 / 滚动输出 | |
| `q` | 退出（自动保存） | |

### Web

| 按键 | 功能 |
|------|------|
| `Tab` | 当前模式内循环切换目标 |
| `Shift+Tab` | 广播 ↔ 团队切换 |
| `Esc` | 返回总览 / 关闭弹窗 |

---

## 11. 故障排查

### 未配置模型

在项目根目录或 `~` 下创建 `.multiarenarc` 文件。参见[快速开始](#2-快速开始)。

### 读取文件权限被拒绝

权限系统阻止读取 `.env` 和 `.git-credentials` 文件。如确实需要，可在会话 JSON 中手动添加允许条目。

### 审议需要至少 2 个模型

至少需要 2 个已配置且非静音的模型。检查配置中 `defaults.active` 字段。

### Worktree 错误

上次崩溃遗留的孤儿 worktree 在下次启动时自动清理。如持续报错，手动删除 `/tmp/multiarena-worktrees/`。

### Web 模式显示空白页

运行 `npm run build:web` 编译 Vue 前端。Web UI 从 v0.3.0 起可用。

### 会话恢复失败

检查 `~/.multiarena/sessions/` 目录。使用 `--list` 查看可用会话。
