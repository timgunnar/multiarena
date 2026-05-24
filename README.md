# multiarena

终端原生多模型 AI 编程助手。同时与多个大模型对话，并排对比回答，择其优者执行。

**核心思路：** 不用在打字前选模型。每轮同时跑 N 个模型，事后比结果。

## 安装

```bash
npm install -g multiarena
```

## 快速开始

```bash
# 创建配置文件
cat > .multiarenarc << 'EOF'
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
broadcast = true
EOF

# 启动
multiarena
```

## 功能

- **广播模式** — 消息发给所有模型，并排查看回复
- **定向模式** — 消息只发给一个模型，全宽详情视图
- **对比模式** — 两个模型并排对比，差异一目了然
- **Tab 驱动** — `Tab` 循环切换对话目标，`↑↓` 滚动输出
- **隔离工作树** — 每个模型独立的 `git worktree`，无文件冲突
- **6 个内置工具** — bash、read、write、edit、glob、grep
- **权限控制** — 会话记忆，跨模型共享授权

## 支持的 Provider

| Provider | 模型 |
|----------|------|
| Anthropic | Claude Sonnet 4.6、Opus 4.7、Haiku 4.5 |
| OpenAI | GPT-4o、GPT-4.1 |
| Google | Gemini 2.5 Flash、Gemini 2.5 Pro |
| DeepSeek | DeepSeek-V4、DeepSeek-R1 |
| MiniMax | MiniMax-M1 |
| Ollama | 任意本地模型 |

## 快捷键

| 按键 | 功能 |
|------|------|
| `Tab` | 循环切换目标（广播 → 模型A → 模型B → …） |
| `d` | 将当前模型与另一个对比 |
| `m` | 静音/取消静音模型 |
| `r` | 重置模型对话历史 |
| `q` | 退出 |
| `↑ ↓` | 滚动输出/历史 |
| `Esc` | 返回广播模式 |

## 配置

配置文件为 `.multiarenarc`（TOML 格式），读取顺序：当前目录 → `~/.multiarenarc`。支持 `${ENV_VAR}` 环境变量。

```toml
[models.<名称>]
provider = "anthropic"       # anthropic | openai | google | deepseek | minimax | ollama
model = "claude-sonnet-4-6"  # API 模型标识
api_key = "${ENV_VAR}"       # API key（可选，可直接用环境变量）
endpoint = "..."             # 自定义端点（可选）
context_limit = 200000       # 覆盖上下文窗口（可选）

[defaults]
active = ["claude", "gpt"]   # 启动时加载的模型
broadcast = true             # 启动时进入广播模式
```

会话保存至 `~/.multiarena/sessions/`。使用 `multiarena --resume <id>` 恢复历史会话。

## License

MIT
