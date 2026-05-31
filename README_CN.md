# multiarena

[English](./README.md) | [中文](./README_CN.md)

终端原生多模型 AI 协作工具。一键提问，多个大模型同时回答；多模型接力审议，产出经过多重打磨的文档。

## 快速开始

```bash
npm install -g multiarena
multiarena                # 启动 Web 界面（推荐）
multiarena terminal       # 启动终端模式（开发者）
```

## 模式系统

| 模式 | 触发 | 行为 |
|------|------|------|
| **广播** | 默认 | 消息发给所有模型，分栏并排查看 |
| **团队** | `Shift+Tab` | 多模型接力：起草 → 修订 → 润色 → 终审 |

### 输入栏前缀

| 前缀 | 位置 |
|------|------|
| `[all]` | 广播 — 所有模型 |
| `[模型名]` | 广播 — 定向到该模型 |
| `[team]` | 团队 — 总览 |
| `[team:模型名]` | 团队 — 定向到该模型 |

### 模式切换

```
          Shift+Tab (仅在总览时)
广播总览 ←────────────────────────→ 团队总览
   ↑ Tab                               ↑ Tab
广播定向                             团队定向
   ↑                                   ↑
   └─── Esc ───────────────────────────┘
```

**Tab** — 模式内循环。**Shift+Tab** — 切换模式。**Esc** — 返回总览。**d** — 对比模式。

## 安装

### npm

```bash
npm install -g multiarena
```

### 源码安装

```bash
git clone git@github.com:timgunnar/multiarena.git
cd multiarena && npm install && npm run build && npm link
```

### 卸载

```bash
npm uninstall -g multiarena
rm -rf ~/.multiarena   # 可选：清除会话数据
```

## 配置

`.multiarenarc`（TOML 格式），放在项目根目录或 `~/.multiarenarc`：

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

[deliberation]
adversarial = "high"        # off | low | medium | high

[[deliberation.rounds]]
model = "claude"
role = "draft"
```

会话保存至 `~/.multiarena/sessions/`。使用 `multiarena --resume <id>` 恢复。

详细配置 → [用户手册](./USER_GUIDE_CN.md#4-配置详解)

## 支持的 Provider

| Provider | 模型系列 |
|----------|---------|
| `anthropic` | Claude Sonnet / Opus / Haiku |
| `openai` | GPT-4o、GPT-4.1 |
| `google` | Gemini 系列 |
| `deepseek` | DeepSeek-V3、DeepSeek-R1 |
| `minimax` | MiniMax-M2 系列 |
| `ollama` | 任意本地模型 |

## CLI 命令

```bash
multiarena              # 启动 Web 界面
multiarena terminal     # 启动终端模式
multiarena web          # Web 模式（默认端口）
multiarena -r <id>      # 恢复会话
multiarena -l           # 列出会话
multiarena -h           # 帮助
```

## 快捷键

| 按键 | 功能 | 说明 |
|------|------|------|
| `Tab` | 当前模式内循环切换 | 不切换模式 |
| `Shift+Tab` | 广播 ↔ 团队 | 仅在总览 |
| `Esc` | 总览 / 退出 / 中止 | |
| `d` | 对比两个模型 | 输入为空 |
| `m` | 静音/取消静音 | 定向模式 |
| `r` | 重置上下文 | 定向模式 |
| `↑ ↓` | 历史 / 滚动 | |
| `q` | 退出（自动保存）| |

## License

MIT

---

📖 **[用户手册](./USER_GUIDE_CN.md)** — 安装卸载、架构、Web UI、会话管理、故障排查
