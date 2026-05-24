# multiarena

终端原生多模型 AI 助手。一键提问，多个大模型同时回答，并帮你选出最佳方案，彻底告别单一模型可能出现的幻觉问题。

## 解决什么问题

| 问题                                       | 解决方案                     |
|------------------------------------------|--------------------------|
| **单模型不稳定** — 同一个问题，不同模型回答质量天差地别，靠运气不如都试试 | 一键提问，多个模型同时回答，终端内并排查看    |
| **被一个厂商绑定** — 换了厂商就得换工具，迁移成本高            | 同时支持 6 家厂商，接入新模型零成本      |
| **多模型对比太麻烦** — 开 N 个网页复制粘贴手动对齐           | 一键对比差异，两个模型回答并排展示        |
| **没有交叉验证** — 一个模型说错了没人帮你检查和质疑            | 多模型接力协作，起草→修订→润色→审查，多重打磨 |

**适用场景：** 文档写作、代码生成、数据分析、技术方案评审、创意写作等任何需要高质量输出的场景。

## 广播模式（启动默认）

消息同时发给所有模型，分栏并排查看回答。

```
┌─ claude ──────────────────────┐ ┌─ gpt ─────────────────────────┐
│                               │ │                               │
│  可以使用 ls 列出当前目录文件： │ │  你可以用 ls 或 dir 命令查看目 │
│  $ ls -la                     │ │  录内容：                      │
│  total 48                     │ │  $ ls                          │
│  drwxr-xr-x  12 user  staff   │ │  src/  test/  package.json     │
│                               │ │                               │
│  3 lines · 1K/200K · done     │ │  3 lines · 1K/128K · done     │
└───────────────────────────────┘ └───────────────────────────────┘
 claude ●  gpt ●   Tab:model d:compare m:mute r:reset q:quit ↑↓:scroll/history Esc:cancel
[all] > ▊
```

### 定向模式（Tab 切换）

按 `Tab` 切换到只跟某一个模型对话。输入栏前缀变为该模型名，消息只发给它，输出区切换为全宽详情视图。再按 `Tab` 切回广播模式。

```
┌─ claude ───────────────────────────────────────────────────────────────┐
│                                                                        │
│  我来详细分析这个方案的优缺点：                                            │
│                                                                        │
│  **优点：**                                                              │
│  1. 四层架构清晰，每层职责单一，易于测试和维护                               │
│  2. Provider 接口设计简洁，新增模型只需实现 chat() 方法                     │
│                                                                        │
│  **改进建议：**                                                          │
│  1. 添加请求重试和降级策略，提高可用性                                     │
│  2. 工具调用可增加超时控制和并发限制                                        │
│                                                                        │
│  2K/200K · 15 lines · done                                             │
└────────────────────────────────────────────────────────────────────────┘
 claude ●  gpt    Tab:switch d:compare m:mute r:reset q:quit ↑↓:scroll/history Esc:cancel
[claude] > ▊
```

### 对比模式（按 `d`）

输入栏为空时按 `d`，将当前模型与另一个模型的回答并排对比，差异一目了然。再按 `d` 退出对比。

```
┌─ claude ──────────────────────┐ ┌─ gpt ─────────────────────────┐
│                               │ │                               │
│  推荐使用策略模式，将每种算法封 │ │  建议用工厂模式配合依赖注入来解 │
│  装为独立的策略类。这样新增算法 │ │  耦。定义抽象工厂接口，每个模  │
│  只需添加新类，无需修改现有代码 │ │  型提供具体实现。              │
│                               │ │                               │
│  2K/200K · 12 lines · done    │ │  1K/128K · 14 lines · done   │
└───────────────────────────────┘ └───────────────────────────────┘
 claude ●  gpt ●   Tab:switch d:compare m:mute r:reset q:quit ↑↓:scroll/history Esc:cancel
[claude] > ▊
```

## 团队模式（Shift+Tab 切换）

多个模型接力协作，产出一份经过多重打磨的最佳文档。适合需要高质量最终产出的任务。

### 接力生成

输入任务描述后提交，多个模型按顺序加工：起草 → 修订 → 润色 → 终审。每个模型在前一个的基础上改进，最终产出经过多视角打磨的文档。

```
┌─ 团队审议 ─────────────────────────────────────────────────────────────┐
│                                                                        │
│  Round 2/3 — claude (修订) ⏳                                         │
│                                                                        │
│  起草 → 修订 → 润色                                                     │
│   ✓       ●       ○                                                     │
│                                                                        │
│  ## 架构方案                                                             │
│                                                                        │
│  ### 概述                                                               │
│  采用四层架构设计，自上而下分为 UI 层、Core 层、Provider 层、工具层。      │
│                                                                        │
│  [修订: 建议使用微内核 → 建议使用四层架构，因为更符合终端应用的简单性]     │
│                                                                        │
│  ...streaming...                                                       │
└────────────────────────────────────────────────────────────────────────┘
 claude ●  gpt    Shift+Tab:/team Tab:model d:compare m:mute r:reset q:quit
[team] > ▊
```

### 合并已有回答

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

会话保存至 ~/.multiarena/sessions/。使用 multiarena --resume <id> 恢复历史会话。

## 支持的模型

| 厂商        | 模型                                   |
|-----------|--------------------------------------|
| Anthropic | Claude Sonnet 4.6、Opus 4.7、Haiku 4.5 |
| OpenAI    | GPT-4o、GPT-4.1                       |
| Google    | Gemini 2.5 Flash、Gemini 2.5 Pro      |
| DeepSeek  | DeepSeek-V4、DeepSeek-R1              |
| MiniMax   | MiniMax-M1                           |
| Ollama    | 任意本地模型                               |

## 快捷键

| 按键          | 功能                            |
|-------------|-------------------------------|
| `Tab`       | 切换对话模型（广播 → Claude → GPT → …） |
| `Shift+Tab` | 广播模式 / 团队模式 切换                |
| `d`         | 对比两个模型的回答                     |
| `m`         | 静音/取消静音某个模型                   |
| `r`         | 重置模型对话历史                      |
| `q`         | 退出                            |
| `↑ ↓`       | 滚动输出/历史                       |
| `Esc`       | 返回广播模式                        |

## License

MIT
