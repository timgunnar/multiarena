# Multi-Model CLI AI Coding Assistant — Design Spec (WIP)

**Date:** 2026-05-22  
**Status:** In Progress (completed: project vision, tech stack, display model, architecture, file isolation)

---

## Project Vision

A terminal-native, multi-model AI coding assistant. Users chat with multiple LLMs simultaneously, compare their answers side-by-side, and when executing tasks, review structured proposals from each model and pick the best solution.

**Core differentiator from Claude Code:** Not bound to a single provider. Every turn runs through N models concurrently, turning model selection from a pre-choice into a post-comparison.

---

## Target Audience

Open-source developers. Distributed via npm. `npm install -g <name>` to get started.

---

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Node.js
- **Terminal UI:** Ink (React for terminal)
- **Distribution:** npm

---

## Display Model (Mixed-Mode)

### Chat Mode — Compact Streaming Panels

The terminal splits horizontally into N columns, one per model. All models stream tokens simultaneously, visible in real time.

- `Tab` / `1/2/3` — expand one model to full screen
- `d` — diff the focused model's output against another
- Color-coded per model

### Task Mode — Structured Proposal Comparison

When models propose file edits or shell commands, the UI switches to a proposal view:

- Side-by-side diffs per file, per model
- Accept/reject per proposal (not all-or-nothing)
- Conflict detection when multiple models touch the same region

---

## Architecture (4 Layers)

```
UI Layer (Ink/React)
    ↕
Core Layer (Session → Stream → Task)
    ↕
Provider Layer (Unified Interface → Per-Adapter)
    ↕
Tool Runtime (ReadFile, WriteFile, EditFile, Grep, Glob, Bash, Git...)
```

| Layer | Responsibility |
|-------|---------------|
| UI | Render only; no model logic |
| Core | Multi-model orchestration, conversation state, task proposals |
| Provider | Normalize different LLM APIs into a single interface |
| Tool | File/shell operations with permission control |

---

## File Isolation via Git Worktree

Each model gets its own isolated worktree. No shared file system — no conflicts, no locks, clean diffs.

```
User project: ~/project (main branch)

On user prompt:
  → git worktree add /tmp/agent-claude   -b agent/claude-{task}
  → git worktree add /tmp/agent-gpt4     -b agent/gpt4-{task}
  → git worktree add /tmp/agent-deepseek -b agent/deepseek-{task}

Each model works in isolation.
User picks a winner → merge that worktree back, discard others.
```

**Rationale:** Sharing a file system across concurrent agents creates conflict-resolution complexity disproportionate to the value. Worktree isolation makes each agent's output a clean git diff with zero cross-contamination.

---

## Open Questions (to resolve next session)

- Provider unified interface design (streaming, tool calling normalization)
- Shared vs per-model conversation history
- Tool execution model: shared results or per-model invocation?
- Configuration format (.multillmrc or similar)
- Session persistence
- Permission system granularity
- Product name
