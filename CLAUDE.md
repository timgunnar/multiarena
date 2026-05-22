# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A terminal-native multi-model AI coding assistant. Users chat with multiple LLMs simultaneously, compare answers, and select the best solution for file edits and shell commands.

**Core differentiator:** Not bound to a single provider. Every turn runs through N models concurrently.

## Tech Stack

- TypeScript, Node.js
- Terminal UI: Ink (React for terminal)
- Distribution: npm

## Architecture (4 layers)

```
UI (Ink/React) → Core (Session / Stream / Task) → Provider (unified interface + adapters) → Tool Runtime
```

- **UI:** Render only. Three-zone fixed layout: top status bar (model list), scrollable output area, bottom input bar.
- **Core:** Multi-model orchestration, per-model conversation history, streaming dispatch, structured proposal management.
- **Provider:** Normalize different LLM APIs (Anthropic, OpenAI, Google, local) into a single interface. Streaming and tool calling are adapter responsibilities.
- **Tool:** File/shell operations with permission control.

## Key Design Decisions

- **Interaction:** Tab cycles the conversation target (model prefix in input bar). Output area switches to the selected model's full-width detail. No animations/flickers.
- **Message routing:** Default broadcasts to all models. Selecting a specific model via Tab sends only to that model.
- **Conversation history:** Each model maintains independent history. Broadcast messages append to all; directed messages append only to the target.
- **File isolation:** Each model works in its own `git worktree` — no shared filesystem, no conflicts, clean diffs.
- **Divergence detection:** Code blocks and tool calls only (AST/text diff + structured comparison). Natural language is not auto-analyzed.

## Design Spec

`docs/superpowers/specs/2026-05-22-multi-model-cli-design.md` — the full spec (Chinese). Currently in design phase; no code written yet.

## Open

- Provider unified interface (streaming + tool call normalization)
- Tool execution model (shared results vs per-model invocation)
- Config format and session persistence
- Permission granularity
- Product name
