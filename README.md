# multiarena

终端原生多模型 AI 助手。一键提问，多个大模型同时回答，帮你选出最佳方案。

## 解决了什么问题

| 问题 | 说明 |
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

消息同时发给所有模型，分栏并排查看回答。适合快速对比各模型的思路和方案。

#### 定向模式（Tab 切换）

在广播模式下按 `Tab`，切换到只跟某一个模型对话。输入栏前缀变为该模型名，消息只发给它。再按 `Tab` 切回广播模式。

#### 对比模式（按 `d`）

输入栏为空时按 `d`，将当前模型与另一个模型的回答并排对比，差异一目了然。再按 `d` 退出对比。

### 团队模式（Shift+Tab 切换）

多个模型接力协作，产出一份经过多重打磨的最佳文档。适合需要高质量最终产出的任务。

#### 接力生成

输入任务描述后提交，多个模型按顺序加工：起草 → 修订 → 润色 → 终审。每个模型在前一个的基础上改进，最终产出经过多视角打磨的文档。

#### 合并已有回答

先让各模型在广播模式下各自回答一个问题，然后输入 `/merge`，让一个模型把所有回答合并为一份综合文档，标注共识和分歧。

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
