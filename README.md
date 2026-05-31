# multiarena

[English](./README.md) | [中文](./README_CN.md)

Terminal-native multi-model AI collaboration tool. Ask once, multiple LLMs answer simultaneously. Multi-model relay deliberation produces documents refined through multiple perspectives.

## Mode System

multiarena has two top-level modes, each with an overview and a model drill-down view:

```
Broadcast Mode                        Team Mode
  ├── Overview: multi-panel side-by-side    ├── Overview: deliberation entry / results
  └── Directed: single model full-width     └── Directed: private chat with one model
```

### Input Bar Prefix

The prefix tells you which mode and view you're in:

| Prefix | Location |
|--------|----------|
| `[all]` | Broadcast overview — message goes to all models |
| `[model_name]` | Broadcast directed — talking to that model only |
| `[team]` | Team overview — enter task to start deliberation |
| `[team:model_name]` | Team directed — chat with that model post-deliberation |

### Mode Switching

```
          Shift+Tab (overview only)          Shift+Tab (overview only)
Broadcast Overview ←─────────────────→ Team Overview
     ↑  ↓ Tab                            ↑  ↓ Tab
Broadcast Directed                   Team Directed
     ↑                                   ↑
     └── Esc ────────────────────────────┘── Esc
```

**Tab** — Cycle target within current mode. Goes overview → model1 → model2 → overview. Tab **never** switches between broadcast and team.

**Shift+Tab** — Toggle between broadcast and team. **Only works from overview.** If you're in a directed chat, Esc back to overview first.

**Esc** — Return to current mode's overview. Works from private chat, compare view, or mid-deliberation. Esc **never** switches modes.

**d** — Compare mode. With empty input bar, press `d` to compare current model's output with another side-by-side. Press `d` again to exit.

---

## Broadcast Mode (Default)

Messages sent to all non-muted models simultaneously, answers shown in side-by-side panels.

### Broadcast Overview

```
┌─ claude ──────────────────────┐ ┌─ gpt ─────────────────────────┐
│                               │ │                               │
│  You can list files with ls:  │ │  Use ls or dir to view the    │
│  $ ls -la                     │ │  directory:                   │
│  total 48                     │ │  $ ls                          │
│  drwxr-xr-x  12 user  staff   │ │  src/  test/  package.json     │
│                               │ │                               │
│  3 lines · 1K/200K · done     │ │  3 lines · 1K/128K · done     │
└───────────────────────────────┘ └───────────────────────────────┘
────────────────────────────────────────────────────────────────────
 claude ●  gpt ●   — Tab:model d:compare m:mute r:reset q:quit ↑↓:scroll
[all] > ▊
```

After submitting, all non-muted models receive the message and respond in parallel. Each panel shows line count, token usage, and status.

### Broadcast Directed (Tab)

Press `Tab` to drill into a single model. Messages go only to that model, output area becomes full-width detail.

```
┌─ claude ──────────────────────────────────────────────────────────┐
│                                                                    │
│  Let me analyze the pros and cons of this approach in detail:       │
│                                                                    │
│  **Strengths:**                                                     │
│  1. Clean four-layer architecture, each layer has a single job      │
│  2. Provider interface is simple, adding a new model is trivial     │
│                                                                    │
│  2K/200K · 15 lines · done                                         │
└────────────────────────────────────────────────────────────────────┘
────────────────────────────────────────────────────────────────────
 claude ●  gpt    — Tab:model d:compare m:mute r:reset q:quit ↑↓:scroll
[claude] > ▊
```

Press `Tab` again to switch to the next model (skipping muted), cycling back to overview. Press `Esc` to return to overview.

### Compare Mode (`d`)

With empty input bar, press `d` to compare current model with the next model side-by-side.

```
┌─ claude ──────────────────────┐ ┌─ gpt ─────────────────────────┐
│                               │ │                               │
│  I'd recommend the Strategy   │ │  The Factory pattern with DI  │
│  pattern for encapsulating    │ │  would better decouple the    │
│  each algorithm.              │ │  components.                  │
│                               │ │                               │
│  2K/200K · 12 lines · done    │ │  1K/128K · 14 lines · done   │
└───────────────────────────────┘ └───────────────────────────────┘
────────────────────────────────────────────────────────────────────
 claude ●  gpt ●   — Tab:model d:exit-compare m:mute r:reset q:quit
[claude] > ▊
```

