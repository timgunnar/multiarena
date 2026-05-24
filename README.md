# multiarena

Terminal-native multi-model AI coding assistant. Chat with multiple LLMs side by side, compare their answers, and let the best one execute.

**Why:** Instead of betting on one model before you type, run N models simultaneously and pick the best result after.

## Install

```bash
npm install -g multiarena
```

## Quick Start

```bash
# Create a config file
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

# Launch
multiarena
```

## Features

- **Broadcast mode** — message goes to all models; see responses side by side
- **Directed mode** — message goes to one model; full-width detail view
- **Comparison mode** — two models side by side; diff at a glance
- **Tab-driven** — `Tab` cycles through targets, `↑↓` scrolls output
- **Isolated worktrees** — each model gets its own `git worktree`, no file conflicts
- **6 built-in tools** — bash, read, write, edit, glob, grep
- **Permission control** — session memory, cross-model shared approvals

## Supported Providers

| Provider | Models |
|----------|--------|
| Anthropic | Claude Sonnet 4.6, Opus 4.7, Haiku 4.5 |
| OpenAI | GPT-4o, GPT-4.1 |
| Google | Gemini 2.5 Flash, Gemini 2.5 Pro |
| DeepSeek | DeepSeek-V4, DeepSeek-R1 |
| MiniMax | MiniMax-M1 |
| Ollama | Any local model |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Cycle target (broadcast → model A → model B → ...) |
| `d` | Compare current model with another |
| `m` | Mute/unmute a model |
| `r` | Reset model history |
| `q` | Quit |
| `↑ ↓` | Scroll output / history |
| `Esc` | Return to broadcast mode |

## Configuration

Configuration is read from `.multiarenarc` (TOML) in the current directory or `~/.multiarenarc`. Values support `${ENV_VAR}` interpolation.

```toml
[models.<name>]
provider = "anthropic"       # anthropic | openai | google | deepseek | minimax | ollama
model = "claude-sonnet-4-6"  # API model identifier
api_key = "${ENV_VAR}"       # API key (optional, can use env var)
endpoint = "..."             # Custom endpoint (optional)
context_limit = 200000       # Override context window (optional)

[defaults]
active = ["claude", "gpt"]   # Models to start
broadcast = true             # Start in broadcast mode
```

Sessions are persisted to `~/.multiarena/sessions/`. Resume with `multiarena --resume <id>`.

## License

MIT
