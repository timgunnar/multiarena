# multiarena

终端原生多模型 AI 助手。一键提问，多个大模型同时回答，帮你选出最佳方案。

## 解决的痛点

| 痛点 | 说明 |
|------|------|
| **单模型不稳定** | 同一个问题，不同模型回答质量天差地别，靠运气不如都试试 |
| **被一个厂商绑定** | 换了厂商就要换工具，迁移成本高 |
| **多模型对比太麻烦** | 开 N 个网页/终端，复制粘贴，手动对齐 |
| **没有交叉验证** | 一个模型说错了你也不知道，没人帮你检查和质疑 |

## 解决方案

| 能力 | 怎么做 |
|------|--------|
| **一个输入，多个回答** | 消息同时发给多个模型，终端内并排查看 |
| **模型协作打磨** | 多个模型接力：起草 → 修改 → 润色 → 审查，产出一份高质量文档 |
| **一键对比差异** | 两个模型回答并排展示，差别一目了然 |
| **不绑定厂商** | 同时支持 Anthropic、OpenAI、Google、DeepSeek、MiniMax、Ollama |

**适用场景：** 文档写作、代码生成、数据分析、技术方案评审、创意写作等任何需要高质量输出的场景。

## 两种模式

### 广播模式（默认）

消息发给所有模型，分栏并排查看回答。适合：快速对比各模型的思路和方案。

### 团队模式（Shift+Tab 切换）

多个模型接力协作，产出一份经过多重打磨的最佳文档。适合：需要高质量最终产出的任务。

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
EOF

# 启动
multiarena
```

## 快捷键

| 按键 | 功能 |
|------|------|
| `Tab` | 切换对话模型（广播 → Claude → GPT → …） |
| `Shift+Tab` | 广播模式 / 团队模式 切换 |
| `d` | 对比两个模型的回答 |
| `m` | 静音/取消静音某个模型 |
| `r` | 重置模型对话历史 |
| `q` | 退出 |
| `↑ ↓` | 滚动输出/历史 |
| `Esc` | 返回广播模式 |

## 支持的模型

| 厂商 | 模型 |
|------|------|
| Anthropic | Claude Sonnet 4.6、Opus 4.7、Haiku 4.5 |
| OpenAI | GPT-4o、GPT-4.1 |
| Google | Gemini 2.5 Flash、Gemini 2.5 Pro |
| DeepSeek | DeepSeek-V4、DeepSeek-R1 |
| MiniMax | MiniMax-M1 |
| Ollama | 任意本地模型 |

## 配置

配置文件 `.multiarenarc`（TOML 格式），放在当前目录或 `~/.multiarenarc`。

```toml
[models.<名称>]
provider = "anthropic"       # anthropic | openai | google | deepseek | minimax | ollama
model = "claude-sonnet-4-6"  # API 模型名
api_key = "${ENV_VAR}"       # API key，支持环境变量
endpoint = "..."             # 自定义端点（可选）
context_limit = 200000       # 上下文窗口大小（可选）

[defaults]
active = ["claude", "gpt"]   # 启动时加载的模型
```

## License

MIT
