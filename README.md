# multiarena

[English](./README.md) | [中文](./README_CN.md)

Terminal-native multi-model AI collaboration tool. Ask once, multiple LLMs answer simultaneously. Multi-model relay deliberation produces documents refined through multiple perspectives.

## Quick Start

```bash
npm install -g multiarena
multiarena                # Launch Web UI (recommended)
multiarena terminal       # Launch terminal mode (for developers)
```

## Mode System

| Mode | Trigger | Behavior |
|------|---------|----------|
| **Broadcast** | Default | Message sent to all models, answers side-by-side |
| **Team** | `Shift+Tab` | Multi-model relay: draft → revise → polish → review |

### Input Bar Prefix

| Prefix | Location |
|--------|----------|
| `[all]` | Broadcast — all models |
| `[model]` | Broadcast — directed to that model |
| `[team]` | Team — overview |
| `[team:model]` | Team — directed to that model |

### Mode Switching

```
          Shift+Tab (overview only)
Broadcast ←─────────────────────────→ Team
   ↑ Tab                                ↑ Tab
Directed                             Directed
   ↑                                    ↑
   └─── Esc ────────────────────────────┘
```

**Tab** — Cycle within mode. **Shift+Tab** — Toggle mode. **Esc** — Return to overview. **d** — Compare two models.

## Installation

### npm

```bash
npm install -g multiarena
```

### From Source

```bash
git clone git@github.com:timgunnar/multiarena.git
cd multiarena && npm install && npm run build && npm link
```

### Uninstall

```bash
npm uninstall -g multiarena
rm -rf ~/.multiarena   # Optional: remove session data
```

## Configuration

`.multiarenarc` (TOML) in project root or `~/.multiarenarc`:

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

Sessions saved to `~/.multiarena/sessions/`. Resume with `multiarena --resume <id>`.

Detailed config → [User Guide](./USER_GUIDE.md#4-configuration)

## Supported Providers

| Provider | Vendors |
|----------|---------|
| `anthropic` | Claude Sonnet / Opus / Haiku |
| `openai` | GPT-4o, GPT-4.1 |
| `google` | Gemini series |
| `deepseek` | DeepSeek-V3, DeepSeek-R1 |
| `minimax` | MiniMax-M2 series |
| `ollama` | Any local model |

## CLI Commands

```bash
multiarena              # Start Web UI
multiarena terminal     # Start terminal mode
multiarena web          # Web UI with default port
multiarena -r <id>      # Resume session
multiarena -l           # List sessions
multiarena -h           # Help
```

## Keyboard Shortcuts

| Key | Action | Note |
|-----|--------|------|
| `Tab` | Cycle target within mode | Never switches modes |
| `Shift+Tab` | Toggle broadcast ↔ team | Overview only |
| `Esc` | Overview / exit / abort | |
| `d` | Compare two models | Empty input |
| `m` | Mute/unmute | Directed mode |
| `r` | Reset context | Directed mode |
| `↑ ↓` | History / scroll | |
| `q` | Quit (auto-save) | |

## License

MIT

---

📖 **[User Guide](./USER_GUIDE.md)** — Installation, architecture, Web UI, session management, troubleshooting
