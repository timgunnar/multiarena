# multiarena

[English](./README.md) | [中文](./README_CN.md)

**别只听一个 AI 的。** multiarena 让你同时和多个大模型对话 — Claude、GPT、Gemini、DeepSeek 等 — 对比它们的回答，让它们相互辩论，产出一个 AI 给不了的答案。

---

### 你遇到的问题

每个 AI 模型都有盲区。让一个模型写品牌故事，你得到一份还行的初稿。让一个模型分析决策，你只看到一个角度。最好的成果来自多元视角 — 但在聊天标签页之间来回切换太痛苦了。

### multiarena 怎么解决

multiarena 把多个模型放进同一个房间。广播一个问题，所有模型的回答分栏呈现。切换到团队模式，模型接力协作 — 起草、修订、润色、终审 — 产出一份经过 4 双眼睛审视的文档，而不是一双。

---

## 能做什么

| 场景 | multiarena 怎么帮你 |
|------|--------------------|
| **写更好的文案** | 3 个模型起草品牌故事 → 互相挑刺 → 交付一篇精致文案 |
| **辅助决策** | 所有模型同时评估一个方案 → 对比推理过程 → 发现共识和盲区 |
| **文档审查** | 模型轮番从不同角度批判你的草稿（质疑者、务实派、用户视角） |
| **头脑风暴** | 广播一个提示 → 4 个模型各出独特角度 → 合并成一份完整文档 |

---

## 怎么工作

```
广播模式                              团队模式 (Shift+Tab)
─────────────────────                ─────────────────────
你: "评估这个方案"                    你: "帮我写品牌故事"
     ↓                                    ↓
┌─claude──┐ ┌─gpt─────┐ ┌─ds───┐    第1轮: minimax 起草
│ ...     │ │ ...     │ │ ...  │    第2轮: deepseek 修订
└─────────┘ └─────────┘ └──────┘    第3轮: minimax 润色
     ↓                               第4轮: deepseek 终审
分栏对比，选出最好的答案               第5轮: minimax 最终审查
                                           ↓
                                    一篇经得起推敲的交付文档
```

**团队审议不只是接力 — 它是对抗性的。** 模型相互质疑假设、暴露漏洞、辩护选择。最终产出的文档经过了真正的审视。

---

## 快速开始

```bash
npm install -g multiarena
multiarena                # 浏览器中打开 Web 界面
multiarena terminal       # 终端模式（喜欢命令行的开发者）
```

没配 config？没关系。Web 界面有设置向导引导你完成。或者手动创建 `.multiarenarc`：

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

## 安装

```bash
npm install -g multiarena          # 推荐
git clone git@github.com:timgunnar/multiarena.git  # 源码安装
```

## 支持的模型

Anthropic (Claude) · OpenAI (GPT-4o) · Google (Gemini) · DeepSeek · MiniMax · Ollama (本地模型)

## CLI

```bash
multiarena              # Web 界面（无需参数）
multiarena terminal     # 终端模式
multiarena -r <id>      # 恢复会话
multiarena -l           # 列出会话
multiarena -h           # 帮助
```

## License

MIT

---

📖 **[用户手册](./USER_GUIDE_CN.md)** — 完整文档：架构、配置、Web UI、会话管理、故障排查