Press `d` again or `Esc` to exit compare mode.

---

## Team Mode (Shift+Tab to Enter)

Multiple models collaborate in relay, drafting → revising → polishing → reviewing to produce a document refined through multiple perspectives.

### Core Mechanisms

**Mirror Relay:** Models relay in A→B→C→B→A order. Forward: draft → revise → polish → review. Reverse: middle models revise again, first model does final review.

**Private Think:** Before each round, models do private analysis — examining the document, identifying issues, planning changes. Think output is NOT shared (invisible to other models), preventing anchoring bias.

**Shared Context:** Team mode uses a unified `teamMessages` thread. The deliberation engine reads from shared history, each round's output is auto-pushed back. Users can enter new requirements to start another round.

**Version History:** Each deliberation round receives ALL previous drafts (with round numbers and author labels), not just the latest one. Models can freely revert to any earlier version — if a later revision drifts off-track, the model can pick up from an earlier, better baseline.

**Adversarial Intensity:** Introduce critical thinking into deliberation to prevent excessive harmony:

| Level | Effect |
|-------|--------|
| `off` (default) | Pure collaborative relay |
| `low` | Critique prompts injected in revision rounds |
| `medium` | Each round outputs critique points + revisions, next round responds |
| `high` | Assign critical perspectives (skeptic/pragmatist etc., 6 types), enable mirror adversarial rounds |

Config: `[deliberation] adversarial = "high"` or CLI `/team -a high`

### Workflow

**Start Deliberation:** Press `Shift+Tab` in broadcast overview to enter team overview, type a task and press Enter:

```
────────────────────────────────────────────────────────────────────
Team Mode

Enter a task to start multi-model relay deliberation.
Tab to chat with a specific model. Shift+Tab to return to broadcast.
────────────────────────────────────────────────────────────────────
 minimax  deepseek ●  — Tab:model d:compare m:mute r:reset q:quit
[team] > Write a brand story for a specialty coffee roaster called "Bean Vault", for their website About page▊
```

**In Progress:** Each round begins with private think (💭), then public commit. Press `Esc` to abort.

```
┌─ Team Deliberation ───────────────────────────────────────────────┐
│                                                                    │
│ Round 2/5: deepseek (revise)                                       │
│                                                                    │
│ ✓ draft     ● revise    ○ polish    ○ revise    ○ review           │
│ minimax     deepseek    minimax    deepseek    minimax              │
│                                                                    │
│ 💭 Thinking — deepseek — analyzing current state…                  │
│                                                                    │
│ ── Private Analysis ──                                             │
│ The draft tells a good origin story but glosses over the roasting  │
│ craft itself. Needs more sensory detail about the process.          │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Completed:** Shows the deliberation process and final document, with model name, role, change count, and representative modifications per round.

```
┌─ Team Deliberation ───────────────────────────────────────────────┐
│                                                                    │
│ Deliberation complete · 3 rounds · 5 changes                       │
│                                                                    │
│ ✓ draft    ✓ revise     ✓ review                                   │
│ minimax    deepseek     minimax                                    │
│                                                                    │
│ ── Process ──                                                      │
│ 1. minimax (draft)                                                  │
│ 2. deepseek (revise) — 5 changes                                    │
│      Our beans are sourced globally → From Ethiopian highlands to  │
│      Colombian cloud forests, we trace every lot back to the farm   │
│      Expert roasters → Roasters who listen for the second crack    │
│ 3. minimax (review) — no changes                                   │
│                                                                    │
│ ── Final Document ──                                               │
│ # Bean Vault — Where Every Bean Tells a Story                      │
│ It started with a 1932 Probat roaster rescued from a barn…         │
└────────────────────────────────────────────────────────────────────┘
```

**Post-Deliberation Chat:** Press `Tab` to chat with any model privately. All models share the same conversation history (including the full deliberation process):

```
Tab → [team:minimax] > Do you think deepseek's revisions captured the craft angle well?
```

**Continue Editing:** Enter new requirements in team overview to start a new round. The team sees the full previous draft and refines it:

```
[team] > Add sensory details about the roasting process — the crackle of beans, the smell of the first crack. This copy is for our packaging label, keep it under 80 words
```

### /merge — Merge Outputs

Type `/merge` in any mode, select a model to merge all non-muted models' latest outputs into a comprehensive document, annotated with consensus (`[consensus]`), unique contributions (`[source: model_name]`), and dissent (`[dissent]`).

---

## Installation

### npm (Recommended)

```bash
npm install -g multiarena
```

### From Source (GitHub)

```bash
git clone https://github.com/timgunnar/multiarena.git
cd multiarena
npm install
npm run build
npm link
```

## Quick Start

```bash
# Create config file
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

