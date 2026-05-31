# multiarena

[English](./README.md) | [中文](./README_CN.md)

**Stop relying on a single AI's opinion.** multiarena lets you talk to multiple LLMs at once — Claude, GPT, Gemini, DeepSeek, and more — compare their answers, and let them debate each other to produce the best result.

---

### The Problem

Every AI model has blind spots. Ask one model to write a brand story, and you get a decent draft. Ask one model to analyze a decision, and you get one perspective. The best work comes from multiple viewpoints — but switching between chat tabs is painful.

### The Solution

multiarena puts multiple models in the same room. Broadcast a question, see every model's answer side-by-side. Switch to team mode, and models collaborate in relay — drafting, revising, polishing — to produce a document that's been through 4 pairs of eyes, not just one.

---

## What You Can Do

| Task | How multiarena helps |
|------|---------------------|
| **Write better copy** | 3 models draft a brand story → debate each other's choices → deliver a polished piece |
| **Analyze decisions** | Ask all models to evaluate a proposal → compare their reasoning → spot consensus and blind spots |
| **Review documents** | Models take turns critiquing your draft from different angles (skeptic, pragmatist, user advocate) |
| **Brainstorm ideas** | Broadcast a prompt → 4 models each contribute unique angles → merge into one document |

---

## Web UI

Clean, intuitive interface for non-technical users. Zero config — start with a setup wizard.

```
┌──────────────────────────────────────────────────────────┐
│  ⚡ multiarena                           [⚙] [🌙] [中]  │
│──────────────────────────────────────────────────────────│
│                                                          │
│                   下午好，Tim 👋                           │
│                  今天想做什么？                             │
│                                                          │
│  ┌── ✍️ 写文案 ──┐ ┌── 📊 分析数据 ──┐                   │
│  │ 品牌故事      │ │ 对比方案         │                   │
│  │ 广告语        │ │ 分析报告         │                   │
│  │ 产品介绍      │ │ 数据解读         │                   │
│  └──────────────┘ └─────────────────┘                   │
│                                                          │
│  ┌── 💡 出主意 ──┐ ┌── 🔍 审文档 ──┐                   │
│  │ 产品名        │ │ 找漏洞           │                   │
│  │ Slogan        │ │ 改措辞           │                   │
│  │ 活动创意      │ │ 润色             │                   │
│  └──────────────┘ └─────────────────┘                   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  帮我写精品咖啡烘焙商的品牌故事，用在官网About页…  │   │
│  └──────────────────────────────────────────────────┘   │
│                              [让 AI 团队开始 →]          │
└──────────────────────────────────────────────────────────┘
```

→ `multiarena` (no args needed)

## CLI

Terminal-native for developers. Keyboard-driven, fast, stays in your workflow.

```
┌─ claude ──────────────────┐ ┌─ gpt ─────────────────────┐
│                           │ │                           │
│  Let me analyze this      │ │  I'd evaluate this from   │
│  approach in detail:      │ │  three angles:            │
│                           │ │                           │
│  Strengths:               │ │  1. Technical feasibility │
│  1. Clean four-layer arch │ │  2. Maintenance cost      │
│  2. Simple Provider API   │ │  3. Room for expansion    │
│                           │ │                           │
│  2K/200K · 15 lines · done│ │  1K/128K · 12 lines · done│
└───────────────────────────┘ └───────────────────────────┘
──────────────────────────────────────────────────────────
 claude ●  gpt ●  — Tab:model d:compare m:mute q:quit
[all] > ▊
```

→ `multiarena terminal`

**Team deliberation: models challenge each other.** Draft → Revise → Polish → Review — 4 perspectives fight over every sentence. The result survives real scrutiny.

---

## Quick Start

```bash
npm install -g multiarena
multiarena                # Opens Web UI in your browser
multiarena terminal       # Terminal mode (for CLI lovers)
```

No config? No problem. The Web UI has a setup wizard. Or create `.multiarenarc`:

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

## Installation

```bash
npm install -g multiarena          # Recommended
git clone git@github.com:timgunnar/multiarena.git  # From source
```

## Supported Models

Anthropic (Claude) · OpenAI (GPT-4o) · Google (Gemini) · DeepSeek · MiniMax · Ollama (local)

## CLI

```bash
multiarena              # Web UI (no args needed)
multiarena terminal     # Terminal mode
multiarena -r <id>      # Resume session
multiarena -l           # List sessions
multiarena -h           # Help
```

## License

MIT

---

📖 **[User Guide](./USER_GUIDE.md)** — Full documentation: architecture, configuration, Web UI, session management, troubleshooting
