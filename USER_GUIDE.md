# multiarena User Guide

[English](./USER_GUIDE.md) | [中文](./USER_GUIDE_CN.md)

## Table of Contents

1. [Installation & Uninstall](#1-installation--uninstall)
2. [Quick Start](#2-quick-start)
3. [Architecture](#3-architecture)
4. [Configuration](#4-configuration)
5. [CLI Commands](#5-cli-commands)
6. [CLI UI](#6-cli-ui)
7. [Web UI](#7-web-ui)
8. [Session Management](#8-session-management)
9. [Permission System](#9-permission-system)
10. [Keyboard Shortcuts](#10-keyboard-shortcuts)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Installation & Uninstall

### npm (Recommended)

```bash
npm install -g multiarena
```

### From Source

```bash
git clone git@github.com:timgunnar/multiarena.git
cd multiarena
npm install
npm run build
npm link
```

### Verify Installation

```bash
multiarena --version
# multiarena v0.2.0
```

### Uninstall

```bash
npm uninstall -g multiarena
```

**Uninstall does NOT remove** `~/.multiarena/sessions/` (session data). Delete manually if desired:

```bash
rm -rf ~/.multiarena
```

### Prerequisites

| Requirement | Version |
|------------|---------|
| Node.js | >= 18.0.0 |
| git | >= 2.30 (for worktree isolation) |
| ripgrep (rg) | Optional (for grep tool) |

---

## 2. Quick Start

### Step 1: Create Config

Create `.multiarenarc` in your project root or home directory:

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

### Step 2: Launch

```bash
multiarena
```

### Step 3: Chat

- Type a message and press `Enter` — both models respond in parallel
- Press `Tab` to drill into a specific model's full response
- Press `Shift+Tab` to enter team deliberation mode

---

## 3. Architecture

```
┌──────────────────────────────────────────────────┐
│                  ENTRY LAYER                      │
│  multiarena (CLI)  │  multiarena --web (Browser)  │
└──────────┬──────────────────┬────────────────────┘
           │                  │
           ▼                  ▼
┌──────────────────┐ ┌─────────────────────────────┐
│   CLI UI         │ │   Web Server (HTTP + SSE)    │
│   (Ink/React)    │ │   src/server/                │
│   src/ui/        │ └──────────────┬──────────────┘
└────────┬─────────┘                │
         │                          ▼
         │               ┌─────────────────────────────┐
         └──────────────→│       CORE LAYER            │
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
     │ Provider   │  │    Tools     │  │   Persistence    │
     │ (6 家 API) │  │ (6 built-in) │  │ (JSON sessions)  │
     └────────────┘  └──────────────┘  └──────────────────┘
```

| Layer | Directory | Purpose |
|-------|-----------|---------|
| CLI UI | `src/ui/` | Terminal interface (Ink/React) |
| Web Server | `src/server/` | HTTP + SSE, WebSocket message routing |
| Web Frontend | `src/web/` | Vue 3 browser UI |
| Core | `src/core/` | Session, streaming, deliberation engine |
| Provider | `src/provider/` | 6 LLM API adapters |
| Tools | `src/tools/` | File/shell tools, permissions |
| Persistence | `src/persistence/` | Session JSON save/load |
| Config | `src/config/` | TOML config loader |
| Isolation | `src/isolation/` | git worktree lifecycle |

Full architecture diagram: `docs/multiarena-architecture.md`

---

## 4. Configuration

### Config File

- **Location**: `.multiarenarc` in project root or `~/.multiarenarc`
- **Format**: TOML
- **Environment variables**: `${ENV_VAR}` syntax supported

### Full Example

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

### Supported Providers

| Provider | Vendor | Notes |
|----------|--------|-------|
| `anthropic` | Anthropic | Claude Sonnet / Opus / Haiku |
| `openai` | OpenAI | GPT-4o, GPT-4.1 |
| `google` | Google | Gemini series |
| `deepseek` | DeepSeek | DeepSeek-V3, DeepSeek-R1 |
| `minimax` | MiniMax | MiniMax-M2 series |
| `ollama` | Ollama | Any local model |

---

## 5. CLI Commands

### Basic Usage

```bash
multiarena                           # Start Web UI (recommended, no args needed)
multiarena terminal                  # Start terminal mode (developers)
multiarena web                       # Start web mode with default port
multiarena web 8080                  # Start web mode on custom port
multiarena --web [port]              # Same as above
multiarena --help, -h, ?             # Show help
multiarena --version, -v             # Show version
multiarena --list, -l                # List saved sessions
multiarena --resume, -r <id>         # Resume saved session
```

### In-App Commands

These are typed in the input bar, not as CLI arguments:

| Command | Effect |
|---------|--------|
| `/team` | Toggle team mode |
| `/team -a high` | Enter team mode with adversarial=high |
| `/merge` | Merge all model outputs into one document |

### Exit

Press `q` or `Ctrl+C` to quit. Session auto-saves on exit.

---

## 6. CLI UI

### Modes

multiarena has two top-level modes:

```
Broadcast Mode                    Team Mode
  ├── Overview: multi-panel       ├── Overview: deliberation
  └── Directed: single model      └── Directed: private chat
```

### Broadcast Mode (Default)

Messages go to ALL non-muted models simultaneously.

- **Overview**: Side-by-side panels showing each model's latest response
- **Directed** (Tab): Drill into one model for full-width detail
- **Compare** (d): Side-by-side comparison of two models

### Team Mode (Shift+Tab)

Multiple models collaborate in relay to produce a polished document.

- **Overview**: Enter a task to start deliberation, see results after completion
- **Directed** (Tab): Private chat with one model using team context

### Mode Switching

```
          Shift+Tab (overview only)
Broadcast ←─────────────────────────→ Team
   ↑ Tab                                ↑ Tab
Directed                             Directed
   ↑                                    ↑
   └─── Esc ────────────────────────────┘
```

- **Tab**: Cycle within current mode (overview → model1 → model2 → overview)
- **Shift+Tab**: Toggle between broadcast and team (overview only)
- **Esc**: Return to current mode's overview
- **d**: Compare mode (empty input bar)

### Input Bar Prefix

| Prefix | Location |
|--------|----------|
| `[all]` | Broadcast overview |
| `[claude]` | Broadcast directed to claude |
| `[team]` | Team overview |
| `[team:claude]` | Team directed to claude |

### Team Deliberation

1. Enter team overview (`Shift+Tab`)
2. Type task → `Enter`
3. Models take turns: draft → revise → polish → review
4. Each round shows private think (💭) then public commit
5. Result: polished document with change summary
6. Press `Tab` to chat with any model about the result

### Adversarial Intensity

Control how critically models evaluate each other:

| Level | Effect |
|-------|--------|
| `off` (default) | Pure collaboration |
| `low` | Critique prompts in revision rounds |
| `medium` | Each round outputs critique points + revision |
| `high` | Assign critical perspectives + mirror adversarial rounds |

Config: `[deliberation] adversarial = "high"` or CLI `/team -a high`

---

## 7. Web UI

### Starting Web Mode

```bash
multiarena              # Start Web UI (no args, recommended)
multiarena web          # Explicit web mode
multiarena web 8080     # Custom port
multiarena terminal     # Terminal mode (CLI)
```

Opens automatically in your browser at `http://127.0.0.1:3000`.

### Home Page

```
┌─────────────────────────────────────────────┐
│  ⚡ multiarena                [⚙] [🌙] [EN] │
│─────────────────────────────────────────────│
│           Good afternoon, Tim 👋             │
│      What would you like to do today?        │
│                                              │
│  ┌ ✍️ Write ─┐ ┌ 📊 Analyze ─┐              │
│  │ Brand story│ │ Compare     │              │
│  │ Ad copy    │ │ Report      │              │
│  └───────────┘ └────────────┘              │
│                                              │
│  ┌ 💡 Ideate ─┐ ┌ 🔍 Review ──┐            │
│  │ Slogan     │ │ Find gaps    │            │
│  │ Ideas      │ │ Polish       │            │
│  └───────────┘ └────────────┘              │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  Write a brand story for my coffee…   │   │
│  └──────────────────────────────────────┘   │
│                [Start AI Team →]             │
└─────────────────────────────────────────────┘
```

### Features

- **Task Cards**: One-click templates for common workflows (write, analyze, ideate, review)
- **Broadcast**: Multi-panel streaming, compare model answers side-by-side
- **Team Deliberation**: Round pipeline visualization with progress tracking
- **Permission Dialog**: Modal popup for tool authorization (y/n/a/d)
- **Session Sidebar**: New/switch/delete sessions
- **i18n**: Chinese/English language toggle in header
- **Settings**: Add/remove models and update API keys anytime
- **Setup Wizard**: Guided first-run configuration, no config file editing needed
- **Config Persistence**: Models saved to `.multiarenarc`, shared with CLI

### Security

- Server listens on `127.0.0.1` only (not exposed to network)
- API keys never leave the server process
- No authentication required (local-only)

### Development

To run the Vue frontend in dev mode:

```bash
cd web && npm install && npm run dev    # Vite dev server on :5173
# In another terminal:
multiarena web                           # Backend on :3000
```

Vite automatically proxies `/api` requests to the backend.

---

## 8. Session Management

### Auto-Save

Every message exchange auto-saves the session. Manual save on `q` or `Ctrl+C`.

### Session Files

```
~/.multiarena/sessions/
├── m2t8k1.json
├── m2t9p3.json
└── ...
```

### Session JSON Structure

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
  "inputHistory": ["hello", "write a story"],
  "lastTarget": "broadcast"
}
```

### Resume

```bash
multiarena -r m2t8k1
```

### Manual Editing

Users can edit session files to modify permissions or delete conversation history. Changes take effect on next `--resume`.

---

## 9. Permission System

### Interactive Prompt

When a model requests a tool call, a prompt appears:

```
!!! Allow "claude" to run $ git status? [y]es/[n]o/[a]lways allow/[d]eny always
```

| Key | Effect |
|-----|--------|
| `y` | Allow this call once |
| `n` | Deny this call |
| `a` | Always allow (saved to session) |
| `d` | Always deny (saved to session) |
| `q` | Quit (deny all pending) |

### Safety Rules (cannot be overridden)

- `bash` with `rm -rf /` or `sudo`
- Reading `.env` or `.git-credentials` files

### Cross-Model Sharing

Permissions are shared across ALL models. If you allow `bash git status` for claude, gpt can also run it without asking.

### Manual Edit

Edit the `permissions` array in session JSON to pre-authorize or block tools.

---

## 10. Keyboard Shortcuts

### CLI

| Key | Action | Constraint |
|-----|--------|------------|
| `Tab` | Cycle target within mode | Never switches modes |
| `Shift+Tab` | Toggle broadcast ↔ team | Overview only |
| `Esc` | Return to overview / exit compare / abort deliberation | Never switches modes |
| `d` | Compare two models | Empty input bar |
| `m` | Mute/unmute current model | Directed mode |
| `r` | Reset current model | Directed mode |
| `↑ ↓` | Browse history / scroll output | |
| `q` | Quit (auto-save) | |

### Web

| Key | Action |
|-----|--------|
| `Tab` | Cycle target within mode |
| `Shift+Tab` | Toggle broadcast ↔ team |
| `Esc` | Return to overview / close dialog |

---

## 11. Troubleshooting

### No models configured

Create `.multiarenarc` in your project root or `~/.multiarenarc`. See [Quick Start](#2-quick-start).

### Permission denied when reading files

The permission system blocks reading `.env` and `.git-credentials`. Add explicit allow in session JSON if needed.

### Deliberation requires 2+ models

At least 2 non-muted, configured models are required. Check `defaults.active` in config.

### Worktree errors

Orphaned worktrees from prior crashes are auto-cleaned on next startup. If persistent, delete `/tmp/multiarena-worktrees/`.

### Web mode blank page

Run `npm run build:web` to compile the Vue frontend. Web UI is available from v0.2.0.

### Session resume fails

Check `~/.multiarena/sessions/` for the session file. Use `--list` to see available sessions.