# Launch
multiarena
```

## Configuration

Config file `.multiarenarc` (TOML format), placed in current directory or `~/.multiarenarc`.

```toml
[models.<name>]
provider = "anthropic"       # anthropic | openai | google | deepseek | minimax | ollama
model = "claude-sonnet-4-6"  # API model name
api_key = "${ENV_VAR}"       # API key, supports environment variables
endpoint = "..."             # Custom endpoint (optional)
context_limit = 200000       # Context window size (optional)

[defaults]
active = ["claude", "gpt"]   # Models loaded on startup

[deliberation]
constraint_file = "rules.md" # Deliberation constraint file (optional)
adversarial = "high"         # Adversarial intensity: off | low | medium | high (optional, default off)

# Manually specify deliberation rounds (optional, auto mirror assignment by default)
[[deliberation.rounds]]
model = "claude"
role = "draft"

[[deliberation.rounds]]
model = "gpt"
role = "revise"

[[deliberation.rounds]]
model = "claude"
role = "review"
```

Sessions saved to `~/.multiarena/sessions/`. Resume with `multiarena --resume <id>`.

## Supported Providers

| Provider | Vendor | Notes |
|----------|--------|-------|
| `anthropic` | Anthropic | Claude series (Sonnet / Opus / Haiku) |
| `openai` | OpenAI | GPT-4o, GPT-4.1, etc. |
| `google` | Google | Gemini series |
| `deepseek` | DeepSeek | DeepSeek-V3, DeepSeek-R1, etc. |
| `minimax` | MiniMax | MiniMax-M2 series |
| `ollama` | Ollama | Any local model |

Specify the model name in the config file's `model` field using each vendor's API model name.

## Permission System

Tool calls prompt for user authorization before execution (hardcoded safety rules cannot be overridden):

```
!!! Allow "claude" to run $ git status? [y]es/[n]o/[a]lways allow/[d]eny always
```

| Key | Effect |
|-----|--------|
| `y` | Allow this call |
| `n` | Deny this call |
| `a` | Always allow (persisted to session file, shared across all models) |
| `d` | Always deny (persisted to session file, shared across all models) |
| `q` | Quit (deny all pending requests) |

**Permission Persistence:** Choosing `a` or `d` writes the permission to the session file's `permissions` field at `~/.multiarena/sessions/<id>.json`. Restored on resume, and can be manually edited.

```json
// Example permissions in ~/.multiarena/sessions/<id>.json
{
  "permissions": [
    { "toolName": "bash", "args": { "command": "git status" }, "decision": "allow_always" },
    { "toolName": "readFile", "args": { "filePath": ".git-credentials" }, "decision": "deny_always" }
  ]
}
```

## Keyboard Shortcuts

| Key | Action | Constraint |
|-----|--------|------------|
| `Tab` | Cycle target within current mode (overview → model1 → model2 → overview) | Never switches modes, skips muted models |
| `Shift+Tab` | Toggle broadcast ↔ team mode | **Overview only**, lands on target mode's overview |
| `Esc` | Return to mode overview / exit compare / abort deliberation | Never switches modes |
| `d` | Compare two models' answers (empty input bar) | At least 2 non-muted models |
| `m` | Mute/unmute current model | Directed mode only |
| `r` | Reset current model's context | Directed mode only |
| `↑ ↓` | Empty input: browse history; non-empty: scroll output | Also scrolls deliberation view in team overview |
| `/team` | Equivalent to Shift+Tab | |
| `/merge` | Merge all models' latest outputs | At least 2 models with responses |
| `q` | Quit (auto-save session) | |

## License

MIT
